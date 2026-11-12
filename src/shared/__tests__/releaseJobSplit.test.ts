import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from './originalSource';
import { createRequire } from 'node:module';

/**
 * 検査のコードを走らせる runner と、署名鍵を持つ runner は別でなければならない
 * (2026-10-20 · パス 544 · threat: T-144)。同じ job の中では、`npm test` が import するテストの 1 つが
 * `$GITHUB_ENV` に `NODE_OPTIONS=--require …` を足し、続く Build の `node` が署名鍵を読めた
 * (隔離した複製で実測。`lint:workflow-security` は workflow の `run:` しか見ず、テストファイルの中から
 * 書く形はどのゲートも見ない)。
 */
const yml = readOriginalSource(path.join(__dirname, '../../../.github/workflows/release.yml'));
const lines = yml.split('\n');
const jobBody = (name: string): string => {
  const start = lines.findIndex((l) => l === `  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[a-z][\w-]*:$/.test(lines[i]!)) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
};
const code = (s: string): string => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

describe('release.yml — 検査と署名を別の runner にする (threat: T-144)', () => {
  it('★ verify job は secrets を 1 つも参照しない', () => {
    expect(code(jobBody('verify'))).not.toMatch(/secrets\./);
  });

  it('★ 検査 (npm test / verify:all) は verify にだけ在り、署名鍵を持つ build には無い', () => {
    expect(code(jobBody('verify'))).toMatch(/npm test/);
    expect(code(jobBody('verify'))).toMatch(/verify:all/);
    expect(code(jobBody('build'))).not.toMatch(/npm test|verify:all|npm run typecheck/);
  });

  it('★ build は verify を待ち、main か v* タグからだけ・release environment で走る', () => {
    const build = code(jobBody('build'));
    expect(build).toMatch(/needs: verify/);
    expect(build).toMatch(/environment: release/);
    expect(build).toMatch(/refs\/heads\/main/);
    expect(build).toMatch(/refs\/tags\/v/);
  });

  /*
   * **job 単位の `env:` は T-144 の隔離を中から破る** (2026-10-28 · threat: T-211)。
   * 上の対照は「secrets の行が build の job の中に在る」までしか見ない —— build の
   * `environment: release` の直後に `env:` で CSC_LINK を置いても、行は build の中なので通る
   * (隔離した複製で実測: この検査 4 本 131 件と `lint:workflow-security` が全部緑)。
   * そこに置いた鍵は、Build の前の checkout・`npm ci` (postinstall)・第三者 action まで読める。
   * だから **secrets の行の集合 == Build step の `env:` の行の集合** を両方向で留める。
   */
  it('★ secrets を参照する行は、build の Build step の env: の行と両方向で一致する (threat: T-211)', () => {
    const codeLines = lines.map((l) => l.replace(/(^|\s)#.*$/, '$1'));
    const secretLines = new Set(codeLines.map((l, i) => (/secrets\./.test(l) ? i : -1)).filter((i) => i >= 0));
    expect(secretLines.size).toBeGreaterThanOrEqual(5);
    // Build step の env: ブロック —— `- name: Build` から次の項目 (`      - `) までの間の `        env:` の子。
    const buildStart = codeLines.findIndex((l) => /^ {6}- name: Build\s*$/.test(l));
    expect(buildStart, '- name: Build').toBeGreaterThan(-1);
    let envStart = -1;
    const envLines = new Set<number>();
    for (let i = buildStart + 1; i < codeLines.length; i += 1) {
      const l = codeLines[i]!;
      if (/^ {6}- /.test(l) || /^ {2}[a-z][\w-]*:$/.test(l)) break;
      if (/^ {8}env:\s*$/.test(l)) { envStart = i; continue; }
      if (envStart >= 0 && /^ {10}\S/.test(l)) envLines.add(i);
      else if (envStart >= 0 && /^ {8}\S/.test(l)) envStart = -1;
    }
    expect([...secretLines].sort()).toEqual([...envLines].sort());
    // 逆向き: Build の env: の行はどれも secrets を参照する (平文の値をここへ置き始めたら、この表の意味が変わる)。
    for (const i of envLines) expect(codeLines[i], `release.yml:${i + 1}`).toMatch(/\$\{\{\s*secrets\.[A-Z_]+\s*\}\}/);
  });

  it('★ 門は job 単位の env: に置いた secrets を落とす (release.yml を複製して植えた形 · threat: T-211)', () => {
    const req = createRequire(import.meta.url);
    const gate = req('../../../scripts/lint-workflow-security.cjs') as {
      check: (list: { name: string; text: string }[], allow?: Record<string, unknown>, jobAllow?: Record<string, unknown>) => { file: string; why: string }[];
    };
    const jobAllow = (req('../../../scripts/lint-workflow-security.cjs') as { JOB_PERMISSIONS_ALLOW: Record<string, unknown> }).JOB_PERMISSIONS_ALLOW;
    // 台帳の逆向き (他の workflow の job 権限が使われていない) は 1 本だけ渡す形では必ず鳴るので除く。
    const clean = gate.check([{ name: 'release.yml', text: yml }], {}, jobAllow).filter((p) => p.file !== '(台帳)');
    expect(clean, '実物の release.yml はこの門を通る').toHaveLength(0);
    const planted = yml.replace(
      '    environment: release\n',
      '    environment: release\n    env:\n      CSC_LINK: ${{ secrets.CSC_LINK }}\n',
    );
    expect(planted).not.toBe(yml);
    const ps = gate.check([{ name: 'release.yml', text: planted }], {}, jobAllow).filter((p) => p.file !== '(台帳)');
    expect(ps).toHaveLength(1);
    expect(ps.map((p) => p.why).join('\n')).toMatch(/secrets の置き場が step の env:\/with: ではない/);
  });

  it('対照: 署名鍵を受け取るのは build の Build ステップだけ', () => {
    const withSecrets = lines.filter((l) => /\$\{\{\s*secrets\.(CSC_|APPLE_)/.test(l));
    expect(withSecrets.length).toBeGreaterThanOrEqual(5);
    const build = jobBody('build');
    for (const l of withSecrets) expect(build).toContain(l);
  });
});
