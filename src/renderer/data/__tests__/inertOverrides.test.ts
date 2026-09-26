/**
 * **保存されているのに効かない上書きを、画面が見せて消せるか** (2026-09-24 · パス 447)。
 *
 * `applyOverrides` は捨てた物を `ignored` で返すが、**出荷コードにその読み手は
 * 0 件**だった (走査で確認)。結果、一覧 (catalog) に無いパスの行は
 * **数えられるのに出ない** —— 見出しは「置き換え 2 件」と言い、並ぶのは 1 行だけ。
 * 並べているのが `myOverrides` ではなく**一覧**だからで、
 * パス 61 / 170 の家系 (「3 件」と書いて 2 行) が別の戸から戻っていた。
 *
 * ## ここが留めるもの
 *
 * 1. **判定は 1 つ** —— `overrideCause` の答えと `applyOverrides.ignored` が
 *    **両方向**で一致する (面と実装が構造的に揃う)。
 * 2. **原因ごとに別の文** —— 直す手が違うので、片方の文で両方を述べない。
 * 3. **未入力は原因ではない** —— 一覧に在って値が数なら `null`。
 * 4. **順序** —— パスも値も壊れている行は `no-field` (実装と同じ順序)。
 */
import { describe, expect, it } from 'vitest';
import {
  catalogFor,
  inertOverrideNote,
  inertOverrides,
  overrideCause,
  scopesWithCatalog,
  type InertOverride,
  type ManualOverrideEntry,
} from '../manualData';
import { applyOverrides } from '../overviewOverrides';

const row = (
  id: string,
  scope: string,
  path: string,
  value: number,
): { id: string; data: ManualOverrideEntry } => ({ id, data: { scope, path, value } });

/** 値が数として読めない 4 形。どれも `structuredClone` が通すので保管値として実在しうる。 */
const BAD_VALUES = [NaN, Infinity, -Infinity, Number('x')] as const;

/** その画面の一覧のパスを全部持つ土台。`setAtPath` が失敗しないので `ignored` は原因 2 つだけになる。 */
function baseFor(scope: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of catalogFor(scope)) {
    // 一覧のパスは `a.b` の形もある (経営サマリー)。階層を作る。
    const segs = f.path.split('.');
    let node = out;
    for (let i = 0; i < segs.length - 1; i += 1) {
      const k = segs[i]!;
      if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
      node = node[k] as Record<string, unknown>;
    }
    node[segs[segs.length - 1]!] = 0;
  }
  return out;
}

describe('効かない上書き — 判定 (パス 447)', () => {
  it('★ 一覧に無いパスは no-field', () => {
    expect(overrideCause('sales', { path: 'zzzGone', value: 100 })).toBe('no-field');
  });

  it('★ 一覧に在っても値が数として読めなければ bad-value', () => {
    for (const v of BAD_VALUES) {
      expect(overrideCause('sales', { path: 'totalAmount', value: v }), String(v)).toBe('bad-value');
    }
  });

  it('★ 一覧に在って値が数なら効く (null)', () => {
    expect(overrideCause('sales', { path: 'totalAmount', value: 0 })).toBeNull();
    expect(overrideCause('sales', { path: 'totalAmount', value: -5 })).toBeNull();
  });

  it('★ パスも値も壊れていたら no-field —— 実装と同じ順序 (パス 401)', () => {
    // `applyOverrides` は一覧を先に引くので、捨てる理由は「一覧に無い」である。
    // 逆順にすると「計算が使った理由」と「画面が述べる理由」が食い違う。
    expect(overrideCause('sales', { path: 'zzzGone', value: NaN })).toBe('no-field');
    const applied = applyOverrides(catalogFor('sales'), baseFor('sales'), [
      { path: 'zzzGone', value: NaN },
    ]);
    expect(applied.ignored, '実装が別のパスを名指ししている').toEqual(['zzzGone']);
  });

  it('★ 一覧を持たない画面では、どのパスも no-field', () => {
    expect(catalogFor('linux'), 'linux に一覧が在る (前提が崩れた)').toEqual([]);
    expect(overrideCause('linux', { path: 'anything', value: 1 })).toBe('no-field');
  });

  it('★ 別の画面の行は数えない', () => {
    const rows = [row('a', 'kpi', 'zzzGone', 1), row('b', 'sales', 'zzzGone', 1)];
    expect(inertOverrides('sales', rows).map((r) => r.id)).toEqual(['b']);
  });

  it('★ 効かない行だけを、id と値つきで返す', () => {
    const rows = [
      row('ok', 'sales', 'totalAmount', 500),
      row('orphan', 'sales', 'zzzGone', 100),
      row('bad', 'sales', 'aov', NaN),
    ];
    const got = inertOverrides('sales', rows);
    expect(got.map((r) => `${r.id}/${r.cause}`)).toEqual(['orphan/no-field', 'bad/bad-value']);
    expect(got[0]!.path).toBe('zzzGone');
    expect(got[0]!.value).toBe(100);
  });
});

describe('効かない上書き — 面と実装が一致する (パス 447)', () => {
  /**
   * **両方向**: 画面が「効かない」と言う行の集合と、`applyOverrides` が捨てるパスの
   * 集合が同じであること。片方だけを直すと、画面が「効いています」と言いながら
   * 数字が変わらない (またはその逆) 形が開く。
   *
   * 土台には一覧のパスを全部置くので、3 つ目の原因 (`setAtPath` が null) は起きない ——
   * その原因は保存された記録ではなく**一覧と土台の食い違い**で、
   * しかもその行は一覧に在るので画面に出ており「自動に戻す」で消せる。
   */
  it('★ 走査: 一覧を持つ全画面で、効かない行の集合 == ignored', () => {
    const scopes = scopesWithCatalog();
    expect(scopes.length, '一覧を持つ画面が無い (走査が空振り)').toBeGreaterThanOrEqual(5);
    for (const scope of scopes) {
      const fields = catalogFor(scope);
      expect(fields.length, `${scope} の一覧が空`).toBeGreaterThan(0);
      const rows = [
        row('r0', scope, fields[0]!.path, 1234),
        row('r1', scope, 'zzzGoneField', 100),
        row('r2', scope, fields[fields.length - 1]!.path, NaN),
      ];
      const inert = inertOverrides(scope, rows);
      const applied = applyOverrides(
        fields,
        baseFor(scope),
        rows.map((r) => ({ path: r.data.path, value: r.data.value })),
      );
      expect(
        [...inert.map((r) => r.path)].sort(),
        `${scope}: 画面と実装で捨てる行が違う`,
      ).toEqual([...applied.ignored].sort());
      // 逆向き: 効くと言った行は実際に適用されている。
      const ok = rows.filter((r) => overrideCause(scope, r.data) === null).map((r) => r.data.path);
      expect([...ok].sort(), `${scope}: 効くと言った行が適用されていない`).toEqual(
        [...applied.overridden].sort(),
      );
    }
  });

  it('★ 対照の標本: 一覧に在って値が数の行は 1 件も捨てられない', () => {
    for (const scope of scopesWithCatalog()) {
      const rows = catalogFor(scope).map((f, i) => row(`r${i}`, scope, f.path, i + 1));
      expect(inertOverrides(scope, rows), `${scope}`).toEqual([]);
      const applied = applyOverrides(
        catalogFor(scope),
        baseFor(scope),
        rows.map((r) => ({ path: r.data.path, value: r.data.value })),
      );
      expect(applied.ignored, `${scope}: 正しい行が捨てられた`).toEqual([]);
    }
  });
});

describe('効かない上書き — 断りの文 (パス 447)', () => {
  const note = (rows: readonly InertOverride[]): string => {
    const n = inertOverrideNote(rows);
    expect(n, '文が出ない').not.toBeNull();
    return n!;
  };
  const mk = (cause: InertOverride['cause'], id = 'x'): InertOverride => ({
    id,
    path: 'p',
    value: 1,
    cause,
  });

  it('★ 効かない行が無ければ黙る', () => {
    expect(inertOverrideNote([])).toBeNull();
  });

  it('★ 一覧に無いパスの文は、欄が変わったことを述べる', () => {
    const t = note([mk('no-field')]);
    expect(t).toContain('1 件');
    expect(t).toContain('パスがありません');
    // 逆向き: その人がしていない失敗 (値が数でない) を告げない。
    expect(t, '原因を取り違えた文が混じる').not.toContain('数として読めません');
  });

  it('★ 値が数でない行の文は、値の側を述べる', () => {
    const t = note([mk('bad-value')]);
    expect(t).toContain('数として読めません');
    expect(t, '原因を取り違えた文が混じる').not.toContain('パスがありません');
  });

  it('★ 両方在れば 2 文とも出て、件数は原因ごとに数える', () => {
    const t = note([mk('no-field', 'a'), mk('no-field', 'b'), mk('bad-value', 'c')]);
    expect(t).toContain('2 件は、この画面の置き換えられる欄にそのパスがありません');
    expect(t).toContain('1 件は、値が数として読めません');
  });

  it('★ どの原因でも、逃げ口を名指しする (法則 escape-hatch-stays-open)', () => {
    for (const cause of ['no-field', 'bad-value'] as const) {
      const t = note([mk(cause)]);
      expect(t, cause).toContain('「削除」');
      expect(t, `${cause}: 使われていないことを述べない`).toContain('計算には使われていません');
    }
  });
});
