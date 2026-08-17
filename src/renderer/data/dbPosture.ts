import type { DbSecurityInputs } from '../../shared/dbSecurityPosture';
import { isEncryptionEnabled } from './recordEncryption';
import { isAutoLockActive } from '../security/autoLock';

/**
 * セキュリティ診断 (`buildDbSecurityReport`) への入力を **実測から**組み立てる。
 *
 * 2026-08 監査で見つけた形: 呼び出し元 (`SecurityPage`) が入力を画面の中で
 * その場で作っており、`autoLockEnabled` を `false` 固定で渡していた
 * (「未検出 (要確認)」というコメント付き)。ところがブラウザ版では自動ロックが
 * 実際に動いており、**診断が利用者に「自動ロック: 未対応」と告げていた**。
 * 診断の目的は現状を正しく写すことなので、観測できる事実は観測する。
 *
 * 画面の中で組み立てていたこと自体が問題だった — 検出器 (`isAutoLockActive`) に
 * テストがあっても、**画面がそれを呼んでいるか**は誰も見ていなかった
 * (定数へ戻してもテストは緑のままだった)。組み立てをここへ出して、
 * 「実測が入力に反映される」ことをテストで固定する。
 *
 * まだ観測していない項目は、観測していないと分かる形でここに残す:
 *
 * - `integrityVerified` — レコードストアの改ざん検知は常時検証が未配線。
 * - `cloudBackup` — クラウド同期パネルは現状デモ (永続化されない) ので、
 *   構成済みシンクは実際に 0 件。`configuredSinks: []` は嘘ではない。
 *
 * どちらも「無い」と「確認できない」を診断が区別できていない点は残課題として
 * `docs/REMAINING_WORK.md` に手順ごと書いた。
 */
export function currentDbSecurityInputs(): DbSecurityInputs {
  const encrypted = isEncryptionEnabled();
  return {
    encryptionEnabled: encrypted,
    // 暗号化の有効化にはマスターパスワードが必要なので、有効なら設定済み。
    masterPasswordSet: encrypted,
    integrityVerified: false,
    autoLockEnabled: isAutoLockActive(),
    cloudBackup: { configuredSinks: [], lastBackupAgeDays: null, encryptedBackup: false },
  };
}
