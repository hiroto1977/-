import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * `lint:secrets` (scripts/lint-secrets.cjs) の台帳と、それが実物の追跡ファイルに効いていることを留める。
 *
 * 規則の形そのもの (どの接頭辞を捕まえるか・長さの床・伏せた形) は script の self-test が
 * 持つ。ここでは **verify:all と CI に確かに載っていること** と、**台帳が実物と一致すること**
 * (増えた・減った・理由が空、のどれでも落ちること) を確かめる。
 */

const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-secrets.cjs') as {
  PATTERNS: readonly { id: string; re: RegExp; what: string }[];
  ALLOWED: readonly { path: string; id: string; count: number; reason: string }[];
  scanText: (text: string) => { id: string; line: number; shape: string }[];
  scanTree: (files?: string[]) => { counts: Map<string, number>; scanned: number };
  ledgerProblems: (counts: Map<string, number>, ledger?: readonly unknown[]) => string[];
};

/** 作業の途中の印。台帳の理由に残っていたら落とす (不在の主張。標本は下の it が持つ)。 */
const PLACEHOLDER_WORDS = /TODO|FIXME|あとで/;

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (f: string) => readOriginalSource(path.join(REPO_ROOT, f));

describe('lint:secrets の規則と台帳', () => {
  it('規則の id は一意で、どれも説明 (what) を持つ', () => {
    const ids = gate.PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of gate.PATTERNS) expect(p.what.length).toBeGreaterThan(3);
  });

  it('台帳の理由はどれも空でなく、作業の途中の印 (TODO) を含まない', () => {
    expect(PLACEHOLDER_WORDS.test('あとで直す TODO'), '規則が禁じたい文面に当たる (標本)').toBe(true);
    for (const row of gate.ALLOWED) {
      expect(row.reason.trim().length).toBeGreaterThanOrEqual(10);
      expect(row.reason).not.toMatch(PLACEHOLDER_WORDS);
    }
  });

  it('台帳は実物の追跡ファイルと一致する (増えた・減った・台帳に無いは落ちる)', () => {
    const { counts } = gate.scanTree();
    expect(gate.ledgerProblems(counts)).toEqual([]);
  }, 120_000);

  it('台帳の件数が 1 つでも違えば鳴る (双方向の対照)', () => {
    const { counts } = gate.scanTree();
    const first = gate.ALLOWED[0]!;
    const bumped = new Map(counts);
    bumped.set(`${first.path}::${first.id}`, first.count + 1);
    expect(gate.ledgerProblems(bumped).length).toBe(1);
  }, 120_000);

  it('見本の値は伏せた形だけで報告され、値そのものは出ない', () => {
    const hit = gate.scanText('const t = "' + 'gh' + 'p_' + 'b'.repeat(36) + '";')[0]!;
    expect(hit.shape).toMatch(/^ghp_…\(\d+ 字\)$/);
    expect(hit.shape).not.toContain('b'.repeat(8));
  });
});

describe('lint:secrets は verify:all と CI に載っている', () => {
  it('verify:all が lint:secrets を走らせる', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['lint:secrets']).toContain('scripts/lint-secrets.cjs');
    expect(pkg.scripts['lint:secrets']).toContain('--self-test');
    expect(pkg.scripts['verify:all']).toContain('npm run lint:secrets');
  });

  it('ci.yml が lint:secrets を実行する (載っていない門は何も守らない)', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/- run: npm run lint:secrets\b/);
  });
});
