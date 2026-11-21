/** @vitest-environment jsdom */
/**
 * **ベスト3 の「バックグラウンド」を App の単位で通す** (2026-09-26)。
 *
 * 部品の検査 (`components/__tests__/bestAnswersIndicator.test.ts`) は印を単独で描くので、
 * **上部バーに載っているか**は見えない —— `App.tsx` から 1 行消しても部品の検査は緑のまま、
 * 利用者は別の画面で待っている間に「終わった」を知る手段を失う。ここでは App を丸ごと描き、
 * ホームに居る間に仕事を走らせ、上部バーの印 → 押す → AI アシスタントで結果を 1 度だけ受け取る、
 * を通す。待ちは条件で取る (法則 wait-for-condition-not-ticks)。器は `appShell.test.ts` と同じ。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../App';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { _resetBestJobForTests, getBestJob, startBestJob } from '../data/bestAnswersJob';
import { ANSWER_STRATEGIES, planCalls, type SendChat } from '../data/bestAnswers';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from './jsdomWait';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'), // Electron 扱い (ロック画面を出さない)
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
    configurable: true,
  });
  // AI アシスタントはチャットの末尾へ scrollTo する (jsdom には無い)。無いと画面が投げ、
  // 境界が受けて結果の吹き出しが 1 つも出ない (`bestAnswersOnScreen` と同じ差し替え)。
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  if (typeof (Element.prototype as unknown as Record<string, unknown>).scrollIntoView !== 'function') {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true });
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  _resetBestJobForTests();
  localStorage.clear();
  location.hash = '';
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  container?.remove();
  _resetBestJobForTests();
});

/** 観点ごとに違う回答をすぐ返す送り手。 */
const echo: SendChat = (req) => {
  const s = ANSWER_STRATEGIES.find((x) => req.system.includes(`「${x.label}」を担当`))!;
  return Promise.resolve({ ok: true, text: `${s.label}の回答 ${s.id.repeat(30)}\n- 要点` });
};

const text = () => container.textContent ?? '';
const chip = () => container.querySelector<HTMLButtonElement>('.topbar-right [data-best3-indicator]');

describe('App: ベスト3 は画面を離れても走り、上部バーから戻れる', () => {
  it('★ ホームに居る間に終わった仕事を、上部バーの印から AI アシスタントで 1 度だけ受け取る', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(App));
    });
    // AI アシスタントではない画面に居ることを先に確かめる (結果を受け取る画面が付いていない)。
    await waitForElement(() => container.querySelector('.topbar-right'), '上部バー');
    expect(container.querySelector('[data-best3-progress]')).toBeNull();

    const req = {
      question: '就業規則の作成を頼みたい',
      ragQuery: '就業規則の作成を頼みたい',
      turns: [{ role: 'user' as const, content: '就業規則の作成を頼みたい' }],
      catalog: [],
      providerIds: [],
    };
    const r = startBestJob(req, echo, planCalls(req.providerIds).length);
    if (!r.ok) throw new Error(`始まらなかった: ${r.reason}`);
    await act(async () => {
      await r.finished;
    });

    const c = await waitForElement(chip, '上部バーの「完了」の印');
    expect(c.getAttribute('data-best3-indicator')).toBe('done');
    await act(async () => c.click());

    // 押した先の画面が結果を受け取り、チャットに見出しと 🥇 が出る。
    await waitForText(text, '🏆 ベスト3 ——');
    await waitForText(text, '🥇 1 位');
    expect(getBestJob()?.delivered, '渡し終えた印').toBe(true);
    // 渡し終えたので印は消える (2 度知らせない)。
    await settleUntil(() => chip() === null, '渡し終えた後に上部バーの印が消える');
    expect(text().split('🏆 ベスト3 ——').length - 1, '見出しは 1 度だけ').toBe(1);
  });
});
