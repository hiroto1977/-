/** @vitest-environment jsdom */
/**
 * **スキル実行の指示文が、危機・他害の文面を窓口も出さずに外部のモデルへ送っていた**
 * (2026-10-28 · threat: T-208)。
 *
 * 「スキル実行」は利用者が打った指示文と、選んだスキルの定義を Anthropic へ送る。検めるのは
 * 長さだけで、危機・他害の判定が無かった。アドバイザーの質問欄 (T-207)・感情ページ (T-090) と
 * 同じ穴で、同じく画面が送る前に止める。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SkillsPage } from '../SkillsPage';
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';

let invoked: { serviceId: string; action: string; payload: Record<string, unknown> }[] = [];
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  invoked = [];
  const items = [
    {
      id: 'my-tool',
      label: 'helper',
      description: 'does things',
      source: 'user',
      path: '/home/u/.claude/skills/my-tool/SKILL.md',
      runnable: true,
      unrunnableReason: '',
    },
  ];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['skills']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: { items } }),
    invoke: (serviceId: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ serviceId, action, payload });
      return Promise.resolve({ ok: true, data: { text: 'ANSWER', stopReason: 'end_turn' } });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
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

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
}

async function openAndType(prompt: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SkillsPage));
  });
  await settleUntil(() => container.textContent?.includes('1 件のスキル') === true, '一覧が 1 件になる');
  await act(async () => {
    button('スキル実行')?.click();
  });
  await settleUntil(() => container.querySelector('select') !== null, '実行フォームが開く');
  const select = container.querySelector<HTMLSelectElement>('select')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'my-tool');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const box = container.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, prompt);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleUntil(() => !runButton().disabled, '「実行」が押せるようにならない (鍵の確認が届かない)');
}

function runButton(): HTMLButtonElement {
  const el = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === '実行');
  if (!el) throw new Error('「実行」が無い');
  return el as HTMLButtonElement;
}

const runCalls = () => invoked.filter((c) => c.action === 'run-skill');

describe('スキル実行 — 危機の文面は送らず窓口を出す (threat: T-208)', () => {
  it('★ 危機の文面は外部へ送らず、相談窓口と理由を出す (threat: T-208)', async () => {
    await openAndType('もう死にたい。このコードをどう直せばいい？');
    await act(async () => {
      runButton().click();
    });
    await waitForText(() => container.textContent ?? '', '外部サービスへは送っていません');
    expect(runCalls(), '危機の文面を外部へ送っている').toEqual([]);
    expect(container.textContent).toContain('いのちの電話');
  });

  it('★ 他害の文面も送らない (threat: T-208)', async () => {
    await openAndType('上司を殺したい。メールの下書きを作って');
    await act(async () => {
      runButton().click();
    });
    await waitForText(() => container.textContent ?? '', '外部サービスへは送っていません');
    expect(runCalls()).toEqual([]);
  });

  it('★ 対照: 危機でない指示は今までどおり送る', async () => {
    await openAndType('このコードをレビューして');
    await act(async () => {
      runButton().click();
    });
    await settleUntil(() => runCalls().length === 1, '危機でない指示が送られない');
    expect(runCalls()[0]?.payload).toEqual({ id: 'my-tool', prompt: 'このコードをレビューして' });
  });
});
