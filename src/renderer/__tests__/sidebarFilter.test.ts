import { describe, it, expect } from 'vitest';
import { filterServices, scoreService, type SearchableService } from '../sidebarFilter';

const S: SearchableService[] = [
  { id: 'github', label: 'GitHub', description: 'リポジトリ・PR・Issue・CI を表示' },
  { id: 'business', label: '事業ダッシュボード', description: '10 部門の経営支援' },
  { id: 'gmail', label: 'Gmail', description: 'スレッド・ドラフト・ラベル' },
  { id: 'tax-accountant', label: '税理士', description: '記帳代行 / 確定申告' },
];

// 各 tier をちょうど 1 つだけ満たすサービス (クエリは 'foo')。
const exactLabel: SearchableService = { id: 'x', label: 'Foo', description: 'z' };
const exactId: SearchableService = { id: 'foo', label: 'L', description: 'z' };
const prefixLabel: SearchableService = { id: 'x', label: 'Foobar', description: 'z' };
const prefixId: SearchableService = { id: 'foobar', label: 'L', description: 'z' };
const inclLabel: SearchableService = { id: 'x', label: 'zFoo', description: 'z' };
const inclId: SearchableService = { id: 'zfoo', label: 'L', description: 'z' };
const inclDesc: SearchableService = { id: 'x', label: 'L', description: 'zFoo' };
const noMatch: SearchableService = { id: 'x', label: 'L', description: 'z' };

describe('scoreService — tier ごとのスコア', () => {
  it('空クエリは 0', () => {
    expect(scoreService(exactLabel, '')).toBe(0);
    expect(scoreService(exactLabel, '   ')).toBe(0);
  });
  it('label 完全一致が最高スコア', () => {
    expect(scoreService(exactLabel, 'foo')).toBe(100);
  });
  it('id 完全一致は label 完全一致より低い', () => {
    expect(scoreService(exactId, 'foo')).toBe(90);
    expect(scoreService(exactId, 'foo')).toBeLessThan(scoreService(exactLabel, 'foo'));
  });
  it('label 前方一致', () => {
    expect(scoreService(prefixLabel, 'foo')).toBe(80);
  });
  it('id 前方一致は label 前方一致より低い', () => {
    expect(scoreService(prefixId, 'foo')).toBe(70);
    expect(scoreService(prefixId, 'foo')).toBeLessThan(scoreService(prefixLabel, 'foo'));
  });
  it('label 部分一致', () => {
    expect(scoreService(inclLabel, 'foo')).toBe(50);
  });
  it('id 部分一致は label 部分一致より低い', () => {
    expect(scoreService(inclId, 'foo')).toBe(40);
    expect(scoreService(inclId, 'foo')).toBeLessThan(scoreService(inclLabel, 'foo'));
  });
  it('description 部分一致が最低 (0 より大きい)', () => {
    expect(scoreService(inclDesc, 'foo')).toBe(20);
    expect(scoreService(inclDesc, 'foo')).toBeLessThan(scoreService(inclId, 'foo'));
  });
  it('どこにも無ければ 0', () => {
    expect(scoreService(noMatch, 'foo')).toBe(0);
  });
  it('大文字小文字を無視 (label/id/desc すべて)', () => {
    expect(scoreService({ id: 'x', label: 'FOO', description: 'z' }, 'foo')).toBe(100);
    expect(scoreService({ id: 'FOO', label: 'L', description: 'z' }, 'foo')).toBe(90);
    expect(scoreService({ id: 'x', label: 'L', description: 'ZFOO' }, 'foo')).toBe(20);
  });
  it('完全一致は前方一致より優先 (Foo は exact、Foobar は prefix)', () => {
    expect(scoreService(exactLabel, 'foo')).toBeGreaterThan(scoreService(prefixLabel, 'foo'));
  });
});

describe('filterServices — 絞り込み', () => {
  it('空クエリは null (フィルタ無し)', () => {
    expect(filterServices(S, '')).toBeNull();
    expect(filterServices(S, '   ')).toBeNull();
  });
  it('英語 ID で一致', () => {
    expect(filterServices(S, 'github')?.map((s) => s.id)).toEqual(['github']);
  });
  it('大文字小文字を無視', () => {
    expect(filterServices(S, 'GITHUB')?.map((s) => s.id)).toEqual(['github']);
  });
  it('日本語 label で一致', () => {
    expect(filterServices(S, '事業')?.map((s) => s.id)).toEqual(['business']);
  });
  it('description で一致', () => {
    expect(filterServices(S, '確定申告')?.map((s) => s.id)).toEqual(['tax-accountant']);
  });
  it('前後空白はトリム', () => {
    expect(filterServices(S, '  gmail  ')?.map((s) => s.id)).toEqual(['gmail']);
  });
  it('一致なしは空配列 (null ではない)', () => {
    const r = filterServices(S, 'zzzznotfound');
    expect(r).toEqual([]);
    expect(r).not.toBeNull();
  });
});

describe('filterServices — 関連度ランキング', () => {
  // 定義順はわざと「スコアが低い順」にして、並べ替えが効いていることを検証。
  const ranked: SearchableService[] = [
    inclDesc, // 20
    inclId, // 40
    inclLabel, // 50
    prefixId, // 70
    prefixLabel, // 80
    exactId, // 90
    exactLabel, // 100
    noMatch, // 0 → 除外
  ];
  it('スコア降順に並ぶ (定義順が逆でも)', () => {
    const r = filterServices(ranked, 'foo')!;
    expect(r.map((s) => scoreService(s, 'foo'))).toEqual([100, 90, 80, 70, 50, 40, 20]);
  });
  it('非一致 (score 0) は除外される', () => {
    const r = filterServices(ranked, 'foo')!;
    expect(r.includes(noMatch)).toBe(false);
    expect(r).toHaveLength(7);
  });
  it('同点は元の定義順を保持する (安定ソート)', () => {
    // どちらも description 一致のみ (score 20) → 定義順 [p, q]
    const p: SearchableService = { id: 'p', label: 'L', description: 'has foo' };
    const q: SearchableService = { id: 'q', label: 'L', description: 'foo here' };
    expect(filterServices([p, q], 'foo')!.map((s) => s.id)).toEqual(['p', 'q']);
    expect(filterServices([q, p], 'foo')!.map((s) => s.id)).toEqual(['q', 'p']);
  });
  it('実データ: "git" は GitHub を返す', () => {
    expect(filterServices(S, 'git')?.map((s) => s.id)).toEqual(['github']);
  });
});
