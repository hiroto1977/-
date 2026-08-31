/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';
import { IDENTITY_CIPHER, isSealedData, type RecordCipher } from '../recordCipher';
import { deriveAesKey, sealWithKey } from '../../security/dataCrypto';
import {
  isEncryptionEnabled,
  enableEncryption,
  unlockEncryption,
  disableEncryption,
} from '../recordEncryption';

const LS_KEY = 'servicehub.recordEncryption';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}


/*
 * **移行が途中で落ちても salt を失わない。**
 *
 * `enableEncryption` は 2026-08-23 まで `reencryptAll()` の**後**に
 * meta (salt + KCV) を保存していた。`reencryptAll` はレコード 1 件ずつ
 * 別のトランザクションで書くので途中で落ちうる (容量超過・タブを閉じた・
 * IndexedDB のエラー)。落ちると **封緘済みレコードは出来ているのに
 * salt が無い** —— `IDENTITY_CIPHER.decrypt` が明示的に投げるので黙って
 * 壊れはしないが、**正しいパスフレーズを知っていても鍵を作れない**。
 *
 * 解除側 (`disableEncryption`) は最初から正しい順序 (復号を全部終えてから
 * `clearMeta()`) だった。有効化側だけが逆だった。
 *
 * ここで留めるのは**順序**そのもの —— 移行が始まる時点で meta が既に
 * 保存されていること。
 */
describe('有効化の順序 — meta は移行より先に保存される', () => {
  it('reencryptAll が呼ばれる時点で meta が既に在る', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });

    let metaAtMigration: string | null = 'not-called';
    const real = store.reencryptAll.bind(store);
    const spy = vi
      .spyOn(store, 'reencryptAll')
      .mockImplementation(async (from?: RecordCipher) => {
        metaAtMigration = localStorage.getItem(LS_KEY);
        return real(from);
      });
    try {
      await enableEncryption('correct-horse');
    } finally {
      spy.mockRestore();
    }

    expect(metaAtMigration, 'reencryptAll が呼ばれていない — 検査が的を外している')
      .not.toBe('not-called');
    expect(metaAtMigration, '移行の時点で meta が保存されていない (salt を失う順序)')
      .not.toBeNull();
    expect(JSON.parse(metaAtMigration as string)).toMatchObject({ enabled: true });
  });

  it('移行が落ちても salt は残り、パスフレーズで読み直せる', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });

    const spy = vi.spyOn(store, 'reencryptAll').mockRejectedValue(new Error('quota exceeded'));
    try {
      await expect(enableEncryption('correct-horse')).rejects.toThrow('quota exceeded');
    } finally {
      spy.mockRestore();
    }

    // salt が残っているので、アンロックして読み直せる。
    expect(isEncryptionEnabled(), 'meta が消えている — salt を失っている').toBe(true);
    expect(await unlockEncryption('correct-horse')).toBe(true);
    expect((await getRecordStore().list('sales')).length).toBe(1);
  });
});

beforeEach(async () => {
  _resetRecordStoreForTests();
  getRecordStore().configureCipher(IDENTITY_CIPHER); // reset cipher between tests
  localStorage.clear();
  await clearIdb();
});

describe('recordEncryption lifecycle', () => {
  it('starts disabled', () => {
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('enableEncryption seals existing records and persists meta', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 100 });

    await enableEncryption('pw-123');
    expect(isEncryptionEnabled()).toBe(true);

    // at-rest payload is now sealed; plaintext no longer present
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(true);
    // but reads (cipher is configured) still return plaintext
    expect((await store.get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 100 });
  });

  it('rejects enabling twice', async () => {
    await enableEncryption('pw');
    await expect(enableEncryption('pw')).rejects.toThrow(/既に有効/);
  });

  it('unlock with the correct passphrase reattaches the cipher (new session)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 7 });
    await enableEncryption('pw-123');

    // simulate a fresh session: store forgot the key
    _resetRecordStoreForTests();
    const fresh = getRecordStore();
    // without unlock, sealed data can't be read
    await expect(fresh.get(rec.id)).rejects.toThrow(/暗号化/);

    expect(await unlockEncryption('pw-123')).toBe(true);
    expect((await getRecordStore().get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 7 });
  });

  it('unlock with the wrong passphrase returns false (no lockout, no corruption)', async () => {
    await getRecordStore().insert('sales', { amount: 1 });
    await enableEncryption('right');
    _resetRecordStoreForTests();

    expect(await unlockEncryption('wrong')).toBe(false);
    // correct one still works afterwards
    expect(await unlockEncryption('right')).toBe(true);
  });

  it('unlock is a no-op (true) when encryption is not enabled', async () => {
    expect(await unlockEncryption('anything')).toBe(true);
  });

  it('disable decrypts everything back to plaintext and clears meta', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 42 });
    await enableEncryption('pw');

    expect(await disableEncryption('pw')).toBe(true);
    expect(isEncryptionEnabled()).toBe(false);

    // payload is plaintext again, readable with the identity cipher
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(false);
    expect((await store.get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 42 });
  });

  it('disable with a wrong passphrase returns false and keeps data encrypted', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });
    await enableEncryption('right');

    expect(await disableEncryption('wrong')).toBe(false);
    expect(isEncryptionEnabled()).toBe(true);
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(true);
  });

  it('rejects enabling with an empty passphrase', async () => {
    await expect(enableEncryption('')).rejects.toThrow('パスフレーズを入力してください');
  });

  it('disable is a no-op (true) when encryption is not enabled', async () => {
    // meta が無い → 早期 return true。`!meta` を false 固定する mutant は null.salt で例外。
    expect(await disableEncryption('anything')).toBe(true);
  });

  it('treats tampered meta (bad enabled / salt / kcv) as disabled', async () => {
    await enableEncryption('pw');
    const valid = JSON.parse(localStorage.getItem(LS_KEY)!);
    // enabled !== true
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, enabled: false }));
    expect(isEncryptionEnabled()).toBe(false);
    // salt が文字列でない
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, salt: 123 }));
    expect(isEncryptionEnabled()).toBe(false);
    // kcv が封緘形でない
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, kcv: { nope: 1 } }));
    expect(isEncryptionEnabled()).toBe(false);
    // 壊れた JSON → catch 経路で null (catch を空にする mutant は undefined を返し true 化)。
    localStorage.setItem(LS_KEY, 'not-json{');
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('rejects a passphrase whose KCV decrypts to the wrong plaintext (content check)', async () => {
    await enableEncryption('pw');
    const valid = JSON.parse(localStorage.getItem(LS_KEY)!);
    // 同じ鍵で別平文を封緘し kcv を差し替える → 復号は成功するが内容が KCV と不一致。
    const key = await deriveAesKey('pw', valid.salt);
    const wrongKcv = await sealWithKey(key, 'NOT-THE-KCV');
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, kcv: wrongKcv }));
    _resetRecordStoreForTests();
    // unlock / disable とも内容不一致を検知して false (catch ではなく `!== KCV` 経路)。
    expect(await unlockEncryption('pw')).toBe(false);
    expect(await disableEncryption('pw')).toBe(false);
  });

  /*
   * **ロックアウトしないこと。**
   *
   * このモジュールの設計節は「誤りなら false を返すだけ (沈黙のデータ破壊を
   * しない)。ユーザーは正しいパスフレーズを再入力すれば復帰できる」と書いている。
   * ところが鍵の導出 (`deriveAesKey`) が try の**外**に在り、2 通りで throw して
   * いた (2026-08-22 実測):
   *
   *   - 空パスフレーズ            → 'パスワードを入力してください'
   *   - `meta.salt` が base64 で読めない → '暗号化データが壊れています…'
   *     (`loadMeta` は `typeof salt === 'string'` しか見ていない)
   *
   * しかも `disableEncryption` が同じ形なので、**解錠も解除もできない** ——
   * 避けると宣言しているロックアウトそのものに落ちていた。
   *
   * 壊れた salt は誤パスフレーズと同じ false になるので理由は区別できないが、
   * 利用者がやり直せる状態に留まる方を採っている。
   */
  it.each([
    ['salt が base64 として読めない', '###'],
    ['salt が記号だけ', '@@@@'],
  ])('%s でも throw せず false (解錠も解除も呼べる)', async (_label, badSalt) => {
    await enableEncryption('pw');
    const valid = JSON.parse(localStorage.getItem(LS_KEY)!);
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, salt: badSalt }));
    _resetRecordStoreForTests();
    await expect(unlockEncryption('pw')).resolves.toBe(false);
    await expect(disableEncryption('pw')).resolves.toBe(false);
  });

  it('空パスフレーズでも throw せず false', async () => {
    await enableEncryption('pw');
    _resetRecordStoreForTests();
    await expect(unlockEncryption('')).resolves.toBe(false);
    await expect(disableEncryption('')).resolves.toBe(false);
  });
});

/*
 * **「無効」と「読めない」は別物。**
 *
 * `enableEncryption` の門は `isEncryptionEnabled()`、すなわち
 * `loadMeta() !== null` である。メタが壊れていると `loadMeta` は `null` を
 * 返すので門は開き、`saveMeta` が壊れたメタを新しい salt で上書きする。
 * レコードが旧 salt で封緘済みなら、**正しいパスフレーズを知っていても
 * 二度と開けない** —— 関数の注記が別の入口について警告している
 * 「salt … 二度と作れない」と同じ結末に、別経路で辿り着く。
 *
 * 壊れた JSON の中にも salt は読める形で残っていることが多い。
 * 消さなければ人手で拾える。消したら拾えない。
 */
describe('壊れたメタを上書きしない', () => {
  it('メタが壊れているときは有効化を断る (salt を守る)', async () => {
    // 旧 salt が読み取れる形で残っている壊れ方 (末尾が切れた JSON)。
    const broken = '{"enabled":true,"salt":"OLD-SALT-KEEP-ME","kcv":{"iv":"aa"';
    localStorage.setItem(LS_KEY, broken);

    await expect(enableEncryption('new-passphrase')).rejects.toThrow(/読めませんでした/);

    // 文言は 3 片の連結でできている。`/読めませんでした/` は**先頭の 1 片にしか
    // 当たらない**ので、2 片目・3 片目を空にする変異が素通りしていた (実測)。
    // 「何が失われるか」と「どうすればよいか」は、この警告の**用途そのもの**
    // なので、片ごとに固有の言い回しを取って別々に確かめる。
    await expect(enableEncryption('new-passphrase')).rejects.toThrow(/salt が失われます/);
    await expect(enableEncryption('new-passphrase')).rejects.toThrow(/レコードを書き出してから/);
    await expect(enableEncryption('new-passphrase')).rejects.toThrow(/やり直してください/);

    // ★ ここが本体 —— 壊れた値がそのまま残っていること。
    expect(localStorage.getItem(LS_KEY)).toBe(broken);
    expect(localStorage.getItem(LS_KEY)).toContain('OLD-SALT-KEEP-ME');
  });

  it('形が違うメタ (版数違い) でも断る', async () => {
    const other = '{"version":2,"salt":"OLD-SALT-KEEP-ME"}';
    localStorage.setItem(LS_KEY, other);

    await expect(enableEncryption('new-passphrase')).rejects.toThrow(/読めませんでした/);
    expect(localStorage.getItem(LS_KEY)).toBe(other);
  });

  it('メタが無いときは今までどおり有効化できる (無いと読めないを混ぜない)', async () => {
    localStorage.removeItem(LS_KEY);
    await enableEncryption('good-passphrase');
    expect(isEncryptionEnabled()).toBe(true);
  });
});

/*
 * **復元は書き込みである。**
 *
 * `insert` / `insertMany` / `update` は全部 `cipher.encrypt` を通るのに、
 * `importAll` だけが受け取った物をそのまま置いていた。実測 (2026-08-23) ——
 * 暗号化を有効にしたまま平文時代のバックアップを復元すると、IndexedDB の
 * 生の中身に平文がそのまま残った:
 *
 *   通常書き込み : 封緘=true   {"__enc":{…}}
 *   復元レコード : 封緘=false  {"amount":999,"memo":"RESTORED-SECRET"}
 *
 * 読み出しは平文素通しで成功するので画面上は何も起きない。利用者は
 * 「暗号化されています」の表示を見ながら、災害復旧のつもりで保護を外している。
 */
describe('復元しても保護を外さない', () => {
  /** IndexedDB の生の中身 (cipher を通さない) を読む。 */
  function rawRecords(): Promise<{ id: string; data: unknown }[]> {
    return new Promise((res, rej) => {
      const q = indexedDB.open('business-hub-data');
      q.onsuccess = () => {
        const db = q.result;
        const g = db.transaction('records', 'readonly').objectStore('records').getAll();
        g.onsuccess = () => {
          res(g.result as { id: string; data: unknown }[]);
          db.close();
        };
        g.onerror = () => rej(g.error);
      };
      q.onerror = () => rej(q.error);
    });
  }

  it('暗号化 ON で平文バックアップを復元すると、封緘してから保存する', async () => {
    await enableEncryption('passphrase-abc');
    const store = getRecordStore();

    await store.importAll([
      { id: 'old-1', collection: 'sales', createdAt: 1, updatedAt: 1, data: { memo: 'RESTORED-SECRET' } },
    ]);

    const raw = await rawRecords();
    const restored = raw.find((r) => r.id === 'old-1')!;
    // ★ ここが本体 —— ディスク上に平文が残らないこと。
    expect(isSealedData(restored.data)).toBe(true);
    expect(JSON.stringify(restored.data)).not.toContain('RESTORED-SECRET');

    // 読み出しは今までどおり中身が返る。
    const list = await store.list<{ memo: string }>('sales');
    expect(list.map((r) => r.data.memo)).toContain('RESTORED-SECRET');
  });

  it('封緘済みのレコードは二重封緘しない (そのまま入れる)', async () => {
    await enableEncryption('passphrase-abc');
    const store = getRecordStore();

    await store.insert('sales', { memo: 'ORIGINAL' });
    const exported = await store.exportAll();
    expect(isSealedData(exported[0]!.data)).toBe(true);

    // 書き出した物をそのまま戻す (同じパスフレーズ)。
    await store.importAll(exported, { replace: true });

    const list = await store.list<{ memo: string }>('sales');
    // 二重封緘されていたらここで復号に失敗する。
    expect(list.map((r) => r.data.memo)).toEqual(['ORIGINAL']);
  });

  it('暗号化 OFF なら今までどおり平文で入る (封緘しない)', async () => {
    const store = getRecordStore();
    await store.importAll([
      { id: 'p-1', collection: 'sales', createdAt: 1, updatedAt: 1, data: { memo: 'PLAIN-OK' } },
    ]);
    const raw = await rawRecords();
    expect(isSealedData(raw.find((r) => r.id === 'p-1')!.data)).toBe(false);
  });
});

/*
 * **封緘したままのバックアップは、他の端末では開けない。**
 *
 * 鍵の導出に要る salt は localStorage (`servicehub.recordEncryption`) にあり、
 * バックアップ (`exportAll` = 記録ストアのみ) には入らない。新しい端末で
 * 同じパスフレーズを入れても `enableEncryption` は**別の salt** を作るので、
 * 導出される鍵が違う。
 *
 * この検査は仕様を固定するためではなく、**画面の警告文が事実と一致していること**
 * を留めるために在る。ここが通らなくなったら (= 移行できるようになったら)、
 * `BackupPanel` の警告を消すこと。
 */
describe('封緘したままのバックアップは他の端末で開けない (警告文の裏付け)', () => {
  it('同じパスフレーズでも salt が違うため復号できない', async () => {
    // --- 旧端末 ---
    await enableEncryption('SAME-PASSPHRASE');
    const store = getRecordStore();
    await store.insert('sales', { memo: 'MIGRATE-ME' });
    const backup = await store.exportAll();
    const saltOld = JSON.parse(localStorage.getItem(LS_KEY)!).salt as string;

    // --- 新端末 (localStorage も IndexedDB も空) ---
    _resetRecordStoreForTests();
    await clearIdb();
    localStorage.clear();

    await enableEncryption('SAME-PASSPHRASE');
    const saltNew = JSON.parse(localStorage.getItem(LS_KEY)!).salt as string;
    expect(saltNew).not.toBe(saltOld); // ここが移行できない理由

    const store2 = getRecordStore();
    await store2.importAll(backup, { replace: true });

    // 同じパスフレーズを知っていても読めない。
    await expect(store2.list('sales')).rejects.toThrow(/復号に失敗/);
  });

  it('先に暗号化を解除してから書き出せば、他の端末でも開ける (逃げ道)', async () => {
    await enableEncryption('SAME-PASSPHRASE');
    const store = getRecordStore();
    await store.insert('sales', { memo: 'MIGRATE-ME' });

    // 画面が案内する順序 —— 先に解除する。
    expect(await disableEncryption('SAME-PASSPHRASE')).toBe(true);
    const backup = await store.exportAll();

    // --- 新端末 ---
    _resetRecordStoreForTests();
    await clearIdb();
    localStorage.clear();

    const store2 = getRecordStore();
    await store2.importAll(backup, { replace: true });
    const list = await store2.list<{ memo: string }>('sales');
    expect(list.map((r) => r.data.memo)).toEqual(['MIGRATE-ME']);
  });
});
