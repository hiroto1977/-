import { describe, expect, it } from 'vitest';
import {
  generateRecommendations,
  type StorageRecsInput,
} from '../storageRecommendations';

const HEALTHY: StorageRecsInput = {
  disks: [
    { mount: 'C:', usagePct: 50 },
    { mount: 'D:', usagePct: 30 },
  ],
  cleanupTasks: [],
  performance: {
    fragmentationPct: 5,
    startupSec: 20,
    memoryUsedGb: 6,
    memoryTotalGb: 16,
  },
};

describe('generateRecommendations', () => {
  it('returns empty list for a healthy system', () => {
    expect(generateRecommendations(HEALTHY)).toEqual([]);
  });

  it('flags disks at >= 75% usage with the largest cleanup task', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      disks: [{ mount: 'C:', usagePct: 75.6 }],
      cleanupTasks: [
        { title: 'Windows.old フォルダの削除', potentialFreeMb: 32_000 },
        { title: '一時ファイル削除', potentialFreeMb: 14_500 },
        { title: 'ゴミ箱を空にする', potentialFreeMb: 4_200 },
      ],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toContain('C:');
    expect(recs[0]).toContain('75.6%');
    expect(recs[0]).toContain('Windows.old');
    expect(recs[0]).toContain('31.3 GB');
  });

  it('uses generic message at >= 75% when no cleanup tasks are available', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      disks: [{ mount: 'C:', usagePct: 80 }],
      cleanupTasks: [],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toContain('75% 超過');
  });

  it('escalates to "容量逼迫" at >= 90% usage', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      disks: [{ mount: 'C:', usagePct: 95.2 }],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toContain('容量逼迫');
    expect(recs[0]).toContain('95.2%');
    expect(recs[0]).not.toContain('Windows.old');
  });

  it('flags HDD fragmentation at >= 10%', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      performance: { ...HEALTHY.performance, fragmentationPct: 12.4 },
    });
    expect(recs.some((r) => r.includes('フラグメント率 12.4%'))).toBe(true);
  });

  it('does NOT flag fragmentation below 10%', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      performance: { ...HEALTHY.performance, fragmentationPct: 9.9 },
    });
    expect(recs.some((r) => r.includes('フラグメント'))).toBe(false);
  });

  it('flags slow startup at > 30 seconds', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      performance: { ...HEALTHY.performance, startupSec: 38 },
    });
    expect(recs.some((r) => r.includes('スタートアップ 38 秒'))).toBe(true);
  });

  it('does NOT flag startup at exactly 30 seconds', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      performance: { ...HEALTHY.performance, startupSec: 30 },
    });
    expect(recs.some((r) => r.includes('スタートアップ'))).toBe(false);
  });

  it('flags memory pressure at >= 75%', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      performance: { ...HEALTHY.performance, memoryUsedGb: 12, memoryTotalGb: 16 },
    });
    expect(recs.some((r) => r.includes('メモリ使用率 75%'))).toBe(true);
  });

  it('handles memoryTotalGb=0 without dividing by zero', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      performance: { ...HEALTHY.performance, memoryUsedGb: 0, memoryTotalGb: 0 },
    });
    expect(recs.some((r) => r.includes('メモリ'))).toBe(false);
  });

  it('combines multiple issues into one list', () => {
    const recs = generateRecommendations({
      disks: [
        { mount: 'C:', usagePct: 75.6 },
        { mount: 'D:', usagePct: 95 },
      ],
      cleanupTasks: [
        { title: 'Windows.old フォルダの削除', potentialFreeMb: 32_000 },
      ],
      performance: {
        fragmentationPct: 12.4,
        startupSec: 38,
        memoryUsedGb: 14,
        memoryTotalGb: 16,
      },
    });
    expect(recs).toHaveLength(5);
    expect(recs.find((r) => r.includes('C:') && r.includes('Windows.old'))).toBeDefined();
    expect(recs.find((r) => r.includes('D:') && r.includes('容量逼迫'))).toBeDefined();
    expect(recs.find((r) => r.includes('フラグメント'))).toBeDefined();
    expect(recs.find((r) => r.includes('スタートアップ'))).toBeDefined();
    expect(recs.find((r) => r.includes('メモリ'))).toBeDefined();
  });

  it('ignores cleanup tasks with potentialFreeMb=0 when selecting the top', () => {
    const recs = generateRecommendations({
      ...HEALTHY,
      disks: [{ mount: 'C:', usagePct: 78 }],
      cleanupTasks: [
        { title: 'デフラグ', potentialFreeMb: 0 },
        { title: 'ゴミ箱', potentialFreeMb: 4_200 },
      ],
    });
    expect(recs[0]).toContain('ゴミ箱');
    expect(recs[0]).not.toContain('デフラグ');
  });
});
