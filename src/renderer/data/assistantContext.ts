/**
 * Assistant RAG 文脈ビルダー — 純ロジック・IO なし。
 *
 * 確証済みナレッジ (学術概念 / 税務労務法務コンプライアンス / 補助金 / 相談窓口 /
 * 経済史) とサービスカタログを横断検索し、ユーザーの問いに関連する根拠資料を
 * 抽出して AI プロバイダへ渡す system プロンプトを組み立てる。**単一の真実源**
 * から導出するため、ナレッジやサービスが増えれば自動で文脈に反映される。
 *
 * 検索は外部依存ゼロの軽量スコアリング。精度向上のための設計 (v2):
 *   1. IDF 重み — コーパス内で稀な語ほど強く効く (「経済」「理論」等の頻出語や
 *      定型バイグラムが 4,300+ 件へ一様にヒットする問題を抑える)。
 *   2. 膠着語ノイズ抑制 — ひらがなのみのバイグラム (「して」「につ」等) は
 *      重み 0.2 に降格し、内容語 (漢字・カタカナ・英数) の一致を主役にする。
 *      内容語が 1 つも当たらない文書は除外する。
 *   3. フレーズ (内容語連続) ボーナス — 「プロテウス効果」のような概念名の
 *      連続一致をタイトル/本文で強く加点し、固有名の指名検索を外さない。
 *   4. 近似タイトル重複の抑制 — 同義エントリ (歴史的経緯で重複収載された概念)
 *      が上位を占有しないよう、タイトル類似の高い文書は 1 件に代表させる。
 *   5. 出典ラベルの注入 — 回答が出典に言及できるよう、本文へ第一出典を付す。
 */

import { VERIFIED_CONCEPTS } from './academicKnowledge';
import { VERIFIED_COMPLIANCE } from './complianceKnowledge';
import { VERIFIED_SUBSIDIES } from './subsidyKnowledge';
import { VERIFIED_SUPPORT_RESOURCES } from './counselorKnowledge';
import { ECONOMIC_HISTORY } from './economicHistoryKnowledge';

/** 検索対象の正規化済みドキュメント 1 件。 */
export interface KnowledgeDoc {
  readonly id: string;
  /** 分類ラベル (出典の種別表示用)。 */
  readonly kind: '学術概念' | 'コンプライアンス' | '補助金・助成金' | '相談窓口' | '経済史';
  readonly title: string;
  readonly body: string;
}

/** チャットが案内できるサービス 1 件。 */
export interface AssistantService {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/** 1 ドキュメントあたりの本文上限。学術概念の statement は 600-900 字で
 *  管理されており、320 では根拠の核心が切れてしまうため 600 まで持つ
 *  (上位 6 件 × ~700 字 + 指示部 ≒ 5KB は system 上限 60KB に対し十分小さい)。 */
const BODY_CAP = 600;
/** keyFigures / 出典ラベルの上限 (本文とは別枠で軽く保つ)。 */
const META_CAP = 160;
const SOURCE_LABEL_CAP = 80;

function cap(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

/** すべての確証済みデータを共通スキーマへ写像する (モジュール読込時に 1 度)。 */
export function buildCorpus(): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];
  for (const c of VERIFIED_CONCEPTS) {
    const src = c.sources[0]?.label;
    docs.push({
      id: `academic:${c.id}`,
      kind: '学術概念',
      title: c.title,
      body:
        cap(c.statement, BODY_CAP) +
        `（${cap(c.keyFigures, META_CAP)}）` +
        (src ? `［出典: ${cap(src, SOURCE_LABEL_CAP)}］` : ''),
    });
  }
  for (const c of VERIFIED_COMPLIANCE) {
    const v = c.value;
    docs.push({
      id: `compliance:${v.id}`,
      kind: 'コンプライアンス',
      title: v.title,
      body: cap(`${v.statement}（所管: ${v.authority}／${v.asOf} 時点）`, BODY_CAP),
    });
  }
  for (const s of VERIFIED_SUBSIDIES) {
    docs.push({
      id: `subsidy:${s.id}`,
      kind: '補助金・助成金',
      title: s.name,
      body: cap(`${s.statement} 申請: ${s.application}（所管: ${s.authority}）`, BODY_CAP),
    });
  }
  for (const r of VERIFIED_SUPPORT_RESOURCES) {
    const v = r.value;
    docs.push({
      id: `support:${v.label}`,
      kind: '相談窓口',
      title: v.label,
      body: cap(v.detail, BODY_CAP),
    });
  }
  for (const y of ECONOMIC_HISTORY) {
    const src = y.sources[0]?.label;
    docs.push({
      id: `econ-history:${y.year}`,
      kind: '経済史',
      title: `${y.year}年（${y.era}）の世界と日本の経済`,
      body:
        cap(`世界: ${y.world} 日本: ${y.japan}`, BODY_CAP) +
        (src ? `［出典: ${cap(src, SOURCE_LABEL_CAP)}］` : ''),
    });
  }
  return docs;
}

let corpusCache: readonly KnowledgeDoc[] | null = null;

/**
 * 既定コーパス (初回呼び出し時に 1 度だけ構築してキャッシュ)。
 *
 * **必ず遅延にすること。** 以前は `export const KNOWLEDGE_CORPUS = buildCorpus()` と
 * モジュール読込時に構築していたが、`services.ts` が全ページを静的 import する構造の
 * ため AssistantPage 経由でこのモジュールが起動時に必ず評価され、
 * 学術コーパス 8MB の JSON.parse + 全 4,000 件超のマッピングをアプリ起動の
 * クリティカルパスで実行していた。実測 (chromium・スマホ幅) で
 * **DOMContentLoaded 637ms → 142ms / JS ヒープ 42.6MB → 8.1MB** の差になっていた
 * (= LITE 版と同じ初期コストまで縮む)。AI アシスタントを開かない利用者は
 * このコストを一切払わない。
 */
export function knowledgeCorpus(): readonly KnowledgeDoc[] {
  return (corpusCache ??= buildCorpus());
}

/** CJK 文字か (ひらがな・カタカナ・漢字)。 */
function isCjk(ch: string): boolean {
  return /[぀-ヿ㐀-鿿豈-﫿]/.test(ch);
}

/** ひらがなのみか (膠着語バイグラムのノイズ判定)。 */
function isHiraganaOnly(s: string): boolean {
  return /^[぀-ゟー]+$/.test(s);
}

/** 内容文字 (漢字・カタカナ・英数) を含む連続列か。 */
function hasContentChar(s: string): boolean {
  return /[a-z0-9ァ-ヿ㐀-鿿豈-﫿]/.test(s);
}

/** 重み付き検索語。w=1 が内容語、w<1 は膠着語 (補助的にのみ効かせる)。 */
export interface WeightedTerm {
  readonly t: string;
  readonly w: number;
}

/** 膠着語 (ひらがなのみバイグラム) の重み。 */
const GLUE_WEIGHT = 0.2;

/**
 * クエリから重み付き検索語を抽出する。
 *   - 英数字の語 (長さ 2 以上) は 1 語・重み 1
 *   - 連続する CJK 文字列からは 2 文字シングル (バイグラム) を生成し、
 *     漢字・カタカナを含めば重み 1、ひらがなのみは重み 0.2 に降格
 *   - 単独 1 文字は漢字のみ採用 (重み 0.5)
 * 返すのは小文字化・NFKC 正規化済みのユニーク語。
 */
export function extractWeightedTerms(query: string): WeightedTerm[] {
  const norm = query.normalize('NFKC').toLowerCase();
  const seen = new Map<string, number>();
  const add = (t: string, w: number) => {
    const prev = seen.get(t);
    if (prev === undefined || w > prev) seen.set(t, w);
  };
  // 英数語
  for (const m of norm.matchAll(/[a-z0-9][a-z0-9.+_-]{1,}/g)) add(m[0], 1);
  // CJK バイグラム
  let run = '';
  const flush = () => {
    if (run.length === 1) {
      if (/[㐀-鿿豈-﫿]/.test(run)) add(run, 0.5);
    } else {
      for (let i = 0; i < run.length - 1; i++) {
        const bg = run.slice(i, i + 2);
        add(bg, isHiraganaOnly(bg) ? GLUE_WEIGHT : 1);
      }
    }
    run = '';
  };
  for (const ch of norm) {
    if (isCjk(ch)) run += ch;
    else flush();
  }
  flush();
  return [...seen.entries()].map(([t, w]) => ({ t, w }));
}

/** 後方互換: 重みなしの語リスト (既存呼び出し・テスト向け)。 */
export function extractTerms(query: string): string[] {
  return extractWeightedTerms(query).map((x) => x.t);
}

/**
 * 概念名らしい「内容語の連続列」を抽出する (フレーズ一致ボーナス用)。
 * 例: 「プロテウス効果とは？」→ ["プロテウス効果"]。
 * ひらがな・記号で分割し、長さ 3 以上の列のみ返す。
 */
export function extractContentRuns(query: string): string[] {
  const norm = query.normalize('NFKC').toLowerCase();
  const runs = new Set<string>();
  for (const m of norm.matchAll(/[a-z0-9ァ-ヿ㐀-鿿豈-﫿ー]{3,}/g)) {
    if (hasContentChar(m[0])) runs.add(m[0]);
  }
  return [...runs];
}

/** 文字列中に needle が現れる回数 (重なりは数えない)。 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count++;
    from = idx + needle.length;
  }
  return count;
}

/** 出現回数の頭打ち (同語の繰り返しで水増しさせない)。 */
const COUNT_CAP = 3;

export interface ScoredDoc {
  readonly doc: KnowledgeDoc;
  readonly score: number;
}

/** タイトル同士のバイグラム Jaccard 類似度 (重複エントリの代表化に使う)。 */
export function titleSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const n = s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9぀-ヿ㐀-鿿豈-﫿ー]/g, '');
    const out = new Set<string>();
    for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
    return out;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** これ以上タイトルが似ていたら同一概念の重複収載とみなして代表 1 件に絞る。 */
const DEDUPE_SIMILARITY = 0.6;

/**
 * クエリに関連するドキュメントをスコア付きで上位 k 件返す。
 *
 * スコア = Σ_term  w(term) × idf(term) × (min(タイトル一致,3) × 3 + min(本文一致,3))
 *        + フレーズ (内容語連続列) のタイトル/本文一致ボーナス
 *
 *   - idf(term) = ln(1 + N / (1 + df))。df はその語を含む文書数。
 *   - 内容語 (w=1) が 1 つも一致しない文書は除外 (膠着語だけの偶然一致を排除)。
 *   - 同点はコーパス順を保つ安定ソート。タイトル類似 ≥ 0.6 の文書は代表 1 件。
 */
export function retrieveScored(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = knowledgeCorpus(),
): ScoredDoc[] {
  const terms = extractWeightedTerms(query);
  if (terms.length === 0) return [];
  const runs = extractContentRuns(query);
  const n = corpus.length;

  // 正規化テキストと語ごとの出現数を 1 パスで収集し、同時に df を数える。
  const titleCounts: number[][] = [];
  const bodyCounts: number[][] = [];
  const df = new Array<number>(terms.length).fill(0);
  const normTitles: string[] = [];
  const normBodies: string[] = [];
  for (let d = 0; d < n; d++) {
    const title = corpus[d]!.title.normalize('NFKC').toLowerCase();
    const body = corpus[d]!.body.normalize('NFKC').toLowerCase();
    normTitles.push(title);
    normBodies.push(body);
    const tc = new Array<number>(terms.length);
    const bc = new Array<number>(terms.length);
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]!.t;
      const inTitle = countOccurrences(title, t);
      const inBody = countOccurrences(body, t);
      tc[i] = inTitle;
      bc[i] = inBody;
      if (inTitle + inBody > 0) df[i]!++;
    }
    titleCounts.push(tc);
    bodyCounts.push(bc);
  }

  const idf = terms.map((_, i) => Math.log(1 + n / (1 + df[i]!)));

  const scored: ScoredDoc[] = [];
  for (let d = 0; d < n; d++) {
    let score = 0;
    let contentHit = false;
    for (let i = 0; i < terms.length; i++) {
      const tCount = Math.min(titleCounts[d]![i]!, COUNT_CAP);
      const bCount = Math.min(bodyCounts[d]![i]!, COUNT_CAP);
      if (tCount + bCount === 0) continue;
      if (terms[i]!.w >= 1) contentHit = true;
      score += terms[i]!.w * idf[i]! * (tCount * 3 + bCount);
    }
    if (!contentHit) continue; // 膠着語だけの一致は捨てる
    // フレーズ (概念名) 一致ボーナス — 長いほど強く効かせる。
    for (const run of runs) {
      const lenBoost = Math.min(run.length, 8) / 2;
      if (normTitles[d]!.includes(run)) score += 8 * lenBoost;
      else if (normBodies[d]!.includes(run)) score += 3 * lenBoost;
    }
    if (score > 0) scored.push({ doc: corpus[d]!, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // 近似タイトルの重複収載を代表 1 件に絞りつつ上位 k 件を選ぶ。
  const picked: ScoredDoc[] = [];
  for (const s of scored) {
    if (picked.length >= k) break;
    if (picked.some((p) => titleSimilarity(p.doc.title, s.doc.title) >= DEDUPE_SIMILARITY)) continue;
    picked.push(s);
  }
  return picked;
}

/** クエリに関連するドキュメントを上位 k 件返す (スコアなしの従来 API)。 */
export function retrieve(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = knowledgeCorpus(),
): KnowledgeDoc[] {
  return retrieveScored(query, k, corpus).map((s) => s.doc);
}

/** クエリに関連するサービスを上位 k 件返す (label/description を検索)。 */
export function retrieveServices(
  query: string,
  services: readonly AssistantService[],
  k = 4,
): AssistantService[] {
  const terms = extractWeightedTerms(query);
  if (terms.length === 0) return [];
  const scored = services
    .map((svc) => {
      const label = svc.label.normalize('NFKC').toLowerCase();
      const desc = svc.description.normalize('NFKC').toLowerCase();
      let score = 0;
      let contentHit = false;
      for (const { t, w } of terms) {
        const c = countOccurrences(label, t) * 3 + countOccurrences(desc, t);
        if (c > 0 && w >= 1) contentHit = true;
        score += w * c;
      }
      return { svc, score: contentHit ? score : 0 };
    })
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.svc);
}

/** AI が遵守すべき基本方針 (RAG 文脈の前段)。 */
export const ASSISTANT_BASE_INSTRUCTIONS = [
  'あなたは「Service Hub」の日本語ビジネスアシスタントです。経営者・個人事業主を支援します。',
  '回答方針:',
  '- 簡潔で実用的に。結論を先に述べ、必要に応じて根拠・手順を補足する。',
  '- 比較・一覧・スケジュール・収支など構造化できる情報は Markdown の表で示す。',
  '- 手順やチェックリストは箇条書きで示す。',
  '- 下記「参考ナレッジ」に該当があれば、それを最優先の根拠として答える。一般知識と食い違う場合は参考ナレッジ側を優先し、その旨を一言添える。',
  '- 参考ナレッジを使ったときは、回答の末尾に「参照: 〈項目名〉（種別）」の形式で使った項目を列挙する。使っていない項目は挙げない。',
  '- 数値・年号・条文・固有名は参考ナレッジの記載どおりに引用し、丸め・改変・推測補完をしない。出典 URL を創作しない。',
  '- 該当がなければ一般知識で答え、冒頭にその旨を明示する。',
  '- 税務・法務・労務・投資の最終判断は専門家・一次情報の確認を促す。断定を避け、時点（asOf）に注意する。',
  '- 不確実なことを推測で断定しない。分からないことは「分からない」と述べる。',
  '- 質問が曖昧で回答が大きく変わる場合は、推測で長い回答を書く前に確認の質問を 1 つだけ返す。',
].join('\n');

/** 参考ナレッジ節を組み立てる (なければ空文字)。 */
export function formatKnowledgeSection(docs: readonly KnowledgeDoc[]): string {
  if (docs.length === 0) return '';
  const lines = docs.map((d) => `- [${d.kind}] ${d.title}: ${d.body}`);
  return ['', '## 参考ナレッジ（確証済み・出典あり）', ...lines].join('\n');
}

/** サービスカタログ節を組み立てる。 */
export function formatServiceSection(services: readonly AssistantService[]): string {
  if (services.length === 0) return '';
  const lines = services.map((s) => `- ${s.label}（id: ${s.id}）: ${s.description}`);
  return [
    '',
    '## 関連サービス（このアプリ内で開ける機能）',
    'ユーザーの目的に合うものがあれば、回答末尾で「『◯◯』を開くと…ができます」と案内する。',
    ...lines,
  ].join('\n');
}

/**
 * 最終的な system プロンプトを組み立てる。
 * @param query    検索クエリ (直近のユーザー発話。追問に強くするため、呼び出し側で
 *                 直前のユーザー発話を連結して渡してよい)
 * @param services サービスカタログ全件 (関連抽出に使う)
 */
export function buildSystemPrompt(query: string, services: readonly AssistantService[]): string {
  const docs = retrieve(query);
  const relServices = retrieveServices(query, services);
  return [
    ASSISTANT_BASE_INSTRUCTIONS,
    formatKnowledgeSection(docs),
    formatServiceSection(relServices),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

/** オフライン回答がナレッジ由来と言えるスコアの下限。 */
export const OFFLINE_MIN_SCORE = 8;

/**
 * オフライン (API 未設定/失敗) 時のナレッジ直答。
 * 確証済みコーパスに十分強い一致があれば、その本文をそのまま提示する。
 * 決定論ルールエンジン (`chatbot.replyTo`) より前段で試み、該当がなければ null。
 */
export function buildOfflineKnowledgeAnswer(
  query: string,
  corpus: readonly KnowledgeDoc[] = knowledgeCorpus(),
): string | null {
  const top = retrieveScored(query, 2, corpus).filter((s) => s.score >= OFFLINE_MIN_SCORE);
  if (top.length === 0) return null;
  const parts: string[] = ['確証済みナレッジに該当が見つかりました。'];
  for (const { doc } of top) {
    parts.push('', `■ ${doc.title}（${doc.kind}）`, doc.body);
  }
  parts.push('', '※ オフラインの簡易検索による回答です（AI 生成ではありません）。');
  return parts.join('\n');
}
