/** @vitest-environment jsdom */
/**
 * **生活費を入力していない人に「予備資金 充足率 100%」と出さない。** (2026-09-08 · パス 90)
 *
 * `emergencyFundCoverage` の目標は `月支出 × 月数`。`MutualFundsPage` は月支出を
 * `readNumberOr0` で読むので**空欄は 0** になり、目標が 0 になる。
 * 2026-09-08 まで `target <= 0` のとき `cash > 0 ? 100 : 0` を返していたので、
 * **生活費を 1 円も入力していない人に「充足率 100%」**と出していた ——
 * 財務の安全性について、最も安心させる向きの断定である。
 *
 * **規準は同じ grid の隣のタイルに在った**: 「現預金でまかなえる月数」は
 * 同じ条件 (`expense <= 0`) で既に「—」を出している。2 つの `<Stat>` が並んで
 * **100%** と **—** を同時に出していた (パス 61 と同じ形)。
 *
 * ここは**実物の画面**で 2 つのタイルを両方読む —— 純粋関数の検査
 * (`savingsPlanning.test.ts`) は値を留めるが、**並んで矛盾していたのは画面**だった。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';

let container: HTMLDivElement;
let root: Root | null = null;

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'mutual-funds');
  if (!def) throw new Error('mutual-funds service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** ラベルで `<Stat>` 1 枚の文字列を取る。見つからなければ投げる (枠が消えたら鳴る)。 */
function stat(label: string): string {
  const head = Array.from(container.querySelectorAll('div')).find(
    (el) => el.children.length === 0 && el.textContent === label,
  );
  const box = head?.parentElement;
  if (!box) throw new Error(`stat "${label}" not found`);
  return (box.textContent ?? '').replace(/\s+/g, ' ');
}

function numInput(label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`input "${label}" not found`);
  return el;
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  // **共有の fake-indexeddb を消してから始める。** ハンドルの reset だけでは
  // レコードが残り、同じ worker で走る他の検査 (`recordShapeAuditPanel` は
  // 全 collection を `list()` で数える) の件数を動かしうる ——
  // `overviewHydroponics.test.ts` と同じ後始末に揃える。
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
  document.body.removeChild(container);
});

describe('投資信託 — 生活費が未入力なら予備資金の充足率を出さない', () => {
  it('★ 月支出が空欄なら「—」で、隣のタイルと答え方が揃う', async () => {
    await mount();
    // 既定では月支出が入っているので、空にして「未入力」を作る
    await act(async () => {
      changeInput(numInput('毎月の生活費 (円)'), '');
    });
    await settle();

    expect(stat('予備資金 充足率')).toContain('—');
    expect(stat('予備資金 充足率')).not.toContain('100%');
    // 隣のタイルは元から「—」。**2 枚が同じ答え方をしている**ことを留める。
    expect(stat('現預金でまかなえる月数')).toContain('—');
    // 理由を画面に出している
    expect((container.textContent ?? '').replace(/\s+/g, ' ')).toContain(
      '毎月の生活費を入力すると予備資金の充足率を算定します',
    );
  });

  it('★ 対照: 月支出を入れれば充足率は % で出て、断り書きは消える', async () => {
    await mount();
    await act(async () => {
      changeInput(numInput('毎月の生活費 (円)'), '300000');
    });
    await settle();

    expect(stat('予備資金 充足率')).toMatch(/\d+(\.\d+)?%/);
    expect(stat('予備資金 充足率')).not.toContain('—');
    expect((container.textContent ?? '')).not.toContain('未入力のため「—」');
  });
});
