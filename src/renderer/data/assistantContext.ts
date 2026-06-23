/**
 * Assistant RAG 文脈ビルダー — 純ロジック・IO なし。
 *
 * 確証済みナレッジ 5 コレクション (学術概念 / 税務労務法務コンプライアンス /
 * 補助金 / 相談窓口 / 経済史) とサービスカタログを横断検索し、ユーザーの問いに
 * 関連する根拠資料を抽出して Claude へ渡す system プロンプトを組み立てる。
 *
 * **並列ナレッジ化**: AI オーケストレーション組織の 6 役員ロール (COO/CSO/CFO/CHRO/
 * CIO/CQO) ごとに担当コレクションを並列検索し、重複除去のうえ統合する
 * (`orchestration/knowledge-map.json` と同一の写像)。
 *
 * 検索は外部依存ゼロの軽量スコアリング (語トークン + CJK バイグラム一致)。
 */

import { VERIFIED_CONCEPTS } from './academicKnowledge';
import { VERIFIED_COMPLIANCE } from './complianceKnowledge';
import { VERIFIED_SUBSIDIES } from './subsidyKnowledge';
import { VERIFIED_SUPPORT_RESOURCES } from './counselorKnowledge';
import { ECONOMIC_HISTORY } from './economicHistoryKnowledge';
import knowledgeMapData from '../../../orchestration/knowledge-map.json';

/** ナレッジコレクション識別子 (knowledge-map.json と一致)。 */
export type KnowledgeCollection =
  | 'academic'
  | 'compliance'
  | 'subsidy'
  | 'support'
  | 'econ-history';

/** 検索対象の正規化済みドキュメント 1 件。 */
export interface KnowledgeDoc {
  readonly id: string;
  /** 分類ラベル (出典の種別表示用)。 */
  readonly kind: '学術概念' | 'コンプライアンス' | '補助金・助成金' | '相談窓口' | '経済史';
  readonly collection: KnowledgeCollection;
  readonly category: string;
  readonly title: string;
  readonly body: string;
}

/** チャットが案内できるサービス 1 件。 */
export interface AssistantService {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/** 役員ロール 1 件分の並列検索結果。 */
export interface ExecutiveRetrieval {
  readonly execId: string;
  readonly execTitle: string;
  readonly docs: readonly KnowledgeDoc[];
}

/** 並列検索の集約結果。 */
export interface ParallelRetrievalResult {
  readonly byExecutive: readonly ExecutiveRetrieval[];
  readonly merged: readonly KnowledgeDoc[];
}

/** 並列検索に参加する役員ロール (COO 含む 6 名)。 */
export const EXECUTIVE_IDS = ['coo', 'cso', 'cfo', 'chro', 'cio', 'cqo'] as const;
export type ExecutiveId = (typeof EXECUTIVE_IDS)[number];

/** 役員ロールの表示名 (registry.json と整合)。 */
export const EXECUTIVE_TITLES: Record<ExecutiveId, string> = {
  coo: '最高執行責任者 (COO)',
  cso: '最高戦略責任者 (CSO)',
  cfo: '最高財務責任者 (CFO)',
  chro: '最高人事責任者 (CHRO)',
  cio: '最高投資責任者 (CIO)',
  cqo: '最高品質責任者 (CQO)',
};

const BODY_CAP = 320;
const PER_EXECUTIVE_K = 3;
const MERGED_DOC_CAP = 12;

type ExecutiveKnowledgeSpec = Record<string, string | string[] | boolean>;

function cap(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

function decade(year: number): string {
  return `${Math.floor(year / 10) * 10}年代`;
}

/** 役員ロールの知識指定にドキュメントが該当するか (knowledge-map.json 準拠)。 */
export function executiveWants(execId: string, doc: KnowledgeDoc): boolean {
  const spec = (knowledgeMapData.executiveKnowledge as Record<string, ExecutiveKnowledgeSpec>)[execId];
  if (!spec) return false;
  const sel = spec[doc.collection];
  if (sel === undefined) return false;
  if (sel === '*' || sel === true) return true;
  return Array.isArray(sel) && sel.includes(doc.category);
}

/** すべての確証済みデータを共通スキーマへ写像する (モジュール読込時に 1 度)。 */
export function buildCorpus(): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];
  for (const c of VERIFIED_CONCEPTS) {
    docs.push({
      id: `academic:${c.id}`,
      kind: '学術概念',
      collection: 'academic',
      category: c.discipline,
      title: c.title,
      body: cap(`${c.statement}（${c.keyFigures}）`, BODY_CAP),
    });
  }
  for (const c of VERIFIED_COMPLIANCE) {
    const v = c.value;
    docs.push({
      id: `compliance:${v.id}`,
      kind: 'コンプライアンス',
      collection: 'compliance',
      category: v.domain,
      title: v.title,
      body: cap(`${v.statement}（所管: ${v.authority}／${v.asOf} 時点）`, BODY_CAP),
    });
  }
  for (const s of VERIFIED_SUBSIDIES) {
    docs.push({
      id: `subsidy:${s.id}`,
      kind: '補助金・助成金',
      collection: 'subsidy',
      category: s.domain,
      title: s.name,
      body: cap(`${s.statement} 申請: ${s.application}（所管: ${s.authority}）`, BODY_CAP),
    });
  }
  for (const r of VERIFIED_SUPPORT_RESOURCES) {
    const v = r.value;
    docs.push({
      id: `support:${v.label}`,
      kind: '相談窓口',
      collection: 'support',
      category: 'resource',
      title: v.label,
      body: cap(v.detail, BODY_CAP),
    });
  }
  for (const y of ECONOMIC_HISTORY) {
    docs.push({
      id: `econ-history:eh-${y.year}`,
      kind: '経済史',
      collection: 'econ-history',
      category: decade(y.year),
      title: `${y.year}年（${y.era}）`,
      body: cap(`【世界】${y.world}\n【日本】${y.japan}`, BODY_CAP),
    });
  }
  return docs;
}

/** モジュール読込時に 1 度だけ構築する既定コーパス。 */
export const KNOWLEDGE_CORPUS: readonly KnowledgeDoc[] = buildCorpus();

/** CJK 文字か (ひらがな・カタカナ・漢字)。 */
function isCjk(ch: string): boolean {
  return /[぀-ヿ㐀-鿿豈-﫿]/.test(ch);
}

/**
 * クエリから検索語を抽出する。
 *   - 英数字の語 (長さ 2 以上) はそのまま 1 語
 *   - 連続する CJK 文字列からは 2 文字シングル (バイグラム) を生成
 */
export function extractTerms(query: string): string[] {
  const norm = query.normalize('NFKC').toLowerCase();
  const terms = new Set<string>();
  for (const m of norm.matchAll(/[a-z0-9][a-z0-9.+_-]{1,}/g)) terms.add(m[0]);
  let run = '';
  const flush = () => {
    if (run.length === 1) {
      terms.add(run);
    } else {
      for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
    }
    run = '';
  };
  for (const ch of norm) {
    if (isCjk(ch)) run += ch;
    else flush();
  }
  flush();
  return [...terms];
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

export interface ScoredDoc {
  readonly doc: KnowledgeDoc;
  readonly score: number;
}

/**
 * クエリに関連するドキュメントを上位 k 件返す。
 * スコア = Σ 語ごとの (タイトル一致 × 3 + 本文一致)。一致ゼロは除外。
 */
export function retrieve(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
): KnowledgeDoc[] {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const scored: ScoredDoc[] = [];
  for (const doc of corpus) {
    const title = doc.title.normalize('NFKC').toLowerCase();
    const body = doc.body.normalize('NFKC').toLowerCase();
    let score = 0;
    for (const t of terms) {
      score += countOccurrences(title, t) * 3 + countOccurrences(body, t);
    }
    if (score > 0) scored.push({ doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.doc);
}

/** 役員ロール担当分野に絞って検索する。 */
export function retrieveForExecutive(
  query: string,
  execId: string,
  k = PER_EXECUTIVE_K,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
): KnowledgeDoc[] {
  const filtered = corpus.filter((doc) => executiveWants(execId, doc));
  return retrieve(query, k, filtered);
}

/** 役員ごとの検索結果をラウンドロビンで重複除去し統合する。 */
export function mergeRetrievalResults(
  results: readonly ExecutiveRetrieval[],
  totalCap = MERGED_DOC_CAP,
): KnowledgeDoc[] {
  const seen = new Set<string>();
  const merged: KnowledgeDoc[] = [];
  const maxLen = results.reduce((m, r) => Math.max(m, r.docs.length), 0);
  for (let i = 0; i < maxLen && merged.length < totalCap; i++) {
    for (const r of results) {
      const doc = r.docs[i];
      if (doc && !seen.has(doc.id)) {
        seen.add(doc.id);
        merged.push(doc);
        if (merged.length >= totalCap) break;
      }
    }
  }
  return merged;
}

/** 6 役員ロールを並列 (Promise.all) で検索し統合する。 */
export async function retrieveParallel(
  query: string,
  opts: {
    perExecutive?: number;
    executives?: readonly string[];
    totalCap?: number;
    corpus?: readonly KnowledgeDoc[];
  } = {},
): Promise<ParallelRetrievalResult> {
  const perExecutive = opts.perExecutive ?? PER_EXECUTIVE_K;
  const executives = opts.executives ?? EXECUTIVE_IDS;
  const corpus = opts.corpus ?? KNOWLEDGE_CORPUS;
  const totalCap = opts.totalCap ?? MERGED_DOC_CAP;

  const byExecutive = await Promise.all(
    executives.map((execId) =>
      Promise.resolve().then(() => {
        const title = EXECUTIVE_TITLES[execId as ExecutiveId] ?? execId.toUpperCase();
        return {
          execId,
          execTitle: title,
          docs: retrieveForExecutive(query, execId, perExecutive, corpus),
        };
      }),
    ),
  );

  return {
    byExecutive,
    merged: mergeRetrievalResults(byExecutive, totalCap),
  };
}

/** 同期版の並列検索 (テスト・決定論的パス用)。 */
export function retrieveParallelSync(
  query: string,
  opts: {
    perExecutive?: number;
    executives?: readonly string[];
    totalCap?: number;
    corpus?: readonly KnowledgeDoc[];
  } = {},
): ParallelRetrievalResult {
  const perExecutive = opts.perExecutive ?? PER_EXECUTIVE_K;
  const executives = opts.executives ?? EXECUTIVE_IDS;
  const corpus = opts.corpus ?? KNOWLEDGE_CORPUS;
  const totalCap = opts.totalCap ?? MERGED_DOC_CAP;

  const byExecutive = executives.map((execId) => ({
    execId,
    execTitle: EXECUTIVE_TITLES[execId as ExecutiveId] ?? execId.toUpperCase(),
    docs: retrieveForExecutive(query, execId, perExecutive, corpus),
  }));

  return {
    byExecutive,
    merged: mergeRetrievalResults(byExecutive, totalCap),
  };
}

/** クエリに関連するサービスを上位 k 件返す (label/description を検索)。 */
export function retrieveServices(
  query: string,
  services: readonly AssistantService[],
  k = 4,
): AssistantService[] {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const scored = services
    .map((svc) => {
      const label = svc.label.normalize('NFKC').toLowerCase();
      const desc = svc.description.normalize('NFKC').toLowerCase();
      let score = 0;
      for (const t of terms) score += countOccurrences(label, t) * 3 + countOccurrences(desc, t);
      return { svc, score };
    })
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.svc);
}

/** Claude が遵守すべき基本方針 (RAG 文脈の前段)。 */
export const ASSISTANT_BASE_INSTRUCTIONS = [
  'あなたは「Service Hub」の日本語ビジネスアシスタントです。経営者・個人事業主を支援します。',
  '回答方針:',
  '- 簡潔で実用的に。結論を先に述べ、必要に応じて根拠・手順を補足する。',
  '- 比較・一覧・スケジュール・収支など構造化できる情報は Markdown の表で示す。',
  '- 手順やチェックリストは箇条書きで示す。',
  '- 下記「参考ナレッジ」に該当があれば、それを根拠に答える。該当がなければ一般知識で答え、その旨を明示する。',
  '- 税務・法務・労務・投資の最終判断は専門家・一次情報の確認を促す。断定を避け、時点（asOf）に注意する。',
  '- 不確実なことを推測で断定しない。分からないことは「分からない」と述べる。',
].join('\n');

/** 参考ナレッジ節を組み立てる (なければ空文字)。 */
export function formatKnowledgeSection(docs: readonly KnowledgeDoc[]): string {
  if (docs.length === 0) return '';
  const lines = docs.map((d) => `- [${d.kind}] ${d.title}: ${d.body}`);
  return ['', '## 参考ナレッジ（確証済み・出典あり）', ...lines].join('\n');
}

/** 役員ロール別の並列検索結果を節として組み立てる。 */
export function formatParallelKnowledgeSection(result: ParallelRetrievalResult): string {
  if (result.merged.length === 0) return '';
  const roleLines: string[] = [];
  for (const r of result.byExecutive) {
    if (r.docs.length === 0) continue;
    const items = r.docs.map((d) => `  - [${d.kind}] ${d.title}`).join('\n');
    roleLines.push(`### ${r.execTitle}\n${items}`);
  }
  const mergedLines = result.merged.map((d) => `- [${d.kind}] ${d.title}: ${d.body}`);
  return [
    '',
    '## 参考ナレッジ（6 役員ロール並列検索・確証済み・出典あり）',
    ...roleLines,
    '',
    '### 統合（重複除去）',
    ...mergedLines,
  ].join('\n');
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
 * 最終的な system プロンプトを組み立てる (同期・並列ナレッジ検索)。
 */
export function buildSystemPrompt(query: string, services: readonly AssistantService[]): string {
  const retrieval = retrieveParallelSync(query);
  const relServices = retrieveServices(query, services);
  return [
    ASSISTANT_BASE_INSTRUCTIONS,
    formatParallelKnowledgeSection(retrieval),
    formatServiceSection(relServices),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

/**
 * 非同期版 system プロンプト (UI から await 可能)。
 */
export async function buildSystemPromptAsync(
  query: string,
  services: readonly AssistantService[],
): Promise<string> {
  const retrieval = await retrieveParallel(query);
  const relServices = retrieveServices(query, services);
  return [
    ASSISTANT_BASE_INSTRUCTIONS,
    formatParallelKnowledgeSection(retrieval),
    formatServiceSection(relServices),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}
