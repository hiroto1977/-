/**
 * 士業 → 書類の逆引き (士業のページの「書類スタジオで作る書類」)。
 * 仕分け表を裏返すだけなので、表と食い違わないことと、8 士業すべてに書類があることを固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  EXTRA_DOC_IDS,
  EXTRA_DOC_LABEL,
  TRIAGE_ROWS,
  docLabel,
  docsForProfessional,
} from '../businessTriage';
import { PROFESSIONAL_IDS } from '../professionalMap';
import { STUDIO_TEMPLATES } from '../docStudioData';

describe('docLabel', () => {
  it('書式一覧の名前、4 つの特別枠、見つからなければ id', () => {
    expect(docLabel('nda')).toBe(STUDIO_TEMPLATES.find((d) => d.id === 'nda')!.label);
    expect(docLabel('kessan')).toBe('計算書類（4点）');
    expect(docLabel('teikan-kk')).toBe('電子定款（株式会社）');
    expect(docLabel('teikan-gk')).toBe('電子定款（合同会社）');
    expect(docLabel('shugyo')).toBe('就業規則');
    expect(docLabel('no-such-doc')).toBe('no-such-doc');
  });
  it('特別枠の表は EXTRA_DOC_IDS を全部覆う', () => {
    expect(Object.keys(EXTRA_DOC_LABEL).sort()).toEqual([...EXTRA_DOC_IDS].sort());
  });
});

describe('docsForProfessional', () => {
  it('8 士業すべてに書類がある', () => {
    for (const id of PROFESSIONAL_IDS) {
      expect(docsForProfessional(id).length, id).toBeGreaterThan(0);
    }
  });
  it('計算書類は税理士・公認会計士の相談先として出る (独占ではない)', () => {
    for (const id of ['tax-accountant', 'cpa'] as const) {
      const kessan = docsForProfessional(id).find((d) => d.doc === 'kessan');
      expect(kessan).toEqual({ doc: 'kessan', label: '計算書類（4点）', relation: 'consult', ownUse: 'ok-with-care' });
    }
    expect(docsForProfessional('labor-consultant').some((d) => d.doc === 'kessan')).toBe(false);
  });
  it('税理士には事業計画書・資金繰り表も出る。診断士にも同じ 2 つが出る', () => {
    for (const id of ['tax-accountant', 'sme-consultant'] as const) {
      const docs = docsForProfessional(id).map((d) => d.doc);
      expect(docs).toContain('jigyo-keikaku');
      expect(docs).toContain('shikin-guri');
    }
  });
  it('就業規則は社労士の独占側に出て、独占が先・相談が後の順で並び、重複しない', () => {
    const docs = docsForProfessional('labor-consultant');
    const shugyo = docs.find((d) => d.doc === 'shugyo');
    expect(shugyo?.relation).toBe('exclusive');
    const relations = docs.map((d) => d.relation);
    const firstConsult = relations.indexOf('consult');
    if (firstConsult !== -1) expect(relations.slice(firstConsult).every((r) => r === 'consult')).toBe(true);
    expect(new Set(docs.map((d) => d.doc)).size).toBe(docs.length);
  });
  it('表と食い違わない: 独占側は exclusiveTo、相談側は consult (かつ exclusiveTo に無い) の行と一致する', () => {
    for (const id of PROFESSIONAL_IDS) {
      const docs = docsForProfessional(id);
      const expectedExclusive = TRIAGE_ROWS.filter((r) => r.exclusiveTo.includes(id)).map((r) => r.doc);
      const expectedConsult = TRIAGE_ROWS.filter((r) => !r.exclusiveTo.includes(id) && r.consult.includes(id)).map((r) => r.doc);
      expect(docs.filter((d) => d.relation === 'exclusive').map((d) => d.doc)).toEqual(expectedExclusive);
      expect(docs.filter((d) => d.relation === 'consult').map((d) => d.doc)).toEqual(expectedConsult);
      for (const d of docs) {
        expect(d.label).toBe(docLabel(d.doc));
        expect(d.ownUse).toBe(TRIAGE_ROWS.find((r) => r.doc === d.doc)!.ownUse);
      }
    }
  });
});
