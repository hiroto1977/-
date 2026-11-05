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
import { hostStyle, hostWindow } from '../frameGuardHost';

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

  // 変異検査で残った 3 つ。どれも「断りが伝わるか」に効く。
  it('支援技術へ知らせる (role="alert")', () => {
    const doc = fresh();
    const el = renderFrameRefusal(doc, 'https://example.com/');
    // これが消えると、読み上げ環境では**何も起きなかったのと同じ**になる。
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('見出しが空でない (なぜ白いのかが分かる)', () => {
    const doc = fresh();
    renderFrameRefusal(doc, 'https://example.com/');
    const h = doc.querySelector('h1');
    expect(h?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  // 文字の無いリンクは押せない = 唯一の逃げ道が消える。
  it('単独で開くリンクに文字がある (押せる)', () => {
    const doc = fresh();
    renderFrameRefusal(doc, 'https://example.com/');
    const a = doc.querySelector('a');
    expect(a?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('#root が無い頁でも body に描く (取りこぼさない)', () => {
    document.body.replaceChildren();
    const el = renderFrameRefusal(document, 'https://example.com/');
    expect(document.body.contains(el)).toBe(true);
    expect(document.body.textContent).toContain(FRAMED_MESSAGE);
  });
});

// Mamori への移植 (MG-037) で書き直した所を、振る舞いで留める。
describe('frameGuard.mamori の移植 (MG-037)', () => {
  const fresh = (): Document => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    return document;
  };

  it('引数を省くと実物の window で判じる (jsdom は枠の外)', () => {
    expect(isFramed()).toBe(false);
    expect(hostWindow()).toBe(window);
  });

  it('子が何個あっても全部消す (押す対象を 1 つも残さない)', () => {
    const doc = fresh();
    const root = doc.getElementById('root')!;
    for (let i = 0; i < 5; i++) {
      const b = doc.createElement('button');
      b.textContent = `押す ${i}`;
      root.appendChild(b);
    }
    renderFrameRefusal(doc, 'https://example.com/');
    expect(doc.querySelectorAll('button').length).toBe(0);
    expect(root.children.length).toBe(1);
  });

  it('断りの組み立て: 見出し・本文・リンクの順で、文は textContent に入る', () => {
    const doc = fresh();
    const box = renderFrameRefusal(doc, 'https://example.com/');
    expect(Array.from(box.children).map((c) => c.tagName)).toEqual(['H1', 'P', 'A']);
    expect(box.children[0]?.textContent).toBe('枠の中では開けません');
    expect(box.children[1]?.textContent).toBe(FRAMED_MESSAGE);
    expect(box.children[2]?.textContent).toBe('Service Hub を単独で開く');
  });

  it('文面は 3 文を順に繋いだもの', () => {
    expect(FRAMED_MESSAGE).toBe(
      'Service Hub は他のサイトの枠 (iframe) の中では動きません。' +
        'なりすましたページに操作を押させる手口を防ぐためです。' +
        '下のリンクからこのページを単独で開いてください。',
    );
  });

  it('host の style の口は cssText を据える', () => {
    const el = document.createElement('div');
    hostStyle(el, 'margin:0');
    expect(el.style.cssText).toContain('margin');
  });
});

