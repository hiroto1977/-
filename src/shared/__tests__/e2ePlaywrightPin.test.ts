import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **lockfile の外で入れる playwright の integrity を、台帳に固定する** (2026-10-19 · パス 536 ·
 * threat: T-125)。`e2e.yml` の `npm install --no-save playwright@X` は版を固定するが、
 * 取得した tarball が想定した物かは誰も見なかった。`scripts/verify-e2e-playwright-pin.cjs` が
 * install の直後に `node_modules/.package-lock.json` を台帳と突き合わせる。
 *
 * ここで留めるのは**配線** —— 台帳の版と workflow の版が同じ・門が install の後・ブラウザを入れる前に走る。
 * 値そのものの照合は script の `--self-test` と、実際の workflow を再現した木 (npm ci + playwright)
 * での実測が受け持つ (網が要るので npm test には置かない)。
 */
const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const tool = req(path.join(REPO, 'scripts/verify-e2e-playwright-pin.cjs')) as {
  check: (lock: unknown, repoLock: unknown) => string[];
  PINS: Record<string, { resolved: string; integrity: string }>;
  VERSION: string;
};
const workflow = readOriginalSource(path.join(REPO, '.github/workflows/e2e.yml'));

const good = () => ({ packages: Object.fromEntries(Object.entries(tool.PINS).map(([k, v]) => [k, { version: tool.VERSION, ...v }])) });
const repo = { packages: { '': {}, 'node_modules/react': { version: '18' } } };

describe('e2e の playwright の integrity (threat: T-125)', () => {
  it('★ workflow が入れる版は台帳の版と同じ', () => {
    const m = /run: npm install [^\n]*\bplaywright@([0-9][\w.-]*)/.exec(workflow);
    expect(m?.[1]).toBe(tool.VERSION);
  });

  it('★ 門は install の後・ブラウザを入れる前に走る', () => {
    const install = workflow.indexOf('run: npm install --no-save');
    const verify = workflow.indexOf('run: node scripts/verify-e2e-playwright-pin.cjs');
    const browser = workflow.indexOf('run: npx playwright install');
    expect(install).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(install);
    expect(browser).toBeGreaterThan(verify);
  });

  it('★ 台帳は playwright と playwright-core の 2 つ・integrity は sha512', () => {
    expect(Object.keys(tool.PINS).sort()).toEqual(['node_modules/playwright', 'node_modules/playwright-core']);
    for (const p of Object.values(tool.PINS)) {
      expect(p.integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
      expect(p.resolved.startsWith('https://registry.npmjs.org/')).toBe(true);
    }
  });

  it('★ 判定: 台帳どおりなら通り、integrity が 1 字違えば落ちる', () => {
    expect(tool.check(good(), repo)).toEqual([]);
    const t = good();
    const entry = t.packages['node_modules/playwright'];
    if (entry === undefined) throw new Error('標本が組めません');
    entry.integrity = entry.integrity.replace('==', '=A');
    expect(tool.check(t, repo).length).toBeGreaterThan(0);
  });

  it('★ 判定: 導入で依存が増えたら落ちる・基準が読めなければ緑にしない', () => {
    const extra = good() as { packages: Record<string, unknown> };
    extra.packages['node_modules/evil'] = { version: '1.0.0' };
    expect(tool.check(extra, repo).some((p) => p.includes('node_modules/evil'))).toBe(true);
    expect(tool.check(good(), null).length).toBeGreaterThan(0);
  });

  it('★ 手で配線: 子プロセスを使わない (読むだけの門)', () => {
    const src = readOriginalSource(path.join(REPO, 'scripts/verify-e2e-playwright-pin.cjs'));
    expect(src).not.toMatch(/child_process|execSync|spawnSync|fetch\(/);
  });
});
