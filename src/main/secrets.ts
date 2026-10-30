import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ServiceId } from '../shared/serviceId';
import { CONTROL_CHAR_MESSAGE, hasControlChars } from '../shared/tokenInput';
import { OAUTH_CONFIGS, refresh, type TokenSet } from './oauth';
import {
  expiredStoredCredentialMessage,
  isRefreshableTokenSetJson,
  storedCredentialExpired,
} from '../shared/credentialTtl';
import {
  brokenStoredCredentialMessage, checkTokenSetForStorage, hasUsableAccessToken,
} from '../shared/vaultToken';
import { atomicWriteFile, backupPathOf, readFileWithBackup } from './atomicWrite';
import { realKeychainAvailable } from './keychainBackend';

const FILE_NAME = 'service-hub-secrets.json';
/*
 * 1 MB — generous for hundreds of tokens.
 *
 * **控えにも同じ上限が掛かる** (パス 326)。2026-09-19 まで、この定数は
 * `loadStore()` の中の `fs.stat(secretsPath())` にだけ効いており、
 * `readFileWithBackup` が倒れる `<path>.prev` は上限なしで読まれていた
 * (本体が ENOENT のときは門を素通りする枝がある)。
 */
const MAX_STORE_SIZE = 1 * 1024 * 1024;

/** 置き場所。ハードリセット (`main/eraseAll.ts`) が在庫を作るために読む (パス 137)。 */
export function secretsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

// --- write serialization (Finding 1 fix) -------------------------------
// All read-modify-write operations on secrets.json funnel through this
// single promise chain. Without it, two concurrent IPC writes both
// readStore() before either writeStore()s, and the second clobbers the
// first — silently losing freshly-rotated OAuth refresh tokens.

let writeChain: Promise<void> = Promise.resolve();

/**
 * 消去中は書き込みを断る (2026-10-16 · パス 524 · threat: T-079)。
 * 「すべてのデータを削除」(`eraseDesktopData`) は鎖に入らずファイルを消すので、消す瞬間に
 * 進行中の `setToken` / 更新トークンの保存が後から tmp を rename すると、**消したはずの
 * 資格情報が戻り**、報告は `allDeleted: true` のまま再起動する (実測 300 回中 221 回)。
 * `beginErase()` が旗を立てて**待機中の書き込みを断らせ、進行中の分を待つ**。
 */
let erasing = false;
export const ERASING_MESSAGE = 'データの削除中のため、資格情報を書き込めません。';

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const guarded = (): Promise<T> => {
    if (erasing) return Promise.reject(new Error(ERASING_MESSAGE));
    return fn();
  };
  // Run fn after the previous write completes (success OR failure).
  // The chain holds only completion signals, never throws.
  const next = writeChain.then(guarded, guarded);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** 消去の前に呼ぶ。以後の書き込みを断り、鎖に残っている書き込みが済むのを待つ。 */
export async function beginErase(): Promise<void> {
  erasing = true;
  await writeChain;
}

/** 消去が完了しなかったとき (再起動しないとき) に書き込みを再開する。 */
export function endErase(): void {
  erasing = false;
}

/** Parse a stored-secrets JSON blob into a validated string map, or null if
 *  it isn't usable (so the caller can try a backup). */
function parseStore(text: string | null): Record<string, string> | null {
  let parsed: unknown;
  try {
    // ファイルが無いとき (`null`) も `String(null)` → `'null'` → `null` になり、
    // 下の番人が落とす。呼び出し側で null を確かめると、同じ結果にしかならない
    // 枝が増えるだけなので、「読めない値」の判定はここ 1 か所に寄せる。
    parsed = JSON.parse(String(text));
  } catch {
    // JSON でなければ `parsed` は undefined のまま。すぐ下の番人が必ず落とすので
    // ここでは返さない (同じ結果になる出口を 2 つ持たない)。
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * 「読めなかった」ことを表す印。
 *
 * `readStore` は**読めなかったときも `{}` を返す** —— 読み出しとしては
 * それで正しい (ロック画面や一覧が落ちるより空の方がまし)。だが
 * **その `{}` を土台にして書くと、読めなかっただけの中身が消える。**
 *
 * 実測 (2026-08-23): 保管ファイルが 1 MB を超えた状態で普通に 1 件保存すると
 *
 *   保存前 listConfiguredServices() → ["github","slack"]
 *   1 MB 超へ成長 (原因は問わない)
 *   setToken('notion', …)            → 成功を返す
 *   保存後のファイル                  → { notion } **だけ**
 *
 * github と slack が**復旧不能に消える** (膨らませていた中身ごと消えるので、
 * 元に戻す手掛かりも残らない)。しかも呼び出し側には成功として返る。
 *
 * 読み出しの安全側 (`{}`) と、書き込みの安全側 (**触らない**) は逆向きである。
 */
/**
 * 読めなかったことを伝える 1 行。**書き込み側と読み出し側で前半を共有する** ——
 * 「なぜ読めなかったか」は同じ事実なので、2 通りの言い方を持たない。
 */
function unreadableStoreMessage(reason: string): string {
  return `保管ファイルを読めませんでした (${reason})。`;
}

class SecretsUnreadableError extends Error {
  constructor(reason: string) {
    super(
      `${unreadableStoreMessage(reason)}`
        + '上書きすると既存の資格情報が失われるため、保存を中止しました。',
    );
    this.name = 'SecretsUnreadableError';
  }
}

/** `readStore` が「読めなかった」ときに立てる。書き込み側だけが見る。 */
let lastReadDegraded: string | null = null;

async function readStore(): Promise<Record<string, string>> {
  lastReadDegraded = null;
  // Bound the size we'll read/JSON.parse — protects against a corrupted /
  // attacker-grown secrets file OOMing main.
  try {
    const stat = await fs.stat(secretsPath());
    if (stat.size > MAX_STORE_SIZE) {

      console.error(
        `[secrets] secrets file ${secretsPath()} is ${stat.size} bytes (limit ${MAX_STORE_SIZE}); refusing to load`,
      );
      lastReadDegraded = `${stat.size} バイト / 上限 ${MAX_STORE_SIZE} バイト`;
      return {};
    }
  } catch (err) {
    // stat ENOENT → no primary file; readFileWithBackup may still find `.prev`.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // Primary file, falling back to the `.prev` copy if the primary went missing
  // or corrupt afterwards. The copy holds the content **last written** (パス 134) —
  // never the previous one, so a cleared / rotated token cannot come back.
  // threat: T-061 —— 読めなかった (EACCES / EISDIR / EIO) は「空」ではない。`readFileWithBackup` は
  // 本体も控えも読めなければ投げるので、ここで degraded に倒す —— 書き込み側 (`readStoreForWrite`) と
  // 一覧 (`listConfiguredServices`) が断り、読めなかった中身の上に `{}` を土台にして書かない。
  let text: string | null;
  try {
    text = await readFileWithBackup(secretsPath(), MAX_STORE_SIZE);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
    console.error(`[secrets] secrets file at ${secretsPath()} exists but could not be read (${code}); treating as unreadable`);
    lastReadDegraded = `読み取りに失敗 (${code})`;
    return {};
  }
  if (text == null) return {};
  const store = parseStore(text);
  if (store) return store;

  // Primary unparseable → try the backup explicitly before giving up.
  let prev: string | null = null; // reads `<path>.prev`
  try {
    prev = await readFileWithBackup(backupPathOf(secretsPath()), MAX_STORE_SIZE);
  } catch {
    // 控えも読めない = 復旧できない (prev は null のまま)。`.catch(() => null)` だと
    // `undefined` に替える変異が等価になる (`parseStore` はどちらも null を返す · パス 550)。
  }
  const recovered = parseStore(prev);
  if (recovered) {

    console.error(`[secrets] primary secrets file at ${secretsPath()} was corrupt; recovered from .prev backup`);
    return recovered;
  }

  console.error(`[secrets] secrets file at ${secretsPath()} is not valid JSON and no usable backup exists; treating as empty`);
  lastReadDegraded = 'JSON として読めず、使える控えも無い';
  return {};
}

/**
 * **書いた物を自分の読み口が断る形を作らない (2026-10-12 · パス 511)。**
 *
 * 読み口 (`readStore`) は `MAX_STORE_SIZE` を超えるファイルを断るのに、書き口は
 * 大きさを見ていなかった。1 件ずつは入口の天井 (`MAX_TOKEN_INPUT_CHARS` 65,536 字)
 * を通る値でも、**積み重ねると天井を越える** —— 実測 (AI 監査・パス 511): Latin-1 の
 * 65,536 字を 6 サービスへ保存すると 1,048,733 B になり、以後は**全サービスの読み・
 * 書き・消去が塞がった** (`.prev` も同じ大きさなので控えも効かない)。逃げ口は
 * 「すべてのデータを削除」だけだった。パス 259 は 1 件の巨大な TokenSet を断ったが、
 * 積み重ねの側は残っていた。
 *
 * **書く前に、書く物の大きさで断る** —— 断れば既存の資格情報は 1 つも動かない。
 */
export class SecretsStoreFullError extends Error {
  constructor(bytes: number) {
    super(
      `保管ファイルの上限 (${MAX_STORE_SIZE} バイト) を超えるため保存しませんでした ` +
        `(保存すると ${bytes} バイト)。既存の資格情報はそのままです。` +
        `長すぎる値を貼っていないか確かめてください。`,
    );
    this.name = 'SecretsStoreFullError';
  }
}

async function writeStore(store: Record<string, string>): Promise<void> {
  const text = JSON.stringify(store);
  const bytes = Buffer.byteLength(text); // utf8 (既定) —— 綴りを書くと等価変異体が残る (法則 115)
  if (bytes > MAX_STORE_SIZE) throw new SecretsStoreFullError(bytes);
  // Durable atomic write: temp + fsync + rename + dir fsync, then a `.prev` copy
  // of the same content so a later loss/corruption of the primary is recoverable.
  await atomicWriteFile(secretsPath(), text, { mode: 0o600, keepBackup: true });
}

let fallbackWarned = false;

async function encode(value: string): Promise<string> {
  // threat: T-041 —— 書く側は「本当のキーチェーンか」を訊く (Linux の basic_text は plain: へ倒す)。
  if (await realKeychainAvailable()) {
    return (await safeStorage.encryptStringAsync(value)).toString('base64');
  }
  if (!fallbackWarned) {
    fallbackWarned = true;
     
    console.warn(
      '[secrets] SECURITY WARNING: OS keychain (safeStorage) is not available. ' +
        'Tokens will be stored with a plain base64 obfuscation only — NOT real encryption. ' +
        'Anyone with read access to the userData directory can recover them. ' +
        'On Linux, install gnome-keyring or kwallet to enable real encryption.',
    );
  }
  // Stryker disable next-line StringLiteral: 誤検知。Stryker はこれを生存と報告するが、
  // 手で `return ''` に置き換えて全テストを回すと
  // 「キーチェーンが無いときだけ plain: の難読化へ落ちる」が落ちる (対照実験で確認、
  // 2026-08-22)。perTest の帰属ずれで、実際には殺せている。
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

/**
 * 保存値の読み出し結果。**「無い」と「読めない」を分ける**のが要点。
 *
 * 2026-08 監査で見つけた形: `decode` は OS キーチェーンが使えない時に `null` を
 * 返し、呼び出し側は「未設定」と解釈して画面に「トークン未設定」と出していた。
 * 実際には値は保存されており、読めないだけである。利用者はその案内に従って
 * 貼り直すが、キーチェーンが無い状態なので `encode` は `plain:` (base64 の
 * 難読化だけ) で保存する — **暗号化されていた資格情報が、誤った案内のせいで
 * 平文相当へ格下げされる**。同時に `listConfiguredServices` は登録済みと答えるので、
 * 画面は「トークン更新」(設定済み) と「トークン未設定」(取得失敗) を同時に出していた。
 */
export type StoredTokenRead =
  | { readonly ok: true; readonly token: string }
  /** 保存されていない。 */
  | { readonly ok: false; readonly reason: 'absent' }
  /** 保存はされているが今は読めない (キーチェーン不在 / 値の破損 / 鍵の変化)。 */
  | { readonly ok: false; readonly reason: 'undecryptable'; readonly message: string }
  | { readonly ok: false; readonly reason: 'expired'; readonly message: string }
  /**
   * **保管ファイルそのものが読めなかった** (大きすぎる / JSON が壊れて控えも無い)。
   *
   * 2026-09-06 まではこれが `absent` に化けていた —— `readStore` が `{}` を返し、
   * `Object.hasOwn` が false になるため。つまり「保存されていない」と
   * 名乗っていたので、画面は「トークン未設定」と案内し、利用者は
   * **鍵を貼り直そうとして** `setToken` に (正しく) 断られる。
   * このファイルの冒頭が「読み出しの安全側と書き込みの安全側は逆向き」と
   * 書いているとおり、読み出しは落ちない方がよい —— だが**嘘は別の話**である。
   */
  | { readonly ok: false; readonly reason: 'store-unreadable'; readonly message: string }
  /**
   * **保存値は読めたが、資格情報として使えない** (2026-09-14 · パス 246)。
   *
   * JSON のオブジェクトとして読めたのに `accessToken` が無い = 壊れた TokenSet。
   * ここまで `getValidToken` は `{ ok: true, token: raw }` を返しており、
   * **raw は JSON 丸ごと**なので `Authorization: Bearer {"refreshToken":"…"}`
   * として相手先 API へ送られていた。TokenSet には refresh token が入るので、
   * **アクセストークンより強い鍵を、渡す必要のない相手へ出す**ことになる。
   * しかも JSON の塊は Bearer として通らないので認証は必ず失敗する ——
   * 漏らす代償だけ払って得るものが無い。
   *
   * ブラウザ版は 2026-08-20 にこれを直しており (`bearerFromStoredToken` が
   * null を返し `web-shim` が断る)、`shared/vaultToken.ts` の注記は「規則を
   * 1 つにまとめて両方から呼ぶ」と書いていた。まとめたのは**述語**で、
   * **述語が no と言ったあとの動作**ではなかった。
   */
  | { readonly ok: false; readonly reason: 'broken-token-set'; readonly message: string };

const UNDECRYPTABLE_NO_KEYCHAIN =
  '保存された資格情報を復号できません。OS キーチェーン (safeStorage) が利用できない状態です。' +
  'Linux では gnome-keyring / kwallet を導入してから再試行してください。' +
  'この状態で貼り直すと、暗号化されない形 (base64 の難読化のみ) で保存されます。';

const UNDECRYPTABLE_CORRUPT =
  '保存された資格情報を復号できません。値が壊れているか、保存時と別の鍵が使われています。' +
  '設定画面から削除して、もう一度登録してください。';

/**
 * 保存した値の包み (2026-10-28 · threat: T-213 / 2026-10-30 · threat: T-230)。`encode()` の出力の前に保存した時刻を付ける:
 *   `atv2:<epoch ms>:<encode(ts1:<epoch ms>:<token>)>`  —— 有効時間つき・**時刻を暗号文の中にも束ねる** (現行)
 *   `at:<epoch ms>:<encode の出力>`  —— 有効時間つき・時刻は平文だけ (T-213 の旧形式・後方互換で読む)
 *   `oauth:<encode の出力>`          —— 更新トークンを持つ TokenSet (認可サーバの期限に従う)
 *   `<encode の出力>`                 —— この規則より前の記録 (日付が無い)
 * `encode()` の出力は base64 か `plain:` + base64 なので、先頭の `atv2:` / `at:` / `oauth:` と取り違えない。
 *
 * ## なぜ時刻を暗号文の中にも束ねるのか (T-230)
 *
 * `at:` の時刻は平文で**認証されない**。保管ファイル (secrets.json) へ書ける相手は、OS キーチェーンを
 * 破らなくても `at:<ms>:` の時刻を前倒しできる。本来 8 時間で期限切れになる記録を「今」へ若返らせると、
 * 持ち出された写しが期限を越えて使える (ブラウザ版 vault の T-213 残り穴と同じ · safeStorage は AAD を
 * 持たないので、時刻を暗号文の中 `ts1:<ms>:<token>` へ入れ、読む時に平文の時刻と一致するか検める ——
 * 書き換えると不一致で復号を断る)。平文の時刻は復号前の有効時間判定に残す (安い事前検査)。
 */
const STAMP_AT = 'at:';
const STAMP_AT_V2 = 'atv2:';
const STAMP_OAUTH = 'oauth:';
/** 暗号文の中に束ねた時刻の印。復号して得た平文が `ts1:<ms>:<token>` の形で、`<ms>` が平文の時刻と一致する。 */
const TS_INNER = 'ts1:';
type Stamped = { readonly kind: 'at'; readonly version: 1 | 2; readonly storedAt: number; readonly inner: string }
  | { readonly kind: 'oauth'; readonly inner: string }
  | { readonly kind: 'undated'; readonly inner: string };

function parseAtBody(rest: string, version: 1 | 2): Stamped {
  const sep = rest.indexOf(':');
  // 区切りが無い = 壊れた包み。日付が無い物と同じく期限切れへ倒す (`storedAt` は NaN)。
  // `indexOf` が「無い」で返す値は -1 の 1 つなので、その値そのものを比べる (`< 0` だと
  // `<= 0` にする変異が等価 · 法則 115)。
  if (sep === -1) return { kind: 'at', version, storedAt: Number.NaN, inner: rest };
  return { kind: 'at', version, storedAt: Number(rest.slice(0, sep)), inner: rest.slice(sep + 1) };
}

function unstamp(value: string): Stamped {
  if (value.startsWith(STAMP_OAUTH)) return { kind: 'oauth', inner: value.slice(STAMP_OAUTH.length) };
  if (value.startsWith(STAMP_AT_V2)) return parseAtBody(value.slice(STAMP_AT_V2.length), 2);
  if (value.startsWith(STAMP_AT)) return parseAtBody(value.slice(STAMP_AT.length), 1);
  return { kind: 'undated', inner: value };
}

/**
 * 書く側: 値の形で包みを決め、暗号化まで行う。時刻は `now` (平文の付随データ —— 秘密ではない) だが、
 * at 形式では**暗号文の中にも束ねる** (`ts1:<now>:<token>` を暗号化 · T-230)。
 */
async function stampAndEncode(token: string, now: number): Promise<string> {
  if (isRefreshableTokenSetJson(token)) return `${STAMP_OAUTH}${await encode(token)}`;
  return `${STAMP_AT_V2}${now}:${await encode(`${TS_INNER}${now}:${token}`)}`;
}

/** 包みを保ったまま中身を差し替える (`upgradePlainValues` が使う)。 */
function restamp(original: string, inner: string): string {
  const s = unstamp(original);
  if (s.kind === 'oauth') return `${STAMP_OAUTH}${inner}`;
  if (s.kind === 'at') return `${s.version === 2 ? STAMP_AT_V2 : STAMP_AT}${s.storedAt}:${inner}`;
  return inner;
}

/**
 * 期限切れか。`at` は時刻で決まる (日付が壊れていれば期限切れ)。`oauth` は認可サーバの期限に
 * 従うのでここでは切らない。日付の無い記録 (この規則より前の物) は**期限切れにしない** ——
 * `migrateUndated` が最初に見た時刻を付け、そこから有効時間が始まる (版上げで全員を締め出す
 * 代わりに、1 度だけ最大 8 時間の猶予を置く)。
 */
function expiredStamp(s: Stamped, now: number): boolean {
  if (s.kind === 'at') return storedCredentialExpired(s.storedAt, now);
  return false;
}

/**
 * 日付の無い記録に時刻を付ける (threat: T-213)。中身を読んで OAuth の TokenSet なら `oauth:`、
 * それ以外は `at:<now>:`。読めない中身 (別の鍵・壊れた値) はそのまま残す —— 分類できない物に
 * 時刻を付けても意味が無く、読めない以上は漏れもしない。保管ファイルが読めない状態では書かない。
 */
async function migrateUndated(ids: readonly string[]): Promise<void> {
  const now = Date.now();
  await withWriteLock(async () => {
    const store = await readStoreForWrite();
    const upgraded = await upgradePlainValues(store);
    let changed = false;
    for (const id of ids) {
      // 呼び手は「今の一覧」をそのまま渡す (期限切れとして消した直後の id も混ざる) ので、無い id は
      // ここで飛ばす。日付のある物も飛ばす —— 飛ばさないと包みの上にもう 1 枚包む (`at:今:at:元:…`)
      // 形になり、次の読みで復号できない (2 つの `listConfiguredServices` が重なった窓の実測)。
      if (!Object.hasOwn(upgraded, id)) continue;
      const value = upgraded[id] as string; // hasOwn を通った鍵の値 (型の絞り込みだけ)
      if (unstamp(value).kind !== 'undated') continue;
      const read = await decodeInner(value);
      if (!read.ok) continue;
      // 日付を付けるときに現行形式 (atv2 · 時刻を暗号文の中にも束ねる) で包み直す —— 復号した
      // 生トークンから作る (元の inner は時刻を含まないので再暗号化が要る · T-230)。
      upgraded[id] = await stampAndEncode(read.token, now);
      changed = true;
    }
    if (changed) await writeStore(upgraded);
  });
}

async function decode(value: string): Promise<StoredTokenRead> {
  const s = unstamp(value);
  const read = await decodeInner(s.inner);
  if (!read.ok) return read;
  // atv2: 暗号文の中の時刻が平文の時刻と一致するか検める (threat: T-230)。平文の `atv2:<ms>:` を
  // 前倒しして若返らせても、暗号文は元の時刻で封緘されているので不一致で断る (= 復号できない扱い)。
  if (s.kind === 'at' && s.version === 2) {
    if (!read.token.startsWith(TS_INNER)) return { ok: false, reason: 'undecryptable', message: UNDECRYPTABLE_CORRUPT };
    // 復号して得た平文の中身 (`ts1:<ms>:<token>` の `ts1:` を外した残り)。応答の本文ではない
    // ので `lint:forbidden` の `body.slice(` の網には掛けない (名前を `tsInner` にして区別する)。
    const tsInner = read.token.slice(TS_INNER.length);
    const sep = tsInner.indexOf(':');
    // 区切りが無い (`-1`) か、暗号文の中の時刻が平文の時刻と違えば改竄。
    if (sep === -1 || Number(tsInner.slice(0, sep)) !== s.storedAt) {
      return { ok: false, reason: 'undecryptable', message: UNDECRYPTABLE_CORRUPT };
    }
    return { ok: true, token: tsInner.slice(sep + 1) };
  }
  return read;
}

async function decodeInner(value: string): Promise<StoredTokenRead> {
  if (value.startsWith('plain:')) {
    return { ok: true, token: Buffer.from(value.slice('plain:'.length), 'base64').toString('utf8') };
  }
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    return { ok: false, reason: 'undecryptable', message: UNDECRYPTABLE_NO_KEYCHAIN };
  }
  try {
    // `shouldReEncrypt` は読まない: `result` は復号できた平文で、読む道は書かない (`atRest.ts` と同じ)。
    return { ok: true, token: (await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))).result };
  } catch {
    // decryptStringAsync は壊れた値や別の鍵で reject する。ここで受けないと IPC
    // ハンドラごと reject し、renderer 側は「読込中…」のまま止まる。
    return { ok: false, reason: 'undecryptable', message: UNDECRYPTABLE_CORRUPT };
  }
}

/** Finding 5 fix: if any stored value is `plain:`-prefixed AND
 *  safeStorage is now available, upgrade-encrypt all of them in place
 *  so the user gets the encryption they were promised. Called on demand
 *  from setToken/clearToken so we don't burn cycles on read-only paths.
 *
 *  以前は `{ upgraded, changed }` を返していたが、**`changed` を読む呼び出し側が
 *  一つも無かった** (どちらの呼び出し側も直後に書き込むため)。返り値に残すと、
 *  誰も観測しない値を組み立てる分岐が 3 つ増えるだけなので落とした。 */
async function upgradePlainValues(store: Record<string, string>): Promise<Record<string, string>> {
  if (!(await realKeychainAvailable())) return store; // threat: T-041 —— basic_text へは「昇格」しない
  const upgraded: Record<string, string> = {};
  for (const [k, v] of Object.entries(store)) {
    const inner = unstamp(v).inner;
    if (inner.startsWith('plain:')) {
      const decoded = Buffer.from(inner.slice('plain:'.length), 'base64').toString('utf8');
      upgraded[k] = restamp(v, (await safeStorage.encryptStringAsync(decoded)).toString('base64'));
    } else {
      upgraded[k] = v;
    }
  }
  return upgraded;
}

export async function setToken(serviceId: string, token: string): Promise<void> {
  /*
   * **保管層の床 (2026-09-14 · パス 245)。**
   *
   * ここには検証が**1 つも無かった** —— 長さも制御文字も見ず、規則はすべて
   * `main.ts` の `secrets:set` ハンドラ側 (`checkTokenInput`) に在った。
   * ところが `setOAuthTokens` は**ハンドラを経由しない**ので、OAuth の
   * TokenSet はどの関門も通らずここへ来る。
   *
   * 中身は認可サーバの発行値なので制御文字は入りにくいが、**「入りにくい」は
   * 関門ではない**。制御文字がヘッダに載ると `new Headers()` が値ごと文面に
   * 載せて投げ、その文面は `safeErrorMessage` を通って画面へ出る
   * (`shared/__tests__/headerValueLeak.test.ts` が 10 経路で実測)。
   *
   * 長さはここでは見ない —— ハンドラ側の `MAX_TOKEN_INPUT_CHARS` と
   * 読み出し側のファイル上限が持っており、3 か所目を作ると必ずずれる。
   *
   * **限界**: `JSON.stringify` は制御文字をエスケープ列へ逃がすので、包んだ
   * TokenSet は床を通る。包みの中は包む側で断るしかない (画面側はパス 244)。
   */
  if (hasControlChars(token)) throw new Error(CONTROL_CHAR_MESSAGE);
  return withWriteLock(async () => {
    const store = await readStoreForWrite();
    const upgraded = await upgradePlainValues(store);
    upgraded[serviceId] = await stampAndEncode(token, Date.now());
    await writeStore(upgraded);
  });
}

/**
 * 書き込みの土台として読む。**読めなかったなら投げる。**
 *
 * 空のファイル (まだ 1 つも保存していない) は degraded ではないので通る ——
 * 消える物が無いため。
 */
async function readStoreForWrite(): Promise<Record<string, string>> {
  const store = await readStore();
  if (lastReadDegraded !== null) throw new SecretsUnreadableError(lastReadDegraded);
  return store;
}

/** 保存値をそのまま読む (OAuth の TokenSet か生トークン文字列)。 */
export async function readStoredToken(serviceId: string): Promise<StoredTokenRead> {
  const store = await readStore();
  // **読めなかったことを「保存されていない」と混ぜない。** `readStore` の `{}` は
  // 読み出しとしては正しいが、そのまま `absent` に落とすと画面が嘘を言う。
  if (lastReadDegraded !== null) {
    return { ok: false, reason: 'store-unreadable', message: unreadableStoreMessage(lastReadDegraded) };
  }
  const value = Object.hasOwn(store, serviceId) ? store[serviceId] : undefined;
  if (!value) return { ok: false, reason: 'absent' };
  // 有効時間 (threat: T-213)。期限切れは**読まずに消す** —— 使い捨て。消せなくても (書けない状態)
  // 読みはしない。日付の無い記録には最初に見た時刻を付ける。
  const stamped = unstamp(value);
  if (expiredStamp(stamped, Date.now())) {
    await purgeExpired([serviceId]).catch(() => {});
    return { ok: false, reason: 'expired', message: expiredStoredCredentialMessage(serviceId) };
  }
  // Stryker disable next-line ConditionalExpression: `migrateUndated` は日付の無い物しか書かないので、
  // 条件を外しても答えは変わらない (読み 1 回が余分になるだけ · 等価変異)。日付の無い物だけを
  // 通す意図を残すために書く。
  if (stamped.kind === 'undated') await migrateUndated([serviceId]).catch(() => {});
  return await decode(value);
}

/** 期限切れの記録を消す (読み・一覧から呼ぶ)。保管ファイルが読めない状態では書かない。 */
async function purgeExpired(ids: readonly string[]): Promise<void> {
  await withWriteLock(async () => {
    const store = await readStoreForWrite();
    const upgraded = await upgradePlainValues(store);
    for (const id of ids) delete upgraded[id];
    await writeStore(upgraded);
  });
}

/** 読めた時だけ文字列を返す薄い読み口 (OAuth の TokenSet 復元に使う)。
 *  「無い」と「読めない」を区別したい呼び出し側は `readStoredToken` を使う。 */
export async function getToken(serviceId: string): Promise<string | null> {
  const read = await readStoredToken(serviceId);
  return read.ok ? read.token : null;
}

export async function clearToken(serviceId: string): Promise<void> {
  return withWriteLock(async () => {
    const store = await readStoreForWrite();
    const upgraded = await upgradePlainValues(store);
    delete upgraded[serviceId];
    await writeStore(upgraded);
  });
}

/**
 * 登録済みサービスの一覧。**読めなかったときは投げる。**
 *
 * `readStore` は読めないとき `{}` を返す (読み出しとしては正しい)。ところが
 * その `{}` の鍵を数えて返すと、**「1 件も登録されていない」と名乗る**ことに
 * なる —— 画面はすべてのサービスに「トークン未設定」を出し、設定画面の
 * 接続一覧も預かりの節も空になる。利用者の自然な次の手は **API キーの再入力**で、
 * それは `setToken` が (正しく) 断るので徒労に終わる。
 *
 * このファイルは既に `readStoredToken` で「保存されていない (absent)」と
 * 「保存はされているが今は読めない (unreadable)」を分けており、書き込み側も
 * `readStoreForWrite` で断っている。**一覧だけが嘘を言える最後の読み口**だった。
 */
export async function listConfiguredServices(): Promise<string[]> {
  const store = await readStore();
  if (lastReadDegraded !== null) throw new SecretsUnreadableError(lastReadDegraded);
  // 期限切れは一覧にも出さず、その場で消す (threat: T-213)。「設定済み」と名乗ったまま読むと
  // 断られる形を作らない。
  const now = Date.now();
  const expired: string[] = [];
  for (const [id, value] of Object.entries(store)) {
    if (expiredStamp(unstamp(value), now)) expired.push(id);
  }
  // `purgeExpired` は無条件に書くので、空のときは呼ばない (呼ぶと保管ファイルを無駄に書き直す ——
  // 一覧を読むだけで更新時刻が動く形)。`migrateUndated` は日付の無い物しか書かないので、
  // 一覧をそのまま渡す (日付のある物・消した直後の物は中で飛ばす。「日付の無い物」をここで
  // 選び直すと、同じ判定が 2 か所に分かれて片方が等価変異になる · パス 550)。
  if (expired.length > 0) await purgeExpired(expired).catch(() => {});
  await migrateUndated(Object.keys(store)).catch(() => {});
  return Object.keys(store).filter((id) => !expired.includes(id));
}

/** How tokens are protected at rest, for display in the UI. */
export interface StorageProtection {
  /** OS keychain (safeStorage) usable → values are really encrypted. */
  readonly encrypted: boolean;
  /** Count of stored values still under the `plain:` obfuscation. */
  readonly plainCount: number;
  /** Absolute path of the secrets file, so the user can inspect/remove it. */
  readonly file: string;
  /**
   * **何が鍵を握っているか。** 画面はこれで文言を選ぶ。
   *
   * 2026-08-23 まで画面は `encrypted` が true なら無条件で
   * 「OS のキーチェーン由来の鍵で暗号化して保存されています」と書いていた。
   * **ブラウザ版には OS キーチェーンが無い** —— あちらの `storageProtection`
   * は `encrypted: true` を固定で返すので、この一文が常に出ていた。
   *
   * 実際に守っている物が違う:
   *   'os-keychain'     OS が鍵を持つ (利用者のパスフレーズに依存しない)
   *   'webcrypto-vault' **マスターパスワード**から PBKDF2 で導出した鍵
   *   'obfuscated'      base64 の難読化のみ (暗号化ではない)
   *
   * 「OS が守る」と「あなたのパスフレーズが守る」は利用者にとって
   * 別の話なので、**取り違えたまま安心させない**。
   */
  readonly mechanism: 'os-keychain' | 'webcrypto-vault' | 'obfuscated';
  /**
   * **消えないか。** `mechanism` が「何が守るか」なら、こちらは「残るか」。
   *
   * ブラウザ版の保管庫は IndexedDB に在り、既定では **best-effort** の
   * 領域である —— 実測 (2026-08-25) で `navigator.storage.persisted()` は
   * `false`、`persist()` も `false` を返した。
   * この状態では**ブラウザが空き容量の都合や無操作で立ち退かせる**ことが
   * ある (Safari の ITP は無操作 7 日で消す)。
   *
   * **控えた 24 語では戻せない。** リカバリーフレーズは保管庫を*開ける*
   * ための物で、立ち退きでは暗号化されたトークンごと消えるため、
   * 開ける物が無くなる。戻せるのは書き出したバックアップだけである。
   *
   * デスクトップ版は userData のファイルなので立ち退きは無い ('file')。
   */
  readonly durability: 'file' | 'persistent' | 'best-effort';
}

/**
 * Report the at-rest protection state.
 *
 * The `plain:` fallback (keychain-less Linux) has always emitted a loud
 * `console.warn`, but a GUI user never sees stdout — so the accepted risk was
 * invisible to exactly the person who needs to decide about it (2026-07 audit
 * follow-up). Surfacing it lets the UI say "this device cannot encrypt your
 * tokens" instead of silently degrading.
 */
export async function getStorageProtection(): Promise<StorageProtection> {
  const store = await readStore();
  const available = await realKeychainAvailable(); // threat: T-041 —— basic_text を os-keychain と名乗らない
  return {
    encrypted: available,
    plainCount: Object.values(store).filter((v) => unstamp(v).inner.startsWith('plain:')).length,
    durability: 'file',
    file: secretsPath(),
    mechanism: available ? 'os-keychain' : 'obfuscated',
  };
}

// --- OAuth-aware helpers ------------------------------------------------
// Tokens stored under an OAuth-enabled service id are JSON-encoded
// TokenSet values. Everywhere else (raw PAT/Bearer paste), the value is
// the raw string. getValidToken hides the distinction from callers and
// refreshes expiring access tokens.

const REFRESH_WINDOW_MS = 60_000;

// 「TokenSet として使えるか」の規則は `src/shared/vaultToken.ts` に 1 つだけ置く。
// こことブラウザ版で別々に書いていた結果、**片方だけが緩い**状態になっていた
// (レンダラ側は壊れた TokenSet を raw のまま Bearer に載せていた — 2026-08-20)。
function isTokenSet(parsed: unknown): parsed is TokenSet {
  return hasUsableAccessToken(parsed);
}

/**
 * OAuth の TokenSet を保存する。**書く前に見る** (2026-09-14 ・ パス 259)。
 *
 * この関数は `secrets:set` の IPC ハンドラを**経由しない**ので
 * (上の `setToken` の注記が名指している)、`checkTokenInput` の天井も
 * 制御文字の関門もかかっていなかった。中身は認可サーバの応答本文で、
 * `oauth.ts` の `JSON.parse(…) as TokenResponse` は型を名乗るだけで何も見ない。
 *
 * 判定は共有の `checkTokenSetForStorage` 1 つ (理由と実測はそちら)。
 * **切らずに投げる** —— 切ると壊れた資格情報が保存されてしまうし、
 * 呼び出し側 2 つはどちらも catch を持っているので投げる方が正しく伝わる:
 * 接続の経路 (`main.ts`) は `authorize_failed` として画面に出し、
 * 更新の経路 (`getValidToken`) は**既存の良いトークンを上書きせず**に済ませる。
 */
export async function setOAuthTokens(serviceId: ServiceId, tokens: TokenSet): Promise<void> {
  const check = checkTokenSetForStorage(tokens);
  if (!check.ok) throw new Error(check.message);
  // 測った文字列そのものを渡す (もう 1 度 stringify しない)。
  await setToken(serviceId, check.serialized);
}

/**
 * 更新の応答を書き戻す —— **保存値が更新の開始時 (`before`) と同じ時だけ**。
 *
 * 更新は `withWriteLock` の外で走るので、応答が届くまでの間に `clearToken` や
 * `setToken` が保存値を変えうる。無条件に `setOAuthTokens` すると、消した資格情報を
 * 古い応答で復活させる (threat: T-031 · 実測 2026-10-14)。比べるのは書き込みの
 * 直列化の中なので、比較と書き込みの間に別の書き込みは入らない。
 */
async function saveRefreshedIfUnchanged(serviceId: ServiceId, before: string, fresh: TokenSet): Promise<void> {
  const check = checkTokenSetForStorage(fresh);
  if (!check.ok) throw new Error(check.message);
  await withWriteLock(async () => {
    const store = await readStoreForWrite();
    const value = Object.hasOwn(store, serviceId) ? store[serviceId] : undefined;
    const now = value === undefined ? null : await decode(value);
    // 消された・差し替えられた後の応答は書かない。読めない今の値も「同じ」とは言えないので書かない。
    if (now === null || !now.ok || now.token !== before) return;
    const upgraded = await upgradePlainValues(store);
    // TokenSet は `oauth:` 包みへ (isRefreshableTokenSetJson が真)。at の時刻束ねは掛からない。
    upgraded[serviceId] = await stampAndEncode(check.serialized, Date.now());
    await writeStore(upgraded);
  });
}

export async function getOAuthTokens(serviceId: ServiceId): Promise<TokenSet | null> {
  // 未設定 (`null`) も `String(null)` → `'null'` → `null` となり `isTokenSet` が
  // 落とす。手前でもう一度確かめると、どちらを通っても同じという枝が増えるだけ。
  const raw = await getToken(serviceId);
  try {
    const parsed: unknown = JSON.parse(String(raw));
    return isTokenSet(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// --- refresh stampede dedup (Finding 2 fix) -----------------------------
// Two concurrent getValidToken() calls for the same service (or two
// Google services sharing one refresh token round) both observe
// expiresSoon=true and both hit POST /token. The second sees an
// invalidated refresh token and the catch swallows it, masking
// credential loss until the user notices a sign-out. Dedup all
// in-flight refreshes by serviceId.
const inflightRefresh = new Map<ServiceId, Promise<string>>();

/** Resolve the bearer token to use for a service:
 *   - If stored as an OAuth TokenSet and within the refresh window,
 *     hit the provider's token endpoint and persist the new tokens.
 *   - Otherwise return the raw stored string.
 *   - 未設定と「保存済みだが復号できない」を区別して返す
 *     (`StoredTokenRead`)。前者を後者と混同すると、画面が「未設定」と
 *     案内して利用者に平文相当での貼り直しをさせてしまう。
 */
/**
 * **保存値が JSON の包みで、その包みごと資格情報であるスロット** (2026-10-15 ·
 * パス 522 · threat: T-054)。
 *
 * `assistant` は AI アシスタントの多提供者の鍵 (`{anthropicApiKey, openaiApiKey,
 * …}`) を 1 つの JSON に包んで保管し、読み手 (`main/clients/assistant.ts` の
 * `parseAiCredentials(ctx.token)`) はその JSON をそのまま受け取る。ところが
 * パス 246 が「オブジェクトなら壊れた TokenSet」として生の JSON を Bearer に
 * 載せる穴を塞いだとき、このスロットは**同じ門に当たって保存した瞬間から
 * `broken-token-set` と断られる**ようになった —— デスクトップ版の
 * `assistant/chat` / `chatAll` / `bestAnswers` は 2026-09-14 から 1 度も鍵を
 * 受け取っていなかった (実測: `getValidToken('assistant')` は保存直後でも
 * `{ ok: false, reason: 'broken-token-set' }`)。
 *
 * ここに載せたスロットは `readStoredToken` の結果 (復号した生の文字列) を
 * そのまま返す。**TokenSet (OAuth) をこのスロットに書く道は無い**
 * (`OAUTH_CONFIGS` に `assistant` は無い) ので、更新トークンの判定を
 * 飛ばしても失う物は無い。載せるのは「読み手が JSON を自分で解く」
 * スロットだけで、その読み手は `secretsTokenRead.test.ts` が名指しで留める。
 */
export const OPAQUE_JSON_SLOTS: ReadonlySet<ServiceId> = new Set<ServiceId>([
  'assistant',
  // threat: T-091 (パス 525) —— T-054 は `assistant` だけを載せたが、設定の欄が JSON を要求する
  // スロットは他に 3 つ在り、保存した瞬間から `broken-token-set` と断られていた (実測: 3 つとも
  // `secrets:set` は ok・直後の `getValidToken` は断り・`fetch:snapshot` / `action:invoke` が
  // 「壊れています。登録し直してください」で、登録し直しても同じ)。security は LOCAL なので
  // 端末内の判定まで止まっていた。読み手は `ctx.token` を自分で解く (名指しの検査が留める)。
  'atlassian', // {email, token, site}
  'youtube', // {apiKey, channelId}
  'security', // {hibp, vt}
]);

export async function getValidToken(serviceId: ServiceId): Promise<StoredTokenRead> {
  const read = await readStoredToken(serviceId);
  if (!read.ok) return read;
  const raw = read.token;
  // JSON の包みそのものが資格情報であるスロットは、TokenSet として読まない
  // (下の「オブジェクトなら壊れた TokenSet」に当てると、保存した瞬間から
  // 断られる —— パス 522 で実測した当のこと)。
  if (OPAQUE_JSON_SLOTS.has(serviceId)) return { ok: true, token: raw };

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON でなければ生の Bearer。`parsed` は null のままなので、すぐ下の
    // `isTokenSet` が必ず落とす — ここで返すと同じ結果の出口が 2 つになる。
  }
  if (!isTokenSet(parsed)) {
    /*
     * **オブジェクトなら「壊れた TokenSet」。raw を返さない。**
     *
     * `raw` は保存値そのもの = JSON 丸ごとなので、返せば
     * `Authorization: Bearer {"refreshToken":"…"}` になる (パス 246 で実測)。
     * オブジェクトでない場合 (JSON ですらない生の PAT / 数字だけの API キー)
     * は今までどおり `raw` を返す —— そちらは本当に資格情報そのものである。
     * 配列も `typeof === 'object'` なのでここで断るが、配列が資格情報である
     * ことはないので正しい。
     */
    if (parsed !== null && typeof parsed === 'object') {
      return { ok: false, reason: 'broken-token-set', message: brokenStoredCredentialMessage(serviceId) };
    }
    return { ok: true, token: raw };
  }

  const tokens: TokenSet = parsed;
  const config = OAUTH_CONFIGS[serviceId];
  const expiresSoon =
    // Stryker disable next-line ConditionalExpression: 誤検知。手で `true` に置き換えると
    // 「期限に余裕があれば更新しない」「期限が無ければ更新しない」「境界ちょうど…」の
    // 3 本が落ちる (対照実験で確認、2026-08-22)。perTest の帰属ずれ。
    // 非有限の期限は「期限が記録されていない」と同じ扱い (更新しない)。
    // `Infinity` は元から false 側だったが `-Infinity` は毎回更新に倒れていた (パス 98)。
    typeof tokens.expiresAt === 'number' &&
    Number.isFinite(tokens.expiresAt) &&
    tokens.expiresAt - Date.now() < REFRESH_WINDOW_MS;

  if (expiresSoon && tokens.refreshToken && config) {
    const existing = inflightRefresh.get(serviceId);
    if (existing) return { ok: true, token: await existing };

    const refreshPromise = (async () => {
      try {
        const fresh = await refresh(config, tokens);
        // 更新の応答は、保存値が更新の開始時と同じ時だけ書き戻す (threat: T-031)。
        // 途中で利用者が消した・別の値へ差し替えた資格情報を、古い応答で復活させない。
        await saveRefreshedIfUnchanged(serviceId, raw, fresh);
        return fresh.accessToken;
      } catch {
        // refresh failed (revoked / network) — fall through to the stale
        // access token and let the caller see the upstream 401.
        return tokens.accessToken;
      } finally {
        inflightRefresh.delete(serviceId);
      }
    })();
    inflightRefresh.set(serviceId, refreshPromise);
    return { ok: true, token: await refreshPromise };
  }
  return { ok: true, token: tokens.accessToken };
}
