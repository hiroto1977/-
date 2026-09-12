/** @vitest-environment jsdom */
/**
 * **AI へ送る 8 つの入力欄が、貼り付けを黙って切っていた** (2026-09-12 · パス 175)。
 *
 * ## 実測した欠陥
 *
 * パス 112 / 114 は「最新の発話は切らずに断る」を決め、両ビルドの handler に断りを置いた
 * (`latestTurnTooLong` / `checkAdvisorQuestion('too-long')` / Ollama の 2 つ)。そして
 * **画面には `maxLength={定数}` を置いた** —— ブラウザは天井を超えた貼り付けを**黙って切る**ので、
 * その断りには**1 度も到達しない**。残っていた 8 欄:
 *
 * | 画面 | 欄 | 天井 | 打って届くか |
 * | --- | --- | --- | --- |
 * | `AssistantPage` | 質問 | 8,000 | いいえ |
 * | `VillagePage` | 話しかける文 | 8,000 | いいえ |
 * | `SkillsPage` | プロンプト | 8,000 | いいえ |
 * | `BusinessPage` | 助言の質問 | 1,000 | いいえ |
 * | `StocksPage` | 助言の質問 | 1,000 | いいえ |
 * | `OllamaPage` | プロンプト / System | 32,768 / 8,192 | いいえ |
 * | `ChatbotWidget` | 入力 | 32,768 | いいえ |
 *
 * **どれも打って届く量ではない** —— つまり `maxLength` が発火するのは貼り付けのときだけで、
 * そのとき超過分は黙って消える。1,000 字の助言欄に状況説明を貼れば、AI は**途中で切れた
 * 質問**に答え、その答えが全文への答えとして画面に出る (パス 168 が感情分析の欄で実測した形)。
 *
 * ## `disabled` を見ない送信経路 (ここが 2 つ目の発見)
 *
 * 押せなくするだけでは足りない画面が 3 つ在った:
 *
 *   - `BusinessPage` / `StocksPage` —— `onKeyDown` の Enter は `advisorBusy` しか見ない。
 *   - `VillagePage` —— マイク (`onTranscript`) は**欄を通らず** `handleUtterance` へ直に来る。
 *
 * だからこの 3 画面は送信関数の中にも砦を持ち、**黙って return せず述べる**。
 * 母集団と台帳の突き合わせは `__tests__/aiInputCaps.test.ts` が持つ (走査)。
 * ここが持つのは**振る舞い** —— 押せないこと・送らないこと・全文が残ること・迂回経路が断ること。
 *
 * ## この harness が証明できないこと
 *
 * **jsdom は `maxLength` をプログラムからの `value` 代入に掛けない** (パス 168 で実測)。
 * だから「ブラウザが黙って切る」ことは再現できず、その決定を留めているのは
 * `hasAttribute('maxlength')` の検査だけである。実機での切り落ちの証明は e2e の仕事
 * (`scripts/e2e/core.cjs` の `aiCeiling`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil, waitForElement } from './jsdomWait';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../shared/assistantLimits';
import { MAX_ADVISOR_QUESTION_CHARS } from '../../shared/advisorQuestionLimits';
import { MAX_OLLAMA_PROMPT_CHARS, MAX_OLLAMA_SYSTEM_CHARS } from '../../shared/ollama';
import { SNAPSHOT } from '../data/snapshot';
import { ChatbotWidget } from '../components/ChatbotWidget';

/**
 * マイクの代役 —— `startSpeechRecognition` に渡された callbacks を掴んで、
 * **確定した書き起こし**を後から流し込めるようにする (これが欄を通らない経路)。
 */
let micCallbacks: { onTranscript: (t: string, isFinal: boolean) => void } | null = null;
vi.mock('../voice/speechAdapter', () => ({
  isSpeechRecognitionSupported: () => true,
  startSpeechRecognition: (cb: { onTranscript: (t: string, isFinal: boolean) => void }) => {
    micCallbacks = cb;
    // `SpeechSessionHandle` は stop と **abort** を持つ (片方だけの代役だと
    // 画面の後片付け `recRef.current?.abort()` が無関係な言い方で落ちる)。
    return { stop: () => undefined, abort: () => undefined };
  },
}));
/** 村は返事を読み上げる。jsdom に speechSynthesis は無いので黙らせる。 */
vi.mock('../voice/ttsAdapter', () => ({
  speak: () => undefined,
  cancelSpeech: () => undefined,
}));

/** 取得に差し替える中身 (画面が要る前提を満たす分だけ)。 */
const FETCHED: Readonly<Record<string, unknown>> = {
  skills: {
    items: [{ name: 'tax-check', description: '税務の点検', source: 'user', path: '/s/tax-check.md' }],
  },
  ollama: {
    ...SNAPSHOT.ollama,
    running: true,
    version: '0.17.1',
    versionSafe: true,
    models: [
      {
        name: 'llama3',
        family: 'llama',
        parameterSize: '8B',
        quantization: 'Q4',
        sizeMb: 4700,
        modifiedAt: '2026-09-01',
      },
    ],
  },
};

/** 実際に invoke された物 (切られていないことと、送っていないことを見る)。 */
let invoked: { serviceId: string; action: string; payload: unknown }[];

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  invoked = [];
  micCallbacks = null;
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () =>
      Promise.resolve(['skills', 'assistant', 'business', 'stocks', 'ollama', 'emotions']),
    fetchSnapshot: (serviceId: string) =>
      Promise.resolve({
        ok: true,
        data: FETCHED[serviceId] ?? (SNAPSHOT as Record<string, unknown>)[serviceId] ?? {},
      }),
    invoke: (serviceId: string, action: string, payload: unknown) => {
      invoked.push({ serviceId, action, payload });
      return Promise.resolve({ ok: false, code: 'x', message: 'stub' });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  // jsdom は `Element.scrollTo` / `scrollIntoView` を持たない (実ブラウザには在る)。
  // アシスタントの会話は末尾へ自動スクロールするので、無いと無関係な場所で落ちる。
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
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

async function render(node: ReturnType<typeof createElement>): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  await settleUntil(() => (container.textContent ?? '').length > 0, '画面が描かれる');
}

async function mountService(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`service ${id} missing`);
  await render(createElement(def.page));
}

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

/** 文字で押す (ボタンは同じ文を持つことがあるので `.primary` で絞れるようにする)。 */
async function clickButton(text: string, opts: { primary?: boolean } = {}): Promise<void> {
  const el = await waitForElement(
    () =>
      buttons().find(
        (b) =>
          b.textContent?.trim() === text
          && (opts.primary === undefined || b.classList.contains('primary') === opts.primary),
      ) ?? null,
    `ボタン「${text}」`,
  );
  await act(async () => {
    el.click();
  });
  await settleUntil(() => true, `「${text}」を押した後`);
}

/**
 * 実際の入力として流す。**素の代入では React に届かない**
 * (React が node ごとに `value` を覚えているため。パス 167 の罠)。
 */
async function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleUntil(() => el.value === value, '欄に値が入る');
}

/** その欄の断り (`data-ceiling-notice` は欄の名前を持つ)。 */
function notice(label: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-ceiling-notice="${label}"]`);
}

interface Field {
  /** 検査の見出しに出る名前。 */
  readonly what: string;
  /** 台帳 (`aiInputCaps.test.ts`) の行と同じ相対パス —— 母集団の対応を読める形にする。 */
  readonly page: string;
  readonly max: number;
  /** 断り文のラベル (= `data-ceiling-notice` の値)。 */
  readonly label: string;
  /** 画面を出して、その欄が触れる状態にする。 */
  readonly open: () => Promise<void>;
  readonly field: () => Promise<HTMLInputElement | HTMLTextAreaElement>;
  readonly submit: () => Promise<HTMLButtonElement>;
  /** 送られた payload からこの欄の文字列を取り出す (天井ちょうどが全文で届くのを見る)。 */
  readonly sent?: (payload: unknown) => string | undefined;
}

const byAria = async (aria: string) =>
  waitForElement(
    () => container.querySelector<HTMLInputElement>(`input[aria-label="${aria}"]`),
    `欄 [aria-label=${aria}]`,
  );
const byPlaceholder = async (placeholder: string) =>
  waitForElement(
    () => container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`),
    `欄 [placeholder=${placeholder}]`,
  );
/**
 * 送信ボタン。**同じ文のボタンが 2 つ在る画面がある** (`OllamaPage` の節の開閉も「送信」)
 * ので、複数見つかったら `.primary` (実際に送る側) を採る。
 */
const primary = async (text: string) =>
  waitForElement(
    () => {
      const all = buttons().filter((b) => b.textContent?.trim() === text);
      if (all.length === 0) return null;
      return all.find((b) => b.classList.contains('primary')) ?? all[0]!;
    },
    `ボタン「${text}」`,
  );

/** `<select>` を実際の選択として動かす。 */
async function pickOption(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settleUntil(() => select.value === value, `選択が ${value} になる`);
}

/** Ollama のチャット欄を開き、モデルを選ぶ (モデル未選択では押せない)。 */
async function openOllamaChat(): Promise<void> {
  await mountService('ollama');
  await clickButton('送信', { primary: false });
  const select = await waitForElement(
    () => container.querySelector<HTMLSelectElement>('select'),
    'モデルの選択',
  );
  await pickOption(select, 'llama3');
}

const FIELDS: readonly Field[] = [
  {
    what: 'アシスタントの質問',
    page: 'pages/AssistantPage.tsx',
    max: MAX_ASSISTANT_CONTENT_CHARS,
    label: '入力',
    open: () => mountService('assistant'),
    field: () => byAria('アシスタントへの入力'),
    submit: () => primary('送信'),
    sent: (p) => {
      const msgs = (p as { messages?: { content?: string }[] }).messages ?? [];
      return msgs[msgs.length - 1]?.content;
    },
  },
  {
    what: '村へ話しかける文',
    page: 'pages/VillagePage.tsx',
    max: MAX_ASSISTANT_CONTENT_CHARS,
    label: '入力',
    open: () => mountService('village'),
    field: () => byAria('村への入力'),
    submit: () => primary('伝える'),
  },
  {
    what: 'スキルのプロンプト',
    page: 'pages/SkillsPage.tsx',
    max: MAX_ASSISTANT_CONTENT_CHARS,
    label: 'プロンプト',
    open: async () => {
      await mountService('skills');
      await clickButton('スキル実行');
      const select = await waitForElement(
        () => container.querySelector<HTMLSelectElement>('select'),
        'スキルの選択',
      );
      await pickOption(select, 'tax-check');
    },
    field: () =>
      waitForElement(
        () => container.querySelector<HTMLTextAreaElement>('textarea'),
        'プロンプトの textarea',
      ),
    submit: () => primary('実行'),
    sent: (p) => (p as { prompt?: string }).prompt,
  },
  {
    what: '経営ダッシュボードの助言の質問',
    page: 'pages/BusinessPage.tsx',
    max: MAX_ADVISOR_QUESTION_CHARS,
    label: '質問',
    open: () => mountService('business'),
    field: () => byPlaceholder('例: 来期に最も注力すべき事業を 3 つ'),
    submit: () => primary('AI に聞く'),
    sent: (p) => (p as { question?: string }).question,
  },
  {
    what: '株式の助言の質問',
    page: 'pages/StocksPage.tsx',
    max: MAX_ADVISOR_QUESTION_CHARS,
    label: '質問',
    open: () => mountService('stocks'),
    field: () => byPlaceholder('例: 長期保有に向いている銘柄を 3 つ'),
    submit: () => primary('AI に聞く'),
    sent: (p) => (p as { question?: string }).question,
  },
  {
    what: '端末内モデルのプロンプト',
    page: 'pages/OllamaPage.tsx',
    max: MAX_OLLAMA_PROMPT_CHARS,
    label: 'プロンプト',
    open: openOllamaChat,
    field: () =>
      waitForElement(
        () => container.querySelector<HTMLTextAreaElement>('textarea[placeholder="プロンプト"]'),
        'Ollama のプロンプト欄',
      ),
    submit: () => primary('送信'),
    sent: (p) => (p as { prompt?: string }).prompt,
  },
  {
    what: '端末内モデルの System prompt',
    page: 'pages/OllamaPage.tsx',
    max: MAX_OLLAMA_SYSTEM_CHARS,
    label: 'システムプロンプト',
    open: async () => {
      await openOllamaChat();
      // プロンプトが空だと押せない —— System 側の天井だけを見るために埋める。
      const prompt = await waitForElement(
        () => container.querySelector<HTMLTextAreaElement>('textarea[placeholder="プロンプト"]'),
        'Ollama のプロンプト欄',
      );
      await typeInto(prompt, '要約して');
    },
    field: () => byPlaceholder('System prompt (任意)'),
    submit: () => primary('送信'),
    sent: (p) => (p as { system?: string }).system,
  },
  {
    what: 'チャットボットの入力',
    page: 'components/ChatbotWidget.tsx',
    max: MAX_OLLAMA_PROMPT_CHARS,
    label: '入力',
    open: async () => {
      await render(createElement(ChatbotWidget));
      const fab = await waitForElement(
        () => container.querySelector<HTMLButtonElement>('button[aria-label="AI コンシェルジュを開く"]'),
        'チャットボットの開くボタン',
      );
      await act(async () => {
        fab.click();
      });
      await settleUntil(() => container.querySelector('input[aria-label="チャット入力"]') !== null, 'チャットが開く');
    },
    field: () => byAria('チャット入力'),
    submit: () => primary('送信'),
  },
];

describe.each(FIELDS)('$what — 切らずに断る (パス 175)', (f) => {
  it('★ `maxLength` に任せていない (任せるとブラウザが黙って落とす)', async () => {
    await f.open();
    expect((await f.field()).hasAttribute('maxlength'), `${f.page}: maxLength が戻っている`).toBe(false);
  });

  it('★ 天井を超えた入力は欄に全文が残り、いくら超えているかを述べる', async () => {
    await f.open();
    const length = f.max + 137;
    await typeInto(await f.field(), 'あ'.repeat(length));
    expect((await f.field()).value, '欄で切られている').toHaveLength(length);
    const note = notice(f.label);
    expect(note, `${f.page}: 超えているのに何も言っていない`).not.toBeNull();
    expect(note!.textContent).toContain(String(f.max));
    expect(note!.textContent).toContain(String(length));
    expect(note!.textContent).toContain('137');
    expect(note!.textContent).toContain('送りません');
  });

  it('★ 超えているあいだは送らない (押せない + 何も invoke しない)', async () => {
    await f.open();
    await typeInto(await f.field(), 'あ'.repeat(f.max + 1));
    expect((await f.submit()).disabled, `${f.page}: 超えているのに押せる`).toBe(true);
    const before = invoked.length;
    await act(async () => {
      (await f.submit()).click();
    });
    await settleUntil(() => true, '押した後');
    expect(invoked.length, `${f.page}: 切れた入力を送っている`).toBe(before);
  });

  it('★ 天井ちょうどは送れる (境界を締めすぎていない・全文が届く)', async () => {
    await f.open();
    const exact = 'あ'.repeat(f.max);
    await typeInto(await f.field(), exact);
    expect(notice(f.label), `${f.page}: 天井ちょうどで警告が出ている`).toBeNull();
    expect((await f.submit()).disabled, `${f.page}: 天井ちょうどで押せない`).toBe(false);
    if (!f.sent) return;
    const before = invoked.length;
    await act(async () => {
      (await f.submit()).click();
    });
    await settleUntil(() => invoked.length > before, '送信が届く');
    const value = f.sent(invoked[invoked.length - 1]!.payload);
    expect(value, `${f.page}: 天井ちょうどが送られていない`).toBeDefined();
    expect(value, `${f.page}: 送る手前で切られている`).toHaveLength(f.max);
  });

  it('★ 短くし直せば送れるようになる (警告も消える)', async () => {
    await f.open();
    await typeInto(await f.field(), 'あ'.repeat(f.max + 1));
    expect((await f.submit()).disabled).toBe(true);
    await typeInto(await f.field(), '短い質問');
    expect(notice(f.label), `${f.page}: 短くしたのに警告が残っている`).toBeNull();
    expect((await f.submit()).disabled, `${f.page}: 短くしたのに押せない`).toBe(false);
  });
});

describe('`disabled` を見ない送信経路も断る (パス 175)', () => {
  /** Enter は `advisorBusy` しか見ない —— 押せなくするだけでは送れてしまう。 */
  async function pressEnter(el: HTMLInputElement): Promise<void> {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await settleUntil(() => true, 'Enter の後');
  }

  /**
   * 助言の断り欄 (`data-advisor-error`)。**欄の注記では代わりにならない** ——
   * 天井を超えていれば注記は常に出ているので、`container.textContent` を見るだけの
   * 検査は砦を外しても通ってしまう (パス 175 の対照 C7 で実測。鳴らない対照は
   * 「合格」ではなく「その検査についての報せ」だった)。
   */
  function advisorError(): string {
    return container.querySelector('[data-advisor-error]')?.textContent ?? '';
  }

  it('★ 経営ダッシュボード: Enter で送ろうとすると、断りが出て invoke しない', async () => {
    await mountService('business');
    const box = await byPlaceholder('例: 来期に最も注力すべき事業を 3 つ');
    await typeInto(box, 'あ'.repeat(MAX_ADVISOR_QUESTION_CHARS + 42));
    expect(advisorError(), '押す前から断りが出ている').toBe('');
    await pressEnter(box);
    expect(invoked.filter((c) => c.action === 'advise'), 'Enter で切れた質問が出ている').toEqual([]);
    await settleUntil(() => advisorError().includes('42 字超えています'), 'Enter の断りが助言欄に出る');
    expect(advisorError(), 'どれだけ削れば送れるかが読めない').toContain(
      String(MAX_ADVISOR_QUESTION_CHARS),
    );
  });

  it('★ 株式: Enter でも同じ (同じ判断が 2 画面に在る)', async () => {
    await mountService('stocks');
    const box = await byPlaceholder('例: 長期保有に向いている銘柄を 3 つ');
    await typeInto(box, 'あ'.repeat(MAX_ADVISOR_QUESTION_CHARS + 7));
    expect(advisorError(), '押す前から断りが出ている').toBe('');
    await pressEnter(box);
    expect(invoked.filter((c) => c.action === 'advise'), 'Enter で切れた質問が出ている').toEqual([]);
    await settleUntil(() => advisorError().includes('7 字超えています'), 'Enter の断りが助言欄に出る');
  });

  it('★ 対照: 天井の内側なら Enter は通る (断りが常に出る検査になっていない)', async () => {
    await mountService('business');
    const box = await byPlaceholder('例: 来期に最も注力すべき事業を 3 つ');
    await typeInto(box, '来期に注力すべき事業を 3 つ');
    await pressEnter(box);
    await settleUntil(() => invoked.some((c) => c.action === 'advise'), 'Enter で助言が呼ばれる');
    expect(advisorError(), '通るはずが断られている').not.toContain('超えています');
  });

  it('★ 村: マイクの書き起こしは欄を通らないので、`handleUtterance` が断る', async () => {
    await mountService('village');
    await clickButton('🎙️ 話しかける');
    expect(micCallbacks, 'マイクの代役が呼ばれていない').not.toBeNull();
    await act(async () => {
      micCallbacks!.onTranscript('あ'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 9), true);
    });
    await settleUntil(
      () => (container.textContent ?? '').includes('9 字超えています'),
      'マイクの断りが画面に出る',
    );
    // 画面は起動時に `assistant/providers` を訊く —— 見るのは **chat** だけ。
    expect(
      invoked.filter((c) => c.serviceId === 'assistant' && c.action === 'chat'),
      'マイクから切れた発話が出ている',
    ).toEqual([]);
  });

  it('★ 対照: 天井の内側なら同じ経路が通る (断りが常に出る検査になっていない)', async () => {
    await mountService('village');
    await clickButton('🎙️ 話しかける');
    await act(async () => {
      micCallbacks!.onTranscript('所得税について教えて', true);
    });
    await settleUntil(
      () => invoked.some((c) => c.serviceId === 'assistant' && c.action === 'chat'),
      'マイクの発話が AI へ出る',
    );
    expect((container.textContent ?? '').includes('送りません'), '通るはずが断られている').toBe(false);
  });
});
