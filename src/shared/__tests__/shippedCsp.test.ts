import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const INDEX_HTML = readFileSync(path.join(REPO_ROOT, 'src/renderer/index.html'), 'utf8');
const require_ = createRequire(import.meta.url);
const { buildCsp } = require_(path.join(REPO_ROOT, 'scripts/inline-html.cjs')) as {
  buildCsp: (hashes: string[]) => string;
};

/*
 * **出荷される CSP を、ディレクティブ単位で留める。**
 *
 * 2026-08-22 の対照実験まで、`src/renderer/index.html` の CSP は
 * **緩めても誰も気付かなかった**:
 *
 *   script-src に 'unsafe-inline' を足す → テスト 9983 件すべて緑・27 ゲート緑
 *   object-src 'none' を消す             → 同じく全部緑
 *
 * 既にあった `devCsp.test.ts` は「開発サーバの origin が**入っていない**こと」と
 * 「connect-src が**在る**こと」しか見ていない。ブラウザ版のほうは
 * `inlineHtml.test.ts` が sha256 ピン留めを検査していて、そのコメントには
 * 「2026-07 監査: script-src 'unsafe-inline' は自分のバンドルだけでなく
 * 注入されたスクリプトも通す」と書いてある —— **同じ危険を、デスクトップ版
 * だけ留めていなかった。**
 *
 * ここでは値そのものではなく、**なぜその値なのか**を 1 件ずつ書いて留める。
 */

/** `a 'b'; c 'd' 'e'` → Map { a → ["'b'"], c → ["'d'","'e'"] } */
function parsePolicy(policy: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter((t) => t !== '');
    const name = tokens[0];
    if (name === undefined) continue;
    out.set(name, tokens.slice(1));
  }
  return out;
}

function policyOf(html: string): string {
  const m = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
  if (m === null || m[1] === undefined) throw new Error('CSP メタが見つかりません');
  return m[1];
}

const DESKTOP = parsePolicy(policyOf(INDEX_HTML));

describe('同梱される CSP (デスクトップ版) — ディレクティブごとに理由つきで留める', () => {
  it.each([
    ['default-src', ["'self'"], '既定は自分のバンドルだけ。以下は個別に絞る'],
    ['script-src', ["'self'"], "**注入されたスクリプトを実行させない**。'unsafe-inline' を足すと injection が即 code execution になる"],
    ['style-src', ["'self'", "'unsafe-inline'"], 'React の style 属性とアニメーションが inline style を使う。**意図的に緩い唯一の口**'],
    ['img-src', ["'self'", 'data:', 'https:'], '外部サービスのサムネイル (GitHub アバタ等) を出す。画像は実行されない'],
    ['connect-src', ["'self'"], '**デスクトップ版のレンダラーは自分で通信しない**。REST は全部 main 経由 (トークンをレンダラーへ出さないため)'],
    ['object-src', ["'none'"], '<object>/<embed> は古いプラグイン実行経路'],
    ['frame-src', ["'none'"], '枠を作らせない。iframe は preload の届かない別文脈になる'],
    ['base-uri', ["'self'"], '<base> で相対 URL の解決先を書き換えられると、自分のバンドルの読み先を差し替えられる'],
    ['form-action', ["'none'"], 'フォーム送信で外へ値を持ち出させない'],
  ])('%s は %j (%s)', (directive, want, _reason) => {
    expect(DESKTOP.get(directive), `${directive} が消えている`).toEqual(want);
  });

  it('ディレクティブの数が増減していない (知らない口が生えていない)', () => {
    expect([...DESKTOP.keys()].sort()).toEqual([
      'base-uri',
      'connect-src',
      'default-src',
      'form-action',
      'frame-src',
      'img-src',
      'object-src',
      'script-src',
      'style-src',
    ]);
  });

  /*
   * 上の表は「等しいこと」を見ているので、**危ない値そのもの**も名指しで
   * 落とす。表を書き換えて緩める人は居るが、名指しの禁止まで両方消すには
   * 二度手間になり、そこで一度は考える。
   */
  it.each([
    ["'unsafe-inline'", 'script-src'],
    ["'unsafe-eval'", 'script-src'],
    ["'wasm-unsafe-eval'", 'script-src'],
    ['*', 'script-src'],
    ['https:', 'script-src'],
    ['data:', 'script-src'],
    ['*', 'default-src'],
    ['https:', 'connect-src'],
    ['*', 'connect-src'],
    ["'unsafe-eval'", 'default-src'],
  ])('%s は %s に入っていない', (bad, directive) => {
    expect(DESKTOP.get(directive) ?? []).not.toContain(bad);
  });

  it('開発サーバの origin は同梱物に混ざらない (dev 用は実行時に足す)', () => {
    expect(policyOf(INDEX_HTML)).not.toMatch(/localhost|127\.0\.0\.1|ws:/);
  });
});

/*
 * **ブラウザ版とデスクトップ版の CSP は別物でよい** —— 問いが違う
 * (0-a-14)。ブラウザ版は 1 枚の HTML に全部を inline するので
 * `script-src` はハッシュ列になり、AI エージェント・BYO プロキシへ
 * 直接繋ぐので `connect-src` は https: 全体になる。
 *
 * 危ないのは「一貫性のために揃えよう」と考えること —— 揃える方向は
 * **デスクトップ版を緩める側**にしか働かない。だから**違っていること
 * 自体**をここで留める。
 */
describe('ブラウザ版の CSP とは意図的に違う', () => {
  const WEB = parsePolicy(policyOf(buildCsp(["'sha256-AAAA'"])));

  it('script-src: デスクトップは self、ブラウザはハッシュ列 (どちらも unsafe-inline 無し)', () => {
    expect(DESKTOP.get('script-src')).toEqual(["'self'"]);
    expect(WEB.get('script-src')).toEqual(["'sha256-AAAA'"]);
    for (const p of [DESKTOP, WEB]) {
      expect(p.get('script-src')).not.toContain("'unsafe-inline'");
    }
  });

  it('connect-src: デスクトップは self のみ、ブラウザは外へ出る', () => {
    expect(DESKTOP.get('connect-src')).toEqual(["'self'"]);
    expect(WEB.get('connect-src')).toContain('https:');
    expect(WEB.get('connect-src')!.length).toBeGreaterThan(DESKTOP.get('connect-src')!.length);
  });

  it('worker-src: ブラウザ版だけが持つ (Service Worker を登録する側)', () => {
    expect(WEB.get('worker-src')).toEqual(["'self'"]);
    expect(DESKTOP.has('worker-src')).toBe(false);
  });

  /** 締めている側は両方で同じ。ここが緩んだらどちらのビルドでも穴になる。 */
  it.each([
    ['object-src', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'none'"]],
    ['default-src', ["'self'"]],
  ])('%s は 2 つのビルドで同じ (%j)', (directive, want) => {
    expect(DESKTOP.get(directive)).toEqual(want);
    expect(WEB.get(directive)).toEqual(want);
  });
});

describe('parsePolicy 自身 (検査が空虚に通らないこと)', () => {
  it('ディレクティブと値に割る', () => {
    const p = parsePolicy("default-src 'self'; script-src 'self' 'sha256-x'; object-src 'none'");
    expect(p.get('default-src')).toEqual(["'self'"]);
    expect(p.get('script-src')).toEqual(["'self'", "'sha256-x'"]);
    expect(p.size).toBe(3);
  });

  it('存在しないディレクティブは undefined (空配列と混ざらない)', () => {
    expect(parsePolicy("default-src 'self'").get('script-src')).toBeUndefined();
  });

  it('空白の揺れを吸収する', () => {
    expect(parsePolicy("  default-src   'self' ;;  object-src 'none'  ")).toEqual(
      parsePolicy("default-src 'self'; object-src 'none'"),
    );
  });

  it('CSP メタが無ければ投げる (黙って空の policy を返さない)', () => {
    expect(() => policyOf('<html></html>')).toThrow(/CSP/);
  });
});
