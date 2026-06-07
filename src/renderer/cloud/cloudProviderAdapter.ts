/**
 * クラウドプロバイダ・アダプタ (round 85) — **薄い I/O ラッパ**。
 *
 * `data/cloudSync.ts` (純粋核) が決めた同期計画・状態遷移を、実際の
 *  - 暗号化  → `security/dataCrypto.ts` (WebCrypto AES-GCM、鍵はメモリのみ)
 *  - 送受信  → 呼出側が差し込む `CloudTransport` (Drive / Dropbox 等)
 * に橋渡しするだけの層。**ロジックは持たず核へ委譲する** のが設計方針。
 *
 * - 平文も鍵も決してクラウドへ送らない (envelope 付き暗号文のみ)。
 * - 削除は核が「候補」しか出さないため、本アダプタにも自動削除 API は無い。
 * - transport は注入 (テストではモック)。実 Drive/Dropbox 接続は別途。
 */

import {
  planSync,
  reduceSyncState,
  INITIAL_SYNC_STATE,
  buildUploadEnvelope,
  type SyncPlan,
  type SyncState,
  type SyncPlanOptions,
} from '../data/cloudSync';
import type { BackupManifest, EncryptionEnvelope } from '../data/cloudBackup';
import { sealWithKey, type Sealed } from '../security/dataCrypto';

/** クラウドへの暗号文 1 件の送受信トランスポート (Drive / Dropbox の薄い口)。 */
export interface CloudTransport {
  /** 暗号文 (Sealed) + envelope を path に書き込む。 */
  put(path: string, ciphertext: Sealed, envelope: EncryptionEnvelope): Promise<void>;
  /** path の暗号文を取得 (復元用)。存在しなければ null。 */
  get(path: string): Promise<Sealed | null>;
  /** クラウド上の現行マニフェストを取得 (なければ空相当)。 */
  fetchManifest(): Promise<BackupManifest | null>;
}

/** 空マニフェスト (リモート未初期化時のフォールバック)。 */
export const EMPTY_MANIFEST: BackupManifest = { version: 1, entries: [], treeHash: '' };

/**
 * 1 ファイルを暗号化して envelope を作る (核 + dataCrypto への薄い橋渡し)。
 * 鍵はメモリ上の CryptoKey。平文は seal して返すだけ — ここでは送信しない。
 */
export async function encryptFile(
  key: CryptoKey,
  plaintext: string,
): Promise<{ sealed: Sealed; envelope: EncryptionEnvelope }> {
  const sealed = await sealWithKey(key, plaintext);
  // 暗号後サイズは base64 文字列長で概算 (進捗表示用; 厳密バイト数は不要)。
  const envelope = buildUploadEnvelope(sealed.iv, sealed.ct.length);
  return { sealed, envelope };
}

/**
 * local / remote マニフェストから同期計画を作る (核 planSync の薄いラッパ)。
 * envelope/サイズ表の組み立てを呼出側が済ませている前提で核へそのまま渡す。
 */
export function buildPlan(
  local: BackupManifest,
  remote: BackupManifest | null,
  opts: SyncPlanOptions,
): SyncPlan {
  return planSync(local, remote ?? EMPTY_MANIFEST, opts);
}

/**
 * 計画を実行して暗号文を順次アップロードする薄いドライバ。
 * - 各ファイルを transport.put で送る。成功/失敗を核の状態機械へ反映。
 * - 失敗してもキューから消さず failed として記録 (核が retriable を立てる)。
 * - 平文取得は呼出側コールバック (readPlaintext) に委譲 (I/O をここに閉じ込めない)。
 *
 * @returns 全件処理後の SyncState (verifying まで進んだ状態)。
 */
export async function runUploads(
  plan: SyncPlan,
  key: CryptoKey,
  transport: CloudTransport,
  readPlaintext: (path: string) => Promise<string>,
  onState?: (s: SyncState) => void,
): Promise<SyncState> {
  let state = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: plan.fileCount });
  state = reduceSyncState(state, { type: 'scan-complete' });
  state = reduceSyncState(state, { type: 'encrypt-complete' });
  onState?.(state);

  for (const item of plan.uploads) {
    try {
      const plaintext = await readPlaintext(item.path);
      const { sealed, envelope } = await encryptFile(key, plaintext);
      await transport.put(item.path, sealed, envelope);
      state = reduceSyncState(state, { type: 'file-uploaded' });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      state = reduceSyncState(state, { type: 'file-failed', reason });
    }
    onState?.(state);
  }

  return state;
}
