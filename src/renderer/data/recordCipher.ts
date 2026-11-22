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
 *
 * ## 封緘は、その記録に結び付ける —— レコード単位の改ざん検知 (2026-11-21)
 *
 * AES-GCM は封緘の中身が 1 ビットでも変われば開かない (書き換えの検知)。ところが
 * それだけでは**封緘ごと別の記録へ移す**形を見逃す —— 同じ鍵で封緘した A の中身を
 * B の欄へ写すと、B は A の中身で正しく開く (取引先 A の金額が B の金額になる)。
 *
 * だから封緘する平文に、**その記録の collection と id** を一緒に入れる
 * (`{ v, c, i, d }`)。GCM が平文全体を守るので、開いたときに c と i が読んでいる
 * 記録と一致することを確かめれば、移し替えも検知できる (AES-GCM の追加認証データと
 * 同じ働きを、鍵の層に手を入れずに得る形)。
 *
 * 検知するのは「書き換え」と「別の記録からの移し替え」まで。**記録を丸ごと消す・
 * 同じ記録の古い封緘へ戻す**形は検知しない (それには記録の外の台帳が要る)。
 * 結び付けを持たない封緘 (形の古い物・別の作り方の物) は開かない —— 有効化の画面が
 * できる前に作られた封緘は無いので、受ける理由が無い。
 */
import { sealWithKey, openWithKey, isSealed, deriveAesKey, type Sealed } from '../security/dataCrypto';

/** 封緘を結び付ける記録の名前 (保存されている行の collection と id)。 */
export interface RecordBinding {
  readonly collection: string;
  readonly id: string;
}

export interface RecordCipher {
  /** 平文 data → 保存形 (封緘または無変換)。`at` はその data を置く記録。 */
  encrypt(data: Record<string, unknown>, at: RecordBinding): Promise<Record<string, unknown>>;
  /** 保存形 → 平文 data。封緘でなければそのまま返す。`at` は読んでいる記録。 */
  decrypt(stored: Record<string, unknown>, at: RecordBinding): Promise<Record<string, unknown>>;
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

/** 結び付けの形の版。封緘する平文の `v`。 */
export const RECORD_SEAL_VERSION = 2;

/** 改ざんの疑いを述べる例外 (中身は書かない —— 名前だけ)。 */
export class RecordTamperedError extends Error {
  constructor(at: RecordBinding, why: string) {
    super(`記録 ${at.collection} / ${at.id} の暗号化された中身を受けられません (${why})。`);
    this.name = 'RecordTamperedError';
  }
}

/** 封緘する平文 —— その記録の名前と中身。 */
export function bindRecordPayload(data: Record<string, unknown>, at: RecordBinding): string {
  return JSON.stringify({ v: RECORD_SEAL_VERSION, c: at.collection, i: at.id, d: data });
}

/** 開いた平文を検める。結び付けが読んでいる記録と一致すれば中身を返す。 */
export function unbindRecordPayload(json: string, at: RecordBinding): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RecordTamperedError(at, '中身を読めません');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RecordTamperedError(at, '中身の形が違います');
  }
  const p = parsed as Record<string, unknown>;
  if (p.v !== RECORD_SEAL_VERSION) throw new RecordTamperedError(at, '記録への結び付けがありません');
  if (p.c !== at.collection || p.i !== at.id) throw new RecordTamperedError(at, '別の記録の中身です —— 写し替えられた疑いがあります');
  const d = p.d;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new RecordTamperedError(at, '中身の形が違います');
  return d as Record<string, unknown>;
}

/**
 * パスフレーズ由来鍵で `data` を封緘する cipher を生成。鍵導出は一度だけ。
 *
 * `iterations` は呼ぶ側が渡す (パス 239)。封緘済みのレコードを開くときは
 * **そのレコードを封緘した回数**でなければ別の鍵になるので、既定値に頼らず
 * `recordEncryption` が meta の保管値を渡す。省略時は今の定数 —— 新規の
 * 有効化だけがその道を通る。
 */
export async function createPassphraseRecordCipher(
  password: string,
  saltB64: string,
  iterations?: number,
): Promise<RecordCipher> {
  const key = await deriveAesKey(password, saltB64, iterations);
  return {
    async encrypt(data, at) {
      const sealed = await sealWithKey(key, bindRecordPayload(data, at));
      return { __enc: sealed };
    },
    async decrypt(stored, at) {
      if (!isSealedData(stored)) return stored; // 平文 (暗号化前のレコード) は素通し
      let json: string;
      try {
        json = await openWithKey(key, stored.__enc);
      } catch {
        // GCM は「鍵が違う」と「書き換えられた」を見分けない。解錠では KCV で鍵を確かめるが、
        // 復元で入った封緘は別の端末 (別の salt) の物でありうるので、原因を 1 つに決めつけない。
        throw new RecordTamperedError(at, '封緘を開けません —— 別の鍵 (別の端末やパスフレーズ) で封緘された物か、書き換えられた物です');
      }
      return unbindRecordPayload(json, at);
    },
  };
}
