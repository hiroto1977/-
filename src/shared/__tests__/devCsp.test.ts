import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// scripts/dev-csp.cjs は CJS (Node ビルドスクリプト) 設計のため、
// テストだけが createRequire で読み込む（inline-html.cjs と同じ扱い）。
const req = createRequire(import.meta.url);
const { addDevOriginsToCsp, addDevOriginsToDirective, DEV_CONNECT_ORIGINS } = req(
  '../../../scripts/dev-csp.cjs',
) as {
  addDevOriginsToCsp: (html: string) => string;
  addDevOriginsToDirective: (policy: string) => string;
  DEV_CONNECT_ORIGINS: readonly string[];
};

const REPO_ROOT = path.resolve(__dirname, '../../..');
const INDEX_HTML = readFileSync(path.join(REPO_ROOT, 'src/renderer/index.html'), 'utf8');

const POLICY = "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'";
const HTML = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${POLICY}" /></head><body></body></html>`;

/** HTML から CSP の文字列だけ取り出す。 */
function policyOf(html: string): string {
  const m = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
  expect(m, 'CSP メタが無い').not.toBeNull();
  return m?.[1] ?? '';
}

describe('addDevOriginsToDirective', () => {
  it('connect-src へ開発サーバの origin を足す', () => {
    const out = addDevOriginsToDirective(POLICY);
    expect(out).toContain("connect-src 'self' http://localhost:5173 ws://localhost:5173");
  });

  it('他のディレクティブは触らない', () => {
    const out = addDevOriginsToDirective(POLICY).split(';').map((s) => s.trim());
    expect(out).toContain("default-src 'self'");
    expect(out).toContain("script-src 'self'");
    expect(out).toContain("object-src 'none'");
    expect(out.length).toBe(POLICY.split(';').length);
  });

  it('既に入っていれば足さない（べき等）', () => {
    const once = addDevOriginsToDirective(POLICY);
    expect(addDevOriginsToDirective(once)).toBe(once);
  });

  it('片方だけ入っていれば足りない方だけ足す', () => {
    const half = "default-src 'self'; connect-src 'self' http://localhost:5173";
    const out = addDevOriginsToDirective(half);
    expect(out).toBe("default-src 'self'; connect-src 'self' http://localhost:5173 ws://localhost:5173");
  });

  it('connect-src が無ければ投げる（黙って何もしない方が危ない）', () => {
    expect(() => addDevOriginsToDirective("default-src 'self'; script-src 'self'")).toThrow(/connect-src/);
  });

  // `connect-src-elem` のような別ディレクティブを connect-src と誤認しない。
  it('前方一致の別ディレクティブを connect-src とみなさない', () => {
    expect(() => addDevOriginsToDirective("default-src 'self'; connect-src-elem 'self'")).toThrow(/connect-src/);
  });
});

describe('addDevOriginsToCsp', () => {
  it('HTML の CSP メタを書き換える', () => {
    expect(policyOf(addDevOriginsToCsp(HTML))).toContain('ws://localhost:5173');
  });

  it('CSP メタが無ければ投げる', () => {
    expect(() => addDevOriginsToCsp('<!doctype html><html><head></head><body></body></html>')).toThrow(/CSP/);
  });

  it('メタ以外の本文は変えない', () => {
    const html = `${HTML.replace('</body>', '<p>keep me</p></body>')}`;
    expect(addDevOriginsToCsp(html)).toContain('<p>keep me</p>');
  });
});

// ここが本題。commit されている HTML が「製品の方針そのもの」であることを固定する。
describe('同梱される CSP に開発サーバの origin が入っていないこと', () => {
  it('index.html の CSP は開発サーバの origin を含まない', () => {
    const policy = policyOf(INDEX_HTML);
    for (const origin of DEV_CONNECT_ORIGINS) {
      expect(policy, origin).not.toContain(origin);
    }
    // ポート番号だけの取りこぼしも防ぐ（別スキームで書かれた場合）。
    expect(policy).not.toContain('5173');
  });

  it('index.html の CSP には connect-src がある（足す先が消えていない）', () => {
    expect(policyOf(INDEX_HTML)).toMatch(/connect-src\s+'self'/);
  });

  it('開発時に足すと HMR に必要な origin がそろう', () => {
    const policy = policyOf(addDevOriginsToCsp(INDEX_HTML));
    for (const origin of DEV_CONNECT_ORIGINS) {
      expect(policy, origin).toContain(origin);
    }
  });
});
