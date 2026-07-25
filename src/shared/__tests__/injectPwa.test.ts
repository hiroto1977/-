import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// scripts/inject-pwa.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const {
  injectPwaTags,
  findRealHeadClose,
  moduleScriptRegion,
  withSwScriptHash,
  PWA_HEAD_TAGS,
  SW_REGISTER_JS,
  SW_SCRIPT_HASH,
} = req('../../../scripts/inject-pwa.cjs') as {
  injectPwaTags: (html: string) => string;
  findRealHeadClose: (html: string) => number;
  moduleScriptRegion: (html: string) => string | null;
  withSwScriptHash: (html: string) => string;
  PWA_HEAD_TAGS: string;
  SW_REGISTER_JS: string;
  SW_SCRIPT_HASH: string;
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

// inline-html.cjs が書き出す standalone の CSP と同形 (script-src はバンドルの sha256
// ピン留め)。Pages 版はここへ SW スニペットのハッシュが追記される。
const csp = (scriptSrc: string) =>
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src ${scriptSrc}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'">`;
const BUNDLE_HASH = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='";
const standaloneWith = (scriptSrc: string) =>
  `<!doctype html><html lang="ja"><head><meta charset="UTF-8">${csp(scriptSrc)}<script type="module">${BUNDLE_JS}</script><style>:root{}</style></head><body><div id="root"></div></body></html>`;
const STANDALONE_CSP = standaloneWith(BUNDLE_HASH);

/** CSP メタの content 属性値を取り出す (前置部のみ = バンドル内文字列は拾わない)。 */
function policyOf(html: string): string {
  const head = html.slice(0, html.indexOf('<script'));
  const m = /content="([^"]*)"/.exec(head.slice(head.indexOf('http-equiv="Content-Security-Policy"')));
  if (!m || m[1] === undefined) throw new Error('CSP メタが無い');
  return m[1];
}

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

// CSP は「ハッシュが 1 つでもあると 'unsafe-inline' を無視する」ため、standalone 側で
// バンドルを sha256 ピン留めした瞬間、この SW スニペットも自分のハッシュを持たない限り
// 実行されない (症状は R2-8 と同じ「PWA が理由なく効かない」)。
describe('inject-pwa — SW スニペットの CSP ハッシュ', () => {
  it('SW_SCRIPT_HASH は注入されるスニペット本文そのものの sha256 (base64)', () => {
    const expected = createHash('sha256').update(SW_REGISTER_JS, 'utf8').digest('base64');
    expect(SW_SCRIPT_HASH).toBe(`'sha256-${expected}'`);
    // ハッシュ対象は <script> の子テキスト = スニペット本文。開始タグ直後に改行を
    // 入れていないので余分な空白は 1 バイトも含まない。
    expect(PWA_HEAD_TAGS).toContain(`<script>${SW_REGISTER_JS}</script>`);
    expect(PWA_HEAD_TAGS).not.toContain(`<script>\n`);
  });

  it('standalone: script-src の末尾にハッシュを 1 個追記し、他ディレクティブは不変', () => {
    const out = injectPwaTags(STANDALONE_CSP);
    expect(policyOf(out)).toBe(policyOf(STANDALONE_CSP).replace(BUNDLE_HASH, `${BUNDLE_HASH} ${SW_SCRIPT_HASH}`));
    expect(policyOf(out)).toContain(`script-src ${BUNDLE_HASH} ${SW_SCRIPT_HASH};`);
    for (const directive of [
      "default-src 'self'",
      "worker-src 'self'", // R2-8: これが無いと SW 自体が登録できない
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ]) {
      expect(policyOf(out)).toContain(directive);
    }
    expect(policyOf(out)).not.toContain('unsafe-inline;'); // script-src に混ぜ戻さない
  });

  it('既存ハッシュが複数あっても末尾に足すだけ', () => {
    const many = "'sha256-AAA=' 'sha256-BBB=' 'sha256-CCC='";
    const out = withSwScriptHash(standaloneWith(many));
    expect(policyOf(out)).toContain(`script-src ${many} ${SW_SCRIPT_HASH};`);
    expect(policyOf(out).match(/sha256-/g)!.length).toBe(4);
  });

  it('冪等: 2 回流しても重複追記・ポリシー破壊が起きない', () => {
    const once = injectPwaTags(STANDALONE_CSP);
    expect(injectPwaTags(once)).toBe(once); // rel="manifest" ガード
    expect(withSwScriptHash(once)).toBe(once); // ハッシュ追記自体も冪等
    expect(withSwScriptHash(withSwScriptHash(once))).toBe(once);
    expect(once.match(/sha256-/g)!.length).toBe(2);
  });

  it('CSP メタを持たない HTML (自動生成ランディング) はポリシーを足さない', () => {
    const out = injectPwaTags(SIMPLE);
    expect(out).not.toContain('Content-Security-Policy');
    expect(out).toContain('serviceWorker');
    expect(withSwScriptHash(SIMPLE)).toBe(SIMPLE);
  });

  it('script-src の無い CSP は例外 (黙って SW が拒否される状態を出荷しない)', () => {
    const noScriptSrc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"><title>t</title></head><body></body></html>`;
    expect(() => injectPwaTags(noScriptSrc)).toThrow(/script-src/);
    // script-src-elem に誤爆しない (直後の空白を必須にしている)
    const elemOnly = noScriptSrc.replace("default-src 'self'", "default-src 'self'; script-src-elem 'self'");
    expect(() => injectPwaTags(elemOnly)).toThrow(/script-src/);
  });

  it('CSP 追記でも module スクリプト領域はバイト不変 (2026-07-24 Pages 障害の不変条件)', () => {
    const out = injectPwaTags(STANDALONE_CSP);
    expect(moduleScriptRegion(out)).toBe(moduleScriptRegion(STANDALONE_CSP));
    expect(moduleScriptRegion(out)).toContain('</head><body>x');
  });

  it('バンドルが文字列として CSP メタを含んでいても、書き換えるのは前置部の実タグだけ', () => {
    // 書類メーカー系のテンプレートは CSP メタを文字列として持つ。全文正規表現だと
    // バンドル本文を書き換えてしまう (2026-07-24 障害と同型)。
    const decoy = `const t="<meta http-equiv=\\"Content-Security-Policy\\" content=\\"default-src 'none'; script-src 'unsafe-inline'\\">";`;
    const html = `<!doctype html><html><head><meta charset="UTF-8">${csp(BUNDLE_HASH)}<script type="module">${decoy}</script></head><body></body></html>`;
    const out = injectPwaTags(html);
    expect(moduleScriptRegion(out)).toBe(moduleScriptRegion(html));
    expect(out).toContain(`script-src ${BUNDLE_HASH} ${SW_SCRIPT_HASH};`);
    expect(out.match(/sha256-/g)!.length).toBe(2);
    expect(out).toContain(decoy); // デコイは 1 バイトも変わらない
  });
});
