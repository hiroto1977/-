/** @vitest-environment jsdom */
/**
 * **`invoke` が失敗したことを、画面が言う** (2026-09-12 · パス 176)。
 *
 * 母集団と台帳は `__tests__/invokeFailureSurfaced.test.ts` (走査) が持つ。
 * ここが持つのは**振る舞い** —— 失敗したときに何が出るか、成功したときに出ないか。
 *
 * ## 直す前に起きていたこと
 *
 * | 画面 | 押した後 |
 * | --- | --- |
 * | 人材育成「登用可否を判定」 | 「判定中…」→ 元に戻るだけ。判定も理由も出ない (押せていないと読める) |
 * | AI の村 (話しかける) | 端末内の簡易応答だけが返る。AI へ行って断られたことは何処にも出ない |
 *
 * どちらも `if (res.ok) …` に else が無い形で、村はさらに `catch` が空だった。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

/** 村は返事を読み上げる。jsdom に speechSynthesis は無いので黙らせる。 */
vi.mock('../../voice/ttsAdapter', () => ({
  speak: () => undefined,
  cancelSpeech: () => undefined,
}));

/** invoke が返す物 (検査ごとに差し替える)。 */
let result: { ok: true; data: unknown } | { ok: false; code: string; message: string };
let invoked: { serviceId: string; action: string }[];

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  invoked = [];
  result = { ok: false, code: 'locked', message: '保管庫が施錠されています' };
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'stub' }),
    invoke: (serviceId: string, action: string) => {
      invoked.push({ serviceId, action });
      // プロバイダ設定状況の問い合わせは別物 (失敗しても村の断りではない)。
      if (action === 'providers') return Promise.resolve({ ok: true, data: { providers: [] } });
      return Promise.resolve(result);
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
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

async function mount(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`service ${id} missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settleUntil(() => (container.textContent ?? '').length > 0, `${id} が描かれる`);
}

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

async function click(text: string): Promise<void> {
  const el = await waitForElement(
    () => buttons().find((b) => b.textContent?.trim() === text) ?? null,
    `ボタン「${text}」`,
  );
  await act(async () => {
    el.click();
  });
}

describe('人材育成の登用判定 — 失敗を言う (パス 176)', () => {
  it('★ 失敗すると理由が出る (押しても何も起きない形ではない)', async () => {
    await mount('talent');
    expect(container.querySelector('[data-judge-error]'), '押す前から出ている').toBeNull();
    await click('登用可否を判定');
    const node = await waitForElement(
      () => container.querySelector('[data-judge-error]'),
      '判定の失敗の理由',
    );
    expect(node.textContent).toContain('判定できませんでした');
    expect(node.textContent).toContain('保管庫が施錠されています');
    expect(node.getAttribute('role')).toBe('alert');
    expect(invoked.some((c) => c.action === 'judge-leader'), '判定を呼んでいない').toBe(true);
  });

  it('★ 対照: 成功すると判定が出て、失敗の文は出ない', async () => {
    result = { ok: true, data: { fitness: { eligible: true, hits: [] }, candidate: '' } };
    await mount('talent');
    await click('登用可否を判定');
    await settleUntil(
      () => (container.textContent ?? '').includes('該当なし') || (container.textContent ?? '').includes('据えて'),
      '判定の結果が出る',
    );
    expect(container.querySelector('[data-judge-error]'), '成功したのに失敗の文が出ている').toBeNull();
  });

  it('★ 投げた例外も言う (空の catch にしない)', async () => {
    await mount('talent');
    (globalThis as unknown as { serviceHub: { invoke: () => Promise<never> } }).serviceHub.invoke = () =>
      Promise.reject(new Error('bridge が落ちた'));
    await click('登用可否を判定');
    const node = await waitForElement(
      () => container.querySelector('[data-judge-error]'),
      '例外の理由',
    );
    expect(node.textContent).toContain('bridge が落ちた');
  });
});

describe('AI の村 — AI が答えられなかったことを言う (パス 176)', () => {
  /** 文字で話しかける (マイクを使わない経路)。 */
  async function speakText(text: string): Promise<void> {
    const box = await waitForElement(
      () => container.querySelector<HTMLInputElement>('input[aria-label="村への入力"]'),
      '村への入力',
    );
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('伝える');
  }

  it('★ 失敗すると理由が出て、端末内の簡易応答は残る', async () => {
    await mount('village');
    await speakText('所得税について教えて');
    const node = await waitForElement(
      () => container.querySelector('[data-village-ai-error]'),
      'AI の失敗の理由',
    );
    expect(node.textContent).toContain('端末内の簡易応答');
    expect(node.textContent).toContain('保管庫が施錠されています');
    expect(invoked.some((c) => c.action === 'chat'), 'AI を呼んでいない').toBe(true);
  });

  it('★ 対照: 答えが返れば理由は出ない', async () => {
    result = { ok: true, data: { text: '所得税は所得に応じて課されます。', provider: 'anthropic' } };
    await mount('village');
    await speakText('所得税について教えて');
    await settleUntil(
      () => (container.textContent ?? '').includes('所得税は所得に応じて'),
      'AI の答えが出る',
    );
    expect(container.querySelector('[data-village-ai-error]'), '成功したのに理由が出ている').toBeNull();
  });

  it('★ 本文が空の成功も言う (答えが来ていないのに黙らない)', async () => {
    result = { ok: true, data: { text: '', provider: 'anthropic' } };
    await mount('village');
    await speakText('所得税について教えて');
    const node = await waitForElement(
      () => container.querySelector('[data-village-ai-error]'),
      '空応答の理由',
    );
    expect(node.textContent).toContain('応答が空でした');
  });
});
