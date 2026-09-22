import { jsonFetch, type FetchContext } from './types';
import { NO_DEAL_INTAKE, type FreeeDealIntake } from '../../shared/freeeIntake';
import { isoMonthOf } from '../../shared/isoDate';

/**
 * freee 会計 API 連携クライアント (実 API)。
 *
 * freee 会計の取引 (deals) を取得し、月次の営業キャッシュフロー
 * (収入 − 支出) に正規化して返す。資金調達レーダー (`funding`) の
 * `accountingCashflow` 受け口にそのまま流せる形 (月→金額) も提供する。
 *
 * 認証は OAuth 2.0 アクセストークン (Bearer)。`ctx.token` に有効な
 * アクセストークンが入る前提 (oauth.ts の freee 設定で取得)。
 * `ctx.fetch` を注入できるため Node 上で単体テスト可能。
 *
 * 参考: freee API (https://developer.freee.co.jp/) の
 *   GET /api/1/companies        — 事業所一覧 (company_id の取得)
 *   GET /api/1/deals            — 取引 (収入 income / 支出 expense)
 *
 * ※ 本クライアントは読み取りのみ。仕訳の登録・更新は行わない。
 */

const FREEE_BASE = 'https://api.freee.co.jp/api/1';

interface FreeeCompany {
  id: number;
  display_name?: string;
  name?: string;
}

interface FreeeCompaniesResponse {
  companies: FreeeCompany[];
}

interface FreeeDeal {
  id: number;
  /** 'income' (収入) | 'expense' (支出)。 */
  type: 'income' | 'expense';
  /** 発生日 (YYYY-MM-DD)。 */
  issue_date: string;
  /** 金額 (税込, 円)。 */
  amount: number;
}

interface FreeeDealsResponse {
  deals: FreeeDeal[];
}

export interface FreeeMonthlyCashflow {
  /** 年月 (YYYY-MM)。 */
  readonly month: string;
  /** 収入合計 (円)。 */
  readonly income: number;
  /** 支出合計 (円)。 */
  readonly expense: number;
  /** 営業キャッシュフロー (収入 − 支出)。 */
  readonly net: number;
}

export interface FreeeSnapshot {
  /** 接続中の事業所名。 */
  readonly companyName: string;
  /** 月次の営業キャッシュフロー (月の昇順)。 */
  readonly monthly: readonly FreeeMonthlyCashflow[];
  /**
   * 取り込みで何件をどう扱ったか (パス 153)。
   *
   * 月次の値そのものは `monthly` に在る。こちらは**その値の素性**で、
   * 落ちた取引が在るなら画面・銀行提出書面 §6・資金繰り表の取り込み注記が
   * そう述べる (文面は `shared/freeeIntake.ts`)。
   */
  readonly intake: FreeeDealIntake;
  /** 取得時刻 (ISO)。 */
  readonly fetchedAt: string;
}

/** 集計の結果と、その素性 (何件をどう扱ったか)。 */
export interface FreeeDealAggregate {
  readonly monthly: FreeeMonthlyCashflow[];
  readonly intake: FreeeDealIntake;
}

/**
 * 取引配列を月次の収入・支出・純額に集計する (純粋・テスト用に公開)。
 *
 * **落とした取引を数えて返す** (2026-09-12 · パス 153)。集計の値は変えていない ——
 * 変えたのは「黙っているかどうか」だけ。この月次は経営サマリー経由で
 * 銀行提出用書面 §6 の 8 行になるので、落ちた分を言わないと相手が読む数字が
 * 静かに動く (経緯は `shared/freeeIntake.ts`)。
 */
export function aggregateDeals(deals: readonly FreeeDeal[]): FreeeDealAggregate {
  const map = new Map<string, { income: number; expense: number }>();
  let skippedNoDate = 0;
  let skippedBadAmount = 0;
  let clampedNegative = 0;
  for (const d of deals) {
    /*
     * **取引日は「暦に在る日か」で検める** (2026-09-22 · パス 394)。
     *
     * ここは 2026-09-22 まで `(d.issue_date ?? '').slice(0, 7)` を
     * **長さ 7 だけ**で検めていた。`issue_date` は freee API の応答で、
     * `jsonFetch` は `JSON.parse(...) as T` なので形が保証されない ——
     * すぐ下の `amount` を `Number.isFinite` で検めているのと同じ理由である。
     * **月だけが検められていなかった。**
     *
     * 実測 (2026-09-22 · 直す前):
     *   `'abcdefg'`     → 月キー `'abcdefg'` になり `skippedNoDate` は **0**
     *   `'9999-13-01'`  → 月キー `'9999-13'`
     *   `20250615` (数) → `.slice` が無く **TypeError** —— 1 件で全月が落ちる
     *
     * `latestMonth` は綴りの最大で決まる (`renderer/data/accounting.ts` の
     * 「最新月は**綴りで**決める」) ので `'abcdefg'` が「最新月」になり、
     * **金融機関等提出用の書面**が会計連携の対象期間としてそれを刷る
     * (`bankSubmission.ts`)・経営レポート・画面の Tile・鮮度の判定
     * (`accountingRecency`) にも入る。
     *
     * `skippedNoDate` の名前 (「取引日が読めない取引」) は元から正しく、
     * `shared/freeeIntake.ts` も「`issue_date` が **`YYYY-MM` として読めない**
     * 取引を外す」と述べていた —— **検めの側が名前と散文に追いついていなかった**。
     * 判定は共有の 1 つ (`isoMonthOf` → `parseIsoDate`) を通し、月は**切らずに作る**。
     */
    const month = isoMonthOf(d.issue_date);
    if (month === null) {
      // 取引日が読めない取引は集計から外す。**外したことを数える** ——
      // 数えないと「この月は取引が無かった」と区別が付かない。
      skippedNoDate += 1;
      continue;
    }
    // **金額が数でない取引は外す。** `jsonFetch` は `JSON.parse(...) as T` で
    // 形を確かめないので、`amount` 欠落は `undefined` のまま届き、
    // `Math.max(0, undefined)` は NaN になる。NaN を足すとその月の net が NaN、
    // 営業CF 累計も NaN で、**銀行提出用書面がそれを刷る** (パス 98 の家系)。
    if (!Number.isFinite(d.amount)) {
      skippedBadAmount += 1;
      continue;
    }
    const amt = Math.max(0, d.amount);
    if (d.amount < 0) clampedNegative += 1;
    const cur = map.get(month) ?? { income: 0, expense: 0 };
    if (d.type === 'income') cur.income += amt;
    else cur.expense += amt;
    map.set(month, cur);
  }
  const monthly = [...map.entries()]
    // 月キーは Map 由来で distinct。3 項比較子の代わりに localeCompare で昇順にして
    // (a<b?-1:a>b?1:0) の等価変異 (タイ=0 が起きない) を構造的に排除する。
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, income: v.income, expense: v.expense, net: v.income - v.expense }));
  return {
    monthly,
    intake: { deals: deals.length, skippedNoDate, skippedBadAmount, clampedNegative },
  };
}

/** 月次だけが要る呼び出し向けの薄い口 (素性を見ない所はこちらを使う)。 */
export function aggregateDealsByMonth(deals: readonly FreeeDeal[]): FreeeMonthlyCashflow[] {
  return aggregateDeals(deals).monthly;
}

/**
 * freee のスナップショットを取得する。
 *
 * 1. 事業所一覧を取得し、先頭の company_id を使う。
 * 2. その事業所の取引 (deals) を取得し、月次キャッシュフローに集計する。
 */
export async function fetchFreeeSnapshot(ctx: FetchContext): Promise<FreeeSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'freee' };
  const headers = { Authorization: `Bearer ${ctx.token}`, accept: 'application/json' };

  const companies = await jsonFetch<FreeeCompaniesResponse>(
    `${FREEE_BASE}/companies`,
    { headers },
    fetchCtx,
  );
  // 封筒は `jsonFetch` が見る (パス 262)。**欄はここで守る** —— `{}` の応答では
  // `companies.companies` が undefined で、`[0]` が投げていた (実測)。
  const company = (companies.companies ?? [])[0];
  if (!company) {
    return { companyName: '', monthly: [], intake: NO_DEAL_INTAKE, fetchedAt: new Date().toISOString() };
  }

  const deals = await jsonFetch<FreeeDealsResponse>(
    `${FREEE_BASE}/deals?company_id=${encodeURIComponent(company.id)}&limit=100`,
    { headers },
    fetchCtx,
  );

  // deals 欠落時の [] フォールバック。別配列要素を入れても aggregateDeals が
  // issue_date 検証で除外し monthly=[] になるため、ArrayDeclaration 変異は equivalent。
  // Stryker disable next-line ArrayDeclaration
  const aggregated = aggregateDeals(deals.deals ?? []);
  return {
    companyName: company.display_name ?? company.name ?? '',
    monthly: aggregated.monthly,
    intake: aggregated.intake,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * freee スナップショットを資金調達レーダーの `accountingCashflow`
 * (Map<YYYY-MM, 営業CF>) に変換するヘルパ。
 */
export function freeeCashflowMap(snapshot: FreeeSnapshot): Map<string, number> {
  return new Map(snapshot.monthly.map((m) => [m.month, m.net]));
}
