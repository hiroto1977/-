/** @vitest-environment jsdom */
/**
 * 配色の選択 (パス 317) —— `theme.ts` の規則。
 *
 * 見るのは 5 つ: ① 保存値の読み (知らない値は既定・読めなければ理由を運ぶ) ② 'system' の解決
 * ③ `<html data-theme>` へ置く値は解いた後の値だけ ④ 'system' のあいだだけ OS の変更に追随し、
 * 選び直せば追随をやめる ⑤ 保存に失敗しても適用は行い、成否は戻り値で返す。
 *
 * `matchMedia` は jsdom に無いので代役を置く (listener を持ち、change を起こせる)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applySavedTheme,
  applyScheme,
  applyThemeChoice,
  DEFAULT_THEME,
  isThemeChoice,
  osPrefersDark,
  readThemeChoice,
  resolveScheme,
  sanitizeThemeChoice,
  selectTheme,
  syncHostChrome,
  THEME_CHOICES,
  THEME_KEY,
  THEME_LABELS,
  writeThemeChoice,
} from '../theme';

type Listener = (e: MediaQueryListEvent) => void;

/** `matchMedia` の代役: `matches` と change の listener を持ち、`fire` で OS の切り替えを起こす。 */
function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const addEventListener = vi.fn((_type: string, l: Listener) => {
    listeners.add(l);
  });
  const removeEventListener = vi.fn((_type: string, l: Listener) => {
    listeners.delete(l);
  });
  const mql = { matches, media: '(prefers-color-scheme: dark)', addEventListener, removeEventListener } as unknown as MediaQueryList;
  const win = { matchMedia: vi.fn(() => mql) };
  const fire = (next: boolean) => {
    for (const l of [...listeners]) l({ matches: next } as MediaQueryListEvent);
  };
  return { win, mql, fire, listeners, addEventListener, removeEventListener };
}

function fakeDoc() {
  const el = document.createElement('html');
  return { doc: { documentElement: el }, el };
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
  // window.matchMedia を置いた検査の後片付け (jsdom は元々持たない)。
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe('配色の選択: 値の規則', () => {
  it('3 択の綴りだけを通し、それ以外は既定 (ライト) に倒す', () => {
    for (const c of THEME_CHOICES) expect(sanitizeThemeChoice(c)).toBe(c);
    for (const bad of ['DARK', 'auto', '', null, undefined, 42, {}, ['dark']]) expect(sanitizeThemeChoice(bad)).toBe('light');
    expect(isThemeChoice('system')).toBe(true);
    expect(isThemeChoice('System')).toBe(false);
  });

  it('★ 既定はライト —— 何も選んでいない利用者の見た目を変えない (OS がダークでも)', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(resolveScheme(sanitizeThemeChoice(null), true)).toBe('light');
  });

  it("'system' だけが OS を見る", () => {
    expect(resolveScheme('light', true)).toBe('light');
    expect(resolveScheme('dark', false)).toBe('dark');
    expect(resolveScheme('system', true)).toBe('dark');
    expect(resolveScheme('system', false)).toBe('light');
  });

  it('3 択すべてに画面の名札が在る', () => {
    for (const c of THEME_CHOICES) expect(THEME_LABELS[c].length).toBeGreaterThan(0);
    expect(THEME_LABELS.system).toBe('OS に合わせる');
  });

  it('matchMedia が無い・投げる環境は「ダークではない」', () => {
    expect(osPrefersDark({})).toBe(false);
    expect(
      osPrefersDark({
        matchMedia: () => {
          throw new Error('not supported');
        },
      }),
    ).toBe(false);
    expect(osPrefersDark(fakeMatchMedia(true).win)).toBe(true);
    expect(osPrefersDark(fakeMatchMedia(false).win)).toBe(false);
  });
});

describe('配色の選択: 適用と追随', () => {
  it('<html data-theme> には解いた後の値を置く', () => {
    const { doc, el } = fakeDoc();
    applyScheme('dark', doc);
    expect(el.getAttribute('data-theme')).toBe('dark');
    applyScheme('light', doc);
    expect(el.getAttribute('data-theme')).toBe('light');
  });

  it("'dark' / 'light' は OS を無視し、listener も付けない", () => {
    const fm = fakeMatchMedia(true);
    const { doc, el } = fakeDoc();
    const stop = applyThemeChoice('light', { win: fm.win, doc });
    expect(el.getAttribute('data-theme')).toBe('light');
    expect(fm.addEventListener).not.toHaveBeenCalled();
    stop();
    applyThemeChoice('dark', { win: fakeMatchMedia(false).win, doc });
    expect(el.getAttribute('data-theme')).toBe('dark');
  });

  it("★ 'system' は OS の切り替えに追随し、止めれば追随しない", () => {
    const fm = fakeMatchMedia(false);
    const { doc, el } = fakeDoc();
    const stop = applyThemeChoice('system', { win: fm.win, doc });
    expect(el.getAttribute('data-theme')).toBe('light');
    expect(fm.addEventListener).toHaveBeenCalledTimes(1);
    fm.fire(true);
    expect(el.getAttribute('data-theme')).toBe('dark');
    stop();
    expect(fm.removeEventListener).toHaveBeenCalledTimes(1);
    expect(fm.listeners.size).toBe(0);
    fm.fire(false);
    // 止めた後は動かない (対照: 止める前は動いた)。
    expect(el.getAttribute('data-theme')).toBe('dark');
  });

  it("'system' で matchMedia が投げる / listener を持たない環境でも適用はする", () => {
    const { doc, el } = fakeDoc();
    const throwing = {
      matchMedia: () => {
        throw new Error('no');
      },
    };
    expect(() => applyThemeChoice('system', { win: throwing, doc })()).not.toThrow();
    expect(el.getAttribute('data-theme')).toBe('light');
    const legacy = { matchMedia: () => ({ matches: true }) as unknown as MediaQueryList };
    expect(() => applyThemeChoice('system', { win: legacy, doc })()).not.toThrow();
    expect(el.getAttribute('data-theme')).toBe('dark');
  });
});

describe('配色の選択: 端末との読み書き (入口 localWrite を通す)', () => {
  it('保存値を読む: 在る / 無い / 壊れている', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readThemeChoice()).toEqual({ choice: 'dark', readable: true, message: null });
    localStorage.removeItem(THEME_KEY);
    expect(readThemeChoice()).toEqual({ choice: 'light', readable: true, message: null });
    localStorage.setItem(THEME_KEY, 'DARK');
    expect(readThemeChoice().choice).toBe('light');
  });

  it('★ 保存領域を読めなければ既定で描き、理由 (入口の文) を運ぶ', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    });
    const read = readThemeChoice();
    expect(read.choice).toBe('light');
    expect(read.readable).toBe(false);
    expect(read.message).toContain('プライベートモード');
  });

  it('書く: 成功は ok、容量超過は入口の文で断る', () => {
    expect(writeThemeChoice('dark')).toEqual({ ok: true });
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    const r = writeThemeChoice('light');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('保存領域が一杯');
  });

  it('★ selectTheme は適用してから保存し、前の追随を止める', () => {
    const fm = fakeMatchMedia(true);
    Object.defineProperty(window, 'matchMedia', { value: fm.win.matchMedia, configurable: true, writable: true });
    expect(selectTheme('system')).toEqual({ ok: true });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
    expect(fm.listeners.size).toBe(1);
    expect(selectTheme('light')).toEqual({ ok: true });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(fm.listeners.size).toBe(0);
    fm.fire(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('★ 保存に失敗しても適用は行う (この場では効く。成否は戻り値)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    });
    const r = selectTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('プライベートモード');
  });

  it('起動時: 保存された選択を読んで適用する', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(applySavedTheme().choice).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    localStorage.setItem(THEME_KEY, 'garbage');
    expect(applySavedTheme().choice).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('配色の選択: 母体への伝達 (パス 318)', () => {
  /** stylesheet の実値の代役: --bg を返す getComputedStyle と、meta と橋を持つ document。 */
  function hostDoc(bg: string, opts: { meta?: boolean; bridge?: (s: string, b: string) => Promise<unknown> } = {}) {
    const el = document.createElement('html');
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#fff7fa');
    const calls: [string, string][] = [];
    const view = {
      getComputedStyle: () => ({ getPropertyValue: (name: string) => (name === '--bg' ? bg : '') }),
      serviceHub:
        opts.bridge === undefined
          ? undefined
          : {
              setColorScheme: (s: string, b: string) => {
                calls.push([s, b]);
                return opts.bridge!(s, b);
              },
            },
    } as unknown as Window;
    const doc = {
      documentElement: el,
      defaultView: view,
      querySelector: (sel: string) => (opts.meta === false ? null : sel === 'meta[name="theme-color"]' ? meta : null),
    };
    return { doc, el, meta, calls };
  }

  it('★ theme-color と橋に伝えるのは stylesheet の --bg の実値 (palette を写さない)', async () => {
    const h = hostDoc('#1b1520', { bridge: async () => ({ ok: true }) });
    syncHostChrome('dark', h.doc);
    expect(h.meta.getAttribute('content')).toBe('#1b1520');
    expect(h.calls).toEqual([['dark', '#1b1520']]);
  });

  it('★ 実値が #rrggbb でなければ何も伝えない (styles の無い環境で空文字や var() を送らない)', () => {
    for (const bad of ['', 'var(--x)', 'rgb(27, 21, 32)', '#fff']) {
      const h = hostDoc(bad, { bridge: async () => ({ ok: true }) });
      syncHostChrome('dark', h.doc);
      expect(h.meta.getAttribute('content'), bad).toBe('#fff7fa');
      expect(h.calls, bad).toEqual([]);
    }
  });

  it('meta が無い (単一 HTML) / 橋が無い (jsdom) でも投げない', () => {
    const noMeta = hostDoc('#1b1520', { meta: false, bridge: async () => ({ ok: true }) });
    expect(() => syncHostChrome('dark', noMeta.doc)).not.toThrow();
    expect(noMeta.calls).toEqual([['dark', '#1b1520']]);
    const noBridge = hostDoc('#1b1520');
    expect(() => syncHostChrome('dark', noBridge.doc)).not.toThrow();
    expect(noBridge.meta.getAttribute('content')).toBe('#1b1520');
  });

  it('橋が reject しても未処理の拒否にならない (失うのは起動の一瞬の色だけ)', async () => {
    const h = hostDoc('#1b1520', { bridge: async () => Promise.reject(new Error('ipc down')) });
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      syncHostChrome('dark', h.doc);
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
    expect(h.calls).toHaveLength(1);
  });

  it("★ 適用のたびに伝える —— 'system' で OS が切り替わった時も", () => {
    const fm = fakeMatchMedia(false);
    const h = hostDoc('#fff7fa', { bridge: async () => ({ ok: true }) });
    const stop = applyThemeChoice('system', { win: fm.win, doc: h.doc });
    expect(h.calls).toEqual([['light', '#fff7fa']]);
    fm.fire(true);
    expect(h.calls).toEqual([['light', '#fff7fa'], ['dark', '#fff7fa']]);
    stop();
  });
});
