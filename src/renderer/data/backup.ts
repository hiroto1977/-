/**
 * Backup / restore — serialize the entire local record store to a single
 * JSON file the user can download (端末移行・災害復旧), and parse it back.
 *
 * バックアップに **SHA-256 チェックサム**を埋め込み、復元時に再計算して照合する。
 * チェックサムは records を正規化した JSON (`JSON.stringify(records)`) に対して
 * 計算するため、再フォーマット (整形/空白) には強く、内容の変化には反応する。
 *
 * ## これが検知するのは「破損」であって「改ざん」ではない
 *
 * 2026-08-22 まで、ここにも画面にも `docs/DATA_PROTECTION.md` にも
 * 「**改ざん検知**」と書いてあった。**鍵の無いハッシュを同じファイルの中に
 * 置いても、改ざんは検知できない** —— 中身を書き換える人は、続けて
 * checksum を計算し直すだけでよい。実測した (`backup.test.ts` の
 * 「平文バックアップの SHA-256 が守るもの・守らないもの」):
 *
 *     records を書き換え → checksum を計算し直す → **復元は通る**
 *     records を書き換え → checksum はそのまま     → 落ちる (破損検知は効く)
 *
 * 守れるのは、転送中の切り詰め・ディスクのビット反転・編集ミスといった
 * **意図しない壊れ方**である。これは価値のある保証なので checksum は残すし、
 * 省略も許さない (下記) —— が、「改ざんされていないことを確かめた」と
 * 利用者に思わせてはいけない。
 *
 * **改ざんに耐えるのは暗号化バックアップのほう。** AES-GCM の認証タグは
 * パスフレーズを知らない改変を復号の時点で落とす。改ざんを心配する用途では
 * パスワードを設定して書き出すのが正しい答えで、平文側に鍵の無い MAC を
 * 足しても意味は増えない (鍵の置き場が無い)。
 *
 * IndexedDB の読み書きは `store.exportAll()` / `store.importAll()`。
 */
import type { StoredRecord } from './store';
import { encryptString, decryptString, isEncryptedBundle, type EncryptedBundle } from '../security/dataCrypto';
import { MIN_PASSWORD_LENGTH } from '../security/vault';

export const BACKUP_VERSION = 1;

/**
 * このバックアップが **含まないもの**。画面の説明文はここを描く。
 *
 * ## なぜ定数にするか (2026-08-23 実測)
 *
 * 画面には「この端末に保存された業務データ**全体**」と書いてあったが、
 * `exportAll()` が読むのは記録ストア (`business-hub-data`) **だけ**である。
 * 実測した保存先は 3 つに分かれており、2 つは書き出されない:
 *
 * ```
 *   business-hub-data      記録ストア         ← 書き出される
 *   business-hub-library   書き出した書類の実体 ← **別 DB。一括の口が無い**
 *   localStorage           会話履歴・下書き 等  ← **触れていない**
 * ```
 *
 * 説明文が想定している用途が **端末移行**なので、ここの食い違いは
 * 「移行して旧端末を消したら下書きと書類が消えていた」という
 * **取り返しの付かない形**で出る。範囲を書かない「全体」は、
 * 安全側に読ませておいて実際は守っていない。
 *
 * 文言を画面の中に置くと、保存先が増えたときに置き去りになる。
 * 定数にして検査から見えるようにする。
 */
export const BACKUP_EXCLUSIONS: readonly string[] = [
  'API キー (Vault 管理のため)',
  'ライブラリの書き出し済みファイル (別データベース)',
  // **「ブラウザ内の設定」に埋めない。** ここには**プロキシの共有秘密**と
  // **保存先フォルダの許可**が入っており (`business-hub-preferences`)、
  // 下の行の例 (会話履歴・下書き・気分・ウォッチリスト) からは読み取れない。
  // 端末を移した人が「プロキシが動かない理由」を画面から知れるようにする。
  'プロキシの設定 (Worker の URL と共有秘密) と、保存先フォルダの許可',
  '会話履歴・DocStudio の下書き・気分の記録・ウォッチリストなどブラウザ内の設定',
];

export interface BackupFile {
  readonly app: 'service-hub';
  readonly version: number;
  readonly exportedAt: string;
  /**
   * SHA-256 hex of `JSON.stringify(records)`。**必須**。
   *
   * かつては省略可にしてあり、無ければ照合を飛ばしていた。それは
   * 「checksum の行を消すだけで照合を無効化できる」という意味で、
   * `alg: none` と同じ形をしていた。
   *
   * ただし**必須にしても得られるのは破損検知だけ**である (モジュール冒頭)。
   * 鍵が無いので、書き換えた側が計算し直せば通る。
   * 省略を許した理由は「旧バックアップ互換」だったが、git を辿ると
   * このファイルの最初のコミットから常に checksum を書いており、
   * **checksum の無いバックアップをこのアプリが作ったことは一度も無い**。
   * 守る対象が存在しない互換のために検知を捨てていた。
   */
  readonly checksum: string;
  readonly records: readonly StoredRecord[];
}

/** Encrypted backup envelope: the plaintext BackupFile JSON sealed with a
 *  passphrase (AES-GCM). `payload` is the dataCrypto bundle. */
export interface EncryptedBackupFile {
  readonly app: 'service-hub';
  readonly encrypted: true;
  readonly payload: EncryptedBundle;
}

/** SHA-256 hex digest of a string via WebCrypto (renderer/Node 18+ で利用可)。 */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function serializeBackup(
  records: readonly StoredRecord[],
  now: Date = new Date(),
): Promise<string> {
  const checksum = await sha256Hex(JSON.stringify(records));
  const file: BackupFile = {
    app: 'service-hub',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    checksum,
    records,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * 暗号化バックアップのパスフレーズが短すぎるときの文 (無ければ null)。
 *
 * **下限は保管庫のマスターパスワードと同じ 1 つ** (`vault.ts` の `MIN_PASSWORD_LENGTH` = 12)。
 * それまで保管庫は 12 文字以上を強制していたのに、同じデータを**外へ持ち出す**暗号化バックアップは
 * 1 文字でも「暗号化済み」を名乗っていた (2026-09-09 実測 —— パス 128)。PBKDF2 は 1 回の試行を
 * 遅くするだけで、1〜3 文字の合言葉の総当たりは秒で終わる。バックアップファイルは最も持ち出され
 * やすい流出経路 (docs/DATA_PROTECTION.md 5) なので、書き出しの側で断る。**復元は断らない** ——
 * 古いファイルの短い合言葉も開ける (開けなくなる方が事故)。
 */
export function backupPassphraseTooShort(password: string): string | null {
  if (password.length >= MIN_PASSWORD_LENGTH) return null;
  return `暗号化バックアップのパスワードは ${MIN_PASSWORD_LENGTH} 文字以上で設定してください（保管庫のパスワードと同じ下限です。短い合言葉は総当たりで開きます）`;
}

/** Encrypt a backup with a passphrase (AES-GCM). The plaintext is a normal
 *  BackupFile (with its SHA-256 integrity intact) so decryption yields a file
 *  that still verifies. 短い合言葉は断る (`backupPassphraseTooShort`)。 */
export async function serializeEncryptedBackup(
  records: readonly StoredRecord[],
  password: string,
  now: Date = new Date(),
): Promise<string> {
  const tooShort = backupPassphraseTooShort(password);
  if (tooShort !== null) throw new Error(tooShort);
  const inner = await serializeBackup(records, now);
  const payload = await encryptString(inner, password);
  const envelope: EncryptedBackupFile = { app: 'service-hub', encrypted: true, payload };
  return JSON.stringify(envelope, null, 2);
}

/** Whether a backup file is encrypted (needs a passphrase to restore). */
export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    // parsed が null (JSON.parse('null')) のとき `?.` を外すと parsed.encrypted で
    // 例外になるが、その場合も下の catch で false を返すため、`?.`↔`.` は equivalent。
    // Stryker disable next-line OptionalChaining
    return parsed?.encrypted === true && isEncryptedBundle(parsed.payload);
  } catch {
    return false;
  }
}

/**
 * Parse + validate a backup file. Throws a user-facing message if the envelope
 * is wrong or the integrity checksum fails. Returns the records array and the
 * export time (`exportedAt`; null when unreadable — パス 129) (record-level validation is done by `store.importAll`, which drops malformed
 * entries). checksum が無いファイルは**拒否する** (理由は BackupFile.checksum)。
 *
 * Encrypted backups require `password`; it is ignored for plaintext files.
 */
export async function parseBackupFile(text: string, password?: string): Promise<ParsedBackup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('バックアップファイルが JSON として読めません');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('バックアップ形式が不正です');
  }

  // Encrypted envelope → decrypt to the inner plaintext, then re-parse.
  const maybeEnc = parsed as Partial<EncryptedBackupFile>;
  if (maybeEnc.encrypted === true) {
    if (!password) throw new Error('暗号化バックアップの復元にはパスワードが必要です');
    if (!isEncryptedBundle(maybeEnc.payload)) throw new Error('暗号化バックアップの形式が不正です');
    const inner = await decryptString(maybeEnc.payload, password);
    return parseBackupFile(inner);
  }

  const file = parsed as Partial<BackupFile>;
  if (file.app !== 'service-hub') throw new Error('このアプリのバックアップファイルではありません');
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new Error('対応していないバックアップ版数です');
  }
  if (!Array.isArray(file.records)) throw new Error('records 配列がありません');

  // 破損検知: records と照合する。**改ざん検知ではない** (モジュール冒頭)。
  // **checksum が無いファイルは受け付けない。** 省略を許すと、
  // checksum の行を消すだけで照合ごと飛ばせる。
  if (typeof file.checksum !== 'string') {
    throw new Error('完全性チェックサムがありません (このアプリが作ったバックアップではありません)');
  }
  const actual = await sha256Hex(JSON.stringify(file.records));
  if (actual !== file.checksum) {
    throw new Error('バックアップファイルが破損しています (チェックサム不一致)');
  }

  return { exportedAt: backupExportedAt(file.exportedAt), records: file.records as StoredRecord[] };
}

/** レコードだけ要る呼び出し (検査・互換)。 */
export async function parseBackup(text: string, password?: string): Promise<readonly StoredRecord[]> {
  return (await parseBackupFile(text, password)).records;
}

/**
 * 復元の入口が読むもの —— レコードと、**書き出した時刻**。(2026-09-09 · パス 129)
 *
 * `parseBackup` はレコードだけを返していたので、画面は「どのバックアップか」を利用者に
 * 言えず、置換の確認は「既存の業務データを全て削除してから復元します」の一文だけだった。
 * `exportedAt` は最初の版から書いてある (`serializeBackup`)。読めない形 (手で直した JSON) は
 * null —— 復元は断らない (時刻は表示にしか使わない)。
 */
export interface ParsedBackup {
  readonly exportedAt: string | null;
  readonly records: readonly StoredRecord[];
}

/** ISO 文字列として読める時刻だけ通す。 */
export function backupExportedAt(v: unknown): string | null {
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
}

/** 復元の計画に要る封筒。中身は見ない —— 封緘済みでも id と時刻は平文 (`exportAll` で読める)。 */
export interface RestoreEnvelope {
  readonly id: string;
  readonly updatedAt: number;
}

export type RestoreMode = 'merge' | 'replace';

/**
 * 復元で何が足され・上書きされ・残り・消えるか —— **書く前に**数える。
 *
 * 2026-09-09 まで、復元は `importAll` に全件を渡していた (`put` = id ごとの upsert)。
 * 2 つの形で利用者の記録が黙って戻っていた:
 *
 *   マージ: バックアップを取った**後に**直した記録 (同じ id・この端末の updatedAt の方が新しい)
 *           が、バックアップの古い中身で上書きされる —— 「マージ」は足すだけに読める。
 *   置換:   確認は一文だけで、消える件数 (バックアップに無い記録・この端末の方が新しい記録) を
 *           言わない。3 か月前のファイルを選んだ人は、3 か月分を失うと知らずに「OK」を押す。
 *
 * マージは id ごとに**新しい方を残す** (この端末の方が新しい id は書かない)。置換は全部書くが、
 * 確認が消える件数を言う (`replaceRestoreConfirmMessage`)。
 *
 * 数えるのは id と updatedAt だけ —— 中身は封緘済みで見られないことがあるし、時刻で足りる。
 * 削除の墓標は無いので、この端末で消した記録はマージで戻る (REMAINING_WORK パス 129「残る物」)。
 */
export interface RestorePlan {
  readonly mode: RestoreMode;
  readonly exportedAt: string | null;
  /** バックアップの件数 / この端末の件数。 */
  readonly incoming: number;
  readonly existing: number;
  /** バックアップにあってこの端末に無い id —— 足される。 */
  readonly added: number;
  /** 両方にあり、バックアップの方が新しいか同時刻 —— バックアップの中身になる。 */
  readonly overwritten: number;
  /** 両方にあり、この端末の方が新しい —— マージでは残し、置換では消える。 */
  readonly newerLocal: number;
  /** この端末にだけある id —— マージでは残り、置換では消える。 */
  readonly localOnly: number;
  /** 置換で失う (元に戻せない) 件数 = localOnly + newerLocal。マージでは 0。 */
  readonly lost: number;
  /** 実際に書く物 —— マージでは newerLocal を除き、置換では全部。 */
  readonly toImport: readonly StoredRecord[];
}

export function planRestore(
  existing: readonly RestoreEnvelope[],
  incoming: readonly StoredRecord[],
  mode: RestoreMode,
  exportedAt: string | null,
): RestorePlan {
  const local = new Map<string, number>();
  for (const r of existing) local.set(r.id, r.updatedAt);
  const incomingIds = new Set<string>();
  let added = 0;
  let overwritten = 0;
  let newerLocal = 0;
  const toImport: StoredRecord[] = [];
  for (const rec of incoming) {
    incomingIds.add(rec.id);
    const mine = local.get(rec.id);
    if (mine === undefined) {
      added += 1;
      toImport.push(rec);
    } else if (mine > rec.updatedAt) {
      newerLocal += 1;
      if (mode === 'replace') toImport.push(rec);
    } else {
      overwritten += 1;
      toImport.push(rec);
    }
  }
  let localOnly = 0;
  for (const id of local.keys()) {
    if (!incomingIds.has(id)) localOnly += 1;
  }
  let lost = 0;
  if (mode === 'replace') lost = localOnly + newerLocal;
  return { mode, exportedAt, incoming: incoming.length, existing: existing.length, added, overwritten, newerLocal, localOnly, lost, toImport };
}

/** 書き出し時刻の表示 (端末のロケール)。null は「書き出し時刻不明」。 */
export function exportedAtLabel(exportedAt: string | null): string {
  return exportedAt === null ? '書き出し時刻不明' : `${new Date(exportedAt).toLocaleString('ja-JP')} 書き出し`;
}

/**
 * 置換の確認文 —— **何件消えるか**を言う。一文だけの確認は、何も言っていないのと同じ。
 * 消える物が無いときはそう言う (「消える記録はありません」) —— 空欄ではなく明示。
 */
export function replaceRestoreConfirmMessage(plan: RestorePlan): string {
  const loss =
    plan.lost === 0
      ? '消える記録はありません (この端末の記録は全てバックアップにあり、バックアップの方が新しいか同時刻です)。'
      : `バックアップに無い ${plan.localOnly} 件と、この端末の方が新しい ${plan.newerLocal} 件 (計 ${plan.lost} 件) が消え、元に戻せません。`;
  return [
    '既存の業務データを全て削除してから復元します。',
    `バックアップ: ${exportedAtLabel(plan.exportedAt)}・${plan.incoming} 件`,
    `この端末: ${plan.existing} 件 —— ${loss}`,
    'よろしいですか？',
  ].join('\n');
}

/**
 * 復元の結果の文。`${imported} 件のレコードを復元しました` で始まる
 * (`importSizeGuard.test.ts` がこの形を留めている)。`dropped` は importAll が形で捨てた件数。
 */
export function restoreResultMessage(plan: RestorePlan, imported: number, dropped: number): string {
  const droppedNote = dropped > 0 ? `${dropped} 件は形式が不正なため取り込みませんでした。` : '';
  const detail =
    plan.mode === 'replace'
      ? `既存データは置換。消えた ${plan.lost} 件 = バックアップに無い ${plan.localOnly} 件 + この端末の方が新しかった ${plan.newerLocal} 件`
      : `マージ: 追加 ${plan.added}・更新 ${plan.overwritten}・この端末の方が新しい ${plan.newerLocal} 件はそのまま`;
  return `${imported} 件のレコードを復元しました（${detail}）。${droppedNote}再読み込みで反映されます。`;
}
