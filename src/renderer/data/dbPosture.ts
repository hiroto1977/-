import type { DbSecurityInputs } from '../../shared/dbSecurityPosture';
import { isEncryptionEnabled } from './recordEncryption';
import { isAutoLockActive } from '../security/autoLock';
import { getVault } from '../security/vault';

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
 *
 * ## 診断が **見ていない** 保存先 (2026-08-23 実測)
 *
 * `encryptionEnabled` が真でも、暗号化されるのは業務レコード
 * (`data/store.ts`) **だけ**である。次は常に平文で残る:
 *
 * ```
 *   library/library.ts   書き出した書類・SVG などの実体 (cipher の配線が無い)
 *   localStorage         会話履歴 (Assistant / Chatbot)・気分のメモ・
 *                        DocStudio の下書き・TeamRadar の状態・ウォッチリスト
 * ```
 *
 * 診断の札はこの範囲を名乗るようにした (`dbSecurityPosture.ts` の
 * `encryption`)。**範囲を広げたのではなく、範囲を書いた**だけなので、
 * これらを実際に封緘する話は別途必要。
 */
export function currentDbSecurityInputs(): DbSecurityInputs {
  const encrypted = isEncryptionEnabled();
  return {
    encryptionEnabled: encrypted,
    /*
     * **マスターパスワードは、観測できるものを観測する。**
     *
     * ここは 2026-08-25 まで `masterPasswordSet: encrypted` だった。
     * 「暗号化の有効化にはマスターパスワードが必要なので、有効なら設定済み」
     * ——**片側の含意としては正しい**が、等号として使うと逆が言えない。
     * レコード暗号化は配線されておらず `encrypted` は常に false なので、
     * この欄は**常に false** になっていた。
     *
     * ところがブラウザ版は、**マスターパスワードを設定しないと保管庫が
     * 作れず、この画面にも到達できない**。つまり診断は、必ず設定して
     * いる利用者に向かって「マスターパスワード: 未設定 (high)」と
     * 告げていた —— このファイルの冒頭が `autoLockEnabled` について
     * 書いているのと**まったく同じ形**である。
     *
     * 保管庫が解錠されていること (`isUnlocked()`) は、マスターパスワードで
     * 開いたことの直接の証拠なので、それを見る。デスクトップ版に
     * マスターパスワードの概念は無く保管庫も初期化されないので、
     * そちらでは false のままで正しい。
     */
    masterPasswordSet: encrypted || getVault().isUnlocked(),
    integrityVerified: false,
    autoLockEnabled: isAutoLockActive(),
    cloudBackup: { configuredSinks: [], lastBackupAgeDays: null, encryptedBackup: false },
  };
}
