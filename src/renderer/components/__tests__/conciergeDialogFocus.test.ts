/** @vitest-environment jsdom */
/**
 * **浮いた窓とその中の確認は、キーボードで入れて・閉じられて・戻れる** (2026-10-07 · パス 506)。
 *
 * 実機 (Chromium 1280×800・4 配色) で測った直す前の形:
 * - 🤖 を押して開いても焦点は 🤖 に残り、**次の Tab は窓の外** (窓は DOM で 🤖 より前に在ったので
 *   Tab の順も窓を飛ばした)。
 * - Esc で閉じない (WAI-ARIA APG の dialog の約束)。✕ で閉じると焦点は body へ落ちる。
 * - 「要望リストの消去の確認」(alertdialog) も同じ —— 焦点は運ばれず、Esc も効かない。
 *
 * 直し: `useDialogFocus` 1 つで 3 つの dialog を揃えた —— 開いたら印 `data-dialog-initial` の操作子へ
 * (窓は入力欄・確認は**取り消す側**のボタン)・Esc = 閉じる / 取り消す (IME の変換確定の Esc は除く)・
 * 消えたら押した物へ戻す。🤖 は窓より**前**に描く (開いた直後の Tab が窓の中へ入る)。
 *
 * ★ 「実行確認」(書き込みの確認・`pendingIntent`) は同じ hook で配線したが、**今日その状態へ届く道は無い**
 * (実測: `VOICE_WRITE_REQUIREMENTS` の 7 行はどれも必須欄を持ち、解析器は `params` を 1 つも設定しないので
 * `voiceWriteRefusal` が常に断る —— 部品の注記が 2026-09-09 から述べている当のこと)。
 * その配線は `dialogSitesCensus.test.ts` (構文木) と `useDialogFocus.test.ts` (hook) が持つ。
 *
 * 待ちは条件で取る (法則 `wait-for-condition-not-ticks`) —— このファイルは固定回数の待ちを持たない。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget, type ChatbotWidgetProps } from '../ChatbotWidget';
import { waitForElement } from '../../__tests__/jsdomWait';

const REQUESTS_KEY = 'chatbot-requests';
const A = { text: '経費精算の機能を作ってほしい', at: '2026-09-27T01:00:00.000Z' };
const LAUNCHER = 'button[aria-label="AI コンシェルジュを開く"]';
const CLOSER = 'button[aria-label="チャットを閉じる"]';
const EXPORT = 'button[aria-label="要望リストをエクスポート"]';

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
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
});

let container: HTMLDivElement;
let root: Root | null = null;
const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel);

async function render(props: ChatbotWidgetProps = {}): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ChatbotWidget, { key: 'widget', ...props }));
  });
}

async function open(): Promise<HTMLElement> {
  await render();
  const launcher = await waitForElement(() => q<HTMLButtonElement>(LAUNCHER), '🤖 の入口');
  await act(async () => {
    launcher.click();
  });
  return waitForElement(() => q<HTMLElement>('[role="dialog"]'), 'コンシェルジュの窓');
}

async function key(target: Element, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

async function press(el: Element | null | undefined, what: string): Promise<void> {
  expect(el, `${what} が無い`).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:probe', configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true, writable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('浮いた窓 (role=dialog)', () => {
  it('★ 開いたら焦点は入力欄へ・窓は 🤖 の後ろに描かれる (Tab の順が窓の中へ入る)', async () => {
    const dialog = await open();
    const input = q('.concierge-input')!;
    expect(document.activeElement, '開いた直後の焦点').toBe(input);
    const closer = q(CLOSER)!;
    expect(closer.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING, '窓は 🤖 (✕) の後ろ').not.toBe(0);
  });

  it('★ Esc で閉じ、焦点は 🤖 へ戻る', async () => {
    const dialog = await open();
    await key(q('.concierge-input')!, { key: 'Escape' });
    expect(dialog.isConnected, '窓が閉じた').toBe(false);
    expect(q('[role="dialog"]')).toBeNull();
    expect(document.activeElement, '焦点は 🤖 へ').toBe(q(LAUNCHER));
  });

  it('IME の変換を確定する Esc では閉じない (isComposing)', async () => {
    const dialog = await open();
    await key(q('.concierge-input')!, { key: 'Escape', isComposing: true });
    expect(dialog.isConnected, '変換中の Esc で窓が閉じた').toBe(true);
    // 対照: 同じ鍵で isComposing が無ければ閉じる
    await key(q('.concierge-input')!, { key: 'Escape' });
    expect(dialog.isConnected).toBe(false);
  });

  it('✕ で閉じても焦点は 🤖 へ (body へ落ちない)', async () => {
    await open();
    await press(q(CLOSER), '✕');
    expect(q('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(q(LAUNCHER));
  });

  it('対照: 列 (docked) は窓ではない —— role も焦点の移動も持たない', async () => {
    await render({ docked: true });
    await waitForElement(() => q('.concierge-input'), '列の入力欄');
    expect(q('[role="dialog"]')).toBeNull();
    expect(document.activeElement, '列は開いた瞬間に焦点を奪わない').toBe(document.body);
    await key(q('.concierge-input')!, { key: 'Escape' });
    expect(q('.concierge-input'), '列は Esc で消えない').not.toBeNull();
  });
});

describe('要望リストの消去の確認 (role=alertdialog)', () => {
  it('★ 出たら焦点は取り消す側 (「残す」) へ・Esc で取り消し、焦点は押した「📥 要望」へ戻る —— 窓は閉じない', async () => {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify([A]));
    const dialog = await open();
    await press(q(EXPORT), '📥 要望');
    const offer = await waitForElement(() => q('[role="alertdialog"][data-requests-clear-offer]'), '消去の確認');
    const keep = Array.from(offer.querySelectorAll('button')).find((b) => b.textContent === '残す')!;
    expect(document.activeElement, '焦点は「残す」').toBe(keep);
    await key(keep, { key: 'Escape' });
    expect(offer.isConnected, '確認が閉じた').toBe(false);
    expect(localStorage.getItem(REQUESTS_KEY), 'Esc は「残す」—— 1 件も消さない').toBe(JSON.stringify([A]));
    expect(dialog.isConnected, '確認の Esc は窓まで閉じない').toBe(true);
    expect(document.activeElement, '焦点は 📥 要望 へ').toBe(q(EXPORT));
  });

  it('「残す」を押して閉じても、焦点は「📥 要望」へ戻る', async () => {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify([A]));
    await open();
    await press(q(EXPORT), '📥 要望');
    const offer = await waitForElement(() => q('[role="alertdialog"]'), '消去の確認');
    await press(Array.from(offer.querySelectorAll('button')).find((b) => b.textContent === '残す'), '残す');
    expect(q('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(q(EXPORT));
  });
});
