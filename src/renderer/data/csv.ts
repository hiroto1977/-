/**
 * Minimal, dependency-free CSV (RFC 4180-ish) parse + serialize. Used to
 * import/export business data (sales, KPI actuals) to/from spreadsheets and
 * accounting tools. Pure functions only — fully unit-tested.
 *
 * Supported:
 *   - comma-separated fields, `\r\n` or `\n` row terminators
 *   - quoted fields with embedded commas / newlines / doubled quotes ("")
 *   - a header row (first row) → array of records keyed by header
 * Not supported (kept intentionally simple): custom delimiters, comments.
 */

/**
 * 表計算ソフトが数式として解釈する先頭文字。
 *
 * Excel / LibreOffice / Google スプレッドシートは、セルが `=` `+` `-` `@`
 * タブ・CR で始まると**数式として実行**する。ここを素通しすると、
 * 取り込んだ外部データ（Shopify・各 SaaS の名称など）や利用者の入力が、
 * 書き出した CSV を開いた人の環境で走る（CWE-1236。`=HYPERLINK(...)` での
 * 情報送信や、DDE 経由のコマンド実行に繋がる）。
 *
 * **引用符で囲むだけでは防げない。** `"=1+1"` も数式として解釈される。
 * 先頭に `'` を足して文字列であることを明示するのが確実な打ち消し方。
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * 数値そのものか。
 *
 * `-1000` を一律に打ち消すと、**会計データの負数が全部テキストになって
 * 集計できなくなる**。数式ではないと言い切れる形だけ通す。
 */
function looksNumeric(value: string): boolean {
  // この関数は先頭が FORMULA_TRIGGERS のときだけ呼ばれる。数値になりうるのは
  // `+` `-` 始まりだけなので、符号は必須にする（`?` にすると届かない分岐が残る）。
  return /^[+-](\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value);
}

/** その値がそのままだと数式として走るか。 */
export function needsFormulaGuard(value: string): boolean {
  // charAt は空文字のとき '' を返すので、undefined の場合分けが要らない
  // （分けると「空なら false」と「'' は trigger でないので false」が
  // 同じ結果になり、テストで殺せない分岐になる）。
  if (!FORMULA_TRIGGERS.includes(value.charAt(0))) return false;
  return !looksNumeric(value);
}

/**
 * 打ち消し済みの値か（先頭の `'` を剥がすと数式になるか）。
 *
 * `'` が何個続いていても、剥がした先が数式なら打ち消し対象。こうしないと
 * 元々 `'=x` だった値を書き出して読み直したときに `=x` に化ける。
 */
function wouldGuard(value: string): boolean {
  // 末尾を越えると value[i] は undefined になり `=== "'"` が false になるので、
  // 長さの比較は要らない（足すと等価な分岐が増えるだけ）。
  let i = 0;
  while (value[i] === "'") i++;
  return needsFormulaGuard(value.slice(i));
}

/** 書き出し時に数式を打ち消す。 */
function guardFormula(value: string): string {
  return wouldGuard(value) ? `'${value}` : value;
}

/**
 * 読み込み時に打ち消しを外す。`guardFormula` の逆で、往復しても値が変わらない。
 * 先頭が `'` でも、剥がした先が数式でなければ触らない（`'hello` は `'hello`）。
 */
export function unguardFormula(value: string): string {
  // wouldGuard は先頭の `'` を自分で読み飛ばすので、判定側で slice しない
  // （slice してもしなくても同じ結果になり、殺せない変異が残るため）。
  return value.startsWith("'") && wouldGuard(value) ? value.slice(1) : value;
}

/** Serialize a single field, quoting only when necessary. */
function encodeField(value: string): string {
  const guarded = guardFormula(value);
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Serialize rows (array of string arrays) to a CSV string with `\r\n`. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(encodeField).join(',')).join('\r\n');
}

/**
 * Serialize an array of records to CSV using an explicit column order.
 * Missing/undefined values become empty fields; everything is stringified.
 */
export function recordsToCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c];
      return v === undefined || v === null ? '' : String(v);
    }),
  );
  // columns は toCsv で読み取られるのみで変更されないため、防御コピー (.slice()) は不要。
  return toCsv([columns, ...body]);
}

/** Parse a CSV string into rows of string fields. Tolerates a trailing
 *  newline and both `\r\n` / `\n`. Returns `[]` for empty input. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let started = false; // whether the current row has any content yet

  const pushField = () => {
    // 書き出し側で付けた数式打ち消しを外す。付けっぱなしだと
    // export → import で値が変わってしまう。
    row.push(unguardFormula(field));
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    started = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // swallow; the following \n (if any) triggers the row push. A lone \r
      // also ends a row.
      if (text[i + 1] !== '\n') pushRow();
    } else {
      field += ch;
    }
  }
  // Flush the final field/row unless the input ended exactly on a row break.
  // field/row に内容があるのは必ず started=true のとき (どちらも文字処理中＝started
  // を立てた後にしか伸びない) なので、started だけで「現在行に未確定の内容がある」を
  // 正確に表す。
  if (started) {
    pushField();
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV with a header row into records keyed by header name. Rows with a
 * different column count than the header are still mapped positionally
 * (missing → '', extra → dropped). Returns `[]` if there's no data row.
 */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  // rows.length<2 では rows.slice(1) が空で map も空配列を返すため、このガードを
  // 外しても [] になる。早期 return は最適化目的で、外す変異は equivalent。
  // Stryker disable next-line ConditionalExpression
  if (rows.length < 2) return [];
  const header = rows[0]!;
  return rows.slice(1).map((row) => {
    const rec: Record<string, string> = {};
    header.forEach((key, idx) => {
      rec[key] = row[idx] ?? '';
    });
    return rec;
  });
}
