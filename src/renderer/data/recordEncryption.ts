/**
 * recordEncryption — 業務レコードの保存時暗号化の有効化/解除/起動時アンロックを
 * 司るオーケストレーション層。`recordCipher` (鍵) + `store` (永続化) を束ねる。
 *
 * ## ロックアウト回避の設計
 * - 有効化時に **KCV (Key Check Value)** を localStorage に保存する。KCV は既知
 *   平文をパスフレーズ由来鍵で封緘したもの。アンロック時は入力パスフレーズで
 *   KCV を開けるか検証 → 誤りなら **false を返すだけ** (沈黙のデータ破壊をしない)。
 *   ユーザーは正しいパスフレーズを再入力すれば復帰できる。
 * - salt と KCV は機密でないため localStorage に保存 (鍵そのものはメモリのみ)。
 * - 真にパスフレーズを失った場合のみデータは復号不能 = 暗号化の本質的性質。
 *   そのため暗号化バックアップとの併用を推奨する (docs/DATA_PROTECTION.md)。
 *
 * UI からは enable / unlock / disable / isEnabled を呼ぶだけでよい。
 */
import { getRecordStore } from './store';
import { IDENTITY_CIPHER, createPassphraseRecordCipher } from './recordCipher';
import { deriveAesKey, sealWithKey, openWithKey, randomSaltB64, isSealed, type Sealed } from '../security/dataCrypto';
import { describeStorageError } from './localWrite';

// 内部キー/既知平文。save↔load・seal↔compare で同じ定数を使い round-trip するため、
// 値そのものを変える StringLiteral mutation は外部から観測できず equivalent。
// Stryker disable next-line StringLiteral
const LS_KEY = 'servicehub.recordEncryption';
/** 既知平文 — KCV はこれを封緘したもの。パスフレーズ検証にのみ使う。 */
// Stryker disable next-line StringLiteral
const KCV_PLAINTEXT = 'service-hub-record-encryption-v1';

interface EncryptionMeta {
  readonly enabled: boolean;
  readonly salt: string;
  readonly kcv: Sealed;
}

/**
 * 「在るが読めなかった」ことを表す印。`loadMeta` が毎回書き換える。
 *
 * `loadMeta` は読めなかったときも `null` を返す —— 読み出しとしては正しい。
 * **だがその `null` を「まだ有効化されていない」と解釈して書くと、salt が消える。**
 *
 * `enableEncryption` の門は `isEncryptionEnabled()` すなわち
 * `loadMeta() !== null` である。メタが壊れていると `loadMeta` は `null` を返すので
 * **門は開き**、`saveMeta` が壊れたメタを**新しい salt で上書きする**。
 * そのときレコードが旧 salt で封緘済みなら、**正しいパスフレーズを知っていても
 * 二度と開けない** —— この関数のすぐ下に「salt … 二度と作れない」と書いてある
 * のと同じ結末に、別の入口から辿り着く。
 *
 * 壊れた JSON の中にも salt の文字列は読める形で残っていることが多い。
 * 消さなければ人手で拾える。消したら拾えない (`data/emotionsWeb.ts` と同じ判断)。
 */
// Stryker disable next-line BooleanLiteral: 初期値は**一度も観測されない** ——
// 読み手 `assertMetaWritable` は必ず `loadMeta()` を先に呼び、その冒頭がこの変数を
// 毎回 false へ戻す。true にしても差が出ない (等価変異。`emotionsWeb.ts` の
// `lastLoadDegraded` と同じ形・同じ理由)。
let lastMetaDegraded = false;

function loadMeta(): EncryptionMeta | null {
  lastMetaDegraded = false;
  let raw: string | null;
  try {
    raw = localStorage.getItem(LS_KEY);
  } catch {
    /*
     * **保存領域そのものへ触れられない** (サイトデータのブロック /
     * プライベートモード。Chrome は `SecurityError` を投げる)。
     *
     * ここで投げると `isEncryptionEnabled()` が投げる。それは
     * `components/BackupPanel.tsx` の**描画中**に呼ばれているので、
     * 保存領域が怪しい端末に限って**控えを取り出す画面が消える**
     * (画面ごと `PageErrorBoundary` の文面に置き換わる) —— いちばん要る
     * ときに使えなくなる。だから投げずに degraded へ数える。
     *
     * `null` を返すが「まだ有効化されていない」ではない。degraded なので
     * `assertMetaWritable()` が上書きを断り、salt を失わせない。
     */
    lastMetaDegraded = true;
    return null;
  }
  // 「無い」は degraded ではない —— 消える物が無い。
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<EncryptionMeta>;
    if (m.enabled === true && typeof m.salt === 'string' && isSealed(m.kcv)) {
      // 返り値の enabled は常に true (検証済み)。消費側 (unlock/disable) は salt/kcv のみ
      // 参照し enabled を読まないため、この BooleanLiteral mutation は equivalent。
      // Stryker disable next-line BooleanLiteral
      return { enabled: true, salt: m.salt, kcv: m.kcv };
    }
    // 形が違う (版数違いのメタなど)。**在るのに読めない**のでこちらも degraded。
    lastMetaDegraded = true;
    return null;
  } catch {
    lastMetaDegraded = true;
    return null;
  }
}

/**
 * メタを**上書きしてよいか**を確かめる。読めなかったなら投げる。
 *
 * 「消す」側 (`disableEncryption`) には掛けない —— あちらは壊れたメタを
 * 消さずに早期 return するだけで何も破壊せず、ここまで塞ぐと
 * 行き止まりになる。
 */
function assertMetaWritable(): void {
  loadMeta();
  if (lastMetaDegraded) {
    throw new Error(
      '保存された暗号化設定を読めませんでした。上書きすると、封緘済みのレコードを'
        + '開くための salt が失われます。設定を復旧するか、レコードを書き出してから'
        + 'やり直してください。',
    );
  }
}

function saveMeta(meta: EncryptionMeta): void {
  localStorage.setItem(LS_KEY, JSON.stringify(meta));
}

function clearMeta(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch (err) {
    /*
     * **ここへ来た時点で全レコードは平文に戻っている** (`disableEncryption` は
     * 復号を終えてからこれを呼ぶ)。メタだけが残ると `isEncryptionEnabled()` は
     * 真を答え続けるので、画面は「暗号化が有効」と言いながら平文を保存する ——
     * 2026-08 の監査で見つけた「持っていない暗号化を騙る」形と同じ。
     *
     * 黙って `true` を返さず、**両方の事実**を文面にして投げる。やり直しは安全で
     * ある (メタが残っているので `loadMeta` は読め、平文は passCipher の
     * `decrypt` が素通しするので、もう一度実行すれば消すところまで進む)。
     */
    throw new Error(
      'レコードは平文に戻しましたが、暗号化設定をこの端末から消せませんでした'
        + ` (${describeStorageError(err)})。`
        + '画面はまだ「暗号化が有効」と表示します。ブラウザの設定で端末への保存を'
        + '許可してから、もう一度「暗号化を解除」を実行してください。',
    );
  }
}

/** 暗号化が有効化されているか (localStorage メタの有無)。 */
export function isEncryptionEnabled(): boolean {
  return loadMeta() !== null;
}

/**
 * 暗号化を有効化する。salt+KCV を生成し、既存レコードを封緘して保存。
 * 既に有効な場合は例外。
 */
export async function enableEncryption(password: string): Promise<void> {
  if (password.length === 0) throw new Error('パスフレーズを入力してください');
  if (isEncryptionEnabled()) throw new Error('暗号化は既に有効です');
  // **「無効」と「読めない」は別物。** 上の門は前者しか見ていない。
  assertMetaWritable();

  const salt = randomSaltB64();
  const key = await deriveAesKey(password, salt);
  const kcv = await sealWithKey(key, KCV_PLAINTEXT);

  const cipher = await createPassphraseRecordCipher(password, salt);
  const store = getRecordStore();

  /*
   * **meta を移行より先に保存する。** (2026-08-23)
   *
   * 以前は `reencryptAll()` の**後**に保存していた。`reencryptAll` は
   * レコード 1 件ずつ別のトランザクションで書くので、途中で落ちうる
   * (容量超過・タブを閉じた・IndexedDB のエラー)。落ちると:
   *
   *   封緘済みのレコード … 何件か出来ている
   *   salt              … 保存されていない  ← **二度と作れない**
   *
   * `IDENTITY_CIPHER.decrypt` は封緘を見つけると明示的に投げるので
   * 黙って壊れはしないが、**正しいパスフレーズを知っていても
   * 鍵を導出できない** (salt が無い)。実測で確認した。
   *
   * 先に保存すれば、途中で落ちても失うものが無い ——
   * パスフレーズ側の `decrypt` は**平文を素通しする**ので、
   * 封緘済みと平文が混ざった状態をそのまま読めるし、
   * `reencryptAll` を再実行すれば完了できる。この素通しは
   * まさにこの状態のために在る。
   *
   * (解除側 `disableEncryption` は最初から正しい順序だった ——
   *  復号を全部終えてから `clearMeta()` する。同じ理屈を
   *  有効化側にも当てる。)
   */
  saveMeta({ enabled: true, salt, kcv });
  store.configureCipher(cipher);
  await store.reencryptAll(); // 既存平文 → 封緘 (decrypt は素通し)
}

/**
 * 起動時/設定時のアンロック。パスフレーズを KCV で検証し、正しければ store に
 * cipher を装着して true、誤りなら何もせず false を返す (ロックアウトしない)。
 * 暗号化が未有効なら true (アンロック不要)。
 */
export async function unlockEncryption(password: string): Promise<boolean> {
  const meta = loadMeta();
  if (!meta) return true; // not enabled → nothing to unlock

  // **鍵の導出も try の中に入れる。** 外に出していた頃は 2 通りで throw していた
  // (2026-08-22 実測):
  //   - 空パスフレーズ → 'パスワードを入力してください'
  //   - `meta.salt` が base64 として読めない → '暗号化データが壊れています…'
  //     (`loadMeta` は `typeof salt === 'string'` しか見ていない)
  // どちらも `Promise<boolean>` の契約 (「誤りなら false」) を破って外へ出ていた。
  // しかも `disableEncryption` が同じ形だったので、**解錠も解除もできない**
  // —— このモジュールの設計節が避けると宣言している「ロックアウト」そのもの。
  //
  // 壊れた salt は誤パスフレーズと同じ false になるので理由は区別できないが、
  // 利用者が**やり直せる状態に留まる**方を採る (throw だと打つ手が無くなる)。
  try {
    const key = await deriveAesKey(password, meta.salt);
    const opened = await openWithKey(key, meta.kcv);
    if (opened !== KCV_PLAINTEXT) return false;
  } catch {
    return false; // wrong passphrase (GCM auth failure) / 空 / 壊れた salt
  }

  const cipher = await createPassphraseRecordCipher(password, meta.salt);
  getRecordStore().configureCipher(cipher);
  return true;
}

/**
 * 暗号化を解除する。パスフレーズを検証し、全レコードを復号して平文で保存し直し、
 * メタを削除。誤パスフレーズでは何もせず false。
 */
export async function disableEncryption(password: string): Promise<boolean> {
  const meta = loadMeta();
  if (!meta) return true; // already plaintext

  // `unlockEncryption` と同じ理由で鍵の導出も try の中へ (上のコメント参照)。
  // **解除の側が throw すると逃げ道が無くなる**ので、こちらの方が重い。
  try {
    const key = await deriveAesKey(password, meta.salt);
    if ((await openWithKey(key, meta.kcv)) !== KCV_PLAINTEXT) return false;
  } catch {
    return false;
  }

  const passCipher = await createPassphraseRecordCipher(password, meta.salt);
  const store = getRecordStore();
  store.configureCipher(IDENTITY_CIPHER);
  await store.reencryptAll(passCipher); // 復号(passCipher) → 平文(identity)で保存
  clearMeta();
  return true;
}
