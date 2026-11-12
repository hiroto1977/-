/**
 * **壊れた保管層の上で画面を素で描く**ための共有の足場 (2026-09-24 · パス 441)。
 *
 * ここは `__tests__/` の中の**検査ではない**ファイル (`malformedRows.ts` /
 * `recordStoreHarness.ts` / `jsdomWait.ts` と同じ形)。2 本目の読み手
 * (`__audits__/malformedFieldSweep.audit.ts`) が要ったので
 * `malformedStoreRenders.test.ts` から出した —— **写しを作らない**
 * (法則 `copy-pinned-by-parity`: 写すなら一致を機械が持つ。出せるなら出す)。
 *
 * `renderFailure` は**境界で包まない** —— `PageErrorBoundary` で包むと
 * 投げたことが文面になり、「描けた」と区別できなくなる。
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** jsdom に無い物 (橋・matchMedia・scrollTo) を置く。描画中の警告は本題ではないので黙らせる。 */
export function installPageRenderGlobals(quiet: (name: 'error' | 'warn') => void): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'), // Electron 扱い (ロック画面を出さない)
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'none', counts: {} }),
    checkUpdate: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve(),
    eraseAll: () => Promise.resolve({ ok: true }),
    authorize: () => Promise.resolve({ ok: false }),
  };
  if (typeof window.matchMedia !== 'function') {
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
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  quiet('error');
  quiet('warn');
}

/** React の待ち行列を流す (この足場は「投げたか」だけを見るので条件では待たない)。 */
export async function settlePage(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 1 画面を素で描いて、投げたら理由を返す。器は呼び手が持つ (unmount まで面倒を見る)。 */
export async function renderPageFailure(host: HTMLElement, page: () => unknown): Promise<string | null> {
  let root: Root | null = null;
  try {
    root = createRoot(host);
    const r = root;
    await act(async () => {
      r.render(createElement(page as never));
    });
    await settlePage();
    return null;
  } catch (err) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    if (root !== null) {
      const r = root;
      act(() => {
        r.unmount();
      });
    }
  }
}
