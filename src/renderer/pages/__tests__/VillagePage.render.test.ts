/**
 * VillagePage のレンダー回帰テスト。setInterval / window.serviceHub / 音声 API を
 * 使う複雑なページなので、render 時のクラッシュ（TDZ・undefined 参照）を SSR で捕捉する。
 * renderToStaticMarkup は useEffect を走らせないため、タイマーや serviceHub への
 * 副作用は発生せず、純粋に初回描画のみを検証できる。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SERVICES } from '../../services';

describe('VillagePage renders without crashing', () => {
  it('is registered as the "village" service', () => {
    expect(SERVICES.find((s) => s.id === 'village')).toBeDefined();
  });

  it('renders to static markup and shows the village title + summary', () => {
    const def = SERVICES.find((s) => s.id === 'village');
    const Page = def!.page;
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(createElement(Page));
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('AIの村');
    expect(html).toContain('作業広場');
    // 143 体の村人が描画されている（絵文字ラベルの一部）。
    expect(html).toContain('CEO');
  });
});
