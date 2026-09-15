/** @vitest-environment jsdom */
/**
 * **年初来リターンを入力していない銘柄を「+0.0%」と刷らず、0% の銘柄として数えず、
 * 「最低」と名指ししない。** (2026-09-09 · パス 122)
 *
 * `HoldingEntry.ytdReturnPct` はパス 122 まで `number` (「任意、既定 0」) だった。空欄で
 * 足した銘柄は一覧に **「+0.0%」(緑)** と出て、リスク (標準偏差) には 0% の銘柄として
 * 入り、改善提案 (パス 119) は「最低は X の 0.0%」と**入力していない銘柄を最低と名指し**
 * していた。パス 119 は `ytdReturnPct: number | null` の null の枝を書いたが、画面は
 * user 行に null を渡す道が無く、**その枝は画面から届かなかった** (口はあるが繋がって
 * いない —— パス 118 の形)。
 *
 * 規準は同じファイル (`data/investments.ts`) の不動産側に在った —— `grossYieldPct` は
 * `number | null` で、`calcRealEstatePortfolio` は測れない物件を `yieldUnmeasured` に
 * 数えて平均に入れない (パス 54)。
 *
 * ここは**実物の画面**で、一覧の行・リスクの注記・改善提案の 3 面を読む。
 * 純粋関数の検査 (`investments.test.ts` / `mutualFundsMetrics.test.ts`) は値を留めるが、
 * 3 面が同じ空欄から別々の顔をしていたのは画面だった。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MutualFundsPage } from '../MutualFundsPage';
import { SNAPSHOT } from '../../data/snapshot';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { calcStdDev } from '../../../shared/mutualFundsMetrics';
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
  const el = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!el) throw new Error(`input placeholder="${placeholder}" not found`);
  return el;
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

/** 一覧でファンド名を含む行の、YTD 列 (6 列目) のセル。 */
function ytdCell(name: string): HTMLTableCellElement {
  const row = Array.from(container.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(name));
  if (!row) throw new Error(`row "${name}" not found`);
  const cells = row.querySelectorAll('td');
  const cell = cells[5];
  if (!cell) throw new Error(`row "${name}" has no YTD cell`);
  return cell;
}

/** 追加フォームで銘柄を足す。YTD は渡した文字列のまま (空文字なら触らない = 空欄)。 */
async function addHolding(name: string, valuation: string, ytd: string): Promise<void> {
  await act(async () => {
    changeInput(byPlaceholder('例: ニッセイ外国株式'), name);
    changeInput(byPlaceholder('空欄=自動計算'), valuation);
    if (ytd !== '') changeInput(byPlaceholder('空欄=未入力'), ytd);
  });
  await clickButton('＋ 銘柄を追加');
  if (!text().includes(name)) throw new Error(`holding "${name}" was not added: ${text().slice(0, 300)}`);
}

/** 見本 4 銘柄の年初来リターン (画面と同じ出所から取る —— 数を写さない)。 */
const demoYtd = (): number[] => SNAPSHOT.mutualFunds.holdings.map((h) => h.ytdReturnPct);

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

describe('投資信託 — 年初来リターンを入力していない銘柄を 0% として扱わない', () => {
  it('★ 空欄で足した銘柄は一覧で「—」(色なし・未入力の title) で、「+0.0%」ではない', async () => {
    await mount();
    await addHolding('E2Eファンド', '300000', '');
    const cell = ytdCell('E2Eファンド');
    expect(cell.textContent?.trim()).toBe('—');
    expect(cell.textContent).not.toContain('0.0%');
    expect(cell.getAttribute('title')).toContain('未入力');
    expect(cell.style.color).not.toBe('rgb(34, 197, 94)'); // #22c55e (緑) を付けない
    // 見本の行は今までどおり符号つきで刷る (対照)
    expect(ytdCell('ひふみプラス').textContent?.trim()).toBe('+8.7%');
  });

  it('★ リスク (標準偏差) は入力された 4 銘柄だけで取り、注記が「未入力 1 銘柄は除外」と言う', async () => {
    await mount();
    // 対照: 足す前は見本 4 銘柄で、除外の注記は無い
    expect(text()).toContain('入力された 4 銘柄の母標準偏差です。');
    expect(text()).not.toContain('除外');
    await addHolding('E2Eファンド', '300000', '');
    const measuredOnly = calcStdDev(demoYtd());
    const withZero = calcStdDev([...demoYtd(), 0]);
    expect(measuredOnly).not.toBe(withZero); // 2 つが同じなら、この検査は何も見ていない
    expect(stat('リスク (銘柄YTDの標準偏差)')).toContain(`${measuredOnly}%`);
    expect(stat('リスク (銘柄YTDの標準偏差)')).not.toContain(`${withZero}%`);
    expect(text()).toContain('入力された 4 銘柄の母標準偏差です (未入力 1 銘柄は除外)。');
  });

  it('★ 改善提案は入力していない銘柄を「最低」と名指ししない (パス 119 の null の枝が画面から届く)', async () => {
    await mount();
    await addHolding('E2Eファンド', '300000', '');
    await clickButton('改善提案');
    expect(text()).toContain('根拠: 5 銘柄 (同梱の見本 4 件を含む)');
    expect(text()).toContain('年初来の牽引役: eMAXIS Slim 米国株式 (S&P500)');
    expect(text()).toContain('最低は eMAXIS Slim 先進国債券インデックス の 3.4%');
    expect(text()).not.toContain('最低は E2Eファンド');
    expect(text()).not.toContain('E2Eファンド の 0.0%');
    expect(text()).not.toContain('提案の取得に失敗');
  });

  it('対照: 測った 0% を入れれば「+0.0%」と刷り、標準偏差に入り、改善提案も 0.0% の銘柄として比べる', async () => {
    await mount();
    await addHolding('E2Eファンド', '300000', '0');
    expect(ytdCell('E2Eファンド').textContent?.trim()).toBe('+0.0%');
    expect(ytdCell('E2Eファンド').getAttribute('title')).toBeNull();
    expect(stat('リスク (銘柄YTDの標準偏差)')).toContain(`${calcStdDev([...demoYtd(), 0])}%`);
    expect(text()).toContain('入力された 5 銘柄の母標準偏差です。');
    expect(text()).not.toContain('除外');
    await clickButton('改善提案');
    expect(text()).toContain('最低は E2Eファンド の 0.0%');
  });
});
