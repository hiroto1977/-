/** @vitest-environment jsdom */
/**
 * **未入力の膜仕様から「測定値」も「法規制の判定」も作らない (画面の側)。**
 *
 * パス 69 は `roRejectionPct` が未入力のときの `accumulationRisk` を `null` にしたが、
 * **同じ `rej` を読む `permeateEcCarryoverPct` を取り残していた** —— 除去率を空にすると
 * `(1 − 0) × 100` = **100** になり、水循環プランナーのパネルは
 *
 * | 同じパネルの中で同時に出ていた 2 文 |
 * | --- |
 * | 「透過水の EC 持ち越し **100.0%**」= 膜が塩を 1 つも除去しない、という**測定値** |
 * | 「RO 塩除去率が未入力のため、塩類蓄積の判定はしていません」= パス 69 が入れた**断り書き** |
 *
 * —— **両立しない。** 読み直すと未入力の欄はもう 1 つあり、`roRecoveryPct` を空にすると
 * 「実際の水回収率 **0.0%** / 濃縮倍率 **1倍** / 年間節水量 **0 L** / 年間排出量 = 全量」
 * = **循環設備が何も回収していない**という測定結果になった。さらにその排出量は
 * `checkEffluent` へ流れて `wpclNpApplicable = toPublic && 0 >= 50` を必ず **false** にし、
 * **「水質汚濁防止法の窒素・りん規制の対象にならない」という法規制の判定**を
 * 空欄から作っていた (画面は `&&` で描くので黙って消え、「対象外」と区別できない)。
 *
 * どちらの欄も `min: 1` (回収率は `max: 99`) なので **0 は画面が受け付けない値**であり、
 * 空欄と 0 は別である。ここは**画面の側**を留める —— パス 66 の教訓 (計算を直しても
 * 画面の分岐は別に検査が要る) をそのまま当てる。
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
  const def = SERVICES.find((s) => s.id === 'real-estate');
  if (!def) throw new Error('real-estate service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** React の制御入力へ「利用者が消した」を届ける (native setter + input イベント)。 */
async function setField(ariaLabel: string, next: string): Promise<void> {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (!el) throw new Error(`field not found: ${ariaLabel}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('no value setter');
  await act(async () => {
    setter.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** タイルの値。`Stat` は label div + value div なので、label で引いて次を読む。 */
function tile(label: string): string {
  const labels = Array.from(container.querySelectorAll('div')).filter(
    (d) => (d.textContent ?? '').trim() === label && d.children.length === 0,
  );
  const found = labels[0];
  if (!found) throw new Error(`tile not found: ${label}`);
  const value = found.nextElementSibling;
  if (!value) throw new Error(`tile has no value: ${label}`);
  return (value.textContent ?? '').trim();
}

beforeEach(async () => {
  _resetRecordStoreForTests();
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

describe('水循環プランナー — 未入力の膜仕様を画面が測定値にしない', () => {
  it('★ 対照: 既定 (回収率 75 / 除去率 90) では断り書きは出ず、欄は数で出る', async () => {
    await mountPage();
    expect(container.querySelector('[data-recovery-unset]')).toBeNull();
    expect(container.querySelector('[data-rejection-unset]')).toBeNull();
    expect(container.querySelector('[data-wpcl-undetermined]')).toBeNull();
    // 標本が在ることの確認 —— 床が全部を「—」にしていない。
    expect(tile('実際の水回収率')).toBe('75.0%');
    expect(tile('透過水の EC 持ち越し')).toBe('10.0%');
    expect(tile('再利用する透過水')).toMatch(/^[\d,]+ L$/);
  });

  it('★ 除去率を空にすると「100.0%」ではなく「—」で、断り書きと矛盾しない', async () => {
    await mountPage();
    await setField('RO 塩除去率 (%)', '');
    // 直す前はここが 100.0% だった —— 膜が塩を 1 つも除去しないという測定値。
    expect(tile('透過水の EC 持ち越し')).toBe('—');
    expect(tile('透過水の EC 持ち越し')).not.toBe('100.0%');
    // パス 69 の断り書きは出たままで、両者が同じ向きを述べる。
    expect(container.querySelector('[data-rejection-unset]')).not.toBeNull();
    expect(text()).toContain('RO 塩除去率が未入力のため、塩類蓄積の判定はしていません');
    // 除去率は回収率と独立 —— 水収支の側を巻き込まない。
    expect(container.querySelector('[data-recovery-unset]')).toBeNull();
    expect(tile('実際の水回収率')).toBe('75.0%');
  });

  it('★ 回収率を空にすると水収支 5 欄が「—」になり、理由を画面が述べる', async () => {
    await mountPage();
    await setField('RO 回収率 (%)', '');
    for (const label of ['再利用する透過水', '排出する濃縮廃液', '補給する新水', '年間節水量', '年間排出量']) {
      expect(tile(label)).toBe('—');
    }
    // 直す前: 0.0% / 1倍 —— 「何も回収していない」という測定値。
    expect(tile('実際の水回収率')).toBe('—');
    expect(tile('実際の水回収率')).not.toBe('0.0%');
    expect(tile('濃縮倍率')).not.toBe('1倍');
    expect(container.querySelector('[data-recovery-unset]')).not.toBeNull();
    expect(text()).toContain('RO 回収率が未入力のため、水収支');
    // 「100% は成立しません」の赤帯を未入力に当てない。
    expect(text()).not.toContain('回収率 100% は物質収支上成立しません');
  });

  it('★ 回収率が空なら、水質汚濁防止法の対象かを判定しない (「対象外」に倒さない)', async () => {
    await mountPage();
    await setField('RO 回収率 (%)', '');
    expect(tile('1日あたり排出')).toBe('—');
    expect(tile('年間 窒素排出')).toBe('—');
    expect(tile('年間 りん排出')).toBe('—');
    expect(container.querySelector('[data-wpcl-undetermined]')).not.toBeNull();
    expect(text()).toContain('水質汚濁防止法の窒素・りん規制の対象かは判定していません');
    // 濃度だけで決まる欄は答える —— 床を当てすぎない。
    expect(tile('地下水基準比 (硝酸性N)')).toMatch(/^[\d.]+倍$/);
  });

  it('★ どちらを空にしても文字列 "null" / "NaN" / "undefined" を刷らない', async () => {
    await mountPage();
    for (const label of ['RO 回収率 (%)', 'RO 塩除去率 (%)']) {
      await setField(label, '');
    }
    const t = text();
    for (const bad of ['null', 'NaN', 'undefined', 'Infinity']) expect(t).not.toContain(bad);
    // 標本 —— この検査が実際に画面の文字を見ていること。
    expect(t).toContain('水循環プランナー');
  });
});
