import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **`verify:all` を止まらずに回す道具の形を留める** (パス 526)。
 *
 * `verify:all` は `&&` 連結で、最初に落ちたゲートで止まる。直して回し直すたびに次の 1 件が見えるので、
 * パス 525 は 4 回に分けて別のゲート (verify:arch → lint:mutation-scope → lint:shared-judgement →
 * chain:verify) の失敗を見つけた。`audit:verify-keep-going` は全ゲートを回して一度に挙げる。
 * ここは道具が **実物の `verify:all` と同じ母集団を読むこと**・`--fast` が飛ばす物が実在すること・
 * 手で回す道具として配線されていること (CI に入れない) を見る。
 */
const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const tool = req(path.join(REPO, 'scripts/audit-verify-keep-going.cjs')) as {
  HEAVY: string[];
  parseSteps: (s: string) => string[];
  selectSteps: (steps: string[], o: { fast: boolean; only: string[] | null }) => string[];
  summarize: (rows: { gate: string; code: number; sec: number }[]) => { failed: string[]; total: number; seconds: number };
};
const pkg = JSON.parse(readOriginalSource(path.join(REPO, 'package.json'))) as { scripts: Record<string, string> };
const steps = tool.parseSteps(pkg.scripts['verify:all']!);

describe('audit:verify-keep-going', () => {
  it('★ 母集団は verify:all の本文そのもの (手で並べない)', () => {
    expect(steps.length).toBeGreaterThanOrEqual(30);
    expect(steps).toContain('chain:verify');
    expect(steps).toContain('verify:arch');
    expect(new Set(steps).size).toBe(steps.length);
  });

  it('★ --fast が飛ばす重いゲートはどれも実在する (古びない)', () => {
    expect(tool.HEAVY.filter((g) => !steps.includes(g))).toEqual([]);
    const fast = tool.selectSteps(steps, { fast: true, only: null });
    expect(fast.length).toBe(steps.length - tool.HEAVY.length);
    // 先に潰したい census 系の速いゲートは飛ばさない。
    for (const g of ['verify:arch', 'lint:mutation-scope', 'lint:shared-judgement', 'chain:verify', 'lint:docs']) {
      expect(fast, g).toContain(g);
    }
  });

  it('npm run でない段・知らないゲートの名指しは黙って通さず断る', () => {
    expect(() => tool.parseSteps('npm run a && node x.js')).toThrow();
    expect(() => tool.selectSteps(['a'], { fast: false, only: ['zzz'] })).toThrow();
    // 標本: 針が当たる (正しい連結は読める)
    expect(tool.parseSteps('npm run a && npm run b:c')).toEqual(['a', 'b:c']);
  });

  it('落ちた物を挙げる', () => {
    const s = tool.summarize([
      { gate: 'a', code: 0, sec: 1 },
      { gate: 'b', code: 1, sec: 2 },
    ]);
    expect(s.failed).toEqual(['b']);
    expect(s.total).toBe(2);
  });

  it('★ 手で回す道具として配線されている (self-test つき・verify:all には入れない)', () => {
    expect(pkg.scripts['audit:verify-keep-going']).toContain('scripts/audit-verify-keep-going.cjs --self-test');
    expect(pkg.scripts['verify:all']).not.toContain('audit:verify-keep-going');
    expect(readOriginalSource(path.join(REPO, 'CLAUDE.md'))).toContain('npm run audit:verify-keep-going');
  });
});
