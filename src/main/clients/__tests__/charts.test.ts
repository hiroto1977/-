import { describe, expect, it } from 'vitest';
import { fetchChartsSnapshot } from '../charts';
import { SNAPSHOT } from '../../../renderer/data/snapshot';

describe('fetchChartsSnapshot', () => {
  it('3 種のチャートを宣言している', async () => {
    const got = await fetchChartsSnapshot({ token: '' });
    expect(got.chartTypes).toEqual(['line', 'pie', 'radar']);
  });

  it('トークンが無くても失敗しない (LOCAL_SERVICES のため)', async () => {
    await expect(fetchChartsSnapshot({ token: '' })).resolves.toBeDefined();
  });

  it('データセット数が 1 件以上', async () => {
    const got = await fetchChartsSnapshot({ token: '' });
    expect(got.datasetCount).toBeGreaterThan(0);
  });

  // main は renderer を import できない (lint:imports) ため値が二重管理になる。
  // ずれると画面と fetcher が食い違うので、テスト側で突き合わせておく。
  it('renderer 側の SNAPSHOT と一致している (二重管理のずれ防止)', async () => {
    const got = await fetchChartsSnapshot({ token: '' });
    expect(got.chartTypes).toEqual([...SNAPSHOT.charts.chartTypes]);
    expect(got.datasetCount).toBe(SNAPSHOT.charts.datasetCount);
    expect(got.note).toBe(SNAPSHOT.charts.note);
  });
});
