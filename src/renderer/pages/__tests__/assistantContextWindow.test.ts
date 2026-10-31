/** @vitest-environment jsdom */
/**
 * **断り書きが、送る会話の量を 2 倍に述べていた** (2026-09-12 · パス 186)。
 *
 * `AssistantPage` の egress の断り (パス 106 / 107 が置いた「何が外へ出るか」) は
 *
 *   入力した質問文と、直近 16 **往復**までの会話 (AI の返答を含む…)
 *
 * と書いていた。実際に送るのは `history.slice(-TURN_WINDOW)` ——
 * **平らな発話の列の末尾 16 発話**で、往復 (利用者 + AI の 1 組) に直すと約 8 往復。
 * 単位の取り違えで、**送る量を 2 倍に述べていた**。
 *
 * ## ここで留めること
 *
 * 1. **断りの数字が定数から来ている** (写しではない)
 * 2. **単位が「発話」である** (往復ではない)
 * 3. **実際に送る件数がその数字と一致する** —— これが要。数字と文面だけ合わせても
 *    「口はあるが繋がっていない」になるので、画面を描いて送らせ、`invoke` の
 *    payload の件数を数える (パス 175 の「直した側と画面の間が切れている」)。
 *
 * パス 106 / 107 の走査 (`aiEgressDisclosed.test.ts`) は「断りが在るか」を見る。
 * **何と書いてあるかを実装に照らす検査は無かった。**
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantPage, ASSISTANT_TURN_WINDOW } from '../AssistantPage';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../../shared/assistantLimits';
import { settleUntil } from '../../__tests__/jsdomWait';

/** 村と同じく音声の口を黙らせる (jsdom に speechSynthesis は無い)。 */
vi.mock('../../voice/speechAdapter', () => ({
  isSpeechRecognitionSupported: () => false,
  startSpeechRecognition: () => ({ stop: () => undefined, abort: () => undefined }),
}));
vi.mock('../../voice/ttsAdapter', () => ({ speak: () => undefined, cancelSpeech: () => undefined }));

const HISTORY_KEY = 'assistant-history';

let invoked: { action: string; payload: Record<string, unknown> }[] = [];
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  invoked = [];
  localStorage.clear();
  // jsdom は `Element.scrollTo` / `scrollIntoView` を持たない (実ブラウザには在る)。
  // アシスタントの会話は末尾へ自動スクロールするので、無いと無関係な場所で落ちる
  // (`aiCeilingOnScreen.test.ts` と同じ代役)。
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['assistant']),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_s: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ action, payload });
      // 失敗させる —— 返答の中身はこの検査の関心ではない (送った物だけを見る)。
      return Promise.resolve({ ok: false, code: 'x', message: 'stub' });
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

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AssistantPage));
  });
}

/** 保存済みの会話を n 発話ぶん置く (利用者と AI が交互)。 */
function seedHistory(n: number): void {
  const msgs = Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: `過去の発話 ${i}`,
  }));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs));
}

/** 入力して送る。 */
async function ask(text: string): Promise<void> {
  const ta = [...container.querySelectorAll('input')].find(
    (i) => i.getAttribute('aria-label') === 'アシスタントへの入力',
  );
  if (!ta) throw new Error('入力欄が無い');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const form = container.querySelector('form');
  await act(async () => {
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settleUntil(() => invoked.length > 0, 'invoke が呼ばれる');
}

describe('断り書きと、実際に送る会話の量 (パス 186)', () => {
  it('★ 断りの数字は定数から来ており、単位は「発話」である', async () => {
    await mount();
    const text = container.textContent ?? '';
    expect(text, '断りに発話数が出ていない').toContain(`直近 ${ASSISTANT_TURN_WINDOW} 発話`);
    expect(text, '1 発話の字数の上限が出ていない').toContain(String(MAX_ASSISTANT_CONTENT_CHARS));
    // 往復に直した数も添える (利用者が数え直さなくて済むように)。
    expect(text).toContain(`約 ${Math.floor(ASSISTANT_TURN_WINDOW / 2)} 往復`);
  });

  /*
   * **直す前の文面が、この検査に当たることを標本で見る** (CLAUDE.md
   * 「不在を主張する検査には、標本を添える」)。`○ 発話` を探す肯定形の検査は
   * 「往復」に戻せば必ず鳴るので、その規則が実際に当たることを確かめる。
   */
  it('★ 対照: 直す前の文面は「発話」を含まない (規則が当たる)', () => {
    const before = `入力した質問文と、直近 ${ASSISTANT_TURN_WINDOW} 往復までの会話 (AI の返答を含む)`;
    expect(before.includes(`直近 ${ASSISTANT_TURN_WINDOW} 発話`)).toBe(false);
    const after = `入力した質問文と、直近 ${ASSISTANT_TURN_WINDOW} 発話までの会話`;
    expect(after.includes(`直近 ${ASSISTANT_TURN_WINDOW} 発話`)).toBe(true);
  });

  it('★ 実際に送る件数が、断りの数字と一致する (過去の会話が十分に在るとき)', async () => {
    // 断りの数より多い会話を置く —— 切る枝を通す。
    seedHistory(ASSISTANT_TURN_WINDOW + 10);
    await mount();
    await ask('直近の話をまとめて');
    const sent = invoked.find((c) => c.action === 'chat' || c.action === 'chatAll');
    expect(sent, 'chat を送っていない').toBeDefined();
    const msgs = sent!.payload.messages as { role: string; content: string }[];
    expect(msgs.length, '断りの数と送る件数が違う').toBe(ASSISTANT_TURN_WINDOW);
    // 末尾が今の質問であること (古い方を落としている・新しい方を落としていない)。
    expect(msgs[msgs.length - 1]?.content).toBe('直近の話をまとめて');
    expect(msgs[msgs.length - 1]?.role).toBe('user');
  });

  it('★ 会話が少ないときは、在る分だけを送る (数を水増ししない)', async () => {
    seedHistory(4);
    await mount();
    await ask('はじめての質問');
    const sent = invoked.find((c) => c.action === 'chat' || c.action === 'chatAll');
    const msgs = sent!.payload.messages as unknown[];
    expect(msgs.length, '在る分 + 今の質問より多く送っている').toBe(5);
  });

  it('★ 古い発話は落ちるが、断りの範囲内の発話は残る (境界)', async () => {
    seedHistory(ASSISTANT_TURN_WINDOW + 10);
    await mount();
    await ask('いま');
    const sent = invoked.find((c) => c.action === 'chat' || c.action === 'chatAll');
    const msgs = (sent!.payload.messages as { content: string }[]).map((m) => m.content);
    // 直前の 15 発話 + 今の質問。落ちているのは 10 発話。
    expect(msgs).toContain(`過去の発話 ${ASSISTANT_TURN_WINDOW + 10 - 1}`);
    expect(msgs).not.toContain('過去の発話 0');
    expect(msgs.filter((m) => m.startsWith('過去の発話')).length).toBe(ASSISTANT_TURN_WINDOW - 1);
  });
});
