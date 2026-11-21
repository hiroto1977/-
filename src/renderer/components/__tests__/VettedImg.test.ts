import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VettedImg } from '../VettedImg';
import { safeImageSrc, safeRemoteImageSrc } from '../../../shared/imageUrlGate';
import type { VettedExternalUrl, VettedImageSrc } from '../../../shared/vetted';

/*
 * **`<img>` の唯一の口** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * 部品は関門が作った印をそのまま `src` に置くだけで、何も足さず何も落とさない (実行時の守りは関門の中身)。
 * 型の守り (素の string・別の種類の印を断る) は下の `compileTimeControls` を `npm run typecheck` が検査する。
 */
describe('VettedImg —— 印つきの src をそのまま <img> に置く', () => {
  it('関門を通った http(s) の値を src に置き、ほかの属性も渡す', () => {
    const src = safeRemoteImageSrc('https://avatars.example.com/u/1.png');
    expect(src).toBe('https://avatars.example.com/u/1.png');
    if (src === undefined) return;
    const html = renderToStaticMarkup(createElement(VettedImg, { src, alt: '', className: 'data-list-thumb', loading: 'lazy' }));
    expect(html).toBe('<img src="https://avatars.example.com/u/1.png" alt="" class="data-list-thumb" loading="lazy"/>');
  });

  it('自分で組んだ data: URL も同じ関門を通って描ける (TemplatesPage / LibraryPage の形)', () => {
    const src = safeImageSrc('data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect(src).toBeDefined();
    if (src === undefined) return;
    expect(renderToStaticMarkup(createElement(VettedImg, { src, alt: 'x' }))).toContain('src="data:image/svg+xml;utf8,');
  });

  it('対照: 関門は中身の型の無い data: URL を断る (LibraryPage は壊れた画像を出さずに断る)', () => {
    expect(safeImageSrc('data:;base64,AAAA')).toBeUndefined();
    expect(safeImageSrc('data:application/octet-stream;base64,AAAA')).toBeUndefined();
  });
});

/*
 * **型の陰性対照** —— 呼ばれない。`@ts-expect-error` が「次の行は型の誤り」と宣言するので、
 * 部品が素の string を受けるように戻された日に `tsc` が「不要な @ts-expect-error」で落ちる。
 */
function compileTimeControls(raw: string, url: VettedExternalUrl, input: unknown): void {
  // @ts-expect-error 関門を通らない値は src に渡せない
  createElement(VettedImg, { src: raw, alt: '' });
  // @ts-expect-error 外へ開く URL の印は画像の口へ渡せない (種類の取り違え)
  createElement(VettedImg, { src: url, alt: '' });
  // @ts-expect-error undefined の門を通る前は渡せない
  createElement(VettedImg, { src: safeRemoteImageSrc(input), alt: '' });
  const ok: VettedImageSrc | undefined = safeRemoteImageSrc(input);
  if (ok !== undefined) createElement(VettedImg, { src: ok, alt: '' });
}
void compileTimeControls;
