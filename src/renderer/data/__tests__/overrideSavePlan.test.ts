/**
 * **置き換えは欄ごとに 1 件** —— 保存と「自動に戻す」が相手にする行 (2026-09-27 · パス 497)。
 *
 * 画面は「この欄の置き換えは既に在るか」を購読の写しに尋ねていたので、別のタブが置いた行を
 * 知らずに 2 件目を足した。同じ欄に 2 件あると、適用 (`applyOverrides`) も札も**古いほう**を
 * 勝たせる (`list()` は新しい順で、後から当てた値が勝つ) —— 実測: 別のタブが 111 を置いた欄に
 * 222 を保存すると、保存した直後の札が「手入力 111 円」を出した。
 *
 * ここは純関数の側を留める。画面で実際に押す側は
 * `pages/__tests__/judgementReadsStoreNow.test.ts`。
 */
import { describe, expect, it } from 'vitest';
import {
  applyManualOverrides,
  catalogFor,
  effectiveOverrideIds,
  overrideSavePlan,
  type ManualOverrideEntry,
} from '../manualData';

const row = (
  id: string,
  scope: string,
  path: string,
  value: number,
): { id: string; data: ManualOverrideEntry } => ({ id, data: { scope, path, value } });

/** その画面の一覧のパスを全部持つ土台 (`inertOverrides.test.ts` と同じ形)。 */
function baseFor(scope: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of catalogFor(scope)) {
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

/** 土台から 1 つの (1 段の) パスの値を読む。 */
const valueAt = (o: Record<string, unknown>, path: string): unknown => o[path];

// 一覧に在る 1 段のパス (売上集計の画面)。
const PATH = 'totalAmount';
const OTHER_PATH = 'totalOrders';

describe('effectiveOverrideIds — その画面のその欄に効いている行', () => {
  it('前提: 標本のパスはどちらも一覧に在る (在らないと下の主張が空になる)', () => {
    const paths = catalogFor('sales').map((f) => f.path);
    expect(paths).toContain(PATH);
    expect(paths).toContain(OTHER_PATH);
  });

  it('★ 同じ画面・同じ欄・効く値の行だけを、渡した並びのまま返す', () => {
    const rows = [
      row('a', 'sales', PATH, 1),
      row('b', 'kpi', PATH, 2), // 別の画面
      row('c', 'sales', OTHER_PATH, 3), // 別の欄
      row('d', 'sales', PATH, NaN), // 値が読めない (効かない —— 点検の一覧が別に見せる)
      row('e', 'sales', PATH, 5),
    ];
    expect(effectiveOverrideIds('sales', PATH, rows)).toEqual(['a', 'e']);
  });

  it('★ 一覧に無い欄の行は、名前が一致しても数えない (効かないので)', () => {
    const rows = [row('x', 'sales', 'zzzGone', 1)];
    expect(effectiveOverrideIds('sales', 'zzzGone', rows)).toEqual([]);
  });

  it('行が無ければ空', () => {
    expect(effectiveOverrideIds('sales', PATH, [])).toEqual([]);
  });
});

describe('overrideSavePlan — 保存で書き換える行と消す行', () => {
  it('★ 効いている行が無ければ足す', () => {
    expect(overrideSavePlan('sales', PATH, [row('c', 'sales', OTHER_PATH, 3), row('d', 'sales', PATH, NaN)])).toEqual({ kind: 'add' });
  });

  it('★ 1 件在ればそれを書き換え、消す行は無い', () => {
    expect(overrideSavePlan('sales', PATH, [row('a', 'sales', PATH, 1)])).toEqual({ kind: 'edit', id: 'a', removeIds: [] });
  });

  it('★ 2 件以上在れば、最初の 1 件を書き換えて残りは全部消す (欄ごとに 1 件へ畳む)', () => {
    const rows = [
      row('new', 'sales', PATH, 222),
      row('noise', 'sales', OTHER_PATH, 9),
      row('mid', 'sales', PATH, 150),
      row('old', 'sales', PATH, 111),
    ];
    expect(overrideSavePlan('sales', PATH, rows)).toEqual({ kind: 'edit', id: 'new', removeIds: ['mid', 'old'] });
  });

  it('★ 畳まないと古いほうが効く —— 計画どおりに書けば、保存した値が効く', () => {
    // 保管層の並び (新しい順): 222 (この画面が足した 2 件目) → 111 (別のタブが置いた 1 件目)
    const stored = [row('new', 'sales', PATH, 222), row('old', 'sales', PATH, 111)];
    const base = baseFor('sales');
    // 直す前の形: 2 件のまま当てると、後から当てた古いほう (111) が勝つ。
    const before = applyManualOverrides('sales', base, stored.map((r) => r.data));
    expect(valueAt(before.overview as Record<string, unknown>, PATH)).toBe(111);
    // 計画どおりに 999 を保存する (書き換える 1 件 + 残りを消す)。
    const plan = overrideSavePlan('sales', PATH, stored);
    if (plan.kind !== 'edit') throw new Error('edit になるはず');
    const after = stored
      .filter((r) => !plan.removeIds.includes(r.id))
      .map((r) => (r.id === plan.id ? { ...r.data, value: 999 } : r.data));
    expect(after).toHaveLength(1);
    const applied = applyManualOverrides('sales', base, after);
    expect(valueAt(applied.overview as Record<string, unknown>, PATH)).toBe(999);
  });
});
