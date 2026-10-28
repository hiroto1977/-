/**
 * 解錠の途中で届いた施錠を、解錠の完了が上書きしない (2026-10-15 · パス 522 ·
 * threat: T-049)。
 *
 * `unlock()` は PBKDF2 (600k 回) を待つあいだ制御を手放す。その窓に
 * `lock()` (自動施錠・別のタブからの中継・「今すぐロック」) が届くと、
 * 直す前は解錠の解決が `currentKey` を据え直し、**利用者が施錠したつもりの
 * 保管庫が解錠されたまま**になっていた (実測: `lock()` の直後は locked、
 * `unlock()` の解決後は unlocked)。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetVaultForTests, getVault } from '../vault';

const PW = 'correct-horse-battery-staple';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetVaultForTests();
  await clearIdb();
});

describe('Vault — lock() during unlock() (threat: T-049)', () => {
  it('★ 導出中に lock() が届けば、unlock() は鍵を据えずに断り、施錠のまま (threat: T-049)', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    expect(v.isUnlocked()).toBe(false);
    const p = v.unlock(PW); // PBKDF2 が走っている
    v.lock(); // ここで施錠が届く
    await expect(p).rejects.toThrow(/解錠の途中で施錠されました/);
    expect(v.isUnlocked()).toBe(false);
  });

  it('★ 対照: 施錠が届かなければ unlock() は今までどおり解錠する', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    await v.unlock(PW);
    expect(v.isUnlocked()).toBe(true);
  });

  it('★ 断られた後にもう一度 unlock() すれば解錠できる (世代は進むだけで閉め出さない)', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    const p = v.unlock(PW);
    v.lock();
    await expect(p).rejects.toThrow();
    await v.unlock(PW);
    expect(v.isUnlocked()).toBe(true);
    await v.setToken('github', 'ghp_x');
    expect(await v.getToken('github')).toBe('ghp_x');
  });
});

/*
 * **残る 3 つの書き込み口も同じ世代を見る (2026-10-15 · パス 523 · threat: T-063)。**
 *
 * `unlock()` だけが世代を見ており、`changePassword` / `recoverWithMnemonic` / `initialize` は
 * PBKDF2 の窓に `lock()` が届いても完了時に鍵を据えていた (実測: 3 つとも `isUnlocked() === true`・
 * トークンも読める)。保管庫の書き換え (新しいパスワード) は通し、鍵だけ据えない。
 */
describe('Vault — lock() during changePassword / recoverWithMnemonic / initialize (threat: T-063)', () => {
  const NEW = 'new-password-long-enough-123';

  it('★ 変更中に lock() が届けば鍵を据えない —— パスワードは変わっている (threat: T-063)', async () => {
    const v = getVault();
    await v.initialize(PW);
    await v.setToken('github', 'ghp_secret');
    const p = v.changePassword(PW, NEW);
    v.lock();
    await p;
    expect(v.isUnlocked()).toBe(false);
    await expect(v.getToken('github')).rejects.toThrow(/ロックされています/);
    await v.unlock(NEW);
    expect(await v.getToken('github')).toBe('ghp_secret');
  });

  it('★ 復旧中に lock() が届けば鍵を据えない —— 新しいパスワードで解錠できる (threat: T-063)', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize(PW);
    await v.setToken('github', 'ghp_secret');
    const p = v.recoverWithMnemonic(mnemonic, NEW);
    v.lock();
    await p;
    expect(v.isUnlocked()).toBe(false);
    await v.unlock(NEW);
    expect(await v.getToken('github')).toBe('ghp_secret');
  });

  it('★ 初期化中に lock() が届けば鍵を据えない —— 決めたパスワードで解錠できる (threat: T-063)', async () => {
    const v = getVault();
    const p = v.initialize(PW);
    v.lock();
    await p;
    expect(v.isUnlocked()).toBe(false);
    await v.unlock(PW);
    expect(v.isUnlocked()).toBe(true);
  });

  it('★ 施錠された保管庫のパスワード変更は解錠にならない (解錠の入口は unlock だけ) (threat: T-063)', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    await v.changePassword(PW, NEW);
    expect(v.isUnlocked()).toBe(false);
    await v.unlock(NEW);
    expect(v.isUnlocked()).toBe(true);
  });

  // Phase E 以前の保管庫 (master-wrap が無い) は、記録を全部読み替える旧世代路を通る。
  // 鍵を据える判断はその枝にしか無い (Phase E の枝は master 鍵が変わらないので据え直さない)。
  const dropMasterWrap = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('business-hub-vault');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').delete('master-wrap');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });

  it('★ 旧世代路 (master-wrap なし) でも、変更中に lock() が届けば鍵を据えない (threat: T-063)', async () => {
    const v = getVault();
    await v.initialize(PW);
    await dropMasterWrap();
    v.lock();
    await v.unlock(PW);
    await v.setToken('github', 'ghp_secret');
    const p = v.changePassword(PW, NEW);
    v.lock();
    await p;
    expect(v.isUnlocked()).toBe(false);
    await expect(v.getToken('github')).rejects.toThrow(/ロックされています/);
    await v.unlock(NEW);
    expect(await v.getToken('github')).toBe('ghp_secret');
  });

  it('★ 旧世代路でも、施錠された保管庫のパスワード変更は解錠にならない (threat: T-063)', async () => {
    const v = getVault();
    await v.initialize(PW);
    await dropMasterWrap();
    v.lock();
    await v.changePassword(PW, NEW);
    expect(v.isUnlocked()).toBe(false);
    await v.unlock(NEW);
    expect(v.isUnlocked()).toBe(true);
  });

  it('対照: 旧世代路で施錠が届かなければ、変更後も解錠したまま', async () => {
    const v = getVault();
    await v.initialize(PW);
    await dropMasterWrap();
    v.lock();
    await v.unlock(PW);
    await v.changePassword(PW, NEW);
    expect(v.isUnlocked()).toBe(true);
  });

  it('対照: 施錠が届かなければ 3 つとも今までどおり解錠したまま', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize(PW);
    expect(v.isUnlocked()).toBe(true);
    await v.changePassword(PW, NEW);
    expect(v.isUnlocked()).toBe(true);
    await v.recoverWithMnemonic(mnemonic, PW);
    expect(v.isUnlocked()).toBe(true);
  });
});

/*
 * **初回の初期化は 1 つしか通さない (2026-10-15 · パス 523 · threat: T-064)。**
 *
 * 「既に在るか」の読み取りと書き込みが別の取引だったので、初回の設定画面を 2 つの窓で同時に
 * 済ませると両方が通り、後の方が meta / master-wrap を黙って上書きした (実測: 両方 fulfilled・
 * 24 語を 2 組見せ・負けた窓が保存したトークンは再読込後に全部 null・その 24 語は
 * 「リカバリーキーが違います」)。`add` で書くと 2 つ目は ConstraintError で abort する。
 */
describe('Vault — 2 つの窓の同時 initialize() (threat: T-064)', () => {
  it('★ 同時に初期化すると 1 つだけ通り、もう 1 つは「既に初期化されています」で断られる (threat: T-064)', async () => {
    const tabA = getVault();
    _resetVaultForTests();
    const tabB = getVault();
    const [ra, rb] = await Promise.allSettled([tabA.initialize(PW), tabB.initialize(PW)]);
    const settled = [ra, rb];
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(Error);
    expect((lost.reason as Error).message).toMatch(/既に初期化されています/);
    // 勝った窓が保存した物は、再読込 (別の instance) から同じパスワードで読める。
    const winner = ra.status === 'fulfilled' ? tabA : tabB;
    const loser = ra.status === 'fulfilled' ? tabB : tabA;
    expect(loser.isUnlocked(), '負けた窓は鍵を据えない').toBe(false);
    await winner.setToken('github', 'ghp_from_winner');
    _resetVaultForTests();
    const reload = getVault();
    await reload.unlock(PW);
    expect(await reload.getToken('github')).toBe('ghp_from_winner');
  });

  it('対照: 1 つずつなら 2 回目は今までどおり「既に初期化されています」', async () => {
    const v = getVault();
    await v.initialize(PW);
    await expect(v.initialize(PW)).rejects.toThrow(/既に初期化されています/);
  });

  it('★ 初期化の書き込みが別の理由で落ちたら、その理由のまま投げる (「既に初期化」と偽らない)', async () => {
    // `add` が ConstraintError 以外 (容量・閉じた DB) で落ちた形。既に初期化されていると告げると
    // 利用者は「解錠」を探しに行くが、保管庫は無い。
    const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      const v = getVault();
      const failed = await v.initialize(PW).then(() => null, (e: unknown) => e);
      expect(failed).not.toBeNull();
      expect((failed as { name?: string }).name).toBe('QuotaExceededError');
      // 文面も元の誤りのまま (「既に初期化されています」に書き換えない) —— 肯定形で留める。
      expect((failed as { message?: string }).message).toBe('quota');
      expect(v.isUnlocked()).toBe(false);
    } finally {
      add.mockRestore();
    }
  });
});
