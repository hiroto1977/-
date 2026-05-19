import type { FetchContext } from './types';

/**
 * ストレージ最適化 — PC ストレージ分析 + 最適化推奨 (snapshot 専用)。
 *
 * NEC LAVIE FAQ (https://faq.nec-lavie.jp/fa/qa/web/knowledge21797.html)
 * 等で紹介される一般的なストレージ最適化手順をベースに、PC のディスク
 * 使用状況 / 大容量フォルダ / クリーンアップ推奨を 1 画面で可視化する。
 *
 * 実 OS 統計は Electron main プロセスで `os` / `fs` API 経由で取得する
 * Phase 6 で実装予定。本 fetcher はそれまで static stub。標準的な PC
 * 状態を示すサンプル値を返す。
 */

export interface CleanupTask {
  readonly id: string;
  /** 表示名 (例: "Windows.old フォルダの削除") */
  readonly title: string;
  /** 解放見込み容量 (MB) */
  readonly potentialFreeMb: number;
  /** 難易度 */
  readonly difficulty: 'safe' | 'caution' | 'manual';
  /** Phase 6 で auto 実行に対応した時 true。現フェーズは常に false。
   *  literal でなく boolean なのは、`true` へ切替時に型シグネチャ
   *  破壊的変更を不要にするため (PR #6 R1 #2)。 */
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
    readonly fragmentationPct: number;
    readonly startupSec: number;
    readonly runningProcesses: number;
    readonly memoryUsedGb: number;
    readonly memoryTotalGb: number;
  };
  readonly recommendations: ReadonlyArray<string>;
}

// Stryker disable next-line all
const STUB: StorageSnapshot = {
  disks: [],
  largeFolders: [],
  cleanupTasks: [],
  performance: {
    fragmentationPct: 0,
    startupSec: 0,
    runningProcesses: 0,
    memoryUsedGb: 0,
    memoryTotalGb: 0,
  },
  recommendations: [],
};

export async function fetchStorageSnapshotImpl(_ctx: FetchContext): Promise<StorageSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchStorageSnapshot(ctx: FetchContext): Promise<StorageSnapshot> {
  return fetchStorageSnapshotImpl(ctx);
}
