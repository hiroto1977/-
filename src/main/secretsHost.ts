/**
 * `secrets.mamori` の薄い壁 (2026-11-12 · MG-069)。
 *
 * OS の口 (`electron` の `app` / `safeStorage`・`Buffer`・時計・`console`) は Mamori の `extern pure global` に
 * できない (宣言した名前が副作用の判断を持つ口に届くため) ので、ここへ閉じ込める。
 * **判断は持たない** —— 値を渡して結果を返すだけ。判断 (読めない保管ファイルを空と混ぜない・書き込みの直列化・
 * 包みと有効時間・キーチェーンが無いときの難読化・TokenSet の更新) は `secrets.mamori` が持つ。
 *
 * 失敗はそのまま投げる (ここで受けない): 復号の失敗を「復号できない」と言い換えるのも、キーチェーンが
 * 無いときに難読化へ倒すのも、呼び手の判断である。
 */
import { app, safeStorage } from 'electron';
import path from 'node:path';

/** userData の下の道 (ファイル名は呼び手が渡す)。 */
export function hostUserDataPath(name: string): string {
  return path.join(app.getPath('userData'), name);
}

/** OS キーチェーンで暗号化して base64 にする。使えるかどうかは呼び手が先に訊く。 */
export async function hostEncryptToBase64(value: string): Promise<string> {
  return (await safeStorage.encryptStringAsync(value)).toString('base64');
}

/** 復号の口が使えるか (OS が答える)。 */
export function hostDecryptAvailable(): Promise<boolean> {
  return safeStorage.isAsyncEncryptionAvailable();
}

/**
 * base64 の暗号文を OS キーチェーンで復号する。壊れた値・別の鍵では reject する (呼び手が受ける)。
 * `shouldReEncrypt` は返さない —— 読む道は書かない (`atRest.ts` と同じ)。
 */
export async function hostDecryptFromBase64(encoded: string): Promise<string> {
  return (await safeStorage.decryptStringAsync(Buffer.from(encoded, 'base64'))).result;
}

/** 文字列を UTF-8 のバイトにして base64 にする (キーチェーンが無いときの難読化の中身)。 */
export function hostUtf8ToBase64(text: string): string {
  // Stryker disable next-line StringLiteral: `'utf8'` を空にしても Node は utf8 へ落とすため同じ base64 になる (等価 · oauthHost.ts と同じ実測)
  return Buffer.from(text, 'utf8').toString('base64');
}

/** base64 を UTF-8 の文字列へ戻す。 */
export function hostBase64ToUtf8(encoded: string): string {
  // Stryker disable next-line StringLiteral: `toString('')` も Node は utf8 として読むため同じ文字列になる (等価)
  return Buffer.from(encoded, 'base64').toString('utf8');
}

/** 文字列の UTF-8 の byte 数 (保管ファイルの大きさの天井に使う)。 */
export function hostUtf8ByteLength(text: string): number {
  return Buffer.byteLength(text);
}

/** 今の時刻 (epoch ms)。 */
export function hostNow(): number {
  return Date.now();
}

/** 主プロセスの標準エラーへ 1 行 (文は呼び手が組む)。 */
export function hostLogError(message: string): void {
  console.error(message);
}

/** 主プロセスの標準エラーへ警告を 1 行 (文は呼び手が組む)。 */
export function hostLogWarn(message: string): void {
  console.warn(message);
}
