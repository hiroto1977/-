/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

import { getRecordStore, _resetRecordStoreForTests } from '../store';
import { BACKUP_EXCLUSIONS, serializeBackup } from '../backup';
import type { EvictionRecovery } from '../../../shared/storageDurability';
import { _resetVaultForTests, getVault } from '../../security/vault';

if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * 立ち退きの警告は「何が戻せるか」を**名指しで**言う。言った以上、
 * それが本当かを台帳ではなく**実物で**確かめる。
 *
 * 2026-08-25 の最初の実装は「バックアップを書き出してください」とだけ書いて
 * いた。その一文は「トークンごと失われます」の直後に在り、**書き出せば
 * トークンも戻る**と読める。実際には戻らない —— 保管庫は別の IndexedDB に
 * 在り、バックアップは業務レコードだけを読む。
 *
 * **台帳 (`BACKUP_EXCLUSIONS`) を標本の代わりにはできない。** 台帳は人が
 * 書いた文で、実装が変われば黙って古くなる。だからここでは**実際に保管庫へ
 * トークンを入れ、実際にバックアップを作り、その中に無いこと**を見る。
 */

function clearIdb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetVaultForTests();
  _resetRecordStoreForTests();
  await clearIdb('business-hub-vault');
  await clearIdb('business-hub-data');
});

const SECRET = 'ghp_TOKEN_MUST_NOT_APPEAR_IN_BACKUP_0123456789';

describe('バックアップが覆う範囲 — 実物で確かめる', () => {
  it('★ 保管庫へ入れたトークンは、バックアップに現れない', async () => {
    const vault = getVault();
    await vault.initialize('correct horse battery staple');
    await vault.setToken('github', SECRET);
    expect(await vault.getToken('github')).toBe(SECRET);

    // 業務レコードも 1 件入れて、バックアップ自体は空でないことを担保する
    // (空のバックアップなら「入っていない」は自明で、何も測れない)。
    await getRecordStore().insert('sales', { amount: 1234 });

    const records = await getRecordStore().exportAll();
    expect(records.length).toBe(1);

    const text = await serializeBackup(records);
    expect(text).toContain('1234');
    expect(text).not.toContain(SECRET);
    // 封緘された形でも入っていないこと (「暗号文なら入っていてよい」ではない —
    // 入っていないことを言っているので、痕跡ごと無いのが正しい)。
    expect(text).not.toContain('github');
  });

  it('保管庫を消してもバックアップの中身は変わらない (別のデータベースである)', async () => {
    const vault = getVault();
    await vault.initialize('correct horse battery staple');
    await vault.setToken('github', SECRET);
    await getRecordStore().insert('sales', { amount: 1234 });

    const before = await serializeBackup(await getRecordStore().exportAll());
    await clearIdb('business-hub-vault');
    _resetVaultForTests();
    const after = await serializeBackup(await getRecordStore().exportAll());

    // exportedAt が秒単位で動きうるので、records の中身だけを比べる。
    const recs = (t: string) => JSON.stringify(JSON.parse(t).records);
    expect(recs(after)).toBe(recs(before));
  });
});

/*
 * 画面が言うことと、台帳が言うことを突き合わせる。
 *
 * `src/shared` から renderer を import することはできない (境界検査) ので、
 * **両方を読めるここが唯一の突き合わせ場所**になる。片方だけ直した日に鳴る。
 */
describe('EVICTION_RECOVERY と BACKUP_EXCLUSIONS が同じことを言っている', () => {
  /**
   * **表は毎回読み直す** (2026-09-20 · パス 353)。
   *
   * `EVICTION_RECOVERY` はモジュール直下の定数なので、静的 import だと
   * **1 度だけ評価された値**を見ることになる。`stryker.config.json` の
   * `_commentIgnoreStatic` が書いているとおり、覆われた static 変異体は
   * 「モジュールが変異体の有効化より前に読み込まれている」ために**生存として
   * 報告される** —— 実測 (2026-09-20・`--mutate src/shared/storageDurability.ts`):
   * **27.78% / 生存 13**、その 13 件すべてがこの表の行だった
   * (`recoverable: false` → `true` の反転を含む)。
   *
   * ソースを直接書き換えれば下の検査は落ちる (実測で確かめた) ので、
   * 主張そのものは正しかった。見えていなかったのは**読み込みの時点**である。
   * `vi.resetModules()` + 動的 `await import()` で読み直せば、表を書き換える
   * 変異体が比較で落ちる (`oauth.test.ts` の `freshConfigs` と同じ形)。
   */
  async function freshTable(): Promise<readonly EvictionRecovery[]> {
    vi.resetModules();
    const mod = (await import('../../../shared/storageDurability')) as {
      EVICTION_RECOVERY: readonly EvictionRecovery[];
    };
    return mod.EVICTION_RECOVERY;
  }

  it('API キーの行がある', async () => {
    const table = await freshTable();
    expect(table.find((r) => r.what.includes('API'))).toBeDefined();
  });

  it('★ 画面は「戻せない」と言い、台帳も「含まれない」と言っている', async () => {
    const table = await freshTable();
    expect(table.find((r) => r.what.includes('API'))?.recoverable).toBe(false);
    expect(BACKUP_EXCLUSIONS.some((x) => x.includes('API'))).toBe(true);
  });

  it('業務レコードだけが「戻せる」— 覆っているのは 1 つのデータベースだけ', async () => {
    const recoverable = (await freshTable()).filter((r) => r.recoverable);
    expect(recoverable.length).toBe(1);
    expect(recoverable[0]?.what).toContain('業務レコード');
  });

  it('戻せない行は、その後どうするかを書いている (言い放しにしない)', async () => {
    for (const r of await freshTable()) {
      expect(r.note.length).toBeGreaterThan(10);
      if (!r.recoverable) expect(r.note).toContain('含まれません');
    }
  });

  /*
   * **「バックアップを書き出せばよい」とだけ書いてある状態へ戻さない。**
   * 戻せない物が 1 つも無い表は、この警告の存在理由を消す。
   */
  it('戻せない物が必ず在る (全部戻せる表にしない)', async () => {
    expect((await freshTable()).some((r) => !r.recoverable)).toBe(true);
  });

  /*
   * **行が 1 つも無い表・名前の無い行を作らない** (パス 353)。
   *
   * 空の表を渡しても `some` / `filter` / `find` はどれも投げず、警告からは
   * 箇条書きが丸ごと消える —— 「消えたら何が戻らないか」を言わない警告になる。
   * 名前が空文字の行も同じで、画面には「・: 戻せません」とだけ出る。
   */
  it('★ 表は 3 行で、どの行も名前と理由を持つ', async () => {
    const table = await freshTable();
    expect(table.length).toBe(3);
    for (const r of table) {
      expect(r.what.length, JSON.stringify(r)).toBeGreaterThan(3);
      expect(r.note.length, r.what).toBeGreaterThan(10);
    }
  });

  it('★ 3 つの行は、立ち退きで失われる 3 つの場所を名指しする', async () => {
    const table = await freshTable();
    const names = table.map((r) => r.what).join(' / ');
    expect(names).toContain('業務レコード');
    expect(names).toContain('API');
    expect(names).toContain('ライブラリ');
    // 戻せる行の理由は「書き出したファイルから戻せる」と述べる (手順を言う)。
    const ok = table.find((r) => r.recoverable);
    expect(ok?.note).toContain('戻せます');
  });
});
