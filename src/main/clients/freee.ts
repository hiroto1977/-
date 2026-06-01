import { jsonFetch, type FetchContext } from './types';

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
  /** 取得時刻 (ISO)。 */
  readonly fetchedAt: string;
}

/** 取引配列を月次の収入・支出・純額に集計する (純粋・テスト用に公開)。 */
export function aggregateDealsByMonth(deals: readonly FreeeDeal[]): FreeeMonthlyCashflow[] {
  const map = new Map<string, { income: number; expense: number }>();
  for (const d of deals) {
    const month = (d.issue_date ?? '').slice(0, 7);
    if (month.length !== 7) continue; // 不正な日付はスキップ
    const amt = Math.max(0, d.amount);
    const cur = map.get(month) ?? { income: 0, expense: 0 };
    if (d.type === 'income') cur.income += amt;
    else cur.expense += amt;
    map.set(month, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([month, v]) => ({ month, income: v.income, expense: v.expense, net: v.income - v.expense }));
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
  const company = companies.companies[0];
  if (!company) {
    return { companyName: '', monthly: [], fetchedAt: new Date().toISOString() };
  }

  const deals = await jsonFetch<FreeeDealsResponse>(
    `${FREEE_BASE}/deals?company_id=${company.id}&limit=100`,
    { headers },
    fetchCtx,
  );

  return {
    companyName: company.display_name ?? company.name ?? '',
    monthly: aggregateDealsByMonth(deals.deals ?? []),
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
