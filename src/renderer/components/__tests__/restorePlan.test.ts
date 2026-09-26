/** @vitest-environment jsdom */
/**
 * **復元は、何が足され・残り・消えるかを言う。** (2026-09-09 · パス 129)
 *
 * `importAll` は `put` (id ごとの upsert) なので、マージ復元はバックアップを取った**後に**
 * 直した記録を古い中身で黙って上書きし、置換復元の確認は一文だけで消える件数を言わなかった。
 * ここは実物の `BackupPanel` (fake-indexeddb) で読む: マージはこの端末の方が新しい記録を
 * 残し (★)、置換の確認文は書き出し時刻と消える件数を言い (★)、やめれば何も書かない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BackupPanel } from '../BackupPanel';
import { _resetRecordStoreForTests, getRecordStore, type StoredRecord } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION } from '../../data/sales';
import { serializeBackup } from '../../data/backup';
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;
const originalConfirm = window.confirm;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

/**
 * 復元の入口 (ファイル欄) が出るまで**条件で**待って描く (2026-09-21 · パス 381)。
 *
 * ここは 2026-09-21 まで固定 8 周の `settle()` だった —— 周回数を 0 にすると
 * 置換の確認がまだ呼ばれておらず ★ が落ちる
 * (`npm run audit:tick-sensitivity` の実測)。後ろに在るのは、消える件数を
 * 数えるための保管層の読みである。
 */
async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(BackupPanel));
  });
  await settleUntil(() => container.querySelector('input[type="file"]') !== null, '復元のファイル欄が出る');
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
  window.confirm = originalConfirm;
});

/** 復元のファイル入力へ本物の File を渡す (importSizeGuard と同じ形)。 */
async function chooseFile(content: string, name: string): Promise<void> {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input missing');
  Object.defineProperty(input, 'files', { value: [new File([content], name)], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function checkReplace(): Promise<void> {
  const box = container.querySelector<HTMLInputElement>('input[type="checkbox"][data-backup-replace]');
  if (!box) throw new Error('replace checkbox missing');
  await act(async () => {
    box.click();
  });
  expect(box.checked).toBe(true);
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

interface SalesRow extends Record<string, unknown> {
  date: string;
  channel: string;
  amount: number;
  orders: number;
  note: string;
}
const ROW: SalesRow = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: 'restore' };
const FROM_BACKUP: StoredRecord = { id: 'from-backup', collection: SALES_COLLECTION, createdAt: 1, updatedAt: 1, data: ROW };

/** この端末の記録 (今の時刻・金額 2000)。 */
async function seedLocal(): Promise<StoredRecord<SalesRow>> {
  return getRecordStore().insert<SalesRow>(SALES_COLLECTION, { ...ROW, amount: 2000 });
}

describe('バックアップの復元 — 何が足され・残り・消えるか (実物の画面)', () => {
  it('★ マージは、この端末の方が新しい記録を古いバックアップで上書きしない', async () => {
    const local = await seedLocal();
    const backup = await serializeBackup(
      [{ ...local, createdAt: local.createdAt - 60_000, updatedAt: local.updatedAt - 60_000, data: ROW }],
      new Date('2026-06-01T12:00:00Z'),
    );
    await mount();
    await chooseFile(backup, 'older.json');
    await waitForText(text, '0 件のレコードを復元しました（マージ: 追加 0・更新 0・この端末の方が新しい 1 件はそのまま）');
    expect((await getRecordStore().get<SalesRow>(local.id))?.data.amount).toBe(2000);
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });

  it('対照: バックアップの方が新しければ上書きし、無い id は足す', async () => {
    const local = await seedLocal();
    const backup = await serializeBackup([{ ...local, updatedAt: local.updatedAt + 60_000, data: ROW }, FROM_BACKUP]);
    await mount();
    await chooseFile(backup, 'newer.json');
    await waitForText(text, '2 件のレコードを復元しました（マージ: 追加 1・更新 1・この端末の方が新しい 0 件はそのまま）');
    expect((await getRecordStore().get<SalesRow>(local.id))?.data.amount).toBe(1000);
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(2);
  });

  it('★ 置換の確認は書き出し時刻と消える件数を言い、やめれば何も書かない', async () => {
    const local = await seedLocal();
    const backup = await serializeBackup([FROM_BACKUP], new Date('2026-06-01T12:00:00Z'));
    const confirm = vi.fn((_message?: string) => false);
    window.confirm = confirm;
    await mount();
    await checkReplace();
    await chooseFile(backup, 'replace.json');
    // **確認が出たことを先に待つ。** やめた場合は画面に何も出ないので、
    // 下流の文では待てない —— 待てる印はこの呼び出しそのものである
    // (同じ tick に 2 度呼ぶ形なら下の `toHaveBeenCalledTimes(1)` が捕まえる)。
    await settleUntil(() => confirm.mock.calls.length >= 1, '置換の確認ダイアログが出る');
    expect(confirm).toHaveBeenCalledTimes(1);
    const message = String(confirm.mock.calls[0]?.[0]);
    expect(message).toContain('既存の業務データを全て削除してから復元します。');
    expect(message).toMatch(/バックアップ: 2026\/6\/1 .* 書き出し・1 件/);
    expect(message).toContain('この端末: 1 件 —— バックアップに無い 1 件と、この端末の方が新しい 0 件 (計 1 件) が消え、元に戻せません。');
    expect(text()).not.toContain('復元しました');
    expect(await getRecordStore().get(local.id)).not.toBeNull();
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });

  /**
   * **形式不正の控えで置換すると、確認が「消える記録はありません」と述べて全部消えた**
   * (2026-09-23 · パス 432)。同じ id の記録が控えに在っても、その記録が形の検査に
   * 落ちるなら**入れ替えは起きない** —— 消えるだけである。直す前の計画はそれを
   * `overwritten` (= バックアップの中身になる) に数えていた。
   *
   * ここは実物の画面で、**訊く前に断ること**と**この端末の記録が残ること**を見る。
   */
  it('★ 控えが形式不正なら、置換は訊く前に断り、この端末の記録は残る', async () => {
    const local = await seedLocal();
    // 同じ id・新しい時刻・**形の検査に落ちる中身** (金額が文字列)。
    const backup = await serializeBackup([
      { ...local, updatedAt: local.updatedAt + 60_000, data: { ...ROW, amount: 'abc' } },
    ]);
    const confirm = vi.fn((_message?: string) => true);
    window.confirm = confirm;
    await mount();
    await checkReplace();
    await chooseFile(backup, 'broken.json');
    await waitForText(text, '取り込める記録が 1 件もありません');
    // **訊いていない** —— OK を貰っても結果は「全部消えて何も入らない」ので、訊く意味が無い。
    expect(confirm).not.toHaveBeenCalled();
    expect(text()).toContain('すべてのデータを削除');
    expect((await getRecordStore().get<SalesRow>(local.id))?.data.amount).toBe(2000);
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });

  it('★ 一部だけ形式不正なら訊く —— 確認文が取り込めない件数と消える理由を言う', async () => {
    const local = await seedLocal();
    const backup = await serializeBackup(
      [
        FROM_BACKUP,
        { ...local, updatedAt: local.updatedAt + 60_000, data: { ...ROW, amount: 'abc' } },
      ],
      new Date('2026-06-01T12:00:00Z'),
    );
    const confirm = vi.fn((_message?: string) => true);
    window.confirm = confirm;
    await mount();
    await checkReplace();
    await chooseFile(backup, 'partly-broken.json');
    await waitForText(text, '1 件のレコードを復元しました');
    const message = String(confirm.mock.calls[0]?.[0]);
    expect(message).toContain('（うち 1 件は形式が不正で取り込めません）');
    expect(message).toContain('バックアップ側が形式不正で入れ替えられない 1 件');
    // 直す前は「消える記録はありません」と述べ、この端末の記録が黙って消えていた。
    expect(message).not.toContain('消える記録はありません');
    expect(await getRecordStore().get(local.id)).toBeNull();
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });

  it('対照: 確認で OK すれば置き換わり、結果の文が消えた件数の内訳を言う', async () => {
    const local = await seedLocal();
    const backup = await serializeBackup([FROM_BACKUP]);
    window.confirm = vi.fn((_message?: string) => true);
    await mount();
    await checkReplace();
    await chooseFile(backup, 'replace.json');
    await waitForText(text, '1 件のレコードを復元しました（既存データは置換。消えた 1 件 = バックアップに無い 1 件 + この端末の方が新しかった 0 件）');
    expect(await getRecordStore().get(local.id)).toBeNull();
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });
});
