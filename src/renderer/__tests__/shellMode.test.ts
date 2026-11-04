// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { currentShellMode, shellModeFromSearch } from '../shellMode';

describe('殻の種類 (村リビルド P1)', () => {
  it('★ 既定は村。旧画面は ?ui=legacy を明示したときだけ', () => {
    expect(shellModeFromSearch('')).toBe('village');
    expect(shellModeFromSearch('?ui=legacy')).toBe('legacy');
    expect(shellModeFromSearch('?x=1&ui=legacy')).toBe('legacy');
  });

  it('★ 知らない値・大小違い・複数・空の値は村へ倒す (旧画面へは明示のときだけ)', () => {
    for (const s of ['?ui=village', '?ui=LEGACY', '?ui=', '?ui', '?ui=legacy&ui=legacy', '?ui=legacy&ui=x', '?legacy', 'ui=legacy ']) {
      expect(shellModeFromSearch(s), s).toBe('village');
    }
  });

  it('★ 検索部が壊れていても投げず村になる', () => {
    expect(shellModeFromSearch('?ui=%E0%A4%A')).toBe('village');
    expect(shellModeFromSearch('%')).toBe('village');
  });

  it('★ jsdom の検査は setup で ?ui=legacy が付く (旧画面前提の検査が壊れない)', () => {
    expect(window.location.search).toBe('?ui=legacy');
    expect(currentShellMode()).toBe('legacy');
  });
});
