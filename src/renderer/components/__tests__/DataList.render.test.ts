/**
 * DataList コンポーネントのレンダー回帰テスト。
 *
 * renderToStaticMarkup で同期 SSR し、クラッシュ / 表示崩れ / 空状態の
 * フォールバックを検証する。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataList, safeImageSrc, safeCssUrl } from '../DataList';
import type { DataListItem } from '../DataList';

describe('DataList — empty state', () => {
  it('renders the default fallback when items is empty', () => {
    const html = renderToStaticMarkup(createElement(DataList, { items: [] }));
    expect(html).toContain('データがありません');
  });

  it('renders a custom empty message', () => {
    const html = renderToStaticMarkup(
      createElement(DataList, { items: [], empty: 'まだ項目がありません' }),
    );
    expect(html).toContain('まだ項目がありません');
    expect(html).not.toContain('データがありません');
  });

  it('wraps the empty fallback in a div with class "empty"', () => {
    const html = renderToStaticMarkup(createElement(DataList, { items: [] }));
    expect(html).toMatch(/class="empty"/);
  });
});

describe('DataList — with items', () => {
  const items: DataListItem[] = [
    { key: 'a', title: 'タイトル A', meta: 'メタ A', badge: 'badge-a' },
    { key: 'b', title: 'タイトル B' },
  ];

  it('renders a ul with class "data-list"', () => {
    const html = renderToStaticMarkup(createElement(DataList, { items }));
    expect(html).toMatch(/class="data-list"/);
  });

  it('renders all titles', () => {
    const html = renderToStaticMarkup(createElement(DataList, { items }));
    expect(html).toContain('タイトル A');
    expect(html).toContain('タイトル B');
  });

  it('renders meta when provided and omits it when absent', () => {
    const html = renderToStaticMarkup(createElement(DataList, { items }));
    expect(html).toContain('メタ A');
    // item B has no meta, so data-list-meta should appear only once (for A).
    const metaCount = (html.match(/data-list-meta/g) ?? []).length;
    expect(metaCount).toBe(1);
  });

  it('renders a badge when provided', () => {
    const html = renderToStaticMarkup(createElement(DataList, { items }));
    expect(html).toContain('badge-a');
  });

  it('renders a thumbnail img when thumbnailUrl is given', () => {
    const withThumb: DataListItem[] = [
      { key: 't', title: 'thumb item', thumbnailUrl: 'https://example.com/img.png' },
    ];
    const html = renderToStaticMarkup(createElement(DataList, { items: withThumb }));
    expect(html).toContain('data-list-thumb');
    expect(html).toContain('https://example.com/img.png');
  });

  it('renders an "開く" button when href is given', () => {
    const withHref: DataListItem[] = [
      { key: 'h', title: 'link item', href: 'https://example.com' },
    ];
    const html = renderToStaticMarkup(createElement(DataList, { items: withHref }));
    expect(html).toContain('開く');
  });

  it('does not render an "開く" button when href is absent', () => {
    const noHref: DataListItem[] = [{ key: 'x', title: 'no link' }];
    const html = renderToStaticMarkup(createElement(DataList, { items: noHref }));
    expect(html).not.toContain('開く');
  });
});

/**
 * 2026-07 セキュリティ監査（多層防御）: 第三者由来の画像 URL のスキーム検証。
 * `<img src>` 自体はスクリプトを実行しないが、同じ値が `<a href>` / CSS `url()` /
 * SVG `<use>` に移った瞬間に危険になるため、入口で許可スキームに限定する。
 */
describe('safeImageSrc — 許可スキーム', () => {
  it('https / http はそのまま通す', () => {
    expect(safeImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeImageSrc('http://example.com/a.png')).toBe('http://example.com/a.png');
    expect(safeImageSrc('HTTPS://EXAMPLE.COM/A.PNG')).toBe('HTTPS://EXAMPLE.COM/A.PNG');
  });

  it('data:image/* は通す（base64 / 非 base64 とも）', () => {
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(safeImageSrc('data:image/svg+xml,%3Csvg%2F%3E')).toBe('data:image/svg+xml,%3Csvg%2F%3E');
  });

  it('javascript: を拒否する', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeUndefined();
    expect(safeImageSrc('JaVaScRiPt:alert(1)')).toBeUndefined();
  });

  it('tab/改行で難読化した javascript: も拒否する', () => {
    // HTML は URL 属性のパース前に tab/LF/CR を除去するため、検証側も同じ正規化が必要。
    expect(safeImageSrc('java\tscript:alert(1)')).toBeUndefined();
    expect(safeImageSrc('  java\nscript:alert(1)  ')).toBeUndefined();
  });

  it('data:image/* 以外の data: URI を拒否する', () => {
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeImageSrc('data:image')).toBeUndefined();
    expect(safeImageSrc('data:imagex/png;base64,AA')).toBeUndefined();
  });

  it('その他のスキーム / 相対パス / 空値を拒否する', () => {
    expect(safeImageSrc('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeImageSrc('file:///etc/passwd')).toBeUndefined();
    expect(safeImageSrc('//example.com/a.png')).toBeUndefined();
    expect(safeImageSrc('./a.png')).toBeUndefined();
    expect(safeImageSrc('')).toBeUndefined();
    expect(safeImageSrc(undefined)).toBeUndefined();
  });
});

describe('DataList — thumbnailUrl のスキーム検証', () => {
  const thumb = (thumbnailUrl: string): string =>
    renderToStaticMarkup(
      createElement(DataList, { items: [{ key: 't', title: 'item', thumbnailUrl }] }),
    );

  it('javascript: の場合は img 要素も src 属性も出力しない', () => {
    const html = thumb('javascript:alert(1)');
    expect(html).not.toContain('<img');
    // 空の src="" はページ自身の再取得を起こすため、絶対に出さない。
    expect(html).not.toContain('src=');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('item'); // 他の内容は通常どおり描画される
  });

  it('data:image/* のサムネイルは描画する', () => {
    const html = thumb('data:image/png;base64,iVBORw0KGgo=');
    expect(html).toContain('data-list-thumb');
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
  });

  it('data:text/html のサムネイルは描画しない', () => {
    const html = thumb('data:text/html,<script>alert(1)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('data:text/html');
  });
});

describe('DataList — does not crash with edge-case inputs', () => {
  it('handles a single item with all optional fields absent', () => {
    const items: DataListItem[] = [{ key: 'min', title: '最小' }];
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(createElement(DataList, { items }));
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
  });

  it('handles many items without crashing', () => {
    const items: DataListItem[] = Array.from({ length: 50 }, (_, i) => ({
      key: String(i),
      title: `Item ${i}`,
      meta: `meta ${i}`,
      badge: `badge-${i}`,
      href: `https://example.com/${i}`,
      thumbnailUrl: `https://example.com/${i}.png`,
    }));
    expect(() => renderToStaticMarkup(createElement(DataList, { items }))).not.toThrow();
  });
});

describe('safeCssUrl — CSS url() へ入れる形', () => {
  /*
   * `safeImageSrc` の冒頭は「同じ値が CSS `url()` へ流れた瞬間に危険」と
   * 書いていたのに、その CSS `url()` (`pages/AssistantPage.tsx` の背景画像)
   * だけが関門を通っていなかった (2026-08-24)。値は localStorage の
   * `assistant-theme` から来るので、同一オリジンの別ページや拡張から
   * 書き換えられる。
   */
  it('許可スキームは引用して返す', () => {
    expect(safeCssUrl('https://example.com/a.png')).toBe('url("https://example.com/a.png")');
    expect(safeCssUrl('data:image/png;base64,AAAA')).toBe('url("data:image/png;base64,AAAA")');
  });

  it.each([
    ['javascript:alert(1)'],
    ['java\tscript:alert(1)'], // tab を挟んでスキーム判定を外す形
    ['data:text/html,<script>x</script>'],
    ['vbscript:x'],
    ['file:///etc/passwd'],
    [''],
  ])('許可外は undefined を返す: %s', (v) => {
    expect(safeCssUrl(v)).toBeUndefined();
  });

  it('undefined / null はそのまま undefined', () => {
    expect(safeCssUrl(undefined)).toBeUndefined();
    expect(safeCssUrl(null)).toBeUndefined();
  });

  it('★ 宣言を壊す文字が入っても引用の中に収まる', () => {
    // `)` や空白は実在しうる URL の一部。素の url() へ差し込むと
    // 宣言が壊れて背景が黙って出なくなる。
    expect(safeCssUrl('https://example.com/a(b).png')).toBe('url("https://example.com/a(b).png")');
    expect(safeCssUrl('https://example.com/a b.png')).toBe('url("https://example.com/a b.png")');
  });

  it('★ 引用符とバックスラッシュは退避する (引用から抜け出させない)', () => {
    expect(safeCssUrl('https://example.com/a".png')).toBe('url("https://example.com/a\\".png")');
    expect(safeCssUrl('https://example.com/a\\.png')).toBe('url("https://example.com/a\\\\.png")');
  });

  it('safeImageSrc と同じ判断をする (関門は 1 つ)', () => {
    for (const v of [
      'https://x/a.png', 'http://x/a.png', 'data:image/svg+xml,<svg/>',
      'javascript:x', 'data:text/html,x', 'ftp://x/a.png', '',
    ]) {
      expect(safeCssUrl(v) === undefined).toBe(safeImageSrc(v) === undefined);
    }
  });
});
