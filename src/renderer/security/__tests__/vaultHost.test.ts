/**
 * `vaultHost.ts` —— `vault.mamori` の薄い壁 (2026-11-15 · MG-070)。
 *
 * 壁は**判断を持たない** (どの store へ何を書くか・`add` で書くか・床・断りの文は `vault.mamori`)。
 * ここで見るのは、壁が**約束した振る舞い**だけである:
 *
 * - 複数の書き込みは 1 トランザクション (片方が落ちれば両方巻き戻る)
 * - `add` で書くと、鍵が既に在れば取引ごと失敗する (T-064 の土台)
 * - 暗号化は呼ぶたびに新しい IV を採る・AAD が違えば復号は失敗する
 * - 鍵を作る口は WebCrypto が無ければ理由の文で投げる
 * - 導出した鍵は取り出せない / master 鍵は取り出せる (包むため)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  hostDecryptBytes,
  hostDecryptString,
  hostDelete,
  hostDeleteDb,
  hostDeriveKey,
  hostEncryptBytes,
  hostEncryptString,
  hostErrorName,
  hostExportRawKey,
  hostGenerateMasterKey,
  hostGet,
  hostImportNonExtractable,
  hostIsBufferView,
  hostKeys,
  hostOpenDb,
  hostPut,
  hostPutAll,
  hostRandomBytes,
  hostUtf8,
  hostWarn,
  hostZero,
} from '../vaultHost';
import { AES_GCM_IV_BYTES } from '../../../shared/cryptoParams';

const STORES = ['meta', 'tokens'] as const;

async function freshDb(): Promise<IDBDatabase> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  return hostOpenDb(STORES);
}

describe('vaultHost: IndexedDB の口', () => {
  let db: IDBDatabase;
  beforeEach(async () => {
    db = await freshDb();
  });
  afterEach(() => {
    db.close();
  });

  it('開くと、挙げた store が在る (新規作成)', () => {
    expect([...db.objectStoreNames].sort()).toEqual(['meta', 'tokens']);
  });

  it('書いた値を読める・無い鍵は undefined', async () => {
    await hostPut(db, 'tokens', 'github', { n: 1 });
    expect(await hostGet<{ n: number }>(db, 'tokens', 'github')).toEqual({ n: 1 });
    expect(await hostGet<unknown>(db, 'tokens', 'missing')).toBeUndefined();
    // store は混ざらない (同じ鍵でも別の store には無い)。
    expect(await hostGet<unknown>(db, 'meta', 'github')).toBeUndefined();
  });

  it('put は上書きする', async () => {
    await hostPut(db, 'tokens', 'github', 'a');
    await hostPut(db, 'tokens', 'github', 'b');
    expect(await hostGet<string>(db, 'tokens', 'github')).toBe('b');
  });

  it('鍵の一覧は store ごと', async () => {
    await hostPut(db, 'tokens', 'slack', 1);
    await hostPut(db, 'tokens', 'github', 2);
    await hostPut(db, 'meta', 'vault', 3);
    expect((await hostKeys(db, 'tokens')).sort()).toEqual(['github', 'slack']);
    expect(await hostKeys(db, 'meta')).toEqual(['vault']);
  });

  it('消すとその鍵だけが消える・無い鍵を消しても投げない', async () => {
    await hostPut(db, 'tokens', 'slack', 1);
    await hostPut(db, 'tokens', 'github', 2);
    await hostDelete(db, 'tokens', 'slack');
    await hostDelete(db, 'tokens', 'never-there');
    expect(await hostKeys(db, 'tokens')).toEqual(['github']);
  });

  it('★ putAll (put) は複数の store へ 1 トランザクションで書く', async () => {
    const real = IDBDatabase.prototype.transaction;
    const modes: string[] = [];
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      names: string | Iterable<string>,
      mode?: IDBTransactionMode,
    ) {
      modes.push(`${mode ?? 'readonly'}:${typeof names === 'string' ? names : [...names].sort().join('+')}`);
      return real.call(this, names as string, mode);
    });
    try {
      await hostPutAll(
        db,
        [
          { store: 'meta', key: 'vault', value: 1 },
          { store: 'tokens', key: 'github', value: 2 },
          { store: 'meta', key: 'master-wrap', value: 3 },
        ],
        false,
      );
    } finally {
      spy.mockRestore();
    }
    // 取引は 1 つで、使う store は重複なく 2 つ。
    expect(modes).toEqual(['readwrite:meta+tokens']);
    expect(await hostGet<number>(db, 'meta', 'vault')).toBe(1);
    expect(await hostGet<number>(db, 'tokens', 'github')).toBe(2);
    expect(await hostGet<number>(db, 'meta', 'master-wrap')).toBe(3);
  });

  it('putAll (put) は既に在る鍵を上書きする', async () => {
    await hostPut(db, 'meta', 'vault', 'old');
    await hostPutAll(db, [{ store: 'meta', key: 'vault', value: 'new' }], false);
    expect(await hostGet<string>(db, 'meta', 'vault')).toBe('new');
  });

  it('★ putAll (add) は鍵が既に在れば ConstraintError で失敗し、同じ取引の他の項も書かれない', async () => {
    await hostPut(db, 'meta', 'master-wrap', 'existing');
    let caught: unknown = null;
    try {
      await hostPutAll(
        db,
        [
          { store: 'meta', key: 'vault', value: 'new-meta' },
          { store: 'meta', key: 'master-wrap', value: 'new-wrap' },
        ],
        true,
      );
    } catch (e) {
      caught = e;
    }
    expect(hostErrorName(caught)).toBe('ConstraintError');
    // 巻き戻り: 先に書こうとした `vault` も入っていない・既存の値はそのまま。
    expect(await hostGet<unknown>(db, 'meta', 'vault')).toBeUndefined();
    expect(await hostGet<string>(db, 'meta', 'master-wrap')).toBe('existing');
  });

  it('putAll (add) は鍵が無ければ書ける', async () => {
    await hostPutAll(
      db,
      [
        { store: 'meta', key: 'vault', value: 'm' },
        { store: 'meta', key: 'master-wrap', value: 'w' },
      ],
      true,
    );
    expect((await hostKeys(db, 'meta')).sort()).toEqual(['master-wrap', 'vault']);
  });

  it('putAll に空を渡しても投げない (何も書かない)', async () => {
    await expect(hostPutAll(db, [], false)).resolves.toBeUndefined();
    await expect(hostPutAll(db, [], true)).resolves.toBeUndefined();
    expect(await hostKeys(db, 'meta')).toEqual([]);
  });
});

describe('vaultHost: DB を丸ごと消す', () => {
  it('接続が無ければ deleted を返し、中身は消える', async () => {
    const db = await freshDb();
    await hostPut(db, 'tokens', 'github', 1);
    db.close();
    expect(await hostDeleteDb()).toBe('deleted');
    const again = await hostOpenDb(STORES);
    try {
      expect(await hostKeys(again, 'tokens')).toEqual([]);
    } finally {
      again.close();
    }
  });

  it('★ 他の接続が開いたままなら blocked を返す (投げない・待ち続けない)', async () => {
    const db = await freshDb();
    try {
      expect(await hostDeleteDb()).toBe('blocked');
    } finally {
      db.close();
    }
  });

  it('ブラウザが拒めば failed を返す', async () => {
    const spy = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation(() => {
      const req = {} as IDBOpenDBRequest;
      queueMicrotask(() => req.onerror?.(new Event('error')));
      return req;
    });
    try {
      expect(await hostDeleteDb()).toBe('failed');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('vaultHost: 乱数と文字コード', () => {
  it('乱数は頼んだ長さで、呼ぶたびに違う', () => {
    const a = hostRandomBytes(32);
    const b = hostRandomBytes(32);
    expect(a).toHaveLength(32);
    expect(hostRandomBytes(12)).toHaveLength(12);
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
    // 全部 0 のままではない (埋められている)。
    expect(a.some((x) => x !== 0)).toBe(true);
  });

  it('UTF-8 にする (多バイトもそのまま)', () => {
    expect([...hostUtf8('aあ')]).toEqual([0x61, 0xe3, 0x81, 0x82]);
    expect(hostUtf8('')).toHaveLength(0);
  });
});

describe('vaultHost: 鍵を作る口', () => {
  const salt = new Uint8Array(32).fill(7);

  it('★ 導出した鍵は取り出せない (extractable: false) AES-GCM-256', async () => {
    const key = await hostDeriveKey('pw', salt, 1000);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('★ 同じ入力なら同じ鍵・秘密 / ソルト / 反復回数のどれが違っても別の鍵', async () => {
    const base = await hostDeriveKey('pw', salt, 1000);
    const sealed = await hostEncryptString(base, 'hello');
    const open = (k: CryptoKey): Promise<string> => hostDecryptString(k, sealed.iv, sealed.ciphertext);
    await expect(open(await hostDeriveKey('pw', salt, 1000))).resolves.toBe('hello');
    await expect(open(await hostDeriveKey('pw2', salt, 1000))).rejects.toThrow();
    await expect(open(await hostDeriveKey('pw', new Uint8Array(32).fill(8), 1000))).rejects.toThrow();
    await expect(open(await hostDeriveKey('pw', salt, 1001))).rejects.toThrow();
  });

  it('master 鍵は取り出せる (包むため) —— 取り出した 32 バイトを読み込み直すと取り出せない鍵になる', async () => {
    const master = await hostGenerateMasterKey();
    expect(master.extractable).toBe(true);
    expect(master.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    const raw = await hostExportRawKey(master);
    expect(raw).toBeInstanceOf(Uint8Array);
    expect(raw).toHaveLength(32);
    const runtime = await hostImportNonExtractable(raw);
    expect(runtime.extractable).toBe(false);
    expect([...runtime.usages].sort()).toEqual(['decrypt', 'encrypt']);
    // 同じ鍵である (片方で閉じた物をもう片方で開ける)。
    const sealed = await hostEncryptString(master, 'x');
    await expect(hostDecryptString(runtime, sealed.iv, sealed.ciphertext)).resolves.toBe('x');
  });

  it('master 鍵は呼ぶたびに違う', async () => {
    const a = await hostExportRawKey(await hostGenerateMasterKey());
    const b = await hostExportRawKey(await hostGenerateMasterKey());
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });

  describe('WebCrypto が無い端末', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    beforeEach(() => {
      Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    });
    afterEach(() => {
      if (original !== undefined) Object.defineProperty(globalThis, 'crypto', original);
    });

    it('★ 導出は理由の文で投げる (素の TypeError を見せない)', async () => {
      await expect(hostDeriveKey('pw', salt, 1000)).rejects.toThrow(/WebCrypto/);
    });

    it('★ master 鍵の生成も理由の文で投げる', async () => {
      await expect(hostGenerateMasterKey()).rejects.toThrow(/WebCrypto/);
    });
  });
});

describe('vaultHost: 暗号化と復号', () => {
  let key: CryptoKey;
  beforeEach(async () => {
    key = await hostImportNonExtractable(hostRandomBytes(32));
  });

  it('文字列を往復できる (多バイトも)', async () => {
    const sealed = await hostEncryptString(key, 'トークン😀');
    expect(sealed.iv).toBeInstanceOf(Uint8Array);
    expect(sealed.ciphertext).toBeInstanceOf(Uint8Array);
    await expect(hostDecryptString(key, sealed.iv, sealed.ciphertext)).resolves.toBe('トークン😀');
  });

  it('★ IV は決まった長さで、同じ平文でも呼ぶたびに違う (暗号文も違う)', async () => {
    const a = await hostEncryptString(key, 'same');
    const b = await hostEncryptString(key, 'same');
    expect(a.iv).toHaveLength(AES_GCM_IV_BYTES);
    expect(Buffer.from(a.iv).toString('hex')).not.toBe(Buffer.from(b.iv).toString('hex'));
    expect(Buffer.from(a.ciphertext).toString('hex')).not.toBe(Buffer.from(b.ciphertext).toString('hex'));
    const c = await hostEncryptBytes(key, new Uint8Array([1, 2, 3]));
    const d = await hostEncryptBytes(key, new Uint8Array([1, 2, 3]));
    expect(c.iv).toHaveLength(AES_GCM_IV_BYTES);
    expect(Buffer.from(c.iv).toString('hex')).not.toBe(Buffer.from(d.iv).toString('hex'));
  });

  it('★ AAD を付けて閉じた物は、同じ AAD でだけ開く', async () => {
    const aad = hostUtf8('service-hub-token-v1:github');
    const sealed = await hostEncryptString(key, 'secret', aad);
    await expect(hostDecryptString(key, sealed.iv, sealed.ciphertext, aad)).resolves.toBe('secret');
    await expect(hostDecryptString(key, sealed.iv, sealed.ciphertext, hostUtf8('service-hub-token-v1:slack'))).rejects.toThrow();
    // AAD なしでも開かない (付けた物を外して読ませない)。
    await expect(hostDecryptString(key, sealed.iv, sealed.ciphertext)).rejects.toThrow();
    // 逆向き: AAD なしで閉じた物に AAD を付けても開かない。
    const bare = await hostEncryptString(key, 'secret');
    await expect(hostDecryptString(key, bare.iv, bare.ciphertext, aad)).rejects.toThrow();
  });

  it('別の鍵・改竄した暗号文では開かない', async () => {
    const sealed = await hostEncryptString(key, 'secret');
    const other = await hostImportNonExtractable(hostRandomBytes(32));
    await expect(hostDecryptString(other, sealed.iv, sealed.ciphertext)).rejects.toThrow();
    const bent = new Uint8Array(sealed.ciphertext);
    bent[0] = (bent[0] ?? 0) ^ 1;
    await expect(hostDecryptString(key, sealed.iv, bent)).rejects.toThrow();
  });

  it('生のバイトを往復できる', async () => {
    const plain = new Uint8Array([0, 1, 2, 250, 255]);
    const sealed = await hostEncryptBytes(key, plain);
    const back = await hostDecryptBytes(key, sealed.iv, sealed.ciphertext);
    expect(back).toBeInstanceOf(Uint8Array);
    expect([...back]).toEqual([...plain]);
    const other = await hostImportNonExtractable(hostRandomBytes(32));
    await expect(hostDecryptBytes(other, sealed.iv, sealed.ciphertext)).rejects.toThrow();
  });
});

describe('vaultHost: 小さな口', () => {
  it('hostZero は全部を 0 にする (その場で)', () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);
    hostZero(bytes);
    expect([...bytes]).toEqual([0, 0, 0, 0]);
  });

  it('hostIsBufferView は TypedArray / DataView だけを通す', () => {
    expect(hostIsBufferView(new Uint8Array(1))).toBe(true);
    expect(hostIsBufferView(new DataView(new ArrayBuffer(1)))).toBe(true);
    expect(hostIsBufferView(new ArrayBuffer(1))).toBe(false);
    expect(hostIsBufferView([1, 2])).toBe(false);
    expect(hostIsBufferView('abc')).toBe(false);
    expect(hostIsBufferView(null)).toBe(false);
    expect(hostIsBufferView(undefined)).toBe(false);
    expect(hostIsBufferView({ byteLength: 1 })).toBe(false);
  });

  it('hostErrorName は name を読む (Error でなくても)', () => {
    expect(hostErrorName(new TypeError('x'))).toBe('TypeError');
    expect(hostErrorName({ name: 'ConstraintError' })).toBe('ConstraintError');
    expect(hostErrorName({})).toBeUndefined();
    expect(hostErrorName('text')).toBeUndefined();
  });

  it('hostWarn は console.warn へ文と原因をそのまま渡す', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const cause = new Error('boom');
      hostWarn('message', cause);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('message', cause);
    } finally {
      spy.mockRestore();
    }
  });
});
