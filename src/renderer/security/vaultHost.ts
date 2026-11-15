/**
 * `vault.mamori` の薄い壁 (2026-11-15 · MG-070)。
 *
 * IndexedDB (`indexedDB`)・WebCrypto (`crypto.subtle` / `crypto.getRandomValues`)・`TextEncoder` / `TextDecoder`・
 * `ArrayBuffer`・`console` は、Mamori の `extern pure global` にできない (T-249: 網・記憶・コードの口を
 * メンバに持つ host は pure で宣言できない)。そこで**値を出し入れする口だけ**をここへ閉じ込める。
 *
 * **判断は持たない。** 保管庫の判断 —— どの store のどの鍵へ何を書くか・`add` で書くか・反復回数とソルトの床・
 * パスワードの下限と天井・施錠の世代・有効時間・AAD の綴り・断りの文・呼ぶ順序 —— は `vault.mamori` が持つ。
 *
 * 失敗はそのまま投げる (ここで受けない):
 * - IndexedDB の失敗は要求 / 取引の error で reject する (呼び手が「読めない」「既に初期化」へ言い直す)
 * - 鍵を作る口は、WebCrypto が使えなければその理由の文で投げる (`webCryptoUnavailableReason`)
 * - 復号の認証失敗は例外のまま (呼び手が「パスワードが違います」ほかへ言い直す)
 */
import { webCryptoUnavailableReason } from './webCrypto';
import { AES_GCM_IV_BYTES, PBKDF2_HASH } from '../../shared/cryptoParams';

// DB の名前と版は統合の振る舞い (既存の利用者の保管庫がこの名前で在る) が留めており、文字列の値そのものは
// 単体検査では見分けられない。
// Stryker disable StringLiteral: DB の名前は既存の利用者の保管庫がこの名前で在るという統合の事実が留める (単体検査では値を見分けられない)
const DB_NAME = 'business-hub-vault';
const DB_VERSION = 1;
// Stryker restore StringLiteral

/** `hostPutAll` の 1 項 (どの store のどの鍵へ何を書くか —— 決めるのは呼び手)。 */
export interface VaultWrite {
  readonly store: string;
  readonly key: string;
  readonly value: unknown;
}

/** 暗号化の結果 (IV と暗号文)。 */
export interface VaultCipher {
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/** ハードリセットが実際に何をしたか (`vault.mamori` の `WipeOutcome` と同じ 3 語)。 */
export type HostWipeOutcome = 'deleted' | 'blocked' | 'failed';

// --- IndexedDB ----------------------------------------------------------
//
// 小さな包み。失敗時の予備の文字列・`??` の既定・arrow の本体は判断を運ばない —— 成功の道と
// 「データが無い」道は公開の Vault API の検査が通している。

/** 保管庫の DB を開く。`stores` に挙げた store が無ければ作る (新規作成のときだけ走る)。 */
export function hostOpenDb(stores: readonly string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of stores) {
        // DB_VERSION が上がらない限り onupgradeneeded は新規作成時にしか走らず
        // contains は常に false (等価変異)。将来の版上げに備えて残す。
        // Stryker disable next-line ConditionalExpression: 上の注記のとおり (新規作成時にしか走らず contains は常に false —— 等価変異)
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

/**
 * 1 件読む。**型は呼び手が名乗る** (元の `idbGet<T>` と同じ —— 保存領域から来た値なので実行時には何でも来うる。
 * 欄の床は呼び手が掛ける)。無ければ undefined。
 */
export function hostGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('idb get failed'));
  });
}

/** 1 件書く (取引 1 つ)。 */
export function hostPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
  });
}

/**
 * 複数の書き込みを **1 トランザクション**で行う。IndexedDB のトランザクションは
 * 同一 DB 内の複数ストアに対して原子的なので、途中で落ちれば全部巻き戻る。
 *
 * `hostPut` を 2 回呼ぶと**トランザクションが 2 つ**になる。パスワード周りでは
 * これが効く —— meta (`salt`/`kcv`) を書いた後に `master-wrap` の書き込みが
 * 失敗すると、**新旧どちらのパスワードでも開けない保管庫**が残る。
 * (`kcv` は新パスワードを指し、`master-wrap` は旧パスワードで包まれたまま。)
 *
 * `add` が true なら全項を `add` で書く (鍵が既に在れば ConstraintError で取引ごと abort · T-064)。
 * 項ごとの旗にしない —— 2 項のうち片方だけ `put` に替える変異は、もう片方の `add` が同じ
 * 取引を abort するので等価になり、守りが 1 項に痩せても測れない (パス 550)。
 * どちらで書くかを決めるのは呼び手である。
 */
export function hostPutAll(db: IDBDatabase, entries: readonly VaultWrite[], add: boolean): Promise<void> {
  // **空なら何もしない。** `db.transaction([], …)` は仕様上 InvalidAccessError を
  // 投げる (実測で確認)。呼び出し側は今どこも空を渡さないが、「書くものが無い」を
  // 例外で返す口は、後から使う人が踏む。無害な no-op に倒す。
  // Stryker disable next-line ConditionalExpression: 呼び出し側は今どこも空を
  // 渡さない (上の注記のとおり「後から使う人」のための備え)。条件を潰すと
  // `db.transaction([], …)` が InvalidAccessError を投げるが、そこへ到達する
  // 経路が無いので観測差が出ない (等価変異)。
  if (entries.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const stores = [...new Set(entries.map((e) => e.store))];
    const tx = db.transaction(stores, 'readwrite');
    // `add` で書く項は **鍵が既に在れば ConstraintError で取引ごと abort する** (threat: T-064)。
    // 初期化が「既に在るか」を別の読み取り取引で見てから `put` で書くと、2 つの窓が同時に
    // 初期化したとき両方が成功し、後の方が meta / master-wrap を**黙って上書き**する。
    for (const e of entries) {
      // (変数名を `store` にしない —— レコードストアの書き込み台帳の走査 (`store.add(`) は
      // IndexedDB の objectStore と見分けられない。)
      const idbStore = tx.objectStore(e.store);
      if (add) idbStore.add(e.value, e.key);
      else idbStore.put(e.value, e.key);
    }
    tx.oncomplete = () => resolve();
    // `add` の ConstraintError は**要求**のエラーとして上がり、`tx.error` はまだ空なので、
    // event の target (要求) の error を先に見る (threat: T-064)。
    // Stryker disable next-line ArrowFunction: この handler を外しても、abort 経路 (下の `onabort`) が
    // 同じ ConstraintError を `tx.error` から拾って reject するので答えは同じ (等価変異)。
    // ここに在るのは「要求の誤りをその場で返す」意図のため。
    tx.onerror = (ev) =>
      // Stryker disable next-line LogicalOperator,StringLiteral,OptionalChaining: `tx.error` が入る経路は
      // fake-indexeddb では失敗させられない。`ev.target` が無い event も作れない (`?.` は型のため)。
      reject((ev.target as IDBRequest | null)?.error ?? tx.error ?? new Error('idb put-all failed'));
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: 同上 (abort 経路)。
    tx.onabort = () => reject(tx.error ?? new Error('idb put-all aborted'));
  });
}

/** 1 件消す (無い鍵の削除は何もしない)。 */
export function hostDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'));
  });
}

/** store の鍵の一覧 (文字列の鍵だけ)。 */
export function hostKeys(db: IDBDatabase, store: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAllKeys();
    // Stryker disable next-line MethodExpression,ConditionalExpression: この store の鍵は
    // すべて serviceId (文字列) なので filter は一度も要素を落とさない (等価変異)。
    // 型を絞るために必要なので残す。
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).filter((k): k is string => typeof k === 'string'));
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('idb keys failed'));
  });
}

/**
 * 保管庫の DB を丸ごと消す。**必ず解決し、何が起きたかを返す** (UI をハングさせない)。
 * 他のタブが接続を掴んでいれば `blocked`、ブラウザが拒めば `failed`。結果をどう扱うか
 * (消えた時だけ鍵を落とす) は呼び手が決める。
 */
export function hostDeleteDb(): Promise<HostWipeOutcome> {
  return new Promise<HostWipeOutcome>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve('deleted');
    req.onerror = () => resolve('failed');
    req.onblocked = () => resolve('blocked');
  });
}

// --- WebCrypto ----------------------------------------------------------
//
// AES-GCM / PBKDF2 の包み。正しさは統合の検査 (往復・KCV・違うパスワード) が留める。
// `extractable: false` の旗・アルゴリズムの文字列・BufferSource への型の書き換えは WebCrypto の契約が決める。

/** 暗号学的な乱数を n バイト。 */
export function hostRandomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** 文字列を UTF-8 のバイトにする (AAD の組み立てに使う)。 */
export function hostUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * 文字列 (パスワード、または合言葉から組んだ PBKDF2 の入力) から AES-GCM-256 の鍵を導出する。
 * 鍵は取り出せない (`extractable: false`)。反復回数とソルトの床は呼び手が先に掛ける。
 *
 * **WebCrypto が無い端末では、ここが最初に触る所である** (パス 171)。素のまま呼ぶと
 * `Cannot read properties of undefined (reading 'importKey')` になり、ロック画面と設定画面は
 * その `message` をそのまま出す —— 内部 API の名前しか言わないので、読んだ人に打てる手が無い。
 * `crypto.subtle` は**安全なコンテキストにしか無い**ので、単一 HTML を平文の `http://` で
 * 社内サーバや LAN の IP から配ると必ずここを通る。文面は `webCrypto.ts` が 1 つだけ持つ。
 */
export async function hostDeriveKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const missing = webCryptoUnavailableReason();
  if (missing !== null) throw new Error(missing);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    // ハッシュは**凍結値を読む** (パス 327)。`'SHA-256'` と書き写すと、`PBKDF2_HASH` を
    // 変えたときに `kdfLabel()` 由来の封筒メタだけが動いて導出は動かない ——
    // `cryptoParams.ts` の docblock が「実装とメタデータが食い違うと『復号できない
    // バックアップ』になる」と述べているそれである。パスワードの枝も合言葉の枝もここを通る。
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: PBKDF2_HASH },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable — key never leaves WebCrypto
    ['encrypt', 'decrypt'],
  );
}

/**
 * 取り出せる AES-GCM-256 の master 鍵を新しく作る (リカバリーの枝のために包む必要があるので extractable)。
 * 鍵を作る所は**すべて**守る (パス 171) —— 守り漏れが 1 つ在ると、その経路だけが素の TypeError を見せる。
 */
export async function hostGenerateMasterKey(): Promise<CryptoKey> {
  const missing = webCryptoUnavailableReason();
  if (missing !== null) throw new Error(missing);
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — required so we can wrap it for the recovery branch
    ['encrypt', 'decrypt'],
  );
}

/** 鍵の生のバイトを取り出す (包むため)。**呼び手は使い終えたらすぐ `hostZero` で消す。** */
export async function hostExportRawKey(key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(buf);
}

/**
 * 生のバイトを、取り出せない鍵として読み込み直す (実行時に使う形)。
 *
 * ここも鍵を作る呼び (`importKey`) なので守る (パス 171)。**実際には `hostDeriveKey` /
 * `hostGenerateMasterKey` が先に走るので、この行に到達する経路は無い。** それでも置くのは、
 * 「どれが最初か」を呼び順の読みで決めるのが既に 1 度外れたから。規則は「鍵を作る所はすべて守る」に
 * 固定し、走査で数える (`__tests__/webCryptoGuardCensus.test.ts`)。
 */
export async function hostImportNonExtractable(raw: Uint8Array): Promise<CryptoKey> {
  const missing = webCryptoUnavailableReason();
  // Stryker disable next-line ConditionalExpression,CallExpression: 到達しない防御 —— 上の注記のとおり鍵を導出・生成する口が先に断つので、この行に届く経路は無い (WebCrypto が在るとき missing は null で、外しても答えは同じ)。webCryptoGuardCensus が「鍵を作る関数は守る」を綴りで要求するので置いてある
  if (missing !== null) throw new Error(missing);
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 文字列を AES-GCM で暗号化する。**IV は同じ関数の中で `getRandomValues` から毎回採る** —— 外から IV を受けない。
 * 同じ鍵に同じ IV を二度使うと暗号が壊れる (`aesGcmNonce.test.ts` が、暗号化する関数は同じ関数の中で IV を作ることを census で見る)。
 * `aad` (付随データ) を渡すと、復号のときも同じ値が要る —— 何を束ねるかは呼び手が決める。
 */
export async function hostEncryptString(key: CryptoKey, plaintext: string, aad?: Uint8Array): Promise<VaultCipher> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      // Stryker disable next-line ConditionalExpression: WebIDL では辞書の項目に
      // `undefined` を入れることと**項目を書かないこと**が同じ扱いになるので、
      // 条件を潰して常に `additionalData: undefined` を渡しても結果が変わらない
      // (等価変異)。実測 2026-08-31: 同じ鍵・同じ iv で暗号文が完全に一致し、
      // 交差して復号もできた。三項を残すのは意図を読める形にしておくため。
      aad === undefined
        ? { name: 'AES-GCM', iv: iv as BufferSource }
        : { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  return { iv, ciphertext };
}

/** AES-GCM で復号して文字列にする。鍵違い・改竄・AAD の食い違いは例外のまま投げる。 */
export async function hostDecryptString(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    // Stryker disable next-line ConditionalExpression: 上の `hostEncryptString` と同じ
    // 理由 (`additionalData: undefined` == 項目を書かない)。実測で確認済み。
    aad === undefined
      ? { name: 'AES-GCM', iv: iv as BufferSource }
      : { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/** 生のバイトを AES-GCM で暗号化する (master 鍵を包むのに使う)。IV は中で毎回採る。 */
export async function hostEncryptBytes(key: CryptoKey, plaintext: Uint8Array): Promise<VaultCipher> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );
  return { iv, ciphertext };
}

/** AES-GCM で復号して生のバイトを返す。**呼び手は使い終えたらすぐ `hostZero` で消す。** */
export async function hostDecryptBytes(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plain);
}

// --- 小さな口 -----------------------------------------------------------

/** バイト列を 0 で上書きする (生の master 鍵をメモリに残さない)。 */
export function hostZero(bytes: Uint8Array): void {
  bytes.fill(0);
}

/**
 * 値が TypedArray / DataView か。IndexedDB の structured clone や jsdom とのレルム違いで
 * `Uint8Array` の同一性が崩れうるので、`instanceof` ではなくこれで見る (crypto.subtle が受ける BufferSource の条件)。
 */
export function hostIsBufferView(value: unknown): boolean {
  return ArrayBuffer.isView(value);
}

/**
 * 投げられた物の `name` を読む。DOMException は環境によって Error を継がないので、名前だけで見るための口。
 */
export function hostErrorName(err: unknown): unknown {
  // Stryker disable next-line OptionalChaining: reject に null は来ない (`?? new Error(…)` の床) —— `?.` は型のため。
  return (err as { name?: unknown } | null)?.name;
}

/** 開発者向けの警告を 1 行出す (利用者には見えない)。 */
export function hostWarn(message: string, err: unknown): void {
  console.warn(message, err);
}
