import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/*
 * `lint:csp` の**外側の証人**。
 *
 * この門は特別で、`verify:all` では **`--self-test` しか走らない** ——
 * 実物の出荷 HTML へ当てるのは `ci.yml` / `pages.yml` が inject-pwa の後に行う
 * (CLAUDE.md にそう書いてある)。つまり日常の `verify:all` において
 * **検査そのものが、ゲート自身の自己申告だけ**である。
 * 2026-08-26 に `lint-forbidden-patterns` / `check-import-boundaries` /
 * `integrity-chain` で実測したとおり、それだけでは 1 回の編集で
 * 守りと証人が同時に消える。
 *
 * 標本は「防ぎたい退行」で選ぶ。`ci.yml` の注記が名指ししているのは
 * 「`script-src` がハッシュ固定を失って `'unsafe-inline'` に戻る」形で、
 * **アプリが完全に動いたまま注入された `<script>` も動く**ため
 * e2e もサイズ検査も鳴らない。ここでしか捕まらない。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-artifact-csp.cjs') as {
  evaluate: (profile: string, html: string, label: string) => string[];
  extractCsp: (html: string) => string | null;
  cspMetas: (html: string) => string[];
  directives: (csp: string) => Map<string, string[]>;
};

const meta = (csp: string) =>
  `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body></body></html>`;

/** 出荷しているブラウザ版に近い形。ここから 1 つずつ壊す。 */
const SHIPPED_APP =
  "default-src 'self'; script-src 'sha256-AAAA'; worker-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; connect-src 'self' https: http://localhost:*; " +
  "object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";

const SHIPPED_DOC = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

describe('lint:csp — 外側の証人', () => {
  it('陰性: 出荷している形は通る (この行が落ちると以下は無意味)', () => {
    expect(gate.evaluate('app', meta(SHIPPED_APP), 'app.html')).toHaveLength(0);
  });

  it.each([
    [
      '★ script-src がハッシュ固定を失って unsafe-inline に戻る (ci.yml が名指しする退行)',
      SHIPPED_APP.replace("script-src 'sha256-AAAA'", "script-src 'self' 'unsafe-inline'"),
    ],
    ['★ script-src が消える', SHIPPED_APP.replace("script-src 'sha256-AAAA'; ", '')],
    ['★ object-src の none が緩む', SHIPPED_APP.replace("object-src 'none'", "object-src 'self'")],
    ['★ frame-src の none が緩む', SHIPPED_APP.replace("frame-src 'none'", "frame-src https:")],
    ['★ base-uri が緩む (相対 URL の基点を書き換えられる)', SHIPPED_APP.replace("base-uri 'self'", 'base-uri *')],
    ['★ form-action が緩む (入力の送り先を変えられる)', SHIPPED_APP.replace("form-action 'none'", 'form-action *')],
    ['★ default-src が消える', SHIPPED_APP.replace("default-src 'self'; ", '')],
    // 2026-08-26 に門へ足した 2 つ。出荷物は既に正しい値だったが留める物が無かった。
    // iframe の遷移は connect-src の管轄外の送出路でもある (画素ビーコンと同じ族)。
    ['★ worker-src が緩む (Worker は script-src を迂回する)', SHIPPED_APP.replace("worker-src 'self'", 'worker-src blob:')],
    ['★ worker-src が消える', SHIPPED_APP.replace("worker-src 'self'; ", '')],
  ])('%s', (_n, csp) => {
    expect(gate.evaluate('app', meta(csp), 'app.html').length).toBeGreaterThan(0);
  });

  it('★ CSP が 1 枚も無ければ鳴る', () => {
    expect(gate.evaluate('app', '<!doctype html><html><head></head></html>', 'app.html').length).toBeGreaterThan(0);
  });

  it('★ CSP が 2 枚あれば鳴る (1 枚目しか読めないので緑を返さない)', () => {
    const html = meta(SHIPPED_APP).replace('</head>', `${meta(SHIPPED_APP).match(/<meta[^>]*>/)?.[0]}</head>`);
    expect(gate.cspMetas(html)).toHaveLength(2);
    expect(gate.evaluate('app', html, 'app.html').length).toBeGreaterThan(0);
  });

  it('陰性: 書類プロファイルの出荷形は通る', () => {
    expect(gate.evaluate('document', meta(SHIPPED_DOC), 'index.html')).toHaveLength(0);
  });

  it.each([
    ['★ 書類の default-src が none でなくなる', SHIPPED_DOC.replace("default-src 'none'", "default-src 'self'")],
    ['★ 書類が通信できるようになる', `${SHIPPED_DOC}; connect-src https:`],
  ])('%s', (_n, csp) => {
    expect(gate.evaluate('document', meta(csp), 'index.html').length).toBeGreaterThan(0);
  });

  it("★ 台帳で「持たない」物に CSP が付いたら鳴る", () => {
    expect(gate.evaluate('none', meta(SHIPPED_APP), 'x.html').length).toBeGreaterThan(0);
  });

  it('陰性: 「持たない」物に CSP が無ければ通る', () => {
    expect(gate.evaluate('none', '<!doctype html><html></html>', 'x.html')).toHaveLength(0);
  });

  /* 解析そのものが生きていること —— 空撃ちの検査と区別する。 */
  it('directives が値を配列で返す', () => {
    const d = gate.directives(SHIPPED_APP);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('connect-src')).toContain('https:');
  });

  it('extractCsp が meta から中身を取り出す', () => {
    expect(gate.extractCsp(meta(SHIPPED_APP))).toBe(SHIPPED_APP);
    expect(gate.extractCsp('<html></html>')).toBeNull();
  });
});

/*
 * **CSP の meta より前に何が在るか** (2026-10-13 · パス 512 · threat: T-011)。
 *
 * meta の CSP は構文解析された所から効くので、それより前の `<script>` は CSP の外で走る
 * —— 実 chromium で実測した (出荷物の meta の前へ置くと `window.__pwn === 1`・後へ置くと
 * `undefined`)。この門は値だけを見ていたので、どちらの形にも ✅ を返していた。
 */
describe('lint:csp — meta の位置と、固定されていない script (threat: T-011)', () => {
  const withHash = (csp: string, js: string) => {
    const { cspHash } = req('../../../scripts/inline-html.cjs') as { cspHash: (s: string) => string };
    return csp.replace("'sha256-AAAA'", cspHash(js));
  };
  const head = (before: string, csp: string, after = '') =>
    `<!doctype html><html><head>${before}<meta http-equiv="Content-Security-Policy" content="${csp}">${after}</head><body></body></html>`;

  it('★ CSP の meta より前に置いた script は、CSP の外で走るので鳴る (threat: T-011)', () => {
    // 固定済みの script でも、meta より前なら位置の 1 件で鳴る。
    const pinned = withHash(SHIPPED_APP, 'go()');
    const before = gate.evaluate('app', head('<script>go()</script>', pinned), 'app.html');
    expect(before.some((p) => p.includes('meta より前に <script>'))).toBe(true);
    // 同じ script を meta の後ろへ置けば通る (位置だけが違う対照)。
    expect(gate.evaluate('app', head('', pinned, '<script>go()</script>'), 'app.html')).toEqual([]);
    // 書類 (unsafe-inline) でも、meta より前は default-src 'none' の外なので鳴る。
    expect(gate.evaluate('document', head('<script>fetch("https://e.example")</script>', SHIPPED_DOC), 'd.html').length).toBeGreaterThan(0);
  });

  it('meta より前に置いてよいのは、何も走らせず読み込まない物だけ', () => {
    const ok = '<meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title><!-- note -->';
    expect(gate.evaluate('app', head(ok, SHIPPED_APP), 'app.html')).toEqual([]);
    for (const bad of ['<base href="https://e.example/">', '<link rel="stylesheet" href="x.css">', '<style>body{}</style>']) {
      expect(gate.evaluate('app', head(bad, SHIPPED_APP), 'app.html').length, bad).toBeGreaterThan(0);
    }
  });

  it('★ 固定されていない inline script と、外から読む script は鳴る', () => {
    expect(gate.evaluate('app', head('', SHIPPED_APP, '<script>evil()</script>'), 'app.html').length).toBeGreaterThan(0);
    expect(gate.evaluate('app', head('', SHIPPED_APP, '<script src="https://cdn.example/x.js"></script>'), 'app.html').length).toBeGreaterThan(0);
    // データの script は実行されないので数えない。
    expect(gate.evaluate('app', head('', SHIPPED_APP, '<script type="application/ld+json">{}</script>'), 'app.html')).toEqual([]);
  });
});
