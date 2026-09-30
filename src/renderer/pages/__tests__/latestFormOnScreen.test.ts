/** @vitest-environment jsdom */
/**
 * **最新の 1 件を採用する設定の欄は、保存値で開き、1 欄の保存で他の欄を戻さない** (2026-09-28 · パス 500)。
 *
 * 直す前の実測 (実 chromium・同じ `file://` を 5 回開く): 経営サマリーの水耕栽培の欄は **5 回とも既定値**で開き、
 * 販売単価だけ直して保存すると**保存していた 4 欄が既定値へ黙って戻った**。しきい値の欄は 5 回のうち 2 回が既定値。
 * このファイルは実物の画面で、その 4 つの欄 (水耕栽培の設定・しきい値・提出者情報・運転の設定) と品目一覧を押す。
 *
 * 「保管層が答える前」は時刻ではなく**門**で作る (その collection の最初の `list` を待たせる)。
 * 「別のタブ」は保管層へ直接書いて作る —— 知らせは同じタブにも届くので、欄が付いていくかどうかを測れる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { latestRecord } from '../../data/latestRecord';
import { HYDROPONICS_COLLECTION, HYDROPONICS_DEFAULTS, HYDROPONIC_CROPS_COLLECTION, type HydroponicsSetup } from '../../data/hydroponicsSetup';
import { HIGHLIGHT_SETTINGS_COLLECTION } from '../../data/highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../../data/managementHighlights';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { BANK_SUBMISSION_COLLECTION } from '../../data/bankSubmission';
import { HYDROPONICS_BATCHES_COLLECTION, HYDROPONICS_CONTROL_COLLECTION, HYDROPONICS_CONTROL_DEFAULTS } from '../../data/hydroponicsLog';
import { _resetNavigationIntentForTests, navigateTo } from '../../navigate';
import { DEFAULT_CROP_LIST } from '../../../shared/hydroponicCrops';

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

const SAVED: HydroponicsSetup = {
  ...HYDROPONICS_DEFAULTS,
  floorAreaSqm: 555,
  tiers: 7,
  unitPriceYen: 222,
  laborYenPerMonth: 1_234_567,
  rentYenPerMonth: 99_999,
};
const ACTUAL: KpiActual = { period: '2026-04', unit: '全社', revenue: 920_000, cogs: 300_000, advertising: 50_000, sga: 200_000, depreciation: 10_000 };

let container: HTMLDivElement;
let root: Root | null = null;
const releases: (() => void)[] = [];
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  for (const r of releases.splice(0)) r();
  vi.restoreAllMocks();
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

function holdFirstList(collection: string): void {
  const store = getRecordStore();
  const original = store.list.bind(store);
  let held = false;
  let open: () => void = () => {};
  const gate = new Promise<void>((r) => {
    open = r;
  });
  releases.push(() => open());
  vi.spyOn(store, 'list').mockImplementation((async (c: string) => {
    if (c === collection && !held) {
      held = true;
      await gate;
    }
    return original(c);
  }) as typeof store.list);
}

async function mountPage(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`service ${id} missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
}

const input = (label: string): HTMLInputElement => {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`input ${label} not found`);
  return el;
};

async function type(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(label: string): Promise<void> {
  const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.trim() === label);
  if (!b) throw new Error(`button ${label} not found`);
  await act(async () => {
    b.click();
  });
}

async function latestOf<T extends Record<string, unknown>>(collection: string): Promise<T | undefined> {
  return latestRecord(await getRecordStore().list<T>(collection))?.data;
}

describe('経営サマリーの水耕栽培の欄 (パス 500)', () => {
  it('★ 保管層が答える前は欄を出さず、答えたら保存値で開く (直す前は既定値で開いた)', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, SAVED);
    holdFirstList(HYDROPONICS_COLLECTION);
    await mountPage('overview');
    await waitForElement(() => container.querySelector('[data-latest-form-loading="hydroponics-setup"]'), '読み込み中の印');
    expect(container.querySelector('input[aria-label="床面積 (m²)"]'), '保管層が答える前に既定値の欄を出した').toBeNull();
    for (const r of releases.splice(0)) r();
    await waitForElement(() => container.querySelector('input[aria-label="床面積 (m²)"]'), '床面積の欄');
    expect(input('床面積 (m²)').value).toBe('555');
    expect(input('棚の段数').value).toBe('7');
    expect(input('販売単価 (円/株)').value).toBe('222');
    expect(input('人件費 (円/月)').value).toBe('1234567');
    expect(input('地代家賃 (円/月)').value).toBe('99999');
  });

  it('★ 1 欄だけ直して保存しても、他の欄は保存値のまま (直す前は 4 欄が既定値へ戻った)', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, SAVED);
    await mountPage('overview');
    await waitForElement(() => container.querySelector('input[aria-label="販売単価 (円/株)"]'), '販売単価の欄');
    await type(input('販売単価 (円/株)'), '300');
    await click('保存して経営サマリーへ反映');
    await waitForText(text, '保存しました。経営サマリーに反映されています。');
    expect(await latestOf<HydroponicsSetup>(HYDROPONICS_COLLECTION)).toEqual({ ...SAVED, unitPriceYen: 300 });
  });

  it('★ 欄を開いた後に別の画面が保存していたら、書かずに断り、入力を残す。もう一度押せば上書きする', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, SAVED);
    await mountPage('overview');
    await waitForElement(() => container.querySelector('input[aria-label="販売単価 (円/株)"]'), '販売単価の欄');
    await type(input('販売単価 (円/株)'), '300');
    await act(async () => {
      await getRecordStore().insert(HYDROPONICS_COLLECTION, { ...SAVED, laborYenPerMonth: 2_000_000 }); // 別のタブ
    });
    await click('保存して経営サマリーへ反映');
    await waitForText(text, 'この欄を開いた後に別の画面で保存し直されています');
    expect((await latestOf<HydroponicsSetup>(HYDROPONICS_COLLECTION))?.laborYenPerMonth, '別の画面の保存を古い欄で覆った').toBe(2_000_000);
    expect(input('販売単価 (円/株)').value, '断ったのに入力を捨てた').toBe('300');
    await click('保存して経営サマリーへ反映');
    await settleUntilAsync(async () => (await latestOf<HydroponicsSetup>(HYDROPONICS_COLLECTION))?.unitPriceYen === 300, '2 度目は上書きする');
  });

  it('★ 「保存した内容を読み込む」は入力を捨てて、今の保存値から開き直す', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, SAVED);
    await mountPage('overview');
    await waitForElement(() => container.querySelector('input[aria-label="販売単価 (円/株)"]'), '販売単価の欄');
    await type(input('販売単価 (円/株)'), '300');
    await act(async () => {
      await getRecordStore().insert(HYDROPONICS_COLLECTION, { ...SAVED, laborYenPerMonth: 2_000_000 });
    });
    await click('保存して経営サマリーへ反映');
    await waitForText(text, 'この欄を開いた後に別の画面で保存し直されています');
    await click('保存した内容を読み込む');
    expect(input('販売単価 (円/株)').value).toBe('222');
    expect(input('人件費 (円/月)').value).toBe('2000000');
    expect(text()).not.toContain('この欄を開いた後に別の画面で保存し直されています');
  });

  it('★ 触っていない欄は、別の画面の保存に付いていく', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, SAVED);
    await mountPage('overview');
    await waitForElement(() => container.querySelector('input[aria-label="人件費 (円/月)"]'), '人件費の欄');
    await act(async () => {
      await getRecordStore().insert(HYDROPONICS_COLLECTION, { ...SAVED, laborYenPerMonth: 2_000_000 });
    });
    await settleUntil(() => input('人件費 (円/月)').value === '2000000', '触っていない欄が別の画面の保存に付いていく');
  });
});

describe('経営ハイライトのしきい値の欄 (パス 500)', () => {
  it('★ 保存値で開く —— 予算未達の欄が無い古い控え (パス 493c より前) は既定値で開き「undefined」と出さない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACTUAL);
    const old = { declineWarnStreak: 3, declineCriticalStreak: 4, laborShareWarnPct: 61, singleChannelWarnPct: 61 };
    await getRecordStore().insert(HIGHLIGHT_SETTINGS_COLLECTION, old);
    holdFirstList(HIGHLIGHT_SETTINGS_COLLECTION);
    await mountPage('overview');
    await waitForElement(() => container.querySelector('[data-latest-form-loading="highlight-settings"]'), '読み込み中の印');
    expect(container.querySelector('input[data-threshold]'), '保管層が答える前に既定値の欄を出した').toBeNull();
    for (const r of releases.splice(0)) r();
    await waitForElement(() => container.querySelector('input[data-threshold="declineWarnStreak"]'), 'しきい値の欄');
    const v = (k: string): string | undefined => container.querySelector<HTMLInputElement>(`input[data-threshold="${k}"]`)?.value;
    expect(v('declineWarnStreak')).toBe('3');
    expect(v('laborShareWarnPct')).toBe('61');
    expect(v('budgetShortfallWarnPct'), '古い控えに無い欄に undefined と出した').toBe(String(DEFAULT_HIGHLIGHT_THRESHOLDS.budgetShortfallWarnPct));
  });
});

describe('提出者情報の欄 (パス 500)', () => {
  it('★ 書面を開いた状態で来ても、保存値が届いてから欄を出し、1 欄の保存で他の欄を消さない', async () => {
    await getRecordStore().insert(BANK_SUBMISSION_COLLECTION, {
      profile: { companyName: '株式会社テスト', representative: '代表 太郎', address: '東京都', fiscalYearEnd: '2026-03' },
      format: { unit: 'thousand', negative: 'triangle', rounding: 'truncate', era: 'reiwa' },
    });
    holdFirstList(BANK_SUBMISSION_COLLECTION);
    navigateTo('overview', { action: 'bank-sheet' });
    await mountPage('overview');
    await waitForElement(() => container.querySelector('[data-latest-form-loading="bank-submission-settings"]'), '読み込み中の印');
    expect(container.querySelector('input[aria-label="所在地"]')).toBeNull();
    for (const r of releases.splice(0)) r();
    await waitForElement(() => container.querySelector('input[aria-label="所在地"]'), '所在地の欄');
    expect(input('商号').value).toBe('株式会社テスト');
    await type(input('所在地'), '大阪府');
    await click('提出者情報を保存');
    await waitForText(text, '保存しました。書面に反映されています。');
    const now = await latestOf<{ profile: Record<string, string> }>(BANK_SUBMISSION_COLLECTION);
    expect(now?.profile).toEqual({ companyName: '株式会社テスト', representative: '代表 太郎', address: '大阪府', fiscalYearEnd: '2026-03' });
  });

  it('★ 書式の変更は今の最新に当てる —— 保存されている提出者情報を消さず、同じ画面の次の保存も断らない', async () => {
    await getRecordStore().insert(BANK_SUBMISSION_COLLECTION, {
      profile: { companyName: '株式会社テスト', representative: '代表 太郎', address: '東京都', fiscalYearEnd: '2026-03' },
      format: { unit: 'thousand', negative: 'triangle', rounding: 'truncate', era: 'reiwa' },
    });
    navigateTo('overview', { action: 'bank-sheet' });
    await mountPage('overview');
    await waitForElement(() => container.querySelector('input[aria-label="所在地"]'), '所在地の欄');
    await type(input('所在地'), '大阪府');
    const unit = container.querySelector<HTMLSelectElement>('select[aria-label="表示単位"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(unit, 'yen');
      unit.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settleUntilAsync(async () => (await latestOf<{ format: { unit: string } }>(BANK_SUBMISSION_COLLECTION))?.format.unit === 'yen', '書式が保存される');
    const afterFormat = await latestOf<{ profile: Record<string, string> }>(BANK_SUBMISSION_COLLECTION);
    expect(afterFormat?.profile.companyName, '書式の変更が提出者情報を消した').toBe('株式会社テスト');
    await click('提出者情報を保存');
    await waitForText(text, '保存しました。書面に反映されています。');
    const now = await latestOf<{ profile: Record<string, string>; format: { unit: string } }>(BANK_SUBMISSION_COLLECTION);
    expect(now?.profile.address).toBe('大阪府');
    expect(now?.format.unit, '提出者情報の保存が書式を古い値へ戻した').toBe('yen');
  });
});

describe('水耕栽培の運転の設定 (パス 500)', () => {
  it('★ 保管層が答えるまで「設定を変更」は押せず、開くと保存値が入っている', async () => {
    await getRecordStore().insert(HYDROPONICS_CONTROL_COLLECTION, { ...HYDROPONICS_CONTROL_DEFAULTS, tankLiters: 321 });
    holdFirstList(HYDROPONICS_CONTROL_COLLECTION);
    await mountPage('hydroponics');
    const open = await waitForElement(() => container.querySelector<HTMLButtonElement>('button[data-hydroponics-edit-control]'), '設定を変更');
    expect(open.disabled, '保管層が答える前に、既定値の欄を開けた').toBe(true);
    for (const r of releases.splice(0)) r();
    await settleUntil(() => !open.disabled, '保管層が答える');
    await act(async () => {
      open.click();
    });
    const tank = await waitForElement(
      () => container.querySelector<HTMLInputElement>('[data-hydroponics-control-field="tankLiters"] input'),
      'タンク容量の欄',
    );
    expect(tank.value).toBe('321');
  });

  it('★ 開いた後に別の画面が保存していたら、書かずに断る (入力は残る)', async () => {
    await getRecordStore().insert(HYDROPONICS_CONTROL_COLLECTION, { ...HYDROPONICS_CONTROL_DEFAULTS, tankLiters: 321 });
    await mountPage('hydroponics');
    const open = await waitForElement(() => container.querySelector<HTMLButtonElement>('button[data-hydroponics-edit-control]:not([disabled])'), '設定を変更');
    await act(async () => {
      open.click();
    });
    const tank = await waitForElement(() => container.querySelector<HTMLInputElement>('[data-hydroponics-control-field="tankLiters"] input'), 'タンク容量の欄');
    await type(tank, '400');
    await act(async () => {
      await getRecordStore().insert(HYDROPONICS_CONTROL_COLLECTION, { ...HYDROPONICS_CONTROL_DEFAULTS, tankLiters: 321, acidNormality: 2 }); // 別のタブ
    });
    await click('設定を保存');
    await waitForText(text, 'この欄を開いた後に別の画面で保存し直されています');
    const now = await latestOf<{ tankLiters: number; acidNormality: number }>(HYDROPONICS_CONTROL_COLLECTION);
    expect(now?.acidNormality, '別の画面の保存を古い欄で覆った').toBe(2);
    expect(container.querySelector<HTMLInputElement>('[data-hydroponics-control-field="tankLiters"] input')?.value).toBe('400');
  });
});

describe('品目の一覧 (パス 500 —— 今の最新に当て直す)', () => {
  it('★ 足す直前に別の画面が品目を足していても、その品目を消さない (当て直す)', async () => {
    await mountPage('overview');
    await waitForElement(() => container.querySelector('input[aria-label="品目名"]'), '品目名の欄');
    const store = getRecordStore();
    const original = store.insertIfLatest.bind(store);
    let fired = false;
    vi.spyOn(store, 'insertIfLatest').mockImplementation((async (...args: Parameters<typeof store.insertIfLatest>) => {
      if (!fired && args[0] === HYDROPONIC_CROPS_COLLECTION) {
        fired = true;
        // 読み直しの後・書く前に、別のタブが品目を足す。
        await original(HYDROPONIC_CROPS_COLLECTION, null, { crops: [...DEFAULT_CROP_LIST, { ...DEFAULT_CROP_LIST[0]!, id: 'custom-9', label: 'ミズナ' }] });
      }
      return original(...args);
    }) as typeof store.insertIfLatest);
    await type(input('品目名'), 'ルッコラ');
    await click('この品目を足す');
    await waitForText(text, '「ルッコラ」を足して品目に選びました');
    const now = await latestOf<{ crops: { label: string }[] }>(HYDROPONIC_CROPS_COLLECTION);
    const labels = now?.crops.map((c) => c.label) ?? [];
    expect(labels, '別の画面で足した品目が消えた').toContain('ミズナ');
    expect(labels).toContain('ルッコラ');
  });
});

describe('品目の一覧が届く前に、保存した品目を解かない (パス 500)', () => {
  it('★ 水耕栽培の欄は品目の一覧も待つ —— 自分の品目で保存した設定が、参考値の先頭の品目へ化けない', async () => {
    const mizuna = { ...DEFAULT_CROP_LIST[0]!, id: 'custom-1', label: 'ミズナ' };
    await getRecordStore().insert(HYDROPONIC_CROPS_COLLECTION, { crops: [mizuna, ...DEFAULT_CROP_LIST] });
    await getRecordStore().insert(HYDROPONICS_COLLECTION, { ...SAVED, cropId: 'custom-1' });
    holdFirstList(HYDROPONIC_CROPS_COLLECTION);
    await mountPage('overview');
    await waitForElement(() => container.querySelector('[data-latest-form-loading="hydroponics-setup"]'), '読み込み中の印');
    expect(container.querySelector('select[aria-label="品目"]'), '品目の一覧が届く前に品目の欄を出した').toBeNull();
    for (const r of releases.splice(0)) r();
    const select = await waitForElement(() => container.querySelector<HTMLSelectElement>('select[aria-label="品目"]'), '品目の欄');
    expect(select.value).toBe('custom-1');
    await type(input('販売単価 (円/株)'), '300');
    await click('保存して経営サマリーへ反映');
    await waitForText(text, '保存しました。経営サマリーに反映されています。');
    expect((await latestOf<HydroponicsSetup>(HYDROPONICS_COLLECTION))?.cropId, '保存した品目が参考値の先頭へ化けた').toBe('custom-1');
  });

  it('★ ロットの品目は、選んで見せている品目で保存する (最初の描画の一覧の先頭を焼き付けない)', async () => {
    // 参考値の先頭 (リーフレタス) を消した一覧。
    const mine = DEFAULT_CROP_LIST.slice(1);
    await getRecordStore().insert(HYDROPONIC_CROPS_COLLECTION, { crops: mine });
    await mountPage('hydroponics');
    const save = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('button[data-hydroponics-save="batch"]:not([disabled])'),
      'ロットを追加 (一覧が届いた後)',
    );
    const select = container.querySelector<HTMLSelectElement>('select[data-hydroponics-input="batch-crop"]')!;
    expect(select.value).toBe(mine[0]!.id);
    await type(container.querySelector<HTMLInputElement>('input[data-hydroponics-input="batch-id"]')!, 'L1');
    await type(container.querySelector<HTMLInputElement>('input[data-hydroponics-input="batch-panels"]')!, '4');
    await act(async () => {
      save.click();
    });
    await waitForText(text, 'ロット "L1" を追加しました');
    const rows = await getRecordStore().list<{ cropId: string }>(HYDROPONICS_BATCHES_COLLECTION);
    expect(rows.map((r) => r.data.cropId), '一覧に無い品目 (参考値の先頭) でロットを作った').toEqual([mine[0]!.id]);
    expect(text()).not.toContain('見つかりません');
  });

  it('★ ロットの追加は、品目の一覧が届くまで押せない', async () => {
    holdFirstList(HYDROPONIC_CROPS_COLLECTION);
    await mountPage('hydroponics');
    const save = await waitForElement(() => container.querySelector<HTMLButtonElement>('button[data-hydroponics-save="batch"]'), 'ロットを追加');
    expect(save.disabled, '品目の一覧が届く前に、参考値の品目でロットを作れる').toBe(true);
    for (const r of releases.splice(0)) r();
    await settleUntil(() => !save.disabled, '一覧が届くと押せる');
  });
});
