/**
 * **変異検査の「生存」が観測できないものだったことを、実測で留める** (2026-09-22 · パス 399)。
 *
 * ## 経緯 (数字はすべて実測)
 *
 * `src/shared/hydroponicsControl.ts` は `stryker.config.json` の `mutate` の外に居る
 * (`mutateScopeCensus` の `measure-next`)。パス 398 で調製の関門に振る舞いの検査が
 * 付いたので測った —— **67.15% / 覆われた分 68.20%・Killed 652 / Survived 304 /
 * NoCoverage 15 / Timeout 0**・973 変異体・38 分 17 秒。
 *
 * 生の「生存」は信用しない (パス 356 / 357 の実測: ad-hoc の生存 61 件のうち 58 件が偽)。
 * `npm run audit:survivors -- … --top=10` に通すと **10 件のうち 7 件が偽**
 * (既存の検査が殺す) で、**3 件が「本当に生存」**と出た:
 *
 *   - `:296` ConditionalExpression / EqualityOperator —— `batchId !== ''` の判定
 *   - `:992` BooleanLiteral —— `overdue()` の「期限が無い」枝の `late: false`
 *
 * ## ★ その 3 件は**下流では観測できない** (実測で確定した)
 *
 * | 測った物 | 結果 |
 * | --- | --- |
 * | `batchId` が `''` / `null` / 未知の `'zzz'` | **`dailyTasks` も `summarize` も JSON が完全一致** |
 * | `batchSchedule` を 15 通りの播種・定植日に当てる | 日程 14 件 / `null` 1 件・**予定日が `null` になった回数 0** |
 *
 * 理由は 2 つとも「呼び手の形」に在る:
 *
 * 1. `batchId` を読むのは `cropForBatchId` (と `HydroponicsPage:207`) だけで、
 *    どちらも `null` なら既定・それ以外は `find` して**外れたら同じ既定**へ落ちる。
 *    つまり `''` と未知の id と `null` は**同じ答え**になる。
 * 2. `overdue(today, due)` の `due === null` の枝は 4 つの呼び手から届くが、
 *    **2 つは型で `null` を渡せず** (`BatchSchedule.transplantDue` / `harvestDue` は
 *    `string`)、**残り 2 つは `.late` を読む前に `!== null` を再確認する**。
 *
 * **だから `audit:survivors` の「本当に生存」は「どの検査も落ちない」しか意味しない** ——
 * 「観測できるのに誰も主張していない」ではない。**第 3 の区分 (等価) が要る**、というのが
 * この日の学びである (`verify-survivors.cjs` の docblock に書いた)。
 *
 * ## ★★ ところが「下流で等価」は「殺せない」ではなかった (対照で分かった)
 *
 * 対照を 5 方向回して、**`:296` の 2 変異体はこの検査が全部殺す**ことが分かった ——
 * 下流 (`dailyTasks` / `summarize`) では区別できないが、**正規化そのものは
 * `readingFromStored` の返り値として直接主張できる**。実測:
 *
 * | 対照 | 落ちた検査 |
 * | --- | --- |
 * | A `!== ''` を外す (= ConditionalExpression → true) | 空文字は null に畳む |
 * | D ConditionalExpression → false | 非空はそのまま持つ |
 * | E EqualityOperator `!==` → `===` | **上の 2 件とも** |
 * | B 予定日が `null` を取りうる | 予定日は必ず string |
 * | C `overdue` を常に late | 期限が未来なら作業は出ない |
 *
 * **本当に殺せないのは `:992` の 1 件だけ**である (そこには理由つきの pragma を
 * 実物へ書いた)。つまり「生存 → 等価 → 諦める」ではなく、**まず「宣言の側から
 * 主張できないか」を試す**のが順序で、3 件のうち 2 件はそれで殺せた。
 *
 * ## この検査が留める物
 *
 * 等価であることは**呼び手の形に依っている**ので、形が変われば生きた欠陥になる。
 * いちばん危ないのは 2 の側で、`transplantDue` / `harvestDue` を `string | null` に
 * 広げた日、`if (o.late)` だけの 2 か所が
 * **「定植する —— 定植予定 null を過ぎています」**を出し始める。だから
 * 「予定日は常に読める文字列」を機械で持つ。
 */
import { describe, expect, it } from 'vitest';
import { HYDROPONIC_CROPS } from '../hydroponics';
import { DEFAULT_CROP_LIST } from '../hydroponicCrops';
import {
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_DOSING_SETUP,
  DEFAULT_ENVIRONMENT_TARGETS,
  batchSchedule,
  dailyTasks,
  readingFromStored,
  summarize,
  type ControlInput,
  type CultivationBatch,
  type HydroponicReading,
} from '../hydroponicsControl';

const CROP = HYDROPONIC_CROPS['leaf-lettuce'];

const reading = (batchId: string | null): HydroponicReading => ({
  at: '2026-09-13',
  values: {
    ec: 1.0, ph: 6.0, waterTempC: 20, airTempC: 22,
    humidityPct: 70, co2Ppm: 900, dissolvedOxygenMgL: 7, waterLevelPct: 90,
  },
  batchId,
  note: '',
});

const inp = (over: Partial<ControlInput> = {}): ControlInput => ({
  today: '2026-09-13',
  crops: DEFAULT_CROP_LIST,
  batches: [],
  readings: [],
  targets: DEFAULT_ENVIRONMENT_TARGETS,
  dosing: DEFAULT_DOSING_SETUP,
  settings: DEFAULT_CONTROL_SETTINGS,
  ...over,
});

const batch = (over: Partial<CultivationBatch> = {}): CultivationBatch => ({
  id: 'b1',
  cropId: CROP.id,
  sowDate: '2026-09-01',
  panels: 1,
  state: 'nursery',
  transplantedDate: null,
  harvestedDate: null,
  solutionChangedDate: null,
  note: '',
  ...over,
});

describe('読んだ保存値の batchId', () => {
  it('★ 空文字は null に畳む (:296 の判定が生きている)', () => {
    const r = readingFromStored({ at: '2026-09-13', values: {}, batchId: '', note: '' });
    expect(r).not.toBeNull();
    expect(r?.batchId).toBeNull();
  });

  it('非空の文字列はそのまま持つ (畳みすぎていない)', () => {
    const r = readingFromStored({ at: '2026-09-13', values: {}, batchId: 'b1', note: '' });
    expect(r?.batchId).toBe('b1');
  });

  it('★ 空文字・未知の id・null は下流で同じ答えになる (:296 の生存が等価である理由)', () => {
    const answer = (id: string | null): string =>
      JSON.stringify({
        tasks: dailyTasks(inp({ readings: [reading(id)] })),
        summary: summarize(inp({ readings: [reading(id)] })),
      });
    const none = answer(null);
    expect(answer(''), '空文字').toBe(none);
    expect(answer('zzz'), '未知の id').toBe(none);
    // 走査が空虚でないこと —— 答えそのものが空の器ではない。
    expect(none.length).toBeGreaterThan(50);
  });
});

describe('工程の予定日は「読める文字列」だけ', () => {
  /**
   * **これが等価を支えている柱である。** `dailyTasks` の 2 か所
   * (`state: 'nursery'` の定植・`'growing'` の収穫) は `overdue()` の結果を
   * `if (o.late)` だけで見ており、`due` が `null` かを再確認しない。
   * 予定日が `null` を取りうるようになった日、その 2 か所は
   * 「定植予定 null を過ぎています」を出し始める。
   */
  it('★ 日程が返るなら予定日は必ず string (播種日・定植日を広く振る)', () => {
    let built = 0;
    let folded = 0;
    for (const sowDate of ['1970-01-01', '2026-01-01', '2026-06-15', '2026-12-31', '2999-12-31']) {
      for (const transplantedDate of [null, sowDate, '2027-01-01']) {
        const s = batchSchedule(batch({ sowDate, transplantedDate }), CROP);
        if (s === null) {
          folded += 1;
          continue;
        }
        built += 1;
        expect(typeof s.transplantDue, `${sowDate}/${String(transplantedDate)} の定植予定`).toBe('string');
        expect(typeof s.harvestDue, `${sowDate}/${String(transplantedDate)} の収穫予定`).toBe('string');
        expect(s.transplantDue.length).toBe(10);
        expect(s.harvestDue.length).toBe(10);
      }
    }
    // 走査が空虚でない床 (両方の枝に入っている)。
    expect(built, '日程が返った回数').toBeGreaterThanOrEqual(10);
    expect(folded, '畳んだ回数').toBeGreaterThanOrEqual(1);
  });

  /*
   * ★ **`:992` の `late: false` は検査では守れない (等価なので)。**
   *
   * 最初はここに「期限の無い作業を『遅れ』と言わない (`:992` の枝が観測される
   * 唯一の道)」と題をつけた検査を書いたが、**題が中身より広かった** ——
   * 実際に組めるのは「期限が**未来**なら作業は出ない」で、それは `due` が
   * `null` ではない枝である。`due === null` の枝は 4 つの呼び手から届くが、
   * 型で渡せない 2 つと、`.late` を読む前に `!== null` を再確認する 2 つしか
   * 無いので、**どの入力からも観測できない**。だから題を実測どおりに直し、
   * `:992` には理由つきの pragma を実物へ書き残した (パス 351 と同じ形)。
   */
  it('期限が未来なら養液交換の作業は出ない (due が非 null の枝)', () => {
    const future = inp({
      today: '2026-09-13',
      batches: [batch({ state: 'growing', solutionChangedDate: '2026-09-12' })],
    });
    const ids = dailyTasks(future).map((t) => t.id);
    expect(ids.filter((id) => id.endsWith(':solution-change'))).toEqual([]);
  });

  it('期限を過ぎていれば養液交換の作業が出る (対照 —— 上が空虚でない)', () => {
    const late = inp({
      today: '2026-11-13',
      batches: [batch({ state: 'growing', solutionChangedDate: '2026-09-12' })],
    });
    const ids = dailyTasks(late).map((t) => t.id);
    expect(ids.filter((id) => id.endsWith(':solution-change'))).toHaveLength(1);
  });
});
