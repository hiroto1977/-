/** @vitest-environment jsdom */
/**
 * **未入力から「逆レバレッジ」という判定を作らない。**
 *
 * 不動産のレバレッジ試算は 4 つのタイルを並べる (実質利回り / 返済後CF / CCR /
 * イールドギャップ)。2026-09-08 まで、**割れない量を 0 に倒したうえで、その 0 を
 * 別の指標の入力にしていた**:
 *
 * | 打ち込み | 実質利回り | イールドギャップ | 画面の色 |
 * | --- | ---: | ---: | --- |
 * | 既定 (価格 4,200 万) | 3.37% | +1.37% | 緑 |
 * | **物件価格を空に** | **0%** | **−2%** | **赤** |
 *
 * 画面の説明は「プラスなら正レバレッジ」なので、**価格を入れ忘れただけで
 * 「逆レバレッジ」という判定が出る**。0 は伝播すると値ではなく判定になる。
 *
 * CCR も同じ形だが向きが逆で、**順位が反転**していた —— 自己資金 0
 * (欄は `allowZero: true` = フルローンを明示的に許す) で CCR 0% が出るので、
 * 同じ持ち出しでも**自己資金を 1 円も入れないほうが良い数字**として並ぶ。
 *
 * ここは**実物の入力欄を打って**画面を見る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';

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
  for (let i = 0; i < 5; i += 1) {
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

/** `Stat` タイルの値だけを読む (画面の他の「%」に当たらないように)。 */
function statValue(label: string): string | null {
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children);
    if (kids.length !== 2) continue;
    if ((kids[0]?.textContent ?? '').trim() !== label) continue;
    return (kids[1]?.textContent ?? '').trim();
  }
  return null;
}

/** タイルの値に付いた文字色 (緑 = 正レバレッジ / 赤 = 逆レバレッジ / 無色 = 判定なし)。 */
function statColor(label: string): string {
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children);
    if (kids.length !== 2) continue;
    if ((kids[0]?.textContent ?? '').trim() !== label) continue;
    return (kids[1] as HTMLElement).style.color;
  }
  return '';
}

const scopeBand = (): string =>
  Array.from(container.querySelectorAll('[data-leverage-scope]'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
    .join(' | ');

/** React の制御された input へ値を入れる。 */
async function typeInto(label: string, value: string): Promise<void> {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`input "${label}" not found`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
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

describe('不動産 レバレッジ試算 — 算定不能から判定を作らない', () => {
  it('★ 対照: 既定の入力では 4 つのタイルが数で出て、正レバレッジが緑になる', async () => {
    await mountPage();
    expect(statValue('実質利回り')).toMatch(/^\d+\.\d+%$/);
    expect(statValue('CCR (自己資金回収率)')).toMatch(/^-?\d+\.\d+%$/);
    expect(statValue('イールドギャップ')).toMatch(/^\d+\.\d+%$/);
    expect(statColor('イールドギャップ')).toBe('rgb(34, 197, 94)'); // 緑 = 正レバレッジ
    expect(scopeBand()).toBe('');
  });

  it('★ 物件価格を空にしても「逆レバレッジ」と判定しない', async () => {
    await mountPage();
    await typeInto('物件価格', '');
    // 直す前は 実質利回り 0% / イールドギャップ −2% (赤) だった
    expect(statValue('実質利回り')).toBe('—');
    expect(statValue('イールドギャップ')).toBe('—');
    expect(statColor('イールドギャップ')).toBe(''); // 色を付けない = 判定しない
    expect(scopeBand()).toContain('物件価格が未入力');
  });

  it('★ 自己資金 0 (フルローン) で CCR を「0%」と刷らない', async () => {
    await mountPage();
    await typeInto('自己資金', '0');
    expect(statValue('CCR (自己資金回収率)')).toBe('—');
    expect(scopeBand()).toContain('自己資金が 0 円');
    // **返済後 CF は算定できている** —— 率が出せないことと、手残りが分からない
    // ことは別。フルローンでも持ち出しの額は言える。
    expect(statValue('返済後CF (年)')).not.toBe('—');
  });

  it('★ 打ち込みを消せば元に戻る (関門が値に追随していること)', async () => {
    await mountPage();
    await typeInto('自己資金', '0');
    expect(statValue('CCR (自己資金回収率)')).toBe('—');
    await typeInto('自己資金', '10000000');
    expect(statValue('CCR (自己資金回収率)')).toMatch(/^-?\d+\.\d+%$/);
    expect(scopeBand()).toBe('');
  });
});
