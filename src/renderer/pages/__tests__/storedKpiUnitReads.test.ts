/** @vitest-environment jsdom */
/**
 * **保管した事業名も、型から始めて画面では天井を通る。** (2026-09-24 · パス 441)
 *
 * パス 417 は販売記録のメモについてこれを閉じた。**同じ家系の 2 つ目が KPI の事業名**で、
 * 見つけたのは人ではなく**走査の道具** (`npm run audit:malformed-fields`) の初回実行である
 * —— `docs/REMAINING_WORK.md` が「投げた画面 0」と記録していた probe は、
 * **空の行に 1 欄だけ置いた 281 組**を測っており、*正しい行*の上で 1 欄だけ壊す形
 * (実測 175 組) を 1 つも見ていなかった。**覆うはずだった当の形が母集団の外に在った。**
 *
 * ## 実測 (2026-09-24 · 直す前 · 期も金額も正しい実績 1 件の `unit` だけを壊す)
 *
 * | unit | KPI / BEP | 経営サマリー |
 * | --- | --- | --- |
 * | `42` / `{z:1}` / `[1]` / `true` | **TypeError: a.unit.trim is not a function** | **同** |
 * | `null` | **TypeError: Cannot read properties of null** | **同** |
 *
 * 投げていたのは `a.unit.trim()` の**素の呼び出し 3 つ** (`actualKey` /
 * `findDuplicateActuals` の組の作成 / `duplicateActualMessage`) で、`??` すら無い。
 * 届く先は **3 つの描画** —— `KpiPage` の実績パネルと予算パネル、`OverviewPage` の
 * `buildBusinessOverview` —— つまり **KPI / BEP と経営サマリーの両方が開けなくなる**。
 * 開けない画面からはその行を消せない (法則 `escape-hatch-stays-open`)。
 *
 * ★ **`readablePeriodRows` (パス 225) は期しか見ない** ので、この値は選別を通り抜ける。
 * ★ **天井は同一性の側には通さない** —— `actualKey` は (期, 事業) の同一性を決めるので、
 *   切った事業名は**別の事業を指す**。天井は画面に出す所 (`listGroups` /
 *   `duplicateActualMessage` / 一覧の `<td>`) だけに掛ける (パス 417 と同じ判断)。
 * ★ **一覧は素の購読を描く** —— 期が読めない行もそこに出るから × で消せる。
 *   だから値は**画面の側で**型から読む (`displayField`): 物・配列を素で置くと React が
 *   「Objects are not valid as a React child」で落とし、その画面ごと開けなくなる。
 *
 * 背骨は**振る舞い** —— 実物の保管層へ入れて実物の画面を描く。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KpiPage } from '../KpiPage';
import { OverviewPage } from '../OverviewPage';
import {
  KPI_ACTUALS_COLLECTION,
  MAX_KPI_UNIT_CHARS,
  actualKey,
  duplicateActualMessage,
  duplicateActualsNote,
  findDuplicateActuals,
  hasSamePeriodUnit,
  kpiUnitText,
  type KpiActual,
} from '../../data/kpiActuals';
import { KPI_BUDGETS_COLLECTION } from '../../data/budgetVariance';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripNonCode } from '../../../shared/__tests__/stripNonCode';
import { waitForText } from '../../__tests__/jsdomWait';

/** 画面の総文字数の上限 —— 1 件の事業名で画面が膨らんだら鳴る。 */
const SCREEN_BOUND = 20_000;
const BIG = 'x'.repeat(200_000);

/** 形が拒む 5 形 —— どれも `structuredClone` が通すので保管値として実在しうる。 */
const NON_STRINGS: readonly [string, unknown][] = [
  ['数', 42],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
  ['null', null],
];

const GOOD = {
  period: '2026-04',
  unit: '全社',
  revenue: 1_000_000,
  cogs: 300_000,
  advertising: 50_000,
  sga: 200_000,
  depreciation: 10_000,
};

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ ...GOOD, ...over });

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

async function seed(collection: string, rows: readonly Record<string, unknown>[]): Promise<void> {
  const store = getRecordStore();
  for (const r of rows) await store.insert(collection, r);
}

/**
 * 素で描く (境界で包まない —— 包むと文面になって「投げた」が区別できない)。
 *
 * 錠は**置いた行が届いた印** (金額) にする —— 見出しはフォームのラベルなので
 * 保管層より先に出る (パス 376)。
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

describe('保管層から読んだ事業名 — 型と天井 (パス 441)', () => {
  it.each(NON_STRINGS)('★ 事業名が %s でも KPI / BEP は投げない', async (_label, unit) => {
    await seed(KPI_ACTUALS_COLLECTION, [row({ unit })]);
    // 錠は金額 —— 行が届いた印であり、行そのものを落としていないことも同時に言う。
    const t = await mount(KpiPage, '2026-04');
    // 逃げ口: その行の × がある (開けない画面からは消せない)。
    expect(container.querySelectorAll('button[aria-label="削除"]').length).toBeGreaterThanOrEqual(1);
    expect(t).not.toContain('[object Object]');
  });

  // 経営サマリーは jsdom で重い (1 描画あたり数秒) ので、画面側は **2 形**に絞る ——
  // 数 (`.trim` が落ちる) と 物 (JSX が「Objects are not valid as a React child」で落ちる)。
  // 残る 3 形は下の `kpiUnitText` / `actualKey` / `findDuplicateActuals` が直接見る
  // (同じ漏斗を通るので、画面ごとに 5 形を描き直しても新しいことは分からない)。
  it.each(NON_STRINGS.slice(0, 2))('★ 事業名が %s でも経営サマリーは投げない', async (_label, unit) => {
    await seed(KPI_ACTUALS_COLLECTION, [row({ unit })]);
    const t = await mount(OverviewPage, '経営サマリー');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
  });

  it.each(NON_STRINGS.slice(0, 2))('★ 予算の事業名が %s でも KPI / BEP は投げない', async (_label, unit) => {
    await seed(KPI_BUDGETS_COLLECTION, [row({ unit })]);
    const t = await mount(KpiPage, '2026-04');
    expect(t).not.toContain('[object Object]');
  });

  it('★ 200,000 字の事業名で画面が膨らまない (一覧と重複の警告の両方)', async () => {
    await seed(KPI_ACTUALS_COLLECTION, [row({ unit: BIG }), row({ unit: BIG, cogs: 1 })]);
    const t = await mount(KpiPage, '2026-04');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
    // 重複の警告は出る —— 天井は文面に掛かるだけで、重複の判定そのものは変えない。
    expect(t).toContain('同じ期・事業の実績が 1 組重複しており');
  });

  it('★ 200,000 字の事業名で経営サマリーも膨らまない', async () => {
    await seed(KPI_ACTUALS_COLLECTION, [row({ unit: BIG }), row({ unit: BIG, cogs: 1 })]);
    const t = await mount(OverviewPage, '経営サマリー');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
  });
});

describe('事業名の読みは 1 つの口を通る (パス 441)', () => {
  it.each(NON_STRINGS)('kpiUnitText は %s を空文字にする (入口と同じ規則)', (_label, unit) => {
    expect(kpiUnitText({ unit } as unknown as KpiActual)).toBe('');
  });

  it('kpiUnitText は前後の空白を落とす', () => {
    expect(kpiUnitText({ unit: '  EC  ' } as KpiActual)).toBe('EC');
  });

  it.each(NON_STRINGS)('actualKey / findDuplicateActuals / hasSamePeriodUnit は %s で投げない', (_label, unit) => {
    const bad = { ...GOOD, unit } as unknown as KpiActual;
    expect(() => actualKey(bad)).not.toThrow();
    expect(() => findDuplicateActuals([bad, bad])).not.toThrow();
    expect(() => hasSamePeriodUnit([bad], { period: '2026-04', unit: '全社' })).not.toThrow();
    expect(() => duplicateActualMessage('実績', bad)).not.toThrow();
  });

  it('★ 天井は同一性の側に通さない —— 64 文字を超えて初めて違う 2 つは別の鍵', () => {
    const a = { period: '2026-04', unit: 'x'.repeat(MAX_KPI_UNIT_CHARS) + 'A' } as KpiActual;
    const b = { period: '2026-04', unit: 'x'.repeat(MAX_KPI_UNIT_CHARS) + 'B' } as KpiActual;
    expect(actualKey(a)).not.toBe(actualKey(b));
    // 画面に出す文のほうは切る (入口の数なので、正当な事業名は 1 字も変わらない)。
    const note = duplicateActualsNote('実績', findDuplicateActuals([a, a]));
    expect(note).not.toBeNull();
    expect(note!.length).toBeLessThan(400);
    expect(note).toContain('…');
  });

  it('★ 期が非文字列でも重複の並べ替えで投げない (罠の除去)', () => {
    const bad = { ...GOOD, period: 42 } as unknown as KpiActual;
    const groups = findDuplicateActuals([bad, bad, { ...GOOD } as KpiActual, { ...GOOD } as KpiActual]);
    expect(groups).toHaveLength(2);
    // 鍵は生の期を使うので、42 と '2026-04' は別の組のまま (無い重複を主張しない)。
    expect(groups.map((g) => g.period).sort()).toEqual(['', '2026-04']);
  });

  it('★ 素の `.unit.trim()` は 1 つも残っていない (読みは kpiUnitText へ寄せた)', () => {
    const src = stripNonCode(readOriginalSource(path.join(__dirname, '..', '..', 'data', 'kpiActuals.ts')));
    // 入口 (`parseKpiActual` の `input.unit.trim()`) は**そこで型を見る**のが正しいので外す。
    const RAW_READ = /(?<!input)\.unit\.trim\(/;
    expect(src).not.toMatch(RAW_READ);
    // 針が的に当たること —— 直す前の形そのものを標本にする。
    expect('  return `${a.period}|${a.unit.trim()}`;').toMatch(RAW_READ);
    // 逆向き: 入口の形は針に当たらない (外し方が広すぎない)。
    expect("  const unit = typeof input.unit === 'string' ? input.unit.trim() : '';").not.toMatch(RAW_READ);
    // 読みの口そのものは在る (走査が「何も無い」で空虚に通らない)。
    expect(src).toMatch(/export function kpiUnitText\(/);
  });
});
