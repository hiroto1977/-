/** @vitest-environment jsdom */
/**
 * **正しい行 + 1 欄だけ壊す走査** —— 定期点検の道具 (2026-09-24 · パス 441)。
 *
 * `npm test` には置かない (実測で 175 通り × 74 画面 = 12,950 回の描画)。
 * だから既定の `include` (`src/**‍/__tests__/**‍/*.test.ts`) の外に置き、
 * `vitest.audit.config.ts` だけが拾う。走らせ方は `npm run audit:malformed-fields`。
 *
 * ## なぜ要るのか
 *
 * `__tests__/malformedStoreRenders.test.ts` (パス 360) の 4 家系はどれも
 * **行の全欄**を壊す。パス 417 の欠陥 (販売記録のメモが非文字列で売上集計と
 * 経営サマリーが投げる) はその外に居て、対照であの機械は **9 件すべて緑のまま**だった。
 *
 * ## `docs/REMAINING_WORK.md` に載っていた走査は、この形ではなかった (パス 441 で測った)
 *
 * あの節は母集団を **281 通り**と記録している。実測すると **281 は
 * 「空の行に 1 欄だけ置いた」組の数**である (143 欄 × 2 方向 = 286 のうち
 * 形が受ける 5 組を引いた数)。正しい行の上で 1 欄だけ壊すと **175 通り**にしかならない。
 *
 * つまりあの走査の行は**他の必須の欄を全部欠いて**おり、読む側の漏斗が
 * 読む前に落とす。実測 (2026-09-24 · `readableSalesRows` に直接食わせる):
 *
 * | 行 | 残った | 落とした |
 * | --- | ---: | ---: |
 * | `{ note: 42 }` (空の行に 1 欄) | **0** | 1 |
 * | `{ …正しい販売記録, note: 42 }` | **1** | 0 |
 *
 * **覆うために書かれた走査が、覆うはずだった形をそのまま外していた** ——
 * その「投げた画面 0」は、この形についての証拠ではなかった。
 *
 * ## 初回実行が 3 件見つけた (2026-09-24)
 *
 * ```
 * kpi-actuals.unit (num) → kpi:      TypeError: a.unit.trim is not a function
 * kpi-actuals.unit (num) → overview: TypeError: a.unit.trim is not a function
 * kpi-budgets.unit (num) → kpi:      TypeError: a.unit.trim is not a function
 * ```
 *
 * `actualKey` が保管値の事業名に `.trim()` を**素で**呼んでおり、KPI / BEP と
 * 経営サマリーの**両方が開けなくなる** —— 開けない画面からその行は消せない
 * (法則 `escape-hatch-stays-open`)。直しは `kpiUnitText` (型から始める 1 つの口) で、
 * 検査は `pages/__tests__/storedKpiUnitReads.test.ts`。
 *
 * ## ここで見るもの
 *
 * collection ごとに**正しい標本**を 1 つ置き、欄を 1 つだけ **6 形**に壊して
 * 形が拒む組だけを残し、1 組ごとに**74 画面** (`SERVICES` の全件) を素で描いて
 * 投げた画面を数える。**2 形では足りない** —— `.trim` / `.toFixed` を落とすのは
 * 数と文字列だが、**物と配列は JSX が「Objects are not valid as a React child」で
 * 落とし**、`null` は `??` を通り抜けた先で `.trim` を落とす (パス 441 で実測)。
 *
 * ## 6 形で初めて通した結果 (2026-09-24 · パス 442)
 *
 * `組 726 × 画面 74 = 53,724 回の描画`・**投げた画面 4 件** —— どれも
 * **物を React の子として素で置いた**形で、2 形の標本では構造的に届かなかった:
 *
 * ```
 * business-units.name       (obj) → overview
 * sales-entries.date        (obj) → sales
 * sales-entries.orders      (obj) → sales
 * shigyo-consultations.date (obj) → tax-accountant
 * ```
 *
 * **配列は投げない** —— React は `[1]` を子の一覧として描く (記録しておく:
 * 「6 形すべてが同じ強さ」ではない)。
 *
 * ## 1 行では見えない物が在る (パス 442 で 1 件出た)
 *
 * だから **良い行 + 壊れた行の 2 行**を置く。理由はコードの中の注記に。
 * それでも見えない家系は残る (測って書く):
 *
 * - **`App.tsx` が描く部品** (`ManualDataSection` ほか) —— ここは
 *   `svc.page` を単独で描くので、目録つきの全画面に載る部品は 1 度も通らない
 *   (パス 419 が同じ死角を記録している)。
 * - **投げない嘘** —— `Intl.NumberFormat#format` は何を渡しても投げないので、
 *   `￥NaN` / `￥0` / 桁違いはこの網に掛からない (パス 442 で実測・別の検査が持つ)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICES } from '../services';
import { COLLECTION_SHAPES } from '../data/collectionShapes';
import { SAMPLES } from '../data/__tests__/collectionSamples';
import { ONE_FIELD_VALUES, oneFieldRow } from '../__tests__/malformedRows';
import { getRecordStore } from '../data/store';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from '../__tests__/recordStoreHarness';
import { installPageRenderGlobals, renderPageFailure } from '../__tests__/pageRenderHarness';

/** 走査の 1 組: どの collection のどの欄を、どちら向きに壊したか。 */
interface Combo {
  readonly collection: string;
  readonly field: string;
  readonly direction: string;
  readonly row: Record<string, unknown>;
}

/** 母集団は形の台帳から導く (手書きの一覧を置かない)。 */
export function sweepCombos(): readonly Combo[] {
  const out: Combo[] = [];
  for (const collection of Object.keys(COLLECTION_SHAPES)) {
    const good = SAMPLES[collection]?.good as Record<string, unknown> | undefined;
    if (good === undefined) continue;
    for (const field of COLLECTION_SHAPES[collection]!.fields) {
      for (const [direction, value] of ONE_FIELD_VALUES) {
        const row = oneFieldRow(collection, field, value, good);
        if (row !== null) out.push({ collection, field, direction, row });
      }
    }
  }
  return out;
}

let host: HTMLDivElement;

beforeAll(() => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
});

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

describe('正しい行 + 1 欄だけ壊す走査 (パス 441)', () => {
  it(
    '★ どの組でも、どの画面も投げない',
    async () => {
      const combos = sweepCombos();
      // 床 —— 走査が死んで「0 件だから健全」にならないため。
      expect(combos.length, '母集団が空').toBeGreaterThanOrEqual(150);
      const threw: string[] = [];
      const store = getRecordStore();
      for (const combo of combos) {
        await resetRecordStore();
        _resetCollectionSubscribersForTests();
        // **良い行を先に、壊れた行を後に置く** (2026-09-24 · パス 442)。
        // `Array.prototype.sort` は**要素が 1 つなら比較関数を呼ばない**ので、
        // 1 行だけ置く走査は並べ替えの中の読みを**構造的に見られない**。
        // 実際 `sortBusinessUnits` の `a.data.name.localeCompare(...)` は
        // 5 形すべてで投げるのに、パス 441 の走査は 1 件も報告しなかった。
        // 並びは V8 が `comparefn(arr[1], arr[0])` から始めるので、
        // 壊れた行が比較関数の左に立つ**後ろ**に置く。
        await store.insert(combo.collection, SAMPLES[combo.collection]!.good as Record<string, unknown>);
        await store.insert(combo.collection, combo.row);
        for (const svc of SERVICES) {
          _resetCollectionSubscribersForTests();
          const failure = await renderPageFailure(host, svc.page as () => unknown);
          if (failure !== null) {
            threw.push(`${combo.collection}.${combo.field} (${combo.direction}) → ${svc.id}: ${failure}`);
          }
        }
      }
      console.log(`[audit] 組 ${combos.length} × 画面 ${SERVICES.length} = ${combos.length * SERVICES.length} 回の描画`);
      expect(threw, threw.slice(0, 20).join('\n')).toEqual([]);
    },
    3_600_000,
  );
});
