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

/** Serialize a single field, quoting only when necessary. */
function encodeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
  const header = columns.slice();
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c];
      return v === undefined || v === null ? '' : String(v);
    }),
  );
  return toCsv([header, ...body]);
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
    row.push(field);
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
  if (started || field.length > 0 || row.length > 0) {
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
