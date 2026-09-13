import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * `lint:citations` の「種別の偽装」規則 (2026-09-05)。
 *
 * 確証ゲートは出典の **type** で権威を数える。type は自由記述なので、Harvard Business Review の
 * 記事や Medium のブログに 'academic' と書けば査読誌と同じ重みになる。実測で hbr.org 45 件・
 * medium.com 1 件・blogspot 1 件が 'academic' だった (hbr.org の他の 27 件は 'media')。
 * 鳴る標本 (雑誌・ブログ・百科事典に academic) と通る対照 (media / reference / 査読誌) を留める。
 */
const req = createRequire(import.meta.url);
const { checkAcademicHosts, isNonAcademicHost, NON_ACADEMIC_HOSTS } = req('../../../scripts/lint-citations.cjs') as {
  checkAcademicHosts: (entries: { id: string; sources: { url: string; type: string }[] }[]) => { bad: { id: string; url: string; host: string }[]; seen: number };
  isNonAcademicHost: (host: string) => boolean;
  NON_ACADEMIC_HOSTS: readonly string[];
};

const entry = (url: string, type = 'academic') => ({ id: 'x', sources: [{ url, type, label: 'l' }] });

describe('isNonAcademicHost', () => {
  it('雑誌・ブログ・百科事典のホストとそのサブドメインは true', () => {
    expect(isNonAcademicHost('hbr.org')).toBe(true);
    expect(isNonAcademicHost('medium.com')).toBe(true);
    expect(isNonAcademicHost('andyneely.blogspot.com')).toBe(true);
    expect(isNonAcademicHost('en.wikipedia.org')).toBe(true);
    expect(isNonAcademicHost('ja.wikibooks.org')).toBe(true);
  });

  it('対照: 査読誌・出版社・似た名前の別ホストは false', () => {
    expect(isNonAcademicHost('doi.org')).toBe(false);
    expect(isNonAcademicHost('journals.sagepub.com')).toBe(false);
    expect(isNonAcademicHost('hbr.org.example')).toBe(false);
    expect(isNonAcademicHost('nothbr.org')).toBe(false);
    expect(isNonAcademicHost('')).toBe(false);
  });

  it('台帳は小文字のホスト名だけ (スキームやパスを含まない)', () => {
    for (const h of NON_ACADEMIC_HOSTS) expect(h, h).toMatch(/^[a-z0-9.-]+$/);
    expect(NON_ACADEMIC_HOSTS.length).toBeGreaterThan(20);
  });
});

describe('checkAcademicHosts', () => {
  it('★ 標本: academic を名乗る雑誌・ブログ・百科事典の出典を鳴らす (id とホストつき)', () => {
    const r = checkAcademicHosts([
      entry('https://hbr.org/1990/05/the-core-competence-of-the-corporation'),
      entry('http://andyneely.blogspot.com/2013/11/what-is-servitization.html'),
      entry('https://en.wikipedia.org/wiki/X'),
    ]);
    expect(r.bad.map((b) => b.host)).toEqual(['hbr.org', 'andyneely.blogspot.com', 'en.wikipedia.org']);
    expect(r.seen).toBe(3);
  });

  it('対照: 同じ URL でも media / reference なら鳴らず、数にも入らない', () => {
    const r = checkAcademicHosts([entry('https://hbr.org/2004/10/blue-ocean-strategy', 'media'), entry('https://en.wikipedia.org/wiki/X', 'reference')]);
    expect(r.bad).toEqual([]);
    expect(r.seen).toBe(0);
  });

  it('対照: 査読誌・出版社の academic は通り、数には入る', () => {
    const r = checkAcademicHosts([entry('https://doi.org/10.1002/smj.4250140303'), entry('https://journals.sagepub.com/doi/10.1177/0170840607081138')]);
    expect(r.bad).toEqual([]);
    expect(r.seen).toBe(2);
  });

  it('対照: 壊れた URL や文字列でない url は落ちない', () => {
    const r = checkAcademicHosts([{ id: 'x', sources: [{ url: 'not a url', type: 'academic' }, { url: 42 as unknown as string, type: 'academic' }] }]);
    expect(r.bad).toEqual([]);
  });
});
