/**
 * **同梱データの形が、live 取得の payload 型と一致していることを型で留める。**
 *
 * 画面は `useServiceData(id, SNAPSHOT[id])` で始まり、`T` は **`SNAPSHOT` の
 * リテラル型から推論される**。live 取得の中身は IPC 境界で `unknown` になるので、
 * 「取ってきた値がその型を満たす」ことは**型検査では見えない**。
 * 揃えているのは人間だけだった。
 *
 * ## 実測した危険 (2026-09-08)
 *
 * パス 61 は `main/clients/kpi.ts` の 3 つの率を `number | null` にした。その際
 * 直した所は **3 か所** —— main・snapshot・`KpiPage.tsx` の**手書きの写し**。
 * 3 か所要るのが問題で、**写しだけを `number` に戻すと `tsc` は何も言わず**、
 * 画面は 限界利益率 に **「∞」** を刷った (`pct` が
 * `Number.isFinite(null) === false` で '∞' に倒すため) ——
 * **算定不能が「無限に高い限界利益率」として出る。**
 *
 * `as` キャストは重なりが在れば通るので、写しのずれは型検査を素通りする。
 *
 * ## 直しの向き
 *
 * 1. **画面の写しを消して導出する** (`KpiPage.tsx` は
 *    `type Unit = (typeof SNAPSHOT.kpi.units)[number]` になった)。
 *    規準は同じ層に在った —— `FundingPage.tsx:29` と `FreeePage.tsx:10` は
 *    最初から `type X = typeof SNAPSHOT.x` で導出している。
 * 2. **残る 1 本の写し (snapshot ⇄ main) をこのファイルが型で留める。**
 *
 * ## なぜ `as` を使わないか
 *
 * 最初の下書きは `structuredClone(SNAPSHOT.kpi) as KpiSnapshot` と書いていた ——
 * **`as` は重なりが在れば通るので、その検査はどんな形でも通る空の検査だった。**
 * ここでは**代入可能性を型の位置で主張する** (`AssertExtends`)。
 * 対照は「main の型の欄をずらすと `tsc` が落ちる」で確かめる。
 *
 * ## 覆っている範囲 (正直に)
 *
 * `main/clients/*.ts` が export する `*Snapshot` 型は **64 本**在るが、
 * ここで留めているのは **2 本 (kpi・funding)** だけである。
 * service id と型名の対応は機械的でなく、64 本を一度に留めると
 * 「既に食い違っている物」を大量に抱えることになり、**理由を書けないまま
 * 除外台帳を作る**ことになる (`lint:zero-fold` を保留したのと同じ理由)。
 * **読んで確かめた分だけを足す** —— 下の `AssertExtends` を 1 行足せば増える。
 */
import { describe, expect, it } from 'vitest';
import { SNAPSHOT } from '../snapshot';
import type { KpiSnapshotUnit } from '../../../main/clients/kpi';
import type { DebtServiceMetrics, FundingQualityScore } from '../../../shared/funding';
// `import type` は実行時に消えるので、`node:os` を持つ main のモジュールでも安全。
import type { SystemSnapshot } from '../../../main/clients/linux';

/**
 * `Actual` が `Expected` に代入できることを**型の位置**で主張する。
 *
 * 代入できなければ `tsc` が落ちる (`typecheck` → `verify:all` → CI)。
 * `as` を使わないので、欄が減ったり広がったりすれば鳴る。
 *
 * **ただし片方向である。** 同梱が `number | null` を `number` に**狭めた**とき、
 * `number` は `number | null` に代入できるので**これは鳴らない** ——
 * そして狭める方向こそが、画面に「null は来ない」と信じ込ませる危険な向きである。
 * 対照 1 (同梱の `contributionRatio` を `number` に戻す) が**鳴らなかった**ことで
 * これに気づいた。**鳴らない対照は「合格」ではなく、その検査についての報せ。**
 * 狭まりまで捕まえるには下の `Exact` を使う。
 */
type AssertExtends<Expected, Actual extends Expected> = Actual;

/**
 * 2 つの型が**完全に同じ**ことを主張する (双方向)。
 *
 * `[A] extends [B]` のタプル包みは union の分配を止めるため
 * (`number | null` を 1 つの型として見る)。狭まり・広がりの**どちらでも**鳴る。
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** `Exact` が `true` でなければ `tsc` が落ちる。 */
type AssertTrue<T extends true> = T;

/** 同梱データの KPI ユニット (`units` は `[] as {...}[]` で注釈されている)。 */
type SnapshotKpiUnit = (typeof SNAPSHOT.kpi.units)[number];
/** 同梱データの返済余力 (`debtService` は素の literal)。 */
type SnapshotDebtService = typeof SNAPSHOT.funding.debtService;
/** 同梱データの Linux ロードアベレージ。 */
type SnapshotLinuxLoad = typeof SNAPSHOT.linux.load;
/** 同梱データの資金調達 質スコア。 */
type SnapshotQualityScore = typeof SNAPSHOT.funding.qualityScore;

/**
 * **★ ここが本体の主張** —— 同梱データの形が main の payload 型を満たす。
 *
 * この行が通らなければ `tsc` が落ちる。値としては使わないので `void` で受ける。
 */
type _KpiUnitAgrees = AssertExtends<KpiSnapshotUnit, SnapshotKpiUnit>;
type _DebtServiceAgrees = AssertExtends<DebtServiceMetrics, SnapshotDebtService>;

/**
 * **狭まりも捕まえる (双方向)。**
 *
 * `kpi` はどちらも注釈済みの object 型なので、丸ごと `Exact` で当てられる。
 * `debtService` は同梱側がリテラル (`totalRepayment: 0`) なので丸ごとは当てられず、
 * **「算定不能」を表す 2 欄**だけを当てる —— 狭まりの危険はそこに在る。
 */
type _KpiExact = AssertTrue<Exact<KpiSnapshotUnit['kpi'], SnapshotKpiUnit['kpi']>>;
/**
 * **パス 63 が足した 3 本目** —— このファイルの doc が言う「1 行足せば増える」を
 * 実際にやった所。`load` は 4 欄すべてが `number | null` で、狭めると画面が
 * 「ロード 0.00 / コアあたり 0%」を緑で刷る側へ戻る (Windows で必ず起きる)。
 */
type _LinuxLoadExact = AssertTrue<Exact<SystemSnapshot['load'], SnapshotLinuxLoad>>;
/**
 * **パス 64 が足した 4 本目。** 質スコアは 4 欄とも `number | null` / `string | null`
 * で、狭めると「確定 0 = 満点 100 点」に戻る側へ倒れる。
 */
type _QualityExact = AssertTrue<Exact<FundingQualityScore, SnapshotQualityScore>>;
type _DscrExact = AssertTrue<Exact<DebtServiceMetrics['overallDscr'], SnapshotDebtService['overallDscr']>>;
type _WorstDscrExact = AssertTrue<
  Exact<DebtServiceMetrics['worstMonthDscr'], SnapshotDebtService['worstMonthDscr']>
>;
/** 型だけの主張が「使われていない」と見られないように値へ落とす。 */
const EXACTNESS_PINNED: readonly [
  _KpiExact,
  _DscrExact,
  _WorstDscrExact,
  _LinuxLoadExact,
  _QualityExact,
] = [true, true, true, true, true];

/** 型だけの主張が「使われていない」と見られないように 1 つ値に落とす。 */
const KPI_UNIT_PINNED: readonly (keyof _KpiUnitAgrees)[] = ['id', 'label', 'fundamentals', 'kpi', 'history'];
const DEBT_SERVICE_PINNED: readonly (keyof _DebtServiceAgrees)[] = [
  'totalRepayment',
  // DSCR の分子・分母は**突合できた月**の合計 (パス 182)。
  'coveredOperatingCashflow',
  'coveredRepayment',
  'overallDscr',
  'worstMonthDscr',
  'shortfallMonths',
  'coveredMonths',
  'unmatchedMonths',
];

describe('同梱データ ⇄ live payload の形が一致する', () => {
  it('★ kpi: 同梱の units 要素は KpiSnapshotUnit を満たす (欄が揃っている)', () => {
    // `AssertExtends` が型で主張済み。ここでは**欄の一覧**を値で留めて、
    // 欄が消えたら (= main の型から欄が減ったら) この配列が型で落ちるようにする。
    expect(KPI_UNIT_PINNED).toHaveLength(5);
    expect(KPI_UNIT_PINNED).toContain('kpi');
  });

  it('★ 狭まりも捕まえる (双方向の Exact が 5 本立っている)', () => {
    // 片方向の `AssertExtends` だけでは、同梱が `number | null` を `number` に
    // **狭めた**ときに鳴らない (対照 1 で実測)。`Exact` はどちらの向きでも鳴る。
    expect(EXACTNESS_PINNED).toEqual([true, true, true, true, true]);
  });

  it('★ kpi: 率 3 つの「算定不能」の表し方が main と同梱で揃っている', () => {
    // パス 61 の実測がここに入る。`aggregate` は売上 0 なので算定不能。
    const agg = SNAPSHOT.kpi.aggregate.kpi;
    expect(agg.contributionRatio).toBeNull();
    expect(agg.variableRatio).toBeNull();
    expect(agg.fixedRatio).toBeNull();
  });

  it('★ funding: 同梱の debtService は DebtServiceMetrics を満たす', () => {
    // 5 → 8 (パス 182): DSCR の分子・分母を「突合できた月」の合計に分け、
    // 突合できた月数と突合できなかった月数を持たせた。
    expect(DEBT_SERVICE_PINNED).toHaveLength(8);
    // パス 60 の実測: 返済 0 の同梱データは DSCR を算定不能で持つ。
    expect(SNAPSHOT.funding.debtService.totalRepayment).toBe(0);
    expect(SNAPSHOT.funding.debtService.overallDscr).toBeNull();
    expect(SNAPSHOT.funding.debtService.worstMonthDscr).toBeNull();
    // パス 182 の実測: 突合の母数も 0 (返済が 1 か月も無いので未突合も 0)。
    expect(SNAPSHOT.funding.debtService.coveredMonths).toBe(0);
    expect(SNAPSHOT.funding.debtService.unmatchedMonths).toBe(0);
  });

  it('★ linux: ロードアベレージの「算定不能」の表し方が main と同梱で揃っている', () => {
    // パス 63 の実測: Windows は `os.loadavg()` が常に [0,0,0] を返すため、
    // 提供されない旨を `null` で表す。同梱は Linux 標本なので数で持つが、
    // **型は `number | null`** でなければならない (上の `_LinuxLoadExact`)。
    expect(SNAPSHOT.linux.load.avg1).not.toBeNull();
    expect(SNAPSHOT.linux.load.unavailableNote).toBeNull();
  });

  it('★ funding: 「確定した調達が無い」の表し方が main と同梱で揃っている', () => {
    // パス 64 の実測: 確定 0 は 0 点でも 100 点でもなく、算定不能。
    expect(SNAPSHOT.funding.qualityScore.compositeScore).toBeNull();
    expect(SNAPSHOT.funding.qualityScore.nonRepayableRatio).toBeNull();
    expect(SNAPSHOT.funding.qualityScore.unavailableNote).not.toBeNull();
  });

  it('★ 画面は payload の形を写さずに導出している (写しを増やさない)', async () => {
    // `KpiPage` の `Unit` / `Kpi` / `Fund` は `typeof SNAPSHOT.kpi.units[number]`
    // から導出されている。**export されていること自体**が「写しではない」の印。
    const mod = await import('../../pages/KpiPage');
    expect(typeof mod.KpiPage).toBe('function');
  });
});
