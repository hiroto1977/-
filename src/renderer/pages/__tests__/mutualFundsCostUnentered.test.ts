/** @vitest-environment jsdom */
/**
 * **取得額を入力していない銘柄を「評価額と同額 (損益 0)」とみなさず、評価損益率を薄めない。**
 * (2026-09-09 · パス 123)
 *
 * `HoldingEntry.acquisitionCost` はパス 123 まで `number` で、型の注記は「空欄は評価額と同額
 * (損益 0) とみなす」。空欄で足した銘柄は**評価額と同じ取得額**として保存され:
 *
 * - 「取得原価」のタイルが、入力していない金額の分だけ増える (見本 ¥7,180,000 → ¥7,480,000)。
 * - 「評価損益率」が薄まる (見本 14.8% → ¥300,000 で 14.2%、¥3,000,000 なら 10.4%)。
 * - トータルリターン (CAGR) と改善提案の「含み益」も同じ薄まった数字を言う。
 * - 編集フォームに、利用者が入力していない取得額 (= 評価額) が入って戻ってくる。
 *
 * パス 119 の `totalCostBasis > 0 ? … : null` の守りは、既定が「評価額と同額」なので取得額を
 * 1 つも入力していなくても届かなかった (パス 122 の年初来リターンと同じ形)。
 *
 * 規準は同じファイルの不動産側 (`grossYieldPct | null` / `yieldUnmeasured`・パス 54) と、
 * 1 つ前のパスで直した隣の欄 (`ytdReturnPct: number | null`・パス 122)。
 *
 * ここは**実物の画面**で、タイル・注記・編集フォーム・改善提案の 4 面を読む。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MutualFundsPage } from '../MutualFundsPage';
import { SNAPSHOT } from '../../data/snapshot';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { jpy } from '../../../shared/formatters';
import { adviseService } from '../../../shared/serviceAdvisor';
import { isRecordEntryServiceId } from '../../../shared/recordEntryLimits';

let container: HTMLDivElement;
let root: Root | null = null;

const FAILING_INVOKE = () => Promise.resolve({ ok: false, code: 'x', message: 'x' });
type Hub = { invoke: (svc: string, act: string, payload: Record<string, unknown>) => Promise<unknown> };
const hub = (): Hub => (globalThis as unknown as { serviceHub: Hub }).serviceHub;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: FAILING_INVOKE,
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MutualFundsPage));
  });
  await settle();
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function byPlaceholder(placeholder: string): HTMLInputElement {
  const all = container.querySelectorAll<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (all.length !== 1) throw new Error(`input placeholder="${placeholder}": expected exactly 1, found ${all.length}`);
  return all[0]!;
}

async function clickButton(label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));
  if (!button) throw new Error(`button "${label}" not found`);
  await act(async () => {
    button.click();
  });
  await settle();
}

/** ラベルで `<Stat>` 1 枚の文字列を取る。 */
function stat(label: string): string {
  const head = Array.from(container.querySelectorAll('div')).find(
    (el) => el.children.length === 0 && el.textContent === label,
  );
  const box = head?.parentElement;
  if (!box) throw new Error(`stat "${label}" not found`);
  return (box.textContent ?? '').replace(/\s+/g, ' ');
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

const COST_PLACEHOLDER = '空欄=未入力 (損益は算定しない)';

/** 追加フォームで銘柄を足す (評価額は手入力・取得額は渡した文字列のまま。空文字なら触らない = 空欄)。 */
async function addHolding(name: string, valuation: string, cost: string): Promise<void> {
  await act(async () => {
    changeInput(byPlaceholder('例: ニッセイ外国株式'), name);
    changeInput(byPlaceholder('空欄=自動計算'), valuation);
    if (cost !== '') changeInput(byPlaceholder(COST_PLACEHOLDER), cost);
  });
  await clickButton('＋ 銘柄を追加');
  if (!text().includes(name)) throw new Error(`holding "${name}" was not added: ${text().slice(0, 300)}`);
}

const demo = SNAPSHOT.mutualFunds.portfolio;

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
  hub().invoke = (svc, act, payload) => {
    if (act === 'advise' && isRecordEntryServiceId(svc)) {
      const r = adviseService(svc, payload);
      return Promise.resolve(r.ok ? { ok: true, data: r.data } : { ok: false, code: 'action_failed', message: r.message });
    }
    return FAILING_INVOKE();
  };
});

afterEach(async () => {
  hub().invoke = FAILING_INVOKE;
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('投資信託 — 取得額を入力していない銘柄を「評価額と同額 (損益 0)」とみなさない', () => {
  it('対照: 見本だけなら取得原価 ¥7,180,000・評価損益率 14.8% で、注記は無い', async () => {
    await mount();
    expect(stat('取得原価')).toContain(jpy(demo.totalCostBasis));
    expect(stat('評価損益率')).toContain(`${demo.unrealizedGainPct.toFixed(1)}%`);
    expect(text()).not.toContain('取得額未入力');
  });

  it('★ 取得額を空欄で足しても、取得原価と評価損益率は動かず、注記が除外を言う', async () => {
    await mount();
    await addHolding('E2Eファンド', '300000', '');
    // 評価額 (全銘柄) には入る
    expect(stat('評価額')).toContain(jpy(demo.totalValuation + 300_000));
    // 取得原価・評価損益率は「取得額が分かる銘柄」だけ —— 旧: ¥7,480,000 / 14.2%
    expect(stat('取得原価')).toContain(jpy(demo.totalCostBasis));
    expect(stat('取得原価')).not.toContain(jpy(demo.totalCostBasis + 300_000));
    expect(stat('評価損益率')).toContain(`${demo.unrealizedGainPct.toFixed(1)}%`);
    expect(stat('評価損益率')).not.toContain('14.2%');
    expect(text()).toContain(`取得額未入力 1 銘柄 (評価額 ${jpy(300_000)}) は取得原価・評価損益・評価損益率・トータルリターンに含めていません`);
  });

  it('★ 編集フォームに、入力していない取得額 (= 評価額) を入れて戻さない', async () => {
    await mount();
    await addHolding('E2Eファンド', '300000', '');
    await clickButton('編集');
    expect(byPlaceholder(COST_PLACEHOLDER).value).toBe('');
    // 評価額 (手入力) はそのまま戻る (対照)
    expect(byPlaceholder('空欄=自動計算').value).toBe('300000');
  });

  it('★ 改善提案の「含み益」も薄まらない (根拠の評価損益率が見本のまま)', async () => {
    await mount();
    await addHolding('E2Eファンド', '300000', '');
    await clickButton('改善提案');
    expect(text()).toContain(`含み益 ${demo.unrealizedGainPct.toFixed(1)}%`);
    expect(text()).toContain(`評価損益率 ${demo.unrealizedGainPct.toFixed(1)}%`);
    expect(text()).not.toContain('含み益 14.2%');
  });

  it('対照: 取得額を入れれば、その銘柄は取得原価・評価損益率に入り、注記は消える', async () => {
    await mount();
    await addHolding('E2Eファンド', '300000', '250000');
    expect(stat('取得原価')).toContain(jpy(demo.totalCostBasis + 250_000));
    const gain = demo.totalValuation + 300_000 - (demo.totalCostBasis + 250_000);
    const pct = Math.round((gain / (demo.totalCostBasis + 250_000)) * 1000) / 10;
    expect(pct).not.toBe(demo.unrealizedGainPct); // 同じなら、この対照は何も見ていない
    expect(stat('評価損益率')).toContain(`${pct.toFixed(1)}%`);
    expect(text()).not.toContain('取得額未入力');
    await clickButton('編集');
    expect(byPlaceholder(COST_PLACEHOLDER).value).toBe('250000');
  });
});
