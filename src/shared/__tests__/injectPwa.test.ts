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
  assertHashesPreserved,
  assertPublishable,
  policyOf: cspPolicyOf,
  scriptHashesIn,
} = req('../../../scripts/inject-pwa.cjs') as {
  injectPwaTags: (html: string) => string;
  findRealHeadClose: (html: string) => number;
  moduleScriptRegion: (html: string) => string | null;
  withSwScriptHash: (html: string) => string;
  PWA_HEAD_TAGS: string;
  SW_REGISTER_JS: string;
  SW_SCRIPT_HASH: string;
  assertHashesPreserved: (before: string, after: string) => void;
  assertPublishable: (before: string, after: string, label: string) => void;
  policyOf: (html: string) => string | null;
  scriptHashesIn: (policy: string) => string[];
};
const { cspHash } = req('../../../scripts/inline-html.cjs') as {
  cspHash: (source: string) => string;
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

/*
 * **注入は「後段の書き換え」なので、自分の検算を持たなければならない。**
 *
 * `inline-html.cjs` は仕上がり文書を最後に読み直して、inline script が全部
 * CSP に載っているかを確かめている (`assertPinnedScripts`)。ところが Pages 版は
 * そのあと `inject-pwa` が CSP を書き換えるのに、**そこには同じ検算が無かった**
 * (2026-08-23)。既存のガード 2 つでは埋まらない:
 *
 *   - `moduleScriptRegion` … スクリプトの**本文**を比べるだけで CSP を見ない
 *   - CLI の検査          … SW スニペットのハッシュが在るかしか見ない
 *
 * つまり `withSwScriptHash` が CSP を組み損ねて**バンドル本体のハッシュを
 * 落とした**場合、どちらも通る。公開されるのは「自分の 11MB のバンドルを
 * CSP が拒否する頁」= 白画面で、痕跡は console にしか出ない。
 * 2026-07-24 の Pages 障害と同じ「公開して初めて分かる」形である。
 */
describe('inject-pwa — 注入が CSP のハッシュを落としていないこと', () => {
  it('ハッシュを 1 つも落とさない普通の注入は通る', () => {
    expect(() => assertHashesPreserved(STANDALONE_CSP, injectPwaTags(STANDALONE_CSP))).not.toThrow();
  });

  it('SW のハッシュが増えるのは正しい (減っていなければよい)', () => {
    const after = injectPwaTags(STANDALONE_CSP);
    expect(scriptHashesIn(cspPolicyOf(after) as string)).toContain(BUNDLE_HASH);
    expect(scriptHashesIn(cspPolicyOf(after) as string)).toContain(SW_SCRIPT_HASH);
    expect(scriptHashesIn(cspPolicyOf(STANDALONE_CSP) as string)).toHaveLength(1);
  });

  // 対照 — バンドルのハッシュを落とした CSP を作ると鳴る。
  it('既存のハッシュが消えたら落とす', () => {
    const after = injectPwaTags(STANDALONE_CSP).replace(BUNDLE_HASH, '');
    expect(() => assertHashesPreserved(STANDALONE_CSP, after)).toThrow(/ハッシュが 1 個消え/);
  });

  it('CSP メタごと消えても落とす (「無い」を「変わっていない」と取り違えない)', () => {
    expect(() => assertHashesPreserved(STANDALONE_CSP, SIMPLE)).toThrow(/ハッシュが 1 個消え/);
  });

  // 規則が広すぎない対照 — CSP を持たない頁・ハッシュを使わない頁は通る。
  it('CSP を持たない頁 (自動生成ランディング) は対象外', () => {
    expect(cspPolicyOf(SIMPLE)).toBeNull();
    expect(() => assertHashesPreserved(SIMPLE, injectPwaTags(SIMPLE))).not.toThrow();
  });

  it('ハッシュを使わない CSP も対象外', () => {
    const noHash = standaloneWith("'self'");
    expect(scriptHashesIn(cspPolicyOf(noHash) as string)).toHaveLength(0);
    expect(() => assertHashesPreserved(noHash, injectPwaTags(noHash))).not.toThrow();
  });
});

/*
 * `assertPublishable` は **入力そのものが正しくピン留めされていること**まで
 * 要求するので、注入の事後条件ではなく「実物を公開する経路 (CLI)」の検査。
 * ここでは本物のハッシュを `inline-html.cjs` から計算して両方の向きを固定する。
 */
describe('inject-pwa — 公開してよい形かの検算 (CLI 経路)', () => {
  // バンドルの**実ハッシュ**でピン留めした、正しい standalone。
  // `scriptSourceFor` は使わない —— あれは inline-html.cjs が書き出すときに
  // 前後へ改行を足す形で、このフィクスチャは `<script type="module">${JS}</script>` と
  // 改行なしで書いている。ブラウザが読む子テキストは JS そのものなので、
  // ハッシュ対象も JS そのもの。(最初 `scriptSourceFor` を通して書いたら
  // この検算に落とされた —— 検算が仕事をしている側の例。)
  const REAL = standaloneWith(cspHash(BUNDLE_JS));

  it('正しくピン留めされた頁は、注入後も公開できる', () => {
    expect(() => assertPublishable(REAL, injectPwaTags(REAL), 'app.html')).not.toThrow();
  });

  // 対照 — ハッシュが実体と食い違えば公開を止める。
  it('ハッシュが中身と合わない頁は止める', () => {
    expect(() => assertPublishable(STANDALONE_CSP, injectPwaTags(STANDALONE_CSP), 'app.html')).toThrow(
      /公開できません/,
    );
  });

  it('CSP を持たない頁は対象外 (ランディングを止めない)', () => {
    expect(() => assertPublishable(SIMPLE, injectPwaTags(SIMPLE), 'index.html')).not.toThrow();
  });

  // 元がハッシュを使っていない頁は対象外。判定を `after` でやると、注入が必ず足す
  // SW のハッシュのせいでここが対象に入り、注入と無関係な不備で落ちる。
  it('元がハッシュを使わない CSP は対象外 (注入が足す SW ハッシュで判定しない)', () => {
    const noHash = standaloneWith("'self'");
    expect(() => assertPublishable(noHash, injectPwaTags(noHash), 'x.html')).not.toThrow();
    // 注入後には確かにハッシュが在る = `after` で判定していたら落ちていた。
    expect(scriptHashesIn(cspPolicyOf(injectPwaTags(noHash)) as string)).toHaveLength(1);
  });
});
