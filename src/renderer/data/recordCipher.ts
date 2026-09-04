/**
 * RecordCipher — 着脱可能な「保存時暗号化」レイヤ。レコードの機密ペイロード
 * (`data` フィールド) のみを AES-GCM で封緘する (field-level encryption)。
 * `id` / `collection` / `createdAt` / `updatedAt` は索引・並べ替えに使うため
 * 平文のまま残す。
 *
 * - 既定は `IDENTITY_CIPHER` (無変換 = 従来の平文保存・完全後方互換)。
 * - `createPassphraseRecordCipher(password, salt)` はパスフレーズから AES 鍵を
 *   **一度だけ** 派生 (PBKDF2) し、以後のレコードは安価な per-record AES-GCM で
 *   封緘する。salt はストア側に一度だけ保存し、次セッションで同じ鍵を再導出する。
 * - 復号は後方互換: 封緘されていない (平文の) `data` はそのまま返す。これにより
 *   暗号化を有効化する前に保存された既存レコードも読める。
 */
import { sealWithKey, openWithKey, isSealed, deriveAesKey, type Sealed } from '../security/dataCrypto';

export interface RecordCipher {
  /** 平文 data → 保存形 (封緘または無変換)。 */
  encrypt(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** 保存形 → 平文 data。封緘でなければそのまま返す。 */
  decrypt(stored: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** 封緘済みペイロードの形: `{ __enc: Sealed }`。 */
export function isSealedData(v: unknown): v is { __enc: Sealed } {
  return typeof v === 'object' && v !== null && isSealed((v as { __enc?: unknown }).__enc);
}

/** 既定: 無変換 (平文保存)。 */
export const IDENTITY_CIPHER: RecordCipher = {
  async encrypt(data) {
    return data;
  },
  async decrypt(stored) {
    // 既に暗号化有効だった store を平文 cipher で読むと封緘が解けない。明示エラー。
    if (isSealedData(stored)) throw new Error('暗号化されたレコードです（パスフレーズで復号が必要）');
    return stored;
  },
};

/** パスフレーズ由来鍵で `data` を封緘する cipher を生成。鍵導出は一度だけ。 */
export async function createPassphraseRecordCipher(password: string, saltB64: string): Promise<RecordCipher> {
  const key = await deriveAesKey(password, saltB64);
  return {
    async encrypt(data) {
      const sealed = await sealWithKey(key, JSON.stringify(data));
      return { __enc: sealed };
    },
    async decrypt(stored) {
      if (!isSealedData(stored)) return stored; // 平文 (暗号化前のレコード) は素通し
      const json = await openWithKey(key, stored.__enc);
      return JSON.parse(json) as Record<string, unknown>;
    },
  };
}
