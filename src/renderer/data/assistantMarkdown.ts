/**
 * 軽量 Markdown パーサ — 純ロジック・依存ゼロ。
 *
 * アシスタントの応答 (見出し / 表 / 箇条書き / コード / 太字・インラインコード) を
 * React で安全に描画するための AST に変換する。生 HTML 文字列の注入 (React の危険な
 * innerHTML シンク) を避けるため、HTML ではなくブロック/インラインのデータ構造を返す
 * (XSS 面を持たない)。
 *
 * フルスペックの Markdown ではなく、ビジネス成果物で多用する要素に絞る。
 */

export interface InlineToken {
  readonly text: string;
  readonly bold?: boolean;
  readonly code?: boolean;
}

export type Block =
  | { readonly type: 'heading'; readonly level: number; readonly spans: InlineToken[] }
  | { readonly type: 'paragraph'; readonly spans: InlineToken[] }
  | { readonly type: 'list'; readonly ordered: boolean; readonly items: InlineToken[][] }
  | { readonly type: 'table'; readonly headers: InlineToken[][]; readonly rows: InlineToken[][][] }
  | { readonly type: 'code'; readonly text: string };

/** インライン記法 (**bold** と `code`) を解析する。入れ子は扱わない。 */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // **bold** または `code` を順に切り出す。
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ text: m[1], bold: true });
    // `m[1]` が undefined ということは `code` 側が一致したということなので、
    // `m[2] !== undefined` を確かめ直す意味が無い (変異検査が等価だと示した)。
    else tokens.push({ text: m[2]!, code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens.length > 0 ? tokens : [{ text }];
}

/** `| a | b |` 形式の行をセル配列へ分解する。前後の空セルを落とす。 */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/** 区切り行 (`| --- | :--: |`) か判定する。 */
function isTableSeparator(line: string): boolean {
  // `-` を含むかの前置き判定は置かない —— `split('|')` は必ず 1 個以上のセルを
  // 返し、`-` の無い行はどのセルも下の正規表現に落ちるので `every` が false を
  // 返す。前置きは速さのためだけで、結果を変えない (変異検査が等価だと示した)。
  return splitTableRow(line).every((c) => /^:?-{1,}:?$/.test(c));
}

/** Markdown 文字列をブロック配列へ変換する。 */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length > 0) blocks.push({ type: 'paragraph', spans: parseInline(buf.join(' ')) });
  };

  let para: string[] = [];

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // コードフェンス ```
    if (trimmed.startsWith('```')) {
      flushParagraph(para);
      para = [];
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        code.push(lines[i]!);
        i++;
      }
      i++; // 終了フェンスを飛ばす
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    // 空行 → 段落区切り
    if (trimmed === '') {
      flushParagraph(para);
      para = [];
      i++;
      continue;
    }

    // 見出し # .. ######
    // Stryker disable next-line Regex: `$` を落としても差が出ない —— `.` は改行に
    // 一致せず、渡すのは 1 行を trim した文字列なので `(.*)` が既に行末まで届く。
    // 意図 (行末までが本文) を示すために残す。
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushParagraph(para);
      para = [];
      blocks.push({ type: 'heading', level: h[1]!.length, spans: parseInline(h[2]!) });
      i++;
      continue;
    }

    // 表: ヘッダ行 + 区切り行
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      flushParagraph(para);
      para = [];
      const headers = splitTableRow(trimmed).map(parseInline);
      i += 2;
      const rows: InlineToken[][][] = [];
      // 空行の判定は要らない: trim が空なら `includes('|')` が先に false になる。
      // Stryker disable next-line MethodExpression: `trim()` の有無は `includes('|')`
      // の答えを変えない (前後の空白は縦棒の有無に影響しない)。書き方を周りの
      // 行と揃えるために残す。
      while (i < lines.length && lines[i]!.trim().includes('|')) {
        rows.push(splitTableRow(lines[i]!).map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // 箇条書き (- / * / 1.)
    // ここは「箇条書きが始まるか」だけを見る。項目の本文は下のループが
    // 取り直すので、捕獲群は要らない (`exec` だと使われない捕獲が残り、
    // 変異検査でも中身の変異が観測できない死んだ指定になる)。
    // Stryker disable next-line Regex: 終端を留めない `test` なので `\s+` と `\s` は
    // 同じ答えを返す (1 つ目の空白で判定が決まる)。本文を取る下の 2 本と書き方を
    // 揃えるために `+` を残す。
    const isBullet = /^[-*]\s+/.test(trimmed);
    // Stryker disable next-line Regex: 上と同じ理由で等価。
    const ordered = /^\d+\.\s+/.test(trimmed);
    if (isBullet || ordered) {
      flushParagraph(para);
      para = [];
      const isOrdered = ordered;
      const items: InlineToken[][] = [];
      while (i < lines.length) {
        const t = lines[i]!.trim();
        // Stryker disable next-line Regex: `$` は上の見出しと同じ理由で等価。
        const mb = /^[-*]\s+(.*)$/.exec(t);
        // Stryker disable next-line Regex: `$` は上と同じ理由で等価。
        const mo = /^\d+\.\s+(.*)$/.exec(t);
        if (isOrdered && mo) items.push(parseInline(mo[1]!));
        else if (!isOrdered && mb) items.push(parseInline(mb[1]!));
        else break;
        i++;
      }
      blocks.push({ type: 'list', ordered: isOrdered, items });
      continue;
    }

    // 通常テキスト
    para.push(trimmed);
    i++;
  }
  flushParagraph(para);
  return blocks;
}
