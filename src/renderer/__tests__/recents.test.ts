import { describe, it, expect } from 'vitest';
import { pushRecent, toggleFavorite, keepKnown, RECENTS_MAX } from '../recents';
import type { ServiceId } from '../../shared/serviceId';

// 実在の ServiceId を使う (キャスト不要・現実的)。
const A = 'github';
const B = 'stocks';
const C = 'gmail';
const D = 'notion';
const E = 'slack';
const F = 'canva';

describe('pushRecent', () => {
  it('空リストへ追加すると 1 件になる', () => {
    expect(pushRecent([], A)).toEqual([A]);
  });

  it('新しいものを先頭に置く', () => {
    expect(pushRecent([A], B)).toEqual([B, A]);
  });

  it('既存 id は重複させず先頭へ移動する', () => {
    expect(pushRecent([A, B, C, D], C)).toEqual([C, A, B, D]);
  });

  it('最大件数で切り詰める', () => {
    expect(pushRecent([A, B, C, D, E], F, 5)).toEqual([F, A, B, C, D]);
  });

  it('既定の最大件数は RECENTS_MAX', () => {
    const list: ServiceId[] = [A, B, C, D, E];
    const r = pushRecent(list, F);
    expect(r).toHaveLength(RECENTS_MAX);
    expect(r[0]).toBe(F);
  });

  it('元の配列を変更しない (純粋)', () => {
    const list: ServiceId[] = [A];
    pushRecent(list, B);
    expect(list).toEqual([A]);
  });
});

describe('toggleFavorite', () => {
  it('無ければ末尾に追加', () => {
    expect(toggleFavorite([A], B)).toEqual([A, B]);
  });

  it('あれば外す', () => {
    expect(toggleFavorite([A, B, C], B)).toEqual([A, C]);
  });

  it('空からの追加', () => {
    expect(toggleFavorite([], A)).toEqual([A]);
  });

  it('唯一の要素を外すと空', () => {
    expect(toggleFavorite([A], A)).toEqual([]);
  });

  it('元の配列を変更しない (純粋)', () => {
    const list: ServiceId[] = [A];
    toggleFavorite(list, B);
    expect(list).toEqual([A]);
  });
});

describe('keepKnown', () => {
  it('既知の id だけ順序保持で残す', () => {
    const known = new Set<ServiceId>([A, C]);
    expect(keepKnown([A, B, C], known)).toEqual([A, C]);
  });

  it('全て未知なら空', () => {
    expect(keepKnown([A, B], new Set<ServiceId>())).toEqual([]);
  });

  it('全て既知ならそのまま (順序保持)', () => {
    const known = new Set<ServiceId>([A, B]);
    expect(keepKnown([B, A], known)).toEqual([B, A]);
  });
});
