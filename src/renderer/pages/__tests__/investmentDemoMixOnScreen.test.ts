/** @vitest-environment jsdom */
/**
 * **合計に同梱の見本が混ざっていることを、画面が言う** (2026-09-12 · パス 187)。
 *
 * 不動産・投資信託のタイルは「snapshot の見本 + 自分の記録」を 1 本のリストで
 * 集計する。見本は桁で勝つので、自分の分は合計の中で見えなくなる。実測:
 *
 * | | 合計 (見本を含む) | 自分の分 |
 * | --- | ---: | ---: |
 * | 家賃収入 (月) | ¥913,000 | ¥90,000 |
 * | 月次キャッシュフロー | +¥248,000 | +¥5,000 |
 * | 投資信託 評価額 | ¥8,340,140 | ¥100,000 |
 * | 投資信託 評価損益率 | +14.6% | +5.3% |
 * | 実質コスト 5年累計 | ¥594,505 | ¥7,128 |
 *
 * 最後の行が一番効く —— 「実質コスト」は `totalValuation` を**元本として**
 * コストを複利で積むので、自分の 10 万に対し 83 倍の負担を刷っていた
 * (画面の既定: 信託報酬 1.0% / 隠れコスト 0.2% / 想定年率 5% / 保有 5 年)。
 *
 * 合計は消さない (一覧の見本の行と釣り合う)。**並べて述べる**。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { HOLDINGS_COLLECTION, PROPERTIES_COLLECTION } from '../../data/investments';
import { SHIGYO_CONTACTS_COLLECTION } from '../../data/shigyoDirectory';
import { SNAPSHOT } from '../../data/snapshot';
import type { ServiceId } from '../../../shared/serviceId';

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

async function mountPage(id: ServiceId): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** 指定の目印の要素の文字 (改行・連続空白を畳んだもの)。無ければ null。 */
const noteText = (marker: string): string | null => {
  const el = container.querySelector(`[${marker}]`);
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
};

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

const demoProps = SNAPSHOT.realEstate.properties.length;
const demoHoldings = SNAPSHOT.mutualFunds.holdings.length;

describe('不動産投資 — 合計に見本が混ざっていることを画面が言う', () => {
  it('★ 何も登録していないとき「見本を表示している」と述べる', async () => {
    await mountPage('real-estate');
    const t = noteText('data-portfolio-demo-mix');
    expect(t).not.toBeNull();
    expect(t).toContain(`同梱の見本 ${demoProps} 件を表示しています`);
    expect(t).toContain('自分の物件はまだ登録されていません');
  });

  it('★ 自分の物件を 1 件登録すると、自分の分の家賃と手残りを述べる', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, {
      name: '自分の物件', type: '区分所有',
      monthlyRent: 90_000, purchasePrice: 20_000_000, occupied: true,
      monthlyExpenses: 30_000, monthlyLoan: 55_000,
    });
    await mountPage('real-estate');
    const t = noteText('data-portfolio-demo-mix');
    expect(t).not.toBeNull();
    expect(t).toContain(`同梱の見本 ${demoProps} 件が含まれています`);
    expect(t).toContain('自分の物件は 1 件');
    // 自分の分 (¥90,000 / +¥5,000) —— 合計のタイルは ¥913,000 / +¥248,000 を刷る。
    expect(t).toContain('¥90,000');
    expect(t).toContain('¥5,000');
    // 対照: 合計の側は変えていない (タイルに ¥913,000 が在る)。
    const all = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(all).toContain('¥913,000');
  });

  it('★ 対照: 断りは合計の数字をそのまま繰り返さない (自分の分を述べている)', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, {
      name: '自分の物件', type: '区分所有',
      monthlyRent: 90_000, purchasePrice: 20_000_000, occupied: true,
      monthlyExpenses: 30_000, monthlyLoan: 55_000,
    });
    await mountPage('real-estate');
    const t = noteText('data-portfolio-demo-mix') ?? '';
    // 断りが**在る**ことを先に言う —— 無い断りは not.toContain を無条件に通す。
    expect(t).toContain('自分の物件は 1 件');
    expect(t).not.toContain('¥913,000');
    expect(t).not.toContain('¥248,000');
    // 対照: この 2 つは画面には在る (not.toContain が綴り違いで黙る空検査でないこと)。
    const all = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(all).toContain('¥913,000');
    expect(all).toContain('¥248,000');
  });
});

describe('投資信託 — 合計に見本が混ざっていることを画面が言う', () => {
  it('★ 何も登録していないとき「見本を表示している」と述べる', async () => {
    await mountPage('mutual-funds');
    const t = noteText('data-fund-demo-mix');
    expect(t).not.toBeNull();
    expect(t).toContain(`同梱の見本 ${demoHoldings} 銘柄を表示しています`);
    // 元本の断りは「自分の銘柄が在る」ときだけ (0 件では出さない)。
    expect(noteText('data-fund-cost-user-only')).toBeNull();
  });

  it('★ 自分の銘柄を 1 件登録すると、自分の評価額・損益・損益率を述べる', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, {
      code: 'MINE0001', name: '自分の銘柄',
      valuation: 100_000, acquisitionCost: 95_000, ytdReturnPct: 4,
    });
    await mountPage('mutual-funds');
    const t = noteText('data-fund-demo-mix');
    expect(t).not.toBeNull();
    expect(t).toContain(`同梱の見本 ${demoHoldings} 銘柄が含まれています`);
    expect(t).toContain('自分の銘柄は 1 銘柄');
    expect(t).toContain('¥100,000');
    expect(t).toContain('¥5,000');
    expect(t).toContain('5.3%');
    // 対照: 合計のタイルは変えていない。
    expect((container.textContent ?? '').replace(/\s+/g, ' ')).toContain('¥8,340,140');
  });

  it('★ 実質コストの元本に見本が入っていることを述べ、自分の分の額も出す (83 倍)', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, {
      code: 'MINE0001', name: '自分の銘柄',
      valuation: 100_000, acquisitionCost: 95_000, ytdReturnPct: 4,
    });
    await mountPage('mutual-funds');
    const t = noteText('data-fund-cost-user-only');
    expect(t).not.toBeNull();
    expect(t).toContain(`同梱の見本 ${demoHoldings} 銘柄が含まれています`);
    expect(t).toContain('見本を除く元本 ¥100,000');
    // 既定の入力 (信託報酬 1.0% / 隠れ 0.2% / 想定年率 5% / 保有 5 年) での実測。
    expect(t).toContain('¥1,200');
    expect(t).toContain('¥7,128');
    // 合計の側 (¥594,505) は節の中に残っている —— 消していない。
    const all = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(all).toContain('¥594,505');
  });

  it('★ 対照: 自分の銘柄が無ければ元本の断りは出ない (常に出る文ではない)', async () => {
    await mountPage('mutual-funds');
    expect(noteText('data-fund-cost-user-only')).toBeNull();
    expect((container.textContent ?? '')).toContain('を元本とし');
  });
});

/**
 * 士業コンソールは 8 画面で共有されている —— 見出しの「連携 N 名 · 顧問料 ¥X/月」が
 * 見本と自分の登録を混ぜ、顧問料は snapshot の値である (この画面は連携先ごとの
 * 顧問料を持たない)。一覧の行には「デモ」の印が在ったが、見出しには無かった。
 */
describe('士業コンソール — 見出しの数と顧問料の出所を言う', () => {
  it('★ 何も登録していないとき「見本です」と述べる (税理士)', async () => {
    await mountPage('tax-accountant');
    const t = noteText('data-shigyo-demo-mix');
    expect(t).not.toBeNull();
    expect(t).toContain('表示中の連携先 1 名と月次顧問料 ¥33,000 は同梱の見本です');
    expect(t).toContain('自分の連携先はまだ登録されていません');
  });

  it('★ 自分の連携先を 1 名登録すると、見出しの内訳と顧問料の出所を述べる', async () => {
    await getRecordStore().insert(SHIGYO_CONTACTS_COLLECTION, {
      serviceId: 'tax-accountant', name: '自分の税理士', firm: '', phone: '', email: '',
    });
    await mountPage('tax-accountant');
    const t = noteText('data-shigyo-demo-mix');
    expect(t).not.toBeNull();
    expect(t).toContain('「連携 2 名」には同梱の見本 1 名が含まれています');
    expect(t).toContain('自分が登録した連携先は 1 名');
    expect(t).toContain('月次顧問料 ¥33,000 は見本の値です');
    // 対照: 見出しそのものは変えていない。
    expect((container.textContent ?? '').replace(/\s+/g, ' ')).toContain('連携 2 名');
  });

  it('★ 8 士業のどれでも出る (共有部品なので 1 つ直せば全部に効くこと)', async () => {
    for (const id of ['labor-consultant', 'lawyer'] as const) {
      await mountPage(id);
      expect(noteText('data-shigyo-demo-mix'), id).not.toBeNull();
      if (root) {
        await act(async () => { root!.unmount(); });
        root = null;
      }
    }
  });
});
