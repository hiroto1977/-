/**
 * クラウドバックアップ状態 → DBセキュリティ診断入力 の橋渡し (純ロジック・IO なし)。
 *
 * dbSecurityPosture の診断は保守的な既定値ではなく**実バックアップ状態**を反映できると
 * 精度が上がる。本アダプタは cloudBackup の {@link BackupManifest} と構成済みシンクから、
 * 診断が必要とする `cloudBackup` 入力 (構成シンク・最終バックアップからの経過日数・暗号化有無)
 * を決定論的に算出する。
 *
 * dbSecurityPosture は src/shared に置かれ renderer/data を import できない (プロセス境界) ため、
 * 両者を知る本アダプタは renderer/data 側に置く。
 */

import type { BackupManifest } from './cloudBackup';
import type { DbSecurityInputs } from '../../shared/dbSecurityPosture';

/** 1 日のミリ秒。 */
export const MS_PER_DAY = 86_400_000;

/** マニフェスト内の最新 mtime (epoch ms) を返す。エントリが無ければ null。 */
export function latestBackupMtime(manifest: BackupManifest | null): number | null {
  if (manifest === null || manifest.entries.length === 0) return null;
  return Math.max(...manifest.entries.map((e) => e.mtime));
}

/**
 * バックアップ状態を DBセキュリティ診断の `cloudBackup` 入力へ変換する (純粋・決定論的)。
 *  - configuredSinks: そのまま。
 *  - lastBackupAgeDays: 最新 mtime からの経過日数 (バックアップ未実施なら null)。
 *  - encryptedBackup: バックアップが存在し、かつ暗号化されているときのみ true。
 */
export function cloudBackupToPostureInputs(
  manifest: BackupManifest | null,
  configuredSinks: readonly string[],
  encrypted: boolean,
  nowMs: number,
): DbSecurityInputs['cloudBackup'] {
  const latest = latestBackupMtime(manifest);
  const lastBackupAgeDays = latest === null ? null : Math.max(0, Math.floor((nowMs - latest) / MS_PER_DAY));
  return {
    configuredSinks,
    lastBackupAgeDays,
    encryptedBackup: latest !== null && encrypted,
  };
}
