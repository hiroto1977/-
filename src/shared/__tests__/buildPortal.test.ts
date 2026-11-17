/**
 * 社外向けポータルの単一 HTML を組む道具 (`scripts/build-portal.cjs` · 2026-11-11)。
 *
 * ビルドそのものは実機の検査 (`npm run e2e:portal`) が見る。ここは毎回の npm test で、
 * - 組めるポータル ⇔ 台帳の社外向けポータル ⇔ 雛形 ⇔ 入口のファイル ⇔ npm script の引数
 * - CSP が「網へ出ない・スクリプトはハッシュだけ」であること
 * - 仕上がりの確認 (selfCheck) が、社内版の文面・外のスクリプト・緩い CSP を実際に断ること
 * を留める。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTAL_IDS } from '../portal';
import { readOriginalSource } from './originalSource';

const tool = require('../../../scripts/build-portal.cjs') as {
  PORTAL_NAMES: readonly string[];
  INTERNAL_MARKERS: readonly { marker: string; module: string }[];
  buildPortalCsp: (hashes: readonly string[]) => string;
  applyPortalCsp: (html: string) => string;
  selfCheck: (html: string) => string[];
  buildOne: (name: string) => Promise<string>;
};

const REPO = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string): string => readOriginalSource(path.join(REPO, rel));

describe('組めるポータル', () => {
  it('★ 台帳の社外向けポータル (社内以外) と一致する', () => {
    expect([...tool.PORTAL_NAMES]).toEqual(PORTAL_IDS.filter((p) => p !== 'internal'));
  });

  it('★ どのポータルにも雛形が在り、雛形はそのポータルの入口だけを読む', () => {
    for (const name of tool.PORTAL_NAMES) {
      const html = read(`src/renderer/portal-${name}.html`);
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
      expect(scripts, name).toEqual([`./portal/${name}Main.tsx`]);
      expect(() => read(`src/renderer/portal/${name}Main.tsx`), name).not.toThrow();
      // 雛形の CSP も網へ出ない (組む途中の物だが、緩い雛形を置かない)
      expect(html, name).toContain("connect-src 'none'");
      expect(html, name).toContain('<meta name="referrer" content="no-referrer"');
    }
  });

  it('★ npm run build:portal は、組めるポータルを全部組む', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const script = pkg.scripts['build:portal'] ?? '';
    const args = /node scripts\/build-portal\.cjs(.*)$/.exec(script)?.[1]?.trim().split(/\s+/) ?? [];
    expect(args).toEqual([...tool.PORTAL_NAMES]);
    expect(script.startsWith('tsc -b && ')).toBe(true);
  });

  it('知らないポータルは組まずに断る', async () => {
    await expect(tool.buildOne('internal')).rejects.toThrow('知らないポータル「internal」');
    await expect(tool.buildOne('../partner')).rejects.toThrow('知らないポータル');
  });
});

describe('ポータルの CSP', () => {
  const csp = tool.buildPortalCsp(["'sha256-AAAA'", "'sha256-BBBB'"]);

  it('★ 網へ出ない・既定は none・スクリプトは渡したハッシュだけ', () => {
    const content = /content="([^"]*)"/.exec(csp)?.[1] ?? '';
    const directives = Object.fromEntries(
      content.split('; ').map((d) => {
        const [name, ...rest] = d.split(' ');
        return [name as string, rest.join(' ')];
      }),
    );
    expect(directives).toEqual({
      'default-src': "'none'",
      'script-src': "'sha256-AAAA' 'sha256-BBBB'",
      'style-src': "'unsafe-inline'",
      'img-src': 'data: blob:',
      'font-src': 'data:',
      'connect-src': "'none'",
      'worker-src': "'none'",
      'object-src': "'none'",
      'frame-src': "'none'",
      'base-uri': "'none'",
      'form-action': "'none'",
    });
  });

  it("script-src に 'unsafe-inline' / 'unsafe-eval' / 'self' / ホストを置かない", () => {
    const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] ?? '';
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'self'", 'https:', '*']) {
      expect(scriptSrc.split(' ')).not.toContain(bad);
    }
    // 対照: 針は style-src の 'unsafe-inline' には当たる (綴りが生きている)
    expect(csp).toContain("style-src 'unsafe-inline'");
  });

  it('スクリプトが 0 件なら組まない (script-src を空にしない)', () => {
    expect(() => tool.buildPortalCsp([])).toThrow('インラインスクリプトが 0 件');
  });

  it('★ applyPortalCsp は、畳み込んだスクリプトのハッシュを CSP に載せ、雛形の CSP を残さない', () => {
    const html =
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src https:" />' +
      '</head><body><script type="module">console.log(1)</script></body></html>';
    const out = tool.applyPortalCsp(html);
    expect(out).not.toContain("default-src 'self'");
    expect(out).not.toContain('connect-src https:');
    expect(out).toContain("connect-src 'none'");
    expect(/script-src 'sha256-[A-Za-z0-9+/=]+'/.test(out)).toBe(true);
    expect((out.match(/Content-Security-Policy/g) ?? []).length).toBe(1);
  });

  it('CSP の meta が無い HTML は断る', () => {
    expect(() => tool.applyPortalCsp('<html><body><script>1</script></body></html>')).toThrow('CSP メタタグが見つかりません');
  });
});

describe('仕上がりの確認 (selfCheck)', () => {
  const good =
    `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'"></head>` +
    `<body><script type="module">${'x'.repeat(60_000)}</script></body></html>`;

  it('対照: 健全な HTML は問題 0 件', () => {
    expect(tool.selfCheck(good)).toEqual([]);
  });

  it('★ 社内版だけの文面が 1 つでも在れば断り、入ったモジュールを名指しする', () => {
    expect(tool.INTERNAL_MARKERS.length).toBeGreaterThanOrEqual(5);
    for (const { marker, module: mod } of tool.INTERNAL_MARKERS) {
      const problems = tool.selfCheck(good.replace('</body>', `<p>${marker}</p></body>`));
      expect(problems.length, marker).toBe(1);
      expect(problems[0], marker).toContain(marker);
      expect(problems[0], marker).toContain(mod);
    }
  });

  it('外のスクリプト・外のスタイルシート・網へ出られる CSP・小さすぎる HTML を断る', () => {
    expect(tool.selfCheck(good.replace('<body>', '<body><script src="https://cdn.example/x.js"></script>'))).toEqual([
      '外のスクリプトを読む <script src> が残っている',
    ]);
    expect(tool.selfCheck(good.replace('<body>', '<body><link rel="stylesheet" href="./a.css">'))).toEqual([
      '外のスタイルシートを読む <link> が残っている',
    ]);
    expect(tool.selfCheck(good.replace("connect-src 'none'", 'connect-src https:'))).toEqual([
      "CSP が connect-src 'none' を持たない",
    ]);
    const small = tool.selfCheck(good.replace('x'.repeat(60_000), 'x'));
    expect(small.length).toBe(1);
    expect(small[0]).toContain('HTML が小さすぎる');
  });
});
