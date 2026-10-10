/** @vitest-environment jsdom */
/**
 * **金額が数として読めない実績は、画面でも集計に入らず、一覧には残る。** (2026-09-24 · パス 443)
 *
 * 背骨は**振る舞い** —— 実物の保管層へ入れて実物の画面を描く。
 *
 * ★ **一覧は素の購読を描く** ので壊れた行もそこに出る (× で消せる · 法則
 *   `escape-hatch-stays-open`)。だから値は**画面の側で**型から読む ——
 *   `Intl.NumberFormat#format` は何を渡しても投げないので、素で渡すと
 *   `null` が `￥0`・`{z:1}` が `￥NaN`・`[1]` と `true` が `￥1` になる。
 * ★ **その行の導出値 (営業利益) も出さない** —— 売上高を「—」と言いながら
 *   営業利益に確信のある数字を並べると、同じ行が同じ問いに 2 通り答える。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KpiPage } from '../KpiPage';
import { OverviewPage } from '../OverviewPage';
import { KPI_ACTUALS_COLLECTION } from '../../data/kpiActuals';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForText } from '../../__tests__/jsdomWait';

const GOOD = {
  period: '2026-04',
  unit: '全社',
  revenue: 1_000_000,
  cogs: 300_000,
  advertising: 50_000,
  sga: 200_000,
  depreciation: 10_000,
};

/** 形が拒む 5 形 —— どれも `structuredClone` が通すので保管値として実在しうる。 */
const NON_NUMBERS: readonly [string, unknown][] = [
  ['10進の文字列', '9000000'],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
  ['null', null],
];

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  container.remove();
  vi.restoreAllMocks();
});

async function seed(rows: readonly Record<string, unknown>[]): Promise<void> {
  const store = getRecordStore();
  for (const r of rows) await store.insert(KPI_ACTUALS_COLLECTION, r);
}

/**
 * 素で描く (境界で包まない —— 包むと文面になって「投げた」が区別できない)。
 *
 * 錠は**置いた行が届いた印**にする —— 見出しはフォームのラベルなので
 * 保管層より先に出る (パス 376 / 442 で 3 度踏んだ罠)。
 */
async function mount(Page: ComponentType, waitFor: string): Promise<string> {
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

describe('KPI / BEP の画面 — 金額が読めない行 (パス 443)', () => {
  it.each(NON_NUMBERS)('★ 売上高が %s でも、合計は良い行だけ / その行は「—」/ × は残る', async (_label, bad) => {
    await seed([GOOD, { ...GOOD, period: '2026-05', revenue: bad }]);
    // 錠は壊れた行の期 —— 一覧は素の購読なのでこれが出れば 2 行とも届いている。
    const t = await mount(KpiPage, '2026-05');

    // ① 合計は良い行だけ (実績合計 売上高のタイル)。
    expect(t).toContain('￥1,000,000');
    // ② 嘘を刷らない。
    expect(t).not.toContain('￥NaN');
    expect(t).not.toContain('[object Object]');
    // ③ 逃げ口: その行の × がある (開けない・消せない画面にしない)。
    expect(container.querySelectorAll('button[aria-label="削除"]').length).toBeGreaterThanOrEqual(2);
    // ④ 除いたことを、正しい原因で述べる。
    expect(t).toContain('金額の欄');
    expect(t).toContain('が数として読めないため');
    expect(t).not.toContain('期 (YYYY-MM) が読めない');
  });

  it('★ 壊れた行の導出値 (営業利益) も出さない —— 同じ行が 2 通りに答えない', async () => {
    await seed([GOOD, { ...GOOD, period: '2026-05', revenue: '9000000' }]);
    await mount(KpiPage, '2026-05');
    /*
     * **符号では当たらない** —— 直す前の実測は `revenue: '1000'` で -￥559,000 だったが、
     * `'9000000'` なら `'09000000' - 560000 = 8,440,000` と**正**になる。
     * 最初に書いた `not.toContain('-￥')` は、対照 G (導出値の抑止を外す) を
     * **1 件も鳴らさなかった**。だから行の欄そのものを読む。
     */
    const cellsOf = (period: string): string[] => {
      const tr = [...container.querySelectorAll('tr')].find(
        (x) => x.querySelector('td')?.textContent === period,
      );
      if (!tr) throw new Error(`row ${period} not found`);
      return [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '');
    };
    // 壊れた行: 売上高も営業利益も「—」(片方だけ数字を出さない)。
    expect(cellsOf('2026-05').slice(2, 4)).toEqual(['—', '—']);
    // 良い行は今までどおり (漏斗も抑止も、正しい行には触れない)。
    expect(cellsOf('2026-04').slice(2, 4)).toEqual(['￥1,000,000', '￥440,000']);
  });

  it('★ 正しい 2 行なら断りは 1 文も出ない (答えも変わらない)', async () => {
    await seed([GOOD, { ...GOOD, period: '2026-05' }]);
    const t = await mount(KpiPage, '2026-05');
    expect(t).toContain('￥2,000,000');
    expect(t).not.toContain('が数として読めないため');
  });

  it('★ 予算の側も同じ規則 (実績と予算は別の入力)', async () => {
    const store = getRecordStore();
    await store.insert('kpi-budgets', GOOD);
    await store.insert('kpi-budgets', { ...GOOD, period: '2026-05', revenue: null });
    const t = await mount(KpiPage, '2026-05');
    expect(t).toContain('が数として読めないため');
    // 壊れた予算の行は一覧に残り、売上高(予算)の欄は「—」(￥0 という事実の主張をしない)。
    expect(t).toContain('2026-05全社—');
  });
});

describe('経営サマリー — 金額が読めない行 (パス 443)', () => {
  it('★ 除いたことを述べ、合計は良い行だけ', async () => {
    await seed([GOOD, { ...GOOD, period: '2026-05', revenue: '9000000' }]);
    // 錠は算定された値 (ラベルは実績が届く前から出ている)。
    const t = await mount(OverviewPage, '安全余裕率');
    expect(t).toContain('が数として読めないため');
    expect(t).not.toContain('期 (YYYY-MM) が読めない');
    // 良い行だけの答え —— 直す前は 営業利益 10,000,007,880 千円 / 営業利益率 100.0% だった。
    expect(t).toContain('営業利益率 44.0%');
    expect(t).toContain('￥440,000');
  });
});
