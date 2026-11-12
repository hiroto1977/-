/** @vitest-environment jsdom */
/**
 * 保存した会話履歴の 1 件が壊れていても、会話を描く 2 つの面は描け、消す口も残る (2026-09-26 · パス 489)。
 *
 * 直す前、会話履歴の読み (`chatMessages`) は `role` / `text` しか検めず、「通った要素は追加の欄ごと
 * そのまま」返していた。画面はその追加の欄を**素で**描く (`via {provider}` / `m.services.map(…)` /
 * `🪪 {routedThrough}`)。実測 (直す前):
 *
 * | 面 | 保存値 | 起きたこと |
 * | --- | --- | --- |
 * | AI アシスタントの画面 | `provider: {a:1}` | 「Objects are not valid as a React child」で画面ごと落ち、**「🗑 消去」も消える** |
 * | 同 | `services: {length:1}` / `'abc'` | `m.services.map is not a function` |
 * | 同 | `services: [null]` | `Cannot read properties of null (reading 'description')` |
 * | 同 | `services: [{label:{a:1}}]` | 「Objects are not valid as a React child」 |
 * | AI コンシェルジュ | `routedThrough: {a:1}` | 開いた瞬間に**アプリ全体が白くなる** (`appShellPartBoundary.test.ts`) |
 *
 * 保存値はどこから来るか —— 古い版・新しい版 (同じオリジンの両ビルドは同じ端末の保存先を読む)・
 * 手で直した JSON・同じオリジンの別コード。`persistedShape.ts` 自身が 2026-09-05 に書類スタジオで
 * 同じ形を実際に踏んだと書いている。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantPage } from '../AssistantPage';
import { ChatbotWidget } from '../../components/ChatbotWidget';
import { MAX_RELATED_SERVICES } from '../../data/assistantContext';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

vi.mock('../../voice/speechAdapter', () => ({
  isSpeechRecognitionSupported: () => false,
  startSpeechRecognition: () => ({ stop: () => undefined, abort: () => undefined }),
}));
vi.mock('../../voice/ttsAdapter', () => ({ speak: () => undefined, cancelSpeech: () => undefined }));

/** 保存した返答の本文 —— 描けたことの錠 (この文はどの画面の固定文にも無い)。 */
const BODY = '保存した返答の本文 QZX';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'stub' }),
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

const text = (): string => container.textContent ?? '';
const buttons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const serviceButtons = (): string[] => buttons().map((b) => b.textContent ?? '').filter((t) => t.startsWith('↗ '));

async function mountAssistant(history: unknown): Promise<void> {
  localStorage.setItem('assistant-history', JSON.stringify(history));
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AssistantPage));
  });
  await waitForText(text, BODY);
}

/** 1 件の返答に 1 つの欄だけ壊した値を置く。 */
const reply = (extra: Record<string, unknown>): unknown[] => [
  { role: 'user', text: '質問' },
  { role: 'assistant', text: BODY, ...extra },
];

describe('AI アシスタントの画面: 保存した会話の欄が壊れていても描け、「🗑 消去」が残る', () => {
  const BROKEN: readonly [string, Record<string, unknown>][] = [
    ['provider が物', { provider: { a: 1 } }],
    ['provider が配列', { provider: ['x'] }],
    ['provider が数', { provider: 42 }],
    ['services が物', { services: { length: 1 } }],
    ['services が文字列', { services: 'abc' }],
    ['services の要素が null', { services: [null] }],
    ['services の札が物', { services: [{ id: 'kpi', label: { a: 1 }, description: 'd' }] }],
    ['services の id が実在しない', { services: [{ id: 'nope', label: '存在しない', description: 'd' }] }],
    ['offline が物', { offline: { a: 1 } }],
  ];
  for (const [name, extra] of BROKEN) {
    it(`★ ${name}: 画面は描け、入力欄と「🗑 消去」が在る`, async () => {
      await mountAssistant(reply(extra));
      expect(container.querySelector('input[aria-label="アシスタントへの入力"]'), '入力欄が無い').not.toBeNull();
      const clear = buttons().find((b) => (b.textContent ?? '').includes('🗑 消去'));
      expect(clear, '消去の口が無い').toBeDefined();
      expect(clear!.disabled).toBe(false);
      // 読めない欄は描かない (札も案内ボタンも、壊れた値からは作らない)
      expect(text()).not.toContain('via ');
      expect(serviceButtons()).toEqual([]);
      expect(text()).not.toContain('簡易モード（オフライン）');
    });
  }

  it('★ 「🗑 消去」を押すと、壊れた履歴ごと消える (逃げ口が開いている)', async () => {
    await mountAssistant(reply({ provider: { a: 1 } }));
    const clear = buttons().find((b) => (b.textContent ?? '').includes('🗑 消去'))!;
    await act(async () => {
      clear.click();
    });
    expect(text()).not.toContain(BODY);
    expect(JSON.parse(localStorage.getItem('assistant-history') ?? 'null')).toEqual([]);
  });

  it('対照: 読める欄はそのまま描く (札・案内ボタン・簡易モード) —— 読めない欄だけを落とす', async () => {
    await mountAssistant([
      { role: 'user', text: '質問' },
      {
        role: 'assistant',
        text: BODY,
        provider: 'Claude (Anthropic)',
        services: [null, { id: 'nope', label: 'x', description: 'd' }, { id: 'kpi', label: 'KPI / BEP', description: '指標' }],
      },
      { role: 'assistant', text: '簡易の返答', offline: true },
    ]);
    expect(text()).toContain('via Claude (Anthropic)');
    expect(serviceButtons()).toEqual(['↗ KPI / BEPを開く']);
    expect(text()).toContain('簡易モード（オフライン）');
  });

  it(`★ 案内ボタンは書く側と同じ ${MAX_RELATED_SERVICES} 件で切る (保存値が 1 万件を並べても画面は並べない)`, async () => {
    const many = Array.from({ length: 10_000 }, () => ({ id: 'kpi', label: 'KPI / BEP', description: 'd' }));
    await mountAssistant(reply({ services: many }));
    expect(serviceButtons()).toHaveLength(MAX_RELATED_SERVICES);
  });
});

async function mountWidget(history: unknown): Promise<void> {
  localStorage.setItem('chatbot-history', JSON.stringify(history));
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ChatbotWidget));
  });
  const fab = await waitForElement(
    () => container.querySelector<HTMLButtonElement>('button[aria-label="AI コンシェルジュを開く"]'),
    'コンシェルジュを開くボタン',
  );
  await act(async () => {
    fab.click();
  });
  await waitForElement(() => container.querySelector('[role="dialog"][aria-label="AI コンシェルジュ"]'), 'コンシェルジュの窓');
}

describe('AI コンシェルジュ: 保存した会話の札が壊れていても開け、履歴を消す口が在る', () => {
  for (const [name, routed] of [
    ['物', { a: 1 }],
    ['配列', ['x', 'y']],
    ['数', 42],
    ['空白だけ', '   '],
  ] as const) {
    it(`★ routedThrough が${name}: 開いても投げず、札は出さない`, async () => {
      await mountWidget([{ role: 'bot', text: BODY, routedThrough: routed }]);
      await waitForText(text, BODY);
      expect(text()).not.toContain('🪪');
    });
  }

  it('対照: 読める札はそのまま出す', async () => {
    await mountWidget([{ role: 'bot', text: BODY, routedThrough: 'Ollama (ローカル LLM)' }]);
    await waitForText(text, '🪪 Ollama (ローカル LLM)');
  });

  it('★ 「🗑 履歴」で端末の会話履歴を消せる (台帳は会話の中身を sensitive と名乗る —— 直す前は消す手が全消去しか無かった)', async () => {
    await mountWidget([
      { role: 'user', text: '人に見られたくない相談' },
      { role: 'bot', text: BODY },
    ]);
    await waitForText(text, BODY);
    const clear = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('button[aria-label="会話履歴を消去"]'),
      '履歴を消す口',
    );
    expect(clear.disabled).toBe(false);
    await act(async () => {
      clear.click();
    });
    expect(text()).not.toContain(BODY);
    expect(text()).not.toContain('人に見られたくない相談');
    // 端末からも消える (空の配列が書き戻されるか、鍵ごと無い —— どちらも中身は残らない)
    const left = localStorage.getItem('chatbot-history');
    expect(left === null || left === '[]', `残った保存値: ${left}`).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="会話履歴を消去"]')!.disabled).toBe(true);
  });

  it('対照: 履歴が空なら「🗑 履歴」は押せない', async () => {
    await mountWidget([]);
    const clear = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('button[aria-label="会話履歴を消去"]'),
      '履歴を消す口',
    );
    expect(clear.disabled).toBe(true);
  });
});
