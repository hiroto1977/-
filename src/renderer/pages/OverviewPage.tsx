import { useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { useCollection } from '../data/useCollection';
import {
  HIGHLIGHT_SETTINGS_COLLECTION,
  parseHighlightSettings,
  type HighlightSettings,
} from '../data/highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../data/managementHighlights';
import { INDUSTRY_PRESETS } from '../data/industryPresets';
import { SALES_COLLECTION, type SalesEntry } from '../data/sales';
import { KPI_ACTUALS_COLLECTION, monthlyTrendSeries, summarizeFundamentals, type KpiActual } from '../data/kpiActuals';
import { profitSensitivity, breakEvenDeltaPct, requiredRevenueForTarget } from '../data/profitSensitivity';
import { KPI_BUDGETS_COLLECTION } from '../data/budgetVariance';
import { BALANCE_SHEET_COLLECTION, type BalanceSheet } from '../data/balanceSheet';
import { MEMBERS_COLLECTION, type Member } from '../data/members';
import { usePlan } from '../plan/usePlan';
import { buildBusinessOverview } from '../data/overview';
import { buildManagementScorecard } from '../../shared/managementScorecard';
import { buildManagementHighlights } from '../data/managementHighlights';
import { buildManagementReport } from '../data/managementReport';
import { sparklinePoints } from '../data/sparkline';
import { cashForecastTrajectory } from '../data/cashForecast';
import { combineCashflowDebtService } from '../data/cashflowDebtService';
import { useServiceData } from '../hooks/useServiceData';
import { SNAPSHOT } from '../data/snapshot';

const SCORE_COLOR = (s: number | null): string =>
  s === null ? 'var(--text-mute)' : s >= 80 ? '#22c55e' : s >= 60 ? '#3ec98a' : s >= 40 ? '#f59e0b' : '#ef4444';
const VERDICT_LABEL: Record<string, string> = { poor: '要改善', caution: '注意', good: '良好', excellent: '優良' };
const TREND_LABEL: Record<string, string> = { up: '↗ 上昇', down: '↘ 下降', flat: '→ 横ばい', none: '—' };
const TREND_COLOR: Record<string, string | undefined> = { up: '#22c55e', down: '#ef4444', flat: undefined, none: undefined };

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('ja-JP');
const safeYen = (n: number) => (Number.isFinite(n) ? yen.format(Math.round(n)) : '∞');
const pctOrDash = (n: number | null) => (n === null ? '—' : `${n}%`);

const settingsInput: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', padding: '6px 8px', fontSize: 13, width: 90,
};

/** 経営ハイライトのしきい値を編集・保存するパネル。 */
function HighlightSettingsPanel({
  current,
  onSave,
}: {
  current: HighlightSettings | typeof DEFAULT_HIGHLIGHT_THRESHOLDS;
  onSave: (s: HighlightSettings) => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    declineWarnStreak: String(current.declineWarnStreak),
    declineCriticalStreak: String(current.declineCriticalStreak),
    laborShareWarnPct: String(current.laborShareWarnPct),
    singleChannelWarnPct: String(current.singleChannelWarnPct),
  });
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function save() {
    try {
      const parsed = parseHighlightSettings(form);
      setError(undefined);
      await onSave(parsed);
      setSaved(true);
    } catch (e) {
      setSaved(false);
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  const field = (key: keyof typeof form, label: string) => (
    <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {label}
      <input
        type="text"
        inputMode="numeric"
        value={form[key]}
        onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setSaved(false); }}
        style={settingsInput}
      />
    </label>
  );

  function applyPreset(t: { declineWarnStreak: number; declineCriticalStreak: number; laborShareWarnPct: number; singleChannelWarnPct: number }) {
    setForm({
      declineWarnStreak: String(t.declineWarnStreak),
      declineCriticalStreak: String(t.declineCriticalStreak),
      laborShareWarnPct: String(t.laborShareWarnPct),
      singleChannelWarnPct: String(t.singleChannelWarnPct),
    });
    setSaved(false);
    setError(undefined);
  }

  return (
    <div>
      <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
        経営ハイライトの警告条件を業種・方針に合わせて調整できます。業種プリセットで初期値を入れてから微調整し、保存すると以後の判定に反映されます。
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>業種プリセット:</span>
        {INDUSTRY_PRESETS.map((p) => (
          <button key={p.id} type="button" title={p.note} onClick={() => applyPreset(p.thresholds)} style={{ fontSize: 12 }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {field('declineWarnStreak', '連続下落 警告(期)')}
        {field('declineCriticalStreak', '連続下落 危険(期)')}
        {field('laborShareWarnPct', '労働分配率 警告(%)')}
        {field('singleChannelWarnPct', '単一チャネル依存(%)')}
        <button type="button" onClick={save}>保存</button>
      </div>
      {error && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{error}</div>}
      {saved && !error && <div style={{ color: '#22c55e', fontSize: 12, marginTop: 6 }}>保存しました。</div>}
    </div>
  );
}

function Sparkline({ label, values, color }: { label: string; values: number[]; color: string }) {
  const W = 160, H = 40;
  const g = sparklinePoints(values, W, H, 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{label}</span>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label={`${label} の推移`}>
        {g.zeroY !== null && <line x1={0} y1={g.zeroY} x2={W} y2={g.zeroY} stroke="var(--border)" strokeDasharray="2 2" />}
        <polyline points={g.polyline} fill="none" stroke={color} strokeWidth={1.5} />
        {g.points.length > 0 && <circle cx={g.points[g.points.length - 1]!.x} cy={g.points[g.points.length - 1]!.y} r={2.5} fill={color} />}
      </svg>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 18px',
      flex: 1,
      minWidth: 170,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function OverviewPage() {
  const { plan } = usePlan();
  const { records: salesRecords } = useCollection<SalesEntry>(SALES_COLLECTION);
  const { records: kpiRecords } = useCollection<KpiActual>(KPI_ACTUALS_COLLECTION);
  const { records: budgetRecords } = useCollection<KpiActual>(KPI_BUDGETS_COLLECTION);
  const { records: bsRecords } = useCollection<BalanceSheet>(BALANCE_SHEET_COLLECTION);
  const { records: memberRecords } = useCollection<Member>(MEMBERS_COLLECTION);
  const { records: settingsRecords, add: addSettings } = useCollection<HighlightSettings>(HIGHLIGHT_SETTINGS_COLLECTION);
  // しきい値設定は最新の1レコードを採用 (未設定なら既定値)。
  const thresholds = settingsRecords.length > 0 ? settingsRecords[settingsRecords.length - 1]!.data : DEFAULT_HIGHLIGHT_THRESHOLDS;
  // 会計連携 (freee): 連携済みなら月次CFが入る。未連携は空 (snapshot)。
  const { data: freeeData } = useServiceData('freee', SNAPSHOT.freee);
  const accountingMonthly = freeeData.monthly;
  // 資金調達レーダー: 月次返済スケジュールを会計CFと突合して DSCR を算定。
  const { data: fundingData } = useServiceData('funding', SNAPSHOT.funding);
  const repayments = useMemo(
    () => fundingData.monthly.map((m) => ({ month: m.month, repayment: m.repayment })),
    [fundingData],
  );
  const debtService = useMemo(
    () => combineCashflowDebtService(accountingMonthly, repayments),
    [accountingMonthly, repayments],
  );

  const overview = useMemo(
    () =>
      buildBusinessOverview({
        plan,
        sales: salesRecords.map((r) => r.data),
        kpiActuals: kpiRecords.map((r) => r.data),
        kpiBudgets: budgetRecords.map((r) => r.data),
        // BS は最新の 1 レコードを採用。
        balanceSheet: bsRecords.length > 0 ? bsRecords[bsRecords.length - 1]!.data : null,
        accounting: accountingMonthly,
        members: memberRecords.map((r) => ({ role: r.data.role })),
      }),
    [plan, salesRecords, kpiRecords, budgetRecords, bsRecords, accountingMonthly, memberRecords],
  );

  // 経営スコアカード — KPI実績から収益性・安全性・成長性を集約 (データがある時のみ意味を持つ)。
  const scorecard = useMemo(() => {
    if (!overview.kpi.hasData) return buildManagementScorecard({});
    const hasRevenue = overview.kpi.revenue > 0;
    return buildManagementScorecard({
      operatingMarginPct: hasRevenue ? overview.kpi.operatingMarginPct : undefined,
      grossMarginPct: hasRevenue ? overview.kpi.grossMarginPct : undefined,
      contributionRatioPct: hasRevenue ? overview.kpi.contributionRatio : undefined,
      safetyMarginPct: overview.kpi.safetyMargin,
      // 資金繰り: 会計連携CF + 現預金からランウェイを、会計CF×返済から DSCR を加点。
      runwayMonths: overview.runwayMonths ?? undefined,
      dscr: debtService?.overallDscr ?? undefined,
      // 安全性: 貸借対照表を入力すると自己資本比率が加点される。
      equityRatioPct: overview.financialPosition?.equityRatioPct ?? undefined,
      // 成長性: 期 (YYYY-MM) が 2 つ以上揃うと前期比成長率が自動で加点される。
      revenueGrowthPct: overview.kpi.revenueGrowthPct ?? undefined,
      // 効率性: CCC と総資産回転率 (BS + 運転資金が揃うと加点)。
      cashConversionDays: overview.workingCapital?.ccc ?? undefined,
      assetTurnover: overview.financialPosition && overview.financialPosition.totalAssets > 0 && overview.kpi.revenue > 0
        ? Math.round((overview.kpi.revenue / overview.financialPosition.totalAssets) * 100) / 100
        : undefined,
    });
  }, [overview, debtService]);

  const highlights = useMemo(
    () => buildManagementHighlights(overview, { overallDscr: debtService?.overallDscr, thresholds }),
    [overview, debtService, thresholds],
  );

  const monthlyTrend = useMemo(() => monthlyTrendSeries(kpiRecords.map((r) => r.data)), [kpiRecords]);
  const fundamentals = useMemo(() => summarizeFundamentals(kpiRecords.map((r) => r.data)), [kpiRecords]);
  const sensitivity = useMemo(() => {
    if (!overview.kpi.hasData) return null;
    return { rows: profitSensitivity(fundamentals), breakEvenDelta: breakEvenDeltaPct(fundamentals) };
  }, [overview.kpi.hasData, fundamentals]);

  const [targetProfit, setTargetProfit] = useState('');
  const targetRevenue = useMemo(() => {
    const t = Number(targetProfit);
    if (!overview.kpi.hasData || !Number.isFinite(t) || targetProfit.trim() === '') return null;
    return requiredRevenueForTarget(fundamentals, t);
  }, [overview.kpi.hasData, fundamentals, targetProfit]);

  const [reportCopied, setReportCopied] = useState(false);
  const report = useMemo(
    () => buildManagementReport(overview, scorecard, highlights, new Date().toISOString().slice(0, 10), monthlyTrend, sensitivity?.breakEvenDelta ?? null),
    [overview, scorecard, highlights, monthlyTrend, sensitivity],
  );

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setReportCopied(true);
    } catch {
      setReportCopied(false);
    }
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `management-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasData =
    salesRecords.length > 0 || kpiRecords.length > 0 || memberRecords.length > 0;

  return (
    <div>
      {hasData && highlights.length > 0 && (
        <Section title={`経営ハイライト — 総合 ${scorecard.overallScore}/100（${VERDICT_LABEL[scorecard.verdict]}）`}>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {highlights.map((h, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                <span style={{ fontSize: 14 }}>{h.severity === 'critical' ? '🔴' : h.severity === 'warning' ? '🟡' : '🟢'}</span>
                <span style={{ color: 'var(--text-mute)', minWidth: 64 }}>{h.category}</span>
                <span style={{ color: 'var(--text)' }}>{h.message}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button type="button" onClick={copyReport}>経営レポートをコピー (Markdown)</button>
            <button type="button" onClick={downloadReport}>レポートをダウンロード</button>
            {reportCopied && <span style={{ color: '#22c55e', fontSize: 12 }}>コピーしました。</span>}
          </div>
          <p style={{ color: 'var(--text-mute)', fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
            ※ 入力済みデータからの概算の経営診断です。財務・税務助言ではありません。役員会・銀行・税理士への共有にご利用ください。
          </p>
        </Section>
      )}

      {monthlyTrend.length >= 2 && (
        <Section title="月次推移">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <Sparkline label="売上高" values={monthlyTrend.map((r) => r.revenue)} color="#3ec98a" />
            <Sparkline label="営業利益" values={monthlyTrend.map((r) => r.operatingProfit)} color="#4f9cf9" />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                  <th style={{ padding: '4px 8px' }}>期間</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>売上高</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>営業利益</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>営業利益率</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>前期比</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTrend.map((r) => (
                  <tr key={r.period} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px' }}>{r.period}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(r.revenue)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: r.operatingProfit >= 0 ? 'var(--text)' : '#ef4444' }}>{yen.format(r.operatingProfit)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.operatingMarginPct.toFixed(1)}%</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: r.revenueGrowthPct === null ? 'var(--text-mute)' : r.revenueGrowthPct >= 0 ? '#22c55e' : '#ef4444' }}>
                      {r.revenueGrowthPct === null ? '—' : `${r.revenueGrowthPct > 0 ? '+' : ''}${r.revenueGrowthPct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {sensitivity && (
        <Section title="損益感度分析 (売上が変動したら)">
          <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            売上が増減したときの営業利益の試算です (変動費は売上比例・固定費は一定と仮定)。
            {sensitivity.breakEvenDelta !== null && (
              <> 損益分岐点まで売上 <strong>{sensitivity.breakEvenDelta > 0 ? '+' : ''}{sensitivity.breakEvenDelta}%</strong> の余地があります。</>
            )}
            <strong>※ 概算試算であり財務助言ではありません。</strong>
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                  <th style={{ padding: '4px 8px' }}>売上変動</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>売上高</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>営業利益</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>営業利益率</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.rows.map((r) => (
                  <tr key={r.deltaPct} style={{ borderTop: '1px solid var(--border)', fontWeight: r.deltaPct === 0 ? 600 : 400 }}>
                    <td style={{ padding: '4px 8px' }}>{r.deltaPct > 0 ? '+' : ''}{r.deltaPct}%{r.deltaPct === 0 ? ' (現状)' : ''}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(r.revenue)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: r.operatingProfit >= 0 ? '#22c55e' : '#ef4444' }}>{yen.format(r.operatingProfit)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.operatingMarginPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 6 }}>目標利益から必要売上を逆算</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                inputMode="numeric"
                value={targetProfit}
                placeholder="目標営業利益 (円)"
                onChange={(e) => setTargetProfit(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13, width: 160 }}
              />
              {targetRevenue && (
                targetRevenue.upliftPct === null ? (
                  <span style={{ fontSize: 13, color: 'var(--text-mute)' }}>限界利益が非正のため算定できません。</span>
                ) : (
                  <span style={{ fontSize: 13 }}>
                    必要売上 <strong>{yen.format(targetRevenue.requiredRevenue)}</strong>
                    （現状から <strong style={{ color: targetRevenue.upliftPct >= 0 ? '#f59e0b' : '#22c55e' }}>{targetRevenue.upliftPct > 0 ? '+' : ''}{targetRevenue.upliftPct}%</strong>）
                  </span>
                )
              )}
            </div>
          </div>
        </Section>
      )}

      {hasData && (
        <Section title="ハイライトのしきい値設定">
          <HighlightSettingsPanel current={thresholds} onSave={(s) => addSettings(s)} />
        </Section>
      )}

      <Section title={`経営サマリー — ${overview.plan.label} プラン（${overview.plan.audience}）`}>
        {!hasData && (
          <p style={{ color: 'var(--text-mute)', fontSize: 13, marginBottom: 12 }}>
            売上集計・KPI 実績・チーム管理にデータを入力すると、ここに経営概況がまとまって表示されます。
          </p>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>売上</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Tile label="総売上" value={yen.format(overview.sales.totalAmount)} sub={overview.sales.topChannel ? `主力: ${overview.sales.topChannel}` : undefined} />
          <Tile label="総注文件数" value={num.format(overview.sales.totalOrders)} />
          <Tile label="平均注文単価" value={safeYen(overview.sales.aov)} />
          <Tile label="販売チャネル数" value={`${overview.sales.channelCount}`} />
          {overview.sales.concentration && (
            <Tile
              label="売上分散スコア"
              value={`${overview.sales.concentration.diversityScore} / 100`}
              accent={overview.sales.concentration.singleChannelRisk ? '#f59e0b' : undefined}
              sub={`実効 ${overview.sales.concentration.effectiveChannels} ch・最大 ${overview.sales.concentration.topChannel ?? '—'} ${overview.sales.concentration.topSharePct}%`}
            />
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>収益性 (KPI)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {overview.kpi.hasData ? (
            <>
              <Tile
                label="営業利益"
                value={yen.format(overview.kpi.operatingProfit)}
                accent={overview.flags.profitable ? '#22c55e' : '#ef4444'}
                sub={`営業利益率 ${overview.kpi.operatingMarginPct.toFixed(1)}%`}
              />
              <Tile
                label="売上総利益 (粗利)"
                value={yen.format(overview.kpi.grossProfit)}
                sub={`粗利率 ${overview.kpi.grossMarginPct.toFixed(1)}%`}
              />
              <Tile
                label="EBITDA"
                value={yen.format(overview.kpi.ebitda)}
                sub={`償却前営業利益・マージン ${overview.kpi.ebitdaMarginPct.toFixed(1)}%`}
              />
              <Tile label="限界利益率" value={`${overview.kpi.contributionRatio.toFixed(1)}%`} sub="高いほど固定費を回収しやすい" />
              <Tile label="損益分岐点 (BEP)" value={safeYen(overview.kpi.bep)} />
              <Tile label="安全余裕率" value={`${overview.kpi.safetyMargin.toFixed(1)}%`} sub="高いほど安全" />
            </>
          ) : (
            <Tile label="KPI" value="未入力" sub="KPI 実績を入力すると表示" />
          )}
        </div>

        {overview.kpi.hasData && overview.kpi.revenue > 0 && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>コスト構造 (対売上)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Tile label="原価率" value={`${overview.kpi.cogsRatioPct.toFixed(1)}%`} />
              <Tile label="広告費比率" value={`${overview.kpi.advertisingRatioPct.toFixed(1)}%`} />
              <Tile label="販管費率" value={`${overview.kpi.sgaRatioPct.toFixed(1)}%`} />
            </div>
          </>
        )}

        {overview.kpi.hasData && overview.productivity.members > 0 && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>生産性 (一人当たり)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Tile label="一人当たり売上" value={yen.format(overview.productivity.revenuePerCapita)} sub={`${overview.productivity.members} 名`} />
              <Tile
                label="一人当たり営業利益"
                value={yen.format(overview.productivity.operatingProfitPerCapita)}
                accent={overview.productivity.operatingProfitPerCapita >= 0 ? '#22c55e' : '#ef4444'}
              />
              {overview.productivity.labor.laborCost > 0 && (
                <>
                  <Tile label="労働分配率" value={pctOrDash(overview.productivity.labor.laborSharePct)} sub="人件費÷粗利 (目安50%前後)" />
                  <Tile label="人件費率" value={pctOrDash(overview.productivity.labor.laborToRevenuePct)} sub="人件費÷売上" />
                  {overview.productivity.labor.laborPerCapita !== null && (
                    <Tile label="一人当たり人件費" value={yen.format(overview.productivity.labor.laborPerCapita)} />
                  )}
                </>
              )}
            </div>
          </>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>組織</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tile
            label="メンバー / シート"
            value={`${overview.team.members} / ${overview.team.seatLimit === Infinity ? '∞' : overview.team.seatLimit}`}
            accent={overview.flags.seatsFull ? '#f59e0b' : undefined}
            sub={overview.flags.seatsFull ? 'シート上限に到達' : `残り ${overview.team.seatsRemaining === Infinity ? '無制限' : overview.team.seatsRemaining}`}
          />
        </div>
      </Section>

      {overview.kpi.hasData && (
        <Section title={`経営スコアカード — 総合 ${scorecard.overallScore}/100（${VERDICT_LABEL[scorecard.verdict]}）`}>
          <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            収益性・安全性・資金繰り・成長性の経営指標を 0〜100 で集約した健全性スコアです。
            <strong>※ 概算の経営診断であり財務助言ではありません。</strong>業種・規模で適正値は異なります。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {scorecard.categories.map((c) => (
              <div key={c.category} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: SCORE_COLOR(c.score) }}>
                  {c.score === null ? '—' : `${c.score}`}
                  {c.score !== null && <span style={{ fontSize: 12, color: 'var(--text-mute)' }}> /100</span>}
                </div>
                {c.components.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 4 }}>
                    {c.components.map((x) => x.label).join(' / ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          {scorecard.alerts.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12, color: '#f59e0b', lineHeight: 1.7 }}>
              {scorecard.alerts.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          {(overview.kpi.revenueGrowthPct !== null || overview.kpi.revenueCagrPct !== null) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Tile
                label="前期比成長率"
                value={overview.kpi.revenueGrowthPct === null ? '—' : `${overview.kpi.revenueGrowthPct > 0 ? '+' : ''}${overview.kpi.revenueGrowthPct}%`}
                accent={overview.kpi.revenueGrowthPct === null ? undefined : overview.kpi.revenueGrowthPct >= 0 ? '#22c55e' : '#ef4444'}
                sub="直近期 vs 前期"
              />
              <Tile
                label="平均成長率 (CAGR)"
                value={overview.kpi.revenueCagrPct === null ? '—' : `${overview.kpi.revenueCagrPct > 0 ? '+' : ''}${overview.kpi.revenueCagrPct}%`}
                sub="1 期あたり複利"
              />
              <Tile
                label="トレンド"
                value={TREND_LABEL[overview.kpi.revenueTrend ?? 'none'] ?? '—'}
                accent={TREND_COLOR[overview.kpi.revenueTrend ?? 'none']}
                sub="移動平均の方向"
              />
              {overview.kpi.revenueLanding && (
                <Tile
                  label="売上 着地見込み"
                  value={yen.format(overview.kpi.revenueLanding.runRateForecast)}
                  sub={`${overview.kpi.revenueLanding.year}年・${overview.kpi.revenueLanding.monthsElapsed}か月実績から年換算`}
                />
              )}
            </div>
          )}
          <p style={{ color: 'var(--text-mute)', fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
            成長性は KPI 実績の期 (YYYY-MM) が 2 つ以上揃うと前期比で自動加点されます。CAGR・トレンドは
            期が増えるほど精度が上がります。資金繰り (DSCR・ランウェイ) は会計連携データが揃うと加点されます。
          </p>
        </Section>
      )}

      {overview.budget && (
        <Section title="予算実績差異 (BVA)">
          <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            予算 (計画) と実績の差異・達成率です。<strong>※ 予算と実績は同じ期間粒度で入力してください</strong>
            （年間 vs 年間、または月次 vs 月次）。予算は KPI ページで入力できます。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              { label: '売上高', v: overview.budget.revenue },
              { label: '営業利益', v: overview.budget.operatingProfit },
            ] as const).map(({ label, v }) => (
              <Tile
                key={label}
                label={`${label} 達成率`}
                value={v.achievementPct === null ? '—' : `${v.achievementPct}%`}
                accent={v.achievementPct === null ? undefined : v.achievementPct >= 100 ? '#22c55e' : v.achievementPct >= 90 ? '#f59e0b' : '#ef4444'}
                sub={`予算 ${yen.format(v.budget)} / 実績 ${yen.format(v.actual)} (差異 ${v.variance >= 0 ? '+' : ''}${yen.format(v.variance)})`}
              />
            ))}
          </div>
        </Section>
      )}

      {overview.accounting && (
        <Section title="会計連携 — 営業キャッシュフロー (freee)">
          <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            freee 会計の取引から取得した月次の営業キャッシュフローです。
            {overview.runwayMonths !== null
              ? '現預金 (貸借対照表) と合わせて資金ランウェイを算定し、スコアカードの資金繰りに反映します。'
              : '貸借対照表に現預金を入力すると資金ランウェイも算定されます。'}
            <strong>※ 概算であり財務助言ではありません。</strong>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Tile label="営業CF 合計" value={yen.format(overview.accounting.totalNet)} accent={overview.accounting.cashflowPositive ? '#22c55e' : '#ef4444'} sub={`${overview.accounting.months} か月`} />
            <Tile label="月次平均 営業CF" value={yen.format(overview.accounting.avgMonthlyNet)} accent={overview.accounting.avgMonthlyNet >= 0 ? '#22c55e' : '#ef4444'} />
            <Tile label={`直近月 (${overview.accounting.latestMonth})`} value={yen.format(overview.accounting.latestNet)} accent={overview.accounting.latestNet >= 0 ? '#22c55e' : '#ef4444'} />
            <Tile
              label="資金ランウェイ"
              value={overview.runwayMonths === null ? (overview.accounting.avgMonthlyNet >= 0 ? '資金流出なし' : '—') : `${overview.runwayMonths} か月`}
              accent={overview.runwayMonths === null ? undefined : overview.runwayMonths >= 12 ? '#22c55e' : overview.runwayMonths >= 6 ? '#f59e0b' : '#ef4444'}
              sub="現預金 ÷ 月次純流出"
            />
          </div>
          {overview.cashForecast && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <Tile
                label="12か月後の予測残高"
                value={yen.format(overview.cashForecast.rows[overview.cashForecast.rows.length - 1]?.balance ?? overview.cashForecast.openingBalance)}
                accent={(overview.cashForecast.rows[overview.cashForecast.rows.length - 1]?.balance ?? 0) >= 0 ? '#22c55e' : '#ef4444'}
                sub="現預金＋月次CFの外挿"
              />
              <Tile
                label="資金ショート予測"
                value={overview.cashForecast.shortfallMonthIndex === null ? '12か月内なし' : `${overview.cashForecast.shortfallMonthIndex} か月後`}
                accent={overview.cashForecast.shortfallMonthIndex === null ? '#22c55e' : '#ef4444'}
                sub={`期間中の最低残高 ${yen.format(overview.cashForecast.minBalance)}`}
              />
              <Sparkline
                label="予測残高の推移"
                values={cashForecastTrajectory(overview.cashForecast)}
                color={overview.cashForecast.shortfallMonthIndex === null ? '#3ec98a' : '#ef4444'}
              />
            </div>
          )}
        </Section>
      )}

      {debtService && (
        <Section title="返済余力 (DSCR) — 会計CF × 資金調達の同時連携">
          <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            会計連携 (freee) の月次営業CF と、資金調達レーダーの月次返済額を突合した返済余力です。
            DSCR が 1.0 以上なら営業CF で返済を賄えています。<strong>※ 概算であり財務助言ではありません。</strong>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Tile
              label="全体カバー率 (DSCR)"
              value={debtService.overallDscr === null ? '—' : `${debtService.overallDscr}`}
              accent={debtService.overallDscr === null ? undefined : debtService.overallDscr >= 1 ? '#22c55e' : '#ef4444'}
              sub="営業CF合計 ÷ 返済額合計"
            />
            <Tile
              label="最悪月カバー率"
              value={debtService.worstMonthDscr === null ? '—' : `${debtService.worstMonthDscr}`}
              accent={debtService.worstMonthDscr === null ? undefined : debtService.worstMonthDscr >= 1 ? '#22c55e' : '#ef4444'}
            />
            <Tile label="カバー率1.0未満の月" value={`${debtService.shortfallMonths} / ${debtService.coveredMonths} か月`} accent={debtService.shortfallMonths > 0 ? '#f59e0b' : undefined} />
          </div>
        </Section>
      )}

      {overview.financialPosition && (
        <Section title="財政状態 (貸借対照表ベース)">
          <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            貸借対照表から算出した安全性・収益性の指標です。<strong>※ 概算の財務分析であり財務助言ではありません。</strong>
            業種・規模で適正値は異なります。{overview.financialPosition.insolvent && (
              <strong style={{ color: '#ef4444' }}> ⚠ 純資産がマイナス（債務超過）です。</strong>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Tile label="自己資本比率" value={pctOrDash(overview.financialPosition.equityRatioPct)} sub="高いほど安全 (目安40%以上)" />
            <Tile label="流動比率" value={pctOrDash(overview.financialPosition.currentRatioPct)} sub="目安200%以上" />
            <Tile label="当座比率" value={pctOrDash(overview.financialPosition.quickRatioPct)} sub="目安100%以上" />
            <Tile label="ROA (総資産利益率)" value={pctOrDash(overview.financialPosition.roaPct)} />
            <Tile label="ROE (自己資本利益率)" value={pctOrDash(overview.financialPosition.roePct)} />
            <Tile label="固定比率" value={pctOrDash(overview.financialPosition.fixedRatioPct)} sub="目安100%以下" />
          </div>
          {overview.workingCapital && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '12px 0 4px' }}>運転資金 (CCC)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Tile
                  label="CCC (現金回収日数)"
                  value={overview.workingCapital.ccc === null ? '—' : `${overview.workingCapital.ccc} 日`}
                  accent={overview.workingCapital.ccc === null ? undefined : overview.workingCapital.ccc <= 0 ? '#22c55e' : overview.workingCapital.ccc <= 60 ? '#3ec98a' : '#f59e0b'}
                  sub="短い(マイナス)ほど資金繰りが楽"
                />
                <Tile label="売上債権回転 (DSO)" value={overview.workingCapital.dso === null ? '—' : `${overview.workingCapital.dso} 日`} />
                <Tile label="棚卸回転 (DIO)" value={overview.workingCapital.dio === null ? '—' : `${overview.workingCapital.dio} 日`} />
                <Tile label="仕入債務回転 (DPO)" value={overview.workingCapital.dpo === null ? '—' : `${overview.workingCapital.dpo} 日`} />
                <Tile label="運転資本" value={yen.format(overview.workingCapital.workingCapital)} sub="売上債権+棚卸−仕入債務" />
              </div>
            </>
          )}
        </Section>
      )}
    </div>
  );
}
