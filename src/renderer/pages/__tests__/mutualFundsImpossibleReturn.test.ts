/** @vitest-environment jsdom */
/**
 * **在り得ない年初来リターン (元本を超える損失) を、集約・文章・一覧のどこにも
 * 実在の損失として通さない。** (2026-09-14 · パス 226)
 *
 * `parseHoldingEntry` は年初来リターンに **−100〜1000%** を強制する。復元の入口
 * (`normalizeHolding` / `collectionShapes`) は「有限の数値か null」しか見ない ——
 * パス 224 の借用 census が `mutualfund-holdings:ytdReturnPct` を **`per-field`
 * (意図された差)** と裁定した組で、古い版・手で直した JSON・別の道具が書いた控えは
 * 範囲外の値を持ち込める。
 *
 * ## 帯の両端は、同じ種類の規則ではない
 *
 * - **上端 (1000%) は打ち間違いの門。** 集中投資の投信が 1 年で 10 倍になることは
 *   実際に在りうるので、読む側で落とすと**測った値を捨てる**。
 * - **下端 (−100%) は事実。** 買いのみの投資信託で元本を超えて失うことはない
 *   (−100% ちょうどは「全額失った」で在りうるので、規則は厳密に `< -100`)。
 *
 * ## 実測 (直す前・見本 4 銘柄に −250% を 1 件混ぜた時)
 *
 * | 面 | 出ていた物 |
 * | --- | --- |
 * | 一覧のセル | `-250.0%` を**赤** —— 実在の大損と同じ顔 |
 * | リスク (標準偏差) | 4.04% → **103.87%**。注記は「入力された 5 銘柄の母標準偏差」だけ |
 * | 改善提案 | 「年初来マイナスの銘柄: X —— X は年初来 **-250.0%** です。…保有目的を確認してください」 |
 *
 * セルは目に見えるが、あとの 2 面は**派生した集約・文章の中で在り得ない 1 行が見えなくなる**。
 *
 * ここは**実物の画面**で 3 面を読む。値は書き手が断るので、フォームからは入れられない ——
 * 復元と同じ道 (record store へ直接 insert) で入れる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MutualFundsPage } from '../MutualFundsPage';
import { SNAPSHOT } from '../../data/snapshot';
import { getRecordStore, _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { HOLDINGS_COLLECTION } from '../../data/investments';
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

/**
 * 改善提案の出力だけを取る (一覧のセルと混ぜない)。
 *
 * **一覧が `⛔ -250.0%` を刷るのは直した後の姿である** —— 行が消えたら、利用者は
 * どの銘柄を直せばよいか分からない。禁じたいのは**提案の文が -250.0% を実在の
 * リターンとして語ること**なので、面を分けて読む。
 */
function adviceText(): string {
  const blocks = Array.from(container.querySelectorAll('div')).filter(
    (el) => (el.textContent ?? '').includes('根拠:') && (el.textContent ?? '').includes('投資助言ではありません'),
  );
  const smallest = blocks.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
  if (!smallest) throw new Error('advice block not found');
  const out = (smallest.textContent ?? '').replace(/\s+/g, ' ');
  // 枠を取り違えていないこと (画面全体を読んでいたら、この検査は何も絞っていない)
  if (out.includes('基準価額')) throw new Error(`advice block is too wide: ${out.slice(0, 200)}`);
  return out;
}

/** 一覧でファンド名を含む行の、YTD 列 (6 列目) のセル。 */
function ytdCell(name: string): HTMLTableCellElement {
  const row = Array.from(container.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(name));
  if (!row) throw new Error(`row "${name}" not found`);
  const cells = row.querySelectorAll('td');
  const cell = cells[5];
  if (!cell) throw new Error(`row "${name}" has no YTD cell`);
  return cell;
}

/**
 * **復元と同じ道で 1 件置く。** 書き手 (`parseHoldingEntry`) は −250 を断るので、
 * フォームからは入れられない —— 形の検証 (`collectionShapes`) は「有限の数値か null」
 * しか見ないので、この値は復元・古い版・手で直した JSON から入ってくる。
 */
async function seedHolding(name: string, ytdReturnPct: number): Promise<void> {
  await getRecordStore().insert(HOLDINGS_COLLECTION, {
    code: '',
    name,
    units: 300_000,
    navPerUnit: 10_000,
    valuation: 300_000,
    valuationMode: 'auto',
    acquisitionCost: 300_000,
    ytdReturnPct,
  });
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

describe('投資信託 — 在り得ない年初来リターン (元本超の損失)', () => {
  it('★ 一覧のセルは ⛔ を付け、実在の大損 (赤) と同じ顔にしない', async () => {
    await seedHolding('復元ファンド', -250);
    await mount();
    const cell = ytdCell('復元ファンド');
    expect(cell.textContent?.trim()).toBe('⛔ -250.0%');
    expect(cell.getAttribute('title')).toContain('在り得ない値');
    expect(cell.getAttribute('title')).toContain('元本を超えて失うことはありません');
    expect(cell.style.color).not.toBe('var(--danger)'); // 意味色のトークン (実在の損失の赤) は付けない
    // 対照: 見本の行は今までどおり符号つき・⛔ なし
    const demo = ytdCell('ひふみプラス');
    expect(demo.textContent?.trim()).toBe('+8.7%');
    expect(demo.textContent).not.toContain('⛔');
  });

  it('★ リスク (標準偏差) は在り得ない値を除いた 4 銘柄で取り、除いた数を言う', async () => {
    await seedHolding('復元ファンド', -250);
    await mount();
    const clean = calcStdDev(demoYtd());
    const withImpossible = calcStdDev([...demoYtd(), -250]);
    expect(clean).not.toBe(withImpossible); // 2 つが同じなら、この検査は何も見ていない
    expect(stat('リスク (銘柄YTDの標準偏差)')).toContain(`${clean}%`);
    expect(stat('リスク (銘柄YTDの標準偏差)')).not.toContain(`${withImpossible}%`);
    expect(text()).toContain('年初来リターンが -100% より下の銘柄が 1 件あります');
    expect(text()).toContain('入力された 4 銘柄の母標準偏差です (在り得ない値 1 銘柄は除外)。');
    const marked = container.querySelector('[data-impossible-returns]');
    expect(marked?.getAttribute('data-impossible-returns')).toBe('1');
  });

  it('★ 改善提案は在り得ない値を「最低」と名指しせず、名指しして断る', async () => {
    await seedHolding('復元ファンド', -250);
    await mount();
    await clickButton('改善提案');
    const advice = adviceText();
    expect(advice).toContain('年初来リターンに在り得ない値: 復元ファンド');
    expect(advice).toContain('年初来リターンが -100% より下の銘柄が 1 件あります');
    expect(advice).not.toContain('年初来マイナスの銘柄');
    // **提案の文は -250.0% を実在のリターンとして語らない** (一覧のセルは ⛔ 付きで刷り続ける)
    expect(advice).not.toContain('-250.0%');
    expect(advice).not.toContain('復元ファンド は年初来');
    expect(text()).not.toContain('提案の取得に失敗');
    // 残った 4 銘柄で比較は続ける (⛔ 1 件で節全体を黙らせない・パス 206 の規準)
    expect(advice).toContain('年初来の牽引役: eMAXIS Slim 米国株式 (S&P500)');
    expect(advice).toContain('最低は eMAXIS Slim 先進国債券インデックス の 3.4%');
    // 一覧の側は ⛔ 付きで 1 度だけ (行が消えたら直せない)
    expect(text().match(/-250\.0%/g)).toHaveLength(1);
    expect(ytdCell('復元ファンド').textContent?.trim()).toBe('⛔ -250.0%');
  });

  it('対照: 下限ちょうど (−100% = 全額失った) は在りうるので、赤・集約・比較に今までどおり入る', async () => {
    await seedHolding('全損ファンド', -100);
    await mount();
    const cell = ytdCell('全損ファンド');
    expect(cell.textContent?.trim()).toBe('-100.0%');
    expect(cell.textContent).not.toContain('⛔');
    expect(cell.style.color).toBe('var(--danger)');
    expect(stat('リスク (銘柄YTDの標準偏差)')).toContain(`${calcStdDev([...demoYtd(), -100])}%`);
    expect(text()).not.toContain('在り得ない値');
    await clickButton('改善提案');
    expect(adviceText()).toContain('年初来マイナスの銘柄: 全損ファンド');
    expect(adviceText()).toContain('全損ファンド は年初来 -100.0% です');
    expect(adviceText()).not.toContain('在り得ない値');
  });

  it('対照: 見本 4 銘柄だけなら、除外の注記も ⛔ の印も出ない', async () => {
    await mount();
    expect(text()).toContain(`入力された ${demoYtd().length} 銘柄の母標準偏差です。`);
    expect(text()).not.toContain('在り得ない値');
    expect(container.querySelector('[data-impossible-returns]')).toBeNull();
  });
});
