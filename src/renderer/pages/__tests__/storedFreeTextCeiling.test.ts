/** @vitest-environment jsdom */
/**
 * **保管した自由文も、画面へ出るときは天井を通る。** (2026-09-23 · パス 419)
 *
 * パス 417 は販売記録のメモについてこれを閉じた。**同じ形が他の 4 画面に在った。**
 *
 * ## 非対称 —— 入口は上限を宣言し、復元の境界と読み手は見ない
 *
 * 入口 (フォームの関門) は長すぎる値を断る。ところが `COLLECTION_SHAPES` の `str` は
 * **長さを見ない**ので、手で直した控え・古い版が書いた行は入口を通らずに入る
 * (実測: 下の 10 欄すべてで 200,000 字の行が `hasCollectionShape` を通る)。
 * 読み手にも天井が無かった。パス 359 の「**入口が出口より厳しい**」の規模の大きい現れである。
 *
 * ## 実測 (2026-09-23 · 直す前・1 欄 200,000 字)
 *
 * | 画面 | 素 | 1 欄 200,000 字 |
 * | --- | ---: | ---: |
 * | `team` | 441 | **200,442** |
 * | `tax-accountant` (士業 CRM) | 1,909 | **201,954** |
 * | `mutual-funds` | 2,258 | **202,369** |
 * | `real-estate` | 4,780 | **204,896** |
 * | **`ManualDataSection`** (`App.tsx` が全画面に描く) | 214 | **400,229** (name は 2 か所に出る) |
 *
 * ★ **5 つ目は私の針が狭かったせいで 1 度目に見えなかった** —— 入口の定数を
 *   `MAX_*_CHARS` で探したので、`BUSINESS_NAME_MAX` / `CUSTOM_METRIC_MAX_LABEL` のように
 *   **`*_MAX` と名乗る 5 つ**が母集団から落ちていた (「綴りの針は、綴りでない物に動かされる」)。
 *   しかもこの面は**いちばん届きやすい** —— 目録を持つ画面すべてに `App.tsx` が描く。
 *   だから台帳は**入口の定数から**引き、名前の形では絞らない。
 *
 * ★ **投げる画面は 0** —— 値は文字列のままなので、起きるのは「画面が使えなくなる」側である
 * (パス 417 の `note` は非文字列で**投げて**いたので、そちらより軽い)。
 * ★ **フォームからは入らない (測った)** —— 200,000 字の氏名・電話・メールは入口が 3 形とも断る。
 *   届く道は**復元だけ**である。
 * ★ **天井の数は 1 つも新しく作っていない** —— 10 欄すべて入口が既に宣言していた
 *   (64 / 80 / 16 / 20 / 254)。だから**正当な値は 1 つも変わらない**。
 * ★ **形の側では断らない** —— `collectionShapes.ts` 自身が「**落とし過ぎは復元の欠落 =
 *   別の事故になる**」と書いている。1 欄が長いだけで行ごと捨てると利用者はその行を失う。
 *
 * 背骨は**振る舞い** —— 実物の保管層へ入れて実物の画面を描き、総文字数を見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { TeamPage } from '../TeamPage';
import { MutualFundsPage } from '../MutualFundsPage';
import { RealEstatePage } from '../RealEstatePage';
import { hasCollectionShape } from '../../data/collectionShapes';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { MAX_MEMBER_NAME_CHARS, MAX_MEMBER_EMAIL_LEN } from '../../data/members';
import { MAX_FUND_CODE_CHARS, MAX_FUND_NAME_CHARS, MAX_PROPERTY_NAME_CHARS, MAX_PROPERTY_TYPE_CHARS } from '../../data/investments';
import { MAX_CONTACT_NAME_CHARS, MAX_CONTACT_FIRM_CHARS, MAX_CONTACT_PHONE_CHARS, MAX_CONTACT_EMAIL_LEN } from '../../data/shigyoDirectory';
import { BUSINESS_CATEGORY_MAX, BUSINESS_NAME_MAX, BUSINESS_NOTE_MAX } from '../../data/businessUnits';
import { CUSTOM_METRIC_MAX_LABEL, CUSTOM_METRIC_MAX_NOTE } from '../../data/overviewOverrides';
import { ManualDataSection } from '../../components/ManualDataSection';
import { HydroponicsPage } from '../HydroponicsPage';
import { MAX_CONSULTATION_TOPIC_CHARS } from '../../data/shigyoDirectory';
import { MAX_BATCH_ID_CHARS } from '../../../shared/hydroponicsControl';
import { MAX_CROP_ID_CHARS } from '../../../shared/hydroponicCrops';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

const BIG = 'x'.repeat(200_000);
/** 画面の総文字数の上限。素の最大 (real-estate 4,780) の 4 倍。 */
const SCREEN_BOUND = 20_000;

/**
 * 天井を通す 10 欄の台帳。`max` は**入口が宣言している数**で、写しではなく定数を読む。
 * 走査ではなく手の台帳なのは、**どの欄が画面に出るかは画面を読まないと分からない**から
 * (出ない欄に天井を通しても意味が無い)。**増えたら振る舞いの検査が鳴る**。
 */
const LEDGER: readonly { readonly collection: string; readonly field: string; readonly max: number }[] = [
  { collection: 'team-members', field: 'name', max: MAX_MEMBER_NAME_CHARS },
  { collection: 'team-members', field: 'email', max: MAX_MEMBER_EMAIL_LEN },
  { collection: 'shigyo-contacts', field: 'name', max: MAX_CONTACT_NAME_CHARS },
  { collection: 'shigyo-contacts', field: 'firm', max: MAX_CONTACT_FIRM_CHARS },
  { collection: 'shigyo-contacts', field: 'phone', max: MAX_CONTACT_PHONE_CHARS },
  { collection: 'shigyo-contacts', field: 'email', max: MAX_CONTACT_EMAIL_LEN },
  { collection: 'mutualfund-holdings', field: 'name', max: MAX_FUND_NAME_CHARS },
  { collection: 'mutualfund-holdings', field: 'code', max: MAX_FUND_CODE_CHARS },
  { collection: 'realestate-properties', field: 'name', max: MAX_PROPERTY_NAME_CHARS },
  { collection: 'realestate-properties', field: 'type', max: MAX_PROPERTY_TYPE_CHARS },
  { collection: 'business-units', field: 'name', max: BUSINESS_NAME_MAX },
  { collection: 'business-units', field: 'category', max: BUSINESS_CATEGORY_MAX },
  { collection: 'business-units', field: 'note', max: BUSINESS_NOTE_MAX },
  { collection: 'manual-metrics', field: 'label', max: CUSTOM_METRIC_MAX_LABEL },
  { collection: 'manual-metrics', field: 'note', max: CUSTOM_METRIC_MAX_NOTE },
  // パス 420 —— 入口の数が**名前を持たなかった** 3 欄 (裸の 80 / renderer 側の定数 / 正規表現の中)。
  { collection: 'shigyo-consultations', field: 'topic', max: MAX_CONSULTATION_TOPIC_CHARS },
  { collection: 'hydroponics-batches', field: 'id', max: MAX_BATCH_ID_CHARS },
  { collection: 'hydroponics-batches', field: 'cropId', max: MAX_CROP_ID_CHARS },
];

/** 形に合う行 (BIG を入れる欄だけ差し替える)。**正しいことを検査が先に確かめる。** */
const VALID: Readonly<Record<string, Record<string, unknown>>> = {
  'team-members': { name: '山田', email: 'a@b.example', role: 'member' },
  'shigyo-contacts': { serviceId: 'tax-accountant', name: '税理士', firm: '事務所', phone: '03-0000-0000', email: 'a@b.example' },
  'mutualfund-holdings': { code: '0001', name: 'ファンド', units: 1, navPerUnit: 1, valuation: 1, acquisitionCost: 1, ytdReturnPct: 1 },
  'realestate-properties': { name: '物件', type: '区分', monthlyRent: 1, purchasePrice: 1, occupied: true },
  'business-units': { name: '事業', category: '区分', note: 'メモ', revenue: 1 },
  'manual-metrics': { scope: 'business', label: '項目', value: 1, unit: 'yen', note: 'メモ' },
  'shigyo-consultations': { serviceId: 'tax-accountant', date: '2026-01-01', topic: '相談', status: '対応中' },
  'hydroponics-batches': { id: 'b1', cropId: 'lettuce', sowDate: '2026-01-01', panels: 1, state: 'nursery', transplantedDate: null, harvestedDate: null, solutionChangedDate: null, note: 'メモ' },
};

/**
 * その collection を描く画面と、**錠に使う別の欄**。
 *
 * ★ **錠は「この行が届いた印」でなければならない** —— 最初に書いた版は
 *   `'ファンド'` を待っていたが、それは**フォームのラベル**「ファンド名」の部分文字列で、
 *   行が届く前から出ている。待ちが即座に通り、**行が無い状態を測っていた**
 *   (パス 376 / 417 と同じ罠を 3 度目に踏んだ)。
 * ★ **印は試験対象と別の欄に置く** —— 対象の欄は 200,000 字で潰すので、
 *   そこを錠にすると自分で消してしまう。
 */
const LOCK = 'QQLOCKQQ';
const SCREENS: Readonly<Record<string, { readonly page: ComponentType; readonly lockField: string; readonly expand?: boolean; readonly lockRow?: (lock: string) => Record<string, unknown> }>> = {
  'team-members': { page: TeamPage, lockField: 'email' },
  'shigyo-contacts': { page: SERVICES.find((x) => x.id === 'tax-accountant')!.page as ComponentType, lockField: 'firm' },
  'mutualfund-holdings': { page: MutualFundsPage, lockField: 'code' },
  'realestate-properties': { page: RealEstatePage, lockField: 'type' },
  // ★ `ManualDataSection` は画面ではなく**部品**で、`App.tsx` が目録を持つ画面すべてに描く。
  //   だから `SERVICES` からは引けない —— 直接 mount する (`scope` は目録を持つ 1 つ)。
  'business-units': { page: () => createElement(ManualDataSection, { scope: 'business' }), lockField: 'note', expand: true },
  'manual-metrics': { page: () => createElement(ManualDataSection, { scope: 'business' }), lockField: 'label', expand: true },
  /*
   * ★ **錠を別の欄に置けない collection は、2 行目を置く** (パス 420)。
   *   相談は自由文が `topic` しか無く、ロットは `note` が**画面に出ない** (実測)。
   *   同じ行の別の欄を錠にできないので、**健全な 2 行目**を入れてそれを待つ。
   */
  'shigyo-consultations': { page: SERVICES.find((x) => x.id === 'tax-accountant')!.page as ComponentType, lockField: 'topic', lockRow: (lock) => ({ ...VALID['shigyo-consultations']!, topic: lock }) },
  'hydroponics-batches': { page: HydroponicsPage, lockField: 'id', lockRow: (lock) => ({ ...VALID['hydroponics-batches']!, id: lock }) },
};

/** 対象の欄が錠の欄と重なるときは、別の欄を錠にする。 */
function lockFieldFor(collection: string, target: string): string {
  const base = SCREENS[collection]!.lockField;
  if (base !== target) return base;
  return { 'team-members': 'name', 'shigyo-contacts': 'name', 'mutualfund-holdings': 'name', 'realestate-properties': 'name', 'business-units': 'category', 'manual-metrics': 'note' }[collection] ?? base;
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: vi.fn(() => Promise.resolve({ ok: false, code: 'x', message: 'x' })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'none', counts: {} }),
    checkUpdate: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve(),
    eraseAll: () => Promise.resolve({ ok: true }),
    authorize: () => Promise.resolve({ ok: false }),
  };
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }),
      configurable: true,
    });
  }
  for (const n of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[n] !== 'function') {
      Object.defineProperty(Element.prototype, n, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) { const r = root; root = null; act(() => { r.unmount(); }); }
  container.remove();
  vi.restoreAllMocks();
});

/**
 * `expand`: **畳まれている部品を開く** —— `ManualDataSection` は既定で閉じており
 * (`useState(false)`)、閉じたままだと 214 字しか出ないので**行が無い状態を測ってしまう**。
 * 開く前に錠を待てないので、この 1 つだけ「押してから待つ」順序になる。
 */
async function mount(Page: ComponentType, waitFor: string, expand = false): Promise<string> {
  root = createRoot(container);
  const r = root;
  await act(async () => { r.render(createElement(Page)); });
  if (expand) {
    const btn = await waitForElement(
      () => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('▸')),
      '畳まれた「手入力の数値」を開くボタン',
    );
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

describe('保管した自由文の天井 (パス 419)', () => {
  it('★ 見本が形に合う / 200,000 字でも形は通る (= 復元から入る)', () => {
    for (const [c, row] of Object.entries(VALID)) {
      expect(hasCollectionShape(c, row), `${c} の見本が形に合っていない`).toBe(true);
    }
    for (const { collection, field } of LEDGER) {
      const row = { ...VALID[collection]!, [field]: BIG };
      expect(hasCollectionShape(collection, row), `${collection}.${field} が形で断られる`).toBe(true);
    }
    expect(LEDGER.length).toBeGreaterThanOrEqual(18);
  });

  it('★ 天井は入口が宣言している数と同じ (新しい数を作っていない)', () => {
    // 入口の数がそのまま読まれていること (写しなら、入口を変えた日に画面だけ古びる)。
    expect(new Set(LEDGER.map((l) => l.max))).toEqual(new Set([64, 254, 80, 20, 16, 60, 30, 200, 40]));
    // ★ 80 と 40 は 2 度ずつ出る (相談テーマ = 士業の事務所名の 80 とは別の入口・ロット名 = 品目 id の 40)。
    // email の 254 は RFC 5321 の**オクテット**上限なので定数名に `_CHARS` を付けない
    // (付けたら `ceilingUnitCensus` が「文字で数えろ」と正しく鳴った · パス 419 の自戒)。
    for (const l of LEDGER) expect(l.max, `${l.collection}.${l.field} の天井が無い`).toBeGreaterThan(0);
  });

  it.each(LEDGER.map((l) => [`${l.collection}.${l.field}`, l] as const))(
    '★ %s が 200,000 字でも画面は膨らまない',
    async (_name, l) => {
      const screen = SCREENS[l.collection]!;
      if (screen.lockRow === undefined) {
        const lockField = lockFieldFor(l.collection, l.field);
        await getRecordStore().insert(l.collection, { ...VALID[l.collection]!, [lockField]: LOCK, [l.field]: BIG });
      } else {
        await getRecordStore().insert(l.collection, { ...VALID[l.collection]!, [l.field]: BIG });
        await getRecordStore().insert(l.collection, screen.lockRow(LOCK));
      }
      const t = await mount(screen.page, LOCK, screen.expand === true);
      expect(t.length, `画面が ${t.length} 字 (直す前は ~200,000)`).toBeLessThan(SCREEN_BOUND);
      // 切ったことを述べる (絞ることと述べることは対 · パス 400)。
      expect(t).toContain('x'.repeat(l.max) + '…');
    },
    30_000,
  );

  it('★ 行そのものは落とさない (天井は長さだけを切る)', async () => {
    await getRecordStore().insert('team-members', { ...VALID['team-members']!, email: LOCK + '@b.example', name: BIG });
    const t = await mount(TeamPage, LOCK);
    // 同じ行の他の欄は残る。
    expect(t).toContain(LOCK);
  });
});
