/** @vitest-environment jsdom */
/**
 * 画面の**外**の部品が描画で投げても、アプリ全体は白くならない (2026-09-26 · パス 489)。
 *
 * App は画面の中身を `PageErrorBoundary` で囲むが、上部バー (ベスト3 の進み具合・音声コマンド)・
 * 画面の上の帯 (端末の保存の知らせ)・プランの案内・浮いた部品 (AI コンシェルジュ) は**その外**に居た。
 * そこで投げると React はツリーごと外す。実測 (直す前): 保存した会話履歴の 1 件の欄が物
 * (`routedThrough: {a:1}`) だと、コンシェルジュを開いた瞬間にサイドバーのボタンが 21 → 0・
 * 本文が 0 字になった —— 再読込するまで何も押せず、再読込しても開けば同じことが起きる。
 *
 * - 振る舞い: 実物の部品 + 壊れた保存値で開いても白くならない / 部品を必ず投げる物に差し替えると、
 *   その部品の所にだけ知らせが出てサイドバーは生きている / コンシェルジュの知らせの「会話履歴を消去して
 *   やり直す」が保存値を消し、部品が戻る
 * - 母集団: App.tsx が描く部品を**走査で導き**、画面の外の部品はどれも `ShellPartBoundary` の中に在る
 *   (台帳と両方向 —— 新しい部品を境界の外に足せば名指しで落ちる)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { join } from 'node:path';

/** 必ず投げる部品の名前 (部品の本物を呼ぶ前に見る)。 */
const boom = vi.hoisted(() => ({ parts: new Set<string>() }));
const BOOM_MESSAGE = 'この部品は必ず落ちる (検査用)';

vi.mock('../components/ChatbotWidget', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../components/ChatbotWidget')>();
  const { createElement: h } = await import('react');
  return {
    ...mod,
    ChatbotWidget: () => {
      if (boom.parts.has('ChatbotWidget')) throw new Error(BOOM_MESSAGE);
      return h(mod.ChatbotWidget);
    },
  };
});
vi.mock('../components/VoiceCommandBar', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../components/VoiceCommandBar')>();
  const { createElement: h } = await import('react');
  return {
    ...mod,
    VoiceCommandBar: () => {
      if (boom.parts.has('VoiceCommandBar')) throw new Error(BOOM_MESSAGE);
      return h(mod.VoiceCommandBar);
    },
  };
});
vi.mock('../components/BestAnswersIndicator', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../components/BestAnswersIndicator')>();
  const { createElement: h } = await import('react');
  return {
    ...mod,
    BestAnswersIndicator: () => {
      if (boom.parts.has('BestAnswersIndicator')) throw new Error(BOOM_MESSAGE);
      return h(mod.BestAnswersIndicator);
    },
  };
});
vi.mock('../components/DeviceStoreFailureBanner', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../components/DeviceStoreFailureBanner')>();
  const { createElement: h } = await import('react');
  return {
    ...mod,
    DeviceStoreFailureBanner: () => {
      if (boom.parts.has('DeviceStoreFailureBanner')) throw new Error(BOOM_MESSAGE);
      return h(mod.DeviceStoreFailureBanner);
    },
  };
});

import { App } from '../App';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from './jsdomWait';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

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
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  boom.parts.clear();
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
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

const sidebarCount = (): number => container.querySelectorAll('button.sidebar-item').length;
const partError = (label: string): HTMLElement | null =>
  container.querySelector<HTMLElement>(`[data-shell-part-error="${label}"]`);

async function mountApp(): Promise<number> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
  await settleUntil(() => sidebarCount() > 0, 'サイドバーが描かれる');
  return sidebarCount();
}

describe('実物の部品: 保存した会話履歴の欄が壊れていても、コンシェルジュを開いてアプリが白くならない', () => {
  it('★ routedThrough が物の 1 件を持って開く —— サイドバーも本文も残り、その会話も読める', async () => {
    localStorage.setItem('chatbot-history', JSON.stringify([{ role: 'bot', text: '保存した返答 QZX', routedThrough: { a: 1 } }]));
    const before = await mountApp();
    const fab = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('button[aria-label="AI コンシェルジュを開く"]'),
      'コンシェルジュを開くボタン',
    );
    await act(async () => {
      fab.click();
    });
    await waitForText(() => container.textContent ?? '', '保存した返答 QZX');
    expect(sidebarCount()).toBe(before);
    expect(partError('AI コンシェルジュ'), '境界まで届いた (読みで止まっていない)').toBeNull();
  });
});

describe('画面の外の部品が投げても、その部品の所にだけ知らせが出る (サイドバーは生きている)', () => {
  const PARTS: readonly [string, string][] = [
    ['VoiceCommandBar', '音声コマンド'],
    ['BestAnswersIndicator', 'ベスト3 の進み具合'],
    ['DeviceStoreFailureBanner', '端末の保存の知らせ'],
    ['ChatbotWidget', 'AI コンシェルジュ'],
  ];
  for (const [part, label] of PARTS) {
    it(`★ ${part} が投げる → 「${label}」の知らせだけ・サイドバーと画面は残る`, async () => {
      boom.parts.add(part);
      const count = await mountApp();
      const alert = await waitForElement(() => partError(label), `「${label}」の知らせ`);
      expect(alert.textContent).toContain(BOOM_MESSAGE);
      expect(count).toBeGreaterThan(10);
      expect(container.querySelector('h1'), '画面の見出しが消えた').not.toBeNull();
      // もう一度表示: 直っていれば部品が戻る
      boom.parts.delete(part);
      const retry = [...alert.querySelectorAll('button')].find((b) => b.textContent === 'もう一度表示')!;
      await act(async () => {
        retry.click();
      });
      await settleUntil(() => partError(label) === null, `「${label}」の知らせが消える`);
      expect(sidebarCount()).toBe(count);
    });
  }

  it('★ コンシェルジュの知らせは「会話履歴を消去してやり直す」を持ち、押すと保存値が消えて部品が戻る', async () => {
    localStorage.setItem('chatbot-history', JSON.stringify([{ role: 'user', text: '相談' }]));
    boom.parts.add('ChatbotWidget');
    await mountApp();
    const alert = await waitForElement(() => partError('AI コンシェルジュ'), 'コンシェルジュの知らせ');
    const recover = [...alert.querySelectorAll('button')].find((b) => b.textContent === '会話履歴を消去してやり直す');
    expect(recover, '復旧の口が無い').toBeDefined();
    boom.parts.delete('ChatbotWidget');
    await act(async () => {
      recover!.click();
    });
    await waitForElement(
      () => container.querySelector<HTMLButtonElement>('button[aria-label="AI コンシェルジュを開く"]'),
      'コンシェルジュが戻る',
    );
    // 戻った部品は空の履歴を書き戻すことがある —— どちらでも中身は残らない
    const left = localStorage.getItem('chatbot-history');
    expect(left === null || left === '[]', `残った保存値: ${left}`).toBe(true);
    expect(partError('AI コンシェルジュ')).toBeNull();
  });

  it('対照: 画面の外の知らせは、浮いた部品だけが画面の右下に固定される (上部バーの並びは崩さない)', async () => {
    boom.parts.add('ChatbotWidget');
    boom.parts.add('VoiceCommandBar');
    await mountApp();
    const floating = await waitForElement(() => partError('AI コンシェルジュ'), 'コンシェルジュの知らせ');
    const inline = await waitForElement(() => partError('音声コマンド'), '音声コマンドの知らせ');
    expect(floating.style.position).toBe('fixed');
    expect(inline.style.position).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 母集団: App.tsx が描く部品 (走査) × どの境界の中に在るか (台帳と両方向)
// ---------------------------------------------------------------------------

const APP = join(__dirname, '..', 'App.tsx');

type Where = 'boundary' | 'provider' | 'page-boundary' | 'shell-boundary';

/**
 * App.tsx が描く部品と、それが居るべき所。**新しい部品を足したら、ここに書くまで落ちる**。
 * `shell-boundary` の行は `ShellPartBoundary` の中、`page-boundary` の行は `PageErrorBoundary` の中に
 * 在ることを走査で確かめる (いちばん内側の境界で判定する)。
 */
const LEDGER: Record<string, { readonly where: Where; readonly why: string }> = {
  PageErrorBoundary: { where: 'boundary', why: '画面の中身を囲む境界そのもの' },
  ShellPartBoundary: { where: 'boundary', why: '画面の外の部品を 1 つずつ囲む境界そのもの' },
  'ShellContext.Provider': { where: 'provider', why: '値を配るだけで自分では何も描かない (投げる描画を持たない)' },
  LockScreen: { where: 'page-boundary', why: '「ロック画面」の境界に入る (パス 136 以前から)' },
  PageComponent: { where: 'page-boundary', why: '選んだ画面そのもの' },
  ManualDataSection: { where: 'page-boundary', why: '画面ごとの手入力欄 (画面と同じ枠で落ちる)' },
  BestAnswersIndicator: { where: 'shell-boundary', why: '上部バー —— ベスト3 の進み具合の印' },
  VoiceCommandBar: { where: 'shell-boundary', why: '上部バー —— 音声コマンドの結果を描く' },
  DeviceStoreFailureBanner: { where: 'shell-boundary', why: '画面の上の帯 —— 画面が落ちても残すため画面の境界の外に置く (だから自分の境界が要る)' },
  UpgradeNotice: { where: 'shell-boundary', why: 'プランの案内 —— 画面の代わりに出るが画面の境界の外に在る' },
  ChatbotWidget: { where: 'shell-boundary', why: '浮いた部品 —— 保存した会話履歴を描く (実測で白くなった当の部品)' },
};

const BOUNDARY_NAMES = ['PageErrorBoundary', 'ShellPartBoundary'] as const;
/** JSX の開きタグ (型引数の `useRef<HTMLInputElement>` は直前が識別子なので拾わない)。 */
const TAG = /(?<![\w$.])<(\/?)([A-Z][\w.]*)(?=[\s/>])/g;

interface Found {
  readonly name: string;
  /** いちばん内側の境界 (無ければ null)。 */
  readonly inside: (typeof BOUNDARY_NAMES)[number] | null;
}

/** 開き・閉じタグを順に読み、境界の積み重ねを追う。自己閉じの境界は無い (子を持つための物)。 */
function scan(code: string): Found[] {
  const out: Found[] = [];
  const stack: (typeof BOUNDARY_NAMES)[number][] = [];
  for (const m of code.matchAll(TAG)) {
    const [, closing, name] = m as unknown as [string, string, string];
    const isBoundary = (BOUNDARY_NAMES as readonly string[]).includes(name);
    if (closing) {
      if (isBoundary) {
        expect(stack.pop(), `閉じる ${name} に対応する開きが無い`).toBe(name);
      }
      continue;
    }
    out.push({ name, inside: stack.length > 0 ? stack[stack.length - 1]! : null });
    if (isBoundary) stack.push(name as (typeof BOUNDARY_NAMES)[number]);
  }
  expect(stack, '開いたまま閉じていない境界が在る').toEqual([]);
  return out;
}

describe('App.tsx が描く部品は、どれも境界の中に在る (走査・両方向)', () => {
  const code = stripComments(readOriginalSource(APP));
  const found = scan(code);

  it('★ 走査は空でない (実測 11 種 —— 増えたら台帳を読み直す)', () => {
    expect(new Set(found.map((f) => f.name)).size).toBe(11);
  });

  it('★ 描く部品と台帳は両方向に一致する (新しい部品は理由と居場所を書くまで落ちる)', () => {
    expect([...new Set(found.map((f) => f.name))].sort()).toEqual(Object.keys(LEDGER).sort());
  });

  it('★ 画面の外の部品は ShellPartBoundary の中、画面の部品は PageErrorBoundary の中 (いちばん内側で判定)', () => {
    for (const f of found) {
      const row = LEDGER[f.name]!;
      if (row.where === 'shell-boundary') expect(f.inside, `${f.name} が画面の外の境界に入っていない`).toBe('ShellPartBoundary');
      if (row.where === 'page-boundary') expect(f.inside, `${f.name} が画面の境界に入っていない`).toBe('PageErrorBoundary');
    }
  });

  it('標本: 境界の外に部品を足すと走査が名指しし、型引数は部品として拾わない', () => {
    const planted = scan(
      'const r = useRef<HTMLInputElement>(null); return (<div><ShellPartBoundary label="a"><Foo /></ShellPartBoundary><Bar x={1} /></div>);',
    );
    expect(planted).toEqual([
      { name: 'ShellPartBoundary', inside: null },
      { name: 'Foo', inside: 'ShellPartBoundary' },
      { name: 'Bar', inside: null },
    ]);
  });
});
