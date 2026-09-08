/** @vitest-environment jsdom */
/**
 * **空欄の敷地寸法から「この敷地には 0 ㎡しか建てられない」を刷らない (画面の側)。**
 *
 * `敷地の奥行 (m)` / `敷地の間口 (m)` は `kind: 'length'` (= `allowZero` 無し =
 * **0 は fatal**) なのに、読み取りが `readNumberOr0` だったので空欄が 0 として
 * `planSetbackTradeoff` に入り、**空欄の結果が「本物の建てられない敷地」の結果と
 * 完全に一致していた** (どちらも幅 0 / 面積 0 / `limitedBy: 'geometry'`)。
 *
 * 画面がそれをどう述べていたか:
 *
 * | タイル | 直す前の表示 |
 * | --- | ---: |
 * | 建てられる奥行 | **0 m** |
 * | 建てられる間口 | **0 m** |
 * | **建築面積 (寸法で決まる)** | **0 ㎡** |
 *
 * ラベルの「(寸法で決まる)」は **寸法が拘束条件だという主張**で、寸法を知らないまま
 * 述べられない。立体プレビューも 0×0 の箱を描き、説明文が
 * 「間口 0 m × 奥行 0 m で…の概形」と**寸法を名指しして**いた。
 *
 * ここは**画面の側**を留める (パス 66 の教訓 —— 計算を直しても、ラベルの文と
 * 図を描くかどうかは別の欠陥で、単位検査では鳴らない)。
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
  const found = Array.from(container.querySelectorAll('div')).find(
    (d) => (d.textContent ?? '').trim() === label && d.children.length === 0,
  );
  if (!found) throw new Error(`tile not found: ${label}`);
  const value = found.nextElementSibling;
  if (!value) throw new Error(`tile has no value: ${label}`);
  return (value.textContent ?? '').trim();
}

/** そのラベルのタイルが在るか (ラベル自体が主張なので、有無も検査の対象)。 */
const hasTile = (label: string): boolean =>
  Array.from(container.querySelectorAll('div')).some(
    (d) => (d.textContent ?? '').trim() === label && d.children.length === 0,
  );

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

describe('用途地域プランナー — 未入力の敷地寸法を画面が判定にしない', () => {
  it('★ 対照: 既定 (奥行 20 / 間口 15) では断り書きは出ず、寸法も面積も数で出る', async () => {
    await mountPage();
    expect(container.querySelector('[data-site-dimensions-unset]')).toBeNull();
    expect(container.querySelector('[data-iso-unset]')).toBeNull();
    expect(tile('建てられる奥行')).toMatch(/^[\d.,]+ m$/);
    expect(tile('建てられる間口')).toBe('12 m');
    // ラベルが何に縛られているかを名指しする (寸法が分かっているので言える)。
    expect(hasTile('建築面積 (寸法で決まる)') || hasTile('建築面積 (建ぺい率で頭打ち)')).toBe(true);
    expect(hasTile('建築面積')).toBe(false);
  });

  it('★ 両方を空にすると寸法・面積が「—」になり、理由を画面が述べる', async () => {
    await mountPage();
    await setField('敷地の奥行 (m)', '');
    await setField('敷地の間口 (m)', '');
    expect(tile('建てられる奥行')).toBe('—');
    expect(tile('建てられる間口')).toBe('—');
    expect(tile('建てられる奥行')).not.toBe('0 m');
    // ラベルは「寸法で決まる」と名指ししない (それは寸法を知っている人の言葉)。
    expect(hasTile('建築面積')).toBe(true);
    expect(hasTile('建築面積 (寸法で決まる)')).toBe(false);
    expect(tile('建築面積')).toBe('—');
    const band = container.querySelector('[data-site-dimensions-unset]');
    expect(band).not.toBeNull();
    const t = (band!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('敷地の奥行と間口が未入力のため');
    expect(t).toContain('建築面積は算定していません');
    // 寸法に依らない欄は有効だと述べる (床を当てすぎていないことを画面でも言う)。
    expect(t).toContain('寸法に依らず有効');
  });

  it('★ 片方だけ空なら、その片方だけを落として理由もその片方を名指しする', async () => {
    await mountPage();
    await setField('敷地の間口 (m)', '');
    expect(tile('建てられる間口')).toBe('—');
    expect(tile('建てられる奥行')).toMatch(/^[\d.,]+ m$/); // 奥行は分かっている
    expect(tile('建築面積')).toBe('—'); // 面積は両方が要る
    const t = (container.querySelector('[data-site-dimensions-unset]')!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('敷地の間口が未入力のため');
    expect(t).not.toContain('奥行と間口');
  });

  it('★ 寸法が空なら立体プレビューを描かず、「間口 0 m × 奥行 0 m」と述べない', async () => {
    await mountPage();
    await setField('敷地の奥行 (m)', '');
    expect(container.querySelector('[data-iso-unset]')).not.toBeNull();
    expect(text()).toContain('立体プレビューは描いていません');
    expect(text()).not.toContain('間口 0 m × 奥行 0 m');
    expect(text()).not.toMatch(/間口 0 m/);
  });

  it('★ 寸法が在って面積が 0 なら、0 を判定として刷る (未入力と混ぜない)', async () => {
    await mountPage();
    // 間口 3m を側面後退 3m が食い尽くす —— 本物の「建てられない敷地」。
    await setField('敷地の間口 (m)', '3');
    expect(tile('建てられる間口')).toBe('0 m');
    expect(container.querySelector('[data-site-dimensions-unset]')).toBeNull();
    // 何に縛られているかは言える (寸法が分かっているので)。
    expect(hasTile('建築面積 (寸法で決まる)')).toBe(true);
    expect(tile('建築面積 (寸法で決まる)')).toBe('0 ㎡');
  });

  it('★ 空にしても文字列 "null" / "NaN" / "undefined" を刷らない', async () => {
    await mountPage();
    for (const label of ['敷地の奥行 (m)', '敷地の間口 (m)']) await setField(label, '');
    const t = text();
    for (const bad of ['null', 'NaN', 'undefined', 'Infinity']) expect(t).not.toContain(bad);
    expect(t).toContain('後退と建築面積のトレードオフ'); // 標本 — 画面の文字を見ている
  });
});
