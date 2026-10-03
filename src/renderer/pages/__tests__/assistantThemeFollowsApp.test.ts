/** @vitest-environment jsdom */
/**
 * **アシスタントの既定の色は、アプリの配色に追随する** (2026-10-02 · パス 503)。
 *
 * ## 見つけた物
 *
 * この画面だけは、地と字の**既定が固定の白 + 黒**だった (`DEFAULT_THEME = { bg: '#ffffff', fg: '#000000' }`)。
 * 実機で描画済みの色を 4 配色で測ると (WCAG 2.x AA)、ダークでは**白い板の上にトークンの明るい字**が載り、
 * 「AI へ何を送るか」の断りや補足が **1.13:1** で読めなかった。**外へ出る物の断りが、読めない色で出ていた**。
 *
 * ## 直し
 *
 * - **何も選んでいなければ** (空文字) 地は `var(--bg-elev)`・字は `var(--text)` —— 配色が変われば一緒に変わる
 * - **以前の既定 (白 + 黒) の保存値は「選んでいない」へ戻す**: この画面は開くたびにテーマを保存していたので、
 *   色に触れていない人は全員これを持つ (背景画像は残す)
 * - **利用者が選んだ色は今までどおり**そのまま使う。字を選んだときは、この面の中でだけ文字のトークンを選んだ色へ
 *   言い直す (断り・補足は `--text-muted` などのトークンで描くので、選んだ地の上でも読めるように)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantPage } from '../AssistantPage';
import { settleUntil } from '../../__tests__/jsdomWait';

vi.mock('../../voice/speechAdapter', () => ({
  isSpeechRecognitionSupported: () => false,
  startSpeechRecognition: () => ({ stop: () => undefined, abort: () => undefined }),
}));
vi.mock('../../voice/ttsAdapter', () => ({ speak: () => undefined, cancelSpeech: () => undefined }));

const KEY = 'assistant-theme';
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['assistant']),
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

async function mount(stored?: unknown): Promise<HTMLElement> {
  if (stored !== undefined) localStorage.setItem(KEY, JSON.stringify(stored));
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AssistantPage));
  });
  await settleUntil(() => container.querySelector('form') !== null, '画面が出る');
  const page = container.firstElementChild as HTMLElement | null;
  if (page === null) throw new Error('画面の根が無い');
  return page;
}

/** 根の style 属性 (React は style を属性へ反映する)。`var(--x)` はそのまま残る。 */
const styleOf = (el: HTMLElement): string => el.getAttribute('style') ?? '';

async function openThemePanel(): Promise<void> {
  const btn = container.querySelector<HTMLButtonElement>('button[title="背景をカスタマイズ"]');
  if (!btn) throw new Error('「背景をカスタマイズ」のボタンが無い');
  await act(async () => {
    btn.click();
  });
  await settleUntil(() => container.querySelector('input[aria-label="背景色"]') !== null, 'テーマの欄が出る');
}

async function pick(label: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`${label} の欄が無い`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const stored = (): { bg: string; fg: string; image: string } => JSON.parse(localStorage.getItem(KEY) ?? 'null');

describe('アシスタントの既定の色はアプリの配色に追随する (パス 503)', () => {
  it('★ 何も選んでいなければ、地は var(--bg-elev)・字は var(--text) (固定の白 + 黒ではない)', async () => {
    const page = await mount();
    const s = styleOf(page);
    expect(s, '地').toContain('background: var(--bg-elev)');
    expect(s, '字').toContain('color: var(--text)');
    expect(s, '色を選んでいないので文字のトークンは言い直さない').not.toContain('--text-muted');
    // 標本: 針が当たる (固定の白や黒が書かれていれば拾える形)
    expect('background: rgb(255, 255, 255); color: rgb(0, 0, 0)').toMatch(/background: rgb\(255, 255, 255\)/);
    expect(s).not.toMatch(/rgb\(255, 255, 255\)|#fff/i);
  });

  it('★ 以前の既定 (白 + 黒) の保存値は「選んでいない」へ戻る・背景画像は残す', async () => {
    const page = await mount({ bg: '#ffffff', fg: '#000000', image: 'https://example.com/bg.png' });
    expect(styleOf(page)).toContain('background: var(--bg-elev)');
    expect(styleOf(page)).toContain('color: var(--text)');
    // この画面は開くたびに保存するので、保存値も「選んでいない」へ書き換わる (画像はそのまま)
    await settleUntil(() => stored().bg === '', '保存値が書き換わる');
    expect(stored()).toEqual({ bg: '', fg: '', image: 'https://example.com/bg.png' });
  });

  it('★ 利用者が選んだ色は今までどおり使う (地だけ・字だけ・両方)', async () => {
    const both = await mount({ bg: '#112233', fg: '#eeeeee', image: '' });
    const s = styleOf(both);
    expect(s).toMatch(/background: (#112233|rgb\(17, 34, 51\))/);
    expect(s).toMatch(/(^|;) ?color: (#eeeeee|rgb\(238, 238, 238\))/);
    // 字を選んだので、この面の中でだけ文字のトークンを選んだ色へ言い直す (別名の --text-mute も)
    for (const name of ['--text', '--text-muted', '--text-mute']) {
      expect(both.style.getPropertyValue(name), name).toBe('#eeeeee');
    }
  });

  it('★ 字だけ選んだときも、地は追随し、文字のトークンは選んだ色へ言い直す', async () => {
    const page = await mount({ bg: '', fg: '#222222', image: '' });
    expect(styleOf(page)).toContain('background: var(--bg-elev)');
    for (const name of ['--text', '--text-muted', '--text-mute']) expect(page.style.getPropertyValue(name), name).toBe('#222222');
  });

  it('★ 地だけ選んだときは、字は追随のまま (文字のトークンは言い直さない)', async () => {
    const page = await mount({ bg: '#112233', fg: '', image: '' });
    expect(styleOf(page)).toMatch(/background: (#112233|rgb\(17, 34, 51\))/);
    expect(styleOf(page)).toContain('color: var(--text)');
    expect(page.style.getPropertyValue('--text-muted')).toBe('');
  });

  it('色の欄は、選んでいないときは今効いているトークンの色を見せる (読めなければ旧い既定)', async () => {
    document.documentElement.style.setProperty('--bg-elev', '#1d1c1a');
    document.documentElement.style.setProperty('--text', '#F0EFE9');
    await mount();
    await openThemePanel();
    expect(container.querySelector<HTMLInputElement>('input[aria-label="背景色"]')!.value).toBe('#1d1c1a');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="文字色"]')!.value, '大文字は小文字へ').toBe('#f0efe9');
  });

  it('色の欄は、トークンが読めなければ (スタイルシートが無い環境) 旧い既定の白・黒を見せる', async () => {
    await mount();
    await openThemePanel();
    expect(container.querySelector<HTMLInputElement>('input[aria-label="背景色"]')!.value).toBe('#ffffff');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="文字色"]')!.value).toBe('#000000');
  });

  it('★ 色を選ぶと効き、「既定に戻す」で追随へ戻る (保存値も空へ)', async () => {
    const page = await mount();
    await openThemePanel();
    await pick('背景色', '#334455');
    await pick('文字色', '#fafafa');
    expect(styleOf(page)).toMatch(/background: (#334455|rgb\(51, 68, 85\))/);
    expect(page.style.getPropertyValue('--text-muted')).toBe('#fafafa');
    await settleUntil(() => stored().bg === '#334455', '選んだ色が保存される');
    const reset = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('既定に戻す'));
    if (!reset) throw new Error('「既定に戻す」が無い');
    await act(async () => {
      reset.click();
    });
    expect(styleOf(page)).toContain('background: var(--bg-elev)');
    expect(page.style.getPropertyValue('--text-muted')).toBe('');
    await settleUntil(() => stored().bg === '', '保存値が空へ戻る');
    expect(stored()).toEqual({ bg: '', fg: '', image: '' });
  });
});
