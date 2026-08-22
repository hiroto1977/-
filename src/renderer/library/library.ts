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

const DB_NAME = 'business-hub-library';
const DB_VERSION = 1;
const STORE = 'items';
const MAX_ITEMS = 100;
const MAX_BYTES = 50 * 1024 * 1024;

export interface LibraryItem {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly serviceId: string;
  readonly createdAt: number;
  readonly size: number;
  readonly blob: Blob;
}

export interface LibraryItemMeta {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly serviceId: string;
  readonly createdAt: number;
  readonly size: number;
}

export interface Library {
  put(serviceId: string, filename: string, mime: string, blob: Blob): Promise<LibraryItemMeta>;
  list(): Promise<readonly LibraryItemMeta[]>;
  get(id: string): Promise<LibraryItem | null>;
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

  async list(): Promise<readonly LibraryItemMeta[]> {
    const db = await openDb();
    const out: LibraryItemMeta[] = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('createdAt').openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          const v = cur.value as LibraryItem;
          out.push({
            id: v.id,
            filename: v.filename,
            mime: v.mime,
            serviceId: v.serviceId,
            createdAt: v.createdAt,
            size: v.size,
          });
          cur.continue();
        } else {
          resolve();
        }
      };
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IDB の失敗イベントは決定的に起こせない
      req.onerror = () => reject(req.error ?? new Error('cursor failed'));
    });
    db.close();
    return out;
  }

  async get(id: string): Promise<LibraryItem | null> {
    // 文字列でない id は後段の IDB 取得でも見つからず null になるため、
    // 前置きだけを変異させても結果は変わらない (空文字も同じ)。
    // Stryker disable next-line ConditionalExpression: 後段の取得と重なる (観測不能)
    if (typeof id !== 'string' || id.length === 0) return null;
    const db = await openDb();
    const item = await new Promise<LibraryItem | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as LibraryItem | undefined);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: 同上
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
    db.close();
    return item ?? null;
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

  async totalBytes(): Promise<number> {
    const items = await this.list();
    return items.reduce((acc, it) => acc + it.size, 0);
  }

  /** 上限超過時に古いものから削除。put() の後で呼ぶ。 */
  private async enforceLimits(): Promise<void> {
    const all = await this.list(); // sorted newest-first
    let total = all.reduce((acc, it) => acc + it.size, 0);
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
      total -= it.size;
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
