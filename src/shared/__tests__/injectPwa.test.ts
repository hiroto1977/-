import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// scripts/inject-pwa.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const { injectPwaTags, findRealHeadClose, moduleScriptRegion, PWA_HEAD_TAGS } = req(
  '../../../scripts/inject-pwa.cjs',
) as {
  injectPwaTags: (html: string) => string;
  findRealHeadClose: (html: string) => number;
  moduleScriptRegion: (html: string) => string | null;
  PWA_HEAD_TAGS: string;
};

const SIMPLE = '<!doctype html><html><head><title>t</title></head><body></body></html>';

// 2026-07-24 Pages 障害の再現フィクスチャ: standalone.html と同じく <head> 内の巨大
// インライン module スクリプトが、テンプレート文字列として "</head><body>" を含む
// (Stocks / 事業ダッシュボードの HTML エクスポート機能由来)。素朴な indexOf('</head>')
// はこの文字列にヒットし、PWA タグ (実 </script> 入り) を JS の真ん中へ splice して
// スクリプトを破壊する。
const BUNDLE_JS =
  'const tpl=`<!doctype html><html><head><meta charset="utf-8"><title>Stocks</title></head><body>x</body></html>`;' +
  'const xss="<script>alert(1)<\\/script>";render(tpl);';
const STANDALONE = `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><script type="module">${BUNDLE_JS}</script><style>:root{}</style></head><body><div id="root"></div></body></html>`;

describe('inject-pwa', () => {
  it('単純な HTML では </head> 直前に 4 タグ一式を注入する', () => {
    const out = injectPwaTags(SIMPLE);
    expect(out).toContain('rel="manifest"');
    expect(out).toContain('name="theme-color"');
    expect(out).toContain('rel="apple-touch-icon"');
    expect(out).toContain('serviceWorker');
    expect(out.slice(out.indexOf(PWA_HEAD_TAGS) + PWA_HEAD_TAGS.length)).toMatch(/^<\/head>/);
  });

  it('冪等: 注入済み HTML は無変更で返す', () => {
    const once = injectPwaTags(SIMPLE);
    expect(injectPwaTags(once)).toBe(once);
  });

  it('回帰: バンドル内の文字列 "</head>" ではなく実 </head> に注入する (2026-07-24 Pages 障害)', () => {
    const out = injectPwaTags(STANDALONE);
    // 注入位置はバンドル (module スクリプト) の後
    const scriptClose = out.indexOf('</script>', out.indexOf('<script type="module"'));
    expect(out.indexOf('rel="manifest"')).toBeGreaterThan(scriptClose);
    // module スクリプト領域は 1 バイトも変わっていない
    expect(moduleScriptRegion(out)).toBe(moduleScriptRegion(STANDALONE));
    expect(moduleScriptRegion(out)).toContain('</head><body>x');
    // 実 </head> の直前に入っている (テンプレート文字列内の </head> は素通し)
    expect(out.slice(out.indexOf(PWA_HEAD_TAGS) + PWA_HEAD_TAGS.length)).toMatch(/^<\/head><body>/);
  });

  it('findRealHeadClose: スクリプト無しは最初の </head>、有りは最後の </script> 以降を返す', () => {
    expect(findRealHeadClose(SIMPLE)).toBe(SIMPLE.indexOf('</head>'));
    const real = STANDALONE.lastIndexOf('</head>');
    expect(findRealHeadClose(STANDALONE)).toBe(real);
  });

  it('</head> が見つからない HTML は例外', () => {
    expect(() => injectPwaTags('<html><body>no head close</body></html>')).toThrow(/head/);
  });

  it('moduleScriptRegion: module スクリプトが無ければ null', () => {
    expect(moduleScriptRegion(SIMPLE)).toBeNull();
  });
});
