/**
 * ナレッジ転置インデックス (検索エンジン) — 純ロジック・IO なし。
 *
 * 確証済みナレッジ (学術概念 / 税務労務法務コンプライアンス / 補助金 / 相談窓口 /
 * 経済史) を横断検索するための**転置インデックス**を構築する。従来の
 * `assistantContext.retrieve` はクエリ毎にコーパス全件 (約 2,000 ドキュメント) を
 * 線形走査していたが、本モジュールは「語 → 出現ドキュメント (postings)」の索引を
 * 一度だけ構築し、以後はクエリ語に該当する postings だけを走査する。
 *
 *   従来: O(コーパス件数 × クエリ語数 × 本文長)
 *   本索引: O(クエリ語数 × 該当 postings 数)
 *
 * スコアリングは従来と**完全に等価** (タイトル一致 × 3 + 本文一致) なので、
 * 索引版でも線形版と同じ並び順を返す (決定論的・安定ソート)。並列インデクサ
 * (`scripts/build-knowledge-index.cjs`) はこの索引と同じモデルを worker_threads で
 * 分散構築し、整合を検証する。
 *
 * 本モジュールはデータ非依存 (任意のコーパスに対して索引を作れる) で、確証済み
 * データの import は `assistantContext.ts` 側に閉じる (循環 import を避ける)。
 */

/** 検索対象の正規化済みドキュメント 1 件 (単一の真実源から写像)。 */
export interface KnowledgeDoc {
  readonly id: string;
  /** 分類ラベル (出典の種別表示用)。 */
  readonly kind: '学術概念' | 'コンプライアンス' | '補助金・助成金' | '相談窓口' | '経済史';
  readonly title: string;
  readonly body: string;
}

/** CJK 文字か (ひらがな・カタカナ・漢字)。 */
export function isCjk(ch: string): boolean {
  return /[぀-ヿ㐀-鿿豈-﫿]/.test(ch);
}

/**
 * クエリ/本文から検索語を抽出する。
 *   - 英数字の語 (長さ 2 以上) はそのまま 1 語
 *   - 連続する CJK 文字列からは 2 文字シングル (バイグラム) を生成
 * 返すのは小文字化済み (NFKC) のユニーク語。
 */
export function extractTerms(text: string): string[] {
  const norm = text.normalize('NFKC').toLowerCase();
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
export function countOccurrences(haystack: string, needle: string): number {
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

/** 転置インデックスの 1 ポスティング (どのドキュメントに何回出現したか)。 */
export interface Posting {
  /** コーパス内のドキュメント添字。 */
  readonly i: number;
  /** タイトル中の出現回数。 */
  readonly tfTitle: number;
  /** 本文中の出現回数。 */
  readonly tfBody: number;
}

/** 構築済みの転置インデックス。 */
export interface InvertedIndex {
  /** 索引対象のコーパス (postings の添字が指す)。 */
  readonly docs: readonly KnowledgeDoc[];
  /** 語 → ポスティング配列 (出現するドキュメントのみ)。 */
  readonly postings: ReadonlyMap<string, readonly Posting[]>;
}

/**
 * コーパスから転置インデックスを構築する (純粋・決定論的)。
 * 各ドキュメントのタイトル/本文を語に分解し、語ごとの出現回数を記録する。
 * 出現回数は {@link countOccurrences} (非重なり) で数え、検索時のスコアと一致させる。
 */
export function buildInvertedIndex(corpus: readonly KnowledgeDoc[]): InvertedIndex {
  const postings = new Map<string, Posting[]>();
  corpus.forEach((doc, i) => {
    const title = doc.title.normalize('NFKC').toLowerCase();
    const body = doc.body.normalize('NFKC').toLowerCase();
    const terms = new Set<string>([...extractTerms(doc.title), ...extractTerms(doc.body)]);
    for (const t of terms) {
      const tfTitle = countOccurrences(title, t);
      const tfBody = countOccurrences(body, t);
      if (tfTitle === 0 && tfBody === 0) continue;
      let arr = postings.get(t);
      if (arr === undefined) {
        arr = [];
        postings.set(t, arr);
      }
      arr.push({ i, tfTitle, tfBody });
    }
  });
  return { docs: corpus, postings };
}

/** スコア付きドキュメント。 */
export interface ScoredDoc {
  readonly doc: KnowledgeDoc;
  readonly score: number;
}

/** 内部用: 添字つきスコア (安定ソートのため)。 */
interface ScoredEntry {
  readonly i: number;
  readonly doc: KnowledgeDoc;
  readonly score: number;
}

/**
 * クエリに関連するドキュメントをスコア付きで上位 k 件返す (転置インデックス経由)。
 * スコア = Σ 語ごとの (タイトル一致 × 3 + 本文一致)。一致ゼロは除外。
 * 決定論的 (同点はコーパス添字昇順を保つ ⇒ 線形走査版と同じ並び)。
 */
export function retrieveScored(query: string, k: number, index: InvertedIndex): ScoredDoc[] {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const scoreByIndex = new Map<number, number>();
  for (const t of terms) {
    const arr = index.postings.get(t);
    if (arr === undefined) continue;
    for (const p of arr) {
      const add = p.tfTitle * 3 + p.tfBody;
      scoreByIndex.set(p.i, (scoreByIndex.get(p.i) ?? 0) + add);
    }
  }
  const scored: ScoredEntry[] = [];
  for (const [i, score] of scoreByIndex) {
    if (score > 0) scored.push({ i, doc: index.docs[i]!, score });
  }
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, k).map((s) => ({ doc: s.doc, score: s.score }));
}

/**
 * クエリに関連するドキュメントを上位 k 件返す (転置インデックス経由)。
 * {@link retrieveScored} のスコアを落とした版 (従来 retrieve と同じ戻り値型)。
 */
export function indexedRetrieve(query: string, k: number, index: InvertedIndex): KnowledgeDoc[] {
  return retrieveScored(query, k, index).map((s) => s.doc);
}
