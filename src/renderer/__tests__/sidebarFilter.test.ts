import { describe, it, expect } from 'vitest';
import { filterServices, type SearchableService } from '../sidebarFilter';

const S: SearchableService[] = [
  { id: 'github', label: 'GitHub', description: 'リポジトリ・PR・Issue・CI を表示' },
  { id: 'business', label: '事業ダッシュボード', description: '10 部門の経営支援' },
  { id: 'gmail', label: 'Gmail', description: 'スレッド・ドラフト・ラベル' },
  { id: 'tax-accountant', label: '税理士', description: '記帳代行 / 確定申告' },
];

describe('filterServices', () => {
  it('空クエリは null (フィルタ無し)', () => {
    expect(filterServices(S, '')).toBeNull();
  });

  it('空白のみのクエリも null', () => {
    expect(filterServices(S, '   ')).toBeNull();
  });

  it('英語 ID で一致する', () => {
    const r = filterServices(S, 'github');
    expect(r?.map((s) => s.id)).toEqual(['github']);
  });

  it('大文字小文字を無視する', () => {
    expect(filterServices(S, 'GITHUB')?.map((s) => s.id)).toEqual(['github']);
    expect(filterServices(S, 'gmAIl')?.map((s) => s.id)).toEqual(['gmail']);
    // label の大文字表記を小文字クエリで一致 (id/description には無い → toLowerCase 必須)
    const labelOnly = [{ id: 'x', label: 'Salesforce', description: 'CRM 商談' }];
    expect(filterServices(labelOnly, 'salesforce')?.map((s) => s.id)).toEqual(['x']);
  });

  it('日本語 label で一致する', () => {
    expect(filterServices(S, '事業')?.map((s) => s.id)).toEqual(['business']);
  });

  it('description で一致する', () => {
    expect(filterServices(S, '確定申告')?.map((s) => s.id)).toEqual(['tax-accountant']);
  });

  it('前後空白はトリムされる', () => {
    expect(filterServices(S, '  gmail  ')?.map((s) => s.id)).toEqual(['gmail']);
  });

  it('部分一致 (id の一部)', () => {
    expect(filterServices(S, 'tax')?.map((s) => s.id)).toEqual(['tax-accountant']);
  });

  it('複数ヒット時は定義順を保持する', () => {
    // label/description に共通で含まれる "・" は github 以外にも出る — "ラ" で gmail のみ等で順序確認
    const multi: SearchableService[] = [
      { id: 'a', label: 'Alpha', description: 'shared token' },
      { id: 'b', label: 'Beta', description: 'shared token' },
    ];
    expect(filterServices(multi, 'shared')?.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('一致なしは空配列 (null ではない)', () => {
    const r = filterServices(S, 'zzzznotfound');
    expect(r).toEqual([]);
    expect(r).not.toBeNull();
  });

  it('label にも id にも description にも無い語は除外', () => {
    expect(filterServices(S, 'リポジトリ')?.map((s) => s.id)).toEqual(['github']);
    expect(filterServices(S, 'スレッド')?.map((s) => s.id)).toEqual(['gmail']);
  });
});
