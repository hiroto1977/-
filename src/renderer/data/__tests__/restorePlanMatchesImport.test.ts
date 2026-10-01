/**
 * **復元の計画が「入る」と数えた物が、そのまま入る** (2026-09-23 · パス 432)。
 *
 * 置換復元は「既存を全部消してから復元する」操作で、**消す方は必ず成功し、入れる方は
 * 形の検査 (`collectionShapes.ts`) を通った物だけが入る**。ところが 2026-09-23 まで
 * `planRestore` は**ファイルの全件**で id を突き合わせており、`importAll` が落とす記録も
 * 「バックアップの中身になる」に数えていた。数える側と実行する側が割れていた。
 *
 * ## 実測 (2026-09-23 · 直す前)
 *
 * | 場面 | 確認文が述べた事 | 押した後 |
 * | --- | --- | --- |
 * | 既存 3 件 / 控え 2 件が形式不正 | 「バックアップ: **2 件**」「3 件が消え、元に戻せません」 | **ストア 0 件** |
 * | 既存 1 件 / **同じ id** の控えが形式不正 | 「**消える記録はありません**」 | **ストア 0 件** |
 * | 既存 2 件 / 控え 5 件中 2 件が形式不正 | 「バックアップ: **5 件**」 | 入ったのは **3 件** |
 *
 * ★ **2 行目がいちばん重い** —— 利用者は「何も失わない」という**明示の保証**を読んで
 *   OK を押し、記録は元に戻せない。しかも結果の文も「消えた **0 件**」と言い続ける。
 *   `replaceRestoreConfirmMessage` の docblock は「消える物が無いときはそう言う ——
 *   空欄ではなく明示」と、まさにその 1 文を丁寧に作っている。**明示したから偽になった。**
 *
 * ★ **アプリは訊く前に知っていた** —— 判定は純関数で、記録は手元に在る。
 *
 * ## ここで見るもの
 *
 * - ★ **計画と実行が一致する** —— 母集団は `COLLECTION_SHAPES` から走査で導く
 *   (壊し方 4 家系 × 全 collection)。`plan.toImport` の件数と `importAll` の戻りが等しく、
 *   復元後のストアが計画どおりの id を持つ。
 * - ★ **同じ id の控えが形式不正なら「消える」と言う** (`unusableLocal`)。
 * - ★ **取り込める記録が 1 件も無い置換は、訊く前に断る**。
 * - 正しい控えでは**文面が 1 字も変わらない** (断りの綴りが出ないことの標本つき)。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  planRestore,
  replaceRestoreConfirmMessage,
  restoreResultMessage,
  unusableBackupRefusal,
} from '../backup';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { getRecordStore, isImportableRecord, type StoredRecord } from '../store';
import { SALES_COLLECTION } from '../sales';
import { BALANCE_SHEET_COLLECTION } from '../balanceSheet';
import { FAMILIES, malformedRow } from '../../__tests__/malformedRows';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

const rec = (id: string, collection: string, data: Record<string, unknown>, updatedAt = 1): StoredRecord =>
  ({ id, collection, createdAt: 1, updatedAt, data });

/** 形の検査を通る販売記録 (入る側の標本)。 */
const goodSale = (i: number): Record<string, unknown> =>
  ({ date: '2026-04-01', channel: 'amazon', amount: 1000 * i, orders: i });

/**
 * 2026-09-07 より前の版の書き手が保存できた貸借対照表 —— 現預金 > 流動資産。
 * **「手で直した JSON」ではない**: 内数 ≦ 親項目を書き手が断るようになったのは
 * 2026-09-07 で、復元の側がそれを見るようになったのは 2026-09-14 (パス 224)。
 * それより前の控えは、今日の復元では落ちる。
 */
const OLD_BALANCE_SHEET: Record<string, unknown> = {
  asOf: '2026-03-31', currentAssets: 1_000_000, cash: 8_000_000, fixedAssets: 4_000_000,
  currentLiabilities: 500_000, fixedLiabilities: 300_000, netIncome: 100_000,
};

beforeEach(resetRecordStore);

describe('復元: 計画と実行が同じ関門を読む', () => {
  it('★ 計画が「入る」と数えた物が、そのまま入る (母集団は形の表から走査)', async () => {
    const store = getRecordStore();
    const incoming: StoredRecord[] = [rec('good', SALES_COLLECTION, goodSale(1))];
    const refused: string[] = [];
    for (const collection of Object.keys(COLLECTION_SHAPES)) {
      for (const family of FAMILIES) {
        const data = malformedRow(collection, family);
        if (data === null) continue; // その壊し方では拒めない collection
        const id = `bad-${collection}-${family}`;
        incoming.push(rec(id, collection, data));
        refused.push(id);
      }
    }
    // 床: 走査が死んで「0 件だから一致」にならない (23 collection × 4 家系の大半は拒める)。
    expect(refused.length).toBeGreaterThanOrEqual(40);

    const plan = planRestore(await store.exportAll(), incoming, 'replace', null);
    expect(plan.incoming).toBe(incoming.length);
    expect(plan.dropped).toBe(refused.length);
    expect(plan.toImport.map((r) => r.id)).toEqual(['good']);

    // **実行が計画と一致する** —— 戻り値も、実際に残った id も。
    const imported = await store.importAll(plan.toImport, { replace: true });
    expect(imported).toBe(plan.toImport.length);
    expect((await store.exportAll()).map((r) => r.id)).toEqual(['good']);
  });

  it('床: 壊した行は実際に関門が拒み、正しい行は通る (針が的に当たる)', () => {
    expect(isImportableRecord(rec('good', SALES_COLLECTION, goodSale(1)))).toBe(true);
    expect(isImportableRecord(rec('bs', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET))).toBe(false);
    // 封緘済みは中身を見られないので通す (暗号化バックアップを丸ごと落とさないため)。
    expect(isImportableRecord(rec('sealed', BALANCE_SHEET_COLLECTION, { __enc: { iv: 'x', ct: 'y' } }))).toBe(true);
  });

  it('★ 同じ id の控えが形式不正なら、置換で「消える」と数える', () => {
    const plan = planRestore(
      [{ id: 'bs-1', updatedAt: 100 }],
      [rec('bs-1', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET, 200)],
      'replace',
      null,
    );
    // 直す前はこの 1 件が overwritten (= バックアップの中身になる) に数えられていた。
    expect(plan.overwritten).toBe(0);
    expect(plan.localOnly).toBe(0);
    expect(plan.unusableLocal).toBe(1);
    expect(plan.lost).toBe(1);
  });

  it('★ マージなら同じ形でも消えない (置換だけが消す)', () => {
    const plan = planRestore(
      [{ id: 'bs-1', updatedAt: 100 }],
      [rec('bs-1', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET, 200)],
      'merge',
      null,
    );
    expect(plan.unusableLocal).toBe(1);
    expect(plan.lost).toBe(0);
  });

  it('★ 取り込める記録が 1 件も無い置換は、訊く前に断る', () => {
    const plan = planRestore(
      [{ id: 'mine', updatedAt: 100 }],
      [rec('b1', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET), rec('b2', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET)],
      'replace',
      null,
    );
    const refusal = unusableBackupRefusal(plan);
    expect(refusal).toContain('2 件すべてが形式不正');
    expect(refusal).toContain('この端末の 1 件を消して何も入らないため復元しませんでした');
    // 逃げ口を名指しする (消したいだけの利用者には別の操作子が在る)。
    expect(refusal).toContain('すべてのデータを削除');
  });

  it('対照: 1 件でも入るなら断らない / マージは断らない', () => {
    const local = [{ id: 'mine', updatedAt: 100 }];
    const mixed = [rec('g', SALES_COLLECTION, goodSale(1)), rec('b', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET)];
    expect(unusableBackupRefusal(planRestore(local, mixed, 'replace', null))).toBeNull();
    const allBad = [rec('b', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET)];
    expect(unusableBackupRefusal(planRestore(local, allBad, 'merge', null))).toBeNull();
    // 形式不正が 0 件なら断る理由が無い (空のファイルを置換に使うのは今までどおり通す)。
    expect(unusableBackupRefusal(planRestore(local, [], 'replace', null))).toBeNull();
  });

  it('★ 一部が落ちる置換では、確認文が取り込めない件数と消える理由を述べる', () => {
    const plan = planRestore(
      [{ id: 'mine', updatedAt: 100 }, { id: 'shared', updatedAt: 100 }],
      [
        rec('g', SALES_COLLECTION, goodSale(1)),
        rec('shared', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET, 200),
      ],
      'replace',
      null,
    );
    const message = replaceRestoreConfirmMessage(plan);
    expect(message).toContain('（うち 1 件は形式が不正で取り込めません）');
    expect(message).toContain('バックアップに無い 1 件と、この端末の方が新しい 0 件と、バックアップ側が形式不正で入れ替えられない 1 件 (計 2 件) が消え、元に戻せません。');
    // 直す前の文面 (これが出ていたら欠陥がそのまま戻っている)。
    expect(message).not.toContain('消える記録はありません');
    expect(restoreResultMessage(plan, 1, plan.dropped)).toContain('+ バックアップ側が形式不正だった 1 件');
  });

  it('対照: 正しい控えなら文面は 1 字も変わらない (針が的に当たる標本つき)', () => {
    const plan = planRestore(
      [{ id: 'mine', updatedAt: 100 }],
      [rec('g', SALES_COLLECTION, goodSale(1))],
      'replace',
      null,
    );
    expect(plan.dropped).toBe(0);
    expect(plan.unusableLocal).toBe(0);
    const message = replaceRestoreConfirmMessage(plan);
    expect(message).toContain('バックアップに無い 1 件と、この端末の方が新しい 0 件 (計 1 件) が消え、元に戻せません。');
    expect(message).not.toContain('形式が不正で取り込めません');
    expect(message).not.toContain('形式不正で入れ替えられない');
    const result = restoreResultMessage(plan, 1, plan.dropped);
    expect(result).toContain('消えた 1 件 = バックアップに無い 1 件 + この端末の方が新しかった 0 件）');
    expect(result).not.toContain('形式不正');
    // 上の 3 つの `not` が的に当たることを、同じ it の中で標本に対して示す。
    const dirty = planRestore(
      [{ id: 'shared', updatedAt: 100 }],
      [rec('g', SALES_COLLECTION, goodSale(1)), rec('shared', BALANCE_SHEET_COLLECTION, OLD_BALANCE_SHEET, 200)],
      'replace',
      null,
    );
    expect(replaceRestoreConfirmMessage(dirty)).toContain('形式が不正で取り込めません');
    expect(replaceRestoreConfirmMessage(dirty)).toContain('形式不正で入れ替えられない');
    expect(restoreResultMessage(dirty, 1, dirty.dropped)).toContain('形式不正');
  });
});
