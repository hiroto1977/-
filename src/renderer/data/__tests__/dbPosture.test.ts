/** @vitest-environment jsdom */
/**
 * 診断入力が **実測から**組み立てられること (2026-08 監査の回帰)。
 *
 * 監査前は `SecurityPage` が画面の中で入力を作り、`autoLockEnabled` を `false`
 * 固定で渡していた。検出器 (`isAutoLockActive`) にテストがあっても、画面が
 * それを呼んでいるかは誰も見ていなかった — 定数へ戻してもテストは緑のままだった。
 * 組み立てを `data/dbPosture.ts` へ出したので、ここが「実測 → 入力」を固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// 保管庫を実際に初期化して観測するため (jsdom には IndexedDB も subtle も無い)。
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
import { currentDbSecurityInputs } from '../dbPosture';
import { _resetAutoLockActiveForTests, startAutoLock, type AutoLockHandle } from '../../security/autoLock';
import { buildDbSecurityReport } from '../../../shared/dbSecurityPosture';

function stubDeps() {
  return {
    now: () => 1_000_000,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  };
}

let handles: AutoLockHandle[] = [];
beforeEach(() => {
  _resetAutoLockActiveForTests();
  handles = [];
  localStorage.clear();
});
afterEach(() => {
  for (const h of handles) h.dispose();
  _resetAutoLockActiveForTests();
});

describe('currentDbSecurityInputs — 自動ロック', () => {
  it('動いていなければ false', () => {
    expect(currentDbSecurityInputs().autoLockEnabled).toBe(false);
  });

  it('動いていれば true (定数固定に戻したらここが落ちる)', () => {
    handles.push(startAutoLock({ onLock: () => undefined }, stubDeps()));
    expect(currentDbSecurityInputs().autoLockEnabled).toBe(true);
  });

  it('診断レポートの「自動ロック」が改善候補から外れる', () => {
    handles.push(startAutoLock({ onLock: () => undefined }, stubDeps()));
    const report = buildDbSecurityReport(currentDbSecurityInputs());
    expect(report.findings.map((f) => f.id)).not.toContain('auto-lock');
    expect(report.checks.find((c) => c.id === 'auto-lock')?.ok).toBe(true);
  });

  it('動いていなければ改善候補に挙がる (診断が甘くなっていない)', () => {
    const report = buildDbSecurityReport(currentDbSecurityInputs());
    expect(report.findings.map((f) => f.id)).toContain('auto-lock');
  });
});

describe('currentDbSecurityInputs — 観測していない項目', () => {
  it('整合性の常時検証は未配線なので false のまま', () => {
    expect(currentDbSecurityInputs().integrityVerified).toBe(false);
  });

  it('クラウド同期は永続化されないので構成シンクは実際に 0 件', () => {
    const { cloudBackup } = currentDbSecurityInputs();
    expect(cloudBackup.configuredSinks).toEqual([]);
    expect(cloudBackup.lastBackupAgeDays).toBeNull();
    expect(cloudBackup.encryptedBackup).toBe(false);
  });

  it('暗号化とマスターパスワードは同じ観測から導く', () => {
    const i = currentDbSecurityInputs();
    expect(i.masterPasswordSet).toBe(i.encryptionEnabled);
  });
});

/*
 * 2026-08-25 の続き —— 同じ形が **2 つ**残っていた。
 *
 * 冒頭が書いているのは「実測すべき欄を定数で渡していた」話だが、
 * `masterPasswordSet` は `encrypted` から**導出**されていた。
 * 片側の含意 (暗号化が有効 ⇒ マスターパスワードは設定済み) としては
 * 正しいが、等号として使うと逆が言えない。レコード暗号化は配線されて
 * おらず `encrypted` は常に false なので、**この欄は常に false** だった。
 *
 * ブラウザ版はマスターパスワードを設定しないと保管庫が作れず、
 * 診断画面にも到達できない。**必ず設定している利用者に「未設定 (high)」と
 * 告げていた** —— 冒頭の `autoLockEnabled` と同じ形である。
 */
describe('マスターパスワードは導出せず観測する', () => {
  // fake-indexeddb は同一プロセスで保持されるので、毎回まっさらにする
  // (singleton を戻すだけだと「既に初期化されています」で落ちる)。
  const freshVault = async () => {
    const mod = await import('../../security/vault');
    mod._resetVaultForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('business-hub-vault');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    return mod;
  };

  it('保管庫が解錠されていれば設定済みと見なす', async () => {
    const { getVault } = await freshVault();
    expect(currentDbSecurityInputs().masterPasswordSet).toBe(false);
    await getVault().initialize('correct horse battery staple');
    expect(getVault().isUnlocked()).toBe(true);
    expect(currentDbSecurityInputs().masterPasswordSet).toBe(true);
  });

  /*
   * **点数に効いていることまで見る。** 欄が true になっても、診断が
   * それを使っていなければ利用者の画面は変わらない。
   */
  it('設定済みなら master-password の項目が ✓ になり点が入る', async () => {
    const { getVault } = await freshVault();
    const before = buildDbSecurityReport(currentDbSecurityInputs());
    await getVault().initialize('correct horse battery staple');
    const after = buildDbSecurityReport(currentDbSecurityInputs());
    const mp = (r: typeof before) => r.checks.find((c) => c.id === 'master-password');
    expect(mp(before)?.ok).toBe(false);
    expect(mp(after)?.ok).toBe(true);
    expect(after.score).toBeGreaterThan(before.score);
  });
});

/*
 * 「読む関数」を用意しただけでは、**読む時刻**は誰も保証しない。
 * 診断画面は `useMemo(..., [])` で**初回描画中**に読んでおり、これは
 * あらゆる `useEffect` より前 —— 自動ロックが始まる前だった。
 * 変化を伝える口を置いたので、それが本当に鳴ることを固定する。
 */
describe('自動ロックの変化が購読者へ伝わる', () => {
  it('開始と終了で通知が来る', async () => {
    const { subscribeAutoLockActive, isAutoLockActive } = await import('../../security/autoLock');
    const seen: boolean[] = [];
    const unsubscribe = subscribeAutoLockActive(() => seen.push(isAutoLockActive()));
    const h = startAutoLock({ onLock: () => undefined }, stubDeps());
    handles.push(h);
    expect(seen).toEqual([true]);
    h.dispose();
    expect(seen).toEqual([true, false]);
    unsubscribe();
    startAutoLock({ onLock: () => undefined }, stubDeps()).dispose();
    expect(seen).toEqual([true, false]);
  });
});

/*
 * **「設定してある」と「今の下限を満たす」は別の話だった。**
 *
 * `master-password` の助言は「**十分に長い**マスターパスワードを設定して
 * ください」と書いてあるのに、測っていたのは**存在するか**だけだった。
 * `MIN_PASSWORD_LENGTH` は 2026-07 に 8 → 12 へ上がったが `unlock` は下限を
 * 強制しない (既存のヴォールトを閉め出さないため) ので、**短いパスワードの
 * ヴォールトは ✅ と表示されたまま開き続けていた**。
 */
describe('マスターパスワードの長さも測る', () => {
  const freshVault2 = async () => {
    const mod = await import('../../security/vault');
    mod._resetVaultForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('business-hub-vault');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    return mod;
  };

  it('未解錠なら「分からない」(null) —— 確かめずに脅さない', async () => {
    const { getVault } = await freshVault2();
    expect(getVault().passwordMeetsPolicy()).toBeNull();
    expect(currentDbSecurityInputs().masterPasswordSet).toBe(false);
  });

  it('下限を満たすパスワードで作れば ✓', async () => {
    const { getVault } = await freshVault2();
    await getVault().initialize('correct horse battery staple');
    expect(getVault().passwordMeetsPolicy()).toBe(true);
    expect(currentDbSecurityInputs().masterPasswordSet).toBe(true);
  });

  /*
   * **`false` になる枝は、今のコードでは作れない —— 正直に書く。**
   *
   * `initialize` / `changePassword` / `recoverWithMnemonic` はどれも下限を
   * 強制するので、**短いパスワードのヴォールトは現在の API では作れない**。
   * `false` に到達するのは 2026-07 より前に作られた実在のヴォールトだけで、
   * そこへ検査から到達する手段が無い (偽の meta を IndexedDB へ差し込むには
   * KCV と master-wrap を検査側で組み直すことになり、暗号の実装を写経する
   * ことになる —— 写経した検査は本体と別々に腐る)。
   *
   * したがってここで確かめるのは到達できる範囲:
   * 施錠で `null` へ戻ること / 正しい長いパスワードで `true` / **解錠に
   * 失敗したら判定を残さないこと**。
   * 判定そのものは `password.length >= MIN_PASSWORD_LENGTH` の 1 行で、
   * その定数は下の検査が固定している。
   *
   * **枝が死んでいるのではなく、検査から届かないだけである**ことを書いておく
   * —— 書いておかないと「到達しない枝」として消される。
   */
  it('★ 短いパスワードで解錠したら false (診断が ⚠ になる)', async () => {
    const { getVault } = await freshVault2();
    const v = getVault();
    await v.initialize('correct horse battery staple');
    v.lock();
    expect(v.passwordMeetsPolicy(), '施錠で「分からない」に戻る').toBeNull();

    await v.unlock('correct horse battery staple');
    expect(v.passwordMeetsPolicy()).toBe(true);

    // 解錠時の判定が「実際に渡された文字列の長さ」で決まることを、
    // 下限より短い文字列で確かめる (誤ったパスワードなので解錠は失敗する →
    // 判定も更新されない = 失敗経路で嘘の値を残さない)。
    v.lock();
    await expect(v.unlock('short')).rejects.toThrow();
    expect(v.passwordMeetsPolicy(), '解錠に失敗したら判定を残さない').toBeNull();
  });

  /*
   * **到達できない枝でも、配線は確かめられる。**
   *
   * 「短いパスワードで解錠された状態」は作れないが、`dbPosture` が
   * `passwordMeetsPolicy()` を**見ているかどうか**は別の話で、こちらは
   * 差し替えれば確かめられる。
   *
   * これを書く前に対照を回したら**鳴らなかった** —— `!== false` を消しても
   * どの検査も落ちなかった。`true` と `null` しか流していなかったので、
   * 判定を握り潰しても差が出なかったためである。
   * **到達しない値は、配線の検査も素通りさせる。**
   */
  it('★ 診断は passwordMeetsPolicy() を見ている (false なら未設定側へ倒す)', async () => {
    const { getVault } = await freshVault2();
    const v = getVault();
    await v.initialize('correct horse battery staple');
    expect(currentDbSecurityInputs().masterPasswordSet).toBe(true);

    const spy = vi.spyOn(v, 'passwordMeetsPolicy').mockReturnValue(false);
    try {
      expect(
        currentDbSecurityInputs().masterPasswordSet,
        '短いパスワードでも ✓ のまま — 診断が判定を見ていない',
      ).toBe(false);
      const r = buildDbSecurityReport(currentDbSecurityInputs());
      expect(r.checks.find((c) => c.id === 'master-password')?.ok).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('下限の定数が 12 である (診断の判定はこれに依る)', async () => {
    const { MIN_PASSWORD_LENGTH } = await import('../../security/vault');
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    // 2026-07 に 8 から上げた。8 文字は今の下限を満たさない。
    expect('12345678'.length >= MIN_PASSWORD_LENGTH).toBe(false);
    expect('correct horse battery staple'.length >= MIN_PASSWORD_LENGTH).toBe(true);
  });

  it('パスワードを変えると満たす側になる (直す口が在る)', async () => {
    const { getVault } = await freshVault2();
    const v = getVault();
    await v.initialize('correct horse battery staple');
    await v.changePassword('correct horse battery staple', 'another sufficiently long one');
    expect(v.passwordMeetsPolicy()).toBe(true);
  });
});
