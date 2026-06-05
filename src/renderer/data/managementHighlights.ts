/**
 * 経営ハイライト — 集約済みの経営指標を横断し、いま注目すべき所見を優先度順に
 * 抽出する。経営コックピットの「結論」部分。数値の羅列ではなく「何が問題か / 何が
 * 良いか」を一覧化する純粋ロジック。BusinessOverview を入力に取り、IO は持たない。
 *
 * **重要 — 概算の経営診断であり財務・税務助言ではありません。**
 */
import type { BusinessOverview } from './overview';

export type HighlightSeverity = 'critical' | 'warning' | 'good';

export interface Highlight {
  readonly severity: HighlightSeverity;
  /** 区分ラベル (収益性 / 安全性 など)。 */
  readonly category: string;
  readonly message: string;
}

const SEVERITY_ORDER: Record<HighlightSeverity, number> = { critical: 0, warning: 1, good: 2 };

/** ハイライト判定のしきい値 (業種・方針で調整可能)。 */
export interface HighlightThresholds {
  /** 連続下落を warning とする期数 (既定 2)。 */
  readonly declineWarnStreak: number;
  /** 連続下落を critical とする期数 (既定 3)。 */
  readonly declineCriticalStreak: number;
  /** 労働分配率の警告しきい値 % (既定 60)。 */
  readonly laborShareWarnPct: number;
  /** 単一チャネル依存の警告しきい値 % (既定 60)。computeRevenueConcentration と整合。 */
  readonly singleChannelWarnPct: number;
}

export const DEFAULT_HIGHLIGHT_THRESHOLDS: HighlightThresholds = {
  declineWarnStreak: 2,
  declineCriticalStreak: 3,
  laborShareWarnPct: 60,
  singleChannelWarnPct: 60,
};

/** buildManagementHighlights の任意オプション。 */
export interface HighlightOptions {
  /** 会計CF×返済の全体DSCR (任意)。1.0 未満なら所見を出す。 */
  readonly overallDscr?: number | null;
  /** 判定しきい値 (部分指定可、未指定は既定値)。 */
  readonly thresholds?: Partial<HighlightThresholds>;
}

/**
 * 経営概況から重要な所見を抽出し、深刻度順 (critical → warning → good) に返す。
 * データが無い領域は所見を出さない (沈黙)。
 *
 * @param overview 経営概況
 * @param options DSCR・しきい値。後方互換のため `number|null` (= overallDscr) も受ける。
 */
export function buildManagementHighlights(
  overview: BusinessOverview,
  options?: HighlightOptions | number | null,
): Highlight[] {
  const opts: HighlightOptions =
    typeof options === 'number' || options === null || options === undefined
      ? { overallDscr: options ?? undefined }
      : options;
  const overallDscr = opts.overallDscr;
  const th: HighlightThresholds = { ...DEFAULT_HIGHLIGHT_THRESHOLDS, ...opts.thresholds };
  const out: Highlight[] = [];
  const k = overview.kpi;

  if (k.hasData) {
    // 収益性
    if (k.operatingProfit < 0) {
      out.push({ severity: 'critical', category: '収益性', message: `営業赤字です (営業利益 ${k.operatingProfit.toLocaleString()}円)。` });
    } else if (k.operatingMarginPct >= 10) {
      out.push({ severity: 'good', category: '収益性', message: `営業利益率 ${k.operatingMarginPct.toFixed(1)}% と良好です。` });
    }
    // 安全性 (損益分岐点)
    if (k.revenue > 0 && k.safetyMargin < 10) {
      out.push({ severity: 'warning', category: '安全性', message: `安全余裕率が ${k.safetyMargin.toFixed(1)}% と低く、売上減少に弱い状態です。` });
    }
    // 成長性 — revenueGrowthPct が null のとき下流比較 (<0 / >=10) は 0 換算でいずれも false と
    // なり所見は出ない。よって `!== null` を true 固定する ConditionalExpression は観測差が無く
    // equivalent（null を渡しても判定結果は不変）。boundary は <0 / >=10 の EqualityOperator が担保。
    /* Stryker disable ConditionalExpression */
    if (k.revenueGrowthPct !== null && k.revenueGrowthPct < 0) {
      out.push({ severity: 'warning', category: '成長性', message: `前期比で減収です (${k.revenueGrowthPct}%)。` });
    } else if (k.revenueGrowthPct !== null && k.revenueGrowthPct >= 10) {
      out.push({ severity: 'good', category: '成長性', message: `前期比 +${k.revenueGrowthPct}% と伸びています。` });
    }
    /* Stryker restore ConditionalExpression */

    // 月次トレンド (連続下落): しきい値で warning / critical を判定。
    const revStreak = overview.trendAlerts.revenue;
    if (revStreak.streak >= th.declineWarnStreak) {
      const drop = revStreak.dropFromPeakPct !== null ? ` (ピーク比 −${revStreak.dropFromPeakPct}%)` : '';
      out.push({
        severity: revStreak.streak >= th.declineCriticalStreak ? 'critical' : 'warning',
        category: '売上トレンド',
        message: `売上が ${revStreak.streak} 期連続で減少しています${drop}。`,
      });
    }
    const opStreak = overview.trendAlerts.operatingProfit;
    if (opStreak.streak >= th.declineWarnStreak) {
      out.push({
        severity: opStreak.streak >= th.declineCriticalStreak ? 'critical' : 'warning',
        category: '利益トレンド',
        message: `営業利益が ${opStreak.streak} 期連続で減少しています。`,
      });
    }
  }

  // 生産性 (労働分配率) — null のとき null>しきい値 は 0 換算で false となり所見は出ないため、
  // `!== null` を true 固定する ConditionalExpression は equivalent。boundary は > の EqualityOperator が担保。
  const labor = overview.productivity.labor;
  // Stryker disable next-line ConditionalExpression
  if (labor.laborSharePct !== null && labor.laborSharePct > th.laborShareWarnPct) {
    out.push({ severity: 'warning', category: '生産性', message: `労働分配率が ${labor.laborSharePct}% と高めです (人件費が粗利を圧迫)。` });
  }

  // 予実
  if (overview.budget) {
    const a = overview.budget.revenue.achievementPct;
    // null ガードを巻き上げて単一化。a が null のとき内側 `a < 90` が 0<90=true となり
    // 達成率0%扱いで未達警告が出てしまうため、外側 `!== null` を true 固定する変異は撃墜可能。
    if (a !== null) {
      if (a < 90) {
        out.push({ severity: 'warning', category: '予実', message: `売上が予算未達です (達成率 ${a}%)。` });
      } else if (a >= 100) {
        out.push({ severity: 'good', category: '予実', message: `売上予算を達成しています (達成率 ${a}%)。` });
      }
    }
  }

  // 財政状態 (BS)
  const fp = overview.financialPosition;
  if (fp) {
    if (fp.insolvent) {
      out.push({ severity: 'critical', category: '財政状態', message: '純資産がマイナス (債務超過) です。早急な改善が必要です。' });
    } else if (fp.equityRatioPct !== null && fp.equityRatioPct < 20) {
      out.push({ severity: 'warning', category: '財政状態', message: `自己資本比率が ${fp.equityRatioPct}% と低めです。` });
    }
    if (fp.currentRatioPct !== null && fp.currentRatioPct < 100) {
      out.push({ severity: 'warning', category: '財政状態', message: `流動比率が ${fp.currentRatioPct}% と100%未満で、短期の支払余力に注意です。` });
    }
  }

  // 運転資金 (CCC)
  const wc = overview.workingCapital;
  if (wc && wc.ccc !== null) {
    if (wc.ccc > 60) {
      out.push({ severity: 'warning', category: '運転資金', message: `CCC が ${wc.ccc} 日と長く、運転資金の負担が大きい状態です。` });
    } else if (wc.ccc <= 0) {
      out.push({ severity: 'good', category: '運転資金', message: `CCC が ${wc.ccc} 日で、仕入の支払より先に回収できています。` });
    }
  }

  // 会計連携 (営業CF・ランウェイ)
  const acc = overview.accounting;
  if (acc) {
    if (acc.avgMonthlyNet < 0) {
      out.push({ severity: 'warning', category: '資金繰り', message: `月次平均の営業CFがマイナスです (${acc.avgMonthlyNet.toLocaleString()}円/月の資金流出)。` });
    } else {
      out.push({ severity: 'good', category: '資金繰り', message: '営業キャッシュフローは黒字基調です。' });
    }
  }
  if (overview.runwayMonths !== null) {
    if (overview.runwayMonths < 6) {
      out.push({ severity: 'critical', category: '資金繰り', message: `資金ランウェイが ${overview.runwayMonths} か月と短く、追加調達か支出抑制が急務です。` });
    } else if (overview.runwayMonths < 12) {
      out.push({ severity: 'warning', category: '資金繰り', message: `資金ランウェイが ${overview.runwayMonths} か月です。資金計画の見直しを検討してください。` });
    }
  }

  // 返済余力 (会計CF × 資金調達の DSCR)。number 型のときだけ判定 (null/undefined は沈黙)。
  if (typeof overallDscr === 'number') {
    if (overallDscr < 1) {
      out.push({ severity: 'critical', category: '返済余力', message: `DSCR が ${overallDscr} と1.0未満で、営業CFが借入返済を賄えていません。` });
    } else if (overallDscr >= 1.5) {
      out.push({ severity: 'good', category: '返済余力', message: `DSCR ${overallDscr} と返済余力は十分です。` });
    }
  }

  // 売上集中度 (チャネル依存): しきい値 (既定 60%) を超える依存を警告。
  const conc = overview.sales.concentration;
  if (conc && conc.topSharePct > th.singleChannelWarnPct) {
    out.push({ severity: 'warning', category: '売上集中', message: `売上が ${conc.topChannel} に ${conc.topSharePct}% 集中しています。チャネル分散を検討してください。` });
  }

  // 組織 (シート)
  if (overview.flags.seatsFull) {
    out.push({ severity: 'warning', category: '組織', message: 'プランのシート上限に達しています。増員にはアップグレードが必要です。' });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
