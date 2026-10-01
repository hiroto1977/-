/** @vitest-environment jsdom */
/**
 * 設定画面の「形式の合わないレコードの点検」—— 実物の record store で描き、調べる → 内訳 → 確認 → 削除 の配線。
 * 確認で「いいえ」なら何も消えない (対照)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RecordShapeAuditPanel } from '../RecordShapeAuditPanel';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { SALES_COLLECTION } from '../../data/sales';
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';

/**
 * **点検は IndexedDB を何度も往復する。** 既定の 5 秒では足りないことがあるので
 * ここだけ 10 秒にする (2026-09-09 に全件実行でこの 1 本が落ちた —— 単独では 3/3 通った)。
 * 待つのは**出るはずの文**で、出なければ本物の失敗として落ちる。
 * 2026-09-21 (パス 369) に手書きの待ちをやめ、共有の `waitForText` へ寄せた。
 */
const WAIT_LONG = { timeoutMs: 10_000 } as const;

const GOOD = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };
const BAD = { date: '2026-04-02', channel: 'amazon', amount: 'abc', orders: 1, note: '' };


let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  _resetRecordStoreForTests();
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
  vi.restoreAllMocks();
});

/**
 * **待つのは条件で、回数ではない** (法則 `wait-for-condition-not-ticks`)。
 *
 * 2026-09-23 (パス 433) まで `mount` / `click` は固定 8 周の `settle()` で待っていた。
 * パス 433 で `remove()` に「訊く前の数え直し」(非同期) が 1 段増えた瞬間、
 * 周回数を 0 にすると**この日より前から在った検査 1 件まで落ちた** ——
 * 押した結果を待たずに `confirm` の呼び出しを主張していたためである
 * (`npm run audit:tick-sensitivity` の実測: HEAD では 0 周でも 3/3 通っていた)。
 * **押す側は押すだけ**にして、待つのは呼び手が自分の見たい物で待つ (パス 378 と同じ形)。
 */
async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(RecordShapeAuditPanel));
  });
  await settleUntil(() => container.querySelector('[data-shape-audit-scan]') !== null, '点検のボタンが出る');
}

async function click(selector: string): Promise<void> {
  const el = container.querySelector(selector);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`${selector} missing`);
  await act(async () => {
    el.click();
  });
}

describe('RecordShapeAuditPanel', () => {
  it('★ 調べる → 件数と内訳 → 確認して削除 → 合うレコードだけ残り、再点検は 0 件', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    expect(container.querySelector('[data-shape-audit-delete]')).toBeNull();
    await click('[data-shape-audit-scan]');
    await waitForText(() => container.textContent ?? '', '調べた 2 件のうち 1 件の形式が合いません (sales-entries 1 件)', WAIT_LONG);
    await click('[data-shape-audit-delete]');
    // **確認が出たことを先に待つ** —— 押した直後は数え直しがまだ走っている。
    await settleUntil(() => confirm.mock.calls.length >= 1, '削除の確認ダイアログが出る', WAIT_LONG);
    expect(confirm).toHaveBeenCalledWith('形式の合わないレコード 1 件を削除します。元に戻せません。よろしいですか？');
    await waitForText(() => container.textContent ?? '', '1 件を削除しました', WAIT_LONG);
    await waitForText(() => container.textContent ?? '', '調べた 1 件に形式の合わないレコードはありません');
    expect(container.querySelector('[data-shape-audit-delete]')).toBeNull();
    expect(await store.count(SALES_COLLECTION)).toBe(1);
  });

  it('対照: 確認で「いいえ」なら何も消えない', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount();
    await click('[data-shape-audit-scan]');
    await waitForText(() => container.textContent ?? '', '1 件の形式が合いません', WAIT_LONG);
    await click('[data-shape-audit-delete]');
    // やめた場合は画面に何も出ないので、待てる印は確認の呼び出しそのものである。
    await settleUntil(() => confirm.mock.calls.length >= 1, '削除の確認ダイアログが出る', WAIT_LONG);
    expect(container.textContent).not.toContain('削除しました');
    await waitForText(() => container.textContent ?? '', '1 件の形式が合いません');
    expect(await store.count(SALES_COLLECTION)).toBe(1);
  });

  /**
   * **点検から押すまでの間に中身が変わりうる** (2026-09-23 · パス 433)。
   *
   * 点検パネルとバックアップパネルは**同じ設定画面に並ぶ**ので、
   * 「形式の合わない記録が 2 件ある」と知った利用者が良いバックアップを先に戻す、は自然な順序である
   * (別のタブでも同じことが起きる)。実測 (直す前): 復元で同じ id が置き換わり形は合うようになったのに、
   * 古いボタンを押すと確認文が「形式の合わないレコード **2 件**を削除します。元に戻せません。」と述べ、
   * **復元したばかりの正しい 2 件が消えた**。
   */
  it('★ 点検の後に復元で直ったら、押しても消さず「もうありません」と言う', async () => {
    const store = getRecordStore();
    const bad1 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const bad2 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await click('[data-shape-audit-scan]');
    await waitForText(() => container.textContent ?? '', '2 件の形式が合いません', WAIT_LONG);

    // 同じ画面のバックアップパネルでマージ復元する (importAll は id ごとの upsert)。
    await store.importAll([
      { id: bad1.id, collection: SALES_COLLECTION, createdAt: 1, updatedAt: 999, data: GOOD },
      { id: bad2.id, collection: SALES_COLLECTION, createdAt: 1, updatedAt: 999, data: { ...GOOD, amount: 2000 } },
    ]);

    await click('[data-shape-audit-delete]');
    await waitForText(() => container.textContent ?? '', '形式の合わないレコードはもうありません。削除していません。', WAIT_LONG);
    expect(confirm, '消す物が無いので訊かない').not.toHaveBeenCalled();
    expect(container.textContent, '消していないので件数を報せない').not.toContain('件を削除しました');
    expect(await store.count(SALES_COLLECTION), '2 件とも残る').toBe(2);
  });

  it('★ 一部だけ直ったら、確認文は「今の件数」を言い、直った側は残る', async () => {
    const store = getRecordStore();
    const bad1 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await click('[data-shape-audit-scan]');
    await waitForText(() => container.textContent ?? '', '2 件の形式が合いません', WAIT_LONG);
    await store.importAll([{ id: bad1.id, collection: SALES_COLLECTION, createdAt: 1, updatedAt: 999, data: GOOD }]);

    await click('[data-shape-audit-delete]');
    await waitForText(() => container.textContent ?? '', '1 件を削除しました', WAIT_LONG);
    // 古い一覧なら「2 件」と訊いていた。
    expect(confirm).toHaveBeenCalledWith('形式の合わないレコード 1 件を削除します。元に戻せません。よろしいですか？');
    expect((await store.list(SALES_COLLECTION)).map((r) => r.id), '直った側だけ残る').toEqual([bad1.id]);
  });

  it('対照: 合うレコードだけなら「ありません」で、削除ボタンは出ない', async () => {
    await getRecordStore().insert(SALES_COLLECTION, GOOD);
    await mount();
    await click('[data-shape-audit-scan]');
    await waitForText(() => container.textContent ?? '', '調べた 1 件に形式の合わないレコードはありません', WAIT_LONG);
    expect(container.querySelector('[data-shape-audit-delete]')).toBeNull();
  });
});
