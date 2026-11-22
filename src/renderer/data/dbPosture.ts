import type { DbSecurityInputs } from '../../shared/dbSecurityPosture';
import { isEncryptionEnabled } from './recordEncryption';
import { isAutoLockActive } from '../security/autoLock';
import { getVault } from '../security/vault';
import { loadCopyMarker, type CopyMarker } from './encryptedCopy';
import { MS_PER_DAY } from './backupPosture';

/**
 * 暗号化した控えの目印 → 診断の `cloudBackup` 入力 (純粋・2026-11-21)。
 *
 * 目印は控えを書いて確かめたときにだけ置かれる (`writeEncryptedCopy` / `downloadEncryptedCopy`)。
 * 控えは必ずパスフレーズで暗号化して書くので、目印が在れば暗号化済み。経過日数は目印の時刻から数え、
 * 時計が戻っていても負にしない。目印が読めないときは「無い」と同じに倒す (満たしたと言わない)。
 */
export function encryptedCopyPostureInputs(marker: CopyMarker | null, nowMs: number): DbSecurityInputs['cloudBackup'] {
  if (marker === null) return { configuredSinks: [], lastBackupAgeDays: null, encryptedBackup: false };
  return {
    configuredSinks: ['encrypted-copy'],
    lastBackupAgeDays: Math.max(0, Math.floor((nowMs - marker.at) / MS_PER_DAY)),
    encryptedBackup: true,
  };
}

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
 * 2026-11-21 から 7 観点すべてを観測する:
 *
 * - `integrityVerified` — 暗号化した記録は封緘が記録の名前に結び付く (`recordCipher.ts`) ので、
 *   暗号化が有効なら書き換えと写し替えを読みで検知する。だから暗号化の有無と同じ。
 * - `cloudBackup` — 暗号化した控えの目印 (`encryptedCopy.ts`) から組む
 *   (`encryptedCopyPostureInputs`)。端末の外へ移したかはアプリには見えない。
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
export function currentDbSecurityInputs(nowMs: number = Date.now()): DbSecurityInputs {
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
    /*
     * **「設定してある」と「今の下限を満たす」は別の話だった。**
     *
     * この観点の助言は「**十分に長い**マスターパスワードを設定してください」と
     * 書いてあるのに、測っていたのは**存在するか**だけだった (2026-08-25)。
     * `MIN_PASSWORD_LENGTH` は 2026-07 に 8 → 12 へ上がったが、`unlock` は
     * 下限を強制しない (既存のヴォールトを閉め出さないため)。つまり
     * **短いパスワードのヴォールトは、✅ と表示されたまま開き続けていた**。
     *
     * 解錠時に実際のパスワードで測った結果を見る。**`null` (分からない) では
     * 警告しない** —— 確かめずに脅さない (`isEvictableStorage` と同じ判断)。
     * 直す口は在る (設定の「Vault 管理」でパスワード変更)。
     */
    masterPasswordSet: encrypted || (getVault().isUnlocked() && getVault().passwordMeetsPolicy() !== false),
    integrityVerified: encrypted,
    autoLockEnabled: isAutoLockActive(),
    cloudBackup: encryptedCopyPostureInputs(loadCopyMarker().marker, nowMs),
  };
}
