/**
 * **「正しい行 + 1 欄だけ壊す」走査の契約** (2026-09-24 · パス 441)。
 *
 * 走査そのもの (`__audits__/malformedFieldSweep.audit.ts`) は 13,300 回の描画で
 * 数分かかるので `npm test` には置けない。ここが留めるのは**その走査が
 * 正しい形を作っているか**で、これは純関数なので毎回走らせられる。
 *
 * ## 直した物
 *
 * `docs/REMAINING_WORK.md` は走査の母集団を **281 通り**と記録し、その節は
 * 「**正しい日付 + 1 欄だけ壊れている**という一番現実的な形がどの家系にも無い」
 * を覆うために書かれていた。実測すると **281 は「空の行に 1 欄だけ置いた」組の数**である
 * (143 欄 × 2 方向 = 286 のうち形が受ける 5 組を引いた数)。**正しい行の上**で
 * 1 欄だけ壊すと **175 通り**にしかならない。
 *
 * その差は飾りではない —— 実測 (2026-09-24 · `readableSalesRows` に直接食わせる):
 *
 * | 行 | 残った | 落とした |
 * | --- | ---: | ---: |
 * | `{ note: 42 }` (空の行に 1 欄) | **0** | 1 |
 * | `{ …正しい販売記録, note: 42 }` | **1** | 0 |
 *
 * 空の行は他の必須の欄を全部欠いているので、**読む側の漏斗が読む前に落とす** ——
 * パス 417 の欠陥 (`(e.note ?? '').trim()` が非文字列で投げる) に**届かない**。
 * **覆うために書かれた走査が、覆うはずだった形をそのまま外していた** (法則
 * `measure-before-claim`)。その「投げた画面 0」はこの形についての証拠ではなかった。
 *
 * ## ここで見るもの
 *
 * - 走査の 1 組が**正しい行と 1 欄だけ違う** (2 欄以上動いていたら別の物を測っている)。
 * - **土台そのものは形が受ける** (受けない土台だと、どの欄を壊しても同じ話になる)。
 * - 空の行の形と**数が違う** —— 同じなら片方は要らない。実測の 2 つを床つきで留める。
 * - **6 形すべて**が実際に当たる (2 形だけだと、物・配列が JSX を落とす形と
 *   `null` が `??` を通り抜ける形が 1 度も母集団に入らない —— パス 441 で実測)。
 */
import { describe, expect, it } from 'vitest';
import { COLLECTION_SHAPES, hasCollectionShape } from '../data/collectionShapes';
import { SAMPLES } from '../data/__tests__/collectionSamples';
import { ONE_FIELD_VALUES, oneFieldRow } from './malformedRows';
import { readableSalesRows } from '../data/sales';

/** 正しい行の上で 1 欄だけ壊した組 (走査の母集団と同じ導き方)。 */
function validBaseCombos(): readonly { collection: string; field: string; row: Record<string, unknown> }[] {
  const out: { collection: string; field: string; row: Record<string, unknown> }[] = [];
  for (const collection of Object.keys(COLLECTION_SHAPES)) {
    const good = SAMPLES[collection]?.good as Record<string, unknown> | undefined;
    if (good === undefined) continue;
    for (const field of COLLECTION_SHAPES[collection]!.fields) {
      for (const [, value] of ONE_FIELD_VALUES) {
        const row = oneFieldRow(collection, field, value, good);
        if (row !== null) out.push({ collection, field, row });
      }
    }
  }
  return out;
}

/** 空の行に 1 欄だけ置いた組 (`docs/REMAINING_WORK.md` が記録していた形)。 */
function singleKeyCount(): number {
  let n = 0;
  for (const collection of Object.keys(COLLECTION_SHAPES)) {
    for (const field of COLLECTION_SHAPES[collection]!.fields) {
      for (const [, value] of ONE_FIELD_VALUES) {
        if (!hasCollectionShape(collection, { [field]: value })) n += 1;
      }
    }
  }
  return n;
}

describe('正しい行 + 1 欄だけ壊す (パス 441)', () => {
  it('★ 走査の 1 組は、正しい行と 1 欄だけ違う', () => {
    const combos = validBaseCombos();
    expect(combos.length, '母集団が空 (走査の死)').toBeGreaterThanOrEqual(150);
    for (const { collection, field, row } of combos) {
      const good = SAMPLES[collection]!.good as Record<string, unknown>;
      const changed = Object.keys(row).filter((k) => !Object.is(row[k], good[k]));
      expect(changed, `${collection}.${field}: 動いた欄`).toEqual([field]);
      // 欄の集合そのものは変わらない (欄が増減すると「1 欄だけ」ではなくなる)。
      expect(Object.keys(row).sort()).toEqual(Object.keys(good).sort());
    }
  });

  it('★ 土台そのものは形が受ける (受けない土台なら、どの欄を壊しても同じ話になる)', () => {
    let checked = 0;
    for (const collection of Object.keys(COLLECTION_SHAPES)) {
      const good = SAMPLES[collection]?.good as Record<string, unknown> | undefined;
      if (good === undefined) continue;
      expect(hasCollectionShape(collection, good), `${collection} の標本が形に受からない`).toBe(true);
      checked += 1;
    }
    expect(checked, '標本を持つ collection').toBe(Object.keys(COLLECTION_SHAPES).length);
  });

  it('★ 空の行の形とは別物である —— 数が違う (同じなら片方は要らない)', () => {
    // 実測 (2026-09-24): 空の行 281 / 正しい行 175。`docs/REMAINING_WORK.md` が
    // 記録していた 281 は**空の行**の側で、覆うはずだった形ではなかった。
    const single = singleKeyCount();
    const valid = validBaseCombos().length;
    expect(single, '空の行の組').toBeGreaterThan(valid);
    expect(single).toBeGreaterThanOrEqual(270);
    expect(valid).toBeGreaterThanOrEqual(150);
  });

  it('★ その差が効く —— 空の行は読む側の漏斗が読む前に落とす', () => {
    const good = SAMPLES['sales-entries']!.good as Record<string, unknown>;
    const single = readableSalesRows([{ note: 42 }] as never);
    const based = readableSalesRows([{ ...good, note: 42 } as never]);
    expect(single.rows.length, '空の行は漏斗を通らない').toBe(0);
    expect(based.rows.length, '正しい行 + 1 欄は漏斗を通る (= 読む側に届く)').toBe(1);
    // 針の標本 —— この組が実際に走査の母集団に居る。
    expect(oneFieldRow('sales-entries', 'note', -987654.321, good)).not.toBeNull();
  });

  it('★ 6 形すべてが実際に当たる (どれか 1 つでも当たらなければ、その壊れ方は測っていない)', () => {
    for (const [direction, value] of ONE_FIELD_VALUES) {
      let hit = 0;
      for (const collection of Object.keys(COLLECTION_SHAPES)) {
        const good = SAMPLES[collection]?.good as Record<string, unknown> | undefined;
        if (good === undefined) continue;
        for (const field of COLLECTION_SHAPES[collection]!.fields) {
          if (oneFieldRow(collection, field, value, good) !== null) hit += 1;
        }
      }
      expect(hit, `${direction} がどの欄にも当たらない`).toBeGreaterThanOrEqual(50);
    }
    expect(ONE_FIELD_VALUES.length, '形は 6 つ').toBe(6);
  });

  it('形に無い欄・知らない collection は母集団に入らない', () => {
    const good = SAMPLES['sales-entries']!.good as Record<string, unknown>;
    expect(oneFieldRow('sales-entries', 'nope', 1, good)).toBeNull();
    expect(oneFieldRow('no-such-collection', 'date', 1, good)).toBeNull();
  });
});
