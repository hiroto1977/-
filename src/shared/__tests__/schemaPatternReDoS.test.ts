import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/**
 * 登録簿のスキーマの `pattern` を組む前に、指数時間に落ちる形を断る (2026-10-21 · threat: T-162)。
 * 実測: `^(a+)+$` は 29 文字の値 1 つで 14 秒、`^(a|a)*$` は 26 秒 (1 文字ごとに約 2 倍)。
 * 検証器は CI のゲートの中で走るので、宣言の pattern が壊れた形だと CI が数時間止まった
 * (ci.yml に timeout-minutes も無かった)。
 */
const REPO = resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const subset = req('../../../scripts/lib/json-schema-subset.cjs') as {
  validateAgainstSchema: (schema: unknown, value: unknown, where?: string) => string[];
  unsafePatternReason: (pattern: string) => string | null;
};

describe('登録簿のスキーマの pattern — 指数時間に落ちる形は組む前に断る (threat: T-162)', () => {
  it.each([
    ['入れ子の +', '^(a+)+$'],
    ['量指定された選択', '^(a|a)*$'],
    ['入れ子の *', '^(a*)*$'],
    ['非捕捉グループの入れ子', '^(?:x+y?)+$'],
    ['選択の繰り返し', '^(a|b)+$'],
    ['繰り返しの回数が 2 以上', '^(.*a){10}$'],
    ['{n,} の入れ子', '^(a{2,})+$'],
    ['{n,m} の入れ子 (回数が 2 以上)', '^(a{1,9}){2,9}$'],
    ['後方参照', '^(\\w+)\\1$'],
    ['名前つきの後方参照', '^(?<x>a)\\k<x>$'],
  ])('★ %s は断る', (_n, pattern) => {
    expect(subset.unsafePatternReason(pattern), pattern).not.toBeNull();
  });

  it.each([
    ['実物の id の形', '^[a-z][a-z0-9-]*$'],
    ['実物の題名の形 (クラスの * 1 つ)', '^[^\\u0000-\\u001F\\u007F-\\u009F]*$'],
    ['固定の繰り返し', '^(ab)+$'],
    ['グループの中が量指定子なし', '^(?:ab|cd)?$'],
    ['クラスの中の量指定子', '^(?:[+*]x)+$'],
    ['エスケープした括弧', '^\\(a+\\)+$'],
    ['クラスの中の括弧', '^[(a+)]+$'],
    ['任意の小数部', '^v\\d{1,3}(\\.\\d+)?$'],
  ])('対照: %s は断らない', (_n, pattern) => {
    expect(subset.unsafePatternReason(pattern), pattern).toBeNull();
  });

  it('★ 断った pattern は RegExp を組まず、重い入力でも即座に返る (検証器の入口)', () => {
    for (const pattern of ['^(a+)+$', '^(a|a)*$']) {
      const t = Date.now();
      const problems = subset.validateAgainstSchema({ type: 'string', pattern }, `${'a'.repeat(40)}!`, '$');
      expect(Date.now() - t, pattern).toBeLessThan(500);
      expect(problems.some((p) => p.includes('受けません')), pattern).toBe(true);
    }
  });

  it('対照: 安全な pattern は今までどおり値を検める', () => {
    const sch = { type: 'string', pattern: '^[a-z][a-z0-9-]*$' };
    expect(subset.validateAgainstSchema(sch, 'tax-income', '$')).toEqual([]);
    expect(subset.validateAgainstSchema(sch, 'Bad Id', '$').length).toBeGreaterThan(0);
  });

  it('★ 実物の registry.schema.json の pattern は 1 本残らず安全な形 (今 0 件の断り)', () => {
    const text = readOriginalSource(join(REPO, 'orchestration', 'registry.schema.json'));
    const patterns: string[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n !== null && typeof n === 'object') {
        for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
          if (k === 'pattern' && typeof v === 'string') patterns.push(v);
          else walk(v);
        }
      }
    };
    walk(JSON.parse(text));
    expect(patterns.length).toBeGreaterThanOrEqual(5); // 走査が空虚でない
    for (const p of patterns) expect(subset.unsafePatternReason(p), p).toBeNull();
  });

  it('★ ci.yml のジョブは timeout-minutes を持つ (止まったゲートが Actions の分を使い切らない)', () => {
    const ci = readOriginalSource(join(REPO, '.github', 'workflows', 'ci.yml'));
    const m = /^\s+timeout-minutes:\s*(\d+)\s*$/m.exec(ci);
    expect(m, 'ci.yml に timeout-minutes が無い').not.toBeNull();
    const minutes = Number(m?.[1]);
    expect(minutes).toBeGreaterThanOrEqual(30); // 実測 約 14.5 分の 2 倍以上 (遅い runner で落とさない)
    expect(minutes).toBeLessThanOrEqual(90); // 既定の 360 分より十分短い
  });
});
