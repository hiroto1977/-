/**
 * 橋の型 (src/preload/preload.mamori が読み、レンダラーと main が型として import する)。
 *
 * 実行時の中身を持たない (型だけ)。型引数つきの `type` (`FetchResult<T = unknown>` ほか) は Mamori に無い
 * (型引数を持てるのは plain の fn だけ · 0.23) ので、型はここに置く —— preload の実行時の面
 * (どのチャンネルを叩けるか・何を露出するか) は preload.mamori が持つ。
 */
import type { ServiceId } from '../shared/serviceId';

export type { ServiceId };

export type FetchResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_implemented' | 'not_configured' | 'fetch_failed'; message: string };

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: 'action_not_found' | 'not_configured' | 'action_failed'; message: string };

/**
 * OS へ渡す操作 (ファイルを開く / フォルダで表示 / 資格情報の削除) の結果。
 *
 * 2026-08 監査で見つけた形: これらは `Promise<void>` で、
 * - パスが封じ込めゲートに弾かれた場合は `return;` で黙る
 * - `shell.openPath` は **失敗時にエラー文字列を返す** 契約なのに、その戻り値を
 *   捨てていた (ハンドラのコメントには契約が書いてあった)
 * ため、呼び出し側は `catch {}` で握り潰すしかなく、**書き出した決算書類を
 * 「開く」で開けなくても、画面には何も出なかった**。
 */
export type OsOpResult = { ok: true } | { ok: false; message: string };

/** 資格情報の保存結果。`void` だと「弾いた」と「保存した」が区別できず、
 *  renderer が保存できたように振る舞ってしまう (2026-08 監査)。 */
export type TokenSaveResult =
  | { ok: true }
  | { ok: false; code: 'invalid_service' | 'invalid_token' | 'write_failed'; message: string };

export type OAuthResult =
  | { ok: true; data: { scope?: string; expiresAt?: number } }
  | { ok: false; code: 'not_supported' | 'authorize_failed'; message: string };

/** `secrets:protection` の戻り値。src/main/secrets.ts の StorageProtection と同形
 *  (preload は main を import できないため構造だけを再宣言する)。 */
export interface StorageProtection {
  readonly encrypted: boolean;
  readonly plainCount: number;
  readonly file: string;
  /** 何が鍵を握っているか。画面はこれで文言を選ぶ (main/secrets.ts 参照)。 */
  readonly mechanism: 'os-keychain' | 'webcrypto-vault' | 'obfuscated';
  /** 消えないか。ブラウザ版の best-effort は立ち退きうる (main/secrets.ts 参照)。 */
  readonly durability: 'file' | 'persistent' | 'best-effort';
}
