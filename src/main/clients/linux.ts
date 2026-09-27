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
  /**
   * ロードアベレージ。**プラットフォームが提供しない場合は `null`** (0 ではない)。
   *
   * Node の `os.loadavg()` は **Windows では常に `[0, 0, 0]`** を返す
   * (`@types/node/os.d.ts` が「always `[0, 0, 0]`」と明記)。つまり Windows の
   * 0 は「負荷が無い」ではなく **OS に一度も訊いていない**という意味であり、
   * 数として刷ると「ロード 0.00 / コアあたり 0%」を緑で見せることになる。
   * `null` は「算定不能」を表し、画面は「—」を刷って色も付けない。
   */
  readonly load: {
    readonly avg1: number | null;
    readonly avg5: number | null;
    readonly avg15: number | null;
    /** 直近1分のロードを論理コア数で割った百分率 (100% = コアを使い切り)。 */
    readonly perCorePct: number | null;
    /**
     * 算定できなかった理由の文面 (算定できていれば `null`)。
     *
     * **同じ文が `notes` にも入る** —— 別に書き起こすのではなく、この 1 本を
     * 両方の面 (表の直下と「状況メモ」) が読む。文面を 2 か所に書くと必ず
     * 片方が古くなる (パス 62)。
     */
    readonly unavailableNote: string | null;
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

/**
 * このプラットフォームがロードアベレージを提供するか。
 *
 * **Windows は提供しない。** Node の `os.loadavg()` は win32 で OS に問い合わせず
 * **常に `[0, 0, 0]`** を返す —— `@types/node` の doc がそう書いている
 * (「This function is only available on POSIX; on Windows it always returns
 * `[0, 0, 0]`」)。したがって Windows で受け取る 0 は測定値ではなく**既定値**で
 * あり、これを数として刷ると「ロード 0.00 / コアあたり 0%」を緑 (= 健全) で
 * 見せることになる。本アプリは Windows インストーラを出荷しているので、
 * これは仮定ではなく **Windows 利用者の全員に起きる**。
 *
 * POSIX 系 (linux / darwin / freebsd / …) は `getloadavg(3)` があるので提供する。
 * 未知のプラットフォームは「提供する」側に倒す —— 0 を刷るより、実測が
 * 通る方が既定として安全 (提供しない OS が新たに現れたらここに足す)。
 */
export function loadAvgSupported(platform: string): boolean {
  return platform !== 'win32';
}

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
/** ロードアベレージを OS が提供しない場合の断り書き (Windows)。 */
const NO_LOADAVG_NOTE =
  'このプラットフォームはロードアベレージを提供しないため、算定していません (Windows は OS としてロードアベレージを持たず、Node は常に 0 を返します)。メモリ・CPU・稼働時間は実測値です。';
/** 論理コア数が読めずコアあたり負荷を割れない場合の断り書き。 */
const NO_CORES_NOTE =
  '論理コア数を取得できなかったため、コアあたりの負荷は算定していません (ロードアベレージそのものは実測値です)。';
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
  // **プラットフォームがロードアベレージを持たないなら、0 ではなく算定不能。**
  // ここで `platform` から決めるのは、この判定を純関数の中に置いて単体テスト・
  // 変異測定の対象にするため (`readSystem` は Stryker 対象外)。
  const loadAvail = loadAvgSupported(r.platform);
  const avg1 = loadAvail ? round2(r.loadavg[0]) : null;
  const perCorePct = loadAvail && cores > 0 ? Math.round((r.loadavg[0] / cores) * 100) : null;

  // 理由は 1 本だけ作り、表の直下と「状況メモ」の両方がこれを読む。
  const unavailableNote = !loadAvail ? NO_LOADAVG_NOTE : cores === 0 ? NO_CORES_NOTE : null;

  const notes: string[] = [];
  if (usagePct >= MEMORY_WARN_PCT) notes.push(MEM_NOTE);
  // 算定不能を警告に化けさせない —— `?? 0` で書くと 0 が閾値比較に入る。
  if (perCorePct !== null && perCorePct >= LOAD_WARN_PCT) notes.push(LOAD_NOTE);
  if (unavailableNote !== null) notes.push(unavailableNote);
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
      avg1,
      avg5: loadAvail ? round2(r.loadavg[1]) : null,
      avg15: loadAvail ? round2(r.loadavg[2]) : null,
      perCorePct,
      unavailableNote,
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
