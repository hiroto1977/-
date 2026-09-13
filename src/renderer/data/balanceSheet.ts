/**
 * 貸借対照表 (BS) ベースの財政状態指標 — 経営管理 (FP&A) の財務分析。
 *
 * 流動/固定の資産・負債と当期純利益から、自己資本比率・流動比率・当座比率・
 * ROA・ROE・固定比率を算出する純粋ロジック。BS は時点情報なので 1 レコード
 * (最新のみ) を `balance-sheet` コレクションに保存する。本モジュールは IO を
 * 持たない (呼び出し側が record store から渡す)。
 *
 * **重要 — これは概算の財務分析であり、財務助言ではありません。** しきい値は
 * 中小企業の一般的な目安で、業種・規模で適正値は異なります。
 */

import { isCalendarDateOrMonth } from '../../shared/isoDate';
import { latestRecord } from './latestRecord';

export const BALANCE_SHEET_COLLECTION = 'balance-sheet';

/**
 * 貸借対照表の入力 (円)。純資産は資産−負債で導出するため入力しない。
 *
 * ## 内数 5 欄は任意で、未入力は `undefined` —— 0 に倒さない (2026-09-07)
 *
 * 現預金・棚卸資産・売上債権・仕入債務・有利子負債は流動資産/流動負債の**内数**で、
 * 入力欄を空にしたまま保存できる。**`0` と `undefined` は別の意味である** ——
 * `0` は「現金商売なので売上債権は無い」という実測、`undefined` は「まだ入れて
 * いない」。以前はこの 2 つを入力の境界 (`parseBalanceSheet`) で 0 に潰していて、
 * 空欄のまま保存した控えが**最良の運転資金**を報告していた (実測 2026-09-07・
 * KPI 月商 400 万 × 3 か月):
 *
 * | 控えの状態 | 売上債権 | DSO | DIO | DPO | CCC |
 * | --- | --- | --- | --- | --- | --- |
 * | 4 欄を空欄で保存 (画面の既定) | 0 | 0 日 | 0 日 | 0 日 | **0 日** |
 * | 欄そのものが無い (古い版の控え) | 0 | 0 日 | 0 日 | 0 日 | **0 日** |
 * | 本当に 0 (現金商売) | 0 | 0 日 | 0 日 | 0 日 | **0 日** |
 * | 埋めてある | 200 万 | 60.8 日 | 60.8 日 | 68.4 日 | 53.2 日 |
 *
 * CCC 0 日は「即日回収・即日支払」で、`managementHighlights` は
 * 「仕入の支払より先に回収できています」と**良い所見**を出し、スコアカードの
 * 効率性にも満点近くで加点され、金融機関等へ出す書面の §5 にも印刷されていた。
 * 当座比率も同じ形で緩む (棚卸資産 0 → 当座比率 = 流動比率)。
 *
 * いまは未入力を `undefined` のまま通し、**読む側がそれぞれ「算定不能」を選ぶ**。
 * 0 を算定不能にしてはいけない —— 現金商売の DSO 0 日は正しく有用な数字である。
 */
export interface BalanceSheet extends Record<string, unknown> {
  /** 基準日ラベル (任意, 例 "2026-03-31")。 */
  readonly asOf: string;
  readonly currentAssets: number;
  /** 現預金 (流動資産の内数。資金ランウェイに使う)。任意 — 未入力は undefined。 */
  readonly cash?: number;
  /** 棚卸資産 (流動資産の内数。当座比率・CCC に使う)。任意 — 未入力は undefined。 */
  readonly inventory?: number;
  /** 売上債権 (流動資産の内数。CCC の DSO に使う)。任意 — 未入力は undefined。 */
  readonly accountsReceivable?: number;
  readonly fixedAssets: number;
  readonly currentLiabilities: number;
  /** 仕入債務 (流動負債の内数。CCC の DPO に使う)。任意 — 未入力は undefined。 */
  readonly accountsPayable?: number;
  readonly fixedLiabilities: number;
  /**
   * 有利子負債 (借入金・社債等。流動・固定負債の内数)。任意 — 未入力は undefined。
   * 有利子負債比率・ネットデットに使う。
   */
  readonly interestBearingDebt?: number;
  /** 当期純利益 (損失はマイナス可)。ROA・ROE に使う。 */
  readonly netIncome: number;
}

/** BS から導出した財政状態指標。比率は算定不能なら null。 */
export interface BalanceSheetMetrics {
  readonly totalAssets: number;
  readonly totalLiabilities: number;
  /** 純資産 (自己資本) = 総資産 − 総負債。マイナスは債務超過。 */
  readonly netAssets: number;
  /** 自己資本比率 (%) = 純資産 ÷ 総資産。 */
  readonly equityRatioPct: number | null;
  /** 流動比率 (%) = 流動資産 ÷ 流動負債。200% 以上が目安。 */
  readonly currentRatioPct: number | null;
  /**
   * 当座比率 (%) = (流動資産 − 棚卸資産) ÷ 流動負債。100% 以上が目安。
   * **棚卸資産が未入力なら null** (0 と読むと流動比率と同じ値になってしまう)。
   */
  readonly quickRatioPct: number | null;
  /** 総資産利益率 ROA (%) = 当期純利益 ÷ 総資産。 */
  readonly roaPct: number | null;
  /** 自己資本利益率 ROE (%) = 当期純利益 ÷ 純資産 (純資産が正のときのみ)。 */
  readonly roePct: number | null;
  /** 固定比率 (%) = 固定資産 ÷ 純資産 (純資産が正のときのみ)。100% 以下が目安。 */
  readonly fixedRatioPct: number | null;
  /** 債務超過 (純資産がマイナス) か。 */
  readonly insolvent: boolean;
}

/** 検証 + coerce。資産・負債は 0 以上、当期純利益は損失も許容 (マイナス可)。 */
export function parseBalanceSheet(input: {
  asOf?: unknown;
  currentAssets?: unknown;
  cash?: unknown;
  inventory?: unknown;
  accountsReceivable?: unknown;
  fixedAssets?: unknown;
  currentLiabilities?: unknown;
  accountsPayable?: unknown;
  fixedLiabilities?: unknown;
  interestBearingDebt?: unknown;
  netIncome?: unknown;
}): BalanceSheet {
  // Number(number)===number なので typeof 分岐は不要 (簡約して equivalent mutant を排除)。
  const nonNeg = (v: unknown, label: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label}は 0 以上の数値で入力してください`);
    return n;
  };
  // Number('')===0 なので '' の特別扱いは不要。null/undefined のみ 0 に寄せる。
  const finite = (v: unknown, label: string): number => {
    const n = Number(v == null ? 0 : v);
    if (!Number.isFinite(n)) throw new Error(`${label}は数値で入力してください`);
    return n;
  };
  const asOf = typeof input.asOf === 'string' ? input.asOf.trim() : '';
  // 基準日: 未入力 ('') は許す。書くなら暦に在る `YYYY-MM-DD` か `YYYY-MM` (パス 115 —— それまでは
  // 何も見ずに保存し、`2026/3/31` と書けば鮮度の判定 (`balanceSheetFreshness`) が黙って null になった)。
  if (asOf !== '' && !isCalendarDateOrMonth(asOf)) {
    throw new Error('基準日は暦に在る日付 (YYYY-MM-DD または YYYY-MM) で入力してください');
  }
  /**
   * 内数の任意欄。**空欄は `undefined` のまま返す** (0 に倒さない。理由は型の説明)。
   *
   * `''` の判定はここで**要る** —— 画面の入力欄は未入力を `''` で渡してくるので、
   * `Number('')===0` に任せると空欄が「0 円と実測した」に化ける。空白だけ (`'  '`)
   * も同じ扱い (`Number('  ')` も 0 になるため trim してから見る)。
   */
  const optNonNeg = (v: unknown, label: string): number | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'string' && v.trim() === '') return undefined;
    return nonNeg(v, label);
  };
  /**
   * 内数が親項目を超えていないか。未入力 (undefined) は照合しない。
   *
   * `v !== undefined` は**実行時には冗長**である —— `undefined > n` は常に false
   * なので、外しても振る舞いは変わらない (等価変異)。型検査が
   * `number | undefined` と `number` の比較を許さないので残している。
   */
  const atMost = (v: number | undefined, limit: number, message: string): void => {
    // Stryker disable next-line ConditionalExpression: undefined > n は常に false なので実行時は等価 (型検査のために残す)
    if (v !== undefined && v > limit) throw new Error(message);
  };
  const currentAssets = nonNeg(input.currentAssets, '流動資産');
  const cash = optNonNeg(input.cash, '現預金');
  const inventory = optNonNeg(input.inventory, '棚卸資産');
  const accountsReceivable = optNonNeg(input.accountsReceivable, '売上債権');
  const currentLiabilities = nonNeg(input.currentLiabilities, '流動負債');
  const accountsPayable = optNonNeg(input.accountsPayable, '仕入債務');
  const fixedLiabilities = nonNeg(input.fixedLiabilities, '固定負債');
  const interestBearingDebt = optNonNeg(input.interestBearingDebt, '有利子負債');
  atMost(cash, currentAssets, '現預金は流動資産以下で入力してください');
  atMost(inventory, currentAssets, '棚卸資産は流動資産以下で入力してください');
  atMost(accountsReceivable, currentAssets, '売上債権は流動資産以下で入力してください');
  atMost(accountsPayable, currentLiabilities, '仕入債務は流動負債以下で入力してください');
  atMost(
    interestBearingDebt,
    currentLiabilities + fixedLiabilities,
    '有利子負債は負債合計以下で入力してください',
  );
  return {
    asOf,
    currentAssets,
    cash,
    inventory,
    accountsReceivable,
    fixedAssets: nonNeg(input.fixedAssets, '固定資産'),
    currentLiabilities,
    accountsPayable,
    fixedLiabilities,
    interestBearingDebt,
    netIncome: finite(input.netIncome, '当期純利益'),
  };
}

const pct = (numer: number, denom: number): number | null =>
  denom > 0 ? Math.round((numer / denom) * 1000) / 10 : null;

/** BS から財政状態指標を計算する。 */
/**
 * 保存された 1 件を `BalanceSheet` の形に整える (**読み取りの境界**)。
 *
 * なぜ要るか (2026-09-06): 復元の形の検査 (`data/collectionShapes.ts`) は
 * `balance-sheet` の `inventory` / `accountsReceivable` / `accountsPayable` /
 * `cash` / `interestBearingDebt` を**任意**にしている (前方互換)。型はこのうち
 * 前 3 つを**必須**と言っていたので、欄の無い控え (古い版・手で直した JSON・別の
 * 道具が書いた控え) が復元を通ると型が嘘になり、`computeBalanceSheetMetrics` の
 * 足し算が **NaN** になった。行き先は経営サマリーのタイルと**金融機関等へ出す書面**で、
 * 「¥NaN」や NaN の純資産が印刷される。
 *
 * 2026-09-07 に型を復元の形へ合わせ (内数 5 欄はすべて任意)、**未入力は `undefined`
 * のまま返す**ようにした。0 に倒すのは入力側と揃った約束だったが、その約束自体が
 * 「空欄」と「実測した 0」を潰していた (経緯は `BalanceSheet` の説明)。NaN は
 * 各指標が `undefined` を**算定不能**として扱うことで防ぐ —— 合計に混ぜない。
 *
 * **null は null のまま返す** (`balanceSheetOrNull`) —— 「まだ 1 件も入れていない」を
 * ゼロの貸借対照表に化けさせると、画面が「―」ではなく 0 円を断言してしまう。
 */
export function normalizeBalanceSheet(raw: unknown): BalanceSheet {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  /**
   * 有限の数か。**判定を 1 か所に置く** (必須の欄は 0 へ、任意の欄は「無い」へ倒す)。
   *
   * `typeof v === 'number'` は実行時には冗長 —— `Number.isFinite` は数値以外を
   * 型変換せずに false にするので、外しても振る舞いは変わらない (等価変異)。
   * `v is number` の絞り込みを型検査に伝えるために残している。
   * (`&&` を `||` に替える変異は別で、NaN がそのまま残るので検査が留めてある。)
   */
  // Stryker disable next-line ConditionalExpression: Number.isFinite が数値以外を false にするので実行時は等価 (型の絞り込みのために残す)
  const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const num = (v: unknown): number => (isFiniteNumber(v) ? v : 0);
  const opt = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);
  return {
    asOf: typeof r.asOf === 'string' ? r.asOf : '',
    currentAssets: num(r.currentAssets),
    cash: opt(r.cash),
    inventory: opt(r.inventory),
    accountsReceivable: opt(r.accountsReceivable),
    fixedAssets: num(r.fixedAssets),
    currentLiabilities: num(r.currentLiabilities),
    accountsPayable: opt(r.accountsPayable),
    fixedLiabilities: num(r.fixedLiabilities),
    interestBearingDebt: opt(r.interestBearingDebt),
    netIncome: num(r.netIncome),
  };
}

/** 控えが無ければ null、在れば整えて返す (未入力とゼロを混ぜない)。 */
export function balanceSheetOrNull(raw: unknown): BalanceSheet | null {
  return raw === null || raw === undefined ? null : normalizeBalanceSheet(raw);
}

export function computeBalanceSheetMetrics(bs: BalanceSheet): BalanceSheetMetrics {
  const totalAssets = bs.currentAssets + bs.fixedAssets;
  const totalLiabilities = bs.currentLiabilities + bs.fixedLiabilities;
  const netAssets = totalAssets - totalLiabilities;
  return {
    totalAssets,
    totalLiabilities,
    netAssets,
    equityRatioPct: pct(netAssets, totalAssets),
    currentRatioPct: pct(bs.currentAssets, bs.currentLiabilities),
    // 棚卸資産が未入力なら**算定不能**。0 に倒すと当座比率が流動比率と同じ値を
    // 名乗る —— より厳しいはずの指標が緩い側の数字になる (空欄で保存した控えでは必ず)。
    quickRatioPct:
      bs.inventory === undefined
        ? null
        : pct(bs.currentAssets - bs.inventory, bs.currentLiabilities),
    roaPct: pct(bs.netIncome, totalAssets),
    // pct は denom>0 のときだけ値を返し、それ以外は null。netAssets<=0 は pct 側で
    // null になるため外側の `netAssets > 0 ?` ガードは冗長 (削除して equivalent mutant を排除)。
    roePct: pct(bs.netIncome, netAssets),
    fixedRatioPct: pct(bs.fixedAssets, netAssets),
    insolvent: netAssets < 0,
  };
}

// ===========================================================================
// round 74: 貸借対照表の精緻化 (加算的) — 既存式・既存テスト期待値は不変。
// 運転資本 / 自己資本健全度 / 負債構成 / 流動性段階 / 純資産の質 を追加。
// すべて純粋関数。分母 0・負・非有限は null / 専用ラベルでガードする。
// **重要 — 概算の財務分析であり財務助言ではありません。** しきい値は中小企業の
// 一般的な目安で、業種・規模により適正値は異なります。
// ===========================================================================

/** 自己資本健全度の区分。 */
export type EquityHealthGrade =
  | 'excellent' // 自己資本比率 50% 以上
  | 'good' // 30% 以上 50% 未満
  | 'adequate' // 10% 以上 30% 未満
  | 'thin' // 0% 超 10% 未満
  | 'insolvent'; // 0% 以下 (債務超過)

/** 流動性 3 指標の総合段階。 */
export type LiquidityStage =
  | 'strong' // 当座比率 100% 以上 (即時の支払余力が十分)
  | 'sound' // 流動比率 100% 以上 (当座比率 100% 未満、または棚卸資産が未入力で当座比率が算定不能)
  | 'tight' // 流動比率 100% 未満
  | 'unknown'; // 流動負債 0 などで算定不能

/** 純資産の質。 */
export type NetAssetQuality =
  | 'sound' // 純資産が正
  | 'breakeven' // 純資産がちょうど 0
  | 'insolvent'; // 純資産が負 (債務超過)

/** round 74 で追加する精緻化指標 (BS の深掘り)。比率は %、金額は円。 */
export interface BalanceSheetInsights {
  /** 運転資本 = 流動資産 − 流動負債 (円。常に算定可。負は資金繰り注意)。 */
  readonly workingCapital: number;
  /** 運転資本比率 (%) = 運転資本 ÷ 流動資産 (流動資産 0 なら null)。 */
  readonly workingCapitalRatioPct: number | null;
  /** 自己資本健全度の区分 (自己資本比率ベース)。 */
  readonly equityHealth: EquityHealthGrade;
  /** 固定長期適合率 (%) = 固定資産 ÷ (純資産 + 固定負債)。100% 以下が目安。分母 0/負なら null。 */
  readonly fixedLongTermFitPct: number | null;
  /**
   * 有利子負債比率 (%) = 有利子負債 ÷ 総資産。
   * **有利子負債が未入力なら null** (「借入依存ゼロ」と言わない)。総資産 0 でも null。
   */
  readonly interestBearingDebtRatioPct: number | null;
  /** 負債比率 / D/E レシオ (%) = 総負債 ÷ 純資産 (純資産が正のときのみ)。 */
  readonly debtToEquityPct: number | null;
  /**
   * ネットデット = 有利子負債 − 現預金 (円。負は実質無借金=ネットキャッシュ)。
   * **有利子負債と現預金の両方が入っているときだけ算定する** —— 片方でも欠けると
   * 差は決まらない (0 に倒すと「実質無借金」という都合の良い答えが必ず出る)。
   */
  readonly netDebt: number | null;
  /** ネットキャッシュ (ネットデットが 0 以下) か。算定不能なら null。 */
  readonly netCashPositive: boolean | null;
  /** 流動性段階の総合判定。 */
  readonly liquidityStage: LiquidityStage;
  /** 純資産の質。 */
  readonly netAssetQuality: NetAssetQuality;
  /**
   * 実質債務超過 (純資産は正だが、有利子負債が現預金 + 換金性の高い資産を上回り
   * 純資産を食い潰している懸念) フラグ。ここでは「純資産が正かつネットデットが
   * 純資産を超える」を簡易シグナルとする (概算)。
   * **ネットデットが算定できなければ null** —— 「懸念なし」と言わない。
   */
  readonly substantiveInsolvencyRisk: boolean | null;
  /** 有利子負債が未入力か (上の 3 欄が null になっている理由を画面が言うため)。 */
  readonly interestBearingDebtUnentered: boolean;
  /** 現預金が未入力か (ネットデットが null になるもう 1 つの理由)。 */
  readonly cashUnentered: boolean;
}

/**
 * 自己資本健全度を純資産・総資産から判定する。
 * 純資産 0 以下 (債務超過) は insolvent。純資産が正のとき総資産は必ず正なので
 * (純資産 = 総資産 − 総負債、総負債 ≥ 0)、自己資本比率の除算は安全。
 * それ以外は自己資本比率 = 純資産 ÷ 総資産 (%) の区分で判定する。
 */
function classifyEquityHealth(netAssets: number, totalAssets: number): EquityHealthGrade {
  if (netAssets <= 0) return 'insolvent';
  const ratio = (netAssets / totalAssets) * 100;
  if (ratio >= 50) return 'excellent';
  if (ratio >= 30) return 'good';
  if (ratio >= 10) return 'adequate';
  return 'thin';
}

/**
 * 流動性段階を判定する。流動負債 0 は unknown。当座資産 (流動資産 − 棚卸資産) が
 * 流動負債以上なら strong、流動資産が流動負債以上なら sound、それ未満は tight。
 * (当座比率 100% 以上 → strong / 流動比率 100% 以上 → sound と等価。)
 *
 * **棚卸資産が未入力なら `strong` は主張しない。** 0 に倒すと当座資産 = 流動資産
 * になり、流動比率 100% 以上のすべての会社が最良の段階を名乗る。一方 `tight`
 * (流動比率 100% 未満) は棚卸資産に依らず判る —— 都合の悪い側の判定は落とさない。
 */
function classifyLiquidityStage(
  currentAssets: number,
  inventory: number | undefined,
  currentLiabilities: number,
): LiquidityStage {
  if (currentLiabilities <= 0) return 'unknown';
  // `inventory !== undefined` は**実行時には冗長** —— `currentAssets - undefined` は
  // NaN で、`NaN >= n` は常に false なので外しても振る舞いは変わらない (等価変異)。
  // 型検査が `number - undefined` を許さないので残している。意図は下の説明のとおり。
  // Stryker disable next-line ConditionalExpression: NaN >= n は常に false なので実行時は等価 (型検査のために残す)
  if (inventory !== undefined && currentAssets - inventory >= currentLiabilities) return 'strong';
  if (currentAssets >= currentLiabilities) return 'sound';
  return 'tight';
}

/** 純資産額から質を判定する。 */
function classifyNetAssetQuality(netAssets: number): NetAssetQuality {
  if (netAssets > 0) return 'sound';
  if (netAssets < 0) return 'insolvent';
  return 'breakeven';
}

/**
 * BS から round 74 の精緻化指標を計算する。既存の computeBalanceSheetMetrics は
 * 変更せず、本関数で追加の深掘り分析を返す (加算的)。
 */
/**
 * **⚠ 2026-09-07 時点で production の呼び出しは 0 件。配線する前に下を読むこと。**
 *
 * この関数と `BalanceSheetInsights` の 10 欄は、**検査からしか呼ばれていない**
 * (実測: production 0 件 / `__tests__/balanceSheet.test.ts` から 39 か所)。
 * `balanceSheet.ts` は `stryker.config.json` の `mutate` に載っているので、
 * ## 配線した (2026-09-10) —— 申し送りの 2 つを先に済ませてから
 *
 * それまでこの 101 行は**検査からしか呼ばれていなかった** (production の呼び出し 0 件)。
 * `mutate` 台帳に載っているので変異体は 100% のスコアに算入され、**利用者が届かない
 * 範囲を測って「守られている」ように見せている**状態だった (無言の pragma と同じ形)。
 *
 * 配線の前に、当時の注記が挙げていた「今のまま出すと嘘になる欄」を両方とも直した:
 *
 * 1. **入力欄を足した。** `interestBearingDebt` は `BalanceSheet` の任意欄なのに
 *    **入力欄がどの画面にも無かった** (`kessanImport` が読む口だけが在った)。
 *    KPI の貸借対照表フォームに「有利子負債」を足した。
 * 2. **未入力を 0 に倒すのをやめた。** `?? 0` は「未入力」を「借入なし」に畳むので、
 *    そのまま表示すると**どの利用者にも同じ、都合の良い答え**が出ていた:
 *
 * | 欄 | 入力が無いと必ずこうなっていた | 読まれ方 | 今 |
 * | --- | --- | --- | --- |
 * | `netDebt` | `0 − 現預金` = 負 | 実質無借金 | `null` |
 * | `netCashPositive` | 常に `true` | 「借入より現預金が多い」 | `null` |
 * | `substantiveInsolvencyRisk` | 常に `false` | 「実質債務超過の懸念なし」 | `null` |
 * | `interestBearingDebtRatioPct` | 常に 0% | 「借入依存ゼロ」 | `null` |
 *
 * 同じ規則の実例は `src/shared/balanceSheetFreshness.ts`「測れないときに『新しい』と
 * 言わない」と `kpiActuals.ts` の安全余裕率。**本当に借入が無い事業者は 0 と入力する** ——
 * 「0 と入力した」と「入力していない」は別の事実である (現預金・棚卸資産と同じ約束)。
 */
export function computeBalanceSheetInsights(bs: BalanceSheet): BalanceSheetInsights {
  const base = computeBalanceSheetMetrics(bs);
  const debt = bs.interestBearingDebt;
  const cash = bs.cash;

  const workingCapital = bs.currentAssets - bs.currentLiabilities;
  const longTermCapital = base.netAssets + bs.fixedLiabilities;
  // **片方でも欠けたら差は決まらない。** 0 に倒すと「実質無借金」が必ず出る。
  const netDebt = debt === undefined || cash === undefined ? null : debt - cash;

  return {
    workingCapital,
    workingCapitalRatioPct: pct(workingCapital, bs.currentAssets),
    equityHealth: classifyEquityHealth(base.netAssets, base.totalAssets),
    fixedLongTermFitPct: pct(bs.fixedAssets, longTermCapital),
    interestBearingDebtRatioPct: debt === undefined ? null : pct(debt, base.totalAssets),
    debtToEquityPct: pct(base.totalLiabilities, base.netAssets),
    netDebt,
    netCashPositive: netDebt === null ? null : netDebt <= 0,
    liquidityStage: classifyLiquidityStage(bs.currentAssets, bs.inventory, bs.currentLiabilities),
    netAssetQuality: classifyNetAssetQuality(base.netAssets),
    // 純資産が正 (sound) かつ ネットデットが純資産を上回る → 実質的な財務リスクシグナル。
    // ネットデットが算定できなければ「懸念なし」ではなく「分からない」。
    substantiveInsolvencyRisk: netDebt === null ? null : base.netAssets > 0 && netDebt > base.netAssets,
    interestBearingDebtUnentered: debt === undefined,
    cashUnentered: cash === undefined,
  };
}

/**
 * 基準日の新しさ (`balanceSheetFreshness`) は `src/shared/balanceSheetFreshness.ts`
 * に置いてある —— `src/shared/parameters.ts` の台帳が既定値を**写さずに参照**する
 * ために shared 側でなければならない (`shared` は `shared` しか import できない)。
 * 純粋な日付の算術なので両ビルドで同じ物を読む。
 */
export {
  BALANCE_SHEET_STALE_AFTER_MONTHS,
  balanceSheetFreshness,
  type BalanceSheetFreshness,
} from '../../shared/balanceSheetFreshness';

// --- どの貸借対照表を「現在」と呼ぶか (パス 127) -----------------------------------------

/**
 * **貸借対照表は基準日で並ぶ。入力した順ではない。** 以前は `latestRecord` (createdAt = 最後に
 * 入力した 1 件) を「最新の BS」としていたので、新しい基準日の控えを先に入れ、比較のために古い
 * 基準日の控えを後から入れると、経営サマリー (`financialPosition`)・金融機関等提出用の書面 §4
 * 「財政状態（貸借対照表 基準日現在）」・計算書類と資金繰り表の取り込みが**古い方**を「現在」と
 * して使った。画面はどの控えを使っているかを言わず、消せるのは最後に入力した 1 件だけだった。
 *
 * 順序: 基準日 (`YYYY-MM-DD` / `YYYY-MM` の文字列比較 —— 同じ月の日付と月は接頭辞で並び、差が
 * 付かなければ入力順) の新しい方 → 同じなら後に入力した方。基準日の無い控えは最下位。
 * `latestRecord` は「入力した順に意味がある」設定の類 (しきい値・提出者情報) に残す。
 */
export interface BalanceSheetRecordLike {
  readonly id: string;
  readonly createdAt: number;
  readonly data: { readonly asOf?: unknown };
}

/** 基準日の順序鍵 (前後の空白を落とす。文字列でなければ空 = 基準日なし)。 */
export function balanceSheetAsOfKey(asOf: unknown): string {
  return typeof asOf === 'string' ? asOf.trim() : '';
}

/** a の基準日が b より新しいか (空は最下位。同じなら false)。 */
function newerAsOf(a: string, b: string): boolean {
  if (a === b || a === '') return false;
  if (b === '') return true;
  return a > b;
}

/**
 * 「現在」として使う順に並べる比較 (先頭が現在)。基準日の新しい方 → 同じなら後に入力した方。
 * `Array.prototype.sort` にそのまま渡せる (負なら a が先)。
 */
export function compareBalanceSheetRecords(a: BalanceSheetRecordLike, b: BalanceSheetRecordLike): number {
  const ka = balanceSheetAsOfKey(a.data.asOf);
  const kb = balanceSheetAsOfKey(b.data.asOf);
  if (newerAsOf(ka, kb)) return -1;
  if (newerAsOf(kb, ka)) return 1;
  return b.createdAt - a.createdAt;
}

/** 「現在」として使う控え (無ければ null)。 */
export function currentBalanceSheet<R extends BalanceSheetRecordLike>(records: readonly R[]): R | null {
  let best: R | null = null;
  for (const r of records) {
    if (best === null || compareBalanceSheetRecords(r, best) < 0) best = r;
  }
  return best;
}

const asOfLabel = (r: BalanceSheetRecordLike): string => {
  const k = balanceSheetAsOfKey(r.data.asOf);
  return k === '' ? '基準日なし' : `基準日 ${k}`;
};

/**
 * 使っている控えが最後に入力した控えと違うときの注記 (どれを使っているかを画面が言う)。
 * 同じ控えか、控えが無ければ null。
 */
export function balanceSheetChoiceNote<R extends BalanceSheetRecordLike>(records: readonly R[], chosen: R | null): string | null {
  if (chosen === null) return null;
  const lastEntered = latestRecord(records);
  if (lastEntered === null || lastEntered.id === chosen.id) return null;
  return `最後に入力した貸借対照表（${asOfLabel(lastEntered)}）より新しい基準日の控え（${asOfLabel(chosen)}）があるので、そちらを「現在」として経営サマリー・書面・計算書類に使っています。古い方を消すか、基準日を直してください。`;
}
