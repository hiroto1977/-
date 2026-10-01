/** @vitest-environment jsdom */
/**
 * **チャットが「必ず失敗する書き込み」の承認を求めない。** (2026-09-09 · パス 109)
 *
 * `slack/send-message` は `channel` と `text` を必須にするが、`parseVoiceCommand` は
 * `params` を一度も設定しない。2026-09-09 まで、チャットは
 * 「🛠 Slack で「send-message」を実行します」「⚠ 書き込み操作のため、実行前に
 * 確認してください」と述べて確認ダイアログを出し、押せば
 * 「channel and text are required」で落ちていた。
 *
 * ## この検査が在る理由 — 字面の検査では穴が塞げなかった
 *
 * 最初は「共有の判断を呼んでいるか」「`setPendingIntent` より前に return するか」を
 * **字面**で見ていた。対照 (`if (refusal !== null)` → `if (false)`) を回すと
 * **全部通った** —— 死んだ枝でも呼び出しの綴りは残り、return の順序も変わらない。
 * **振る舞いを見るしかない**: 確認ダイアログが出ないこと・`invoke` が呼ばれないこと。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';

/** `ACTION_RULES` の「送って」+ サービス名で `slack/send-message` に解決される。 */
const WRITE_TEXT = 'Slack にメッセージを送って';
/** 対照: 書き込みでない問い (確認も断りも出ない)。 */
const READ_TEXT = 'GitHub を開いて';

const invoked: Array<{ serviceId: string; action: string }> = [];

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (serviceId: string, action: string) => {
      invoked.push({ serviceId, action });
      return Promise.resolve({ ok: false, code: 'x', message: 'x' });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, {
        value: () => undefined,
        configurable: true,
        writable: true,
      });
    }
  }
});

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function openWidget(): Promise<HTMLElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ChatbotWidget));
  });
  await settle();
  const launcher = Array.from(container.querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === 'AI コンシェルジュを開く',
  );
  if (!launcher) throw new Error('launcher not found');
  await act(async () => {
    launcher.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
  const dialog = container.querySelector('[role="dialog"]');
  if (!dialog) throw new Error('dialog not open');
  return dialog as HTMLElement;
}

async function ask(dialog: HTMLElement, text: string): Promise<void> {
  const input = dialog.querySelector('input[aria-label="チャット入力"]') as HTMLInputElement | null;
  if (!input) throw new Error('input not found');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const form = dialog.querySelector('form');
  if (!form) throw new Error('form not found');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  invoked.length = 0;
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

describe('チャット — 渡せない書き込みは承認を求めずに断る', () => {
  it('★ 断りの文面が出る (足りない項目を名指しする)', async () => {
    const dialog = await openWidget();
    await ask(dialog, WRITE_TEXT);
    const text = dialog.textContent ?? '';
    expect(text, '断りが出ていない').toContain('実行しません');
    expect(text, '足りない項目を名指ししていない').toContain('channel / text');
  });

  it('★ 確認ダイアログを出さない (起こり得ないことに承認を求めない)', async () => {
    const dialog = await openWidget();
    await ask(dialog, WRITE_TEXT);
    const confirm = dialog.querySelector('[role="alertdialog"]');
    expect(confirm, '実行できないのに確認を出している').toBeNull();
    expect(dialog.textContent ?? '').not.toContain('書き込み操作を実行しますか');
  });

  it('★ invoke を呼ばない (落ちるだけの呼び出しをしない)', async () => {
    const dialog = await openWidget();
    await ask(dialog, WRITE_TEXT);
    expect(
      invoked.filter((i) => i.serviceId === 'slack'),
      'slack へ invoke している',
    ).toEqual([]);
  });

  it('★ 対照: 書き込みでない問いには断りも確認も出ない', async () => {
    const dialog = await openWidget();
    await ask(dialog, READ_TEXT);
    const text = dialog.textContent ?? '';
    expect(text, '書き込みでないのに断っている').not.toContain('実行しません');
    expect(dialog.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
