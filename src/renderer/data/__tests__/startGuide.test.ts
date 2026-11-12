import { describe, expect, it } from 'vitest';
import { JARGON, START_GOALS } from '../startGuide';
import { SERVICES } from '../../services';

/**
 * 「やりたいことから始める」の文面と行き先の規則 (2026-10-22)。
 * 初めて使う人が読む入口なので、用語・長さ・行き先の実在を機械で留める。
 */
describe('やりたいことから始める — 初めての人のための入口', () => {
  const FIELDS = (g: (typeof START_GOALS)[number]): string[] => [g.title, g.when, g.prepare, ...g.steps, g.targetLabel];

  it('用事は 8 件以上あり、id は重ならない', () => {
    expect(START_GOALS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(START_GOALS.map((g) => g.id)).size).toBe(START_GOALS.length);
  });

  it('★ 開く画面は、サイドバーに実在する画面で、名前もサイドバーと同じ', () => {
    for (const g of START_GOALS) {
      const svc = SERVICES.find((s) => s.id === g.target);
      expect(svc, `${g.id} → ${g.target} がサイドバーに無い`).toBeDefined();
      expect(g.targetLabel, g.id).toBe(svc?.label);
    }
  });

  it('★ 専門用語・英略語を文面に出さない (使うなら言い換える)', () => {
    for (const g of START_GOALS) {
      for (const text of FIELDS(g)) {
        // 画面の名前 (targetLabel) はサイドバーと同じ綴りを使うので、台帳の語は対象から除く
        if (text === g.targetLabel) continue;
        for (const word of JARGON) expect(text, `${g.id}: 「${word}」`).not.toContain(word);
      }
    }
  });

  it('★ 台帳の語は、実際に文面へ当たる (台帳が空の検査にならない)', () => {
    expect(JARGON).toContain('損益分岐点');
    const sample = '損益分岐点を計算する';
    expect(JARGON.some((w) => sample.includes(w))).toBe(true);
    expect(JARGON.some((w) => '売上を記録する'.includes(w))).toBe(false);
  });

  it('★ 手順は 1〜3 つ・1 文は短く・欄は空にしない', () => {
    for (const g of START_GOALS) {
      expect(g.steps.length, g.id).toBeGreaterThanOrEqual(1);
      expect(g.steps.length, g.id).toBeLessThanOrEqual(3);
      expect(g.title.length, g.id).toBeLessThanOrEqual(30);
      expect(g.when.length, g.id).toBeLessThanOrEqual(60);
      expect(g.prepare.length, g.id).toBeLessThanOrEqual(60);
      for (const s of g.steps) expect(s.length, `${g.id}: ${s}`).toBeLessThanOrEqual(50);
      for (const t of FIELDS(g)) expect(t.trim().length, g.id).toBeGreaterThan(0);
    }
  });

  it('★ 迷ったとき用に、AI アシスタントへ誘う用事が 1 つある', () => {
    expect(START_GOALS.filter((g) => g.target === 'assistant')).toHaveLength(1);
  });
});
