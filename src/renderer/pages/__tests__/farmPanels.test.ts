/** @vitest-environment jsdom */
/**
 * 水耕栽培の画面の「養蜂」「養殖」の面 (2026-11-18) —— **実物の record store** (fake-indexeddb) を通して、
 * 押したら保存され・読み直しても残り・概算が保存した入力から出ることを見る。
 * 一覧の増減の規則そのものは `shared/__tests__/farmProductList.test.ts` が持つ。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';
import {
  BEE_PLAN_COLLECTION,
  BEE_PRODUCTS_COLLECTION,
  FISH_PLAN_COLLECTION,
  FISH_SPECIES_COLLECTION,
  type AquaculturePlanRecord,
  type BeeProductListRecord,
  type BeekeepingPlanRecord,
  type FishSpeciesListRecord,
} from '../../data/farmSetup';
import { DEFAULT_BEE_PRODUCTS } from '../../../shared/beekeeping';
import { DEFAULT_FISH_SPECIES } from '../../../shared/aquaculture';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/** React の onChange を発火させる (native setter を通さないと React が拾わない)。 */
function changeValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root | null = null;

const screenText = (): string => container.textContent ?? '';
const one = (selector: string): Element | null => container.querySelector(selector);
const textOf = (selector: string): string => one(selector)?.textContent ?? '';

async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function type(el: HTMLInputElement | HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    changeValue(el, value);
  });
}

function button(text: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === text);
  if (!b) throw new Error(`button "${text}" not found`);
  return b;
}

function input(label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`input "${label}" not found`);
  return el;
}

/** ラベルの文から、`GuardedNumber` の入力欄を引く。 */
function guarded(label: string): HTMLInputElement {
  const host = Array.from(container.querySelectorAll('label')).find((l) => (l.textContent ?? '').startsWith(label));
  const el = host?.querySelector('input');
  if (!el) throw new Error(`guarded input "${label}" not found`);
  return el;
}

/** 画面を描く。開いた面は水耕栽培。 */
async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'hydroponics');
  if (!def) throw new Error('hydroponics service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForElement(() => one('[data-farm-views]'), '面を切り替えるボタン');
}

async function unmountPage(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

/** 養蜂の面を開き、産物の一覧と概算の欄が保管層から届くまで待つ。 */
async function openBeekeeping(): Promise<void> {
  await click(one('[data-farm-view="beekeeping"]')!);
  await waitForElement(() => one('[data-bee-products]'), '産物の一覧');
  await waitForText(screenText, '保存して概算する');
}

/** 養殖の面を開き、魚種の一覧と概算の欄が保管層から届くまで待つ。 */
async function openAquaculture(): Promise<void> {
  await click(one('[data-farm-view="aquaculture"]')!);
  await waitForElement(() => one('[data-fish-water="fresh"]'), '魚種の一覧');
  await waitForText(screenText, '保存して概算する');
}

const noticeText = (): string => textOf('[data-farm-list-notice]');

async function stored<T extends Record<string, unknown>>(collection: string): Promise<readonly T[]> {
  return (await getRecordStore().list<T>(collection)).map((r) => r.data);
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await unmountPage();
  document.body.removeChild(container);
});

describe('面の切り替え', () => {
  it('開いたときは水耕栽培で、3 つの面のボタンが並ぶ', async () => {
    await mountPage();
    expect(textOf('[data-farm-views]')).toBe('水耕栽培養蜂養殖 (海水魚・淡水魚)');
    expect(one('[data-farm-page]')!.getAttribute('data-farm-page')).toBe('hydroponics');
    expect(one('[data-farm-view="hydroponics"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(one('[data-farm-view="beekeeping"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(one('[data-beekeeping-panel]')).toBeNull();
    expect(one('[data-aquaculture-panel]')).toBeNull();
  });

  it('養蜂を押すと養蜂だけ、養殖を押すと養殖だけを出す', async () => {
    await mountPage();
    await openBeekeeping();
    expect(one('[data-farm-page]')!.getAttribute('data-farm-page')).toBe('beekeeping');
    expect(one('[data-farm-view="beekeeping"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(one('[data-beekeeping-panel]')).not.toBeNull();
    expect(one('[data-aquaculture-panel]')).toBeNull();
    await openAquaculture();
    expect(one('[data-aquaculture-panel]')).not.toBeNull();
    expect(one('[data-beekeeping-panel]')).toBeNull();
  });

  it('サイドバーの名前が 3 つの事業を名乗る', () => {
    expect(SERVICES.find((s) => s.id === 'hydroponics')!.label).toBe('水耕栽培・養蜂・養殖');
  });
});

describe('養蜂', () => {
  it('届出の案内と、参考の産物 3 件を出す。概算は保存するまで出さない', async () => {
    await mountPage();
    await openBeekeeping();
    expect(textOf('[data-beekeeping-notice]')).toContain('養蜂振興法');
    expect(textOf('[data-bee-products]')).toContain('百花蜜');
    expect(textOf('[data-bee-products]')).toContain('アカシア蜜');
    expect(textOf('[data-bee-products]')).toContain('蜜蝋');
    expect(screenText()).toContain('置き値');
    expect(one('[data-bee-estimate]')).toBeNull();
    expect(textOf('[data-bee-no-estimate]')).toContain('概算はまだ出していません');
    // 何も押していなければ、保管層に 1 件も書かない
    expect(await stored(BEE_PLAN_COLLECTION)).toEqual([]);
    expect(await stored(BEE_PRODUCTS_COLLECTION)).toEqual([]);
  });

  it('保存すると、保存した入力から年間の収支を出す', async () => {
    await mountPage();
    await openBeekeeping();
    await type(guarded('群数 (群)'), '20');
    await click(button('保存して概算する'));
    await waitForElement(() => one('[data-bee-estimate]'), '概算');
    expect(await stored<BeekeepingPlanRecord>(BEE_PLAN_COLLECTION)).toEqual([
      { hives: 20, costPerHiveYen: 15_000, fixedCostYen: 200_000 },
    ]);
    // 20 群: 百花蜜 200 kg × 5,000 = 1,000,000 / アカシア蜜 100 kg × 7,000 = 700,000 / 蜜蝋 6 kg × 3,000 = 18,000
    expect(textOf('[data-bee-estimate-row="honey-multifloral"]')).toBe('百花蜜200 kg¥1,000,000');
    expect(textOf('[data-bee-estimate-row="honey-acacia"]')).toBe('アカシア蜜100 kg¥700,000');
    expect(textOf('[data-bee-estimate-row="beeswax"]')).toBe('蜜蝋6 kg¥18,000');
    expect(textOf('[data-bee-revenue]')).toBe('売上の合計: ¥1,718,000 / 年');
    expect(textOf('[data-bee-cost]')).toBe('費用の合計: ¥500,000 / 年');
    expect(textOf('[data-bee-profit]')).toBe('差引: ¥1,218,000 / 年');
    expect(textOf('[data-bee-saved]')).toContain('保存しました');
  });

  it('赤字はそう述べる', async () => {
    await mountPage();
    await openBeekeeping();
    await type(guarded('群数 (群)'), '1');
    await type(guarded('年間の固定費 (円)'), '900000');
    await click(button('保存して概算する'));
    await waitForElement(() => one('[data-bee-estimate]'), '概算');
    // 1 群: 売上 50,000 + 35,000 + 900 = 85,900。費用 15,000 + 900,000 = 915,000。
    expect(textOf('[data-bee-profit]')).toBe('差引: ¥-829,100 / 年 (赤字)');
  });

  it('⛔ の欄が在れば保存しない (理由を出す)', async () => {
    await mountPage();
    await openBeekeeping();
    await type(guarded('群数 (群)'), '0');
    await click(button('保存して概算する'));
    await waitForText(() => textOf('[data-refused-fields]'), '群数 (群)');
    expect(await stored(BEE_PLAN_COLLECTION)).toEqual([]);
    expect(one('[data-bee-estimate]')).toBeNull();
    expect(one('[data-bee-saved]')).toBeNull();
  });

  it('産物を足すと保存され、開き直しても残り、概算に入る', async () => {
    await mountPage();
    await openBeekeeping();
    await click(button('保存して概算する'));
    await waitForElement(() => one('[data-bee-estimate]'), '概算');
    await type(input('産物の名前'), 'そば蜜');
    await type(input('1 群あたりの年間採取量 (kg)'), '2');
    await type(input('単価 (円/kg)'), '6,000');
    await click(button('この産物を足す'));
    await waitForText(noticeText, '「そば蜜」を足しました。');
    expect(await stored<BeeProductListRecord>(BEE_PRODUCTS_COLLECTION)).toEqual([
      { products: [...DEFAULT_BEE_PRODUCTS, { id: 'custom-1', label: 'そば蜜', yieldPerHiveKg: 2, pricePerKgYen: 6000 }] },
    ]);
    // 10 群 × 2 kg × 6,000 円 = 120,000 円が概算に足される
    await waitForElement(() => one('[data-bee-estimate-row="custom-1"]'), '足した産物の概算の行');
    expect(textOf('[data-bee-estimate-row="custom-1"]')).toBe('そば蜜20 kg¥120,000');
    expect(textOf('[data-bee-revenue]')).toBe('売上の合計: ¥979,000 / 年');

    await unmountPage();
    _resetCollectionSubscribersForTests();
    await mountPage();
    await openBeekeeping();
    await waitForText(() => textOf('[data-bee-products]'), 'そば蜜');
    expect(textOf('[data-bee-estimate-row="custom-1"]')).toBe('そば蜜20 kg¥120,000');
  });

  it('入力に誤りが在れば足さず、直す点を述べる', async () => {
    await mountPage();
    await openBeekeeping();
    await type(input('産物の名前'), 'プロポリス');
    await type(input('1 群あたりの年間採取量 (kg)'), '1,2');
    await type(input('単価 (円/kg)'), '5000');
    await click(button('この産物を足す'));
    await waitForText(noticeText, '産物の入力に誤りがあります');
    expect(noticeText()).toContain('1 群あたりの年間採取量 (kg) は 0.01〜500 の数値で入力してください');
    expect(await stored(BEE_PRODUCTS_COLLECTION)).toEqual([]);
    expect(textOf('[data-bee-products]')).not.toContain('プロポリス');
  });

  it('産物を消せる。消した参考の産物は戻せる', async () => {
    await mountPage();
    await openBeekeeping();
    await click(one('button[aria-label="蜜蝋 を消す"]')!);
    await waitForText(noticeText, '「蜜蝋」を消しました。');
    expect(textOf('[data-bee-products]')).not.toContain('蜜蝋');
    expect((await stored<BeeProductListRecord>(BEE_PRODUCTS_COLLECTION))[0]!.products.map((p) => p.id)).toEqual([
      'honey-multifloral', 'honey-acacia',
    ]);
    await click(button('参考の産物を戻す（蜜蝋）'));
    await waitForText(noticeText, '参考の産物を戻しました。');
    await waitForText(() => textOf('[data-bee-products]'), '蜜蝋');
  });

  it('最後の 1 件は消すボタンが押せない', async () => {
    await getRecordStore().insert<BeeProductListRecord>(BEE_PRODUCTS_COLLECTION, { products: [DEFAULT_BEE_PRODUCTS[0]!] });
    await mountPage();
    await openBeekeeping();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="百花蜜 を消す"]')!.disabled).toBe(true);
  });

  it('壊れた保存値でも投げず、参考の一覧と置き値の欄で開く', async () => {
    await getRecordStore().insert(BEE_PRODUCTS_COLLECTION, { products: [{ id: 'x' }, 5, null] } as unknown as BeeProductListRecord);
    await mountPage();
    await openBeekeeping();
    expect(textOf('[data-bee-products]')).toContain('百花蜜');
    expect(guarded('群数 (群)').value).toBe('10');
  });
});

describe('養殖 (海水魚・淡水魚)', () => {
  it('案内と、淡水魚 3 種・海水魚 2 種を分けて出す。概算は保存するまで出さない', async () => {
    await mountPage();
    await openAquaculture();
    expect(textOf('[data-aquaculture-notice]')).toContain('都道府県の水産の窓口');
    expect(textOf('[data-fish-water="fresh"]')).toContain('淡水魚 (3 種)');
    expect(textOf('[data-fish-water="fresh"]')).toContain('ニジマス');
    expect(textOf('[data-fish-water="sea"]')).toContain('海水魚 (2 種)');
    expect(textOf('[data-fish-water="sea"]')).toContain('マダイ');
    expect(textOf('[data-fish-water="sea"]')).not.toContain('ニジマス');
    expect(one('[data-fish-estimate]')).toBeNull();
    expect(textOf('[data-fish-no-estimate]')).toContain('概算はまだ出していません');
    expect(await stored(FISH_PLAN_COLLECTION)).toEqual([]);
    expect(await stored(FISH_SPECIES_COLLECTION)).toEqual([]);
  });

  it('魚種の選択は海水魚と淡水魚に分かれている', async () => {
    await mountPage();
    await openAquaculture();
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="魚種"]')!;
    const groups = Array.from(select.querySelectorAll('optgroup')).map((g) => [
      g.label,
      Array.from(g.querySelectorAll('option')).map((o) => o.textContent),
    ]);
    expect(groups).toEqual([
      ['海水魚', ['マダイ', 'ヒラメ']],
      ['淡水魚', ['ニジマス', 'ティラピア', 'ホンモロコ']],
    ]);
    expect(select.value).toBe('rainbow-trout');
  });

  it('保存すると、保存した入力から出荷までの収支を出す (淡水魚)', async () => {
    await mountPage();
    await openAquaculture();
    await click(button('保存して概算する'));
    await waitForElement(() => one('[data-fish-estimate]'), '概算');
    expect(await stored<AquaculturePlanRecord>(FISH_PLAN_COLLECTION)).toEqual([
      { speciesId: 'rainbow-trout', stockCount: 5000, fryYenPerFish: 30, feedYenPerKg: 200, otherCostYen: 300_000 },
    ]);
    // ニジマス: 5000 尾 × 80% = 4000 尾 × 200 g = 800 kg。売上 800 × 1,200 = 960,000。
    // 餌 800 × 1.3 = 1,040 kg × 200 = 208,000。種苗 150,000。その他 300,000。費用 658,000。差引 302,000。
    expect(textOf('[data-fish-harvest]')).toBe('ニジマス (淡水魚): 出荷 4,000 尾・800 kg (出荷まで 365 日)');
    expect(textOf('[data-fish-revenue]')).toBe('売上: ¥960,000');
    expect(textOf('[data-fish-cost]')).toBe('費用: ¥658,000 (餌 1,040 kg = ¥208,000・種苗 ¥150,000・その他 ¥300,000)');
    expect(textOf('[data-fish-profit]')).toBe('差引: ¥302,000');
    expect(textOf('[data-fish-profit-year]')).toBe('1 年あたりに直すと: ¥302,000');
    expect(one('[data-fish-species-missing]')).toBeNull();
  });

  it('海水魚を選んで保存すると、その魚種で概算する (1 年あたりは日数で割り直す)', async () => {
    await mountPage();
    await openAquaculture();
    await type(container.querySelector<HTMLSelectElement>('select[aria-label="魚種"]')!, 'red-seabream');
    await click(button('保存して概算する'));
    await waitForElement(() => one('[data-fish-estimate]'), '概算');
    expect((await stored<AquaculturePlanRecord>(FISH_PLAN_COLLECTION))[0]!.speciesId).toBe('red-seabream');
    // マダイ: 4000 尾 × 1,200 g = 4,800 kg。売上 4,800,000。餌 12,000 kg = 2,400,000。費用 2,850,000。差引 1,950,000。
    expect(textOf('[data-fish-harvest]')).toBe('マダイ (海水魚): 出荷 4,000 尾・4,800 kg (出荷まで 730 日)');
    expect(textOf('[data-fish-profit]')).toBe('差引: ¥1,950,000');
    expect(textOf('[data-fish-profit-year]')).toBe('1 年あたりに直すと: ¥975,000');
  });

  it('⛔ の欄が在れば保存しない (理由を出す)', async () => {
    await mountPage();
    await openAquaculture();
    await type(guarded('入れる尾数 (尾)'), 'たくさん');
    await click(button('保存して概算する'));
    await waitForText(() => textOf('[data-refused-fields]'), '入れる尾数 (尾)');
    expect(await stored(FISH_PLAN_COLLECTION)).toEqual([]);
    expect(one('[data-fish-estimate]')).toBeNull();
  });

  it('海水魚を足すと、海水魚の側に入り、保存される', async () => {
    await mountPage();
    await openAquaculture();
    await type(input('魚種の名前'), 'ブリ');
    await type(container.querySelector<HTMLSelectElement>('select[aria-label="足す魚種の水の種類"]')!, 'sea');
    await type(input('出荷までの日数 (日)'), '540');
    await type(input('出荷時の重さ (g/尾)'), '4000');
    await type(input('生残率 (%)'), '85');
    await type(input('増肉係数 (餌 kg ÷ 増重 kg)'), '2.8');
    await type(input('単価 (円/kg)'), '900');
    await type(input('水温の目安 下限 (℃)'), '18');
    await type(input('水温の目安 上限 (℃)'), '27');
    await click(button('この魚種を足す'));
    await waitForText(noticeText, '「ブリ」を足しました。');
    await waitForText(() => textOf('[data-fish-water="sea"]'), '海水魚 (3 種)');
    expect(textOf('[data-fish-water="sea"]')).toContain('ブリ');
    expect(textOf('[data-fish-water="fresh"]')).not.toContain('ブリ');
    expect((await stored<FishSpeciesListRecord>(FISH_SPECIES_COLLECTION))[0]!.species[5]).toEqual({
      id: 'custom-1', label: 'ブリ', water: 'sea',
      growOutDays: 540, harvestWeightG: 4000, survivalPct: 85, feedConversion: 2.8, pricePerKgYen: 900, tempLowC: 18, tempHighC: 27,
    });
  });

  it('水温の下限 > 上限の魚種は足さない', async () => {
    await mountPage();
    await openAquaculture();
    await type(input('魚種の名前'), 'コイ');
    await type(input('出荷までの日数 (日)'), '300');
    await type(input('出荷時の重さ (g/尾)'), '1000');
    await type(input('生残率 (%)'), '80');
    await type(input('増肉係数 (餌 kg ÷ 増重 kg)'), '2');
    await type(input('単価 (円/kg)'), '800');
    await type(input('水温の目安 下限 (℃)'), '30');
    await type(input('水温の目安 上限 (℃)'), '20');
    await click(button('この魚種を足す'));
    await waitForText(noticeText, '水温の目安は下限 ≦ 上限にしてください');
    expect(await stored(FISH_SPECIES_COLLECTION)).toEqual([]);
  });

  it('魚種を消せる。消すと選べなくなる', async () => {
    await mountPage();
    await openAquaculture();
    await click(one('button[aria-label="ヒラメ を消す"]')!);
    await waitForText(noticeText, '「ヒラメ」を消しました。');
    await waitForText(() => textOf('[data-fish-water="sea"]'), '海水魚 (1 種)');
    const options = Array.from(container.querySelectorAll('select[aria-label="魚種"] option')).map((o) => o.textContent);
    expect(options).toEqual(['マダイ', 'ニジマス', 'ティラピア', 'ホンモロコ']);
  });

  it('海水魚を全部消すと、その側は「一覧にありません」と述べ、選択からも消える', async () => {
    await getRecordStore().insert<FishSpeciesListRecord>(FISH_SPECIES_COLLECTION, {
      species: DEFAULT_FISH_SPECIES.filter((s) => s.water === 'fresh'),
    });
    await mountPage();
    await openAquaculture();
    expect(textOf('[data-fish-water="sea"]')).toContain('海水魚は一覧にありません');
    expect(Array.from(container.querySelectorAll('select[aria-label="魚種"] optgroup')).map((g) => (g as HTMLOptGroupElement).label)).toEqual(['淡水魚']);
  });

  it('保存した概算の魚種が一覧から消えていれば、先頭の魚種で概算していると述べる', async () => {
    await getRecordStore().insert<AquaculturePlanRecord>(FISH_PLAN_COLLECTION, {
      speciesId: 'gone-fish', stockCount: 1000, fryYenPerFish: 0, feedYenPerKg: 0, otherCostYen: 0,
    });
    await mountPage();
    await openAquaculture();
    await waitForElement(() => one('[data-fish-species-missing]'), '魚種が一覧に無い断り');
    expect(textOf('[data-fish-species-missing]')).toContain('先頭の魚種（ニジマス）で概算しています');
    // 保存値の id そのものは刷らない
    expect(screenText()).not.toContain('gone-fish');
    expect(textOf('[data-fish-harvest]')).toContain('ニジマス (淡水魚): 出荷 800 尾');
  });

  it('水温の点検: 選んでいる魚種の目安と比べる (保存しない)', async () => {
    await mountPage();
    await openAquaculture();
    expect(one('[data-fish-temp-verdict]')).toBeNull();
    await type(guarded('今日の水温 (℃)'), '5');
    expect(one('[data-fish-temp-verdict]')!.getAttribute('data-fish-temp-verdict')).toBe('low');
    expect(textOf('[data-fish-temp-verdict]')).toBe(
      '水温 5 ℃ はニジマスの目安 8〜18 ℃より低いです。餌を食べる量が落ちやすいので、給餌の量を見直してください。',
    );
    await type(guarded('今日の水温 (℃)'), '12');
    expect(one('[data-fish-temp-verdict]')!.getAttribute('data-fish-temp-verdict')).toBe('ok');
    await type(guarded('今日の水温 (℃)'), '22');
    expect(one('[data-fish-temp-verdict]')!.getAttribute('data-fish-temp-verdict')).toBe('high');
    // 魚種を替えると、その魚種の目安で判定し直す (ティラピア 24〜30 ℃)
    await type(container.querySelector<HTMLSelectElement>('select[aria-label="魚種"]')!, 'tilapia');
    expect(one('[data-fish-temp-verdict]')!.getAttribute('data-fish-temp-verdict')).toBe('low');
    expect(await stored(FISH_PLAN_COLLECTION)).toEqual([]);
  });

  it('水温が読めない間は判定を出さない (0 ℃ として判定しない)', async () => {
    await mountPage();
    await openAquaculture();
    await type(guarded('今日の水温 (℃)'), '12度くらい');
    expect(one('[data-fish-temp-verdict]')).toBeNull();
    expect(textOf('[data-refused-fields]')).toContain('今日の水温 (℃)');
  });
});
