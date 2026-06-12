import { describe, expect, it } from 'vitest';
import {
  buildLinuxSnapshot,
  formatUptime,
  fetchLinuxSnapshot,
  readSystem,
  MEMORY_WARN_PCT,
  LOAD_WARN_PCT,
  type RawSystemReadings,
} from '../linux';

const base: RawSystemReadings = {
  hostname: 'host-1',
  platform: 'linux',
  kernel: '6.18.5',
  arch: 'x64',
  uptimeSec: 90_061, // 1日 1時間 1分 1秒
  loadavg: [0.5, 0.4, 0.3],
  cpus: [
    { model: 'Intel Xeon', speedMhz: 2400 },
    { model: 'Intel Xeon', speedMhz: 2400 },
    { model: 'Intel Xeon', speedMhz: 2400 },
    { model: 'Intel Xeon', speedMhz: 2400 },
  ],
  totalMemBytes: 8 * 1024 * 1024 * 1024, // 8192 MB
  freeMemBytes: 4 * 1024 * 1024 * 1024, // 4096 MB
};

describe('formatUptime', () => {
  it('formats days / hours / minutes', () => {
    expect(formatUptime(90_061)).toBe('1日 1時間 1分');
  });
  it('omits days and hours when zero', () => {
    expect(formatUptime(59)).toBe('0分');
    expect(formatUptime(125)).toBe('2分');
  });
  it('shows hours without days', () => {
    expect(formatUptime(3 * 3600 + 30 * 60)).toBe('3時間 30分');
  });
  it('shows days without hours', () => {
    expect(formatUptime(2 * 86400 + 5 * 60)).toBe('2日 5分');
  });
  it('clamps negative input to 0分', () => {
    expect(formatUptime(-100)).toBe('0分');
  });
});

describe('buildLinuxSnapshot', () => {
  it('maps system identity and platform label', () => {
    const s = buildLinuxSnapshot(base);
    expect(s.system).toEqual({
      hostname: 'host-1',
      platform: 'linux',
      platformLabel: 'Linux',
      kernel: '6.18.5',
      arch: 'x64',
      isLinux: true,
    });
  });

  it('computes cpu summary from the first core and count', () => {
    const s = buildLinuxSnapshot(base);
    expect(s.cpu).toEqual({ model: 'Intel Xeon', cores: 4, speedMhz: 2400 });
  });

  it('computes memory in MB and rounded usage percentage', () => {
    const s = buildLinuxSnapshot(base);
    expect(s.memory).toEqual({ totalMb: 8192, freeMb: 4096, usedMb: 4096, usagePct: 50 });
  });

  it('rounds load averages and derives per-core percentage', () => {
    const s = buildLinuxSnapshot({ ...base, loadavg: [2, 1.234, 0.005] });
    expect(s.load.avg1).toBe(2);
    expect(s.load.avg5).toBe(1.23);
    expect(s.load.avg15).toBe(0.01);
    expect(s.load.perCorePct).toBe(50); // 2 / 4 cores = 50%
  });

  it('formats uptime label from seconds', () => {
    expect(buildLinuxSnapshot(base).uptimeLabel).toBe('1日 1時間 1分');
  });

  it('has no notes for a healthy linux host', () => {
    expect(buildLinuxSnapshot(base).notes).toEqual([]);
  });

  it('warns when memory usage reaches the threshold', () => {
    // free = 10% → used 90% ≥ 85%
    const s = buildLinuxSnapshot({
      ...base,
      freeMemBytes: Math.round(0.1 * base.totalMemBytes),
    });
    expect(s.memory.usagePct).toBeGreaterThanOrEqual(MEMORY_WARN_PCT);
    expect(s.notes.some((n) => n.includes('メモリ使用率'))).toBe(true);
  });

  it('warns exactly at the memory threshold (>= boundary)', () => {
    // total 100MB / free 15MB → used 85MB → usagePct == 85 == MEMORY_WARN_PCT.
    const s = buildLinuxSnapshot({
      ...base,
      totalMemBytes: 100 * 1024 * 1024,
      freeMemBytes: 15 * 1024 * 1024,
    });
    expect(s.memory.usagePct).toBe(MEMORY_WARN_PCT);
    expect(s.notes.some((n) => n.includes('メモリ使用率'))).toBe(true);
  });

  it('does not warn just below the memory threshold', () => {
    // used 80% < 85%
    const s = buildLinuxSnapshot({
      ...base,
      freeMemBytes: Math.round(0.2 * base.totalMemBytes),
    });
    expect(s.memory.usagePct).toBeLessThan(MEMORY_WARN_PCT);
    expect(s.notes.some((n) => n.includes('メモリ使用率'))).toBe(false);
  });

  it('warns when per-core load reaches the threshold', () => {
    const s = buildLinuxSnapshot({ ...base, loadavg: [4, 4, 4] }); // 4/4 cores = 100%
    expect(s.load.perCorePct).toBe(LOAD_WARN_PCT);
    expect(s.notes.some((n) => n.includes('CPU 負荷'))).toBe(true);
  });

  it('does not warn for load just below the threshold', () => {
    const s = buildLinuxSnapshot({ ...base, loadavg: [3.8, 0, 0] }); // 95% < 100%
    expect(s.load.perCorePct).toBe(95);
    expect(s.notes.some((n) => n.includes('CPU 負荷'))).toBe(false);
  });

  it('adds a note and unknown label for a non-linux host', () => {
    const s = buildLinuxSnapshot({ ...base, platform: 'darwin' });
    expect(s.system.isLinux).toBe(false);
    expect(s.system.platformLabel).toBe('macOS');
    expect(s.notes.some((n) => n.includes('Linux ではありません'))).toBe(true);
  });

  it('falls back to the raw platform string for unknown platforms', () => {
    const s = buildLinuxSnapshot({ ...base, platform: 'sunos' });
    expect(s.system.platformLabel).toBe('sunos');
  });

  it('handles a host with no cpus and zero memory safely', () => {
    const s = buildLinuxSnapshot({
      ...base,
      cpus: [],
      totalMemBytes: 0,
      freeMemBytes: 0,
      loadavg: [0, 0, 0],
    });
    expect(s.cpu).toEqual({ model: 'unknown', cores: 0, speedMhz: 0 });
    expect(s.memory.usagePct).toBe(0);
    expect(s.load.perCorePct).toBe(0);
  });

  it('is deterministic (same input → same output)', () => {
    expect(buildLinuxSnapshot(base)).toEqual(buildLinuxSnapshot(base));
  });
});

describe('readSystem / fetchLinuxSnapshot (live host)', () => {
  it('reads well-formed values from the os module', () => {
    const r = readSystem();
    expect(typeof r.hostname).toBe('string');
    expect(typeof r.platform).toBe('string');
    expect(r.loadavg).toHaveLength(3);
    expect(r.totalMemBytes).toBeGreaterThan(0);
  });

  it('returns a fully shaped snapshot for the running host', async () => {
    const snap = await fetchLinuxSnapshot({ token: '' });
    expect(snap.system.platform.length).toBeGreaterThan(0);
    expect(snap.memory.totalMb).toBeGreaterThan(0);
    expect(snap.cpu.cores).toBeGreaterThan(0);
    expect(typeof snap.uptimeLabel).toBe('string');
    expect(Array.isArray(snap.notes)).toBe(true);
  });
});
