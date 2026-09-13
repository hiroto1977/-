/** @vitest-environment jsdom */
/**
 * **⛔ で断っている「率」の欄から、金額や年数の答えを作らない** (パス 207)。
 *
 * パス 198 は `MutualFundsPage` の**年数**に天井を入れた (`MAX_PLAN_YEARS` /
 * `MAX_HOLDING_YEARS` と「この節は算定していません」)。**同じ画面の「率」の欄には
 * 何も無かった** —— `信託報酬 (%)` / `隠れコスト (%)` は `max: 20`、
 * `想定年率 (%)` ×3 と `想定インフレ率 (%)` は `max: 100` を宣言して ⛔
 * (`level: 'fatal'` · 赤枠 · `aria-invalid`) を出すのに、計算はその値を読んでいた。
 *
 * 実測 (直す前・999,999,999 を入れた時):
 *
 * | 欄 | タイル | 出ていた物 |
 * | --- | --- | --- |
 * | 信託報酬 / 隠れコスト | 実質コスト率 (年率) | **`999999999.2%`** |
 * | 〃 | 年間コスト概算 | **`¥82,401,399,934,079`** (82 兆円) |
 * | 〃 | N年累計の蝕み効果 | **`¥8.24 × 10^41`** |
 * | 想定年率 | 将来評価額 | **`¥1.06 × 10^163`** |
 * | 〃 | 現行積立での到達見込み | `¥1.06 × 10^98` **(達成)** |
 * | 〃 | 目標達成に必要な毎月積立額 | **`¥0`** |
 * | 〃 | 72の法則 (資産倍増) | **約 0 年** |
 * | 想定インフレ率 | 実質利回り (インフレ調整後) | **`-100%`** |
 * | 保有年数 | 年率換算 (CAGR) | **`0%`** (+15% のポートフォリオが横ばい・赤) |
 *
 * **`¥0` と `約 0 年` と `-100%` と `0%` のほうが危ない。** 10^163 は明らかに変だと
 * 分かるが、`¥0` は「積み立てなくてよい」という**普通の答えの見た目**をしている。
 *
 * CAGR は**パス 198 の取り残し**でもある —— 同じ `保有年数` を読む 2 人のうち
 * `calcRealCost` だけが直され、`calcTotalReturn` は残っていた (パス 66 と同じ形)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'mutual-funds');
  if (!def) throw new Error('mutual-funds service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** `aria-label` の欄すべてに同じ値を入れる (同じラベルが複数節に出る欄がある)。 */
async function typeField(label: string, value: string): Promise<readonly HTMLInputElement[]> {
  const els = Array.from(container.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`));
  if (els.length === 0) throw new Error(`field not found: ${label}`);
  await act(async () => {
    for (const el of els) changeInput(el, value);
  });
  await settle();
  return els;
}

/** `.stat-grid` のタイルを「ラベル → 値」で読む。 */
function tiles(): Map<string, string> {
  const m = new Map<string, string>();
  for (const grid of Array.from(container.querySelectorAll('.stat-grid'))) {
    for (const card of Array.from(grid.children)) {
      const kids = Array.from(card.children);
      const label = (kids[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const value = (kids[1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (label !== '') m.set(label, value);
    }
  }
  return m;
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('投資信託 — ⛔ の率から答えを作らない (パス 207)', () => {
  it('★ 対照: 既定値ではすべての答えが出て、断りは出ない', async () => {
    await mountPage();
    // **標本つきの対照** —— 下の検査は「消えること」を見るので、まず在ることを確かめる。
    const t = tiles();
    expect(t.get('実質コスト率 (年率)')).toBe('1.2%');
    expect(t.get('年率換算 (CAGR)')).toBe('2.85%');
    expect(t.get('将来評価額')).toBe('¥12,174,135');
    expect(t.get('目標達成に必要な毎月積立額')).toBe('¥71,711');
    expect(t.get('72の法則 (資産倍増)')).toBe('約 24 年');
    expect(t.get('実質利回り (インフレ調整後)')).toBe('0.98%');
    expect(text()).not.toContain('は算定していません');
    expect(container.querySelector('input[data-guard="fatal"]')).toBeNull();
  });

  it('★ 信託報酬が上限超過なら、実質コストの 3 欄すべてを出さず欄を名指しする', async () => {
    await mountPage();
    const els = await typeField('信託報酬 (%)', '999999999');
    expect(els[0]?.getAttribute('data-guard')).toBe('fatal');
    const t = tiles();
    expect(t.get('実質コスト率 (年率)')).toBe('—');
    expect(t.get('年間コスト概算')).toBe('—');
    expect(t.get('5年累計の蝕み効果')).toBe('—');
    const body = text();
    expect(body).toContain('信託報酬 (%)は 20% 以下で');
    // **10^41 の金額がタイルに 1 つも残っていない。** (⛔ の文面自身は
    // 「現在 999999999」と入力値を引くので、本文全体ではなくタイルを見る。)
    for (const v of t.values()) expect(v).not.toMatch(/999999999/);
    // 読んでいない節は黙らせない (CAGR は保有年数だけを読む)。
    expect(t.get('年率換算 (CAGR)')).toBe('2.85%');
  });

  it('★ 隠れコストが上限超過でも同じ欄が断り、名指しは隠れコスト側', async () => {
    await mountPage();
    await typeField('隠れコスト (%)', '999999999');
    expect(tiles().get('実質コスト率 (年率)')).toBe('—');
    const body = text();
    expect(body).toContain('隠れコスト (%)は 20% 以下で');
    expect(body).not.toContain('信託報酬 (%)は 20% 以下で');
  });

  it('★ 想定年率が上限超過なら、将来評価額・必要積立額・72の法則が出ない', async () => {
    await mountPage();
    await typeField('想定年率 (%)', '999999999');
    const t = tiles();
    expect(t.get('将来評価額')).toBe('—');
    expect(t.get('累計拠出額')).toBe('—');
    expect(t.get('目標達成に必要な毎月積立額')).toBe('—');
    expect(t.get('72の法則 (資産倍増)')).toBe('—');
    expect(t.get('現行積立での到達見込み')).toBe('—');
    expect(t.get('実質利回り (インフレ調整後)')).toBe('—');
    const body = text();
    expect(body).toContain('想定年率 (%)は 100% 以下で');
    // **「達成」と答えていない** (これがパス 198 が消したはずの形の率版)。
    expect(body).not.toContain('(達成)');
    // **「¥0」の必要積立額も出ていない。**
    expect(t.get('目標達成に必要な毎月積立額')).not.toBe('¥0');
  });

  it('★ 想定インフレ率が上限超過なら、実質価値と実質利回りが出ない (-100% と答えない)', async () => {
    await mountPage();
    await typeField('想定インフレ率 (%)', '999999999');
    const t = tiles();
    expect(t.get('実質利回り (インフレ調整後)')).toBe('—');
    expect(t.get('目標額のインフレ調整後 実質価値')).toBe('—');
    expect(text()).toContain('想定インフレ率 (%)は 100% 以下で');
    // 年率側は範囲内なので名指しに混ざらない。
    expect(text()).not.toContain('想定年率 (%)・想定インフレ率 (%)');
  });

  it('★ 保有年数が上限超過なら CAGR を出さない (パス 198 の取り残し)', async () => {
    await mountPage();
    await typeField('保有年数', '999999999');
    const t = tiles();
    expect(t.get('年率換算 (CAGR)')).toBe('—');
    // トータルリターンは年数に依らないので残る (隣の測れている数字まで隠さない)。
    expect(t.get('トータルリターン')).toBe('15.06%');
    expect(text()).toContain('年率換算 (CAGR) は算定していません');
    expect(text()).toContain('保有年数は 100 年以下で');
  });
});
