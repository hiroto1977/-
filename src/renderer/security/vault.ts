// 生成物 —— src/renderer/security/vault.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * Credential Vault (browser).
 *
 * WebCrypto AES-GCM-256 + PBKDF2-SHA-256 でトークンを暗号化し、IndexedDB に保管する。
 * マスターパスワード入力 → PBKDF2 で派生鍵 → AES-GCM で各トークン個別暗号化。
 *
 * 主要不変条件:
 *  - 平文 secret は IndexedDB / localStorage / sessionStorage どこにも書かない
 *  - 派生鍵は取り出せない形 (`extractable: false`) でメモリのみ保持、lock() で破棄
 *  - PBKDF2 iter 600,000 / salt 32 bytes / IV 12 bytes / KCV で復号検証
 *
 * リカバリーキー (Phase E):
 *  - initialize() 時に 256-bit エントロピーを生成し BIP-39 24 語に変換
 *  - 同じ raw master key を recoveryKey でも wrap し meta に保存
 *  - パスワード忘れ → recoverWithMnemonic(words, newPassword) で復元
 *  - 詳細: docs/BROWSER_REDESIGN.md §3.1.1
 *
 * ## この module は Mamori で書いてある (2026-11-15 · MG-070)
 *
 * IndexedDB・WebCrypto・乱数・文字コード・`console` の口は薄い壁 `vaultHost.ts` に在る
 * (Mamori の pure には宣言できない)。ここが持つのは**判断のすべて**: どの store のどの鍵へ何を書くか・
 * `add` で書くか・保存側から読んだ反復回数とソルトの床・パスワードの下限と天井・施錠の世代・有効時間・
 * AAD の綴り・断りの文・呼ぶ順序。保管庫の実体はクラスではなく、状態を閉じ込めた関数 (`createBrowserVault`) が
 * 返す口の束である (Mamori のクラスは例外の型だけ) —— 状態 (`currentKey` ほか) へ外から届く道は無い。
 */

import { atLeastChars, countChars, moreThanChars } from '../../shared/inputCeiling';
import { CONTROL_CHAR_MESSAGE, hasControlChars } from '../../shared/tokenInput';
import { expiredStoredCredentialMessage, storedCredentialExpired } from '../../shared/credentialTtl';
import { constantTimeEquals } from '../../shared/constantTimeEquals';
import { decodeMnemonic, encodeMnemonic, generateEntropy, normalizeMnemonic } from './mnemonic';
import { assertKdfIterations, assertSaltBytes } from './dataCrypto';
import { LEGACY_KDF_ITERATIONS, PBKDF2_ITERATIONS as SHARED_ITERATIONS } from '../../shared/cryptoParams';
import type { VaultWrite } from './vaultHost';
import { hostOpenDb, hostGet, hostPut, hostPutAll, hostDelete, hostKeys, hostDeleteDb, hostRandomBytes, hostUtf8, hostDeriveKey, hostGenerateMasterKey, hostExportRawKey, hostImportNonExtractable, hostEncryptString, hostDecryptString, hostEncryptBytes, hostDecryptBytes, hostZero, hostIsBufferView, hostErrorName, hostWarn } from './vaultHost';

const META_STORE = 'meta';

const TOKEN_STORE = 'tokens';

const STORES: readonly string[] = [META_STORE, TOKEN_STORE];

const PBKDF2_ITERATIONS = SHARED_ITERATIONS;

/** Minimum master-password length for new vaults / password resets. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * 保管する資格情報 1 件の文字数の天井 (2026-09-12 · パス 167 で名前を付けた)。
 *
 * `setToken` の条件・その断りの文面・`SettingsPage` の入力欄 `maxLength` の
 * **3 か所に字面の 8192 が在った**。同じ判断なので 1 つにする
 * (`shared/recordEntryLimits.ts` が 2026-08-23 に同じ理由で作られている)。
 * 安全上限なので `parameters.ts` の台帳には載せない (CLAUDE.md の規則)。
 */
export const MAX_TOKEN_CHARS = 8192;

const SALT_BYTES = 32;

const KCV_PLAINTEXT = 'service-hub-v1';

/**
 * マスターパスワードの**文字数の上限** (2026-09-14 · パス 252 で名前を付けた)。
 *
 * 2026-09-14 まで `256` は**条件 3 か所と文面 3 か所**に字面で在った (計 6 写し) ——
 * パス 167 が入力欄の天井で直したのと同じ形。安全上限なので `parameters.ts` の
 * 台帳には載せない (CLAUDE.md の規則)。
 *
 * PBKDF2 は入力の長さを問わないので、これは鍵の強さの話ではなく
 * **際限のない入力を受けない**ための床である。
 */
export const MAX_PASSWORD_CHARS = 256;

/**
 * パスワードが**現在の**下限を満たすか。
 *
 * 判定は 1 行だが、**関数にして外へ出してある**。理由は測れるようにするため:
 * 以前この式は `unlock` の途中に埋まっていて、`false` になる枝へ検査から
 * 到達する手段が無かった (短いパスワードの保管庫は `initialize` /
 * `changePassword` / `recoverWithMnemonic` がどれも下限を強制するので、
 * 現在の API では作れない —— `false` に届くのは 2026-07 に下限を 8 → 12 へ
 * 上げる前に作られた実在の保管庫だけである)。
 *
 * その結果、**下限そのものを撃ち抜く変異が 2 件生き残っていた**
 * (`>=` → `>` / 式ごと `true`。実測 2026-08-31)。式を外へ出せば、
 * 保管庫を作らずに 11 / 12 / 13 字を直接問える。
 *
 * 長さの**上限** (256 字) はここに含めない —— あちらは「強制する」側の規則で、
 * `unlock` は通さない。混ぜると `unlock` が既存の保管庫を閉め出す。
 *
 * **数えるのは文字で、コード単位ではない。** (2026-09-14 · パス 252)
 * パス 195 は**天井**を文字単位へ揃えたが、**床**は見ていなかった。実測 (2026-09-14):
 * 画面と例外は 9 か所で「12 文字以上」と述べるのに、絵文字 6 個 (実文字数 **6**・コード単位 12) が
 * 通っていた —— **宣言した床の半分で満たせた**。`atLeastChars` は 12 文字目で切り上げるので、
 * 長さに依らず安い (`countChars` は最後まで辿る)。
 */
export function meetsPasswordPolicy(password: string): boolean {
  return atLeastChars(password, MIN_PASSWORD_LENGTH);
}

/**
 * 保管庫の状態。**`unreadable` は 2026-09-06 に足した。**
 *
 * それまで `status()` は「保管庫が無い」と「保管庫を読めない」の両方に
 * `uninitialized` を返しており、ロック画面は読めないだけの端末へ
 * **「ようこそ — はじめてのご利用」「マスターパスワードを 1 つだけ設定してください」**
 * を出していた。トークンを預けている本人に対して**初回起動の画面**を見せることになる。
 *
 * `initialize()` は書く所の `add` が「既に初期化されています」と断るので、
 * **アプリが上書きすることはない** (読み出しの安全側と書き込みの安全側は逆向き ——
 * `main/secrets.ts` の注記と同じ)。危ないのは画面の主張のほうで、
 * 「消えた」と読んだ利用者はサイトデータの削除や再インストールへ進みうる ——
 * そちらは**本当に消える**。
 */
export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked' | 'unreadable';

/**
 * ハードリセットが**実際に何をしたか**。
 *
 * ## なぜ戻り値が要るのか (2026-09-07 実測)
 *
 * `wipeAndReset` は成功・失敗・blocked の**どれでも解決**していた (UI をハングさせないため ——
 * その判断は正しい)。ところが呼ぶ側は 2 か所とも「解決したら消えた」と読み、無条件で
 * 再読込していた。つまり
 *
 *  - **他のタブが IndexedDB の接続を掴んでいると削除できない** (blocked)。
 *    それでも画面は再読込へ進み、**データは残ったまま**「最初のセットアップ画面に
 *    戻ります」の約束だけが破れる (保管庫はまだ初期化済みなので、戻るのは
 *    ロック解除の画面)。理由はどこにも出ない。
 *  - 唯一の報せは開発者向けの警告で、**利用者には見えない**。
 *
 * 画面の文面は「保管中の全トークン・暗号化メタデータ・現在のリカバリーキーが
 * **復旧不可**な形で消去されます」で、消えなかった場合と同じ顔をしていた。
 * ロック画面側の「完全初期化」はもっと悪く、**閉じ出された本人**が押すので、
 * 何も消えずに同じロック画面へ戻っても「ボタンが壊れている」としか見えない。
 *
 * 解決を保ったまま**結果を返す**ことで、呼ぶ側が「消えた時だけ再読込する」と
 * 書ける。投げる形にしないのは、ハングさせない元の判断を崩さないため。
 */
export type WipeOutcome = 'deleted' | 'blocked' | 'failed';

/**
 * ハードリセットの結果を、利用者への 1 行にする。
 *
 * **文言を 1 か所にする**ため。呼ぶ側は設定ページとロック画面の 2 つで、
 * 同じ結果に違う説明を出す理由が無い (打ち手はどちらも「他のタブを閉じる」)。
 */
export function describeWipeOutcome(outcome: WipeOutcome): string | null {
  if (outcome === 'deleted') return null;
  if (outcome === 'blocked') return '削除できませんでした — このアプリを開いている他のタブが保管庫を使用中です。' + '他のタブをすべて閉じてから、もう一度実行してください。データは残っています。';
  return '削除できませんでした — 保管庫の削除がブラウザに拒否されました。' + 'ページを再読み込みしてから、もう一度実行してください。データは残っています。';
}

/**
 * 読めなかったときにロック画面が出す 1 行。**現実に起こる 2 つの原因と、
 * それぞれの打ち手を両方載せる** (どちらかを断定できないため)。
 */
export const VAULT_UNREADABLE_TEXT = 'この端末の保管庫を確認できませんでした。' + 'はじめての利用のように見えても、預けたトークンが消えたとは限りません。' + 'プライベートウィンドウで開いている場合は通常のウィンドウで開き直し、' + '保存領域が一杯の場合はライブラリの不要なファイルを削除してから、' + 'この画面の「もう一度確認」を押してください。';

export interface InitResult {
  /** 24-word BIP-39 mnemonic. Caller MUST display once + discard. */
  readonly mnemonic: string;
}

/**
 * Thrown when revealRecoveryKey() / rotateRecoveryKey() is called on a
 * vault initialized BEFORE Phase E (no recovery branch on disk).
 */
export class NoRecoveryBranchError extends Error {
  constructor() {
    super('この Vault にはリカバリーキーが設定されていません (Phase E 以前に初期化)');
    this.name = 'NoRecoveryBranchError';
  }
}

/**
 * master 鍵で任意の文字列に付ける**認証タグ** (`authTag` / `verifyAuthTag`)。
 *
 * ## なぜ保管庫の外のデータを保管庫で守るのか (2026-10-31 · threat: T-230 の隣 · 566-B)
 *
 * ブラウザ版の BYO プロキシ設定 (`network/proxy.ts`) は**平文の別 DB**
 * (`business-hub-preferences`) に残る —— 解錠の前後を問わず読めるようにするためで、
 * これ自体は設計 (その docblock に書いてある)。ところが平文ゆえに IndexedDB へ書ける相手は
 * 送り先 URL を**自分の Worker へ差し替えられる** —— 資格情報のほぼ全部がその口を通るので、
 * 差し替えればまるごと盗れる。T-219 の step-up は**画面の書き手**にしか効かず、生の IDB 書き込みを
 * 素通りさせていた。
 *
 * タグは平文を master 鍵で AES-GCM 暗号化した物で、**それ自体が MAC である** (AEAD は
 * 既知平文を鍵で封じれば改竄を検知する)。検証は復号して平文が一致するかを見る —— 鍵違い・改竄・
 * ロック中はすべて false。保管庫の鍵は取り出せないので、保管庫を解錠できない相手は
 * 正しいタグを作れない。**保管先は呼び出し側が持つ** (プロキシ設定の平文は今までどおり別 DB に残り、
 * タグはその隣に置く) —— 保管庫のトークン名前空間を汚さない (`listConfigured` に出さない)。
 *
 * `domain` で用途を分ける (`service-hub-authtag-v1:<domain>`) —— ある用途のタグを別の用途へ
 * 使い回せない。残余: **同一オリジンで解錠中の相手**はこの `authTag` を自分で呼んで正しいタグを
 * 作れる (在メモリの鍵を持つ攻撃者は何でもできる)。守るのは**静止時の改竄** (アプリが動いていない
 * 間・別プロセスの書き込み) で、T-230 と同じ形である。
 */
export interface VaultAuthTag {
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/**
 * 保管庫の口。欄はどれも `readonly` の関数 —— 元の TypeScript では method だったので型の上では差し替えられたが、
 * ここでは**共有の保管庫の関数を外から別の関数へ替える**書き方を型が断る (検証や解錠の口を「常に真」へ替えさせない)。
 */
export interface Vault {
  /**
   * 状態を見る。**投げない** —— 投げると呼び出し側 (App) がハングして
   * ログイン画面に到達できなくなる。ただし**読めなかったことは
   * `uninitialized` と混ぜない** (2026-09-06)。
   */
  readonly status: () => Promise<VaultStatus>;
  readonly isUnlocked: () => boolean;
  /**
   * 解錠に使われたパスワードが、**現在の**下限 (`MIN_PASSWORD_LENGTH`) を
   * 満たしていたか。`null` = 判定できていない (未解錠など)。
   *
   * `initialize` / `changePassword` / `recoverWithMnemonic` は下限を強制するが、
   * **`unlock` は強制しない** —— 既にあるヴォールトを開けなくしてしまうため。
   * その結果、2026-07 に下限を 8 → 12 へ上げる前に作られたヴォールトは
   * **短いパスワードのまま、誰にも知らされずに**開き続ける。
   *
   * ここで測るのはその 1 点だけ。**値は保存しない** (メモリのみ・`lock()` で
   * 捨てる) —— 「このヴォールトのパスワードは短い」を IndexedDB に書けば、
   * 総当たりの手掛かりを 1 つ置くことになる。
   */
  readonly passwordMeetsPolicy: () => boolean | null;
  /** Initialize a new vault. Returns the one-time recovery mnemonic. */
  readonly initialize: (password: string) => Promise<InitResult>;
  readonly unlock: (password: string) => Promise<void>;
  /**
   * **状態を変えずに**パスワードが合うかを答える (2026-10-29 · パス 554 · threat: T-219)。
   *
   * 「送り先を変える」操作 (BYO プロキシの保存・Ollama の接続先を同じ端末の外へ) は、
   * 資格情報の書き込みと同じ重さなので、この端末の持ち主の確認を要る —— ブラウザ版には
   * main が無く、ネイティブダイアログ (T-183) が構造上持てないので、持ち主の証は
   * 保管庫のパスワードただ 1 つである。`unlock()` を流用すると鍵を据え直し世代を進める
   * 副作用が在るので、照合だけを切り出す。
   *
   * 返す物は真偽だけ: 合えば true・違えば false。**保管庫が未初期化なら投げる**
   * (「無い」を「違う」と混ぜると、初期化していない端末で永久に断られる理由が読めない)。
   * 空文字は照合せず false。パスワードは保持しない。
   */
  readonly verifyPassword: (password: string) => Promise<boolean>;
  readonly lock: () => void;
  readonly setToken: (serviceId: string, token: string) => Promise<void>;
  readonly getToken: (serviceId: string) => Promise<string | null>;
  readonly clearToken: (serviceId: string) => Promise<void>;
  readonly listConfigured: () => Promise<string[]>;
  /** 期限切れで消した資格情報の知らせを 1 度だけ返す (threat: T-213)。無ければ null。 */
  readonly takeExpiredNotice: (serviceId: string) => string | null;
  /**
   * master 鍵で任意の文字列に認証タグを付ける (保存時 MAC · 566-B · `VaultAuthTag` の docblock)。
   * 保管庫の外に残すデータ (平文のプロキシ設定など) の静止時改竄を検知するため。ロック中は投げる。
   */
  readonly authTag: (domain: string, data: string) => Promise<VaultAuthTag>;
  /** `authTag` が付けたタグが今の `data` を (この `domain` で) 認証しているか。検証できない物はすべて false。 */
  readonly verifyAuthTag: (domain: string, data: string, tag: VaultAuthTag | null | undefined) => Promise<boolean>;
  /**
   * 旧パスワードで認証して、新パスワードへ**包み直す**。
   *
   * トークンはマスター鍵で暗号化されており、パスワードはそのマスター鍵を
   * 包んでいるだけなので、**トークンにも リカバリー枝にも触らない**。
   * したがって利用者が控えた 24 語は変更後もそのまま使える。
   *
   * 以前は画面側が「保管庫ごと消す → `initialize()` → 書き戻す」を組み立てて
   * いた (2026-08-24 に発見)。それには 2 つの結果があった:
   *
   *  1. **消してから書き戻すまでの失窓** —— 中断すれば資格情報が永久に消える
   *  2. **`initialize()` は新しい 24 語を生成して返す**が、画面はその戻り値を
   *     捨てていた → 控えたフレーズは通らなくなり、通るフレーズは誰も知らない
   *
   * `recoverWithMnemonic` と同じ書き込み (meta の password 枝 + master-wrap を
   * 1 トランザクションで差し替え) を行う。認証手段が違うだけである。
   *
   * offline backup attack の性質も `recoverWithMnemonic` と同じ —— 変更前の
   * プロファイル複製を持つ者はそちらを旧パスワードで開ける。前方向の境界。
   */
  readonly changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  /**
   * Validate mnemonic, unwrap master key, re-initialize under newPassword.
   * Preserves all stored tokens.
   *
   * NOTE (offline backup attack): this method overwrites `salt`/`iv`/`kcv`/
   * `master-wrap` to invalidate the old password against the live database.
   * It does NOT bit-level wipe earlier IndexedDB snapshots — if an attacker
   * obtained a copy of the browser profile BEFORE recovery, they can still
   * unwrap the master key with the old password on that snapshot. Treat
   * password rotation as a forward-only security boundary; for full
   * invalidation (e.g. compromised device), call wipeAndReset() instead.
   *
   * NOTE (legacy v0 auto-migration): vaults persisted before recovery-key
   * derivation versioning shipped (`meta.recoveryVersion === undefined`)
   * use the unprefixed PBKDF2 input ("v0"). On a successful recovery, this
   * method silently re-wraps the recovery branch under v1 derivation
   * (fresh salt + domain-separation prefix) so that subsequent recoveries
   * benefit from the same defense-in-depth as new vaults. The mnemonic
   * itself is unchanged — users see no difference. If the migration write
   * fails for any reason, the recovery still succeeds and the vault
   * remains usable under v0; the migration is best-effort.
   */
  readonly recoverWithMnemonic: (mnemonic: string, newPassword: string) => Promise<void>;
  /**
   * Phase E v1: ALWAYS THROWS. Reserved for v2.
   * Users MUST persist the mnemonic returned by initialize() — there is
   * no way to retrieve it later. UI code MUST NOT expose a "reveal" button.
   */
  readonly revealRecoveryKey: (passwordReauth: string) => Promise<string>;
  /**
   * Phase E v1: ALWAYS THROWS. Reserved for v2.
   * Recovery key rotation is not supported. The mnemonic from initialize()
   * is permanent unless the user calls wipeAndReset() and re-initializes.
   */
  readonly rotateRecoveryKey: () => Promise<string>;
  /**
   * Hard reset (for users who lost both password and mnemonic).
   * **必ず解決する** (UI をハングさせない) ので、消えたかどうかは
   * 戻り値で見ること —— `WipeOutcome` の注記に経緯がある。
   */
  readonly wipeAndReset: () => Promise<WipeOutcome>;
}

interface VaultMeta {
  /** 32 bytes PBKDF2 salt */
  salt: Uint8Array;
  /** 12 bytes for KCV */
  iv: Uint8Array;
  /** ciphertext of KCV_PLAINTEXT under derived key */
  kcv: Uint8Array;
  /** PBKDF2 iterations */
  iterations: number;
  /**
   * リカバリー枝**専用**の反復回数 (パス 239)。
   *
   * `iterations` (上) と共用にはできない —— あちらはパスワード枝の持ち物で、
   * `changePassword` が**今の定数**へ書き換える。リカバリー枝は包み直さない
   * ので、共用にすると片方を直した瞬間にもう片方が開けなくなる。
   *
   * 欄が無い古い meta は `LEGACY_KDF_ITERATIONS` で開く。
   * (ここから下はリカバリー枝 (Phase E)。この機能より前に作られた保管庫には無い。)
   */
  recoveryIterations?: number;
  /** 32 bytes, PBKDF2 salt for recovery key */
  recoverySalt?: Uint8Array;
  /** 12 bytes, IV for KCV under recovery key */
  recoveryIv?: Uint8Array;
  /** ciphertext of KCV_PLAINTEXT under recovery key */
  recoveryKcv?: Uint8Array;
  /** 12 bytes, IV for wrapping raw master key */
  recoveryWrapIv?: Uint8Array;
  /** raw master key bytes encrypted under recovery key */
  recoveryWrappedKey?: Uint8Array;
  /**
   * Recovery-key derivation versioning.
   *   undefined → legacy (pre-PR#2): PBKDF2 input = normalized mnemonic only
   *   1         → PBKDF2 input = "service-hub-bip39-recovery-v1:" + normalized mnemonic
   *
   * Domain separation prevents a user who happens to reuse the same 24
   * words as a passphrase elsewhere (e.g. a wallet, an SSH agent) from
   * accidentally producing the same PBKDF2 output across systems. Old
   * vaults with no field are unaffected — they keep the v0 derivation
   * for backward compat on read, but are silently auto-migrated to v1
   * (new recoverySalt + v1 prefix re-wrap) on the next successful
   * recoverWithMnemonic() call. See recoverWithMnemonic() for details.
   */
  recoveryVersion?: number;
}

const RECOVERY_DERIVATION_PREFIX_V1 = 'service-hub-bip39-recovery-v1:';

interface EncryptedToken {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  /**
   * トークンレコードの版。`1` は「serviceId を AAD で束ねてある」印。
   * meta 側の blob (kcv / master-wrap / recovery) はこの欄を持たない。
   */
  v?: number;
  /**
   * 保存した時刻 (epoch ms · 平文の付随データ · 2026-10-28 · threat: T-213)。有効時間の規則
   * (`shared/credentialTtl.ts`) はこれを読み、期限切れ・日付の無い記録を**復号せずに消す**。
   * 秘密ではないので平文で持つが、**v2 からは AAD に束ねて認証する** (`tokenAadV2`) —— 書き換えると
   * 復号が失敗する。平文で持つのは有効時間の事前判定を復号前に走らせるため。
   */
  storedAt?: number;
}

const TOKEN_RECORD_V1 = 1;

const TOKEN_RECORD_V2 = 2;

/**
 * トークンを**保管場所に束ねる**ための付随データ (AES-GCM の additionalData)。
 *
 * ## なぜ要るのか (2026-08-24 に実証した)
 *
 * AES-GCM は「暗号文が改竄されていないこと」は保証するが、
 * **それがどこに置かれていたか**は何も言わない。IndexedDB へ書ける相手
 * (プロファイルに触れる者・ページに script を通せる者) は、復号できなくても
 * **レコードを別のサービスの位置へ移し替えられる**。
 *
 * 実証: `github` の暗号文を `slack` の鍵位置へ put すると、利用者が解錠した
 * あと `getToken('slack')` が **GitHub のトークンをそのまま返した**。
 * 攻撃者はマスターパスワードを一切知らないまま、**どの資格情報を
 * どのサービスへ送らせるかを選べる**。ブラウザ版は CORS 迂回の中継先を
 * 利用者が設定できる (`network/proxy.ts`) ので、送り先まで攻撃者が
 * 選べる状況では、そのまま持ち出しの経路になる。
 *
 * `serviceId` を AAD に入れると、位置が違う暗号文は**復号自体が失敗する**。
 */
function tokenAad(serviceId: string): Uint8Array {
  return hostUtf8('service-hub-token-v1:' + serviceId);
}

/**
 * v2 の付随データ —— serviceId に加えて**保存時刻を束ねる** (2026-10-30 · threat: T-230)。
 *
 * ## なぜ storedAt まで束ねるのか
 *
 * `storedAt` は有効時間 (`credentialTtl.ts`) が**復号せずに**読む平文なので、それだけでは
 * 認証されない。IndexedDB へ書ける相手 (プロファイルに触れる者・ページに script を通せる者) は
 * 鍵を知らなくても `storedAt` を書き換えられる。前方 (まだ `now` 以下) へ戻すと、本来 8 時間で
 * 期限切れになる記録が**若返り**、持ち出された保管庫の写しが期限を越えて使える (T-213 の残り穴 = T-230 ——
 * 旧版の docblock は「未来へ書き換えた物は規則が消すから信用を延ばす向きには働かない」と書いて
 * いたが**偽だった**。未来ではなく「古いが `now` 以下」へ書き換えれば若返る)。
 *
 * storedAt を AAD に入れると、書き換えた記録は**復号自体が失敗する** (GCM が AAD を認証する)。
 * 平文のままなので有効時間の事前判定 (復号前に期限切れを消す安い検査) はそのまま使え、
 * 認証は復号のときに掛かる —— 平文で読める × 書き換えると壊れる、の両立が AAD の役目である。
 *
 * encode と decode は同じ記録の `serviceId` (IDB の鍵) と `storedAt` から AAD を組むので必ず一致する。
 * 時刻が欠けた記録 (v2 を名乗るのに `storedAt` が無い = 壊れた記録) は `undefined` の綴りのまま束ねる ——
 * 書く側はその綴りを決して作らないので、復号は必ず失敗する (読めない記録として扱われる)。
 */
function tokenAadV2(serviceId: string, storedAt: number | undefined): Uint8Array {
  return hostUtf8('service-hub-token-v2:' + serviceId + ':' + storedAt);
}

function authTagAad(domain: string): Uint8Array {
  return hostUtf8('service-hub-authtag-v1:' + domain);
}

/**
 * Derive an AES-GCM-256 key from a mnemonic. Same PBKDF2 600k iter as the
 * password branch — overkill given 256-bit entropy, but maintains parity
 * and defense-in-depth if mnemonic is reused as a passphrase elsewhere.
 *
 * `version` controls domain separation of the PBKDF2 input:
 *   - undefined → legacy v0 (pre-PR#2): PBKDF2 input = mnemonic only
 *   - 1         → PBKDF2 input = RECOVERY_DERIVATION_PREFIX_V1 + mnemonic
 *
 * v1 is the default for new vaults; v0 exists strictly for backward
 * compat with vaults persisted before the prefix was introduced.
 *
 * **ここに `assertSaltBytes` は要らない** —— 2026-09-14 (パス 238) に調べて、
 * 意図的に置かないと決めた。同じ問いで一度立ち止まる人が必ず出るので理由を残す。
 *
 * パスワードの道 (`unlock` / `changePassword`) は `meta.salt` に
 * `assertSaltBytes` を掛けている。salt の仕事は**利用者をまたいだ事前計算を
 * 壊すこと**で、保管領域へ書ける相手が salt を固定値へ差し替えると、
 * **入力の取りうる範囲が狭いとき**に表が使い回せる —— パスワードはまさにそれ。
 *
 * こちらの入力は 24 語の BIP-39 (`security/mnemonic.ts`: 256 bit entropy)
 * である。2^256 に対する事前計算には意味が無いので、salt を短く・固定に
 * されても攻撃側の得る物は 0 になる。
 *
 * 反復回数は**保管値を読む** (`meta.recoveryIterations`、パス 239 で足した)。
 * 呼ぶ側が `assertKdfIterations` を掛けてから渡す —— パスワードの道と同じ扱い。
 * 2026-09-14 まではこの関数が定数を読んでいて、**定数を上げた瞬間に世に出て
 * いるリカバリーキーが全部無効になる**形だった (しかも見え方は
 * 「リカバリーキーが違います」で、原因を指さない)。
 *
 * 短い `recoverySalt` が起きたときの見え方は「リカバリーキーが違います」に
 * なる (別の鍵が出て KCV の GCM 認証が落ちる)。**保管値が壊れているのに
 * 合言葉を疑わせる**のは案内としては良くないが、断り方を変えると
 * `recoverWithMnemonic` の契約 (誤りは 1 種類の文言) が動くので、
 * 利害を測ってから触ること —— パス 237 で `loadMeta` 側に床を置いて
 * 解錠の契約を壊しかけた前例が在る (`data/recordEncryption.ts` の注記)。
 *
 * WebCrypto が使えない端末では、壁の `hostDeriveKey` がその理由の文で断る (鍵を作る口はすべて壁が守る · パス 171)。
 */
async function deriveKeyFromMnemonic(mnemonic: string, salt: Uint8Array, version: number | undefined, iterations: number): Promise<CryptoKey> {
  const normalized = normalizeMnemonic(mnemonic);
  const pbkdf2Input = version === 1 ? RECOVERY_DERIVATION_PREFIX_V1 + normalized : normalized;
  return hostDeriveKey(pbkdf2Input, salt, iterations);
}

/**
 * 鍵が KCV (復号検証用の固定文字列の暗号文) を開けるか。**投げない** —— 開けなければ false。
 *
 * AES-GCM は認証付きなので、鍵が違えば復号が投げる —— それが「違う」の答え。4 つの入口
 * (`unlock` / `verifyPassword` / `changePassword` / `recoverWithMnemonic`) がここを通り、
 * 断りの文はそれぞれの入口が持つ。
 *
 * Timing side-channel note (リカバリーの枝): 「復号の認証で落ちる」と「復号できたが中身が違う」は
 * 同じ false に畳まれる。WebCrypto は前者のほうが速く投げるが、リカバリーキーは 256-bit の
 * エントロピーを持つので、時間差から得られる物は総当たりの費用に対して無視できる。
 */
async function kcvMatches(key: CryptoKey, iv: Uint8Array, kcv: Uint8Array): Promise<boolean> {
  try {
    const plain = await hostDecryptString(key, iv, kcv);
    // 復号に成功して中身だけ違う状態は作れず到達しない (多重防御として残す)。
    // Stryker disable next-line ConditionalExpression: AES-GCM の認証が先に投げるので、復号できて中身だけ違う状態は作れない (等価)
    return plain === KCV_PLAINTEXT;
  } catch {
    return false;
  }
}

/**
 * 保存した時刻として使える値 (有限の数) なら返し、そうでなければ null。
 * 版なしの古い記録には時刻が無く、壊れた値は NaN や数でない物でありうる
 * (型だけ見ると NaN が素通りするので `Number.isFinite`)。
 */
function finiteStampOrNull(storedAt: number | undefined): number | null {
  const stamp = storedAt ?? Number.NaN;
  return Number.isFinite(stamp) ? stamp : null;
}

/**
 * 保管庫を 1 つ作る。状態 (鍵・施錠の世代・下限の判定・期限切れの知らせ) はこの関数の中に閉じ込めてあり、
 * 返した口を通してしか触れない。
 */
function createBrowserVault(): Vault {
  let currentKey: CryptoKey | null = null;
  // 施錠の世代 (2026-10-15 · パス 522 · threat: T-049)。`lock()` のたびに進む。
  // `unlock()` は PBKDF2 (600k 回・実測 100〜300 ms) の**前**に世代を控え、
  // 鍵を据える**直前**に世代が動いていれば据えずに断る。直す前は、導出中に
  // 届いた `lock()` (自動施錠・別のタブからの施錠の中継・「今すぐロック」) を
  // 解錠の完了が**上書き**しており、利用者が施錠したつもりの保管庫が
  // 解錠されたままになっていた (実測: `lock()` の直後は locked、`unlock()` の
  // 解決後は unlocked)。
  let lockToken: object = {};
  // 解錠に使われたパスワードが下限を満たしたか (メモリのみ・保存しない)。
  let policyOk: boolean | null = null;
  // 期限切れで消した記録の知らせ (serviceId → 文)。`takeExpiredNotice` が 1 度だけ返す (threat: T-213)。
  const expiredNotices = new Map<string, string>();
  // 解錠の途中で `lock()` が届いていれば、鍵を据えずに断る (T-049)。
  const assertNotLockedSince = (epoch: object) => {
  if (lockToken !== epoch) {
    throw new Error('解錠の途中で施錠されました。もう一度お試しください');
  }
};
  // 施錠されていれば投げ、そうでなければ鍵を返す。
  //
  // **`currentKey` を await の向こう側で読まないため**の入口。
  // `setToken` / `getToken` は入口で施錠を確かめた後、DB を開く・読むのを
  // 待ってから改めて鍵を使っていた。待っている間に `lock()` が走ると
  // (自動施錠はタブ非表示・放置で走る) `null` が WebCrypto へ渡り、
  //
  //   setToken → `Failed to execute 'encrypt' on 'SubtleCrypto': 2nd
  //              argument is not of type CryptoKey` という**内部の文言**が
  //              利用者に出る (実測)
  //   getToken → 例外が復号の失敗として飲まれ、
  //              **「トークン未設定」と区別が付かなくなる** (実測)
  //
  // 後者が厄介で、呼び出し側は `not_configured` として扱うので、
  // 設定済みの資格情報について「設定されていません」と言ってしまう。
  const requireKey = () => {
  if (!currentKey) {
    throw new Error('Vault がロックされています');
  }
  return currentKey;
};
  // 旧形式のトークンを現行 (v2 · serviceId + storedAt を束ねる) で保存し直す。失敗しても読み出しは成功させる。
  const rebindToken = async (serviceId: string, token: string, storedAt: number | undefined) => {
  const key = requireKey();
  // storedAt が無い (版なしの古い記録) か有限でない (壊れた値) なら今の時刻から有効時間を数え直す。
  // AAD と保存欄で同じ値。
  const stamp = finiteStampOrNull(storedAt) ?? Date.now();
  const blob = await hostEncryptString(key, token, tokenAadV2(serviceId, stamp));
  const db = await hostOpenDb(STORES);
  try {
    await hostPut(db, TOKEN_STORE, serviceId, { ...blob, v: TOKEN_RECORD_V2, storedAt: stamp });
  } finally {
    db.close();
  }
};
  // 日付の無い記録に時刻を付けて書き戻す (復号しない・鍵も要らない)。
  const stampToken = async (serviceId: string, blob: EncryptedToken) => {
  const db = await hostOpenDb(STORES);
  try {
    await hostPut(db, TOKEN_STORE, serviceId, blob);
  } finally {
    db.close();
  }
};
  // 期限切れの記録を消す (復号しない・鍵も要らない)。
  const purgeToken = async (serviceId: string) => {
  const db = await hostOpenDb(STORES);
  try {
    await hostDelete(db, TOKEN_STORE, serviceId);
  } finally {
    db.close();
  }
};
  // 保存した時刻だけを見て、期限切れの記録を全部消し、日付の無い記録に時刻を付ける
  // (解錠時と一覧で呼ぶ · threat: T-213)。復号しないので鍵は要らない。
  const sweepExpiredTokens = async () => {
  const now = Date.now();
  const db = await hostOpenDb(STORES);
  // 集合にする —— 配列の初期値に異物を入れる変異は「無い鍵の削除」が何もせず外から見えない
  // (`rebindLegacyTokens` の `pending` と同じ形の等価変異)。戻り値も誰も読まないので返さない。
  const expired = new Set<string>();
  try {
    for (const id of await hostKeys(db, TOKEN_STORE)) {
      const found = await hostGet<EncryptedToken>(db, TOKEN_STORE, id);
      // Stryker disable next-line ConditionalExpression,BlockStatement: 鍵の一覧が返した鍵は在る。無いのは鍵の一覧と取得の間に消された記録だけで、その窓は fake-indexeddb では作れない (等価変異)。
      if (!found) {
        continue;
      }
      if (found.storedAt === undefined) {
        await hostPut(db, TOKEN_STORE, id, { ...found, storedAt: now });
      } else if (storedCredentialExpired(found.storedAt, now)) {
        expired.add(id);
      }
    }
    for (const id of expired) {
      await hostDelete(db, TOKEN_STORE, id);
    }
  } finally {
    db.close();
  }
  for (const id of expired) {
    expiredNotices.set(id, expiredStoredCredentialMessage(id));
  }
};
  // 解錠のたびに、版の無いレコードを全部束ね直す。
  //
  // `getToken` 側だけの移行だと、**一度も読まれないトークンは旧形式のまま残る**
  // —— 付け替え攻撃はまさにそういうレコードを狙える。best-effort (失敗しても
  // 解錠は成功させる) だが、通常の利用で 1 回解錠すれば窓は閉じる。
  const rebindLegacyTokens = async () => {
  // **接続は 1 本で済ませる。** 以前は id ごとに DB を開閉して
  // おり、しかも「もう v1 だから何もしない」の判定はその**後**だった ——
  // 設定済みサービスが 20 件なら、解錠 1 回につき 21 往復が全部空振りする
  // (自動施錠からのタブ復帰・再読込のたび)。id ごとの開閉は、
  // アプリの他所が使っている DB に対する `versionchange` / `blocked` の
  // 窓も広げていた (2026-08-28)。
  const db = await hostOpenDb(STORES);
  // **この関数の変異は、下のループの `catch` がまとめて飲む。**
  //
  // 束ね直しは best-effort (失敗しても解錠は成功させる) なので、選び方を
  // どう狂わせても「読めなかったレコードは触らない」に落ちて、外からは
  // 何も変わらない。実測 2026-08-31 で等価と分かった形:
  //
  //   - 初期値の配列に異物が入る → 欄が undefined になり復号が投げる
  //   - 条件を `true` に      → v1 / v2 のレコードまで積むが、AAD 無しで開こうと
  //                             して必ず失敗する (GCM が AAD を認証する)
  //   - `&&` を `||` に        → `found` が undefined なら TypeError だが、
  //                             鍵の一覧が返した鍵なので undefined は無い。
  //                             仮に投げても呼び出し側が飲む
  //
  // 飲む側を外すのは**直しではない** —— 解錠が旧レコード 1 本の
  // 破損で失敗するようになる。選び方の側を測れる形にするには書き込み結果を
  // 数える口が要り、それは検査のためだけの API になる。
  // Stryker disable next-line ArrayDeclaration: 上の注記のとおり (異物の欄は undefined になり、復号が投げて下の catch が飲む · 等価変異)
  const pending: { id: string; blob: EncryptedToken }[] = [];
  try {
    for (const id of await hostKeys(db, TOKEN_STORE)) {
      const found = await hostGet<EncryptedToken>(db, TOKEN_STORE, id);
      // ここは AAD 無しで復号する (下のループ) ので、束ね直せるのは**版の無い**
      // (AAD 導入前の) レコードだけ。v1 / v2 は既に AAD 付きで、v1 → v2 の昇格は
      // `getToken` が読んだときに行う。**ここで落とすので I/O も起きない。**
      // Stryker disable next-line ConditionalExpression,LogicalOperator: 上の注記のとおり (v1 / v2 を積んでも AAD 無しの復号が必ず失敗して飲まれる · 等価変異)
      if (found && found.v === undefined) {
        pending.push({ id: id, blob: found });
      }
    }
  } finally {
    db.close();
  }
  for (const p of pending) {
    const key = currentKey;
    // 途中で施錠されたら止める。
    // Stryker disable next-line ConditionalExpression,BlockStatement: 早期 return を外しても、鍵の無い復号が投げて下の catch が飲むので、観測できる差が無い (等価変異)。意図 —— 施錠された後は仕事を続けない —— を残すために書く。
    if (!key) return;
    try {
      const plain = await hostDecryptString(key, p.blob.iv, p.blob.ciphertext);
      await rebindToken(p.id, plain, p.blob.storedAt);
    } catch {
      // 読めないレコードは触らない (壊れている / 別の鍵で書かれている)
    }
  }
};
  return { status: async () => {
  let db: IDBDatabase;
  // DB を開けない環境 (プライベートウィンドウ・保存領域が一杯) は
  // 「保管庫が無い」ではなく「確認できない」。
  try {
    db = await hostOpenDb(STORES);
  } catch {
    return 'unreadable';
  }
  let meta: VaultMeta | undefined;
  let readFailed = false;
  try {
    meta = await hostGet<VaultMeta>(db, META_STORE, 'vault');
  } catch {
    readFailed = true;
  } finally {
    db.close();
  }
  if (readFailed) return 'unreadable';
  if (!meta) return 'uninitialized';
  return currentKey ? 'unlocked' : 'locked';
}, isUnlocked: () => currentKey !== null, initialize: async (password: string) => {
  // 12 chars minimum (raised from 8 in the 2026-07 audit). The stored `kcv`
  // and `master-wrap` both let anyone holding a copy of the IndexedDB verify a
  // guess offline, so password entropy is the only thing standing between a
  // stolen browser profile and every SaaS token in the vault; 600k PBKDF2
  // slows each guess but cannot rescue an 8-char human-chosen password.
  // Existing vaults are unaffected — `unlock()` never re-checks policy.
  if (typeof password !== 'string' || !meetsPasswordPolicy(password)) {
    throw new Error('パスワードは ' + MIN_PASSWORD_LENGTH + ' 文字以上で設定してください');
  }
  if (moreThanChars(password, MAX_PASSWORD_CHARS)) {
    throw new Error('パスワードが長すぎます (' + MAX_PASSWORD_CHARS + ' 字以内)');
  }
  // threat: T-063 —— 初期化のあいだに届いた施錠を、初期化の完了が上書きしない (`unlock` の T-049 と同じ)。
  // **最初の await より前に**世代を取る (DB を開いた後ろだと、その窓に届いた施錠を見落とす)。
  const epoch = lockToken;
  const db = await hostOpenDb(STORES);
  try {
    // 「既に在るか」は**書く所の `add`** (下 · T-064) だけが決める。以前はここで meta を先読みして
    // 断っていたが、その読みと書きは別の取引なので 2 つの窓の同時初期化を止められず、`add` を
    // 足した後は先読みが何も決めない写しになっていた (先読みを外しても答えが同じ = 等価変異 ·
    // パス 550)。門は 1 つにする。
    // 1. Generate raw master key (extractable so we can wrap it).
    const masterKey = await hostGenerateMasterKey();
    const masterRaw = await hostExportRawKey(masterKey);
    // Defense-in-depth: ensure masterRaw is zeroed on every exit path
    // (success, exception during wrap, IDB write failure). Without this
    // wrapper, an exception between the export and the explicit zeroing
    // could leak the 32-byte master key to V8 heap / pagefile.
    try {
      // 2. Password branch: derive key from password, store KCV + password-wrap of master.
      const salt = hostRandomBytes(SALT_BYTES);
      const passwordKey = await hostDeriveKey(password, salt, PBKDF2_ITERATIONS);
      const kcv = await hostEncryptString(passwordKey, KCV_PLAINTEXT);
      const passwordWrappedMaster = await hostEncryptBytes(passwordKey, masterRaw);
      // 3. Recovery branch: 256-bit entropy → BIP-39 24 words → PBKDF2 → wrap master.
      //    v1 includes a domain-separation prefix in the PBKDF2 input.
      const entropy = generateEntropy();
      const mnemonic = await encodeMnemonic(entropy);
      const recoverySalt = hostRandomBytes(SALT_BYTES);
      const recoveryKey = await deriveKeyFromMnemonic(mnemonic, recoverySalt, 1, PBKDF2_ITERATIONS);
      const recoveryKcv = await hostEncryptString(recoveryKey, KCV_PLAINTEXT);
      const recoveryWrap = await hostEncryptBytes(recoveryKey, masterRaw);
      const meta: VaultMeta = { salt: salt, iv: kcv.iv, kcv: kcv.ciphertext, iterations: PBKDF2_ITERATIONS, recoveryIterations: PBKDF2_ITERATIONS, recoverySalt: recoverySalt, recoveryIv: recoveryKcv.iv, recoveryKcv: recoveryKcv.ciphertext, recoveryWrapIv: recoveryWrap.iv, recoveryWrappedKey: recoveryWrap.ciphertext, recoveryVersion: 1 };
      // meta と master-wrap は **1 トランザクションで**入れ替える
      // (2026-09-21 · パス 361)。壁の `hostPutAll` の docblock が「1 件ずつ 2 回書くと
      // トランザクションが 2 つになる。パスワード周りではこれが効く」と警告している
      // 当のことを、**初期化だけがやっていた** (`changePassword` と
      // `recoverWithMnemonic` は最初から 1 取引)。
      //
      // ## 実測 (2026-09-21) —— 2 つ目が落ちた状態は「静かに使える」
      //
      // meta だけ書けて master-wrap が書けなかった金庫を作って測ると:
      //
      //   unlock(password)      → 成功する (kcv は passwordKey を指すので通る)
      //   setToken / getToken   → 往復する (currentKey = passwordKey)
      //   recoverWithMnemonic   → 以後 TOKEN LOST (null)
      //
      // `unlock` は master-wrap が無い金庫を **Phase E 以前の旧形式**と見なして
      // 実効鍵を passwordKey へ倒す (それ自体は正しい前方互換)。つまり
      // **利用者は動く金庫を見るので設定をやり直さない** —— しかも `initialize` は
      // meta が在れば「既に初期化されています」と断るので**やり直せない**。
      // その間に保存したトークンは passwordKey で包まれるが、meta の
      // `recoveryWrappedKey` が包んでいるのは**本物の master 鍵**なので、
      // 利用者が大事に控えた 24 語で復旧した瞬間に実効鍵が入れ替わり、
      // **それまでのトークンが全部読めなくなる**。
      //
      // ## 断る側には倒さない
      //
      // 「meta が Phase E を名乗るのに master-wrap が無ければ unlock を断る」は
      // **既にこの状態に居る利用者にとって改悪**である —— 今は読めているトークンが
      // その場で読めなくなり、復旧しても失われる結末は変わらない。master-wrap は
      // master 鍵が無いと作れず、master 鍵は復旧枝からしか出てこないので、
      // 解錠時に**直す**こともできない。だから塞ぐのは**作る側**だけにする。
      //
      // threat: T-064 —— **`add` で書く** (2026-10-15 · パス 523)。「既に在るか」の読み取りと
      // この書き込みを別の取引にすると、初回の設定画面を 2 つの窓で同時に済ませたとき両方が通り、
      // 後の方の meta / master-wrap が前の方を上書きしていた (実測: A・B とも fulfilled・24 語を
      // 2 組見せ・負けた窓はその場では動く (自分の master 鍵を持つ) が、再読込後はその窓が
      // 保存したトークンが全部 null・その窓の 24 語は「リカバリーキーが違います」)。
      // `add` は鍵が既に在れば ConstraintError で取引ごと abort するので、2 つ目は必ず断られる。
      try {
        await hostPutAll(db, [{ store: META_STORE, key: 'vault', value: meta }, { store: META_STORE, key: 'master-wrap', value: { iv: passwordWrappedMaster.iv, ciphertext: passwordWrappedMaster.ciphertext } }], true);
      } catch (err) {
        // DOMException は環境によって Error を継がないので名前だけで見る。
        // 別の理由 (容量・閉じた DB) はそのまま投げる —— 「既に初期化」と偽らない。
        if (hostErrorName(err) === 'ConstraintError') {
          throw new Error('Vault は既に初期化されています');
        }
        throw err;
      }
      // 4. Re-import the key non-extractable for runtime use.
      const nonExtractable = await hostImportNonExtractable(masterRaw);
      // threat: T-063 —— 導出のあいだに `lock()` が届いていれば鍵は据えない (保管庫は書けている。
      // 利用者は今決めたパスワードで解錠する)。
      if (lockToken === epoch) {
        currentKey = nonExtractable;
      }
      // ここに来る時点で下限を強制済み。
      policyOk = true;
      return { mnemonic: mnemonic };
    } finally {
      hostZero(masterRaw);
    }
  } finally {
    db.close();
  }
}, unlock: async (password: string) => {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('パスワードを入力してください');
  }
  // 世代は**最初の await より前**に控える (T-049)。解錠を頼んだ後に届いた
  // 施錠はどれも解錠より新しい意思なので、導出の前後を問わず勝たせる。
  const epoch = lockToken;
  // **下限は強制しない (既存のヴォールトを閉め出さないため) が、測りはする。**
  // 2026-07 に 8 → 12 へ上げる前に作られたヴォールトは短いままで、
  // 利用者はそれを知る術が無かった。診断がこの値を見て伝える。
  const meetsPolicy = meetsPasswordPolicy(password);
  const db = await hostOpenDb(STORES);
  let meta: VaultMeta | undefined;
  let masterWrap: EncryptedToken | undefined;
  try {
    meta = await hostGet<VaultMeta>(db, META_STORE, 'vault');
    masterWrap = await hostGet<EncryptedToken>(db, META_STORE, 'master-wrap');
  } finally {
    db.close();
  }
  if (!meta) {
    throw new Error('Vault が未初期化です。初回設定を完了してください');
  }
  // 反復回数はメタから読む = 保存側の値をそのまま信じることになる。壊れた/
  // 差し替えられたメタが途方もない回数を要求すると PBKDF2 が返らず、
  // **利用者が自分の資格情報から永久に締め出される**。dataCrypto は同じ検査を
  // 最初から持っていたのに、資格情報そのものを持つこちらが素通しだった。
  assertKdfIterations(meta.iterations);
  // 隣の欄も同じ出どころ (IndexedDB)。2026-08-27 まで salt だけ素通しだった。
  assertSaltBytes(meta.salt);
  const passwordKey = await hostDeriveKey(password, meta.salt, meta.iterations);
  if (!await kcvMatches(passwordKey, meta.iv, meta.kcv)) {
    throw new Error('パスワードが違います');
  }
  // Phase E: if master-wrap exists, decrypt master from password-wrapped form.
  // Legacy vaults (pre Phase E) lack master-wrap; in those the passwordKey
  // itself was the encryption key. Fall back gracefully.
  if (masterWrap) {
    const masterRaw = await hostDecryptBytes(passwordKey, masterWrap.iv, masterWrap.ciphertext);
    // finally: zero the raw master even if the import rejects, matching
    // initialize() / recoverWithMnemonic() (2026-07 audit — memory hygiene).
    try {
      const key = await hostImportNonExtractable(masterRaw);
      assertNotLockedSince(epoch);
      currentKey = key;
    } finally {
      hostZero(masterRaw);
    }
  } else {
    assertNotLockedSince(epoch);
    currentKey = passwordKey;
  }
  // 解錠できたパスワードについてだけ記録する (失敗すればここへ来ない)。
  policyOk = meetsPolicy;
  // 解錠できて初めて旧形式を読めるので、ここで束ね直す。
  // threat: T-213 —— 期限切れは解錠のたびに消す (失敗しても解錠は通す)
  await sweepExpiredTokens().catch(() => {

});
  await rebindLegacyTokens().catch(() => {

});
}, verifyPassword: async (password: string) => {
  if (typeof password !== 'string' || password.length === 0) return false;
  const db = await hostOpenDb(STORES);
  let meta: VaultMeta | undefined;
  try {
    meta = await hostGet<VaultMeta>(db, META_STORE, 'vault');
  } finally {
    db.close();
  }
  if (!meta) {
    throw new Error('Vault が未初期化です。初回設定を完了してください');
  }
  // `unlock()` と同じ門 (壊れた・差し替えられた meta で PBKDF2 が返らない形を断る)。
  assertKdfIterations(meta.iterations);
  assertSaltBytes(meta.salt);
  const passwordKey = await hostDeriveKey(password, meta.salt, meta.iterations);
  return kcvMatches(passwordKey, meta.iv, meta.kcv);
}, lock: () => {
  // 世代は数ではなく**新しい物の同一性**で表す —— 数を増やす形だと、増やす向きを変える変異体が
  // 等価 (値が違えば何でもよい) で残る (パス 522 の変異検査)。
  lockToken = {};
  currentKey = null;
  // 施錠したら「分からない」に戻す。前回の判定を持ち越さない。
  policyOk = null;
}, passwordMeetsPolicy: () => policyOk, setToken: async (serviceId: string, token: string) => {
  const key = requireKey();
  if (typeof serviceId !== 'string' || serviceId.length === 0 || serviceId.length > 64) {
    throw new Error('serviceId が不正です');
  }
  if (typeof token !== 'string' || token.length === 0 || countChars(token) > MAX_TOKEN_CHARS) {
    throw new Error('token が不正です (1-' + MAX_TOKEN_CHARS + ' 字)');
  }
  // **保管層の床 (2026-09-14 · パス 245)。**
  //
  // パス 244 は資格情報の**入口**を `shared/tokenInput.ts` の規則へ通したが、
  // ここを**直接**叩く書き込みが残っていた —— `SettingsPage.tsx` の Google
  // トークン 4 本は画面の関門を経由しない。中身は認可サーバの発行値なので
  // 制御文字は入りにくいが、**「入りにくい」は関門ではない**。制御文字がヘッダに載ると
  // ヘッダの構築が値ごと文面に載せて投げ、その文面は画面へ出る
  // (`shared/__tests__/headerValueLeak.test.ts` が 10 経路で実測)。
  //
  // 入口を 1 本ずつ数えて塞ぐ形は「n か所のうち n-1 か所を直した」を生むので、
  // **床はここに置く**。規則の綴りは `hasControlChars` だけが持つ。
  //
  // **限界**: `JSON.stringify` は制御文字をエスケープ列へ逃がすので、
  // 包んだ値 (assistant のマルチプロバイダ資格情報) は床を通る。包みの中は
  // 包む側の画面が断る (`AssistantPage.saveAgentCreds`・パス 244)。
  if (hasControlChars(token)) {
    throw new Error(CONTROL_CHAR_MESSAGE);
  }
  const db = await hostOpenDb(STORES);
  try {
    // 待っている間に施錠されていたら、**書かずに**施錠の文言で落とす。
    // 掴んだ鍵で書き切る手も有るが、それは「施錠した」と言いながら
    // 書き込みを続けることになる。
    requireKey();
    // storedAt は AAD と保存欄で**同じ値**を使う (threat: T-213) —— 1 度だけ読む。
    const storedAt = Date.now();
    const blob = await hostEncryptString(key, token, tokenAadV2(serviceId, storedAt));
    await hostPut(db, TOKEN_STORE, serviceId, { ...blob, v: TOKEN_RECORD_V2, storedAt: storedAt });
  } finally {
    db.close();
  }
}, getToken: async (serviceId: string) => {
  const key = requireKey();
  const db = await hostOpenDb(STORES);
  let blob: EncryptedToken | undefined;
  try {
    blob = await hostGet<EncryptedToken>(db, TOKEN_STORE, serviceId);
  } finally {
    db.close();
  }
  if (!blob) return null;
  // 有効時間 (threat: T-213)。期限切れの記録は**復号せずに消す** —— 使い捨て。
  // 消したことは `takeExpiredNotice` で 1 度だけ利用者に言える (「未設定」と混ぜない)。
  // 日付の無い記録 (この規則より前の物) には最初に見た時刻を付け、そこから有効時間が始まる。
  if (blob.storedAt === undefined) {
    blob = { ...blob, storedAt: Date.now() };
    await stampToken(serviceId, blob).catch(() => {

});
  } else if (storedCredentialExpired(blob.storedAt, Date.now())) {
    await purgeToken(serviceId).catch(() => {

});
    expiredNotices.set(serviceId, expiredStoredCredentialMessage(serviceId));
    return null;
  }
  // 待っている間に施錠されたなら、それは「未設定」ではない。
  // 下の `.catch` は**復号の失敗** (鍵違い・壊れた blob) だけを飲む。
  requireKey();
  // AAD が合わない = **置き場所が違う / 保存時刻が書き換えられている**。鍵違いと同じ
  // 扱いで黙って断る。ここより下の分岐はすべて `.catch(() => null)` で書く:
  //
  // `try/catch` ではなく `.catch()` で書く理由 (2026-08-31): catch の
  // **中身を空にする変異が等価**だった —— 空にすると下の経路へ落ちるが、AAD つきで
  // 封緘された物を違う AAD (無し・v1) で開こうとして必ず失敗する (GCM が AAD まで
  // 認証するのが、まさにこの AAD の目的である) ので、結局 null を返す。
  // **同じ結果に 2 つの道がある形**が変異体を測れなくしていた。
  // `.catch(() => null)` の `null` は `vaultRecordBinding.test.ts` の
  // `toBeNull()` が留めている (undefined へ変えると鳴る)。
  if (blob.v === TOKEN_RECORD_V2) {
    // serviceId と storedAt を束ねた現行形式 (threat: T-213)。保存時刻を書き換えると
    // AAD が合わず復号が失敗する —— ここが鮮度の認証そのもの。
    return await hostDecryptString(key, blob.iv, blob.ciphertext, tokenAadV2(serviceId, blob.storedAt)).catch(() => null);
  }
  if (blob.v === TOKEN_RECORD_V1) {
    // serviceId だけ束ねた旧形式。読めたら storedAt まで束ねた v2 へその場で上げ直す
    // (有効時間 8 時間なので、残る v1 はこの 1 度の読みか再保存で必ず消える)。
    const plainV1 = await hostDecryptString(key, blob.iv, blob.ciphertext, tokenAad(serviceId)).catch(() => null);
    if (plainV1 !== null) {
      await rebindToken(serviceId, plainV1, blob.storedAt).catch(() => {

});
    }
    return plainV1;
  }
  // 版の無いレコードは AAD を導入する前のもの。読めたらその場で束ね直す
  // (この 1 回だけ付け替え攻撃が通る窓が残るので、解錠時にも一括で直す)。
  const plain = await hostDecryptString(key, blob.iv, blob.ciphertext).catch(() => null);
  if (plain === null) return null;
  await rebindToken(serviceId, plain, blob.storedAt).catch(() => {

});
  return plain;
}, clearToken: async (serviceId: string) => {
  // Require an unlocked vault and a sane id, like setToken/getToken. Deleting
  // is not a confidentiality leak, but a locked vault should be inert
  // (2026-07 audit).
  requireKey();
  if (typeof serviceId !== 'string' || serviceId.length === 0 || serviceId.length > 64) {
    throw new Error('serviceId が不正です');
  }
  const db = await hostOpenDb(STORES);
  try {
    await hostDelete(db, TOKEN_STORE, serviceId);
  } finally {
    db.close();
  }
}, listConfigured: async () => {
  // 期限切れは一覧にも出さず、その場で消す (threat: T-213)。鍵は要らない (時刻は平文)。
  await sweepExpiredTokens();
  const db = await hostOpenDb(STORES);
  try {
    return await hostKeys(db, TOKEN_STORE);
  } finally {
    db.close();
  }
}, takeExpiredNotice: (serviceId: string) => {
  // 期限切れで消したことを 1 度だけ返す (画面が「未設定」の代わりに理由を言うため)。
  const notice = expiredNotices.get(serviceId) ?? null;
  expiredNotices.delete(serviceId);
  return notice;
}, authTag: async (domain: string, data: string) => {
  // `data` に master 鍵で認証タグを付ける (`VaultAuthTag` の docblock に用途と限界)。
  // **ロック中は投げる** (鍵が無いと作れない —— `setToken` と同じ扱い)。
  const key = requireKey();
  const sealed = await hostEncryptString(key, data, authTagAad(domain));
  return { iv: sealed.iv, ciphertext: sealed.ciphertext };
}, verifyAuthTag: async (domain: string, data: string, tag: VaultAuthTag | null | undefined) => {
  // `tag` が今の `data` を (この `domain` で) 認証しているか。
  // **ロック中・タグの形が壊れている・鍵違い・改竄はすべて false** —— 「検証できない」はすべて
  // 「検証失敗」に畳む (呼び出し側が「使える」と誤認しないため)。GCM が改竄を検知し、復号できた
  // 平文を元の `data` と**定数時間**で比べる。
  const key = currentKey;
  // Stryker disable next-line ConditionalExpression: 早期 return を外しても、鍵の無い復号が下の try の中で投げて catch が false を返すので、観測できる差が無い (等価変異)。意図 —— 施錠中は検証しない —— を残すために書く
  if (!key) return false;
  // IndexedDB の structured clone や jsdom とのレルム違いで Uint8Array の同一性が崩れうるので、
  // 型の同一性ではなく「バイト列の眺めか」で見る (壁の `hostIsBufferView`)。
  // Stryker disable next-line ConditionalExpression: 条件を丸ごと偽にしても、形の壊れたタグは下の try の中で (欄の読みか復号が) 投げて catch が false を返すので、観測できる差が無い (等価変異)。個々の判定を反転する変異は検査が落とす
  if (!tag || !hostIsBufferView(tag.iv) || !hostIsBufferView(tag.ciphertext)) return false;
  try {
    const plain = await hostDecryptString(key, tag.iv, tag.ciphertext, authTagAad(domain));
    return constantTimeEquals(plain, data);
  } catch {
    return false;
  }
}, changePassword: async (oldPassword: string, newPassword: string) => {
  // --- Phase E: recovery API ----------------------------------------
  if (typeof oldPassword !== 'string' || oldPassword.length === 0) {
    throw new Error('現在のパスワードを入力してください');
  }
  if (typeof newPassword !== 'string' || !meetsPasswordPolicy(newPassword)) {
    throw new Error('新しいパスワードは ' + MIN_PASSWORD_LENGTH + ' 文字以上で設定してください');
  }
  if (moreThanChars(newPassword, MAX_PASSWORD_CHARS)) {
    throw new Error('新しいパスワードが長すぎます (' + MAX_PASSWORD_CHARS + ' 字以内)');
  }
  // threat: T-063 —— 変更のあいだ (PBKDF2 ×2 の窓) に届いた施錠を、変更の完了が上書きしない
  // (2026-10-15 · パス 523)。`unlock()` だけが T-049 の世代を見ており、`changePassword` /
  // `recoverWithMnemonic` / `initialize` は見ていなかった —— 実測: 導出中に `lock()` → 完了後
  // `isUnlocked() === true`・トークンも読める。施錠された保管庫で「パスワード変更」を押すと
  // (旧パスワードを打つので正当な操作) **解錠までされていた**。鍵を据えるのは、操作の開始から
  // 施錠が 1 度も届いていないときだけ。保管庫の書き換え (新しいパスワード) はそのまま通す ——
  // 利用者の求めた 2 つ (パスワードを変える・施錠する) を両方そのまま叶える。
  // 施錠された保管庫の変更は**解錠にしない** (変更は `unlock` ではない —— 解錠の入口は 1 つ)。
  const epoch = lockToken;
  const unlockedAtStart = currentKey !== null;
  const db = await hostOpenDb(STORES);
  try {
    const meta = await hostGet<VaultMeta>(db, META_STORE, 'vault');
    if (!meta) {
      throw new Error('Vault が未初期化です');
    }
    const masterWrap = await hostGet<EncryptedToken>(db, META_STORE, 'master-wrap');
    // 旧パスワードの検証は unlock と同じ手順 (反復回数の範囲確認 → KCV)。
    assertKdfIterations(meta.iterations);
    // 隣の欄も同じ出どころ (IndexedDB)。2026-08-27 まで salt だけ素通しだった。
    assertSaltBytes(meta.salt);
    const oldPasswordKey = await hostDeriveKey(oldPassword, meta.salt, meta.iterations);
    if (!await kcvMatches(oldPasswordKey, meta.iv, meta.kcv)) {
      throw new Error('現在のパスワードが違います');
    }
    const newSalt = hostRandomBytes(SALT_BYTES);
    const newPasswordKey = await hostDeriveKey(newPassword, newSalt, PBKDF2_ITERATIONS);
    const newKcv = await hostEncryptString(newPasswordKey, KCV_PLAINTEXT);
    // リカバリー枝はそのまま (控えた 24 語が生き続ける)。
    const newMeta: VaultMeta = { ...meta, salt: newSalt, iv: newKcv.iv, kcv: newKcv.ciphertext, iterations: PBKDF2_ITERATIONS };
    if (masterWrap) {
      // Phase E: マスター鍵を包み直すだけ。**トークンには一切触らない。**
      const masterRaw = await hostDecryptBytes(oldPasswordKey, masterWrap.iv, masterWrap.ciphertext);
      try {
        const newMasterWrap = await hostEncryptBytes(newPasswordKey, masterRaw);
        await hostPutAll(db, [{ store: META_STORE, key: 'vault', value: newMeta }, { store: META_STORE, key: 'master-wrap', value: { iv: newMasterWrap.iv, ciphertext: newMasterWrap.ciphertext } }], false);
        // 実効鍵 (master 鍵) は変わらないので、据え直す物は無い —— 解錠中ならそのまま解錠中、
        // 施錠中 (開始時・変更の途中 · T-063) ならそのまま施錠中。以前はここで同じ master 鍵を
        // 読み込み直して据えていたが、同じ鍵を同じ所へ置くだけなので外から見えず、その条件は
        // 等価変異だった (パス 550)。鍵を据える判断は旧世代路 (下) だけに在る。
        // newPassword は下限を強制済み —— ここで「短い」状態は解消する。
        // **この 1 行が下の枝にしか無かった** (2026-08-28)。master-wrap 枝は
        // Phase E の保管庫すべてが通る通常路なので、利用者が案内どおりに
        // 直しても診断が同じ指摘を出し続けていた (施錠→解錠まで消えない)。
        policyOk = true;
      } finally {
        hostZero(masterRaw);
      }
      return;
    }
    // Phase E 以前: マスター鍵が無く、トークンは**パスワード鍵そのもの**で
    // 暗号化されている。したがって包み直しでは済まず、全部を読み替える。
    // 書き込みは meta と全トークンを **1 トランザクション**にまとめるので、
    // 途中で落ちても旧パスワードの保管庫がそのまま残る。
    const ids = await hostKeys(db, TOKEN_STORE);
    const rewritten: VaultWrite[] = [{ store: META_STORE, key: 'vault', value: newMeta }];
    for (const id of ids) {
      const blob = await hostGet<EncryptedToken>(db, TOKEN_STORE, id);
      // Stryker disable next-line ConditionalExpression,BlockStatement: `ids` は直前に鍵の一覧が返した実在の鍵なので `blob` が空になる経路が無い。潰すと `blob.v` で TypeError になるが、そこへ到達できない (等価変異)。
      if (!blob) {
        continue;
      }
      // **読む側は 3 つの形を扱う。** `getToken` と同じ判定 —— v2 は serviceId と
      // storedAt を、v1 は serviceId だけを AAD で束ね、版の無いものは AAD 導入前
      // (2026-08-24) の記録である。Phase E 以前の保管庫は AAD 以前より更に古いので、
      // **ここは必ず最後を通る**。無条件に AAD を要求するとレガシー利用者は
      // パスワードを変更できなくなる (最初そう書いていた)。
      let plain: string;
      if (blob.v === TOKEN_RECORD_V2) {
        plain = await hostDecryptString(oldPasswordKey, blob.iv, blob.ciphertext, tokenAadV2(id, blob.storedAt));
      } else if (blob.v === TOKEN_RECORD_V1) {
        plain = await hostDecryptString(oldPasswordKey, blob.iv, blob.ciphertext, tokenAad(id));
      } else {
        plain = await hostDecryptString(oldPasswordKey, blob.iv, blob.ciphertext);
      }
      // 書く側は常に新しい形 (v2) にする —— 変更を機に serviceId と storedAt へ束ね直す。
      // 保存した時刻は引き継ぐ (落とすと「日付が無い = 期限切れ」で全部消える · threat: T-213)。
      // 版の無い記録には時刻が無いので、`getToken` の束ね直しと同じく今の時刻を付ける
      // (AAD と保存欄で同じ値を使う)。
      const stamp = finiteStampOrNull(blob.storedAt) ?? Date.now();
      const next = await hostEncryptString(newPasswordKey, plain, tokenAadV2(id, stamp));
      rewritten.push({ store: TOKEN_STORE, key: id, value: { ...next, v: TOKEN_RECORD_V2, storedAt: stamp } });
    }
    await hostPutAll(db, rewritten, false);
    // threat: T-063
    if (unlockedAtStart && lockToken === epoch) {
      currentKey = newPasswordKey;
    }
    // newPassword は下限を強制済み —— ここで「短い」状態は解消する。
    policyOk = true;
  } finally {
    db.close();
  }
}, recoverWithMnemonic: async (mnemonic: string, newPassword: string) => {
  if (typeof newPassword !== 'string' || !meetsPasswordPolicy(newPassword)) {
    throw new Error('新しいパスワードは ' + MIN_PASSWORD_LENGTH + ' 文字以上で設定してください');
  }
  if (moreThanChars(newPassword, MAX_PASSWORD_CHARS)) {
    throw new Error('新しいパスワードが長すぎます (' + MAX_PASSWORD_CHARS + ' 字以内)');
  }
  // threat: T-063 —— 復旧のあいだに届いた施錠を、復旧の完了が上書きしない (changePassword と同じ)。
  // **最初の await (decodeMnemonic) より前に**世代を取る。
  const epoch = lockToken;
  // Validate mnemonic BEFORE opening IDB (cheap rejection → no leaked
  // connection if mnemonic is malformed / has unknown words / bad checksum).
  await decodeMnemonic(mnemonic);
  const db = await hostOpenDb(STORES);
  try {
    const meta = await hostGet<VaultMeta>(db, META_STORE, 'vault');
    if (!meta) {
      throw new Error('Vault が未初期化です');
    }
    if (!meta.recoverySalt || !meta.recoveryIv || !meta.recoveryKcv || !meta.recoveryWrapIv || !meta.recoveryWrappedKey) {
      throw new NoRecoveryBranchError();
    }
    // Derive recovery key, verify KCV (`kcvMatches` の注記に timing の話)。
    // Use the same version the vault was initialized under, so legacy
    // (v0, prefix-less) and new (v1, prefixed) vaults both work.
    //
    // 反復回数も**その金庫が使った回数**で導出する (パス 239)。欄が出来る前に
    // 書かれた meta には無いので、凍結値へ倒す。範囲の確認はパスワードの道
    // (`unlock` / `changePassword`) と同じ —— 保存領域から来た数だから。
    const recoveryIterations = meta.recoveryIterations ?? LEGACY_KDF_ITERATIONS;
    assertKdfIterations(recoveryIterations);
    const recoveryKey = await deriveKeyFromMnemonic(mnemonic, meta.recoverySalt, meta.recoveryVersion, recoveryIterations);
    if (!await kcvMatches(recoveryKey, meta.recoveryIv, meta.recoveryKcv)) {
      throw new Error('リカバリーキーが違います');
    }
    // Unwrap master, re-wrap under new password.
    const masterRaw = await hostDecryptBytes(recoveryKey, meta.recoveryWrapIv, meta.recoveryWrappedKey);
    try {
      const newSalt = hostRandomBytes(SALT_BYTES);
      const newPasswordKey = await hostDeriveKey(newPassword, newSalt, PBKDF2_ITERATIONS);
      const newKcv = await hostEncryptString(newPasswordKey, KCV_PLAINTEXT);
      const newMasterWrap = await hostEncryptBytes(newPasswordKey, masterRaw);
      // Build the next meta. Start from the existing meta (which keeps
      // the recovery branch intact for legacy vaults) and overwrite the
      // password-branch fields. Legacy auto-migration (below) may also
      // overwrite the recovery branch fields in this same object before
      // we persist it.
      //
      // **導出に使った回数を書き残す** (パス 239)。上の導出は `PBKDF2_ITERATIONS` で
      // 新しいパスワード鍵を作っているのに、2026-09-14 までは `iterations` の行が無く
      // 古い回数が残っていた。`unlock` は保管値を読む (それ自体は正しい前方互換) ので、
      // 保管値 ≠ 定数の金庫で復旧すると **今設定したばかりのパスワードが
      // 二度と通らない** —— しかもリカバリーキーは使い切っている。
      // `changePassword` は最初からこの行を持っていた。揃える。
      let newMeta: VaultMeta = { ...meta, salt: newSalt, iv: newKcv.iv, kcv: newKcv.ciphertext, iterations: PBKDF2_ITERATIONS };
      // ── Legacy v0 → v1 silent auto-migration ────────────────────
      //
      // Why here? recoverWithMnemonic() is the ONLY public entry point
      // that has the plaintext mnemonic in scope — exactly what we need
      // to re-derive the recovery key under v1 (prefixed PBKDF2). Doing
      // it here ensures a one-time, transparent upgrade for any user who
      // initialized before the prefix landed. The mnemonic itself is
      // unchanged, so the user-visible 24 words still work forever; only
      // the on-disk salt + ciphertexts move to the v1 scheme.
      //
      // Best-effort semantics: if migration fails for any reason
      // (crypto error, IDB write rejection), we swallow the error and
      // log a warning. The recovery itself still succeeds and the vault
      // stays usable under v0 — partial writes cannot occur because we
      // compute the full new meta in memory before a single write.
      if (meta.recoveryVersion === undefined) {
        // 移行はベストエフォート — 失敗しても復旧自体は成功しており、金庫は
        // v0 のまま使える。移行を失敗させる手段が検査に無く、受ける側には到達しない。
        // Stryker disable BlockStatement,StringLiteral,CallExpression: 移行の失敗を受ける側 (catch) へ届く経路が検査に無い (上の注記)
        try {
          const migratedRecoverySalt = hostRandomBytes(SALT_BYTES);
          const migratedRecoveryKey = await deriveKeyFromMnemonic(mnemonic, migratedRecoverySalt, 1, PBKDF2_ITERATIONS);
          const migratedRecoveryKcv = await hostEncryptString(migratedRecoveryKey, KCV_PLAINTEXT);
          const migratedRecoveryWrap = await hostEncryptBytes(migratedRecoveryKey, masterRaw);
          // 包み直したのだから、包んだ回数もこちらで書き残す (パス 239)。
          newMeta = { ...newMeta, recoveryIterations: PBKDF2_ITERATIONS, recoverySalt: migratedRecoverySalt, recoveryIv: migratedRecoveryKcv.iv, recoveryKcv: migratedRecoveryKcv.ciphertext, recoveryWrapIv: migratedRecoveryWrap.iv, recoveryWrappedKey: migratedRecoveryWrap.ciphertext, recoveryVersion: 1 };
        } catch (err) {
          hostWarn('[vault] legacy v0 → v1 recovery migration failed; vault remains usable under v0. ' + 'Re-run recoverWithMnemonic() to retry the upgrade.', err);
        }
        // Stryker restore BlockStatement,StringLiteral,CallExpression
      }
      // meta と master-wrap は **同時に**入れ替える (片方だけ書けた状態は
      // 新旧どちらのパスワードでも開けない保管庫になる)。
      await hostPutAll(db, [{ store: META_STORE, key: 'vault', value: newMeta }, { store: META_STORE, key: 'master-wrap', value: { iv: newMasterWrap.iv, ciphertext: newMasterWrap.ciphertext } }], false);
      const recovered = await hostImportNonExtractable(masterRaw);
      // threat: T-063
      if (lockToken === epoch) {
        currentKey = recovered;
      }
      // newPassword は下限を強制済み。
      policyOk = true;
    } finally {
      hostZero(masterRaw);
    }
  } finally {
    db.close();
  }
}, revealRecoveryKey: async (_passwordReauth: string) => {
  // Phase E v1: reveal requires storing the entropy under the master
  // key, which adds a memory-exposure window during runtime. Deferred
  // to v2. Users must save the mnemonic at initialize() time per UX
  // contract; this method exists for API symmetry only.
  throw new Error('リカバリーキーの再表示は Phase E v1 では未実装です。初回設定時に保存したリカバリーキーをご利用ください');
}, rotateRecoveryKey: async () => {
  // Phase E v1: rotation requires re-wrapping the master key under a
  // fresh recovery key, which needs the master key in extractable form.
  // We don't keep it extractable at runtime (security). Deferred to v2.
  throw new Error('リカバリーキーのローテーションは Phase E v1 では未実装です。recoverWithMnemonic で新パスワードを設定すれば同じ mnemonic を継続利用できます');
}, wipeAndReset: async () => {
  // **必ず解決し、何が起きたかを返す。**
  //
  // multi-tab edge case (blocked): if another tab still holds an open
  // connection to the same DB, IndexedDB cannot delete it. 投げないのは元の判断のまま (UI を
  // ハングさせない) だが、`'blocked'` を返すので**呼ぶ側が「消えた時だけ
  // 再読込する」と書ける** —— 直す前は解決だけを見て無条件に再読込しており、
  // データが残ったまま「消去しました」と同じ画面になっていた。
  //
  // 失敗も同じ扱い。典型的な原因 (削除中の容量超過・OS のファイル錠) は
  // 次回の呼び出しで回復しうるので、利用者に「もう一度」と言えれば足りる。
  const outcome = await hostDeleteDb();
  // **消えた時だけ鍵を落とす。** 消せなかったなら何も変わっていないので、
  // 半分だけ適用しない —— 落としてしまうと呼ぶ側の画面は「解錠のまま鍵は
  // 死んでいる」状態になり、2026-09-06 に直したのと同じ食い違いを作る。
  // 利用者は他のタブを閉じてもう一度押せる。
  if (outcome === 'deleted') {
    currentKey = null;
  }
  return outcome;
} };
}

let singleton: Vault | null = null;

export function getVault(): Vault {
  if (singleton === null) {
    singleton = createBrowserVault();
  }
  return singleton;
}

/** Testing seam — allow tests to inject a fresh instance. */
export function _resetVaultForTests(): void {
  singleton = null;
}
