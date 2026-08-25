/**
 * DataList コンポーネントのレンダー回帰テスト。
 *
 * renderToStaticMarkup で同期 SSR し、クラッシュ / 表示崩れ / 空状態の
 * フォールバックを検証する。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataList } from '../DataList';
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
