/** @vitest-environment jsdom */
/**
 * **賞与の回数は、1 つの計算の中で 1 つの整数である** (2026-09-27 · パス 493p)。
 *
 * 税金ページの「② 手取り」節の社会保険料の精密概算は、賞与を入れると
 * 「年収から賞与総額を引いた残りを月額報酬とみなす」。直す前は:
 *
 * | 使う所 | 回数 (2.5 と打ったとき) |
 * | --- | --- |
 * | 年収から引く賞与総額 (`bonusPer × bonusCount`) | **2.5** (小数のまま) |
 * | 社会保険料の賞与分 (`calcSocialInsuranceWithBonus` の中の `Math.floor`) | **2** |
 * | 注記「賞与を入力した場合は…分けて計算します」を出すか | **0.5 でも出す** (0.5 > 0) |
 *
 * **同じ入力が同じ計算の中で 2 つの回数を持っていた。** しかも 0.5 回では賞与を分けずに
 * 計算しながら (1 回に満たないので切り捨てると 0)、注記は「分けて計算します」と述べていた。
 * 関門の断りは「小数は切り捨てられます」と言っていたが、それはこの節の半分についてだけ真だった
 * (その文はパス 493p で関門から外した —— 扱いは欄を読む側が決める)。
 *
 * 直した後は 1 つの整数 (`Math.trunc`) を計算と注記の両方が読む。検査は実物の画面を描き、
 * **2.9 回と 2 回が同じ答えを出す**ことと、**0.5 回は賞与なしと同じ答えで、注記を出さない**ことを見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';

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

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 精密概算の合計。節の文は「社会保険料の精密概算 (…)：合計 ¥X（厚生年金 …」。 */
function preciseTotal(): string | null {
  const m = /社会保険料の精密概算[^：]*：\s*合計 (¥[\d,]+)/.exec(text());
  return m ? m[1]! : null;
}

const BONUS_NOTE = '賞与を入力した場合は';

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'tax');
  if (!def) throw new Error('tax service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForText(text, '社会保険料の精密概算');
}

function setNative(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** `<label>` の本文 (子の input を除く) で欄を引く。先頭一致。 */
async function typeLabelled(labelPrefix: string, value: string): Promise<void> {
  const hit = Array.from(container.querySelectorAll('label')).find((l) => {
    const own = Array.from(l.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? '').trim())
      .join('');
    return own.startsWith(labelPrefix) && l.querySelector('input[type="text"]') !== null;
  });
  const input = hit?.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error(`field not found: ${labelPrefix}`);
  await act(async () => {
    setNative(input, value);
  });
}

/** 回数を打ち、合計が `want` になるまで待つ (待てなければ、いま出ている合計を言って落ちる)。 */
async function typeCountAndWait(count: string, want: string): Promise<void> {
  await typeLabelled('賞与 年間回数', count);
  try {
    await settleUntil(() => preciseTotal() === want, `回数 ${count} で合計が ${want} になる`);
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)} いまの合計: ${preciseTotal() ?? '(読めない)'}`);
  }
}

describe('賞与の回数は 1 つの計算の中で 1 つの整数 (パス 493p)', () => {
  it('★ 2.9 回は 2 回と同じ答えを出す (賞与総額も社会保険料も同じ回数を使う)', async () => {
    await mountPage();
    await typeLabelled('賞与 (1回・円)', '500000');
    await typeLabelled('賞与 年間回数', '2');
    await waitForText(text, BONUS_NOTE);
    await settleUntil(() => preciseTotal() !== null, '精密概算の合計が出る');
    const two = preciseTotal()!;
    // 直す前は 2.9 回の賞与総額 (145 万) を年収から引き、社会保険料は 2 回分で数えていた
    await typeCountAndWait('2.9', two);
    expect(preciseTotal()).toBe(two);
    expect(text()).toContain(BONUS_NOTE);
  });

  it('★ 0.5 回は賞与なしと同じ答えで、「分けて計算します」の注記を出さない', async () => {
    await mountPage();
    await typeLabelled('賞与 (1回・円)', '500000');
    await typeLabelled('賞与 年間回数', '0');
    await settleUntil(() => preciseTotal() !== null && !text().includes(BONUS_NOTE), '賞与なしの合計が出る');
    const none = preciseTotal()!;
    await typeCountAndWait('0.5', none);
    // 直す前は 0.5 > 0 で注記を出しながら、計算は賞与を分けていなかった
    expect(text()).not.toContain(BONUS_NOTE);
  });

  it('対照: 1 回にすると答えが変わり、注記が出る (この検査が回数を見分けている)', async () => {
    await mountPage();
    await typeLabelled('賞与 (1回・円)', '500000');
    await typeLabelled('賞与 年間回数', '0');
    await settleUntil(() => preciseTotal() !== null, '賞与なしの合計が出る');
    const none = preciseTotal()!;
    await typeLabelled('賞与 年間回数', '1');
    await waitForText(text, BONUS_NOTE);
    await settleUntil(() => preciseTotal() !== null && preciseTotal() !== none, '1 回で合計が変わる');
    expect(preciseTotal()).not.toBe(none);
  });
});
