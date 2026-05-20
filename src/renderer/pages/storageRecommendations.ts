/**
 * StoragePage の改善提案を **実データから動的に生成** する。
 *
 * 旧実装は `snapshot.recommendations` にハードコード文字列を持っており、
 * `disks[0].usagePct` を `75.6%` と直書きしていた (PR #6 NIT)。これだと
 * snapshot data を更新したときに drift が発生する。本ユーティリティは
 * disks / performance / cleanupTasks を入力として、閾値ベースで生成する。
 *
 * 閾値:
 * - usagePct >= 90% : 即時逼迫
 * - usagePct >= 75% : クリーンアップ推奨 — 最大解放見込みタスクを引用
 * - fragmentationPct >= 10% : デフラグ推奨
 * - startupSec > 30 : スタートアップ整理推奨
 * - メモリ使用率 >= 75% : メモリ整理推奨
 *
 * 入力は `StorageSnapshot` の構造的サブセット。`src/main/clients/storage.ts`
 * のフル型に依存させず renderer の import boundary を維持する。
 */

export interface StorageRecsInput {
  readonly disks: ReadonlyArray<{ readonly mount: string; readonly usagePct: number }>;
  readonly cleanupTasks: ReadonlyArray<{
    readonly title: string;
    readonly potentialFreeMb: number;
  }>;
  readonly performance: {
    readonly fragmentationPct: number;
    readonly startupSec: number;
    readonly memoryUsedGb: number;
    readonly memoryTotalGb: number;
  };
}

export function generateRecommendations(s: StorageRecsInput): string[] {
  const recs: string[] = [];

  for (const d of s.disks) {
    if (d.usagePct >= 90) {
      recs.push(
        `${d.mount} の使用率 ${d.usagePct.toFixed(1)}% — 容量逼迫、即時クリーンアップを推奨`,
      );
    } else if (d.usagePct >= 75) {
      const topTask = [...s.cleanupTasks]
        .filter((t) => t.potentialFreeMb > 0)
        .sort((a, b) => b.potentialFreeMb - a.potentialFreeMb)[0];
      if (topTask !== undefined) {
        const gb = (topTask.potentialFreeMb / 1024).toFixed(1);
        recs.push(
          `${d.mount} の使用率 ${d.usagePct.toFixed(1)}% — 「${topTask.title}」(${gb} GB 解放) を最優先で実施推奨`,
        );
      } else {
        recs.push(
          `${d.mount} の使用率 ${d.usagePct.toFixed(1)}% — 75% 超過、クリーンアップ推奨`,
        );
      }
    }
  }

  if (s.performance.fragmentationPct >= 10) {
    recs.push(
      `HDD のフラグメント率 ${s.performance.fragmentationPct.toFixed(1)}% — デフラグで I/O 速度向上が期待できます`,
    );
  }

  if (s.performance.startupSec > 30) {
    recs.push(
      `スタートアップ ${s.performance.startupSec} 秒 — タスクマネージャーで不要アプリを無効化すれば 20 秒台に短縮可能`,
    );
  }

  const memPct =
    s.performance.memoryTotalGb > 0
      ? (s.performance.memoryUsedGb / s.performance.memoryTotalGb) * 100
      : 0;
  if (memPct >= 75) {
    recs.push(
      `メモリ使用率 ${memPct.toFixed(0)}% — Chrome タブ数の整理 / 常駐アプリの見直しを推奨`,
    );
  }

  return recs;
}
