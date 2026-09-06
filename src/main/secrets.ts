import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ServiceId } from '../shared/serviceId';
import { OAUTH_CONFIGS, refresh, type TokenSet } from './oauth';
import { hasUsableAccessToken } from '../shared/vaultToken';
import { atomicWriteFile, readFileWithBackup } from './atomicWrite';

const FILE_NAME = 'service-hub-secrets.json';
const MAX_STORE_SIZE = 1 * 1024 * 1024; // 1 MB — generous for hundreds of tokens

function secretsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

// --- write serialization (Finding 1 fix) -------------------------------
// All read-modify-write operations on secrets.json funnel through this
// single promise chain. Without it, two concurrent IPC writes both
// readStore() before either writeStore()s, and the second clobbers the
// first — silently losing freshly-rotated OAuth refresh tokens.

let writeChain: Promise<void> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  // Run fn after the previous write completes (success OR failure).
  // The chain holds only completion signals, never throws.
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
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

  // Primary file, falling back to the `.prev` backup on a crash that left the
  // primary missing or truncated. Lets a mid-write SIGKILL degrade to the
  // previous good token set instead of losing every credential.
  const text = await readFileWithBackup(secretsPath());
  if (text == null) return {};
  const store = parseStore(text);
  if (store) return store;

  // Primary unparseable → try the backup explicitly before giving up.
  const prev = await readFileWithBackup(`${secretsPath()}.prev`); // reads `<path>.prev`
  const recovered = parseStore(prev);
  if (recovered) {

    console.error(`[secrets] primary secrets file at ${secretsPath()} was corrupt; recovered from .prev backup`);
    return recovered;
  }

  console.error(`[secrets] secrets file at ${secretsPath()} is not valid JSON and no usable backup exists; treating as empty`);
  lastReadDegraded = 'JSON として読めず、使える控えも無い';
  return {};
}

async function writeStore(store: Record<string, string>): Promise<void> {
  // Durable atomic write: temp + fsync + rename + dir fsync, keeping a `.prev`
  // backup so a corrupt/clobbered write is recoverable on next read.
  await atomicWriteFile(secretsPath(), JSON.stringify(store), { mode: 0o600, keepBackup: true });
}

let fallbackWarned = false;

function encode(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
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
  | { readonly ok: false; readonly reason: 'store-unreadable'; readonly message: string };

const UNDECRYPTABLE_NO_KEYCHAIN =
  '保存された資格情報を復号できません。OS キーチェーン (safeStorage) が利用できない状態です。' +
  'Linux では gnome-keyring / kwallet を導入してから再試行してください。' +
  'この状態で貼り直すと、暗号化されない形 (base64 の難読化のみ) で保存されます。';

const UNDECRYPTABLE_CORRUPT =
  '保存された資格情報を復号できません。値が壊れているか、保存時と別の鍵が使われています。' +
  '設定画面から削除して、もう一度登録してください。';

function decode(value: string): StoredTokenRead {
  if (value.startsWith('plain:')) {
    return { ok: true, token: Buffer.from(value.slice('plain:'.length), 'base64').toString('utf8') };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, reason: 'undecryptable', message: UNDECRYPTABLE_NO_KEYCHAIN };
  }
  try {
    return { ok: true, token: safeStorage.decryptString(Buffer.from(value, 'base64')) };
  } catch {
    // decryptString は壊れた値や別の鍵で throw する。ここで受けないと IPC
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
  if (!safeStorage.isEncryptionAvailable()) return store;
  const upgraded: Record<string, string> = {};
  for (const [k, v] of Object.entries(store)) {
    if (v.startsWith('plain:')) {
      const decoded = Buffer.from(v.slice('plain:'.length), 'base64').toString('utf8');
      upgraded[k] = safeStorage.encryptString(decoded).toString('base64');
    } else {
      upgraded[k] = v;
    }
  }
  return upgraded;
}

export async function setToken(serviceId: string, token: string): Promise<void> {
  return withWriteLock(async () => {
    const store = await readStoreForWrite();
    const upgraded = await upgradePlainValues(store);
    upgraded[serviceId] = encode(token);
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
  return decode(value);
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
  return Object.keys(store);
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
  const available = safeStorage.isEncryptionAvailable();
  return {
    encrypted: available,
    plainCount: Object.values(store).filter((v) => v.startsWith('plain:')).length,
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

export async function setOAuthTokens(serviceId: ServiceId, tokens: TokenSet): Promise<void> {
  await setToken(serviceId, JSON.stringify(tokens));
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
export async function getValidToken(serviceId: ServiceId): Promise<StoredTokenRead> {
  const read = await readStoredToken(serviceId);
  if (!read.ok) return read;
  const raw = read.token;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON でなければ生の Bearer。`parsed` は null のままなので、すぐ下の
    // `isTokenSet` が必ず落とす — ここで返すと同じ結果の出口が 2 つになる。
  }
  if (!isTokenSet(parsed)) return { ok: true, token: raw };

  const tokens: TokenSet = parsed;
  const config = OAUTH_CONFIGS[serviceId];
  const expiresSoon =
    // Stryker disable next-line ConditionalExpression: 誤検知。手で `true` に置き換えると
    // 「期限に余裕があれば更新しない」「期限が無ければ更新しない」「境界ちょうど…」の
    // 3 本が落ちる (対照実験で確認、2026-08-22)。perTest の帰属ずれ。
    typeof tokens.expiresAt === 'number' && tokens.expiresAt - Date.now() < REFRESH_WINDOW_MS;

  if (expiresSoon && tokens.refreshToken && config) {
    const existing = inflightRefresh.get(serviceId);
    if (existing) return { ok: true, token: await existing };

    const refreshPromise = (async () => {
      try {
        const fresh = await refresh(config, tokens);
        await setOAuthTokens(serviceId, fresh);
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
