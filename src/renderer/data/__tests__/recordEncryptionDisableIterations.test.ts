/** @vitest-environment jsdom */
/**
 * **暗号化の解除 (`disableEncryption`) も、封緘したときの反復回数で鍵を導出する。** (パス 502)
 *
 * 業務レコードの封緘は、自分を作った PBKDF2 の反復回数を meta に書き残す (パス 239)。
 * 解錠 (`unlockEncryption`) が保存された回数を読むことは `kdfCostProvenance.test.ts` が
 * 留めているが、**解除の側は「回数の欄が無い古い meta でも解除できる」しか見ておらず、
 * 保存された回数を読んでいる (定数を読んでいない) ことを誰も主張していなかった**。
 *
 * 解除が定数を読むと、定数を上げた日に、**古い回数で封緘された利用者は正しいパスフレーズでも
 * 暗号化を解除できない** (逃げ道が閉じる)。逆に保存値を読むなら、保存値を別の回数へ書き換えた
 * meta では別の鍵になって GCM が落ち、`false` を返してデータを暗号化したまま残す。
 * 後者を「定数を読んでいない証拠」として使う (`kdfCostProvenance.test.ts` の解錠の検査と同じ形)。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { PBKDF2_ITERATIONS } from '../../../shared/cryptoParams';
import { getRecordStore, _resetRecordStoreForTests } from '../store';
import { disableEncryption, enableEncryption, isEncryptionEnabled, unlockEncryption } from '../recordEncryption';

if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const LS_KEY = 'servicehub.recordEncryption';
const PW = 'record-passphrase-1234';
/** 定数とは違う、しかも `assertKdfIterations` の範囲内の回数 (= 昔の定数に相当)。 */
const OTHER_COUNT = 150_000;

const clearDataIdb = (): Promise<void> =>
  new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

const readMeta = (): Record<string, unknown> => JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, unknown>;

beforeEach(async () => {
  _resetRecordStoreForTests();
  localStorage.clear();
  await clearDataIdb();
});

describe('disableEncryption — 保存された反復回数を読む (パス 502)', () => {
  it('★ 回数だけを別の値へ書き換えた meta では解除できない (false・暗号化は残る)', async () => {
    await enableEncryption(PW);
    await getRecordStore().insert('sales', { amount: 1 });
    // 封緘は今の定数の回数で作られている (前提)。
    expect(readMeta().iterations).toBe(PBKDF2_ITERATIONS);
    expect(OTHER_COUNT).not.toBe(PBKDF2_ITERATIONS);

    const tampered = { ...readMeta(), iterations: OTHER_COUNT };
    localStorage.setItem(LS_KEY, JSON.stringify(tampered));

    // 保存値 (150,000) で導出すると別の鍵 → KCV が開かない → false。
    // true が返るなら、保存値ではなく定数 (600,000) で導出している。
    await expect(disableEncryption(PW)).resolves.toBe(false);
    // 何も壊さない: 暗号化は有効のまま、meta もそのまま残る。
    expect(isEncryptionEnabled()).toBe(true);
    expect(readMeta()).toEqual(tampered);
  });

  it('★ 対照: 回数が封緘どおりの meta は解除できる (暗号化が外れ、meta が消える)', async () => {
    await enableEncryption(PW);
    await getRecordStore().insert('sales', { amount: 7 });
    await expect(disableEncryption(PW)).resolves.toBe(true);
    expect(isEncryptionEnabled()).toBe(false);
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    // 平文に戻ったレコードはそのまま読める。
    const rows = await getRecordStore().list('sales');
    expect(rows.map((r) => r.data)).toEqual([{ amount: 7 }]);
  });

  it('★ 解錠と解除は、同じ保存された回数を見る (書き換えた meta では両方とも false)', async () => {
    await enableEncryption(PW);
    localStorage.setItem(LS_KEY, JSON.stringify({ ...readMeta(), iterations: OTHER_COUNT }));
    _resetRecordStoreForTests();
    await expect(unlockEncryption(PW)).resolves.toBe(false);
    await expect(disableEncryption(PW)).resolves.toBe(false);
  });

  it('★ 回数が読めない値 (文字列・NaN) の meta は「無かったこと」にして凍結値で開こうとする (締め出さない)', async () => {
    await enableEncryption(PW);
    await getRecordStore().insert('sales', { amount: 3 });
    // 文字列の回数は有限の数ではないので読まれず、凍結値 (封緘どおり) で開く。
    localStorage.setItem(LS_KEY, JSON.stringify({ ...readMeta(), iterations: '150000' }));
    await expect(disableEncryption(PW)).resolves.toBe(true);
    expect(isEncryptionEnabled()).toBe(false);
  });
});
