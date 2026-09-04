import type { FetchContext } from './types';
import { readDevEnv, type DevEnvSnapshot } from './devEnv';
import os from 'node:os';

/**
 * Linux 連携 — システムモニター (読み取り専用)。
 *
 * Electron main プロセスで Node の `os` モジュールからホストの実システム情報を
 * 取得し、1 画面で可視化する: OS / カーネル / アーキ、稼働時間、CPU、ロードアベレージ、
 * メモリ使用率。**読み取り専用**でありシェルコマンドの実行は一切行わない。
 *
 * 値の整形 ({@link buildLinuxSnapshot}) は純関数として分離し、`os` 依存の読み取り
 * ({@link readSystem}) は薄く保つ — これにより整形ロジックを Node 非依存で単体テスト
 * できる。ブラウザ単体ビルドには本クライアントはバンドルされず、snapshot にフォール
 * バックする (web-shim)。
 */

/** システムモニター部分 (buildLinuxSnapshot の純粋な戻り値)。 */
export interface SystemSnapshot {
  readonly system: {
    readonly hostname: string;
    readonly platform: string;
    readonly platformLabel: string;
    readonly kernel: string;
    readonly arch: string;
    readonly isLinux: boolean;
  };
  readonly uptimeSec: number;
  readonly uptimeLabel: string;
  readonly cpu: {
    readonly model: string;
    readonly cores: number;
    readonly speedMhz: number;
  };
  readonly load: {
    readonly avg1: number;
    readonly avg5: number;
    readonly avg15: number;
    /** 直近1分のロードを論理コア数で割った百分率 (100% = コアを使い切り)。 */
    readonly perCorePct: number;
  };
  readonly memory: {
    readonly totalMb: number;
    readonly freeMb: number;
    readonly usedMb: number;
    readonly usagePct: number;
  };
  /** 状況に応じた助言 (高負荷・高メモリ・非 Linux など)。 */
  readonly notes: readonly string[];
}

/** Linux サービスの完全なスナップショット (システムモニター + 開発環境連携)。 */
export interface LinuxSnapshot extends SystemSnapshot {
  readonly devEnv: DevEnvSnapshot;
}

/** `os` から読み取った生の値 (整形前)。テスト時はこれを直接組み立てる。 */
export interface RawSystemReadings {
  readonly hostname: string;
  readonly platform: string;
  readonly kernel: string;
  readonly arch: string;
  readonly uptimeSec: number;
  readonly loadavg: readonly [number, number, number];
  readonly cpus: readonly { readonly model: string; readonly speedMhz: number }[];
  readonly totalMemBytes: number;
  readonly freeMemBytes: number;
}

/** メモリ使用率の警告閾値 (%)。 */
export const MEMORY_WARN_PCT = 85;
/** コアあたり負荷の警告閾値 (%)。 */
export const LOAD_WARN_PCT = 100;

// 表示ラベル・助言文は表現 (StringLiteral)。罠#2 に従い Stryker から除外する。
// Stryker disable all
const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  linux: 'Linux',
  darwin: 'macOS',
  win32: 'Windows',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
};
const MEM_NOTE = 'メモリ使用率が高めです。不要なアプリ・プロセスの終了を検討してください。';
const LOAD_NOTE = 'CPU 負荷が論理コア数を上回っています。重い処理が走っている可能性があります。';
const NON_LINUX_NOTE =
  '現在のホストは Linux ではありません。表示中の live 値は本アプリを実行している OS の値です。';
// Stryker restore all

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const bytesToMb = (bytes: number): number => Math.round(bytes / (1024 * 1024));

/** 稼働時間を「N日 N時間 N分」に整形する (純粋)。 */
export function formatUptime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}日`);
  if (hours > 0) parts.push(`${hours}時間`);
  parts.push(`${mins}分`);
  return parts.join(' ');
}

/** 生の読み取り値から表示用システムスナップショットを組み立てる (純粋・決定論的)。 */
export function buildLinuxSnapshot(r: RawSystemReadings): SystemSnapshot {
  const isLinux = r.platform === 'linux';
  const cores = r.cpus.length;
  const totalMb = bytesToMb(r.totalMemBytes);
  const freeMb = bytesToMb(r.freeMemBytes);
  const usedMb = totalMb - freeMb;
  const usagePct = totalMb > 0 ? round1((usedMb / totalMb) * 100) : 0;
  const perCorePct = cores > 0 ? Math.round((r.loadavg[0] / cores) * 100) : 0;

  const notes: string[] = [];
  if (usagePct >= MEMORY_WARN_PCT) notes.push(MEM_NOTE);
  if (perCorePct >= LOAD_WARN_PCT) notes.push(LOAD_NOTE);
  if (!isLinux) notes.push(NON_LINUX_NOTE);

  return {
    system: {
      hostname: r.hostname,
      platform: r.platform,
      platformLabel: PLATFORM_LABELS[r.platform] ?? r.platform,
      kernel: r.kernel,
      arch: r.arch,
      isLinux,
    },
    uptimeSec: r.uptimeSec,
    uptimeLabel: formatUptime(r.uptimeSec),
    cpu: {
      model: r.cpus[0]?.model ?? 'unknown',
      cores,
      speedMhz: r.cpus[0]?.speedMhz ?? 0,
    },
    load: {
      avg1: round2(r.loadavg[0]),
      avg5: round2(r.loadavg[1]),
      avg15: round2(r.loadavg[2]),
      perCorePct,
    },
    memory: { totalMb, freeMb, usedMb, usagePct },
    notes,
  };
}

/**
 * `os` モジュールからホストの実システム情報を読み取る (薄いアダプタ)。
 *
 * 本関数は `os.*` の値をそのまま転記するランタイム依存コードであり、その値は実行ホスト
 * によって変わる。整形ロジック ({@link buildLinuxSnapshot}) と異なり決定論的に変異を撃墜
 * できない (= mock するだけの高ノイズ・低シグナル) ため、stryker.config.json の方針
 * (IPC handlers / secrets.ts と同様) に従い mutation から除外する。
 */
// Stryker disable all
export function readSystem(): RawSystemReadings {
  const cpus = os.cpus();
  const [avg1, avg5, avg15] = os.loadavg();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    kernel: os.release(),
    arch: os.arch(),
    uptimeSec: os.uptime(),
    loadavg: [avg1 ?? 0, avg5 ?? 0, avg15 ?? 0],
    cpus: cpus.map((c) => ({ model: c.model, speedMhz: c.speed })),
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
  };
}
// Stryker restore all

export async function fetchLinuxSnapshot(_ctx: FetchContext): Promise<LinuxSnapshot> {
  return { ...buildLinuxSnapshot(readSystem()), devEnv: readDevEnv() };
}
