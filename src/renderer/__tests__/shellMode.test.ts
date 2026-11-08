// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { currentShellMode, shellModeFromSearch } from '../shellMode';

describe('殻の種類 (既定は旧画面・村は ?ui=village)', () => {
  it('★ 既定は旧画面 (サイドバー)。村は ?ui=village を明示したときだけ', () => {
    expect(shellModeFromSearch('')).toBe('legacy');
    expect(shellModeFromSearch('?ui=village')).toBe('village');
    expect(shellModeFromSearch('?x=1&ui=village')).toBe('village');
  });

  it('★ 知らない値・大小違い・複数・空の値は旧画面へ倒す (村へは明示のときだけ)', () => {
    for (const s of ['?ui=legacy', '?ui=VILLAGE', '?ui=', '?ui', '?ui=village&ui=village', '?ui=village&ui=x', '?village', 'ui=village ']) {
      expect(shellModeFromSearch(s), s).toBe('legacy');
    }
  });

  it('★ 検索部が壊れていても投げず旧画面になる', () => {
    expect(shellModeFromSearch('?ui=%E0%A4%A')).toBe('legacy');
    expect(shellModeFromSearch('%')).toBe('legacy');
  });

  it('★ jsdom の検査は既定で旧画面 (setup が ?ui=legacy を付ける)', () => {
    expect(currentShellMode()).toBe('legacy');
  });
});
