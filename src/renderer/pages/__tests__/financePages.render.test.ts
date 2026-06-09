/** @vitest-environment jsdom */
/**
 * 財務系ページのレンダー回帰テスト。
 *
 * これらのページは単体テスト/smoke の対象外で、render 時のクラッシュ
 * (例: コンポーネント内の const を宣言前に useMemo から呼ぶ TDZ) を
 * 検知できていなかった (税務試算ページが真っ黒になる不具合の原因)。
 * renderToStaticMarkup は render を同期実行するため、render 時に throw する
 * 不具合をここで確実に捕捉できる (useEffect は SSR では走らないので、
 * window.serviceHub への副作用アクセスは発生しない)。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SERVICES } from '../../services';

beforeAll(() => {
  // render 中は触れないが、念のため window.serviceHub を最小スタブしておく。
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

// 財務・経営・投資に関わる主要ページ。
const FINANCE_PAGE_IDS = [
  'tax',
  'kpi',
  'overview',
  'business',
  'stocks',
  'sales',
  'mutual-funds',
  'real-estate',
];

describe('finance pages render without crashing (no TDZ / NaN throw)', () => {
  for (const id of FINANCE_PAGE_IDS) {
    it(`${id} renders to static markup`, () => {
      const def = SERVICES.find((s) => s.id === id);
      expect(def, `service ${id} should exist`).toBeDefined();
      const Page = def!.page;
      let html = '';
      expect(() => {
        html = renderToStaticMarkup(createElement(Page));
      }).not.toThrow();
      expect(html.length).toBeGreaterThan(0);
    });
  }
});
