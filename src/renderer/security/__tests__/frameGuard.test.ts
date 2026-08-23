/** @vitest-environment jsdom */
/**
 * frameGuard — 枠 (iframe) に入れられた状態で描画しない関門。
 *
 * 実測の背景 (2026-08-23・実 chromium): `frame-ancestors` を `<meta>` の CSP へ
 * 書いても**ブラウザに無視される**ので、`buildCsp` に 1 行足す直し方は
 * 見せかけにしかならない。公開先の GitHub Pages と `file://` 配布はどちらも
 * 応答ヘッダを足せないため、頁の側で断るしかない。
 */
import { describe, expect, it } from 'vitest';
import { FRAMED_MESSAGE, isFramed, renderFrameRefusal } from '../frameGuard';

/** `window` の代わりに渡せる最小の形。 */
const win = (top: unknown, self: unknown): Window => ({ top, self }) as unknown as Window;

describe('isFramed — 上位フレームの中に居るか', () => {
  it('top と self が同じなら枠の外 (Electron 版と単独タブ)', () => {
    const w = {} as Record<string, unknown>;
    w.top = w;
    w.self = w;
    expect(isFramed(w as unknown as Window)).toBe(false);
  });

  it('top と self が違えば枠の中', () => {
    expect(isFramed(win({ a: 1 }, { b: 2 }))).toBe(true);
  });

  // 判定できない形は「枠の中」に倒す。逆に倒すと、読めない環境で守りが消える。
  it('top の読み出しが例外なら枠の中とみなす (fail-closed)', () => {
    const w = {
      get top(): Window {
        throw new Error('cross-origin');
      },
      self: {},
    };
    expect(isFramed(w as unknown as Window)).toBe(true);
  });
});

describe('renderFrameRefusal — 断りの描画', () => {
  const fresh = (): Document => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    root.id = 'root';
    root.textContent = 'アプリの中身';
    document.body.appendChild(root);
    return document;
  };

  it('#root の中身を消してから断りを入れる (押す対象を残さない)', () => {
    const doc = fresh();
    renderFrameRefusal(doc, 'https://example.com/app.html');
    const root = doc.getElementById('root');
    expect(root?.textContent).not.toContain('アプリの中身');
    expect(root?.textContent).toContain(FRAMED_MESSAGE);
  });

  it('単独で開くリンクは target="_top" (枠ごと置き換える)', () => {
    const doc = fresh();
    renderFrameRefusal(doc, 'https://example.com/app.html');
    const a = doc.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com/app.html');
    expect(a?.getAttribute('target')).toBe('_top');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  // 文面や URL に何が入っても markup にならないこと。`innerHTML` を使っていれば
  // ここで要素が生える。
  it('href や文面から markup が生えない', () => {
    const doc = fresh();
    renderFrameRefusal(doc, 'https://example.com/"><img src=x onerror=alert(1)>');
    expect(doc.querySelectorAll('img').length).toBe(0);
    expect(doc.querySelectorAll('script').length).toBe(0);
    const a = doc.querySelector('a');
    // 属性としては素の文字列のまま入る (エスケープではなく、そもそも解釈されない)。
    expect(a?.getAttribute('href')).toBe('https://example.com/"><img src=x onerror=alert(1)>');
  });

  it('#root が無い頁でも body に描く (取りこぼさない)', () => {
    document.body.replaceChildren();
    const el = renderFrameRefusal(document, 'https://example.com/');
    expect(document.body.contains(el)).toBe(true);
    expect(document.body.textContent).toContain(FRAMED_MESSAGE);
  });
});
