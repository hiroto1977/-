/**
 * In-app Library — IndexedDB-backed storage for export artifacts.
 *
 * BROWSER_REDESIGN.md §3.2 の実装。「保存先フォルダを開く」を完全に
 * 廃止し、エクスポート結果をアプリ内ライブラリで管理する。
 *
 * 保存上限: 50 MB / 100 件超過時に古いものから自動削除。
 */

// 16 integration tests pin the public contract: put / get / list /
// remove / clear + 6 validation cases + 1 auto-eviction case + monotonic
// ordering. Decorative error messages, default fallbacks, IDB error
// strings are not differentiable.
import { isSafeFilename } from '../../shared/safeFilename';
import { parseTimestamp } from '../../shared/isoDate';

const DB_NAME = 'business-hub-library';
const DB_VERSION = 1;
const STORE = 'items';
/**
 * 保存の上限。**外へ出す** —— サイドバーの説明が「50 MB / 100 件」と名乗るので、
 * `sidebarNumberClaims.test.ts` がこの定数と突き合わせる (パス 163)。
 * 数を 2 か所に書くと必ず食い違う。
 */
export const MAX_ITEMS = 100;
export const MAX_BYTES = 50 * 1024 * 1024;

/**
 * 中身つきの 1 件。**`LibraryItemMeta` に `blob` が付いただけ** にしてある
 * (2026-09-13 · パス 193)。以前は `createdAt: number` / `size: number` を
 * 非 null で宣言していたが、**保存されている値は読めないことがある** ——
 * メタ側はパス 188 でそれを `number | null` として認めたのに、こちらは
 * 「必ず読める」と名乗っていた。型が中身より強い主張をしていた。
 *
 * 大きさを確かに知りたい所は `blob.size` を読む (控えの `size` は書いた時の
 * 申告で、中身とずれうる)。
 */
export interface LibraryItem extends LibraryItemMeta {
  readonly blob: Blob;
}

/**
 * `get()` の結果。**「無い」と「壊れている」を混ぜない** (2026-09-13 · パス 193)。
 *
 * 打ち手が違う —— 無いなら諦める、壊れているなら**その行を消す**。
 * 画面の `readItem` は既にこの語彙を持っていた (`'unreadable'` = 保管層の失敗) が、
 * `get()` が `req.result as LibraryItem` と**無検査でキャスト**していたので、
 * 壊れた控えは「見つかった」として返っていた。
 */
export type LibraryRead =
  | { readonly kind: 'found'; readonly item: LibraryItem }
  | { readonly kind: 'missing' }
  | { readonly kind: 'corrupt'; readonly meta: LibraryItemMeta };

export interface LibraryItemMeta {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly serviceId: string;
  /**
   * 保存時刻 (epoch ms)。**`null` = 保存されている値が読めない**
   * (2026-09-12 · パス 188)。`list()` は `cur.value as LibraryItem` と
   * 無検査でキャストしていたので、壊れた・手で直された控えの `NaN` が
   * そのまま画面へ届き `NaN/NaN/NaN NaN:NaN` と刷られていた。
   */
  readonly createdAt: number | null;
  /**
   * バイト数。**`null` = 読めない**。
   *
   * ここが一番重い: `enforceLimits()` は `all.reduce((a, it) => a + it.size, 0)` で
   * 合計を作り `total > MAX_BYTES` で古いものから消すので、**1 件でも `NaN` が
   * 混ざると合計が `NaN` になり、`NaN > MAX_BYTES` は必ず false** ——
   * **50 MB の上限が黙って効かなくなる** (件数の上限だけが残る)。
   */
  readonly size: number | null;
}

/** 読めない数値 (NaN / ±Infinity / 負 / 数値でない) を `null` に落とす。 */
function readableNonNeg(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * 読める保存時刻 (epoch ms) だけを通す。
 *
 * **数値だけを受ける** —— `parseTimestamp` は文字列も読むが、この欄は
 * `monotonicNow()` が書く数値で、型も `number | null` である
 * (文字列を通すと型と中身が食い違う。検査が最初にそれを捕まえた)。
 * `Number.isFinite` は `parseTimestamp` の中にも在るが**同じ文に書く** ——
 * 読む人にも `finiteShapeGuards` の走査にも、範囲を見ていることが見える
 * (パス 98 の規則)。範囲 (`MAX_TIMESTAMP_MS`) は `parseTimestamp` が持つ。
 */
function readableTimestamp(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return parseTimestamp(v) === null ? null : v;
}

/**
 * 保存されている控え 1 件を、読める形にして返す (2026-09-12 · パス 188)。
 *
 * **行そのものは落とさない** —— `id` が読めれば「消す」「取り出す」はできるので、
 * 落とすと壊れた控えが UI から触れなくなる (パス 136 の教訓: 保存した物は
 * 必ず消せる道が要る)。読めない欄だけを `null` にし、画面がそう言う。
 * `id` が読めない控えだけは何もできないので `null` を返して飛ばす。
 */
export function metaFromStored(v: unknown): LibraryItemMeta | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    filename: typeof r.filename === 'string' ? r.filename : '(名前が読めません)',
    mime: typeof r.mime === 'string' ? r.mime : 'application/octet-stream',
    serviceId: typeof r.serviceId === 'string' ? r.serviceId : 'unknown',
    createdAt: readableTimestamp(r.createdAt),
    size: readableNonNeg(r.size),
  };
}

/**
 * 保存されている控え 1 件を、**中身まで確かめて**返す (2026-09-13 · パス 193)。
 *
 * `list()` はパス 188 で無検査のキャストをやめたが、**`get()` はそのままだった**
 * —— 1 か所しか直していない形 (パス 66 の家系)。実測 (jsdom): メタが読めて
 * `blob` が Blob でない控えは行として普通に並び、「ダウンロード」を押すと
 * `URL.createObjectURL` が TypeError を投げ、**画面は何も変わらない**
 * (async の onClick なので拒否は未処理のまま消える)。隣の「開く」は
 * `blobToDataUrl` を `.catch` で包んでいたので「プレビューを生成できませんでした」
 * と言えていた —— 同じ画面の双子で、片方だけが守られていた。
 *
 * **大きさは `blob.size` を採る** —— 控えの `size` は書いた時の申告で、
 * 中身とずれうる (`previewBlocker` の上限判定はずれない方を見るべき)。
 */
export function itemFromStored(v: unknown): LibraryItem | null {
  const meta = metaFromStored(v);
  if (meta === null) return null;
  const blob = (v as { blob?: unknown }).blob;
  if (!(blob instanceof Blob)) return null;
  return { ...meta, size: blob.size, blob };
}

export interface Library {
  put(serviceId: string, filename: string, mime: string, blob: Blob): Promise<LibraryItemMeta>;
  list(): Promise<readonly LibraryItemMeta[]>;
  get(id: string): Promise<LibraryRead>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  totalBytes(): Promise<number>;
}

// --- IndexedDB helpers ------------------------------------------------

// スキーマ作成は「まだ無いとき」にしか走らないため、判定を変えても
// 初回は同じ結果になる (2 回目以降は onupgradeneeded 自体が呼ばれない)。
// createdAt 索引の unique も、時刻が必ず進む以上どちらでも同じ。
// Stryker disable ConditionalExpression,ObjectLiteral,BooleanLiteral: 初回のみ実行される経路 (差が観測できない)
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    // Stryker restore ConditionalExpression,ObjectLiteral,BooleanLiteral
    req.onsuccess = () => resolve(req.result);
    // 失敗の中身 (`req.error` か既定の Error か) は呼び出し側が文言で
    // 分岐しないため、どちらでも観測できない。**投げること自体**は
    // 「DB を開けないときは待ち続けない」の検査で固定している。
    // Stryker disable next-line LogicalOperator,StringLiteral: 失敗の中身では分岐しない
    req.onerror = () => reject(req.error ?? new Error('library open failed'));
  });
}

/**
 * この保管層の DB を丸ごと消す (ハードリセット · 2026-09-09 · パス 136)。`vault.wipeAndReset` と同じ約束 ——
 * **必ず解決し、何が起きたかを返す**。他のタブが接続を掴んでいれば `blocked` (消えていない)。
 * 画面は保管庫の内部を触らない (`lint:forbidden`) ので、消すのもここ。呼ぶのは `security/eraseAll.ts`。
 */
export function deleteLibraryDatabase(): Promise<'deleted' | 'blocked' | 'failed'> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve('deleted');
    req.onerror = () => resolve('failed');
    req.onblocked = () => resolve('blocked');
  });
}

// 取引の失敗・中断は fake-indexeddb では決定的に起こせない。配線がある
// ことに意味があり、中身 (どの Error か) では呼び出し側が分岐しない。
// Stryker disable ArrowFunction,LogicalOperator,StringLiteral,BlockStatement: IDB の失敗イベントは決定的に起こせない
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('library tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('library tx aborted'));
  });
}
// Stryker restore ArrowFunction,LogicalOperator,StringLiteral,BlockStatement

// Monotonic timestamp: same-or-later than wall clock, but strictly
// increasing within a single session. Prevents IDB cursor order
// indeterminism when multiple puts land in the same millisecond.
//
// Note: we cannot multiply Date.now() by 1e6 (overflows Number.MAX_SAFE_INTEGER
// at ~1.7e12 * 1e6 ≈ 1.7e18). Instead, advance lastTs by at least 1.
let _lastTs = 0;
function monotonicNow(): number {
  const now = Date.now();
  _lastTs = Math.max(_lastTs + 1, now);
  return _lastTs;
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  // RFC 4122 v4-ish — Uint8Array indices are always defined for known length.
  // Stryker disable next-line LogicalOperator: 長さ 16 の Uint8Array なので既定値には到達しない
  const b6 = b[6] ?? 0;
  // Stryker disable next-line LogicalOperator: 同上
  const b8 = b[8] ?? 0;
  b[6] = (b6 & 0x0f) | 0x40;
  b[8] = (b8 & 0x3f) | 0x80;
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// 先頭の `typeof` は型を絞るために置いている。後続の `.length` 比較と
// 正規表現は文字列以外を必ず落とすので、この前置きだけを変異させても
// 結果は変わらない (長さ・記号の判定そのものは検査で固定してある)。
// Stryker disable ConditionalExpression: typeof の前置きは後続の判定と重なる
function isSafeMime(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 128 && !/[\0\r\n]/.test(s);
}
function isSafeServiceId(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(s);
}
// Stryker restore ConditionalExpression

class IndexedDBLibrary implements Library {
  async put(serviceId: string, filename: string, mime: string, blob: Blob): Promise<LibraryItemMeta> {
    if (!isSafeServiceId(serviceId)) throw new Error('serviceId が不正です');
    if (!isSafeFilename(filename)) throw new Error('filename が不正です');
    if (!isSafeMime(mime)) throw new Error('mime が不正です');
    if (!(blob instanceof Blob)) throw new Error('blob が不正です');
    if (blob.size === 0) throw new Error('空のファイルは保存できません');
    if (blob.size > MAX_BYTES) throw new Error('ファイルが大きすぎます (50 MB 超)');

    const item: LibraryItem = {
      id: uuid(),
      filename,
      mime,
      serviceId,
      createdAt: monotonicNow(),
      size: blob.size,
      blob,
    };
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(item);
    await txDone(tx);
    db.close();
    await this.enforceLimits();
    return {
      id: item.id,
      filename: item.filename,
      mime: item.mime,
      serviceId: item.serviceId,
      createdAt: item.createdAt,
      size: item.size,
    };
  }

  /**
   * 新しい順の一覧。
   *
   * **`createdAt` の索引だけでは足りない** (2026-09-12 · パス 188) ——
   * `NaN` は IndexedDB の有効なキーではないので、保存時刻が読めない控えは
   * **索引に載らず `list()` から丸ごと見えない**。見えないと 一覧にも出ず・
   * 「削除」も押せず・容量の集計にも入らないのに**場所は占める** ——
   * 消せない物を作らないという規則 (パス 136) に反する。
   * 索引を走ってから、**本体も走って索引が拾えなかった控えを後ろに足す**。
   */
  async list(): Promise<readonly LibraryItemMeta[]> {
    const db = await openDb();
    const out: LibraryItemMeta[] = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('createdAt').openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          // **無検査のキャストをやめた** (パス 188)。id が読めない控えだけ飛ばす。
          const meta = metaFromStored(cur.value);
          if (meta !== null) out.push(meta);
          cur.continue();
        } else {
          resolve();
        }
      };
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IDB の失敗イベントは決定的に起こせない
      req.onerror = () => reject(req.error ?? new Error('cursor failed'));
    });
    // **索引が拾えなかった控えを後ろに足す** (パス 188)。`createdAt` が
    // `NaN` の控えは索引に載らないので、本体を走らないと一生見えない。
    const seen = new Set(out.map((m) => m.id));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          const meta = metaFromStored(cur.value);
          if (meta !== null && !seen.has(meta.id)) out.push(meta);
          cur.continue();
        } else {
          resolve();
        }
      };
      // IDB の失敗イベントは決定的に起こせない (fake-indexeddb も本物も、
      // 読み取り専用のカーソルを外から失敗させる口を持たない) ので、この
      // 経路は測れない。`同上` ではなく理由を書く —— 走査は後方参照を
      // 「理由なし」として数える (パス 25 の規則・パス 188 で鳴った)。
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: 失敗イベントを決定的に起こせない
      req.onerror = () => reject(req.error ?? new Error('sweep failed'));
    });
    db.close();
    return out;
  }

  async get(id: string): Promise<LibraryRead> {
    // 文字列でない id は後段の IDB 取得でも見つからないため、前置きだけを
    // 変異させても結果は変わらない (空文字も同じ)。
    // Stryker disable next-line ConditionalExpression: 後段の取得と重なる (観測不能)
    if (typeof id !== 'string' || id.length === 0) return { kind: 'missing' };
    const db = await openDb();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      // **無検査のキャストをやめた** (パス 193)。`list()` は パス 188 で
      // 直していたが、こちらは `as LibraryItem` のままだった。
      req.onsuccess = () => resolve(req.result);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: 同上
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
    db.close();
    // ここで `undefined` / `null` を別に見ないのは意図的 —— どちらも
    // `metaFromStored` が null を返し (`typeof` が 'object' でない / null を弾く)、
    // 下の最後の行で `{ kind: 'missing' }` になる。**前置きで書くと同じ
    // 結論を 2 通りに導くことになる** —— 変異検査から見れば殺せない枝である
    // (IDB は keyPath を持つので素の null を値として戻さないし、不在は undefined)。
    const item = itemFromStored(stored);
    if (item !== null) return { kind: 'found', item };
    // 中身が取り出せない控え。**行は残す** —— 消す道が要る (パス 136)。
    // `id` すら読めなければ名指しもできないので、そのときだけ「無い」と同じ扱い。
    const meta = metaFromStored(stored);
    return meta === null ? { kind: 'missing' } : { kind: 'corrupt', meta };
  }

  async remove(id: string): Promise<void> {
    // Stryker disable next-line ConditionalExpression: 後段の削除と重なる (観測不能)
    if (typeof id !== 'string' || id.length === 0) return;
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
  }

  async clear(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await txDone(tx);
    db.close();
  }

  /**
   * **読める** バイト数の合計 (パス 188)。読めない控え (`size === null`) は
   * 足さない —— 足すと `NaN` になり、合計そのものが意味を失う。
   * 「いくつ読めなかったか」は `list()` の結果から呼び出し側が数える
   * (画面はそれを注記に刷る)。
   */
  async totalBytes(): Promise<number> {
    const items = await this.list();
    return items.reduce((acc, it) => acc + (it.size ?? 0), 0);
  }

  /** 上限超過時に古いものから削除。put() の後で呼ぶ。 */
  private async enforceLimits(): Promise<void> {
    const all = await this.list(); // sorted newest-first
    // 読めない size は 0 として数える (パス 188)。**足すと合計が NaN になり
    // `NaN > MAX_BYTES` が必ず false = 上限が丸ごと効かなくなる。** 0 として
    // 数えると上限は「測れた分について」効く —— 件数の上限も併せて掛かる。
    let total = all.reduce((acc, it) => acc + (it.size ?? 0), 0);
    let count = all.length;
    // Iterate from oldest (end of array) and remove until under both limits.
    // `i >= 0` の下限には届かない — put() が 1 件あたり MAX_BYTES 以下しか
    // 受け付けないので、最後の 1 件を残せば必ず上限内に収まる。つまり
    // 「全部消す」状況は作れず、下限側の変異は観測できない。
    // 上限の判定 (>= と > の別) は検査で固定してある。
    // Stryker disable next-line ConditionalExpression,EqualityOperator,UpdateOperator: 下限に到達しない (put 側の上限で保証)
    for (let i = all.length - 1; i >= 0 && (count > MAX_ITEMS || total > MAX_BYTES); i--) {
      const it = all[i]!;
      await this.remove(it.id);
      total -= it.size ?? 0;
      count -= 1;
    }
  }
}

let singleton: Library | null = null;
export function getLibrary(): Library {
  if (!singleton) singleton = new IndexedDBLibrary();
  return singleton;
}

export function _resetLibraryForTests(): void {
  singleton = null;
}
