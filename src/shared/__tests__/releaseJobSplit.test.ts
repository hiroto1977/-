import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from './originalSource';

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

  it('対照: 署名鍵を受け取るのは build の Build ステップだけ', () => {
    const withSecrets = lines.filter((l) => /\$\{\{\s*secrets\.(CSC_|APPLE_)/.test(l));
    expect(withSecrets.length).toBeGreaterThanOrEqual(5);
    const build = jobBody('build');
    for (const l of withSecrets) expect(build).toContain(l);
  });
});
