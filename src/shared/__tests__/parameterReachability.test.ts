/**
 * **台帳に載せた値が、本当に計算まで届いているか。**
 *
 * `CLAUDE.md` の規約: 「登録した値は**必ず配線し**、`parameterWiring.test.ts` で
 * 『上書きすると画面が動く』を対照つきで留める —— 『設定できるのに効かない』項目を
 * 作らない」。ところが**その配線を機械で確かめる物が無かった** (2026-09-07 実測)。
 *
 * ## 実測 (2026-09-07)
 *
 * | 段 | 何が留めているか |
 * | --- | --- |
 * | 台帳の id → モジュールの既定定数 | `shared/__tests__/parameters.test.ts` の全域マップ (147 件) |
 * | 台帳の id → 取り出し口の出力 | 同上 (上書きが正しい欄へ届く) |
 * | 取り出し口の欄 → 計算 | **誰も見ていなかった** ← ここ |
 * | 取り出し口 → 画面 | `pages/__tests__/parameterWiring.test.ts` (147 件中 **90 件**を名指し) |
 *
 * 3 段目が空くと「台帳に載っていて、上書きも保存できて、取り出し口も値を返すのに、
 * 計算が**その欄を読んでいない**」という項目が黙って作れる。設定画面には出るので、
 * 利用者は効いていると思う。
 *
 * ここは**綴りの走査**なので、変異検査の sandbox では原文が書き換わって空振りする。
 * `readOriginalSource` / `readOriginalDirEntries` を通して repo の本物を読む
 * (経緯は `originalSource.ts`)。走査の生死は下の床が見る。
 *
 * ## この検査が**言っていないこと** (過大に読まないため)
 *
 * - 欄の消費は `.欄名` の綴りで見るので、**同名の別物**に当たれば見逃す
 *   (`.standardRate` など一般的な名前)。取りこぼす側に倒れるだけで、誤って鳴りはしない。
 * - 「読まれている」は「計算に効いている」より弱い。**画面まで動くこと**は
 *   `pages/__tests__/parameterWiring.test.ts` が対照つきで留めており、
 *   2026-09-07 時点で台帳 147 件中 **90 件**を名指ししている (残り 57 件は
 *   束ごと渡す取り出し口の側でしか留まっていない。`docs/REMAINING_WORK.md`)。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PARAMETERS_TS = path.join(REPO_ROOT, 'src/shared/parameters.ts');

// --- 抽出 (純関数。標本で規則が当たることを下で確かめる) -------------------

/** 台帳の項目 id (`id: 'x.y'`)。 */
export function extractLedgerIds(source: string): string[] {
  return [...source.matchAll(/\bid: '([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)'/g)].map((m) => m[1]!);
}

/** 取り出し口 (`export function x(v: ParameterValues)`) が読む id と、組む欄。 */
export function extractAccessors(source: string): { name: string; ids: string[]; fields: { field: string; id: string }[] }[] {
  return [...source.matchAll(/^export function ([a-zA-Z][a-zA-Z0-9_]*)\(v: ParameterValues\)[\s\S]*?^\}/gm)].map((m) => ({
    name: m[1]!,
    ids: [...m[0].matchAll(/v\['([^']+)'\]/g)].map((x) => x[1]!),
    fields: [...m[0].matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9_]*): v\['([^']+)'\]/gm)].map((x) => ({ field: x[1]!, id: x[2]! })),
  }));
}

/**
 * 画面が台帳から**直接**読む id (`paramValues['x.y']` / `params['x.y']` ほか)。
 *
 * **変数名を決め打ちしない。** 最初の版は `paramValues[...]` だけを見ていて、
 * `params['payroll.commutePublicTransportCap']` と書いている画面 4 つを
 * 「誰も読まない」と誤って挙げた (2026-09-07)。呼び名は画面ごとに違うので、
 * 「識別子 + ['文字列']」の形を拾い、台帳に在る id だけを残す。
 */
export function extractDirectReads(source: string, ledger: ReadonlySet<string>): string[] {
  return [...source.matchAll(/\b[A-Za-z_$][\w$]*\[\s*'([^']+)'\s*\]/g)]
    .map((m) => m[1]!)
    .filter((id) => ledger.has(id));
}

// --- 実物の走査 -----------------------------------------------------------

/** `src` 以下の実装ファイル (`__tests__` は除く) を repo の原文で読む。 */
function sourceFiles(dir: string, out: { file: string; text: string }[] = []): { file: string; text: string }[] {
  for (const e of readOriginalDirEntries(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push({ file: full, text: readOriginalSource(full) });
    }
  }
  return out;
}

const PARAMETERS_SOURCE = readOriginalSource(PARAMETERS_TS);
const LEDGER_IDS = extractLedgerIds(PARAMETERS_SOURCE);
const ACCESSORS = extractAccessors(PARAMETERS_SOURCE);
const ALL_SOURCES = sourceFiles(path.join(REPO_ROOT, 'src'));
const OUTSIDE_PARAMETERS = ALL_SOURCES.filter((f) => path.resolve(f.file) !== PARAMETERS_TS);

describe('走査が生きている (床)', () => {
  it('台帳から id が取れる', () => {
    // 実測 147。床は「規則が死んだら鳴る」ためのもので、増える分には触らない。
    expect(LEDGER_IDS.length).toBeGreaterThanOrEqual(120);
    expect(new Set(LEDGER_IDS).size).toBe(LEDGER_IDS.length); // id は重複しない
  });

  it('取り出し口が取れる', () => {
    expect(ACCESSORS.length).toBeGreaterThanOrEqual(20);
    expect(ACCESSORS.some((a) => a.fields.length > 0)).toBe(true);
  });

  it('走査の対象ファイルが取れる (原文を読めている)', () => {
    expect(OUTSIDE_PARAMETERS.length).toBeGreaterThanOrEqual(300);
    // 計器が書き換えた写しを掴んでいない (書き換わると `stryMutAct_…(` が出る)。
    expect(PARAMETERS_SOURCE).toContain('export function corporateTaxRates(v: ParameterValues)');
  });
});

describe('★ 台帳の全項目が、取り出し口か画面のどちらかに読まれている', () => {
  it('読まれていない id は 0 件', () => {
    const read = new Set<string>();
    for (const a of ACCESSORS) for (const id of a.ids) read.add(id);
    const ledger = new Set(LEDGER_IDS);
    for (const f of OUTSIDE_PARAMETERS) for (const id of extractDirectReads(f.text, ledger)) read.add(id);
    const orphans = LEDGER_IDS.filter((id) => !read.has(id));
    expect(orphans, `台帳に載っているのに誰も読まない: ${orphans.join(', ')}`).toEqual([]);
  });
});

describe('★ 取り出し口が組む欄は、parameters.ts の外で読まれている', () => {
  it('読まれていない欄は 0 件', () => {
    const dead: string[] = [];
    for (const a of ACCESSORS) {
      for (const { field, id } of a.fields) {
        const used = OUTSIDE_PARAMETERS.some((f) => new RegExp(`\\.${field}\\b`).test(f.text));
        if (!used) dead.push(`${a.name}.${field} (<- ${id})`);
      }
    }
    expect(dead, `取り出し口が組むだけで誰も読まない欄: ${dead.join(', ')}`).toEqual([]);
  });

  it('対照: 実在しない欄名は当たらない (走査が何にでも当たっていない)', () => {
    // 上の検査は「見つからなければ落ちる」形なので、逆向きの標本を置く ——
    // 出鱈目な欄名が見つかってしまうなら、上の合格は何も意味していない。
    const nonsense = 'zzNoSuchAccessorFieldZz';
    expect(OUTSIDE_PARAMETERS.some((f) => new RegExp(`\\.${nonsense}\\b`).test(f.text))).toBe(false);
  });
});

describe('★ 標本: 規則が実際に当たる (合成した原文で鳴らす)', () => {
  const SAMPLE = [
    "export const PARAMETER_SPECS = [",
    "  { id: 'demo.used', label: 'x' },",
    "  { id: 'demo.orphan', label: 'y' },",
    "];",
    '',
    'export function demoParams(v: ParameterValues): DemoParams {',
    '  return {',
    "    liveField: v['demo.used'] ?? 1,",
    "    deadField: v['demo.deadOnly'] ?? 2,",
    '  };',
    '}',
  ].join('\n');

  it('台帳の id を拾う (点を含む id だけ)', () => {
    expect(extractLedgerIds(SAMPLE)).toEqual(['demo.used', 'demo.orphan']);
    // 点を持たない `id:` (レコードの id など) は台帳の項目ではない。
    expect(extractLedgerIds("{ id: 'plain', label: 'x' }")).toEqual([]);
  });

  it('取り出し口と、その欄を拾う', () => {
    const [acc] = extractAccessors(SAMPLE);
    expect(acc!.name).toBe('demoParams');
    expect(acc!.ids).toEqual(['demo.used', 'demo.deadOnly']);
    expect(acc!.fields).toEqual([
      { field: 'liveField', id: 'demo.used' },
      { field: 'deadField', id: 'demo.deadOnly' },
    ]);
  });

  it('★ 誰も読まない台帳の id を見つける', () => {
    const read = new Set(extractAccessors(SAMPLE).flatMap((a) => a.ids));
    expect(extractLedgerIds(SAMPLE).filter((id) => !read.has(id))).toEqual(['demo.orphan']);
  });

  it('★ 誰も読まない欄を見つける', () => {
    const consumers = [{ file: 'x.ts', text: 'const n = p.liveField + 1;' }];
    const dead = extractAccessors(SAMPLE)
      .flatMap((a) => a.fields)
      .filter(({ field }) => !consumers.some((f) => new RegExp(`\\.${field}\\b`).test(f.text)))
      .map(({ field }) => field);
    expect(dead).toEqual(['deadField']);
  });

  it('画面の直読みを、変数名に依らず拾う', () => {
    const ledger = new Set(['finance.effectiveTaxRate', 'payroll.commutePublicTransportCap']);
    // 呼び名は画面ごとに違う (`paramValues` / `params` / それ以外)。
    expect(extractDirectReads("const r = paramValues['finance.effectiveTaxRate'];", ledger)).toEqual([
      'finance.effectiveTaxRate',
    ]);
    expect(extractDirectReads("const c = params['payroll.commutePublicTransportCap'];", ledger)).toEqual([
      'payroll.commutePublicTransportCap',
    ]);
    // 台帳に無い鍵は拾わない (どの辞書引きも拾ってしまう規則にしない)。
    expect(extractDirectReads("const r = other['some.other.key'];", ledger)).toEqual([]);
    // 二重引用符は台帳の書き方ではないので拾わない (規則の的が狭いことの標本)。
    expect(extractDirectReads('const r = params["finance.effectiveTaxRate"];', ledger)).toEqual([]);
  });
});
