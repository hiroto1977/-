import { describe, expect, it, vi } from 'vitest';
import {
  encryptString,
  decryptString,
  isEncryptedBundle,
  isSealed,
  randomSaltB64,
  deriveAesKey,
  sealWithKey,
  openWithKey,
  assertSaltBytes,
} from '../dataCrypto';
import { MIN_SALT_BYTES } from '../../../shared/cryptoParams';

const VALID_BUNDLE = { v: 1, kdf: 'PBKDF2-SHA256', iterations: 210_000, salt: 'a', iv: 'b', ct: 'c' };

describe('dataCrypto', () => {
  it('round-trips encrypt → decrypt with the right password', async () => {
    const bundle = await encryptString('機密データ {"a":1}', 'correct horse');
    expect(isEncryptedBundle(bundle)).toBe(true);
    expect(await decryptString(bundle, 'correct horse')).toBe('機密データ {"a":1}');
  });

  it('fails decryption with the wrong password (GCM auth)', async () => {
    const bundle = await encryptString('secret', 'right-pw');
    await expect(decryptString(bundle, 'wrong-pw')).rejects.toThrow(/復号に失敗/);
  });

  it('fails decryption when the ciphertext is tampered', async () => {
    const bundle = await encryptString('secret', 'pw');
    // flip a base64 char in the ciphertext
    const ct = bundle.ct.slice(0, -2) + (bundle.ct.endsWith('A') ? 'B' : 'A') + bundle.ct.slice(-1);
    await expect(decryptString({ ...bundle, ct }, 'pw')).rejects.toThrow(/復号に失敗/);
  });

  it('uses a fresh salt + iv per call (no deterministic ciphertext)', async () => {
    const a = await encryptString('same', 'pw');
    const b = await encryptString('same', 'pw');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('rejects an empty password on encrypt', async () => {
    await expect(encryptString('x', '')).rejects.toThrow(/パスワード/);
  });

  it('isEncryptedBundle returns false for null / non-object (type guard)', () => {
    // ガード `typeof v !== 'object' || v === null` を false 固定する mutant は null.v 参照で
    // 例外になるため、null で false を期待して撃墜。
    expect(isEncryptedBundle(null)).toBe(false);
    expect(isEncryptedBundle(undefined)).toBe(false);
    expect(isEncryptedBundle(42)).toBe(false);
  });

  it('isEncryptedBundle accepts a fully-valid bundle and rejects each single-field defect', () => {
    expect(isEncryptedBundle(VALID_BUNDLE)).toBe(true);
    // null / 非オブジェクト (typeof !== 'object' || v === null ガード)。
    expect(isEncryptedBundle(null)).toBe(false);
    expect(isEncryptedBundle('nope')).toBe(false);
    // 各フィールドを 1 つずつ壊すと false (各 &&-項の ConditionalExpression を撃墜)。
    expect(isEncryptedBundle({ ...VALID_BUNDLE, v: 2 })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, kdf: 'OTHER' })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, iterations: '1' })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, salt: 1 })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, iv: 1 })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, ct: 1 })).toBe(false);
  });
});

describe('low-level key reuse (deriveAesKey / sealWithKey / openWithKey)', () => {
  it('round-trips seal → open with a reused key', async () => {
    const salt = randomSaltB64();
    const key = await deriveAesKey('pw', salt);
    const sealed = await sealWithKey(key, '封緘テキスト');
    expect(isSealed(sealed)).toBe(true);
    expect(await openWithKey(key, sealed)).toBe('封緘テキスト');
  });

  it('derives a non-extractable AES key (cannot be exported)', async () => {
    // deriveKey の extractable=false を true にする mutant を exportKey 失敗で撃墜。
    const key = await deriveAesKey('pw', randomSaltB64());
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeTruthy();
  });

  it('rejects an empty password on deriveAesKey', async () => {
    await expect(deriveAesKey('', randomSaltB64())).rejects.toThrow(/パスワード/);
  });

  /*
   * 保存されている salt が base64 として読めないとき、`atob` の
   * `DOMException('Invalid character')` をそのまま外へ出さない。
   * どの欄が壊れているかまで言う (欄名が空になると
   * 「暗号化データが壊れています（ が base64 …）」になってしまう)。
   */
  // `'a b c'` は**通る**ので入れない —— forgiving-base64 は ASCII 空白を
  // 取り除いてから復号するので `'abc'` として読めてしまう (実測)。
  // 「通らないはず」と思った入力が通るのは、そのまま検査の穴になる。
  it.each(['###', '@@@', '****'])(
    '壊れた salt (%s) は領域のエラーで断り、生の DOMException を出さない',
    async (badSalt) => {
      await expect(deriveAesKey('pw', badSalt)).rejects.toThrow(
        /暗号化データが壊れています（salt が base64/,
      );
      await expect(deriveAesKey('pw', badSalt)).rejects.not.toThrow(/Invalid character/);
    },
  );

  it('fails openWithKey on a wrong key or non-sealed input', async () => {
    const sealed = await sealWithKey(await deriveAesKey('pw', randomSaltB64()), 'x');
    // 別の鍵では GCM 認証失敗 → 復号に失敗。
    await expect(openWithKey(await deriveAesKey('other', randomSaltB64()), sealed)).rejects.toThrow(/復号に失敗/);
    // 非封緘入力は形式エラー (isSealed ガード + メッセージ StringLiteral を撃墜)。
    const key = await deriveAesKey('pw', randomSaltB64());
    await expect(openWithKey(key, { iv: 'a' } as never)).rejects.toThrow(/封緘データの形式/);
  });

  it('isSealed accepts {iv,ct} and rejects defects', () => {
    expect(isSealed({ iv: 'a', ct: 'b' })).toBe(true);
    expect(isSealed(null)).toBe(false);
    expect(isSealed('nope')).toBe(false);
    expect(isSealed({ iv: 'a' })).toBe(false); // ct 欠落
    expect(isSealed({ ct: 'b' })).toBe(false); // iv 欠落
    expect(isSealed({ iv: 1, ct: 'b' })).toBe(false); // iv 非文字列
  });
});

/*
 * ソルト長の下限。
 *
 * `MIN_SALT_BYTES` は 2026-08-27 まで**定義されているだけで、どこからも
 * 参照されていなかった** (`grep` で 0 件)。定数の説明は「これを下回らせない」と
 * 不変条件を書いているのに、守る側が無かった。
 *
 * 効く形は `assertKdfIterations` と同じ —— `vault.ts` は IndexedDB から読んだ
 * `meta.salt` をそのまま `deriveKey` へ渡す。反復回数のほうは
 * 「資格情報そのものを持つ vault 側が素通しだった」として塞がれたが、
 * **隣の欄である salt は残っていた**。
 */
describe('assertSaltBytes — 保存側から読んだソルトの長さ', () => {
  it('★ 下限ちょうどは通す', () => {
    expect(() => assertSaltBytes(new Uint8Array(MIN_SALT_BYTES))).not.toThrow();
  });

  it('陰性: 長いソルトも通す (用途ごとに増やすのは自由)', () => {
    expect(() => assertSaltBytes(new Uint8Array(32))).not.toThrow();
  });

  it.each([0, 1, 8, MIN_SALT_BYTES - 1])('★ %i バイトは弾く', (n) => {
    expect(() => assertSaltBytes(new Uint8Array(n))).toThrow(/ソルト/);
  });

  it('★ 短いソルトの封緘データは復号を拒む (関門が経路に居ること)', async () => {
    const bundle = await encryptString('secret', 'pw-correct-horse');
    const shortSalt = { ...bundle, salt: btoa(String.fromCharCode(0, 1, 2, 3)) };
    await expect(decryptString(shortSalt, 'pw-correct-horse')).rejects.toThrow(/ソルト/);
  });

  it('陰性: 正規の封緘データは往復できる (締めすぎていない)', async () => {
    const bundle = await encryptString('secret', 'pw-correct-horse');
    await expect(decryptString(bundle, 'pw-correct-horse')).resolves.toBe('secret');
  });
});

/**
 * `const KDF = 'PBKDF2-SHA256'` はモジュール本体で一度だけ評価される「静的」な
 * 定数なので、ファイル先頭の静的 import では変異した状態を観測できない
 * (実測: `'PBKDF2-SHA256'` → `""` が生き残る。上の isEncryptedBundle 検査は
 * 正しい主張だが、モジュールは変異が効く前に評価済み)。
 *
 * KDF 名は**封緘データの外形そのもの**である —— 空文字になれば、既存の
 * 封緘データが一斉に「形が違う」と判定され、開けなくなる。
 * `vi.resetModules()` + `await import()` で読み直して問う。
 */
describe('KDF 名 —— 静的定数を測れる形で問う', () => {
  it('再読込したモジュールでも kdf:"PBKDF2-SHA256" の封緘データを受け入れる', async () => {
    vi.resetModules();
    const mod = await import('../dataCrypto');
    expect(mod.isEncryptedBundle({ ...VALID_BUNDLE })).toBe(true);
    expect(mod.isEncryptedBundle({ ...VALID_BUNDLE, kdf: 'OTHER' })).toBe(false);
    expect(mod.isEncryptedBundle({ ...VALID_BUNDLE, kdf: '' })).toBe(false);
  });

  it('再読込したモジュールが書き出す封緘データも "PBKDF2-SHA256" を名乗る', async () => {
    vi.resetModules();
    const mod = await import('../dataCrypto');
    const bundle = await mod.encryptString('x', 'pw');
    expect(bundle.kdf).toBe('PBKDF2-SHA256');
  });
});
