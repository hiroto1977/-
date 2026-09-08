/**
 * 経営レポート出力 — 経営コックピットの内容を共有可能な Markdown 文書にまとめる。
 *
 * 役員会・銀行・税理士への報告用に、経営概況 (BusinessOverview)・スコアカード・
 * ハイライトを 1 つのテキストレポートへ整形する純粋関数。IO は持たない
 * (呼び出し側がクリップボードやファイルに出す)。
 *
 * **重要 — 概算の経営診断であり財務・税務助言ではありません。**
 */
import { budgetScopeSentence } from './budgetVariance';
import type { BusinessOverview } from './overview';
import { VERDICT_LABEL, type ManagementScorecard } from '../../shared/managementScorecard';
import { summarizeHighlights, RISK_BAND_LABEL, type Highlight } from './managementHighlights';
import { formatPeriodWindow, zeroRevenueRatioNote, type MonthlyTrendRow } from './kpiActuals';
import { manualOverrideNote, staleDerivedNote, type ManualOverrideDisclosure } from './overviewOverrides';

const SEVERITY_MARK: Record<Highlight['severity'], string> = {
  critical: '🔴', warning: '🟡', good: '🟢',
};

const yen = (n: number): string => `¥${Math.round(n).toLocaleString('ja-JP')}`;
/**
 * 小数第 1 位の比率。**算定不能 (`null`) は「—」** —— 0.0% と書かない。
 * 0.0% は「その比率が 0 である」という主張であり、「割れない」とは別のこと
 * (経緯は `overview.ts` の `pctOfRevenue`)。
 */
const pct = (n: number | null): string => (n === null ? '—' : `${n.toFixed(1)}%`);
const pctOrDash = (n: number | null): string => (n === null ? '—' : `${n}%`);

/**
 * 経営レポートを Markdown 文字列で生成する。
 *
 * @param overview 経営概況
 * @param scorecard 経営スコアカード
 * @param highlights 経営ハイライト (優先度順)
 * @param asOf 生成日 (YYYY-MM-DD 等の表示用文字列)
 * @param monthlyTrend 月次推移 (任意)。2 期以上あれば推移テーブルを出力する。
 */
export function buildManagementReport(
  overview: BusinessOverview,
  scorecard: ManagementScorecard,
  highlights: readonly Highlight[],
  asOf: string,
  /**
   * 手入力の上書きの状況。**既定値を置かない** —— このレポートは
   * 「役員会・銀行・税理士への共有に」と自ら書いており、書面と同じ相手に渡る。
   * 渡し忘れが断り書きの無いレポートになるのを型で止める
   * (経緯は `overviewOverrides.ts` の `staleDerivedNote`)。**必須の引数は
   * 任意の引数より前に置く** —— 後ろに置くと呼び手が 7 つ全部を書く。
   */
  manual: ManualOverrideDisclosure,
  // 既定 `[]` は `length >= 2` ゲートにより要素数1の配列と出力上区別できない (どちらもテーブル
  // 非出力) ため、ArrayDeclaration 変異は equivalent。
  // Stryker disable next-line ArrayDeclaration
  monthlyTrend: readonly MonthlyTrendRow[] = [],
  /** 損益分岐点までの売上変動余地 (%)。null / 未指定なら出力しない。 */
  breakEvenDeltaPct: number | null = null,
): string {
  const k = overview.kpi;
  const lines: string[] = [];

  lines.push(`# 経営レポート (${overview.plan.label} プラン)`);
  lines.push('');
  lines.push(`作成日: ${asOf}`);
  lines.push('');
  lines.push('> ※ 本レポートは入力済みデータからの概算の経営診断であり、財務・税務助言ではありません。');
  lines.push('');

  // **手入力の上書きは、下の全部に掛かる** ので前文の直後に置く
  // (書面は注記に置く。同じ 2 文を `overviewOverrides.ts` が 1 か所で持つ)。
  const manualNote = manualOverrideNote(manual);
  const staleNote = staleDerivedNote(manual);
  if (manualNote !== null || staleNote !== null) {
    lines.push('## 手入力の上書き');
    lines.push('');
    if (manualNote !== null) lines.push(`- ${manualNote}`);
    if (staleNote !== null) lines.push(`- ⚠ ${staleNote}`);
    lines.push('');
  }

  // 総合判定
  lines.push('## 総合判定');
  lines.push('');
  lines.push(`- 経営スコア: **${scorecard.overallScore} / 100** (${VERDICT_LABEL[scorecard.verdict]})`);
  for (const c of scorecard.categories) {
    if (c.score !== null) lines.push(`- ${c.label}: ${c.score} / 100`);
  }
  lines.push('');

  // ハイライト
  if (highlights.length > 0) {
    lines.push('## 経営ハイライト');
    lines.push('');
    const s = summarizeHighlights(highlights);
    lines.push(`総合リスク: **${RISK_BAND_LABEL[s.riskBand]}** — 🔴 ${s.critical} / 🟡 ${s.warning} / 🟢 ${s.good} (計 ${s.total} 件)`);
    lines.push('');
    for (const h of highlights) {
      lines.push(`- ${SEVERITY_MARK[h.severity]} [${h.category}] ${h.message}`);
    }
    lines.push('');
  }

  // 損益。**何か月分の累計か**を必ず書く —— この節の金額はすべて期間に比例するので、
  // 書かないと通年の数字として読まれる (金融機関等提出用の書面 §1 が
  // `periodScopeNote` で述べているのと同じ理由。レポートは 2026-09-08 まで
  // 述べていなかった: このレポートの前文は「役員会・銀行・税理士への共有に」と
  // 書いてあり、渡る先は書面と同じである)。
  if (k.hasData) {
    lines.push('## 損益 (P&L)');
    lines.push('');
    // `!= null` は**型の外から来る詰め物** (欄そのものが無い控え) にも耐えるため
    // (同じ関数の `budgetAlignment` / `accountingRecency` と同じ理由)。
    if (k.periodWindow != null) {
      lines.push(`- 対象期間: ${formatPeriodWindow(k.periodWindow)} (以下の金額はこの期間の累計)`);
    }
    lines.push(`- 売上高: ${yen(k.revenue)}`);
    lines.push(`- 営業利益: ${yen(k.operatingProfit)} (営業利益率 ${pct(k.operatingMarginPct)})`);
    lines.push(`- 売上総利益: ${yen(k.grossProfit)} (粗利率 ${pct(k.grossMarginPct)})`);
    lines.push(`- EBITDA: ${yen(k.ebitda)} (マージン ${pct(k.ebitdaMarginPct)})`);
    lines.push(`- 損益分岐点: ${Number.isFinite(k.bep) ? yen(k.bep) : '—'} / 安全余裕率 ${pct(k.safetyMargin)}`);
    if (k.revenueGrowthPct !== null) lines.push(`- 前期比成長率: ${k.revenueGrowthPct}%`);
    if (k.yoy !== null && k.yoy.revenueYoYPct !== null) {
      lines.push(`- 前年同月比 (YoY): ${k.yoy.revenueYoYPct > 0 ? '+' : ''}${k.yoy.revenueYoYPct}% (${k.yoy.period} vs ${k.yoy.priorPeriod})`);
    }
    if (breakEvenDeltaPct !== null) {
      lines.push(`- 損益分岐点までの売上余地: ${breakEvenDeltaPct > 0 ? '+' : ''}${breakEvenDeltaPct}%`);
    }
    // 売上 0 のときは売上高を分母にする比率がすべて「—」になる。**なぜ空欄なのかを
    // 述べる** (書面 §1 と同じ文。理由が無いと入力漏れと区別できない)。
    if (k.revenue <= 0) lines.push(`- ${zeroRevenueRatioNote()}`);
    lines.push('');
  }

  // 財政状態。**基準日**を書き、実績の期と隔たっていればそれも書く
  // (書面 §4 が述べているのと同じ。基準日の無い比率は、いつの財政状態か読めない)。
  if (overview.financialPosition) {
    const fp = overview.financialPosition;
    const fresh = overview.balanceSheetFreshness;
    lines.push('## 財政状態 (BS)');
    lines.push('');
    if (fresh?.asOfMonth != null) lines.push(`- 基準日: ${fresh.asOfMonth} 時点の貸借対照表`);
    if (fresh != null && fresh.monthsBehind != null && (fresh.stale || fresh.ahead)) {
      lines.push(
        fresh.stale
          ? `- ⚠ 基準日が実績の最新期 (${fresh.latestPeriod}) より ${fresh.monthsBehind} か月古く、溜まり ÷ 流れ の指標は別の期の数字を割っています。`
          : `- ⚠ 基準日が実績の最新期 (${fresh.latestPeriod}) より ${-fresh.monthsBehind} か月先で、溜まり ÷ 流れ の指標は別の期の数字を割っています。`,
      );
    }
    lines.push(`- 自己資本比率: ${pctOrDash(fp.equityRatioPct)} / 流動比率: ${pctOrDash(fp.currentRatioPct)}`);
    lines.push(`- ROA: ${pctOrDash(fp.roaPct)} / ROE: ${pctOrDash(fp.roePct)}`);
    if (fp.insolvent) lines.push('- ⚠ 純資産がマイナス (債務超過) です。');
    lines.push('');
  }

  // 資金繰り。**会計連携の窓**を書く (書面 §6 と同じ)。資金ランウェイは
  // 「貸借対照表の現預金 (基準日) ÷ 会計連携の月次平均CF (会計の窓)」で
  // **両辺が別の出所・別の窓**なので、隔たっていればそれも書く (パス 46 の実測)。
  if (overview.accounting) {
    const acc = overview.accounting;
    lines.push('## 資金繰り (CF)');
    lines.push('');
    // 月数が 0 の要約は述べることが無い (書類に `undefined〜undefined` を刷らない)。
    if (acc.months > 0) {
      lines.push(`- 会計連携の対象期間: ${acc.firstMonth}〜${acc.latestMonth}・${acc.months} か月分`);
    }
    lines.push(`- 営業CF合計: ${yen(acc.totalNet)} (月次平均 ${yen(acc.avgMonthlyNet)})`);
    if (overview.runwayMonths !== null) lines.push(`- 資金ランウェイ: ${overview.runwayMonths} か月`);
    const rec = overview.accountingRecency;
    if (rec != null && rec.monthsBehind != null && (rec.stale || rec.ahead)) {
      lines.push(
        `- ⚠ 会計連携の最新月 (${rec.latestAccountingMonth}) と貸借対照表の基準日 (${rec.cashAsOfMonth}) が ${Math.abs(rec.monthsBehind)} か月隔たっています。資金ランウェイは基準日の現預金を会計の窓の月次CFで割った値です。`,
      );
    }
    if (overview.cashForecast?.shortfallMonthIndex != null) {
      lines.push(`- 資金ショート予測: ${overview.cashForecast.shortfallMonthIndex} か月後`);
    }
    lines.push('');
  }

  // 予実。合算したのは**予算と実績の両方が在る期**だけなので、その範囲も書く
  // (書かないと通年の比較に読める)。
  if (overview.budget) {
    const b = overview.budget;
    const al = b.alignment;
    lines.push('## 予算実績差異 (BVA)');
    lines.push('');
    lines.push(`- 対象期間: ${al.comparedPeriods[0]}〜${al.comparedPeriods[al.comparedPeriods.length - 1]}・${al.comparedPeriods.length} か月 (予算と実績の両方が在る期)`);
    const scope = budgetScopeSentence(al);
    if (scope !== null) lines.push(`- ${scope}`);
    lines.push(`- 売上 達成率: ${pctOrDash(b.revenue.achievementPct)} (予算 ${yen(b.revenue.budget)} / 実績 ${yen(b.revenue.actual)})`);
    lines.push(`- 営業利益 達成率: ${pctOrDash(b.operatingProfit.achievementPct)}`);
    lines.push('');
  } else if (overview.budgetAlignment != null) {
    // `!= null` は**型の外から来る詰め物** (欄そのものが無い控え) にも耐えるため。
    const al = overview.budgetAlignment;
    lines.push('## 予算実績差異 (BVA)');
    lines.push('');
    lines.push(`- 予算と実績で期が重なっていないため算定していません (予算 ${al.budgetOnlyPeriods.length} か月・実績 ${al.actualOnlyPeriods.length} か月)`);
    lines.push('');
  }

  // 月次推移
  if (monthlyTrend.length >= 2) {
    lines.push('## 月次推移');
    lines.push('');
    lines.push('| 期間 | 売上高 | 営業利益 | 営業利益率 | 前期比 |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const r of monthlyTrend) {
      const growth = r.revenueGrowthPct === null ? '—' : `${r.revenueGrowthPct > 0 ? '+' : ''}${r.revenueGrowthPct}%`;
      lines.push(`| ${r.period} | ${yen(r.revenue)} | ${yen(r.operatingProfit)} | ${pct(r.operatingMarginPct)} | ${growth} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
