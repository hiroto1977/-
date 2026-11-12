/** @vitest-environment jsdom */
/**
 * **変換を確定する Enter で送らない** (2026-09-27 · パス 493i)。
 *
 * 日本語の入力は IME を通る。変換を確定する Enter は **IME への操作**であって、
 * 画面への操作ではない。ところが実 chromium (141) は、変換中に届いた Enter の keydown を
 * **`key: 'Enter'` のまま `isComposing: true` で**ページへ渡す (2026-09-27 実測 —— CDP で
 * 変換中の文字を置いてから Enter を届けた。同じ測定で、`<form>` の暗黙の送信は変換の確定では
 * 起きず、確定の後の Enter でだけ起きることも確かめた)。Safari は確定の**後**に
 * `isComposing: false`・`keyCode: 229` の keydown を届ける。
 *
 * 2026-09-27 まで、keydown を直に読む送信口はどれも `e.key === 'Enter'` だけを見ていた
 * (実測 10 か所・うち送信の欄 4 つがこの検査の対象)。**アドバイザーへの質問を日本語で打って
 * 変換を確定した瞬間に、打ちかけの質問が有料の AI へ送られた**。
 *
 * 判定は `renderer/keyIntent.ts` の 1 つ (`isSubmitEnter`)。母集団は
 * `renderer/__tests__/keyIntentCensus.test.ts` が数える。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement } from '../../__tests__/jsdomWait';

interface Field {
  /** 画面のサービス id。 */
  readonly page: 'stocks' | 'business';
  /** 欄を掴む placeholder (画面にだけ在る綴り)。 */
  readonly placeholder: string;
  /** 打つ値。 */
  readonly value: string;
  /** その欄の Enter が送る action。 */
  readonly action: string;
  readonly label: string;
}

const FIELDS: readonly Field[] = [
  { page: 'stocks', placeholder: '例: 長期保有に向いている銘柄を 3 つ', value: '長期保有に向く銘柄', action: 'advise', label: '株式アドバイザーへの質問' },
  { page: 'business', placeholder: '例: 来期に最も注力すべき事業を 3 つ', value: '来期の注力事業', action: 'advise', label: '経営アドバイザーへの質問' },
  { page: 'stocks', placeholder: '銘柄コード (例: AAPL / 7203.T / ^N225)', value: 'AAPL', action: 'register-ticker', label: '銘柄の登録' },
  { page: 'stocks', placeholder: '銘柄コード (例: AAPL / 7203.T)', value: 'AAPL', action: 'compare-strategies', label: '戦略の比較' },
];

let invoked: string[];
let container: HTMLDivElement;
let root: Root | null = null;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_service: string, action: string) => {
      invoked.push(action);
      return Promise.resolve({ ok: false, code: 'x', message: '検査の返事' });
    },
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(false),
    authorize: () => Promise.resolve({ ok: false }),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

async function mountField(f: Field): Promise<HTMLInputElement> {
  stubHub();
  const def = SERVICES.find((s) => s.id === f.page);
  if (!def) throw new Error(`${f.page} service missing from the sidebar`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  const input = await waitForElement(
    () => container.querySelector<HTMLInputElement>(`input[placeholder="${f.placeholder}"]`),
    `${f.label}の欄`,
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, f.value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

async function pressEnter(input: HTMLInputElement, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }));
  });
  // 送信は handler の最初の同期部分で起きる (invoke は最初の await より前)。1 周だけ流して返事の後始末も済ませる。
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  invoked = [];
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe.each(FIELDS)('$label の Enter', (f) => {
  it('★ 変換中 (isComposing) の Enter では送らない —— 変換の確定は IME への操作', async () => {
    const input = await mountField(f);
    await pressEnter(input, { isComposing: true });
    expect(invoked.filter((a) => a === f.action)).toEqual([]);
  });

  it('★ 確定の後に keyCode 229 で届く Enter (Safari の形) でも送らない', async () => {
    const input = await mountField(f);
    await pressEnter(input, { keyCode: 229 });
    expect(invoked.filter((a) => a === f.action)).toEqual([]);
  });

  it('対照: 変換していない Enter は 1 回送る (上の 2 件の針が的に当たる)', async () => {
    const input = await mountField(f);
    await pressEnter(input, {});
    expect(invoked.filter((a) => a === f.action)).toEqual([f.action]);
  });
});
