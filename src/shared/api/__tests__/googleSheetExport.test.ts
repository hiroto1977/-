/**
 * **`drive/export-sheet` の入口・要求・応答** (2026-11-22)。
 *
 * 両ビルドが通る 1 つの関数 (`checkSheetExport` → `sheetExportInit` → `parseCreatedSheet`) を直接見る。
 * 要点は 3 つ:
 *
 * 1. **セルは `stringValue` / `numberValue` しか持たない** —— `=` で始まる文字列も式にならない (数式インジェクション)。
 * 2. **表の天井は出力インターセプターの天井の下に収まる** —— 収まらないと、こちらの理由つきの断りより先に
 *    「中身を検められません」で断られ、利用者は何を直せばよいか分からない。
 * 3. **応答の URL は docs.google.com の https だけ** —— 解析・正規化してから比べる。
 */
import { describe, expect, it } from 'vitest';
import {
  GOOGLE_SHEETS_API,
  SHEETS_CREATE_PATH,
  checkSheetExport,
  createSheetRequest,
  parseCreatedSheet,
  sheetCellValue,
  sheetExportInit,
} from '../google';
import {
  MAX_SHEET_CELL_CHARS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_HEADER_CHARS,
  MAX_SHEET_ROWS,
  MAX_SHEET_STRING_CELLS,
  checkSheetTable,
} from '../../writeFieldLimits';
import { MAX_SCANNED_STRINGS, outboundContentRefusal } from '../../outboundContentGate';

function thrownMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return '(投げなかった)';
}

const COLUMNS = ['日付', '販売先', '金額', '注文の数', 'メモ'];
const ROW = ['2026-11-01', 'Amazon', 12000, 3, null];

describe('入口 checkSheetExport / checkSheetTable', () => {
  it('★ 読める表はそのまま通し、表題の前後の空白を落とす', () => {
    expect(checkSheetExport({ title: '  売上  ', columns: COLUMNS, rows: [ROW] })).toStrictEqual({
      title: '売上',
      columns: COLUMNS,
      rows: [ROW],
    });
  });

  it('★ 表題が無い・空白だけ・数は台帳の文で断る', () => {
    expect(thrownMessage(() => checkSheetExport({ columns: COLUMNS, rows: [] }))).toBe('title は必須です');
    expect(thrownMessage(() => checkSheetExport({ title: '   ', columns: COLUMNS, rows: [] }))).toBe('title は必須です');
    expect(thrownMessage(() => checkSheetExport({ title: 42, columns: COLUMNS, rows: [] }))).toBe('title は文字列で指定してください');
  });

  it('★ 表の形が違えば、どこが違うかを言って断る', () => {
    expect(checkSheetTable([], [])).toBe('columns は 1 つ以上の見出しの配列で指定してください');
    expect(checkSheetTable('日付', [])).toBe('columns は 1 つ以上の見出しの配列で指定してください');
    expect(checkSheetTable(Array(MAX_SHEET_COLUMNS + 1).fill('x'), [])).toBe(`columns は ${MAX_SHEET_COLUMNS} 列以内で指定してください`);
    expect(checkSheetTable(['日付', 42], [])).toBe('columns[1] は文字列で指定してください');
    expect(checkSheetTable(COLUMNS, 'x')).toBe('rows は行の配列で指定してください');
    expect(checkSheetTable(COLUMNS, ['x'])).toBe('rows[0] はセルの配列で指定してください');
    expect(checkSheetTable(COLUMNS, [['2026-11-01']])).toBe('rows[0] のセルの数が見出しの数 (5) と違います');
    expect(checkSheetTable(COLUMNS, [[...ROW.slice(0, 4), { a: 1 }]])).toBe('rows[0][4] は文字列・有限の数・null のどれかで指定してください');
    expect(checkSheetTable(COLUMNS, [[...ROW.slice(0, 2), Number.NaN, 3, null]])).toBe('rows[0][2] は文字列・有限の数・null のどれかで指定してください');
    expect(checkSheetTable(COLUMNS, [[...ROW.slice(0, 4), 'x'.repeat(MAX_SHEET_CELL_CHARS + 1)]])).toBe(
      `rows[0][4] は ${MAX_SHEET_CELL_CHARS} 文字以内で指定してください`,
    );
    expect(checkSheetTable(COLUMNS, [[...ROW.slice(0, 4), 'a\u0000b']])).toBe('rows[0][4] に制御文字を含めることはできません');
  });

  it('★ 見出しの天井ちょうどは通し、1 字多ければ・改行を含めば断る', () => {
    expect(checkSheetTable(['h'.repeat(MAX_SHEET_HEADER_CHARS)], [])).toBeNull();
    expect(checkSheetTable(['h'.repeat(MAX_SHEET_HEADER_CHARS + 1)], [])).toBe(`columns[0] は ${MAX_SHEET_HEADER_CHARS} 文字以内で指定してください`);
    expect(checkSheetTable(['a\nb'], [])).toBe('columns[0] に制御文字を含めることはできません');
  });

  it('★ セルの天井ちょうどは通し、改行は通す (メモは複数行でありうる)', () => {
    expect(checkSheetTable(COLUMNS, [[...ROW.slice(0, 4), 'x'.repeat(MAX_SHEET_CELL_CHARS)]])).toBeNull();
    expect(checkSheetTable(COLUMNS, [[...ROW.slice(0, 4), '1行目\n2行目']])).toBeNull();
  });

  it('★ 行の天井ちょうどは通し、1 行多ければ件数を言って断る (切らない)', () => {
    const rows = Array.from({ length: MAX_SHEET_ROWS }, () => [1]);
    expect(checkSheetTable(['数'], rows)).toBeNull();
    expect(checkSheetTable(['数'], [...rows, [1]])).toBe(`rows は ${MAX_SHEET_ROWS} 行以内で指定してください (いま ${MAX_SHEET_ROWS + 1} 行)`);
  });

  it('★ 文字列のセルの数の天井 (ちょうどは通す・1 つ多ければ断る)', () => {
    const cols = ['a', 'b', 'c', 'd'];
    const per = cols.length;
    const full = Math.floor(MAX_SHEET_STRING_CELLS / per);
    const rows = Array.from({ length: full }, () => cols.map(() => 's'));
    // 端数の分を 1 行足す (ちょうど天井になるように)
    const rest = MAX_SHEET_STRING_CELLS - full * per;
    const exact = rest === 0 ? rows : [...rows, cols.map((_, i) => (i < rest ? 's' : null))];
    expect(checkSheetTable(cols, exact)).toBeNull();
    const over = [...exact, ['s', null, null, null]];
    expect(checkSheetTable(cols, over)).toBe(`文字列のセルは ${MAX_SHEET_STRING_CELLS} 個以内で指定してください (いま ${MAX_SHEET_STRING_CELLS + 1} 個)`);
  });

  it('★ 表の天井は出力インターセプターの天井の下に収まる (表題 1 + 見出し + 文字列のセル)', () => {
    expect(1 + MAX_SHEET_COLUMNS + MAX_SHEET_STRING_CELLS).toBeLessThan(MAX_SCANNED_STRINGS);
    // 振る舞い: 天井いっぱいの表は、インターセプターが「読めない」と断らない。
    const cols = ['a', 'b', 'c'];
    const rows = Array.from({ length: MAX_SHEET_STRING_CELLS / cols.length }, () => ['s', 's', 's']);
    const payload = { title: 't', columns: cols, rows };
    expect(checkSheetTable(cols, rows)).toBeNull();
    expect(outboundContentRefusal('drive', 'export-sheet', payload)).toBeNull();
  });

  it('★ 出力インターセプターは export-sheet の本文を検める (外へ出る段階)', () => {
    const payload = { title: 't', columns: ['メモ'], rows: [['sk-ant-api03-' + 'A'.repeat(40)]] };
    expect(outboundContentRefusal('drive', 'export-sheet', payload)).not.toBeNull();
  });
});

describe('要求 sheetExportInit / createSheetRequest', () => {
  it('★ 文字列は stringValue・数は numberValue・空は値なし (式は 1 つも組まない)', () => {
    expect(sheetCellValue('=SUM(A1:A9)')).toStrictEqual({ userEnteredValue: { stringValue: '=SUM(A1:A9)' } });
    expect(sheetCellValue('+cmd|/C calc')).toStrictEqual({ userEnteredValue: { stringValue: '+cmd|/C calc' } });
    expect(sheetCellValue(12000)).toStrictEqual({ userEnteredValue: { numberValue: 12000 } });
    expect(sheetCellValue(null)).toStrictEqual({});
  });

  it('★ 1 行目が見出し、続けて行。本文に formulaValue は現れない', () => {
    const sheet = checkSheetExport({ title: '売上', columns: COLUMNS, rows: [ROW, ['2026-11-02', 'BASE', 1, 1, '=1+1']] });
    const init = sheetExportInit(sheet, 'tok');
    expect(init.method).toBe('POST');
    const text = String(init.body);
    expect(text).not.toContain('formulaValue');
    const body = JSON.parse(text) as {
      properties: { title: string };
      sheets: { data: { startRow: number; startColumn: number; rowData: { values: unknown[] }[] }[] }[];
    };
    expect(body.properties).toStrictEqual({ title: '売上' });
    const data = body.sheets[0]!.data[0]!;
    expect(data.startRow).toBe(0);
    expect(data.startColumn).toBe(0);
    expect(data.rowData).toHaveLength(3);
    expect(data.rowData[0]!.values).toHaveLength(COLUMNS.length);
    expect(data.rowData[2]!.values[4]).toStrictEqual({ userEnteredValue: { stringValue: '=1+1' } });
  });

  it('★ 送り先は sheets.googleapis.com の 1 つ', async () => {
    const calls: string[] = [];
    await createSheetRequest(checkSheetExport({ title: 't', columns: ['a'], rows: [] }), 'tok', async (url) => {
      calls.push(url);
      return new Response('{}');
    });
    expect(calls).toStrictEqual([`${GOOGLE_SHEETS_API}${SHEETS_CREATE_PATH}`]);
    expect(new URL(calls[0]!).host).toBe('sheets.googleapis.com');
  });
});

describe('応答 parseCreatedSheet', () => {
  const ok = {
    spreadsheetId: 's1',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/s1/edit',
    properties: { title: '売上' },
  };

  it('★ 読めた応答は id / title / url を返す', () => {
    expect(parseCreatedSheet(ok)).toStrictEqual({ id: 's1', title: '売上', url: 'https://docs.google.com/spreadsheets/d/s1/edit' });
  });

  it('★ 表題が無い応答でも id と url があれば返す (表題は空)', () => {
    const { properties: _drop, ...noTitle } = ok;
    expect(parseCreatedSheet(noTitle).title).toBe('');
    expect(parseCreatedSheet({ ...ok, properties: ['x'] }).title).toBe('');
  });

  it('★ id / url が無い・文字列でなければ断る', () => {
    expect(thrownMessage(() => parseCreatedSheet(null))).toContain('Google Sheets API');
    expect(thrownMessage(() => parseCreatedSheet({ ...ok, spreadsheetId: undefined }))).toContain('spreadsheetId');
    expect(thrownMessage(() => parseCreatedSheet({ ...ok, spreadsheetUrl: 42 }))).toContain('spreadsheetUrl');
  });

  it('★ docs.google.com の https でない URL は、押せるリンクとして返さない', () => {
    const bad = [
      'http://docs.google.com/spreadsheets/d/s1',
      'https://docs.google.com.evil.example/spreadsheets/d/s1',
      'https://docs.google.com@evil.example/spreadsheets/d/s1',
      'https://evil.example/https://docs.google.com/spreadsheets/',
      'javascript:alert(1)',
      'https://docs.google.com/document/d/s1',
    ];
    for (const spreadsheetUrl of bad) {
      expect(thrownMessage(() => parseCreatedSheet({ ...ok, spreadsheetUrl })), spreadsheetUrl).toBe(
        'Google Sheets API の応答の spreadsheetUrl が docs.google.com の https ではありません',
      );
    }
  });

  it('★ 比べるのは解析・正規化した後の綴り (大文字・既定ポートは同じ先として通す)', () => {
    expect(parseCreatedSheet({ ...ok, spreadsheetUrl: 'HTTPS://DOCS.GOOGLE.COM:443/spreadsheets/d/s1' }).url).toBe(
      'https://docs.google.com/spreadsheets/d/s1',
    );
  });
});
