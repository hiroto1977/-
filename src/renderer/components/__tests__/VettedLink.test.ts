// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { VettedLink } from '../VettedLink';
import { externalUrlOrNull } from '../../../shared/externalUrlGate';
import { safeImageSrc } from '../../../shared/imageUrlGate';
import type { VettedExternalUrl } from '../../../shared/vetted';

/*
 * **外へ出る `<a href>` の唯一の口** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * 部品は関門が作った印をそのまま `href` に置き、左クリックを `serviceHub.openExternal` へ回す。
 * 型の守り (素の string・別の種類の印を断る) は下の `compileTimeControls` を `npm run typecheck` が検査する。
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

describe('VettedLink —— 印つきの href をそのまま <a> に置く', () => {
  it('関門を通った URL を href に置き、rel="noopener noreferrer" を固定する', () => {
    const href = externalUrlOrNull('https://www.mhlw.go.jp/');
    expect(href).not.toBeNull();
    if (href === null) return;
    const html = renderToStaticMarkup(createElement(VettedLink, { href, className: 'x', children: '出典' }));
    expect(html).toBe('<a href="https://www.mhlw.go.jp/" rel="noopener noreferrer" class="x">出典</a>');
  });

  it('左クリックは既定の遷移を止め、OS のブラウザ (openExternal) へ同じ URL を渡す', () => {
    const href = externalUrlOrNull('https://example.com/a?b=1');
    if (href === null) throw new Error('関門が正当な URL を断った');
    const openExternal = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('serviceHub', { openExternal });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(VettedLink, { href, children: '開く' })));
    const a = host.querySelector('a');
    expect(a).not.toBeNull();
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      a!.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/a?b=1');
  });

  it('対照: 関門は http(s) 以外を断るので、呼び出し側はリンクを描かずに理由を出す形になる', () => {
    expect(externalUrlOrNull('javascript:alert(1)')).toBeNull();
    expect(externalUrlOrNull('file:///etc/passwd')).toBeNull();
  });
});

/*
 * **型の陰性対照** —— 呼ばれない。`@ts-expect-error` が「次の行は型の誤り」と宣言するので、
 * 部品が素の string を受けるように戻された日に `tsc` が「不要な @ts-expect-error」で落ちる。
 */
function compileTimeControls(raw: string, input: unknown): void {
  // @ts-expect-error 関門を通らない値は href に渡せない
  createElement(VettedLink, { href: raw, children: 'x' });
  const img = safeImageSrc(input);
  // @ts-expect-error 画像の印は外へ開く口へ渡せない (種類の取り違え)
  if (img !== undefined) createElement(VettedLink, { href: img, children: 'x' });
  // @ts-expect-error null の門を通る前は渡せない
  createElement(VettedLink, { href: externalUrlOrNull(input), children: 'x' });
  const ok: VettedExternalUrl | null = externalUrlOrNull(input);
  if (ok !== null) createElement(VettedLink, { href: ok, children: 'x' });
}
void compileTimeControls;
