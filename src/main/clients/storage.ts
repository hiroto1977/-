import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FetchContext } from './types';

/**
 * ストレージ最適化 — PC ストレージ分析 + 最適化推奨 (Phase 6 で live 化)。
 *
 * Electron main プロセスで `fs.statfs` / ディレクトリ走査 / `os` から
 * **この端末の実測値**を取得する (読み取り専用・削除等の実行は一切しない):
 *
 * - ディスク: マウントごとの総量 / 空き (Linux は `/proc/mounts` の実ファイル
 *   システムのみ、他 OS はルートとホーム)。
 * - 大容量フォルダ: ホーム直下のフォルダを再帰測定 (走査上限つき)。
 * - クリーンアップ推奨: **実測した**キャッシュ / ゴミ箱 / ダウンロードの
 *   サイズから組み立てる。測っていない対象の解放見込みは作らない。
 * - メモリ: `os.totalmem` / `os.freemem` の実値。
 *
 * **測れない物は数にしない** (linux.ts のロードアベレージと同じ規律):
 * フラグメント率と起動時間は、サブプロセス実行が禁止されている本リポジトリ
 * では取得手段が無い (defrag 分析 / systemd-analyze はどちらも外部コマンド)。
 * 0 と刷ると「健全」と読めるため `null` (= 算定不能) を返し、画面は「—」を出す。
 * 実行中プロセス数も Linux の `/proc` でしか数えられないので他 OS では `null`。
 *
 * 値の整形 ({@link buildStorageSnapshot}) は純関数として分離し、fs / os 依存の
 * 読み取り ({@link readStorageReadings}) は薄く保つ。ブラウザ単体ビルドには
 * 本クライアントはバンドルされず、web-shim が `not_implemented` を返して
 * 画面は同梱サンプルのままになる (linux と同じ扱い)。
 */

export interface CleanupTask {
  readonly id: string;
  /** 表示名 (例: "キャッシュフォルダのクリーンアップ") */
  readonly title: string;
  /** 解放見込み容量 (MB)。実測できない対象は 0 (= 画面では「—」) */
  readonly potentialFreeMb: number;
  /** 難易度 */
  readonly difficulty: 'safe' | 'caution' | 'manual';
  /** 本サービスは読み取り専用のため常に `false` (実行は利用者が手動で行う)。 */
  readonly executable: boolean;
  /** ユーザーが行う具体的な手順 */
  readonly howTo: string;
}

export interface StorageSnapshot {
  readonly disks: ReadonlyArray<{
    readonly mount: string;
    readonly label: string;
    readonly totalGb: number;
    readonly usedGb: number;
    readonly freeGb: number;
    readonly usagePct: number;
  }>;
  readonly largeFolders: ReadonlyArray<{
    readonly path: string;
    readonly sizeGb: number;
    readonly fileCount: number;
    readonly category: 'system' | 'downloads' | 'cache' | 'user' | 'app';
  }>;
  readonly cleanupTasks: ReadonlyArray<CleanupTask>;
  readonly performance: {
    /** 測定手段が無いため常に `null` (算定不能)。0 は「断片化なし」の嘘になる。 */
    readonly fragmentationPct: number | null;
    /** 測定手段が無いため常に `null` (算定不能)。 */
    readonly startupSec: number | null;
    /** Linux の `/proc` で数えた実数。他 OS では `null` (算定不能)。 */
    readonly runningProcesses: number | null;
    readonly memoryUsedGb: number;
    readonly memoryTotalGb: number;
  };
  readonly recommendations: ReadonlyArray<string>;
}

/** ディスク使用率の危険域 (%)。画面の色分け (StoragePage) と同じ値。 */
export const DISK_DANGER_PCT = 90;
/** ディスク使用率の警告域 (%)。画面の色分け (StoragePage) と同じ値。 */
export const DISK_WARN_PCT = 75;
/** メモリ使用率の助言閾値 (%)。StoragePage の MEMORY_WARN_PCT と同じ値。 */
export const STORAGE_MEMORY_WARN_PCT = 80;
/** これ未満のキャッシュはクリーンアップ候補にしない (MB 換算の誤差より小さい)。 */
export const CACHE_CLEANUP_MIN_BYTES = 100 * 1024 * 1024;
/** これ未満のゴミ箱は候補にしない。 */
export const TRASH_CLEANUP_MIN_BYTES = 1 * 1024 * 1024;
/** ダウンロード整理を提案する下限 (中身は利用者のファイルなので解放量は見積もらない)。 */
export const DOWNLOADS_CLEANUP_MIN_BYTES = 1024 * 1024 * 1024;
/** 「容量が大きいフォルダ」として数える下限と表示件数。 */
export const LARGE_FOLDER_MIN_BYTES = 10 * 1024 * 1024;
export const LARGE_FOLDER_TOP_N = 8;

/** statfs から読んだ 1 マウント分の生値。 */
export interface RawDiskReading {
  readonly mount: string;
  readonly label: string;
  readonly totalBytes: number;
  /** 利用者が実際に使える空き (bavail ベース)。 */
  readonly freeBytes: number;
}

/** 測定済みフォルダ 1 件分の生値。 */
export interface RawFolderReading {
  readonly path: string;
  readonly sizeBytes: number;
  readonly fileCount: number;
  readonly category: 'system' | 'downloads' | 'cache' | 'user' | 'app';
  /** 走査上限に達して打ち切った (サイズは下限値) か。 */
  readonly truncated: boolean;
}

/** buildStorageSnapshot への入力 (すべて読み取り済みの生データ)。 */
export interface RawStorageReadings {
  readonly platform: string;
  readonly disks: readonly RawDiskReading[];
  readonly folders: readonly RawFolderReading[];
  /** ゴミ箱の中身の実測 (測れなければ `null`)。 */
  readonly trashSizeBytes: number | null;
  readonly totalMemBytes: number;
  readonly freeMemBytes: number;
  /** 数えられた場合のみ数。他は `null`。 */
  readonly processCount: number | null;
}

// 表示ラベル・助言文は表現 (StringLiteral)。罠#2 に従い Stryker から除外する。
// Stryker disable all
const CACHE_TASK_TITLE = 'キャッシュフォルダのクリーンアップ';
const CACHE_TASK_HOWTO_SUFFIX =
  '対象アプリを終了してから中身を削除してください（フォルダ自体は削除しないこと）';
const TRASH_TASK_TITLE = 'ゴミ箱を空にする';
const TRASH_TASK_HOWTO = 'ファイルマネージャーのゴミ箱から「空にする」を実行してください';
const DOWNLOADS_TASK_TITLE = 'ダウンロードフォルダの整理';
const DOWNLOADS_TASK_HOWTO =
  '中身は利用者のファイルです。内容を確認し、不要な物だけを削除してください（解放できる量は内容によります）';
const UNMEASURED_NOTE =
  'フラグメント率と起動時間は、この環境では測定手段が無いため表示していません（測っていない値を 0 とは表示しません）';
const TRUNCATED_NOTE =
  '一部のフォルダは走査上限に達したため、サイズは概算（実際より小さい下限値）です';
const HEALTHY_NOTE = 'ディスク・メモリに大きな問題は見つかりませんでした';
// Stryker restore all

const bytesToGb = (bytes: number): number => Math.round((bytes / 1024 ** 3) * 100) / 100;
const bytesToMb = (bytes: number): number => Math.round(bytes / (1024 * 1024));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** ホーム直下フォルダの分類 (名前だけから決まる純関数)。 */
export function classifyFolderCategory(name: string): RawFolderReading['category'] {
  if (name === 'Downloads' || name === 'ダウンロード') return 'downloads';
  if (name === '.cache') return 'cache';
  if (name.startsWith('.')) return 'app';
  return 'user';
}

/**
 * `/proc/mounts` の中身から、実ディスクのマウントだけを mount → label で返す純関数。
 * tmpfs 等の疑似ファイルシステムと、スナップ等のパッケージ用マウントは
 * 「ディスク使用状況」ではないので除く。
 */
export function parseProcMounts(text: string): ReadonlyArray<{ mount: string; label: string }> {
  const REAL_FS = new Set([
    'ext2',
    'ext3',
    'ext4',
    'xfs',
    'btrfs',
    'f2fs',
    'vfat',
    'exfat',
    'ntfs',
    'ntfs3',
    'zfs',
  ]);
  const out: { mount: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 3) continue;
    const mount = (fields[1] ?? '').replace(/\\040/g, ' ').replace(/\\011/g, '\t');
    const fstype = fields[2] ?? '';
    if (!REAL_FS.has(fstype)) continue;
    if (mount.startsWith('/snap/') || mount === '/snap') continue;
    if (seen.has(mount)) continue;
    seen.add(mount);
    out.push({ mount, label: mount === '/' ? 'システム' : path.basename(mount) || mount });
  }
  return out;
}

/** 生の読み取り値から表示用スナップショットを組み立てる (純粋・決定論的)。 */
export function buildStorageSnapshot(r: RawStorageReadings): StorageSnapshot {
  const disks = r.disks
    .filter((d) => d.totalBytes > 0)
    .map((d) => {
      const totalGb = bytesToGb(d.totalBytes);
      const freeGb = bytesToGb(d.freeBytes);
      const usedGb = Math.max(0, round1(totalGb - freeGb));
      const usagePct = round1(((d.totalBytes - d.freeBytes) / d.totalBytes) * 100);
      return { mount: d.mount, label: d.label, totalGb, usedGb, freeGb, usagePct };
    });

  const largeFolders = r.folders
    .filter((f) => f.sizeBytes >= LARGE_FOLDER_MIN_BYTES)
    .sort((a, b) => b.sizeBytes - a.sizeBytes || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, LARGE_FOLDER_TOP_N)
    .map((f) => ({
      path: f.path,
      sizeGb: bytesToGb(f.sizeBytes),
      fileCount: f.fileCount,
      category: f.category,
    }));

  const cleanupTasks: CleanupTask[] = [];
  const cacheFolders = r.folders.filter((f) => f.category === 'cache');
  const cacheBytes = cacheFolders.reduce((sum, f) => sum + f.sizeBytes, 0);
  if (cacheBytes >= CACHE_CLEANUP_MIN_BYTES) {
    cleanupTasks.push({
      id: 'cache',
      title: CACHE_TASK_TITLE,
      potentialFreeMb: bytesToMb(cacheBytes),
      difficulty: 'caution',
      executable: false,
      howTo: `${cacheFolders.map((f) => f.path).join(' / ')}: ${CACHE_TASK_HOWTO_SUFFIX}`,
    });
  }
  if (r.trashSizeBytes !== null && r.trashSizeBytes >= TRASH_CLEANUP_MIN_BYTES) {
    cleanupTasks.push({
      id: 'trash',
      title: TRASH_TASK_TITLE,
      potentialFreeMb: bytesToMb(r.trashSizeBytes),
      difficulty: 'safe',
      executable: false,
      howTo: TRASH_TASK_HOWTO,
    });
  }
  const downloads = r.folders.find((f) => f.category === 'downloads');
  if (downloads !== undefined && downloads.sizeBytes >= DOWNLOADS_CLEANUP_MIN_BYTES) {
    cleanupTasks.push({
      id: 'downloads',
      title: DOWNLOADS_TASK_TITLE,
      potentialFreeMb: 0,
      difficulty: 'caution',
      executable: false,
      howTo: `${downloads.path}: ${DOWNLOADS_TASK_HOWTO}`,
    });
  }

  const totalMemGb = bytesToGb(r.totalMemBytes);
  const usedMemGb = Math.max(0, round1(totalMemGb - bytesToGb(r.freeMemBytes)));
  const memoryUsagePct = totalMemGb > 0 ? (usedMemGb / totalMemGb) * 100 : 0;

  const recommendations: string[] = [];
  for (const d of disks) {
    if (d.usagePct >= DISK_DANGER_PCT) {
      recommendations.push(
        `${d.mount} の使用率が ${d.usagePct.toFixed(1)}% です。空き容量の確保を最優先してください`,
      );
    } else if (d.usagePct >= DISK_WARN_PCT) {
      recommendations.push(
        `${d.mount} の使用率が ${d.usagePct.toFixed(1)}% です。不要なファイルの整理を検討してください`,
      );
    }
  }
  const largest = largeFolders[0];
  if (largest !== undefined) {
    recommendations.push(`最も大きいフォルダは ${largest.path}（${largest.sizeGb.toFixed(1)} GB）です`);
  }
  if (cacheBytes >= DOWNLOADS_CLEANUP_MIN_BYTES) {
    recommendations.push(
      `キャッシュが ${(cacheBytes / 1024 ** 3).toFixed(1)} GB あります。クリーンアップ候補です`,
    );
  }
  if (memoryUsagePct >= STORAGE_MEMORY_WARN_PCT) {
    recommendations.push(
      `メモリ使用率が ${Math.round(memoryUsagePct)}% です。不要なアプリ・プロセスの終了を検討してください`,
    );
  }
  if (r.folders.some((f) => f.truncated)) recommendations.push(TRUNCATED_NOTE);
  recommendations.push(UNMEASURED_NOTE);
  if (recommendations.length === 1) recommendations.unshift(HEALTHY_NOTE);

  return {
    disks,
    largeFolders,
    cleanupTasks,
    performance: {
      fragmentationPct: null,
      startupSec: null,
      runningProcesses: r.processCount,
      memoryUsedGb: usedMemGb,
      memoryTotalGb: totalMemGb,
    },
    recommendations,
  };
}

/**
 * fs / os からホストの実ストレージ情報を読み取る (薄いアダプタ)。
 *
 * 値は実行ホストによって変わるため決定論的に変異を撃墜できない
 * (= linux.ts の readSystem と同じ理由) ため mutation から除外する。
 * 走査はエントリ数の上限で打ち切り、打ち切ったら `truncated` を立てる
 * (小さい方へ黙って倒さない)。
 */
// Stryker disable all
const WALK_ENTRY_BUDGET = 60_000;

function measureDir(
  root: string,
  budget: { remaining: number },
): { sizeBytes: number; fileCount: number; truncated: boolean } {
  let sizeBytes = 0;
  let fileCount = 0;
  let truncated = false;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (budget.remaining <= 0) {
        truncated = true;
        break;
      }
      budget.remaining -= 1;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          sizeBytes += fs.statSync(full).size;
          fileCount += 1;
        } catch {
          /* 読めないファイルは数えない */
        }
      }
    }
    if (truncated) break;
  }
  return { sizeBytes, fileCount, truncated };
}

export function readStorageReadings(): RawStorageReadings {
  const platform = os.platform();
  const home = os.homedir();

  const disks: RawDiskReading[] = [];
  const diskCandidates: { mount: string; label: string }[] = [];
  if (platform === 'linux') {
    try {
      diskCandidates.push(...parseProcMounts(fs.readFileSync('/proc/mounts', 'utf8')));
    } catch {
      diskCandidates.push({ mount: '/', label: 'システム' });
    }
  } else {
    const root = path.parse(home).root;
    diskCandidates.push({ mount: root, label: 'システム' });
    if (home !== root) diskCandidates.push({ mount: home, label: 'ホーム' });
  }
  for (const c of diskCandidates) {
    try {
      const st = fs.statfsSync(c.mount);
      const totalBytes = st.blocks * st.bsize;
      if (totalBytes <= 0) continue;
      disks.push({
        mount: c.mount,
        label: c.label,
        totalBytes,
        freeBytes: st.bavail * st.bsize,
      });
    } catch {
      /* 読めないマウントは載せない */
    }
  }

  const budget = { remaining: WALK_ENTRY_BUDGET };
  const folders: RawFolderReading[] = [];
  try {
    for (const entry of fs.readdirSync(home, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const full = path.join(home, entry.name);
      const m = measureDir(full, budget);
      folders.push({
        path: full,
        sizeBytes: m.sizeBytes,
        fileCount: m.fileCount,
        category: classifyFolderCategory(entry.name),
        truncated: m.truncated,
      });
    }
  } catch {
    /* ホームが読めなければフォルダ一覧は空 */
  }

  let trashSizeBytes: number | null = null;
  const trashDir =
    platform === 'linux'
      ? path.join(home, '.local', 'share', 'Trash', 'files')
      : platform === 'darwin'
        ? path.join(home, '.Trash')
        : null;
  if (trashDir !== null && fs.existsSync(trashDir)) {
    trashSizeBytes = measureDir(trashDir, budget).sizeBytes;
  }

  let processCount: number | null = null;
  if (platform === 'linux') {
    try {
      processCount = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)).length;
    } catch {
      processCount = null;
    }
  }

  return {
    platform,
    disks,
    folders,
    trashSizeBytes,
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
    processCount,
  };
}
// Stryker restore all

export async function fetchStorageSnapshot(_ctx: FetchContext): Promise<StorageSnapshot> {
  return buildStorageSnapshot(readStorageReadings());
}
