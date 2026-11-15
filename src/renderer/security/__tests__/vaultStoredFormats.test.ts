/**
 * **保管庫が端末に置いた記録の形を、外から独立に確かめる** (2026-11-15 · MG-070)。
 *
 * ## なぜ要るか
 *
 * 保管庫の検査の大半は「保管庫が書いた物を保管庫が読む」往復で、**書く側と読む側が同じ
 * 綴りを読む**。往復は、綴りを変えても成り立つ —— AAD の接頭辞 (`service-hub-token-v2:`)
 * を空にしても、区切りの `:` を落としても、KCV の平文や store の名前を変えても、
 * 新しく作った保管庫の中では全部通る。ところが利用者の端末には**今の綴りで封じた記録が
 * 既に在る**ので、綴りが 1 字動けばその記録は二度と開かない (全員が「パスワードが違います」
 * か「未設定」になる)。
 *
 * 2026-11-15 の変異検査 (`vault.ts` を Mamori へ移した直後) がこれを数で出した:
 * 生存 24 + 未到達 10。内訳は ① 綴りの変異 (template を `+` の連結へ直したので、断片ごとに
 * 変異体が生まれた) ② 旧形式 (v1 = serviceId だけを束ねた記録) を読む枝が**検査で 1 度も
 * 走っていなかった** (パス 566-C で v2 を足したときから) ③ 変異検査の道具が新しくなって増えた
 * 観点 (呼び出しを丸ごと消す) —— 設定の検証 (`assertKdfIterations` / `assertSaltBytes`) を
 * 消しても、後ろの照合が別の文で断るので落ちなかった。
 *
 * ## どう確かめるか
 *
 * 検査の側で **WebCrypto を直接呼んで**、保管庫と同じ鍵 (パスワードから導出 → master を解く) で
 * 記録を封じ、開く。綴りは**ここに字面で書く** —— 保管庫の定数を読むと、定数と一緒に動いて
 * しまう (`VAULT_UNREADABLE_TEXT` の検査と同じ判断)。
 *
 * IndexedDB を直接触る書き方は `vaultRecordBinding.test.ts` と同じ (= ブラウザのプロファイルに
 * 触れる相手の立場)。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_PASSWORD_CHARS, MAX_TOKEN_CHARS, MIN_PASSWORD_LENGTH, _resetVaultForTests, getVault } from '../vault';
import { rereadModule } from '../../../shared/__tests__/rereadModule';

const PW = 'correct-horse-battery-staple';
const NEW_PW = 'another-long-password-2026';
const DB = 'business-hub-vault';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetVaultForTests();
  await clearIdb();
});

// ── IndexedDB を直接触る ────────────────────────────────────────────────

function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onsuccess = () => {
      fn(req.result).then(
        (v) => {
          req.result.close();
          resolve(v);
        },
        (e: unknown) => {
          req.result.close();
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    };
    req.onerror = () => reject(req.error ?? new Error('open failed'));
  });
}

function rawGet<T>(store: string, key: string): Promise<T | undefined> {
  return withDb(
    (db) =>
      new Promise<T | undefined>((res, rej) => {
        const r = db.transaction(store, 'readonly').objectStore(store).get(key);
        r.onsuccess = () => res(r.result as T | undefined);
        r.onerror = () => rej(r.error ?? new Error('get failed'));
      }),
  );
}

function rawPut(store: string, key: string, value: unknown): Promise<void> {
  return withDb(
    (db) =>
      new Promise<void>((res, rej) => {
        const r = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error ?? new Error('put failed'));
      }),
  );
}

function rawDelete(store: string, key: string): Promise<void> {
  return withDb(
    (db) =>
      new Promise<void>((res, rej) => {
        const r = db.transaction(store, 'readwrite').objectStore(store).delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error ?? new Error('delete failed'));
      }),
  );
}

function storeNames(): Promise<string[]> {
  return withDb((db) => Promise.resolve(Array.from(db.objectStoreNames)));
}

// ── 保管庫と同じ鍵を、検査の側で独立に作る ─────────────────────────────

type Sealed = { iv: Uint8Array; ciphertext: Uint8Array };
type Rec = Sealed & { v?: number; storedAt?: number };
type Meta = {
  salt: Uint8Array;
  iterations: number;
  iv: Uint8Array;
  kcv: Uint8Array;
  recoveryIterations?: number;
};

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

async function passwordKeyOf(password: string): Promise<CryptoKey> {
  const meta = await rawGet<Meta>('meta', 'vault');
  if (!meta) throw new Error('meta が無い');
  const base = await crypto.subtle.importKey('raw', utf8(password) as BufferSource, { name: 'PBKDF2' }, false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: meta.salt as BufferSource, iterations: meta.iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** パスワードから master 鍵まで辿る (保管庫の解錠と同じ手順を、検査の側で)。 */
async function masterKeyOf(password: string): Promise<CryptoKey> {
  const passwordKey = await passwordKeyOf(password);
  const wrap = await rawGet<Sealed>('meta', 'master-wrap');
  if (!wrap) throw new Error('master-wrap が無い');
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrap.iv as BufferSource },
    passwordKey,
    wrap.ciphertext as BufferSource,
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function seal(key: CryptoKey, text: string, aad?: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams =
    aad === undefined
      ? { name: 'AES-GCM', iv: iv as BufferSource }
      : { name: 'AES-GCM', iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource };
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(params, key, utf8(text) as BufferSource));
  return { iv, ciphertext };
}

async function open(key: CryptoKey, rec: Sealed, aad?: string): Promise<string> {
  const params: AesGcmParams =
    aad === undefined
      ? { name: 'AES-GCM', iv: rec.iv as BufferSource }
      : { name: 'AES-GCM', iv: rec.iv as BufferSource, additionalData: utf8(aad) as BufferSource };
  const plain = await crypto.subtle.decrypt(params, key, rec.ciphertext as BufferSource);
  return new TextDecoder().decode(plain);
}

/** 字面で書く —— 保管庫の定数は読まない (定数と一緒に動くと、綴りの変化が見えない)。 */
const aadV1 = (id: string): string => 'service-hub-token-v1:' + id;
const aadV2 = (id: string, storedAt: number): string => 'service-hub-token-v2:' + id + ':' + String(storedAt);
const aadTag = (domain: string): string => 'service-hub-authtag-v1:' + domain;

const bytesOf = (u: Uint8Array): number[] => Array.from(u);

/** 1 時間前 (有効時間 8 時間の内側)。「読んだら若返る」形を見分けるため、今の時刻とは違う値にする。 */
const anHourAgo = (): number => Date.now() - 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────

describe('保管した記録の形 —— 現行 (v2 · serviceId と保存時刻を束ねる)', () => {
  it('★ 検査の側で今の綴りの AAD で封じた記録を、保管庫が読める (接頭辞も区切りも字面どおり)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    const storedAt = anHourAgo();
    const sealed = await seal(master, 'xoxb-hand-sealed', aadV2('slack', storedAt));
    await rawPut('tokens', 'slack', { ...sealed, v: 2, storedAt });

    expect(await vault.getToken('slack')).toBe('xoxb-hand-sealed');
  });

  it('★ 保管庫が書いた記録を、検査の側が同じ綴りの AAD で開ける (逆向き)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_written_by_vault');
    const rec = await rawGet<Rec>('tokens', 'github');
    expect(rec?.v).toBe(2);
    expect(typeof rec?.storedAt).toBe('number');

    const master = await masterKeyOf(PW);
    expect(await open(master, rec!, aadV2('github', rec!.storedAt!))).toBe('ghp_written_by_vault');
  });

  it('対照: 区切りを落とした綴り・接頭辞の無い綴りで封じた記録は読めない (検査の綴りが効いている)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    const storedAt = anHourAgo();
    await rawPut('tokens', 'a', {
      ...(await seal(master, 'x', 'service-hub-token-v2:a' + String(storedAt))),
      v: 2,
      storedAt,
    });
    await rawPut('tokens', 'b', { ...(await seal(master, 'x', 'b:' + String(storedAt))), v: 2, storedAt });

    expect(await vault.getToken('a')).toBeNull();
    expect(await vault.getToken('b')).toBeNull();
  });
});

describe('保管した記録の形 —— 旧形式 (v1 · serviceId だけを束ねる)', () => {
  it('★ v1 の記録を読め、その場で v2 へ束ね直す —— 保存時刻は引き継ぐ (読んでも若返らない)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    const storedAt = anHourAgo();
    await rawPut('tokens', 'github', { ...(await seal(master, 'ghp_v1_token', aadV1('github'))), v: 1, storedAt });

    expect(await vault.getToken('github')).toBe('ghp_v1_token');

    const after = await rawGet<Rec>('tokens', 'github');
    expect(after?.v, '束ね直していない').toBe(2);
    expect(after?.storedAt, '保存時刻が変わった (読むたびに有効時間が延びる)').toBe(storedAt);
    expect(await open(master, after!, aadV2('github', storedAt))).toBe('ghp_v1_token');
    // 束ね直した後も読める。
    expect(await vault.getToken('github')).toBe('ghp_v1_token');
  });

  it('★ 保存時刻の無い v1 の記録は、束ね直すときに今の時刻が付く (null や undefined のままにしない)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    await rawPut('tokens', 'github', { ...(await seal(master, 'ghp_no_stamp', aadV1('github'))), v: 1 });

    const before = Date.now();
    expect(await vault.getToken('github')).toBe('ghp_no_stamp');
    const after = await rawGet<Rec>('tokens', 'github');
    expect(after?.v).toBe(2);
    expect(typeof after?.storedAt).toBe('number');
    expect(after!.storedAt!).toBeGreaterThanOrEqual(before);
    expect(after!.storedAt!).toBeLessThanOrEqual(Date.now());
    expect(await open(master, after!, aadV2('github', after!.storedAt!))).toBe('ghp_no_stamp');
  });

  it('★ 別のサービスの位置へ移された v1 の記録は null —— 記録は書き換えない (読めない物を束ね直さない)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    const storedAt = anHourAgo();
    const moved = { ...(await seal(master, 'ghp_for_github', aadV1('github'))), v: 1, storedAt };
    await rawPut('tokens', 'slack', moved);

    expect(await vault.getToken('slack')).toBeNull();

    const after = await rawGet<Rec>('tokens', 'slack');
    expect(after?.v, '読めなかった記録を束ね直した').toBe(1);
    expect(after?.storedAt).toBe(storedAt);
    expect(bytesOf(after!.ciphertext)).toEqual(bytesOf(moved.ciphertext));
    // もう 1 度読んでも同じ (1 度目が何かを書き込んでいれば、ここで文字列が返る)。
    expect(await vault.getToken('slack')).toBeNull();
  });

  it('★ 読めない記録でも、保存時刻が無ければ最初に見た時刻を付ける (有効時間がそこから始まる)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    // 位置違い (読めない) + 保存時刻なし。解錠の後に置くので、解錠時の掃除は通っていない。
    const moved = { ...(await seal(master, 'x', aadV1('github'))), v: 1 };
    await rawPut('tokens', 'slack', moved);

    const before = Date.now();
    expect(await vault.getToken('slack')).toBeNull();
    const after = await rawGet<Rec>('tokens', 'slack');
    expect(typeof after?.storedAt, '時刻が付いていない (期限が永久に来ない)').toBe('number');
    expect(after!.storedAt!).toBeGreaterThanOrEqual(before);
    expect(after!.storedAt!).toBeLessThanOrEqual(Date.now());
    // 付けたのは時刻だけ。
    expect(after?.v).toBe(1);
    expect(bytesOf(after!.ciphertext)).toEqual(bytesOf(moved.ciphertext));
  });

  it('★ 一覧 (listConfigured) も、保存時刻の無い記録に時刻を付ける', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    await rawPut('tokens', 'slack', { ...(await seal(master, 'x', aadV1('github'))), v: 1 });

    const before = Date.now();
    expect(await vault.listConfigured()).toContain('slack');
    const after = await rawGet<Rec>('tokens', 'slack');
    expect(typeof after?.storedAt).toBe('number');
    expect(after!.storedAt!).toBeGreaterThanOrEqual(before);
    expect(after?.v).toBe(1);
  });
});

describe('保管した記録の形 —— 版の無い記録 (AAD を導入する前)', () => {
  it('★ 開けない版なしの記録は null —— 記録は書き換えず、2 度目も null', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    const storedAt = anHourAgo();
    // AAD つきで封じた物から版の印を剥がした形 (AAD 無しでは開かない)。
    const stripped = { ...(await seal(master, 'ghp_sealed_with_aad', aadV1('github'))), storedAt };
    await rawPut('tokens', 'github', stripped);

    expect(await vault.getToken('github')).toBeNull();

    const after = await rawGet<Rec>('tokens', 'github');
    expect(after?.v, '開けなかった記録を束ね直した').toBeUndefined();
    expect(bytesOf(after!.ciphertext)).toEqual(bytesOf(stripped.ciphertext));
    expect(await vault.getToken('github'), '1 度目の読みが偽の記録を書き込んだ').toBeNull();
  });
});

describe('Phase E より前の保管庫 (トークンをパスワードの鍵そのもので封じている) のパスワード変更', () => {
  /** 今の保管庫から master-wrap を外して旧形式にする (KCV はパスワードの鍵で封じてあるので解錠できる)。 */
  async function legacyVault(): Promise<ReturnType<typeof getVault>> {
    const vault = getVault();
    await vault.initialize(PW);
    vault.lock();
    await rawDelete('meta', 'master-wrap');
    return vault;
  }

  it('★ v2 / v1 / 版なしの 3 つの形を読み替え、新しいパスワードで全部読める', async () => {
    const vault = await legacyVault();
    await vault.unlock(PW);
    const passwordKey = await passwordKeyOf(PW);
    const storedAt = anHourAgo();
    await rawPut('tokens', 'a', { ...(await seal(passwordKey, 'token-a-v2', aadV2('a', storedAt))), v: 2, storedAt });
    await rawPut('tokens', 'b', { ...(await seal(passwordKey, 'token-b-v1', aadV1('b'))), v: 1, storedAt });
    await rawPut('tokens', 'c', { ...(await seal(passwordKey, 'token-c-v0')) });

    await vault.changePassword(PW, NEW_PW);

    // 3 つとも v2 になり、保存時刻は引き継ぐ (版なしには今の時刻)。
    const b = await rawGet<Rec>('tokens', 'b');
    expect(b?.v).toBe(2);
    expect(b?.storedAt).toBe(storedAt);

    vault.lock();
    await expect(vault.unlock(PW)).rejects.toThrow(/パスワードが違います/);
    await vault.unlock(NEW_PW);
    expect(await vault.getToken('a')).toBe('token-a-v2');
    expect(await vault.getToken('b')).toBe('token-b-v1');
    expect(await vault.getToken('c')).toBe('token-c-v0');
  });

  it('★ 旧形式の保管庫でも、解錠の途中に届いた施錠を解錠の完了が上書きしない (threat: T-049)', async () => {
    const vault = await legacyVault();
    const p = vault.unlock(PW);
    vault.lock();
    await expect(p).rejects.toThrow(/解錠の途中で施錠されました/);
    expect(vault.isUnlocked()).toBe(false);
  });

  it('対照: 施錠が届かなければ旧形式の保管庫は解錠できる', async () => {
    const vault = await legacyVault();
    await vault.unlock(PW);
    expect(vault.isUnlocked()).toBe(true);
  });
});

describe('認証タグの形 (プロキシ設定の改竄検知に使う)', () => {
  it('★ 保管庫が付けたタグを、検査の側が字面の AAD で開ける —— 中身は data そのもの', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const tag = await vault.authTag('proxy-config', '{"url":"https://example.invalid"}');
    const master = await masterKeyOf(PW);
    expect(await open(master, tag, aadTag('proxy-config'))).toBe('{"url":"https://example.invalid"}');
  });

  it('★ 検査の側で字面の AAD で作ったタグを、保管庫が受ける / 用途の違うタグは受けない', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    const master = await masterKeyOf(PW);
    const good = await seal(master, 'DATA', aadTag('proxy-config'));
    const otherDomain = await seal(master, 'DATA', aadTag('something-else'));
    const noPrefix = await seal(master, 'DATA', 'proxy-config');

    expect(await vault.verifyAuthTag('proxy-config', 'DATA', good)).toBe(true);
    expect(await vault.verifyAuthTag('proxy-config', 'DATA', otherDomain)).toBe(false);
    expect(await vault.verifyAuthTag('proxy-config', 'DATA', noPrefix)).toBe(false);
  });
});

describe('保管領域から読んだ設定は、鍵を導出する前に検める (壊れた・差し替えられた meta)', () => {
  const ITER_MSG = '暗号化データの反復回数が許容範囲外です';
  const SALT_MSG = '暗号化データのソルトが短すぎます';

  async function tamperMeta(change: (m: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
    const meta = await rawGet<Record<string, unknown>>('meta', 'vault');
    if (!meta) throw new Error('meta が無い');
    await rawPut('meta', 'vault', change(meta));
  }

  // 反復回数を床より下へ: 検めなければ導出はすぐ終わり、照合が「違う」と答える (別の結果になる)。
  const weakIterations = (m: Record<string, unknown>): Record<string, unknown> => ({ ...m, iterations: 1000 });
  const shortSalt = (m: Record<string, unknown>): Record<string, unknown> => ({ ...m, salt: new Uint8Array(4) });

  it('★ verifyPassword: 反復回数が範囲の外なら断る (false を返さない)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await tamperMeta(weakIterations);
    await expect(vault.verifyPassword(PW)).rejects.toThrow(new Error(ITER_MSG));
  });

  it('★ verifyPassword: ソルトが短ければ断る (false を返さない)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await tamperMeta(shortSalt);
    await expect(vault.verifyPassword(PW)).rejects.toThrow(new Error(SALT_MSG));
  });

  it('★ changePassword: 反復回数が範囲の外なら、その理由で断る (「現在のパスワードが違います」と言わない)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await tamperMeta(weakIterations);
    await expect(vault.changePassword(PW, NEW_PW)).rejects.toThrow(new Error(ITER_MSG));
  });

  it('★ changePassword: ソルトが短ければ、その理由で断る', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await tamperMeta(shortSalt);
    await expect(vault.changePassword(PW, NEW_PW)).rejects.toThrow(new Error(SALT_MSG));
  });

  it('★ recoverWithMnemonic: 復旧の反復回数が範囲の外なら、その理由で断る (「リカバリーキーが違います」と言わない)', async () => {
    const vault = getVault();
    const { mnemonic } = await vault.initialize(PW);
    await tamperMeta((m) => ({ ...m, recoveryIterations: 1000 }));
    await expect(vault.recoverWithMnemonic(mnemonic, NEW_PW)).rejects.toThrow(new Error(ITER_MSG));
  });

  it('対照: 手を加えていない meta なら 3 つとも通る', async () => {
    const vault = getVault();
    const { mnemonic } = await vault.initialize(PW);
    expect(await vault.verifyPassword(PW)).toBe(true);
    await vault.changePassword(PW, NEW_PW);
    await vault.recoverWithMnemonic(mnemonic, PW);
    expect(await vault.verifyPassword(PW)).toBe(true);
  });
});

describe('断りの文は全文で留める (数字の後ろ・前の断片まで)', () => {
  it('★ 資格情報の長さ', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    expect(MAX_TOKEN_CHARS).toBe(8192);
    await expect(vault.setToken('github', '')).rejects.toThrow(new Error('token が不正です (1-8192 字)'));
  });

  it('★ 新しいパスワードが長すぎる (changePassword)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    expect(MAX_PASSWORD_CHARS).toBe(256);
    await expect(vault.changePassword(PW, 'x'.repeat(257))).rejects.toThrow(
      new Error('新しいパスワードが長すぎます (256 字以内)'),
    );
  });

  it('★ 新しいパスワードが短い (recoverWithMnemonic)', async () => {
    const vault = getVault();
    const { mnemonic } = await vault.initialize(PW);
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    await expect(vault.recoverWithMnemonic(mnemonic, 'short')).rejects.toThrow(
      new Error('新しいパスワードは 12 文字以上で設定してください'),
    );
  });
});

/**
 * store の名前と KCV の平文はモジュール直下の定数なので、**検査の中で読み直した**実装で確かめる
 * (`rereadModule` —— 読み込みの時点で評価された値には変異体が届かない · パス 495)。
 *
 * どちらも「書く側と読む側が同じ定数を読む」ので往復では見えないが、利用者の端末には
 * この名前の store と、この平文を封じた KCV が既に在る: 名前が変われば保存済みのトークンが
 * 見えなくなり、平文が変われば正しいパスワードが「違います」と断られる。
 */
describe('読み直した実装でも、store の名前と KCV の平文は今の利用者の保管庫と同じ', () => {
  it('★ store は meta と tokens・KCV の平文は service-hub-v1', async () => {
    const mod = await rereadModule<typeof import('../vault')>(import.meta.url, '../vault');
    mod._resetVaultForTests();
    const vault = mod.getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_x');

    expect((await storeNames()).sort()).toEqual(['meta', 'tokens']);
    expect(await rawGet<Rec>('tokens', 'github')).toBeDefined();
    expect(await rawGet<Sealed>('meta', 'master-wrap')).toBeDefined();

    const meta = await rawGet<Meta>('meta', 'vault');
    const passwordKey = await passwordKeyOf(PW);
    expect(await open(passwordKey, { iv: meta!.iv, ciphertext: meta!.kcv })).toBe('service-hub-v1');
  });
});
