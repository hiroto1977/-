/**
 * 資格情報を保存した直後の一言 —— **守っている物を取り違えたまま安心させない。**
 *
 * アシスタントの API キー欄は 2026-09-06 まで、保存の直後に**無条件で**
 * 「キーは暗号化ストレージに格納され、再表示はされません」と書いていた。
 * ところがデスクトップ版は **OS キーチェーンが無い環境では `plain:` の
 * base64 (難読化のみ・暗号化ではない) へ倒れる**設計で (`main/secrets.ts`)、
 * そのとき出るのは `console.warn` だけ —— **GUI の利用者は stdout を見ない**。
 * 設定 → セキュリティの表示は 2026-08-23 に `mechanism` で文言を選ぶ形へ
 * 直っていたのに、保存の直後の一言はそこから取り残されていた。
 *
 * 文言は 3 通り + 「分からない」。**分からないときに暗号化を名乗らない**のが
 * この関数の要点である (`storageProtection()` が失敗する / 古い橋で無い、
 * のどちらでも「暗号化しました」と言ってはいけない)。
 *
 * 何が守るかの区別は `main/secrets.ts` の `StorageProtection.mechanism` と
 * 同じ 3 値を使う:
 *
 *   'os-keychain'     OS が鍵を持つ (利用者のパスフレーズに依存しない)
 *   'webcrypto-vault' マスターパスワードから PBKDF2 で導出した鍵
 *   'obfuscated'      base64 の難読化のみ (暗号化ではない)
 */

/** 保管の守り方。`main/secrets.ts` の `StorageProtection.mechanism` と同じ 3 値。 */
export type StorageMechanism = 'os-keychain' | 'webcrypto-vault' | 'obfuscated';

/** `storageProtection()` の戻りから `mechanism` だけを取り出す (知らない値は null)。 */
export function readMechanism(raw: unknown): StorageMechanism | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = (raw as { mechanism?: unknown }).mechanism;
  if (m === 'os-keychain' || m === 'webcrypto-vault' || m === 'obfuscated') return m;
  return null;
}

/** 保存できたときの一言。`mechanism` が分からなければ暗号化を名乗らない。 */
export function savedCredentialMessage(mechanism: StorageMechanism | null): string {
  if (mechanism === 'os-keychain') {
    return '保存しました (OS のキーチェーン由来の鍵で暗号化。再表示はしません)';
  }
  if (mechanism === 'webcrypto-vault') {
    return '保存しました (マスターパスワードから導出した鍵で暗号化。再表示はしません)';
  }
  if (mechanism === 'obfuscated') {
    return (
      '⚠ 保存しました。ただし OS キーチェーンが使えないため暗号化されていません'
      + ' (base64 の難読化のみ)。設定 → セキュリティで状態を確認してください'
    );
  }
  return '保存しました (再表示はしません。保存の守り方は設定 → セキュリティで確認できます)';
}
