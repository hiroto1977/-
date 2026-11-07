import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { isSafeFilename } from '../../shared/safeFilename';
import { metaFromStored } from '../library/library';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

/**
 * **ファイル名の関門が名乗る消費者と、実物の書き出し口** (2026-09-20 · パス 359)。
 *
 * `shared/safeFilename.ts` は自分を「ファイル名として受け取ってよい文字列か ——
 * **アプリ全体で 1 つだけ持つ**」と名乗り、脅威モデルを「**入口が出口より緩い**
 * 状態は、『新しい書き出し経路が再検査を忘れた瞬間』に穴になる」と書いている。
 * そして消費者として `library.put()` と `writeBlobToFolder()` の **2 つ**を
 * 名指ししている。
 *
 * ## 実測 (2026-09-20)
 *
 * `isSafeFilename` を呼ぶ所は実物でも 2 か所 (`library.ts` / `fs/fsa.ts`) ——
 * **どちらも保管層**である。ところが名前を決める出口はもう 1 種類在った:
 *
 * ```
 *   a.download = …   10 か所   (OS のダウンロードの名前を決める)
 * ```
 *
 * この 10 か所は保管層を 1 つも通らない。10 のうち 8 はリテラル + 時刻の
 * 組み立てで、**残る 2 か所が保管層から戻ってきた値**を載せていた:
 *
 * - `LibraryPage.tsx` の `item.filename` —— `metaFromStored` は 3 つの文字列を
 *   `typeof === 'string'` だけで通していたので、**`put()` が拒む 9 形すべてが
 *   読み出し側で素通り**した (実測: `../../../../etc/passwd` / `a/b.txt` /
 *   `a\b.txt` / `.` / `..` / 空 / NUL / CR+LF / 5,000 字 が 9/9 そのまま)。
 * - `FinancialAnalysis.tsx` の `selected.unit.id` —— 記録層の `list()` が
 *   `cur.value as StoredRecord<T>` と**無検査でキャスト**するので、id は
 *   保存されている任意の文字列になりうる。
 *
 * ## live な結果は限定的だと正直に言う
 *
 * `a.download` の値は **UA が必ず消毒する**ので、区切りでのトラバーサルは
 * 今日起きない。observable だったのは**長さの側**で、`put()` の 256 字が
 * 読み出し側に無いため、`LibraryPage` の「控えが壊れています」の 1 文と
 * 一覧の行ラベルが**保管層の文字列を天井なしで描けた** —— パス 320 が
 * teamradar の理由に天井を掛けたのと同じ形が、**壊れた保存値を扱う当の
 * モジュールの中に**残っていた。`FinancialAnalysis` の id は
 * `a.download` にしか届かないので、そこは分類の理由として測って記す
 * (「決めていない」ではなく「測ったら届く先が 1 つだけだった」)。
 *
 * ## ここで見るもの
 *
 * 1. `a.download` の母集団 (10 か所) が**全部台帳に在る** —— 両方向。
 * 2. 書く側が検める 3 欄と、読む側が検める 3 欄が**同じ** —— 両方向。
 *    (`put()` が 4 つ目を検め始めたら落ち、`metaFromStored` が 1 つ落としても落ちる)
 * 3. 倒し込み先の 3 つの文字列が**それ自身その関門を通る** ——
 *    通らない既定値は穴になる。
 * 4. 振る舞い: `put()` が拒む形が読み出し側でも既定へ倒れる。
 */

const REPO_ROOT = join(__dirname, '../../..');

type NameFrom = 'literal' | 'built' | 'stored';

/** `a.download = X` の母集団。`why` は「その名前がどこから来るか」を書く。 */
const SINKS: Record<string, { nameFrom: NameFrom; why: string }> = {
  'src/renderer/web-shim.ts': {
    nameFrom: 'built',
    why: '呼び出し 4 件。3 件は `def.id` / リテラル + Date.now()、1 件は `filenameFromTitle` (関門のモジュール自身が持つ組み立て)。',
  },
  'src/renderer/components/BackupPanel.tsx': {
    nameFrom: 'literal',
    why: '`service-hub-backup-${localIsoDate()}${suffix}.json` —— 変数は日付と 2 択の接尾辞だけ。',
  },
  'src/renderer/components/FinancialAnalysis.tsx': {
    nameFrom: 'stored',
    why: '`financial-report-${unit.id}-…` と `statement-…-${unit.id}-…`。id は記録層の無検査キャスト由来。届く先は a.download だけ (画面の文にも実ファイル書き込みにも入らない) ので UA の消毒が最後の関門になる —— 実測して分類した。',
  },
  'src/renderer/components/WelfareSchemeCard.tsx': {
    nameFrom: 'literal',
    why: '呼び出し 3 件はすべて文字列リテラル (employee-explanation.md ほか)。',
  },
  'src/renderer/components/ChatbotWidget.tsx': {
    nameFrom: 'literal',
    why: "'chatbot-requests.md' の直書き。",
  },
  'src/renderer/pages/SalesPage.tsx': {
    nameFrom: 'literal',
    why: '`sales-${localIsoDate()}.csv` —— 変数は日付だけ。',
  },
  'src/renderer/pages/OverviewPage.tsx': {
    nameFrom: 'literal',
    why: '`management-report-${localIsoDate()}.md` —— 変数は日付だけ。',
  },
  'src/renderer/pages/KpiPage.tsx': {
    nameFrom: 'literal',
    why: '`kpi-actuals-${localIsoDate()}.csv` —— 変数は日付だけ。',
  },
  'src/renderer/pages/LibraryPage.tsx': {
    nameFrom: 'stored',
    why: '`item.filename` —— 保管層から戻る値。パス 359 から `metaFromStored` が isSafeFilename を通し、通らない名前は「(名前が読めません)」へ倒れる。',
  },
  'src/renderer/security/LockScreen.tsx': {
    nameFrom: 'literal',
    why: '`service-hub-${stamp}.txt` —— stamp は自分で組んだ時刻の文字列。',
  },
};

/** 出荷される `.ts` / `.tsx` を歩く (検査は母集団ではない)。 */
function shippedFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readOriginalDirEntries(join(REPO_ROOT, rel))) {
      if (e.name === '__tests__' || e.name === '__snapshots__') continue;
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(next);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(next);
    }
  };
  walk('src');
  return out;
}

/** `a.download = <式>;` の代入だけを拾う (`data-…-download=` は拾わない)。 */
export function downloadAssignments(src: string): string[] {
  return [...src.matchAll(/\.download\s*=\s*([^;\n]+);/g)].map((m) => (m[1] ?? '').trim());
}

const POPULATION = shippedFiles()
  .filter((rel) => downloadAssignments(readOriginalSource(join(REPO_ROOT, rel))).length > 0)
  .sort();

describe('a.download の母集団 (パス 359)', () => {
  it('★ 走査が死んでいない (床つき)', () => {
    expect(POPULATION.length).toBeGreaterThanOrEqual(10);
  });

  it('★ 母集団と台帳が両方向に一致する', () => {
    expect(POPULATION).toEqual(Object.keys(SINKS).sort());
  });

  it('★ 台帳の理由が空でない (保留の決まり文句を置けない)', () => {
    const DEFERRAL = /分かる人が決め|わかる人が決め|誰かが決め|要検討|TODO/;
    for (const [rel, row] of Object.entries(SINKS)) {
      expect(row.why.length, rel).toBeGreaterThan(20);
      expect(row.why, rel).not.toMatch(DEFERRAL);
    }
    // 針が実際にその文面へ当たることを、同じ検査の中で標本で確かめる。
    expect('分かる人が決めること').toMatch(DEFERRAL);
    expect('TODO: あとで').toMatch(DEFERRAL);
  });

  it('★ 針は代入だけを拾う (data-* 属性は母集団ではない)', () => {
    // 肯定の標本 —— 当たること。
    expect(downloadAssignments('      a.download = item.filename;\n')).toEqual(['item.filename']);
    expect(downloadAssignments('a.download=`x-${d()}.csv`;')).toEqual(['`x-${d()}.csv`']);
    // 否定の標本 —— `LibraryPage` の data 属性を巻き込まないこと。
    expect(downloadAssignments('data-library-download={it.id}')).toEqual([]);
    expect(downloadAssignments('<a download>{label}</a>')).toEqual([]);
  });

  it('★ 保管層から戻る値を載せる口は 2 つだけ (増えたら台帳で説明させる)', () => {
    const stored = Object.entries(SINKS).filter(([, r]) => r.nameFrom === 'stored').map(([k]) => k);
    expect(stored).toEqual([
      'src/renderer/components/FinancialAnalysis.tsx',
      'src/renderer/pages/LibraryPage.tsx',
    ]);
  });
});

// --- 書く側と読む側が同じ 3 欄を検める --------------------------------------

/** 3 欄それぞれの「書く側の関門」と「倒し込み先」。 */
const GUARDED_FIELDS = [
  { field: 'filename', guard: 'isSafeFilename', fallback: '(名前が読めません)' },
  { field: 'mime', guard: 'isSafeMime', fallback: 'application/octet-stream' },
  { field: 'serviceId', guard: 'isSafeServiceId', fallback: 'unknown' },
] as const;

const LIBRARY_SRC = readOriginalSource(join(REPO_ROOT, 'src/renderer/library/library.ts'));

describe('library: 書く側の関門と読む側の関門が同じ (パス 359)', () => {
  it('★ put() が検める欄は 3 つで、台帳と一致する (逆向き)', () => {
    const put = LIBRARY_SRC.slice(LIBRARY_SRC.indexOf('async put('), LIBRARY_SRC.indexOf('const item: LibraryItem'));
    const guards = [...put.matchAll(/if \(!(isSafe[A-Za-z]+)\(/g)].map((m) => m[1]!).sort();
    expect(guards).toEqual(GUARDED_FIELDS.map((f) => f.guard).sort());
  });

  it('★ metaFromStored が同じ 3 つを呼ぶ (欄ごとに)', () => {
    const read = LIBRARY_SRC.slice(LIBRARY_SRC.indexOf('export function metaFromStored'), LIBRARY_SRC.indexOf('export function itemFromStored'));
    for (const { field, guard } of GUARDED_FIELDS) {
      expect(read, `${field} が ${guard} を通っていません`).toContain(`${field}: ${guard}(r.${field})`);
    }
    // 針の否定の標本 —— 旧い綴り (typeof だけ) が残っていないこと。
    expect(read).not.toContain("typeof r.filename === 'string'");
  });

  it('★ 倒し込み先の 3 つの文字列がそれ自身その関門を通る (通らない既定値は穴)', () => {
    // `isSafeMime` / `isSafeServiceId` は module-local なので、規則そのものを
    // ここで再実装せず **実物の振る舞い**で確かめる (既定へ倒れた値を再投入して、
    // 2 度目も同じ値で返ることを見る = その値は関門を通っている)。
    for (const { field, fallback } of GUARDED_FIELDS) {
      const once = metaFromStored({ id: 'x', [field]: '\u0000\u0000' }) as Record<string, unknown> | null;
      expect(once?.[field], field).toBe(fallback);
      const twice = metaFromStored({ id: 'x', [field]: fallback }) as Record<string, unknown> | null;
      expect(twice?.[field], `${field} の既定値が関門を通りません`).toBe(fallback);
    }
  });
});

// --- 振る舞い: put() が拒む形は読み出し側でも既定へ倒れる --------------------

/** `put()` が拒む 9 形 (2026-09-20 実測。直す前は 9/9 が素通りした)。 */
const REFUSED_NAMES = [
  '../../../../etc/passwd',
  'a/b.txt',
  'a\\b.txt',
  '.',
  '..',
  '',
  'x\u0000.png',
  'x\r\n.png',
  'A'.repeat(5000),
];

describe('metaFromStored: 保存値の名前は読み出し側でも関門を通る (パス 359)', () => {
  it.each(REFUSED_NAMES.map((n) => [n.length > 24 ? `${n.slice(0, 24)}… (${n.length} 字)` : JSON.stringify(n), n] as const))(
    '★ %s は既定名へ倒れる',
    (_label, name) => {
      // 前提: これは書く側が拒む形である (拒まない形で検査すると意味が無い)。
      expect(isSafeFilename(name)).toBe(false);
      expect(metaFromStored({ id: 'x', filename: name })?.filename).toBe('(名前が読めません)');
    },
  );

  it('★ 対照: まともな名前はそのまま通る (関門が全部落としているのではない)', () => {
    expect(metaFromStored({ id: 'x', filename: 'service-hub-backup-2026-09-20.json' })?.filename)
      .toBe('service-hub-backup-2026-09-20.json');
    expect(metaFromStored({ id: 'x', filename: '.hidden' })?.filename).toBe('.hidden');
    expect(metaFromStored({ id: 'x', filename: 'A'.repeat(256) })?.filename).toBe('A'.repeat(256));
  });

  it('★ `typeof === string` では足りないことの標本 (旧い判定が通していた形)', () => {
    for (const n of REFUSED_NAMES) {
      expect(typeof n === 'string', JSON.stringify(n.slice(0, 20))).toBe(true);
    }
  });

  it('★ mime / serviceId も同じ (天井と字種)', () => {
    expect(metaFromStored({ id: 'x', mime: 'a'.repeat(129) })?.mime).toBe('application/octet-stream');
    expect(metaFromStored({ id: 'x', mime: 'text/plain\r\nX: y' })?.mime).toBe('application/octet-stream');
    expect(metaFromStored({ id: 'x', mime: 'image/svg+xml' })?.mime).toBe('image/svg+xml');
    expect(metaFromStored({ id: 'x', serviceId: '../evil' })?.serviceId).toBe('unknown');
    expect(metaFromStored({ id: 'x', serviceId: 'Templates' })?.serviceId).toBe('unknown');
    expect(metaFromStored({ id: 'x', serviceId: 'teamradar' })?.serviceId).toBe('teamradar');
  });
});
