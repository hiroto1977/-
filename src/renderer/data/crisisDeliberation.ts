/**
 * 危機検知の合議エンジン — AIオーケストレーション・チームによる多役合議 (純ロジック)。
 *
 * 「AI だけの複数人の会話」を **決定論的** に再現する: ラベル付きコーパスの各発話に対し、
 * オーケストレーション組織の役割 (検知役 / 安全監査役 / レビュー役 / 合議役) が順に
 * 「発言」し、現行の検知器 (counseling.ts) の判定をレビューして合議結果を出す。
 * 集計として 精度/再現率・安全見逃し・過検知・エッジケースを返す。
 *
 * ## 「学習し続ける」の意味 (安全のための明示)
 * 本エンジンは検知ルールを **自動で書き換えない**。安全に直結する検知器の変更は必ず
 * 人のレビュー (PR) を通す。ここでの「学習」は、再実行のたびにコーパスで精度を測り、
 * 改善すべきエッジケースを **可視化・提案し続ける** こと。コーパスやマーカーが PR で
 * 育つほど、合議の精度指標が改善する (観測可能なループ)。
 *
 * 純粋・決定論的 (同じコーパスには常に同じ合議結果)。LLM 呼び出しはしない。
 */

import { detectCrisis, detectHarmToOthers, detectDestructiveUrge } from './counseling';

/**
 * 検知カテゴリ (深刻度の高い順)。distress/none は本文キーワードからは判別できない
 * (sentiment 等のメタデータが要る) ため、安全クリティカルな検知に焦点を当て
 * `other` に集約する。本合議は危機/他害/破壊衝動の語彙検知の精度を対象とする。
 */
export type DetectCategory = 'crisis' | 'harm-other' | 'destructive' | 'other';

/** カテゴリの深刻度ランク (大きいほど深刻・保護優先)。 */
export const SEVERITY: Readonly<Record<DetectCategory, number>> = {
  crisis: 3,
  'harm-other': 2,
  destructive: 1,
  other: 0,
};

/** ラベル付き発話 (コーパスの1件)。 */
export interface LabeledUtterance {
  readonly text: string;
  readonly label: DetectCategory;
}

/** 現行の安全検知器で発話のカテゴリを予測する (検知器を直接適用・深刻度順)。 */
export function predictCategory(text: string): DetectCategory {
  if (detectCrisis(text)) return 'crisis';
  if (detectHarmToOthers(text)) return 'harm-other';
  if (detectDestructiveUrge(text)) return 'destructive';
  return 'other';
}

/** 合議の判定。 */
export type Verdict =
  | 'correct' // 予測 = ラベル
  | 'safety-miss' // ラベルが crisis/harm-other なのに過小評価 (最重大)
  | 'over-trigger' // 安全カテゴリでないのに crisis/harm-other と誤検知
  | 'minor-mismatch'; // その他の不一致 (深刻度の差が小さい)

/** ラベル∈{crisis,harm-other} を「保護が必要」とみなす。 */
function isProtective(cat: DetectCategory): boolean {
  return cat === 'crisis' || cat === 'harm-other';
}

/** ラベルと予測から合議判定を下す (純粋)。 */
export function judge(label: DetectCategory, predicted: DetectCategory): Verdict {
  if (predicted === label) return 'correct';
  // 保護が必要なラベルを、より低い深刻度で取りこぼした → 安全見逃し (最重大)。
  // ここに来る時点で predicted !== label。全カテゴリの深刻度は相異なるため
  // SEVERITY が等しくなるのは predicted===label のときだけ → `<` と `<=` は同値 (等価変異)。
  // Stryker disable next-line EqualityOperator
  if (isProtective(label) && SEVERITY[predicted] < SEVERITY[label]) return 'safety-miss';
  // 保護不要なのに保護カテゴリと判定 → 過検知。
  if (!isProtective(label) && isProtective(predicted)) return 'over-trigger';
  return 'minor-mismatch';
}

/** 合議での1役の発言。 */
export interface DeliberationLine {
  readonly role: string;
  readonly text: string;
}

/** 1発話に対する合議結果。 */
export interface DeliberationRound {
  readonly text: string;
  readonly label: DetectCategory;
  readonly predicted: DetectCategory;
  readonly verdict: Verdict;
  readonly lines: readonly DeliberationLine[];
}

// 表示用ラベル辞書 (文字列リテラルは表現)。罠#2 に従い Stryker から除外する。
// Stryker disable all
const CATEGORY_JA: Readonly<Record<DetectCategory, string>> = {
  crisis: '危機(自傷)',
  'harm-other': '他害',
  destructive: '破壊衝動',
  other: '通常(危機語なし)',
};

const VERDICT_JA: Readonly<Record<Verdict, string>> = {
  correct: '✅ 一致',
  'safety-miss': '🚨 安全見逃し',
  'over-trigger': '⚠ 過検知',
  'minor-mismatch': '△ 軽微な不一致',
};
// Stryker restore all

/** 1発話について各役が順に発言する合議を組み立てる (純粋)。 */
export function deliberateOne(utterance: LabeledUtterance): DeliberationRound {
  const predicted = predictCategory(utterance.text);
  const verdict = judge(utterance.label, predicted);
  // Stryker disable all — 発言の文面は表現。verdict/predicted の構造はテストで固定。
  const lines: DeliberationLine[] = [
    { role: '検知役', text: `判定は「${CATEGORY_JA[predicted]}」です。` },
    {
      role: '安全監査役 (CQO)',
      text:
        verdict === 'safety-miss'
          ? `本来は「${CATEGORY_JA[utterance.label]}」。保護を要する発話を取りこぼしています。最優先で語彙を補強すべきです。`
          : isProtective(utterance.label)
            ? '保護が必要な発話を正しく捕捉できています。'
            : '安全上の取りこぼしはありません。',
    },
    {
      role: 'レビュー役',
      text:
        verdict === 'over-trigger'
          ? `正解は「${CATEGORY_JA[utterance.label]}」。過検知です。窓口の出しすぎは信頼を損ねます。`
          : verdict === 'minor-mismatch'
            ? `正解は「${CATEGORY_JA[utterance.label]}」。深刻度は近いが表現の整理余地あり。`
            : '誤検知はありません。',
    },
    {
      role: '合議役 (COO)',
      text:
        verdict === 'correct'
          ? '合意: 現行判定で問題なし。'
          : `合意: 「${utterance.text}」を改善候補として記録 (${VERDICT_JA[verdict]})。`,
    },
  ];
  // Stryker restore all
  return { text: utterance.text, label: utterance.label, predicted, verdict, lines };
}

/** 合議の集計指標。 */
export interface DeliberationMetrics {
  readonly total: number;
  readonly correct: number;
  /** 正答率 (correct/total, 小数第3位)。 */
  readonly accuracy: number;
  /** 安全見逃し件数 (最重要・0 が必須目標)。 */
  readonly safetyMisses: number;
  /** 過検知件数。 */
  readonly overTriggers: number;
  /** 軽微な不一致件数。 */
  readonly minorMismatches: number;
}

/** 合議の全体結果。 */
export interface DeliberationReport {
  readonly rounds: readonly DeliberationRound[];
  readonly metrics: DeliberationMetrics;
  /** correct でないエッジケース (改善候補・入力順)。 */
  readonly edgeCases: readonly DeliberationRound[];
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** コーパス全体を合議し、指標とエッジケースを集計する (純粋・決定論的)。 */
export function deliberate(corpus: readonly LabeledUtterance[]): DeliberationReport {
  const rounds = corpus.map((u) => deliberateOne(u));
  let correct = 0;
  let safetyMisses = 0;
  let overTriggers = 0;
  let minorMismatches = 0;
  for (const r of rounds) {
    if (r.verdict === 'correct') correct += 1;
    else if (r.verdict === 'safety-miss') safetyMisses += 1;
    else if (r.verdict === 'over-trigger') overTriggers += 1;
    else minorMismatches += 1;
  }
  const total = rounds.length;
  return {
    rounds,
    metrics: {
      total,
      correct,
      accuracy: total > 0 ? round3(correct / total) : 0,
      safetyMisses,
      overTriggers,
      minorMismatches,
    },
    edgeCases: rounds.filter((r) => r.verdict !== 'correct'),
  };
}

// --- 学習用コーパス (人がレビューして育てる・PR で拡張) ----------------------
//
// 各カテゴリの代表例 + 紛らわしい境界例 (もう限界=苦痛であって危機ではない 等) を含む。
// Stryker disable all
export const CRISIS_CORPUS: readonly LabeledUtterance[] = [
  { text: 'もう消えたい', label: 'crisis' },
  { text: '死んでしまいたい夜がある', label: 'crisis' },
  { text: '自分を傷つけたくなる', label: 'crisis' },
  { text: '過量服薬を考えてしまう', label: 'crisis' },
  { text: 'あいつを殺したいくらい憎い', label: 'harm-other' },
  { text: '誰かを傷つけてしまいそうで怖い', label: 'harm-other' },
  { text: '全部壊したい', label: 'destructive' },
  { text: '物に当たりたくなる', label: 'destructive' },
  { text: '暴れたい気分だ', label: 'destructive' },
  { text: '仕事がつらくて涙が出る', label: 'other' },
  { text: '将来が不安で眠れない', label: 'other' },
  { text: '同僚に腹が立って仕方ない', label: 'other' },
  { text: 'もう限界、このバグ難しい', label: 'other' },
  { text: '残業を終わりにしたい', label: 'other' },
  { text: '今日は天気がいいですね', label: 'other' },
  { text: '会議の資料を作りました', label: 'other' },
  { text: '散歩したら気分が良くなった', label: 'other' },
];
// Stryker restore all
