/**
 * **実物の fetcher が返す値で確かめる** (パス 265)。
 *
 * 上の `shared/__tests__/fundingLinkSource.test.ts` は規則を測る。ここは
 * **デスクトップの fetcher を実際に呼んで**、見本の Map を渡している今の実装が
 * `sample` を返すことを留める。Phase 6 で実 API が入り `isMock: false` に
 * なったら `linked` へ変わるべきで、そのときこの検査は**意図して**落ちる。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/service-hub-funding-linkage', getVersion: () => '0.0.0' },
  shell: { openExternal: () => Promise.resolve() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const { buildFundingSnapshot, fetchFundingSnapshot } = await import('../funding');

describe('見本を返す fetcher は連携を名乗らない', () => {
  it('fetchFundingSnapshot は isMock を立てたまま sample を返す', async () => {
    const snap = await fetchFundingSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
    // 見本の Map は渡されているので「持っている」は真 —— 描く判断はこれで変わらない。
    expect(snap.accountingLinked).toBe(true);
    expect(snap.stocksLinked).toBe(true);
    // だが出どころは連携ではない。ここが 'linked' に戻ると、何も繋いでいない
    // 利用者の画面に「✅ 連携中」が戻る。
    expect(snap.accountingSource).toBe('sample');
    expect(snap.stocksSource).toBe('sample');
  });

  it('isMock を降ろせば linked になる (対照)', () => {
    const snap = buildFundingSnapshot([], {
      accounting: new Map([['2026-01', 1_000_000]]),
      portfolio: new Map([['2026-01', 500_000]]),
      isMock: false,
    });
    expect(snap.accountingSource).toBe('linked');
    expect(snap.stocksSource).toBe('linked');
  });

  it('Map が空なら none (見本かどうかに関わらず)', () => {
    const empty = buildFundingSnapshot([], { isMock: true });
    expect(empty.accountingSource).toBe('none');
    expect(empty.stocksSource).toBe('none');
    expect(empty.accountingLinked).toBe(false);
    expect(empty.stocksLinked).toBe(false);
  });
});
