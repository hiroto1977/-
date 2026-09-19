/** @vitest-environment jsdom */
/**
 * 設定画面の「配色」(パス 317)。3 択のピルが即座に効き、端末に残り、保存や読み取りに失敗したら
 * その理由を言う (成功したときは言わない —— 標本は失敗の検査そのもの)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeSection } from '../ThemeSection';
import { THEME_KEY } from '../../theme';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(ThemeSection));
  });
  return host;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

type Listener = (e: MediaQueryListEvent) => void;
function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t: string, l: Listener) => {
      listeners.add(l);
    },
    removeEventListener: (_t: string, l: Listener) => {
      listeners.delete(l);
    },
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { value: () => mql, configurable: true, writable: true });
  return (next: boolean) => {
    act(() => {
      for (const l of [...listeners]) l({ matches: next } as MediaQueryListEvent);
    });
  };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

const btn = (h: HTMLElement, c: string) => h.querySelector(`[data-theme-choice="${c}"]`) as HTMLButtonElement;

describe('設定 › 配色', () => {
  it('3 択を出し、何も選んでいなければライトが押された状態', () => {
    const h = mount();
    expect([...h.querySelectorAll('[data-theme-choice]')].map((b) => b.textContent)).toEqual(['ライト', 'ダーク', 'OS に合わせる']);
    expect(btn(h, 'light').getAttribute('aria-pressed')).toBe('true');
    expect(btn(h, 'dark').getAttribute('aria-pressed')).toBe('false');
    expect(h.querySelector('[data-theme-note]')?.textContent).toContain('ライトで表示しています');
    expect(h.querySelector('[data-theme-save-error]')).toBeNull();
    expect(h.querySelector('[data-theme-unreadable]')).toBeNull();
  });

  it('★ ダークを押すと即座に <html data-theme="dark"> になり、端末に残る', () => {
    const h = mount();
    click(btn(h, 'dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(btn(h, 'dark').getAttribute('aria-pressed')).toBe('true');
    expect(btn(h, 'light').getAttribute('aria-pressed')).toBe('false');
    expect(h.querySelector('[data-theme-note]')?.textContent).toContain('ダークで表示しています');
    expect(h.querySelector('[data-theme-save-error]')).toBeNull();
  });

  it('保存された選択で開く', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const h = mount();
    expect(btn(h, 'dark').getAttribute('aria-pressed')).toBe('true');
  });

  it('★ 「OS に合わせる」は注記も適用も OS の切り替えに追随する', () => {
    const fire = installMatchMedia(true);
    const h = mount();
    click(btn(h, 'system'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(h.querySelector('[data-theme-note]')?.textContent).toContain('OS の設定に合わせてダークで表示しています');
    fire(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(h.querySelector('[data-theme-note]')?.textContent).toContain('OS の設定に合わせてライトで表示しています');
    // ライトを選び直せば OS には追随しない (対照: 上では追随した)。
    click(btn(h, 'light'));
    fire(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(h.querySelector('[data-theme-note]')?.textContent).toContain('ライトで表示しています');
  });

  it('★ 保存できなくても配色は変わり、「次回のために保存できなかった」と理由を言う', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    const h = mount();
    click(btn(h, 'dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const err = h.querySelector('[data-theme-save-error]');
    expect(err?.textContent).toContain('次回のために保存できませんでした');
    expect(err?.textContent).toContain('保存領域が一杯');
  });

  it('★ 保存領域を読めなければ既定のライトで開き、理由を言う', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    });
    const h = mount();
    expect(btn(h, 'light').getAttribute('aria-pressed')).toBe('true');
    const note = h.querySelector('[data-theme-unreadable]');
    expect(note?.textContent).toContain('既定のライトで表示しています');
    expect(note?.textContent).toContain('プライベートモード');
  });
});
