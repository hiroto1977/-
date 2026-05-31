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

/**
 * 経営概況から重要な所見を抽出し、深刻度順 (critical → warning → good) に返す。
 * データが無い領域は所見を出さない (沈黙)。
 */
export function buildManagementHighlights(overview: BusinessOverview): Highlight[] {
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
    // 成長性
    if (k.revenueGrowthPct !== null && k.revenueGrowthPct < 0) {
      out.push({ severity: 'warning', category: '成長性', message: `前期比で減収です (${k.revenueGrowthPct}%)。` });
    } else if (k.revenueGrowthPct !== null && k.revenueGrowthPct >= 10) {
      out.push({ severity: 'good', category: '成長性', message: `前期比 +${k.revenueGrowthPct}% と伸びています。` });
    }
  }

  // 生産性 (労働分配率)
  const labor = overview.productivity.labor;
  if (labor.laborSharePct !== null && labor.laborSharePct > 60) {
    out.push({ severity: 'warning', category: '生産性', message: `労働分配率が ${labor.laborSharePct}% と高めです (人件費が粗利を圧迫)。` });
  }

  // 予実
  if (overview.budget) {
    const a = overview.budget.revenue.achievementPct;
    if (a !== null && a < 90) {
      out.push({ severity: 'warning', category: '予実', message: `売上が予算未達です (達成率 ${a}%)。` });
    } else if (a !== null && a >= 100) {
      out.push({ severity: 'good', category: '予実', message: `売上予算を達成しています (達成率 ${a}%)。` });
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

  // 組織 (シート)
  if (overview.flags.seatsFull) {
    out.push({ severity: 'warning', category: '組織', message: 'プランのシート上限に達しています。増員にはアップグレードが必要です。' });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
