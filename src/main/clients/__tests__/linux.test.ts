import { describe, expect, it } from 'vitest';
import {
  buildLinuxSnapshot,
  formatUptime,
  fetchLinuxSnapshot,
  readSystem,
  MEMORY_WARN_PCT,
  LOAD_WARN_PCT,
  loadAvgSupported,
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

  it('handles a host with no cpus and zero memory safely (コアあたりは算定不能)', () => {
    // **この検査は 2026-09-09 まで `perCorePct` を 0 に留めていた** ——
    // 「safely」と名前に書いたうえで、割れないものを 0 として仕様に固定していた。
    // コア数が読めなければコアあたり負荷は割れないので `null` が正しい。
    const s = buildLinuxSnapshot({
      ...base,
      cpus: [],
      totalMemBytes: 0,
      freeMemBytes: 0,
      loadavg: [0, 0, 0],
    });
    expect(s.cpu).toEqual({ model: 'unknown', cores: 0, speedMhz: 0 });
    expect(s.memory.usagePct).toBe(0);
    expect(s.load.perCorePct).toBeNull();
    // ロードアベレージそのものは linux では実測値なので数で残る。
    expect(s.load.avg1).toBe(0);
    expect(s.load.unavailableNote).toContain('論理コア数を取得できなかった');
    expect(s.notes).toContain(s.load.unavailableNote);
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

/**
 * **ロードアベレージを提供しない OS で、0 を測定値として出さない。**
 *
 * Node の `os.loadavg()` は **Windows では OS に問い合わせず常に `[0, 0, 0]`** を
 * 返す (`@types/node/os.d.ts`: 「on Windows it always returns `[0, 0, 0]`」)。
 * 本アプリは `release.yml` で Windows インストーラを出荷しているので、
 * これは仮定ではなく **Windows 利用者の全員に起きる**。
 *
 * 2026-09-09 まで、その 0 は:
 *
 * | 面 | 出方 |
 * | --- | --- |
 * | 「ロード (1分)」タイル | `0.00` を **緑** (`positive={perCorePct < 100}`) |
 * | ロードアベレージ表 コアあたり | `0%` を **緑・太字** |
 * | 直近 5 分 / 15 分 | `0.00` |
 * | 状況メモ | 「表示中の live 値は本アプリを実行している OS の値です」 |
 *
 * 最後の 1 行が効いている —— アプリは**自分が作った既定値を「あなたの OS の
 * 実測値だ」と保証していた**。
 */
describe('ロードアベレージを提供しないプラットフォーム', () => {
  it('★ loadAvgSupported は win32 だけを「提供しない」と答える', () => {
    expect(loadAvgSupported('win32')).toBe(false);
    // POSIX 系は getloadavg(3) を持つ
    expect(loadAvgSupported('linux')).toBe(true);
    expect(loadAvgSupported('darwin')).toBe(true);
    expect(loadAvgSupported('freebsd')).toBe(true);
    // 未知のプラットフォームは実測が通る側へ倒す (0 を刷るより安全)
    expect(loadAvgSupported('sunos')).toBe(true);
  });

  it('★ Windows では 3 区間とコアあたりを算定不能にする (0 を出さない)', () => {
    // Node が返す実際の値 —— 常に [0, 0, 0]
    const s = buildLinuxSnapshot({ ...base, platform: 'win32', loadavg: [0, 0, 0] });
    expect(s.load.avg1).toBeNull();
    expect(s.load.avg5).toBeNull();
    expect(s.load.avg15).toBeNull();
    expect(s.load.perCorePct).toBeNull();
  });

  it('★ 理由を述べる (「負荷が無い」と読ませない)', () => {
    const s = buildLinuxSnapshot({ ...base, platform: 'win32', loadavg: [0, 0, 0] });
    expect(s.load.unavailableNote).not.toBeNull();
    expect(s.load.unavailableNote).toContain('ロードアベレージを提供しない');
    expect(s.load.unavailableNote).toContain('Node は常に 0 を返します');
    // メモリ・CPU・稼働時間は Windows でも実測できるので、そこは実測と述べる
    expect(s.load.unavailableNote).toContain('メモリ・CPU・稼働時間は実測値です');
  });

  it('★ 理由は 1 本しか無い (表の直下と状況メモが同じ文を読む)', () => {
    const s = buildLinuxSnapshot({ ...base, platform: 'win32', loadavg: [0, 0, 0] });
    // 同じ文が両方に出ること = 写しではないこと。文面を 2 か所に書けばここが落ちる。
    expect(s.notes).toContain(s.load.unavailableNote);
    expect(s.notes.filter((n) => n === s.load.unavailableNote)).toHaveLength(1);
  });

  it('★ 算定不能を「高負荷」警告に化けさせない (どちらの向きにも)', () => {
    // Windows の loadavg が 0 でなく大きい値だったとしても (ありえないが)
    // 提供されない以上、警告も出さない —— `?? 0` や `!== null` の抜けを留める。
    const s = buildLinuxSnapshot({ ...base, platform: 'win32', loadavg: [99, 99, 99] });
    expect(s.load.perCorePct).toBeNull();
    expect(s.notes).not.toContain(
      'CPU 負荷が論理コア数を上回っています。重い処理が走っている可能性があります。',
    );
  });

  it('★ 対照: POSIX では 3 区間とも数で出て、断り書きは出ない', () => {
    const s = buildLinuxSnapshot({ ...base, platform: 'darwin', loadavg: [2, 1.5, 1] });
    expect(s.load.avg1).toBe(2);
    expect(s.load.avg5).toBe(1.5);
    expect(s.load.avg15).toBe(1);
    expect(s.load.perCorePct).toBe(50); // 2 / 4 cores
    expect(s.load.unavailableNote).toBeNull();
  });

  it('★ 対照: POSIX の高負荷は今も警告する (警告そのものが生きている)', () => {
    const s = buildLinuxSnapshot({ ...base, loadavg: [4, 4, 4] }); // 4/4 = 100%
    expect(s.load.perCorePct).toBe(LOAD_WARN_PCT);
    expect(s.notes.some((n) => n.includes('論理コア数を上回っています'))).toBe(true);
  });

  it('★ 実行ホストで実際に整合する (この検査が走っている OS で)', () => {
    const r = readSystem();
    const s = buildLinuxSnapshot(r);
    if (loadAvgSupported(r.platform)) {
      expect(s.load.avg1).not.toBeNull();
    } else {
      expect(s.load.avg1).toBeNull();
      expect(s.load.unavailableNote).not.toBeNull();
    }
  });
});
