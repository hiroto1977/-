import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// scripts/inline-html.cjs / inject-pwa.cjs は CJS (Node ビルドスクリプト) 設計のため、
// テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const { inlineStandalone, inlineScriptSources, scriptSourceFor, cspHash, buildCsp } = req(
  '../../../scripts/inline-html.cjs',
) as {
  inlineStandalone: (html: string, readAsset: (rel: string) => string) => string;
  inlineScriptSources: (html: string) => string[];
  scriptSourceFor: (js: string) => string;
  cspHash: (source: string) => string;
  buildCsp: (hashes: string[]) => string;
};
const { injectPwaTags, moduleScriptRegion, SW_SCRIPT_HASH } = req('../../../scripts/inject-pwa.cjs') as {
  injectPwaTags: (html: string) => string;
  moduleScriptRegion: (html: string) => string | null;
  SW_SCRIPT_HASH: string;
};

// dist/index.html と同形 (Vite が <head> 末尾へ module script + stylesheet を差し込み、
// CSP メタはそれより前にある)。
const INDEX_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:5173" />
    <title>Service Hub</title>
    <script type="module" crossorigin src="./assets/index-14xHUIeM.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-BQMatWrR.css">
    <link rel="modulepreload" crossorigin href="./assets/chunk-1.js">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

// 実バンドルが持つ「罠」を再現: 文字列としての </head><body> (HTML エクスポート
// テンプレート由来)、文字列としての <script (securityRange.ts の XSS ペイロード)、
// replace(str,str) を壊す $& (2026-07 監査 R2-13)、そして多バイト文字 (学術コーパス)。
const BUNDLE_JS =
  'window.__bundleRan=1;const tpl=`<!doctype html><html><head></head><body>x</body></html>`;' +
  'const payload="<script";const dollar="$&$\'";const ja="日本語の見出し";render(tpl,payload,dollar,ja);';
const CSS = ':root{color-scheme:dark;--bg: #0f1117}';
const ASSETS: Record<string, string> = {
  'assets/index-14xHUIeM.js': BUNDLE_JS,
  'assets/index-BQMatWrR.css': CSS,
};
const readAsset = (rel: string): string => {
  const v = ASSETS[rel];
  if (v === undefined) throw new Error(`fixture: 未知のアセット ${rel}`);
  return v;
};

const SCRIPT_OPEN = '<script type="module">';

/**
 * ブラウザと同じ手順で「ハッシュ対象になるテキスト」を取り出す:
 * 開始タグの直後から **最初の** </script> の直前まで (script data state)。
 */
function browserScriptText(html: string): string {
  const open = html.indexOf(SCRIPT_OPEN);
  const from = open + SCRIPT_OPEN.length;
  return html.slice(from, html.indexOf('</script>', from));
}

function policyOf(html: string): string {
  const head = html.slice(0, html.indexOf('<script'));
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(head);
  if (!meta || meta[1] === undefined) throw new Error('CSP メタが無い');
  return meta[1];
}

const OUT = inlineStandalone(INDEX_HTML, readAsset);

describe('inline-html — CSS/JS インライン化', () => {
  it('CSS はインライン化され、外部参照と modulepreload は消える', () => {
    expect(OUT).toContain(`<style>\n${CSS}\n</style>`);
    expect(OUT).not.toContain('rel="stylesheet"');
    expect(OUT).not.toContain('modulepreload');
    expect(OUT).not.toContain('src="./assets/');
  });

  it('バンドルは 1 バイトも変えずに <script type="module"> へ収まる', () => {
    expect(browserScriptText(OUT)).toBe(`\n${BUNDLE_JS}\n`);
    // $& / $' を含む文字列が置換パターンとして解釈されていない (R2-13 と同型の罠)
    expect(OUT).toContain('const dollar="$&$\'";');
    // 文字列としての </head><body> は素通し (2026-07-24 Pages 障害の不変条件)
    expect(OUT).toContain('<head></head><body>x');
  });

  it('CSP メタが無い HTML は例外 (ハッシュを載せる先が無い)', () => {
    expect(() => inlineStandalone(INDEX_HTML.replace(/<meta\s+http-equiv[^>]*>/, ''), readAsset)).toThrow(
      /CSP/,
    );
  });
});

// 2026-07 監査: script-src 'unsafe-inline' は「自分のバンドル」だけでなく注入された
// 任意の inline <script> も実行させる。sha256 ピン留めならバイト一致のみ許可される。
describe('inline-html — script-src の sha256 ピン留め', () => {
  it('ハッシュ対象は開始タグ直後〜最初の </script> の生テキスト (前後の改行込み)', () => {
    const source = scriptSourceFor(BUNDLE_JS);
    expect(source).toBe(`\n${BUNDLE_JS}\n`);
    // <script> では <pre>/<textarea> と違い直後の改行が捨てられないので、改行もハッシュ対象。
    const expected = createHash('sha256').update(source, 'utf8').digest('base64');
    expect(cspHash(source)).toBe(`'sha256-${expected}'`);
    expect(cspHash(source)).not.toBe(cspHash(BUNDLE_JS)); // 改行を落とすと別ハッシュ = 不一致
  });

  it('UTF-8 バイト列でハッシュする (多バイト文字を含むバンドルでも一致)', () => {
    const source = scriptSourceFor('const ja="日本語";');
    const bytes = Buffer.from(source, 'utf8');
    expect(bytes.length).toBeGreaterThan(source.length); // 文字数 ≠ バイト数
    expect(cspHash(source)).toBe(`'sha256-${createHash('sha256').update(bytes).digest('base64')}'`);
  });

  it('CRLF / 単独 CR は LF に正規化する (ブラウザが入力ストリームで同じ変換をする)', () => {
    expect(scriptSourceFor('a\r\nb\rc')).toBe('\na\nb\nc\n');
    // 正規化しないと「書き出したバイト」と「ブラウザが見るテキスト」がズレ、
    // ハッシュ不一致で 10MB のバンドルが黙って拒否される (白画面)。
    expect(cspHash(scriptSourceFor('a\r\nb'))).toBe(cspHash('\na\nb\n'));
  });

  it('出力ドキュメントを再パースしたテキストのハッシュが CSP に載っている', () => {
    const hash = cspHash(browserScriptText(OUT));
    expect(policyOf(OUT)).toContain(`script-src ${hash};`);
    expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
  });

  it('script-src からは unsafe-inline が消え、他ディレクティブは従来どおり', () => {
    const policy = policyOf(OUT);
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    for (const directive of [
      "default-src 'self'",
      "worker-src 'self'", // R2-8: 未指定だと script-src (ハッシュのみ) にフォールバックし SW が死ぬ
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ]) {
      expect(policy).toContain(directive);
    }
    expect(policy.split('; ').length).toBe(10);
  });

  it('buildCsp: 複数チャンクは全ハッシュを列挙し、0 件は例外', () => {
    expect(buildCsp(["'sha256-A='", "'sha256-B='"])).toContain("script-src 'sha256-A=' 'sha256-B=';");
    // 空の script-src は「全スクリプト拒否」— 出荷したら白画面なのでビルドを落とす。
    expect(() => buildCsp([])).toThrow(/script-src/);
  });
});

// バンドルは <script> の中へ **エスケープなしで** 流し込まれる (ハッシュは流し込む
// バイト列そのものに対して取るので、ハッシュ後にエスケープすると両者がずれて CSP が
// バンドル全体を止める)。つまり素の閉じタグを持たないことは *バンドラ (esbuild/Vite)
// の保証* に依存している — inline-html.cjs 側はその保証を検証する側にまわる。
// 実測 (2026-08-23 dist/standalone.html): 素の閉じタグ 1 件 (= 本物のタグ) に対し
// エスケープ済み 2 件。securityRange.ts の XSS ペイロードは `<\/script>` で出ている。
// ここはその「検証する側」が本当に火を噴くかを固定する。
describe('inline-html — バンドルが素の </script> を持ったとき', () => {
  const withClose = (js: string): (() => string) => inlineStandalone.bind(null, INDEX_HTML, () => js);

  it('ビルドを落とす (要素が途中で閉じ、ピン留めしたハッシュと実テキストがずれる)', () => {
    expect(withClose('const p = "<script>alert(1)' + '</' + 'script>' + '";')).toThrow(/未ピン留め/);
    expect(withClose('const p = "' + '</' + 'script>' + '";')).toThrow(/未ピン留め/);
  });

  it('落とす理由は「早期終了で別テキストになる」こと — ずれの中身まで確かめる', () => {
    const js = 'const p = "' + '</' + 'script>' + '";const after = 1;';
    // 検知を外した世界の仕上がり文書 (= inlineStandalone の 5 段目までと同じ組み立て)。
    const doc = buildCsp([cspHash(scriptSourceFor(js))]) + '<script type="module">' + scriptSourceFor(js) + '</' + 'script>';
    const parsed = inlineScriptSources(doc);
    // ブラウザが読むのは最初の閉じタグまで — 末尾の `const after = 1;` は本文へ漏れる。
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).not.toContain('after');
    expect(doc).toContain('after = 1;');
    // だからハッシュが一致しない = CSP がバンドルを実行しない (白画面) という故障。
    expect(policyOf(doc)).not.toContain(cspHash(parsed[0] as string));
  });

  it('対照: エスケープ済み (バンドラの現状出力) と "<script" 単体は通る', () => {
    expect(withClose('const p = "<script>alert(1)<\\/script>";')).not.toThrow();
    expect(withClose('const p = "<script";')).not.toThrow();
    expect(inlineScriptSources(OUT)).toHaveLength(1); // 本物のバンドルも 1 件のまま
  });
});

describe('inlineScriptSources — HTML パーサ等価の走査', () => {
  it('src 付き <script> とデータブロックは対象外、インライン JS だけを返す', () => {
    const html =
      '<script src="./a.js"></script><script type="application/ld+json">{"@type":"x"}</script>' +
      '<script>inline1</script><script type="text/javascript">inline2</script>';
    expect(inlineScriptSources(html)).toEqual(['inline1', 'inline2']);
  });

  it('バンドル内の文字列 "<script" を要素と誤認しない (閉じタグの後から再開する)', () => {
    // 素朴な全件 indexOf('<script') はここで偽の領域を切り出し、ハッシュを取り違える。
    expect(inlineScriptSources(OUT)).toEqual([`\n${BUNDLE_JS}\n`]);
    expect(OUT.split('<script').length - 1).toBe(2); // 実タグ 1 + バンドル内の文字列 1
  });

  it('閉じられていない <script> は無視する (無限ループしない)', () => {
    expect(inlineScriptSources('<script>never closed')).toEqual([]);
    expect(inlineScriptSources('no script at all')).toEqual([]);
  });
});

// Pages 経路 (standalone → inject-pwa) の結合。ハッシュが 1 つでもあると CSP は
// 'unsafe-inline' を無視するので、SW スニペットは自分のハッシュ無しでは実行されない。
describe('inline-html + inject-pwa — Pages 経路の CSP', () => {
  const PAGES = injectPwaTags(OUT);
  const bundleHash = cspHash(browserScriptText(OUT));

  it('script-src にバンドルと SW スニペットの 2 ハッシュが並ぶ', () => {
    expect(policyOf(PAGES)).toContain(`script-src ${bundleHash} ${SW_SCRIPT_HASH};`);
    expect(policyOf(PAGES).match(/sha256-/g)!.length).toBe(2);
  });

  it('バンドル (= ハッシュ対象テキスト) は注入後もバイト不変', () => {
    expect(browserScriptText(PAGES)).toBe(browserScriptText(OUT));
    expect(moduleScriptRegion(PAGES)).toBe(moduleScriptRegion(OUT));
    expect(cspHash(browserScriptText(PAGES))).toBe(bundleHash);
  });

  it('PWA タグは実 </head> 直前 (バンドル内の </head> 文字列ではない)', () => {
    expect(PAGES.indexOf('rel="manifest"')).toBeGreaterThan(PAGES.indexOf('</script>'));
    expect(injectPwaTags(PAGES)).toBe(PAGES); // 冪等
  });
});
