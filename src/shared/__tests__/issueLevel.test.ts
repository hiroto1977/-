import { describe, expect, it } from 'vitest';
import { ISSUE_RANK, byIssueLevel, countByLevel, type IssueLevel } from '../issueLevel';

const at = (...levels: IssueLevel[]) => levels.map((level) => ({ level }));

describe('重大度の順位', () => {
  it('fatal → warn → info の順', () => {
    expect(ISSUE_RANK).toEqual({ fatal: 0, warn: 1, info: 2 });
  });

  it('3 段階しかない', () => {
    expect(Object.keys(ISSUE_RANK)).toHaveLength(3);
  });
});

describe('byIssueLevel', () => {
  it('重い順に並べる', () => {
    const sorted = at('info', 'fatal', 'warn', 'info', 'fatal').sort(byIssueLevel);
    expect(sorted.map((i) => i.level)).toEqual(['fatal', 'fatal', 'warn', 'info', 'info']);
  });

  it('同順位は元の順序を保つ（安定ソート）', () => {
    const rows = [
      { level: 'warn' as const, id: 'a' },
      { level: 'fatal' as const, id: 'b' },
      { level: 'warn' as const, id: 'c' },
    ];
    expect([...rows].sort(byIssueLevel).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('比較の符号が順位差になる', () => {
    expect(byIssueLevel({ level: 'fatal' }, { level: 'info' })).toBeLessThan(0);
    expect(byIssueLevel({ level: 'info' }, { level: 'fatal' })).toBeGreaterThan(0);
    expect(byIssueLevel({ level: 'warn' }, { level: 'warn' })).toBe(0);
  });
});

describe('countByLevel', () => {
  it('段階ごとに数える', () => {
    expect(countByLevel(at('fatal', 'warn', 'warn', 'info'))).toEqual({ fatal: 1, warn: 2, info: 1 });
  });

  it('空なら全部 0（未定義ではない）', () => {
    expect(countByLevel([])).toEqual({ fatal: 0, warn: 0, info: 0 });
  });

  it('1 段階だけでも他の段階は 0 で返る', () => {
    expect(countByLevel(at('info', 'info', 'info'))).toEqual({ fatal: 0, warn: 0, info: 3 });
  });

  it('呼ぶたびに新しい集計を返す（前回の数え上げが残らない）', () => {
    const first = countByLevel(at('fatal'));
    const second = countByLevel(at('warn'));
    expect(first).toEqual({ fatal: 1, warn: 0, info: 0 });
    expect(second).toEqual({ fatal: 0, warn: 1, info: 0 });
  });
});
