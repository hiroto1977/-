/** @vitest-environment jsdom */
/**
 * **⛔ の税率から兆円単位の税額を作らない** (パス 208)。
 *
 * `TaxPage` の ⑫ 貿易の節は 4 つの税率欄を `max: 100`（%）で宣言し、
 * `guardNumber` は超過に `level: 'fatal'`（⛔・赤枠・`aria-invalid`）を返す。
 * **その判定は計算に届いていなかった** —— `num(imDutyStr) / 100` が断られた値を
 * そのまま `calcJapanImport` / `calcExport` へ渡していた。
 *
 * 実測（直す前・999,999,999% · 課税価格 ¥1,090,000 の貨物）:
 *
 * | 欄 | タイル | 出ていた物 |
 * | --- | --- | ---: |
 * | 関税率 | 関税 | **¥5,349,999,994,600** |
 * | 〃 | 税の合計 / 通関までの原価 | **¥5,885,000,047,400** / **¥5,885,000,582,400** |
 * | 輸出税率 | 輸出税（日本以外の場合）/ 売手の負担 | **¥9,999,999,990,000** |
 * | 仕向国の関税率 | 仕向国の関税 / 買手の負担 | **¥10,899,999,989,100** / **¥13,080,000,204,920** |
 * | 仕向国の付加価値税 | 仕向国の付加価値税 | **¥11,444,999,988,555** |
 *
 * **`日本の輸出関税` は動かない** —— あれは `jpy(0)` の固定値で、日本が輸出に関税を
 * 課していないことを述べている（走査の差分を欄の位置で読んだとき、私はこの行を
 * 一度取り違えて記録した。実際に動くのは `輸出税（日本以外の場合）` と `売手の負担`）。
 *
 * 断るのは**率が入る計算だけ**。`課税価格`（輸入）と `仕向国の課税価格`（輸出）は
 * 率に依らないので出し続ける —— 「測れている隣の数字まで隠さない」（パス 206/207）。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { waitForText } from '../../__tests__/jsdomWait';

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
  const def = SERVICES.find((s) => s.id === 'tax');
  if (!def) throw new Error('tax service missing');
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

async function typeField(label: string, value: string): Promise<HTMLInputElement> {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`field not found: ${label}`);
  await act(async () => {
    changeInput(input, value);
  });
  await settle();
  return input;
}

/** 貿易の節のタイルだけを「ラベル → 値」で読む。 */
function tradeTiles(): Map<string, string> {
  const m = new Map<string, string>();
  // `[data-export-japan]` はパス 212 で切り出した段 —— 「日本の輸出関税 ¥0 /
  // 消費税（輸出免税）¥0」は**入力に依らない事実**なので、金額が ⛔ でも消さない。
  // 3 つすべてを読まないと「消えたのか、別の段に移ったのか」が分からない。
  // **段が無いこと自体が意味を持つ** —— 金額が ⛔ のときは grid が断りに
  // 差し替わるので (パス 212)、「見つからなければ投げる」だと断りを検査できない。
  // ただし**全部無いのは本当の壊れ**なので、1 つも見つからなければ落とす。
  let found = 0;
  for (const sel of ['[data-import-stats]', '[data-export-japan]', '[data-export-stats]']) {
    const grid = container.querySelector(sel);
    if (grid === null) continue;
    found += 1;
    for (const card of Array.from(grid.children)) {
      const kids = Array.from(card.children);
      const label = (kids[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const value = (kids[1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (label !== '') m.set(label, value);
    }
  }
  if (found === 0) throw new Error('貿易のタイルが 1 つも見つからない (選択子が古い?)');
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

describe('貿易にかかる税 — ⛔ の税率から税額を作らない (パス 208)', () => {
  it('★ 対照: 既定値では全タイルに金額が出て、断りは出ない', async () => {
    await mountPage();
    // **標本つきの対照** —— 下の検査は「消えること」を見るので、まず在ることを確かめる。
    const t = tradeTiles();
    expect(t.get('課税価格 (1,000円未満切捨て)')).toBe('¥535,000');
    expect(t.get('関税 (100円未満切捨て)')).toBe('¥24,000');
    expect(t.get('税の合計')).toBe('¥79,800');
    expect(t.get('通関までの原価')).toBe('¥614,800');
    expect(t.get('仕向国の課税価格')).toBe('¥1,090,000');
    expect(t.get('仕向国の関税')).toBe('¥54,500');
    expect(t.get('仕向国の付加価値税')).toBe('¥228,900');
    expect(t.get('買手の負担')).toBe('¥283,400');
    expect(text()).not.toContain('入力できる範囲の外');
    expect(container.querySelector('input[data-guard="fatal"]')).toBeNull();
  });

  it('★ 関税率が上限超過なら、関税から下を出さず理由を述べる (課税価格は残す)', async () => {
    await mountPage();
    const input = await typeField('関税率 (%)', '999999999');
    expect(input.getAttribute('data-guard')).toBe('fatal');
    const t = tradeTiles();
    // 率に依らない物は残る。
    expect(t.get('課税価格 (1,000円未満切捨て)')).toBe('¥535,000');
    // 率が入る物は「—」。
    for (const label of ['関税 (100円未満切捨て)', '消費税の課税標準', '消費税 (国税)', '地方消費税', '税の合計', '通関までの原価']) {
      expect(t.get(label), label).toBe('—');
    }
    await waitForText(text, '関税率が入力できる範囲の外');
    // **兆円の金額がタイルに 1 つも残っていない。**
    for (const v of t.values()) expect(v).not.toMatch(/999999999|\d{2},\d{3},\d{3},\d{3}/);
    // 輸出の節は別の率なので黙らせない。
    expect(t.get('仕向国の関税')).toBe('¥54,500');
  });

  it('★ 輸出税率が上限超過なら、輸出税と売手の負担だけを出さない', async () => {
    await mountPage();
    await typeField('輸出税率 (%・日本は0)', '999999999');
    const t = tradeTiles();
    expect(t.get('輸出税（日本以外の場合）')).toBe('—');
    expect(t.get('売手の負担')).toBe('—');
    // **`日本の輸出関税` は固定の 0 円** (日本は輸出に関税を課していない)。
    expect(t.get('日本の輸出関税')).toBe('¥0');
    // 仕向国側は別の率なので出る。
    expect(t.get('仕向国の課税価格')).toBe('¥1,090,000');
    expect(t.get('買手の負担')).toBe('¥283,400');
    await waitForText(text, '輸出税率');
  });

  it('★ 仕向国の付加価値税が上限超過なら、そこから下を出さない (関税は残す)', async () => {
    await mountPage();
    await typeField('仕向国の付加価値税 (%)', '999999999');
    const t = tradeTiles();
    expect(t.get('仕向国の関税')).toBe('¥54,500'); // 別の率
    expect(t.get('仕向国の付加価値税')).toBe('—');
    expect(t.get('仕向国の税 合計')).toBe('—');
    expect(t.get('買手の負担')).toBe('—');
    await waitForText(text, '仕向国の付加価値税');
  });

  // --- パス 212: 率ではなく**金額**が ⛔ のとき ---
  //
  // パス 208 は「課税価格は率に依らないので出し続ける」と決めた。**金額では逆**で、
  // 課税価格は CIF (商品代金＋運賃＋保険料) の和なので、1 つでも ⛔ なら
  // 課税価格そのものが測れない。0 に倒れると**税関に出す数字が変わる**。

  it('★ 商品代金 (輸入) がマイナスなら「課税価格 ¥35,000」を作らない', async () => {
    await mountPage();
    const input = await typeField('商品代金 (輸入・円)', '-9999');
    expect(input.getAttribute('data-guard')).toBe('fatal');
    const t = tradeTiles();
    // 課税価格から下すべてが消える (率のときと違い、課税価格も残さない)。
    for (const label of [
      '課税価格 (1,000円未満切捨て)', '関税 (100円未満切捨て)', '消費税の課税標準',
      '消費税 (国税)', '地方消費税', '税の合計', '通関までの原価',
    ]) {
      expect(t.get(label), label).toBeUndefined();
    }
    await waitForText(text, '商品代金 (輸入・円)が入力できる範囲の外');
    // **0 に倒れた課税価格 (¥35,000 = 運賃 30,000 + 保険料 5,000) が出ていない。**
    for (const v of t.values()) expect(v).not.toBe('¥35,000');
    // 輸出の節は別の欄なので残る。
    expect(t.get('仕向国の課税価格')).toBe('¥1,090,000');
  });

  it('★ 国際運賃 (輸入) がマイナスでも、輸入の節だけを断る', async () => {
    await mountPage();
    await typeField('国際運賃 (輸入・円)', '-9999');
    const t = tradeTiles();
    expect(t.get('課税価格 (1,000円未満切捨て)')).toBeUndefined();
    // 運賃を 0 として再計算した ¥505,000 が出ていない。
    for (const v of t.values()) expect(v).not.toBe('¥505,000');
    await waitForText(text, '国際運賃 (輸入・円)');
    expect(t.get('買手の負担')).toBe('¥283,400');
  });

  it('★ 商品代金 (輸出) がマイナスなら仕向国側を断るが、日本の事実は残す', async () => {
    await mountPage();
    await typeField('商品代金 (輸出・円)', '-9999');
    const t = tradeTiles();
    for (const label of [
      '仕向国の課税価格', '仕向国の関税', '仕向国の付加価値税', '仕向国の税 合計', '買手の負担',
    ]) {
      expect(t.get(label), label).toBeUndefined();
    }
    for (const v of t.values()) expect(v).not.toBe('¥90,000');
    await waitForText(text, '商品代金 (輸出・円)');
    // **入力に依らない事実は断らない** —— 日本が輸出に関税を課さないことと
    // 輸出免税は金額が ⛔ でも真である (消すと「日本も課すかも」と読める)。
    expect(t.get('日本の輸出関税')).toBe('¥0');
    expect(t.get('日本の消費税（輸出免税）')).toBe('¥0');
    // 輸入の節は別の欄なので残る。
    expect(t.get('課税価格 (1,000円未満切捨て)')).toBe('¥535,000');
  });

  it('★ 仕向国の関税率が上限超過なら、関税・付加価値税・負担を出さない (課税価格は残す)', async () => {
    await mountPage();
    await typeField('仕向国の関税率 (%)', '999999999');
    const t = tradeTiles();
    expect(t.get('仕向国の課税価格')).toBe('¥1,090,000');
    expect(t.get('仕向国の関税')).toBe('—');
    expect(t.get('仕向国の付加価値税')).toBe('—'); // 既定は課税標準に関税を含める
    expect(t.get('買手の負担')).toBe('—');
    // 輸出税は別の率なので出る (既定 0%)。
    expect(t.get('輸出税（日本以外の場合）')).toBe('¥0');
    await waitForText(text, '仕向国の関税率');
  });
});
