import { describe, expect, it } from 'vitest';
import {
  PROFESSIONAL_IDS,
  PROFESSIONAL_MAP,
  otherProfessionals,
  isProfessionalId,
} from '../professionalMap';
import { isServiceId } from '../../../shared/serviceId';
import { SERVICES } from '../../services';

describe('professionalMap (士業 8 種の事業仕分け)', () => {
  it('has exactly 8 unique professional ids, all valid ServiceIds', () => {
    expect(PROFESSIONAL_IDS).toHaveLength(8);
    expect(new Set(PROFESSIONAL_IDS).size).toBe(8);
    for (const id of PROFESSIONAL_IDS) expect(isServiceId(id)).toBe(true);
  });

  it('covers every professional id with a consistent profile', () => {
    expect(Object.keys(PROFESSIONAL_MAP).sort()).toEqual([...PROFESSIONAL_IDS].sort());
    for (const id of PROFESSIONAL_IDS) {
      const p = PROFESSIONAL_MAP[id];
      expect(p.id).toBe(id);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.law.length).toBeGreaterThan(0);
      expect(p.exclusive.length).toBeGreaterThan(0);
      expect(p.summary.length).toBeGreaterThan(0);
    }
  });

  it('assigns at least 3 duties per professional, with unique titles', () => {
    for (const id of PROFESSIONAL_IDS) {
      const { duties } = PROFESSIONAL_MAP[id];
      expect(duties.length).toBeGreaterThanOrEqual(3);
      const titles = duties.map((d) => d.title);
      expect(new Set(titles).size).toBe(titles.length);
      for (const d of duties) {
        expect(d.title.length).toBeGreaterThan(0);
        expect(d.desc.length).toBeGreaterThan(0);
      }
    }
  });

  it('links every duty to a real, non-professional app service', () => {
    // サイドバーに実在するサービスのみリンク可 (uber-eats / demae-can は
    // SERVICE_IDS に居るがサイドバー非表示 = 遷移先ページが無い)。
    const navigable = new Set(SERVICES.map((s) => s.id));
    for (const id of PROFESSIONAL_IDS) {
      for (const d of PROFESSIONAL_MAP[id].duties) {
        if (!d.link) continue;
        expect(isServiceId(d.link.serviceId)).toBe(true);
        expect(navigable.has(d.link.serviceId), `${id}: dead link to ${d.link.serviceId}`).toBe(true);
        // 事業仕分けのリンク先はアプリ機能であって士業ページ自身ではない。
        expect(isProfessionalId(d.link.serviceId)).toBe(false);
        expect(d.link.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('matches the sidebar: every professional is a registered service in the professionals category', () => {
    for (const id of PROFESSIONAL_IDS) {
      const def = SERVICES.find((s) => s.id === id);
      expect(def, `SERVICES entry missing for ${id}`).toBeDefined();
      expect(def?.category).toBe('professionals');
      expect(def?.label).toBe(PROFESSIONAL_MAP[id].label);
    }
    // サイドバーの士業カテゴリと PROFESSIONAL_IDS は並び順まで一致
    // (PROFESSIONAL_IDS は「サイドバー表示順」と宣言しているため)。
    const sidebar = SERVICES.filter((s) => s.category === 'professionals').map((s) => s.id);
    expect(sidebar).toEqual([...PROFESSIONAL_IDS]);
  });

  it('otherProfessionals returns the 7 others in sidebar order, excluding self', () => {
    const others = otherProfessionals('cpa');
    expect(others).toHaveLength(7);
    expect(others.map((p) => p.id)).not.toContain('cpa');
    expect(others.map((p) => p.id)).toEqual(PROFESSIONAL_IDS.filter((p) => p !== 'cpa'));
  });

  it('isProfessionalId narrows correctly', () => {
    expect(isProfessionalId('cpa')).toBe(true);
    expect(isProfessionalId('tax-accountant')).toBe(true);
    expect(isProfessionalId('github')).toBe(false);
    expect(isProfessionalId('docstudio')).toBe(false);
  });
});
