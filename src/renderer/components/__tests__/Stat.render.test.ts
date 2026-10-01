/**
 * Stat コンポーネントのレンダー回帰・props 分岐テスト。
 *
 * - label / value の表示
 * - positive=true → 緑 (var(--success))
 * - positive=false → 赤 (var(--danger))
 * - positive=undefined → color 無指定
 */
import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stat } from '../Stat';

describe('Stat — renders without crashing', () => {
  it('label と value を指定してクラッシュしない', () => {
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(
        createElement(Stat, { label: '今週の売上', value: '¥1,200,000' }),
      );
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
  });
});

describe('Stat — label / value 表示', () => {
  it('label テキストを含む', () => {
    const html = renderToStaticMarkup(
      createElement(Stat, { label: '月次キャッシュフロー', value: '¥500,000' }),
    );
    expect(html).toContain('月次キャッシュフロー');
  });

  it('value テキストを含む', () => {
    const html = renderToStaticMarkup(
      createElement(Stat, { label: '評価損益', value: '+¥30,000' }),
    );
    expect(html).toContain('+¥30,000');
  });
});

describe('Stat — positive カラーリング', () => {
  it('positive=true のとき緑 (var(--success)) を適用', () => {
    const html = renderToStaticMarkup(
      createElement(Stat, { label: '損益', value: '+100', positive: true }),
    );
    expect(html).toContain('var(--success)');
    expect(html).not.toContain('var(--danger)');
  });

  it('positive=false のとき赤 (var(--danger)) を適用', () => {
    const html = renderToStaticMarkup(
      createElement(Stat, { label: '損益', value: '-100', positive: false }),
    );
    expect(html).toContain('var(--danger)');
    expect(html).not.toContain('var(--success)');
  });

  it('positive=undefined のとき color スタイル指定なし', () => {
    const html = renderToStaticMarkup(
      createElement(Stat, { label: '売上', value: '¥1,000' }),
    );
    // インラインカラーが付かないことを確認。
    expect(html).not.toContain('var(--success)');
    expect(html).not.toContain('var(--danger)');
  });
});

describe('Stat — 複数インスタンスを並べてもクラッシュしない', () => {
  it('3 つ並べてレンダー可能', () => {
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(
        createElement(Fragment, null,
          createElement(Stat, { label: '今週の売上', value: '¥1,200,000' }),
          createElement(Stat, { label: '月次キャッシュフロー', value: '¥500,000', positive: true }),
          createElement(Stat, { label: '評価損益', value: '-¥30,000', positive: false }),
        ),
      );
    }).not.toThrow();
    expect(html).toContain('今週の売上');
    expect(html).toContain('月次キャッシュフロー');
    expect(html).toContain('評価損益');
  });
});
