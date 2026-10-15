/**
 * **復元は id だけが鍵なので、別の collection の行が同じ id を名乗ると既存の記録を置き換えていた**
 * (2026-10-15 · パス 522 · threat: T-048)。
 *
 * ## 見つけた物 (監査役の探りを自分で走らせて再現 · 直す前)
 *
 * この端末に `team-members` の行 (id X) が在るとき、控えに `{ id: X, collection: 'sales-entries', … }`
 * (updatedAt が新しい) を 1 件入れてマージ復元すると: 計画は `overwritten: 1 / lost: 0`、結果の文は
 * 「更新 1」、そして **team-members は 0 件・sales-entries が 2 件** —— メンバーの行は消え、消えた件数は
 * どこにも出ない。鍵は `keyPath: 'id'` で collection は鍵に入らず、`put` は id だけで upsert する。
 * 届く道は配られた控え 1 つ (id は uuid なので相手が知っている必要が在る —— 1 度外へ出した控えを
 * 直して戻す形)。同じ探りで、**控えの中で同じ id が 3 度現れると計画も結果も「3 件」と言い、
 * 保管層には 1 件** (後勝ち) しか残らなかった。
 *
 * ## 直し
 *
 * - 計画と実行の**両方**が同じ 2 規則を持つ: ① 同じ id は後の行が勝つので 1 件へ畳む (`dedupeById`)
 *   ② マージでは、既存の行が別の collection なら書かない (`collectionClash` に数え、既存を残す)。
 *   置換では既存は消えるので書くが、「更新」ではなく `lost` に数え、確認文がその理由を言う。
 * - `importAll` は同じ取引の中で `get` → `put` を連ね、書いた件数だけを返す。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dedupeById, getRecordStore, type StoredRecord } from '../store';
import { planRestore, replaceRestoreConfirmMessage, restoreResultMessage } from '../backup';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { SALES_COLLECTION } from '../sales';

const TEAM = 'team-members';
const GOOD_SALE = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };
const MEMBER = { name: '山田', email: 'yamada@example.com', role: 'member' };

const rec = (id: string, collection: string, data: Record<string, unknown>, updatedAt = 5): StoredRecord => ({
  id, collection, createdAt: 1, updatedAt, data,
});

beforeEach(resetRecordStore);

describe('復元の id の衝突 (パス 522 · T-048)', () => {
  it('★ マージ: 別の collection の行が同じ id を名乗っても、既存の記録は消えない (threat: T-048)', async () => {
    const store = getRecordStore();
    const memberId = (await store.insert(TEAM, MEMBER)).id;
    const existing = await store.exportAll();
    const incoming = [rec(memberId, SALES_COLLECTION, GOOD_SALE, 1e13)];
    const plan = planRestore(existing, incoming, 'merge', null, false);
    expect(plan.collectionClash).toBe(1);
    expect(plan.overwritten).toBe(0);
    expect(plan.toImport).toEqual([]);
    const n = await store.importAll(incoming);
    expect(n).toBe(0);
    expect(await store.count(TEAM)).toBe(1);
    expect(await store.count(SALES_COLLECTION)).toBe(0);
    expect(restoreResultMessage(plan, n, plan.dropped)).toContain('更新 0');
  });

  it('★ 置換: 同じ衝突は「更新」ではなく消える件数に数え、確認文が理由を言う', async () => {
    const store = getRecordStore();
    const memberId = (await store.insert(TEAM, MEMBER)).id;
    const existing = await store.exportAll();
    const plan = planRestore(existing, [rec(memberId, SALES_COLLECTION, GOOD_SALE, 1e13)], 'replace', null, false);
    expect(plan.collectionClash).toBe(1);
    expect(plan.overwritten).toBe(0);
    expect(plan.lost).toBe(1);
    expect(replaceRestoreConfirmMessage(plan)).toContain('別の種類の記録で同じ id を名乗る 1 件');
    expect(replaceRestoreConfirmMessage(plan)).not.toContain('消える記録はありません');
    // 結果の文も同じ理由を言う (確認文だけが知っていて結果が黙る形にしない)。
    expect(restoreResultMessage(plan, 1, 0)).toContain('別の種類の記録で同じ id を名乗った 1 件');
  });

  it('★ 同じ id が控えに 3 度在れば、計画も結果も 1 件と数える (後勝ち = put と同じ)', async () => {
    const store = getRecordStore();
    const incoming = [
      rec('dup', SALES_COLLECTION, GOOD_SALE, 1),
      rec('dup', SALES_COLLECTION, { ...GOOD_SALE, amount: 2000 }, 2),
      rec('dup', TEAM, MEMBER, 3),
    ];
    const plan = planRestore([], incoming, 'merge', null, false);
    expect(plan.incoming).toBe(3);
    expect(plan.duplicateIds).toBe(2);
    expect(plan.added).toBe(1);
    expect(plan.toImport).toHaveLength(1);
    expect(plan.toImport[0]!.collection).toBe(TEAM);
    const n = await store.importAll(plan.toImport);
    expect(n).toBe(1);
    expect(await store.count(TEAM)).toBe(1);
    expect(restoreResultMessage(plan, n, plan.dropped)).toContain('1 件のレコードを復元しました');
  });

  it('対照: 同じ collection の同じ id は今までどおり「更新」で、1 件も失わない', async () => {
    const store = getRecordStore();
    const id = (await store.insert(SALES_COLLECTION, GOOD_SALE)).id;
    const existing = await store.exportAll();
    const incoming = [rec(id, SALES_COLLECTION, { ...GOOD_SALE, amount: 9 }, 1e13)];
    const plan = planRestore(existing, incoming, 'merge', null, false);
    expect(plan.overwritten).toBe(1);
    expect(plan.collectionClash).toBe(0);
    expect(await store.importAll(plan.toImport)).toBe(1);
    const rows = await store.list<Record<string, unknown>>(SALES_COLLECTION);
    expect(rows.map((r) => r.data.amount)).toEqual([9]);
  });

  it('dedupeById: 最初の位置に最後の中身を置き、順序を保つ', () => {
    const out = dedupeById([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }]);
    expect(out).toEqual([{ id: 'a', v: 3 }, { id: 'b', v: 2 }]);
  });
});
