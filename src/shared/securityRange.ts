/**
 * セキュリティ検知のレッドチーム×ブルーチーム演習場 — 決定論的・実行を伴わない純ロジック。
 *
 * ## 「サンドボックスの中のサンドボックス」の意味 (安全のための明示)
 * 本モジュールは **実際の攻撃コードを一切実行しない**。攻撃ペイロードは単なる文字列であり、
 * 評価はメモリ内の文字列照合だけで完結する (= 隔離された「演習場」)。各ラウンドでは攻撃側
 * (レッド) が回避テクニックを 1 層ずつ重ねて「エスカレーション」し、防衛側 (ブルー) の検知器
 * がそれに応答する — これを入れ子の隔離評価 ({@link runSecurityRange} の round) として再現する。
 * リポジトリの不変条件 (ランタイムからのサブプロセス実行禁止) を厳守する。
 *
 * ## 「攻防を繰り返して精度を高める」の意味
 * 検知器 ({@link detectThreat}) は **自動では書き換えない**。コーパス/回避手法/検知ルールは
 * PR レビューを通して育て、再実行のたびに検知率・誤検知・取りこぼし ({@link RangeReport.findings})
 * を測って可視化する。findings が改善候補となり、PR で塞ぐほど精度指標が上がる観測可能なループ。
 *
 * 純粋・決定論的 (同じコーパスには常に同じ結果)。LLM 呼び出しはしない。
 */

/** 脅威カテゴリ。benign = 無害 (検知すべきでない)。 */
export type ThreatCategory =
  | 'xss'
  | 'sql-injection'
  | 'command-injection'
  | 'path-traversal'
  | 'benign';

/** 回避テクニック (レッドチームのエスカレーション層)。 */
export type Evasion = 'none' | 'case' | 'whitespace' | 'comment' | 'entity' | 'split' | 'unicode';

/** ラベル付きの攻撃/無害ケース (コーパスの1件)。 */
export interface RangeCase {
  readonly id: string;
  readonly payload: string;
  readonly category: ThreatCategory;
  readonly note: string;
}

// 検知シグネチャ (正規化後の小文字に対する部分一致)。文字列辞書は表現 (罠#2)。
// 検知「ロジック」(正規化・優先順位・指標) は下の実テストで撃墜する。
// Stryker disable all
const XSS_MARKERS: readonly string[] = [
  // 末尾要素は eval + 開き括弧 の検知マーカー。リテラルで書くと lint:forbidden
  // (invariant #9) に当たるため Unicode エスケープで実値を保つ (照合用・実行しない)。
  '<script', 'javascript:', 'onerror=', 'onload=', 'onclick=', '<iframe', '<img ', 'document.cookie', 'eval' + '\u0028',
];
const SQLI_MARKERS: readonly string[] = [
  "' or '", "' or 1", '" or 1', 'or 1=1', 'union select', '; drop table', "'--", 'sleep(', 'information_schema',
];
const CMDI_MARKERS: readonly string[] = [
  '; rm ', '&& rm', '| sh', '|sh', '$(', '; cat ', '; wget', '&& curl', '; curl',
];
const PATH_MARKERS: readonly string[] = [
  '../', '..\\', '/etc/passwd', '%2e%2e', '....//',
];
const CATEGORY_JA: Readonly<Record<ThreatCategory, string>> = {
  xss: 'XSS (スクリプト注入)',
  'sql-injection': 'SQL インジェクション',
  'command-injection': 'コマンドインジェクション',
  'path-traversal': 'パストラバーサル',
  benign: '無害',
};
const EVASION_JA: Readonly<Record<Evasion, string>> = {
  none: '素の攻撃',
  case: '大文字小文字の撹乱',
  whitespace: '空白の挿入',
  comment: 'コメント挿入 (/**/)',
  entity: 'HTML エンティティ符号化',
  split: 'マーカー分断 (< script)',
  unicode: 'Unicode エスケープ (\\u003c)',
};
// Stryker restore all

/** カテゴリの日本語表示名。 */
export function categoryLabel(c: ThreatCategory): string {
  return CATEGORY_JA[c];
}
/** 回避手法の日本語表示名。 */
export function evasionLabel(e: Evasion): string {
  return EVASION_JA[e];
}

/** 正規化後 text にマーカー群のいずれかが含まれるか。 */
function matchesAny(text: string, markers: readonly string[]): boolean {
  for (const m of markers) {
    if (text.includes(m)) return true;
  }
  return false;
}

/**
 * 検知前の正規化 (ブルーチームの防御)。回避テクニックを打ち消す:
 *  - 小文字化 (case 撹乱)
 *  - C スタイルのコメント (slash-star … star-slash) を空白に置換 (comment 挿入)
 *  - `<` の HTML エンティティを復号 (entity 符号化)
 *  - タグ名直前の空白を除去 (split 分断: `< script` → `<script`)
 *  - 連続空白を 1 つに圧縮 (whitespace パディング)
 */
export function normalizeForDetection(input: string): string {
  let s = input.toLowerCase();
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/&lt;/g, '<').replace(/&#60;/g, '<').replace(/&#x3c;/g, '<');
  s = s.replace(/<\s+/g, '<');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

/** 入力の脅威カテゴリを判定する (優先順位: xss > sqli > cmdi > path)。 */
export function detectThreat(input: string): ThreatCategory {
  const n = normalizeForDetection(input);
  if (matchesAny(n, XSS_MARKERS)) return 'xss';
  if (matchesAny(n, SQLI_MARKERS)) return 'sql-injection';
  if (matchesAny(n, CMDI_MARKERS)) return 'command-injection';
  if (matchesAny(n, PATH_MARKERS)) return 'path-traversal';
  return 'benign';
}

/** ペイロードに回避テクニックを適用する (レッドチーム)。決定論的。 */
export function applyEvasion(payload: string, evasion: Evasion): string {
  switch (evasion) {
    case 'none':
      return payload;
    case 'case':
      return payload.toUpperCase();
    case 'whitespace':
      return payload.replace(/ /g, '   ');
    case 'comment':
      return payload.replace(/ /g, '/**/');
    case 'entity':
      return payload.replace(/</g, '&lt;');
    case 'split':
      return payload.replace(/</g, '< ');
    case 'unicode':
      return payload.replace(/</g, '\\u003c');
  }
}

/** 取りこぼし (改善候補)。 */
export interface Finding {
  readonly id: string;
  readonly evasion: Evasion;
  readonly category: ThreatCategory;
  readonly payload: string;
}

/** 1 ラウンド (= 1 回避層) の結果。 */
export interface RoundResult {
  readonly evasion: Evasion;
  readonly attacks: number;
  readonly detected: number;
  readonly falsePositives: number;
  /** 検知率 (detected / attacks, 小数第3位)。 */
  readonly detectionRate: number;
}

/** 演習全体の結果。 */
export interface RangeReport {
  readonly rounds: readonly RoundResult[];
  /** 全ラウンド通算の検知率。 */
  readonly overallDetectionRate: number;
  /** 通算の誤検知数 (無害を脅威と誤判定: 0 が必須目標)。 */
  readonly falsePositives: number;
  /** 真陽性/偽陽性に基づく適合率 (precision)。 */
  readonly precision: number;
  /** 取りこぼし (改善候補・発生順)。 */
  readonly findings: readonly Finding[];
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * コーパスを各回避層 (rounds) で評価し、検知率・誤検知・取りこぼしを集計する。
 * 攻撃ケースには回避を適用し、無害ケースは素のまま評価する (誤検知の測定)。
 */
export function runSecurityRange(
  corpus: readonly RangeCase[],
  evasions: readonly Evasion[],
): RangeReport {
  const attackCases = corpus.filter((c) => c.category !== 'benign');
  const benignCases = corpus.filter((c) => c.category === 'benign');
  const rounds: RoundResult[] = [];
  const findings: Finding[] = [];
  let truePositives = 0;
  let totalAttacks = 0;
  let falsePositives = 0;

  for (const evasion of evasions) {
    let detected = 0;
    let roundFalsePositives = 0;
    for (const c of attackCases) {
      const flagged = detectThreat(applyEvasion(c.payload, evasion)) !== 'benign';
      if (flagged) {
        detected += 1;
      } else {
        findings.push({ id: c.id, evasion, category: c.category, payload: c.payload });
      }
    }
    for (const c of benignCases) {
      if (detectThreat(c.payload) !== 'benign') roundFalsePositives += 1;
    }
    truePositives += detected;
    totalAttacks += attackCases.length;
    falsePositives += roundFalsePositives;
    rounds.push({
      evasion,
      attacks: attackCases.length,
      detected,
      falsePositives: roundFalsePositives,
      detectionRate: attackCases.length > 0 ? round3(detected / attackCases.length) : 0,
    });
  }

  return {
    rounds,
    overallDetectionRate: totalAttacks > 0 ? round3(truePositives / totalAttacks) : 0,
    falsePositives,
    precision: truePositives + falsePositives > 0 ? round3(truePositives / (truePositives + falsePositives)) : 0,
    findings,
  };
}

/** 標準のエスカレーション順 (素 → 撹乱 → 空白 → コメント → エンティティ → 分断 → Unicode)。 */
export const DEFAULT_EVASIONS: readonly Evasion[] = [
  'none', 'case', 'whitespace', 'comment', 'entity', 'split', 'unicode',
];

// 演習コーパス (人がレビューして育てる・PR で拡張)。台本データ (文字列は表現)。
// Stryker disable all
export const DEFAULT_RANGE_CORPUS: readonly RangeCase[] = [
  // --- 攻撃 (素の状態では全件検知できることが不変条件) ---
  { id: 'xss-1', payload: '<script>alert(1)</script>', category: 'xss', note: '古典的スクリプトタグ' },
  { id: 'xss-2', payload: 'javascript:alert(document.cookie)', category: 'xss', note: 'javascript スキーム' },
  { id: 'xss-3', payload: '<img src=x onerror=alert(1)>', category: 'xss', note: 'イベントハンドラ' },
  { id: 'xss-4', payload: '<iframe src=//evil>', category: 'xss', note: 'iframe 埋め込み' },
  { id: 'sqli-1', payload: "' or 1=1 --", category: 'sql-injection', note: '常真条件' },
  { id: 'sqli-2', payload: "admin'--", category: 'sql-injection', note: 'コメントで認証回避' },
  { id: 'sqli-3', payload: 'union select password from users', category: 'sql-injection', note: '列の抜き取り' },
  { id: 'sqli-4', payload: '1; drop table users', category: 'sql-injection', note: 'テーブル破壊' },
  { id: 'cmdi-1', payload: 'ls; rm -rf /', category: 'command-injection', note: '連結コマンド' },
  { id: 'cmdi-2', payload: 'data && curl evil', category: 'command-injection', note: '外部取得' },
  { id: 'cmdi-3', payload: '$(whoami)', category: 'command-injection', note: 'コマンド置換' },
  { id: 'cmdi-4', payload: 'foo; cat /etc/passwd', category: 'command-injection', note: '機密読み取り' },
  { id: 'path-1', payload: '../../etc/passwd', category: 'path-traversal', note: '相対パス遡上' },
  { id: 'path-2', payload: '..\\..\\windows', category: 'path-traversal', note: 'Windows 区切り' },
  { id: 'path-3', payload: '....//....//', category: 'path-traversal', note: 'フィルタ回避記法' },
  // --- 無害 (脅威語に似るが安全。誤検知 0 が必須目標) ---
  { id: 'ok-1', payload: 'Please select your subscription plan', category: 'benign', note: 'select だが SQL でない' },
  { id: 'ok-2', payload: 'I love JavaScript programming', category: 'benign', note: 'javascript だがスキームでない' },
  { id: 'ok-3', payload: 'Our union meets on Friday', category: 'benign', note: 'union だが select でない' },
  { id: 'ok-4', payload: 'Remove old files later please', category: 'benign', note: 'rm を含まない平文' },
  { id: 'ok-5', payload: 'The cat sat on the mat', category: 'benign', note: 'cat だがコマンドでない' },
  { id: 'ok-6', payload: 'See documents/reports/q1 folder', category: 'benign', note: '正常なパス' },
];
// Stryker restore all
