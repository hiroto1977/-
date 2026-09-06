/**
 * 事業別 財務分析ビュー (Phase 2) — 各事業の概算財務から 15 指標を算出し、
 * レーダー / 折れ線 / 円 / 棒 の 4 種チャート + 指標テーブルで可視化する。
 *
 * データ源: BusinessPage と同じ事業ユニット (月次 KPI + 履歴)。
 * deriveBusinessFinancials → computeFinancialRatios → radarAxes で連動する。
 *
 * **概算であり財務助言ではありません。**
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { calcCorporateTax, type CorporateTaxRates } from '../../shared/taxCorporate';
import type { BusinessConsumptionParams } from '../../shared/taxConsumptionBusiness';
import {
  compareBusinessTaxMethods,
  isTaxExempt,
  canUseSimplified,
  EXEMPTION_THRESHOLD,
  SIMPLIFIED_ELIGIBILITY_THRESHOLD,
} from '../../shared/taxConsumptionBusiness';
import {
  TWENTY_PERCENT_MEASURE_END,
  TWENTY_PERCENT_RATE,
  twentyPercentMeasureStatus,
  type SimplifiedBusinessType,
  type ConsumptionTaxMethod,
} from '../../shared/taxConsumption';
import { formatDate } from '../../shared/bankFormat';
import { deriveBusinessFinancials, type MonthlyBusinessKpi } from '../data/businessFinancials';
import { AxonometricCharts } from './AxonometricCharts';
import { computeFinancialRatios, radarAxes, type FinancialRatios } from '../data/financialRatios';
import { diagnoseFinancials, levelOf, type HealthGrade, type HealthLevel } from '../data/financialDiagnosis';
import type { HealthBands, RadarBands } from '../../shared/financialHealthBands';
import { ratiosToCsv, statementToCsv } from '../data/financialCsv';
import { analyzeMarginTrend, type MarginTrend } from '../data/financialTrend';
import { buildFinancialReportMarkdown } from '../data/financialReport';
import { consolidationScope, consolidationLabel } from '../data/consolidation';
import { buildIncomeStatement, buildBalanceSheet, buildCashflowStatement, buildVariableCostingStatement, buildComprehensiveIncome, buildEquityChangeStatement, buildQuarterlyStatement, buildNotesStatement, buildSupplementarySchedule, buildAccountBreakdown, sumFinancialInputs, type StatementLine } from '../data/financialStatements';
import { localIsoDate } from '../../shared/localDate';

export interface FinancialUnit {
  readonly id: string;
  readonly label: string;
  readonly current: MonthlyBusinessKpi;
  /**
   * 過去の月次実績 (古い順)。
   *
   * `{revenue, profit}` だけに絞っていたが、snapshot は元から月次 KPI を丸ごと
   * 持っている。絞ると 3 軸グラフが過去の指標を出せず、当期の値で埋めるしか
   * なくなる (= 無い数字を描くことになる) ので、そのまま通す。
   */
  readonly history: readonly MonthlyBusinessKpi[];
  /** 同梱の模擬データなら true。連結の合算対象から外すために要る (出所が違うものを足さない)。 */
  readonly sample?: boolean;
}

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const PALETTE = ['#5b8def', '#ec9a3d', '#5cb85c', '#e36b6b', '#a06bd2', '#43c3b8', '#d2b06b', '#888'];

function fmtRatio(v: number | null, unit: string): string {
  if (v == null) return '—';
  return `${v.toLocaleString('ja-JP')}${unit}`;
}

// --- レーダー (15 軸・0-100 スコア) --------------------------------------
function RadarChart({ axes }: { axes: ReturnType<typeof radarAxes> }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const n = axes.length;
  const point = (i: number, score: number) => {
    const theta = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    const rr = (score / 100) * radius;
    return { x: cx + Math.cos(theta) * rr, y: cy + Math.sin(theta) * rr };
  };
  const poly = axes.map((a, i) => point(i, a.score)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  // 軸ラベルは半径の 113% 位置に置き、左右上下に十分な余白 (PAD) を取った viewBox に
  // 収めることで、長いラベル (固定長期適合率 / 売上債権回転率 等) が端で見切れないようにする。
  const PAD_X = 96;
  const PAD_Y = 22;
  return (
    <svg viewBox={`${-PAD_X} ${-PAD_Y} ${size + PAD_X * 2} ${size + PAD_Y * 2}`} width="100%" style={{ maxWidth: size + PAD_X * 2, height: 'auto', display: 'block', margin: '0 auto', overflow: 'visible' }} role="img" aria-label="財務指標レーダー">
      {[20, 40, 60, 80, 100].map((lvl) => (
        <polygon key={lvl} points={axes.map((_, i) => point(i, lvl)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#2a2f3a" strokeDasharray="2,3" />
      ))}
      {axes.map((a, i) => {
        const outer = point(i, 100);
        const lp = point(i, 113);
        const anchor = Math.abs(lp.x - cx) < 8 ? 'middle' : lp.x > cx ? 'start' : 'end';
        return (
          <g key={a.key}>
            <line x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#2a2f3a" />
            <text x={lp.x} y={lp.y} fontSize={9} fill="#94a3b8" textAnchor={anchor} dominantBaseline="middle">{a.label}</text>
          </g>
        );
      })}
      <polygon points={poly} fill="rgba(91,141,239,0.20)" stroke="#5b8def" strokeWidth={2} />
      {axes.map((a, i) => { const p = point(i, a.score); return <circle key={a.key} cx={p.x} cy={p.y} r={2.5} fill="#5b8def" />; })}
    </svg>
  );
}

// --- 折れ線 (営業利益率の推移) ------------------------------------------
function LineChart({ values }: { values: number[] }) {
  const W = 360, H = 140, P = 28;
  if (values.length < 2) return <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>履歴データが不足しています</div>;
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => P + (i / (values.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - min) / range) * (H - P * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: 'auto', display: 'block' }} role="img" aria-label="営業利益率の推移">
      <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke="#2a2f3a" strokeDasharray="2,3" />
      <polyline fill="none" stroke="#5cb85c" strokeWidth={2} points={pts} />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill="#5cb85c" />)}
      <text x={P} y={12} fontSize={9} fill="#94a3b8">営業利益率の推移 (%)</text>
    </svg>
  );
}

// --- 円 (売上構成) ------------------------------------------------------
function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const size = 150, cx = size / 2, cy = size / 2, r = size * 0.42;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  let angle = -Math.PI / 2;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="売上構成">
        {slices.map((s) => {
          const frac = Math.max(0, s.value) / total;
          const a0 = angle;
          const a1 = angle + frac * 2 * Math.PI;
          angle = a1;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
          const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
          if (frac <= 0) return null;
          return <path key={s.label} d={`M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`} fill={s.color} stroke="var(--bg)" strokeWidth={1} />;
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            {s.label} {((Math.max(0, s.value) / total) * 100).toFixed(1)}%
          </div>
        ))}
      </div>
    </div>
  );
}

// --- 棒 (1指標の事業間比較) --------------------------------------------
function BarChart({ rows, unit }: { rows: { label: string; value: number | null }[]; unit: string }) {
  const vals = rows.map((r) => r.value ?? 0);
  const max = Math.max(1, ...vals.map((v) => Math.abs(v)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r, i) => {
        const v = r.value ?? 0;
        const w = (Math.abs(v) / max) * 100;
        return (
          <div key={r.label} data-bar-row={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.2fr) 2fr 64px', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span title={r.label} style={{ color: 'var(--text-mute)', overflowWrap: 'anywhere', lineHeight: 1.25 }}>{r.label}</span>
            <div style={{ background: 'var(--bg)', borderRadius: 3, height: 14, position: 'relative' }}>
              <div style={{ width: `${w}%`, height: '100%', background: PALETTE[i % PALETTE.length], borderRadius: 3 }} />
            </div>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRatio(r.value, unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- 指標テーブル -------------------------------------------------------
const RATIO_ROWS: { key: keyof FinancialRatios; label: string; unit: string; money?: boolean }[] = [
  { key: 'equityRatioPct', label: '自己資本比率', unit: '%' },
  { key: 'currentRatioPct', label: '流動比率', unit: '%' },
  { key: 'fixedLongTermFitPct', label: '固定長期適合率', unit: '%' },
  { key: 'debtToMonthlySalesRatio', label: '借入金月商倍率', unit: 'ヶ月' },
  { key: 'debtRepaymentYears', label: '債務償還年数', unit: '年' },
  { key: 'operatingMarginPct', label: '営業利益率', unit: '%' },
  { key: 'ordinaryMarginPct', label: '経常利益率', unit: '%' },
  { key: 'netMarginPct', label: '当期純利益率', unit: '%' },
  { key: 'netProfit', label: '当期純利益', unit: '', money: true },
  { key: 'laborSharePct', label: '労働分配率', unit: '%' },
  { key: 'ebitda', label: 'EBITDA', unit: '', money: true },
  { key: 'ebitdaMarginPct', label: 'EBITDAマージン', unit: '%' },
  { key: 'receivablesTurnover', label: '売上債権回転率', unit: '倍' },
  { key: 'inventoryTurnover', label: '棚卸資産回転率', unit: '倍' },
  { key: 'cccDays', label: 'CCC', unit: '日' },
  { key: 'roaPct', label: 'ROA', unit: '%' },
  { key: 'roePct', label: 'ROE', unit: '%' },
  // NOPAT / ROIC は round 68 から計算していたが表に無かった (計算しているのに出していない)。
  // 実効税率 (台帳 `finance.effectiveTaxRate`) が効く唯一の見える場所なので、ここで出す。
  { key: 'nopat', label: 'NOPAT (税引後営業利益)', unit: '', money: true },
  { key: 'roicPct', label: 'ROIC', unit: '%' },
];

const BAR_OPTIONS: { key: keyof FinancialRatios; label: string; unit: string }[] = [
  { key: 'operatingMarginPct', label: '営業利益率', unit: '%' },
  { key: 'equityRatioPct', label: '自己資本比率', unit: '%' },
  { key: 'roePct', label: 'ROE', unit: '%' },
  { key: 'roaPct', label: 'ROA', unit: '%' },
  { key: 'ebitdaMarginPct', label: 'EBITDAマージン', unit: '%' },
  { key: 'cccDays', label: 'CCC', unit: '日' },
];

const cardStyle: CSSProperties = {
  background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, minWidth: 0,
};

// --- 財務三表 (PL/BS/CF) ------------------------------------------------
function StatementTable({ lines }: { lines: readonly StatementLine[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {lines.map((l, i) => (
          <tr key={`${l.label}-${i}`} style={l.emphasis ? { fontWeight: 700, background: 'rgba(255,255,255,0.03)' } : undefined}>
            <td style={{ padding: '3px 8px', paddingLeft: 8 + (l.indent ?? 0) * 16, borderBottom: '1px solid var(--border)', color: l.indent ? 'var(--text-mute)' : 'var(--text)' }}>{l.label}</td>
            <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {l.display ?? (l.amount == null ? '' : yen.format(l.amount))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- 法人税等 + 消費税 (概算) ブロック ----------------------------------
/** 簡易課税の事業区分ラベル (第1〜6種・みなし仕入率)。 */
const BIZ_TYPE_LABEL: Record<SimplifiedBusinessType, string> = {
  wholesale: '第1種 卸売業 (みなし仕入率90%)',
  retail: '第2種 小売業 (80%)',
  manufacturing: '第3種 製造業・建設業 (70%)',
  other: '第4種 飲食店業等 (60%)',
  service: '第5種 サービス業 (50%)',
  'real-estate': '第6種 不動産業 (40%)',
};

const CT_METHOD_LABEL: Record<ConsumptionTaxMethod, string> = {
  standard: '本則課税',
  simplified: '簡易課税',
  'twenty-percent': '2割特例',
};

/**
 * 経常利益 (ordinaryProfit) を課税所得の概算として `calcCorporateTax` を呼び出し、
 * 法人税等・実効税率・税引後利益を表示するカード。
 *
 * round 58: 任意の精度パラメータ入力欄 (資本金・従業者数・繰越欠損金) を追加。
 * 全欄空のとき → profile 未指定 (従来どおり中小・最小均等割・控除なし)。
 * いずれか入力があるとき → 入力値を profile に乗せて再計算し、
 * 実効税率・税引後利益・法人税等内訳がライブ更新される。
 *
 * 消費税ブロック: 課税売上 (既定 = 年商) と課税仕入 (既定 = 費用から給与・
 * 減価償却・支払利息など不課税/対象外を除いた概算) から、本則課税・簡易課税・
 * 2割特例の納付見込みを `compareBusinessTaxMethods` で比較し、最有利方式と
 * 「法人税等 + 消費税」の税負担合計を表示する。免税判定 (基準期間 1,000 万円
 * 以下) と簡易課税の適用可否 (同 5,000 万円以下) も注記する。
 *
 * 注意:
 * - 会計上の利益と税法上の課税所得の差異 (損金不算入等) は概算では無視する。
 * - 各種税額控除・中間納付・外形標準課税等は考慮しない。
 * - 消費税は預かった税と支払った税の差額を納付する仕組みのため、税引後利益の
 *   計算には含めない (税抜経理を前提)。軽減税率 8% の売上は未考慮。
 * - これは概算試算であり、正確な税額計算・税務助言ではありません。
 */
function CorporateTaxCard({
  ordinaryProfit,
  revenue,
  taxablePurchases,
  corporateTaxRates,
  businessConsumption,
}: {
  ordinaryProfit: number;
  /** 法人税等の率 (台帳の値)。省略すると定数。 */
  corporateTaxRates?: CorporateTaxRates;
  /** 事業者の消費税の率と境目 (台帳の値)。省略すると定数。 */
  businessConsumption?: BusinessConsumptionParams;
  /** 年間課税売上高の既定値 (税抜年商の概算)。 */
  revenue: number;
  /** 年間課税仕入高の既定値 (給与・償却・利息を除いた費用概算)。 */
  taxablePurchases: number;
}) {
  const [capitalStr, setCapitalStr] = useState('');
  const [employeesStr, setEmployeesStr] = useState('');
  const [carryforwardLossStr, setCarryforwardLossStr] = useState('');

  // 入力値のパース: 空文字/不正値 → undefined (既定に倒す)
  const capitalParsed = capitalStr.trim() !== '' ? parseFloat(capitalStr.replace(/,/g, '')) : undefined;
  const employeesParsed = employeesStr.trim() !== '' ? parseFloat(employeesStr.replace(/,/g, '')) : undefined;
  const carryforwardLossParsed = carryforwardLossStr.trim() !== '' ? parseFloat(carryforwardLossStr.replace(/,/g, '')) : undefined;

  // 全欄空なら profile 未指定 → 従来の呼び出しと完全同一
  const hasAnyInput = capitalParsed !== undefined || employeesParsed !== undefined || carryforwardLossParsed !== undefined;
  const profile = hasAnyInput
    ? {
        ...(capitalParsed !== undefined && isFinite(capitalParsed) ? { capital: Math.max(0, Math.round(capitalParsed)) } : {}),
        ...(employeesParsed !== undefined && isFinite(employeesParsed) ? { employees: Math.max(0, Math.round(employeesParsed)) } : {}),
        ...(carryforwardLossParsed !== undefined && isFinite(carryforwardLossParsed) ? { carryforwardLoss: Math.max(0, Math.round(carryforwardLossParsed)) } : {}),
      }
    : undefined;

  const breakdown = calcCorporateTax(ordinaryProfit, profile ?? {}, corporateTaxRates);
  const isLoss = ordinaryProfit <= 0;
  const afterTaxColor = breakdown.afterTaxProfit >= 0 ? '#5cb85c' : '#e36b6b';

  // --- 消費税 (本則 / 簡易 / 2割特例) ---
  const [ctSalesStr, setCtSalesStr] = useState('');
  const [ctPurchasesStr, setCtPurchasesStr] = useState('');
  const [ctBizType, setCtBizType] = useState<SimplifiedBusinessType>('service');

  const ctSalesParsed = ctSalesStr.trim() !== '' ? parseFloat(ctSalesStr.replace(/,/g, '')) : undefined;
  const ctPurchasesParsed = ctPurchasesStr.trim() !== '' ? parseFloat(ctPurchasesStr.replace(/,/g, '')) : undefined;
  const ctSales = ctSalesParsed !== undefined && isFinite(ctSalesParsed) ? Math.max(0, ctSalesParsed) : Math.max(0, revenue);
  const ctPurchases = ctPurchasesParsed !== undefined && isFinite(ctPurchasesParsed) ? Math.max(0, ctPurchasesParsed) : Math.max(0, taxablePurchases);

  const ctExempt = isTaxExempt(ctSales, businessConsumption?.exemptionThreshold);
  const ctSimplifiedOk = canUseSimplified(ctSales, businessConsumption?.simplifiedEligibilityThreshold);
  /*
   * 2 割特例は「免税だった事業者がインボイス登録で課税になった」場合の経過措置。
   * 登録の有無はアプリから見えないが、**免税の水準を超える売上なら元から免税では
   * ない**ので対象になりえない。免税判定と同じ代理指標 (この画面が入力した課税
   * 売上高) で外す —— 画面の注記も同じ代理で「基準期間（前々事業年度）も同水準なら」
   * と書いている。
   *
   * **期限つきの措置でもある。** `twentyPercentMeasureStatus()` は課税期間の規則で
   * 3 値に落とす。この card は課税期間を入力に持たないので、**言い切れる `ended`
   * でだけ**候補から外し、言い切れない帯は条件を欄に書いて選ばせる (下の caption)。
   */
  const ctMeasure = twentyPercentMeasureStatus();
  const ctTwentyPercentOk = ctExempt && ctMeasure !== 'ended';
  /** 期限の文面は定数から作る (書き写すと 2 か所になる)。「令和8年9月30日」。 */
  const measureEndLabel = formatDate(TWENTY_PERCENT_MEASURE_END, { era: 'wareki' });
  const measureNote =
    ctMeasure === 'ended'
      ? ` · 適用期限（${measureEndLabel}）が過ぎています`
      : ` · ${measureEndLabel}を含む課税期間まで`;
  // 選べないと宣言した方式で「最有利」を決めない (それが 2026-09-06 の実測の穴)。
  const ct = compareBusinessTaxMethods(
    [{ type: ctBizType, sales: { standard: ctSales, reduced: 0 } }],
    { standard: ctPurchases, reduced: 0 },
    businessConsumption,
    { simplified: ctSimplifiedOk, twentyPercent: ctTwentyPercentOk },
  );
  const simplifiedLimit = businessConsumption?.simplifiedEligibilityThreshold ?? SIMPLIFIED_ELIGIBILITY_THRESHOLD;
  const exemptionLimit = businessConsumption?.exemptionThreshold ?? EXEMPTION_THRESHOLD;
  const twentyPct = (businessConsumption?.twentyPercentRate ?? TWENTY_PERCENT_RATE) * 100;
  // 本則が還付見込み (負値) のときは合計に 0 として算入し、還付は注記で伝える。
  const ctBestPayable = Math.max(0, ct.bestAmount);
  const totalTaxBurden = breakdown.totalTax + (ctExempt ? 0 : ctBestPayable);

  const inputStyle: CSSProperties = {
    background: 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    padding: '4px 8px',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
  };
  const labelStyle: CSSProperties = { fontSize: 11, color: 'var(--text-mute)', marginBottom: 2, display: 'block' };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🏢 税の概算 — 法人税等の概算（税引後利益）＋ 消費税</div>

      {/* 精度パラメータ入力欄 (round 58) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 8, marginBottom: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div>
          <label style={labelStyle} htmlFor="ctax-capital">資本金（円、任意）</label>
          <input
            id="ctax-capital"
            type="number"
            min={0}
            step={1}
            value={capitalStr}
            onChange={(e) => setCapitalStr(e.target.value)}
            placeholder="例: 10000000"
            aria-label="資本金"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ctax-employees">従業者数（人、任意）</label>
          <input
            id="ctax-employees"
            type="number"
            min={0}
            step={1}
            value={employeesStr}
            onChange={(e) => setEmployeesStr(e.target.value)}
            placeholder="例: 30"
            aria-label="従業者数"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ctax-carryforward">繰越欠損金（円、任意）</label>
          <input
            id="ctax-carryforward"
            type="number"
            min={0}
            step={1}
            value={carryforwardLossStr}
            onChange={(e) => setCarryforwardLossStr(e.target.value)}
            placeholder="例: 5000000"
            aria-label="繰越欠損金"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>
            空欄 = 既定（中小・均等割最小・控除なし）。<br />
            入力すると税額・実効税率をライブ更新。
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))', gap: 10, marginBottom: 10 }}>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>税引前利益（経常利益概算）</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{yen.format(breakdown.taxableIncome)}</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>法人税等（合計）</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{yen.format(breakdown.totalTax)}</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>実効税率（概算）</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {isLoss ? '—' : `${(breakdown.effectiveRate * 100).toFixed(1)}%`}
          </div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>税引後利益</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: afterTaxColor }}>{yen.format(breakdown.afterTaxProfit)}</div>
        </div>
      </div>
      {isLoss && (
        <div style={{ fontSize: 12, color: '#e36b6b', marginBottom: 8 }}>
          欠損（税引前利益が0以下）のため、法人住民税の均等割（{yen.format(breakdown.residentTax)}）のみが課されます。
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 24px', fontSize: 11, color: 'var(--text-mute)', marginBottom: 6 }}>
        <span>法人税: {yen.format(breakdown.corporateIncomeTax)}</span>
        <span>地方法人税: {yen.format(breakdown.localCorporateTax)}</span>
        <span>法人住民税: {yen.format(breakdown.residentTax)}</span>
        <span>法人事業税: {yen.format(breakdown.businessTax)}</span>
        <span>特別法人事業税: {yen.format(breakdown.specialBusinessTax)}</span>
        <span>区分: {breakdown.smallBusiness ? '中小法人' : '大法人'}</span>
        {breakdown.deductedLoss > 0 && <span>繰越欠損金控除: {yen.format(breakdown.deductedLoss)}</span>}
        {breakdown.remainingLoss > 0 && <span>繰越残額: {yen.format(breakdown.remainingLoss)}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 12 }}>
        ※ 経常利益を課税所得の概算として使用（会計上の利益と税法上の課税所得の差異は無視）。
        各種税額控除・外形標準課税・自治体別超過税率等は非考慮。令和6年度ベース。
      </div>

      {/* --- 消費税の概算 (納付見込み) --- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧾 消費税の概算（納付見込み・本則 / 簡易 / 2割特例）</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 8, marginBottom: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div>
            <label style={labelStyle} htmlFor="ct-sales">課税売上高（年・税抜、任意）</label>
            <input
              id="ct-sales"
              type="number"
              min={0}
              step={1}
              value={ctSalesStr}
              onChange={(e) => setCtSalesStr(e.target.value)}
              placeholder={`既定: ${Math.max(0, Math.round(revenue))}`}
              aria-label="課税売上高"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="ct-purchases">課税仕入高（年・税抜、任意）</label>
            <input
              id="ct-purchases"
              type="number"
              min={0}
              step={1}
              value={ctPurchasesStr}
              onChange={(e) => setCtPurchasesStr(e.target.value)}
              placeholder={`既定: ${Math.max(0, Math.round(taxablePurchases))}`}
              aria-label="課税仕入高"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="ct-biztype">事業区分（簡易課税）</label>
            <select
              id="ct-biztype"
              value={ctBizType}
              onChange={(e) => setCtBizType(e.target.value as SimplifiedBusinessType)}
              aria-label="簡易課税の事業区分"
              style={{ ...inputStyle, height: 30 }}
            >
              {(Object.keys(BIZ_TYPE_LABEL) as SimplifiedBusinessType[]).map((t) => (
                <option key={t} value={t}>{BIZ_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>
              空欄 = 既定（売上高と、費用から給与・償却・利息を除いた概算仕入）。
            </div>
          </div>
        </div>

        {ctExempt && (
          <div style={{ fontSize: 12, color: '#43c3b8', marginBottom: 10 }}>
            課税売上高が {yen.format(exemptionLimit)} 以下 — 基準期間（前々事業年度）も同水準なら<strong>免税事業者（納付不要）の見込み</strong>です。
            インボイス（適格請求書発行事業者）登録済みの場合は課税事業者として納付が必要で、2割特例の対象になりえます。
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))', gap: 10, marginBottom: 10 }}>
          {([
            ['standard', ct.standard, ct.standard < 0 ? '仕入超過 → 還付見込み' : '売上税額 − 仕入税額'],
            ['simplified', ct.simplified, `みなし仕入率 ${(ct.appliedDeemedRate * 100).toFixed(0)}%${ctSimplifiedOk ? '' : ` · 基準期間${yen.format(simplifiedLimit)}超は選択不可`}`],
            [
              'twenty-percent',
              ct.twentyPercent,
              `売上税額 × ${Number(twentyPct.toPrecision(12))}%（インボイス登録の小規模事業者）` +
                `${ctExempt ? '' : ` · 課税売上高${yen.format(exemptionLimit)}超は対象外`}${measureNote}`,
            ],
          ] as const).map(([method, amount, sub]) => (
            <div
              key={method}
              style={{
                background: 'var(--bg)',
                borderRadius: 8,
                padding: '10px 14px',
                border: ct.best === method ? '1px solid #5cb85c' : '1px solid transparent',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>
                {CT_METHOD_LABEL[method]}
                {ct.best === method && <span style={{ color: '#5cb85c', fontWeight: 700 }}> · 最有利</span>}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{yen.format(amount)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2 }}>{sub}</div>
            </div>
          ))}
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--accent, #5b8def)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>税負担 合計（法人税等 ＋ 消費税）</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{yen.format(totalTaxBurden)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2 }}>
              {ctExempt ? '免税見込みのため消費税 0 で合算' : `消費税は最有利方式（${CT_METHOD_LABEL[ct.best]}）で合算`}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          ※ 消費税は「預かった税 − 支払った税」を納付する仕組みのため、税引後利益の計算には含めていません（税抜経理を前提）。
          簡易課税は基準期間の課税売上高 {yen.format(simplifiedLimit)} 以下＋事前届出で選択可。
          2割特例はインボイス登録で免税から課税になった事業者の経過措置（{measureEndLabel}を含む課税期間まで）。
          軽減税率 8% の売上・仕入は未考慮。
          <strong>本則課税は課税仕入れの消費税を全額引ける前提</strong>です（課税売上割合 95% 以上かつ課税売上高 5億円以下のとき）。
          住宅家賃・利子などの非課税売上があると全額は引けず、実際の納付はこれより多くなります。按分（個別対応方式・一括比例配分方式）は
          税務ページの ⑩-3 で試算できます。
          <strong>税務助言ではありません。申告・納税は税理士・e-Taxで確定してください。</strong>
        </div>
      </div>
    </div>
  );
}

// --- 総合診断 -----------------------------------------------------------
const GRADE_COLOR: Record<HealthGrade, string> = { S: '#43c3b8', A: '#5cb85c', B: '#5b8def', C: '#ec9a3d', D: '#e36b6b' };
const LEVEL_COLOR: Record<HealthLevel, string> = { good: '#5cb85c', warn: '#ec9a3d', bad: '#e36b6b' };

const TREND_META: Record<MarginTrend['direction'], { icon: string; text: string; color: string }> = {
  up: { icon: '▲', text: '改善傾向', color: '#5cb85c' },
  flat: { icon: '▶', text: '横ばい', color: '#94a3b8' },
  down: { icon: '▼', text: '悪化傾向', color: '#e36b6b' },
};

function TrendBadge({ trend }: { trend: MarginTrend }) {
  const m = TREND_META[trend.direction];
  const delta = trend.deltaPct == null ? '—' : `${trend.deltaPct > 0 ? '+' : ''}${trend.deltaPct}pt`;
  return (
    <span style={{ fontSize: 12, color: m.color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {m.icon} 営業利益率 {m.text}
      <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>（履歴 {delta}）</span>
    </span>
  );
}

function DiagnosisCard({ diagnosis, label, trend, onExportReport, healthBands }: { diagnosis: ReturnType<typeof diagnoseFinancials>; label: string; trend: MarginTrend; onExportReport: () => void; healthBands?: HealthBands }) {
  const { overallScore, grade, categories, strengths, weaknesses } = diagnosis;
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>🩺 {label} の財務健全度 総合診断</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <TrendBadge trend={trend} />
          <button onClick={onExportReport} style={{ padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>
            ⬇ 診断レポート(Markdown)
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: GRADE_COLOR[grade], lineHeight: 1 }}>{grade}</span>
          <span style={{ fontSize: 13, color: 'var(--text-mute)' }}>総合 {overallScore}<span style={{ fontSize: 11 }}>/100</span></span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {categories.map((c) => (
            <div key={c.category} style={{ minWidth: 96 }}>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 2 }}>{c.category} {c.score}</div>
              <div style={{ background: 'var(--bg)', borderRadius: 3, height: 8 }}>
                <div style={{ width: `${c.score}%`, height: '100%', background: LEVEL_COLOR[levelOf(c.score, healthBands)], borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 16, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: LEVEL_COLOR.good }}>👍 強み</div>
          {strengths.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>—</div> : strengths.map((s) => (
            <div key={s.key} style={{ fontSize: 12, padding: '2px 0' }}>{s.label}（{s.score}）</div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: LEVEL_COLOR.bad }}>⚠️ 要改善（一般情報）</div>
          {weaknesses.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>特に大きな弱みはありません。</div> : weaknesses.map((w) => (
            <div key={w.key} style={{ fontSize: 12, padding: '2px 0' }}>
              <span style={{ color: LEVEL_COLOR[w.level], fontWeight: 700 }}>● </span>{w.comment}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
        ※ スコアはレーダー（15指標の健全度0-100）の平均・カテゴリ平均。コメントは一般情報であり財務助言ではありません。
      </div>
    </div>
  );
}

export function FinancialAnalysis({
  units,
  effectiveTaxRate,
  corporateTaxRates,
  businessConsumption,
  healthBands,
  radarBands,
}: {
  units: readonly FinancialUnit[];
  /** NOPAT / ROIC に使う実効税率 (0-1)。省略時は `financialRatios` の既定。台帳の値を画面が渡す。 */
  effectiveTaxRate?: number;
  /** 法人税等の率 (台帳の値)。省略すると定数。 */
  corporateTaxRates?: CorporateTaxRates;
  /** 事業者の消費税の率と境目 (台帳の値)。省略すると定数。 */
  businessConsumption?: BusinessConsumptionParams;
  /** 軸の評価と総合格付けの下限 (台帳の値)。省略すると既定。 */
  healthBands?: HealthBands;
  /** レーダー 15 軸の 0 点 / 100 点の水準 (台帳の値)。省略すると既定。 */
  radarBands?: RadarBands;
}) {
  const [selectedId, setSelectedId] = useState(units[0]?.id ?? '');
  const [barKey, setBarKey] = useState<keyof FinancialRatios>('operatingMarginPct');
  const [stmtTab, setStmtTab] = useState<'pl' | 'bs' | 'cf' | 'var' | 'ci' | 'soce' | 'quarter' | 'notes' | 'suppl' | 'breakdown'>('pl');
  const [consolidated, setConsolidated] = useState(false);

  const perUnit = useMemo(
    () => units.map((u) => {
      const finInputs = deriveBusinessFinancials(u.current);
      const ratioInputs = effectiveTaxRate === undefined ? finInputs : { ...finInputs, effectiveTaxRate };
      return { unit: u, fin: finInputs, ratios: computeFinancialRatios(ratioInputs) };
    }),
    [units, effectiveTaxRate],
  );
  // 実績とサンプルは足さない。混ぜた合計はどちらの会社の数でもない。
  const scope = useMemo(() => consolidationScope(perUnit, (p) => p.unit.sample === true), [perUnit]);
  const consolidatedFin = useMemo(() => sumFinancialInputs(scope.parts.map((p) => p.fin)), [scope]);
  // 連結用の月次履歴: 合算対象の事業を月インデックス (末尾揃え) で合算。
  const consolidatedHistory = useMemo(() => {
    const hists = scope.parts.map((p) => p.unit.history);
    const maxLen = Math.max(0, ...hists.map((h) => h.length));
    const out: { revenue: number; profit: number }[] = [];
    for (let i = 0; i < maxLen; i++) {
      let revenue = 0;
      let profit = 0;
      for (const hist of hists) {
        const h = hist[hist.length - maxLen + i];
        if (h) { revenue += h.revenue; profit += h.profit; }
      }
      out.push({ revenue, profit });
    }
    return out;
  }, [scope]);
  const selected = perUnit.find((p) => p.unit.id === selectedId) ?? perUnit[0];

  if (!selected) return null;
  const fin = selected.fin;
  // 三表ビューは連結トグルで全事業合算に切替。
  const stmtFin = consolidated ? consolidatedFin : fin;
  const stmtHistory = consolidated ? consolidatedHistory : selected.unit.history;
  const scopeLabel = consolidationLabel(scope.parts.length, scope.isSample);
  const stmtLabel = consolidated ? scopeLabel : `${selected.unit.label}・単体`;
  const axes = radarAxes(selected.ratios, radarBands);
  const diagnosis = diagnoseFinancials(axes, healthBands);
  const trend = analyzeMarginTrend(selected.unit.history);
  const marginHistory = selected.unit.history.map((h) => (h.revenue > 0 ? Math.round((h.profit / h.revenue) * 1000) / 10 : 0));
  const otherCost = Math.max(0, fin.revenue - fin.cogs - fin.laborCost - fin.operatingProfit);
  const pieSlices = [
    { label: '売上原価', value: fin.cogs, color: PALETTE[1]! },
    { label: '人件費', value: fin.laborCost, color: PALETTE[2]! },
    { label: 'その他費用', value: otherCost, color: PALETTE[4]! },
    { label: '営業利益', value: Math.max(0, fin.operatingProfit), color: PALETTE[0]! },
  ];
  const barOpt = BAR_OPTIONS.find((b) => b.key === barKey)!;
  const barRows = perUnit.map((p) => ({ label: p.unit.label, value: p.ratios[barKey] as number | null }));

  function downloadBlob(content: string, mime: string, name: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  const downloadCsv = (csv: string, name: string) => downloadBlob('﻿' + csv, 'text/csv;charset=utf-8', name);
  function onExportCsv() {
    downloadCsv(ratiosToCsv(perUnit.map((p) => ({ label: p.unit.label, ratios: p.ratios }))), `financial-ratios-${localIsoDate()}.csv`);
  }
  function onExportReport() {
    const md = buildFinancialReportMarkdown({ label: selected!.unit.label, ratios: selected!.ratios, diagnosis, trend, ordinaryProfit: selected!.fin.ordinaryProfit, corporateTaxRates });
    downloadBlob(md, 'text/markdown;charset=utf-8', `financial-report-${selected!.unit.id}-${localIsoDate()}.md`);
  }
  // 現在表示中の諸表タブのライン項目 (BS は資産+負債純資産を連結) を返す。
  function currentStatementLines(): StatementLine[] {
    switch (stmtTab) {
      case 'pl': return buildIncomeStatement(stmtFin);
      case 'bs': { const bs = buildBalanceSheet(stmtFin); return [...bs.assets, ...bs.liabilitiesEquity]; }
      case 'cf': return buildCashflowStatement(stmtFin);
      case 'var': return buildVariableCostingStatement(stmtFin);
      case 'ci': return buildComprehensiveIncome(stmtFin);
      case 'soce': return buildEquityChangeStatement(stmtFin);
      case 'quarter': return buildQuarterlyStatement(stmtHistory);
      case 'notes': return buildNotesStatement(stmtFin);
      case 'suppl': return buildSupplementarySchedule(stmtFin);
      case 'breakdown': return buildAccountBreakdown(stmtFin);
    }
  }
  function onExportStatement() {
    // 中身がサンプルの合算なら、ファイル名にもそう書く。手元に残った CSV は文脈を失う。
    const name = consolidated ? (scope.isSample ? 'consolidated-sample' : 'consolidated-own') : selected!.unit.id;
    downloadCsv(statementToCsv(currentStatementLines()), `statement-${stmtTab}-${name}-${localIsoDate()}.csv`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>対象事業:</label>
        <select data-financial-unit-select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: 13 }}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>年商 {yen.format(fin.revenue)}（概算 BS/CF）</span>
      </div>

      <DiagnosisCard diagnosis={diagnosis} label={selected.unit.label} trend={trend} onExportReport={onExportReport} healthBands={healthBands} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📡 財務指標レーダー（15指標・健全度0-100）</div>
          <RadarChart axes={axes} />
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📈 営業利益率の推移</div>
          <LineChart values={marginHistory} />
          <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 6px' }}>🥧 売上構成（年次）</div>
          <PieChart slices={pieSlices} />
        </div>
      </div>

      {/* 全業務を 1 枚で見る 3 軸 + 構成比。事業を選ばずに全部を並べる。 */}
      <AxonometricCharts units={units} />

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📊 事業間比較（棒グラフ）</div>
          <select value={barKey} onChange={(e) => setBarKey(e.target.value as keyof FinancialRatios)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '3px 8px', fontSize: 12 }}>
            {BAR_OPTIONS.map((b) => <option key={String(b.key)} value={String(b.key)}>{b.label}</option>)}
          </select>
        </div>
        <BarChart rows={barRows} unit={barOpt.unit} />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🧮 {selected.unit.label} の財務指標一覧（15指標）</div>
          <button onClick={onExportCsv} style={{ padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>
            ⬇ 全事業の指標をCSVで書き出し
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '4px 16px' }}>
          {RATIO_ROWS.map((row) => {
            const v = selected.ratios[row.key] as number | null;
            return (
              <div key={String(row.key)} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '3px 0', fontSize: 12 }}>
                <span style={{ color: 'var(--text-mute)' }}>{row.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.money ? (v == null ? '—' : yen.format(v)) : fmtRatio(v, row.unit)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <CorporateTaxCard
        ordinaryProfit={fin.ordinaryProfit}
        corporateTaxRates={corporateTaxRates}
        businessConsumption={businessConsumption}
        revenue={fin.revenue}
        taxablePurchases={Math.max(0, fin.revenue - fin.ordinaryProfit - fin.laborCost - fin.depreciation - (fin.interestExpense ?? 0))}
      />

      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginRight: 6 }}>📑 財務諸表（{stmtLabel}・年次概算）</div>
          {([['pl', '損益計算書'], ['bs', '貸借対照表'], ['cf', 'キャッシュフロー計算書'], ['var', '変動損益計算書'], ['ci', '包括利益計算書'], ['soce', '株主資本等変動計算書'], ['quarter', '四半期財務諸表'], ['notes', '個別注記表'], ['suppl', '附属明細書'], ['breakdown', '勘定科目内訳明細書']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStmtTab(k)}
              style={{ padding: '4px 10px', background: stmtTab === k ? 'var(--accent)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}
            >
              {label}
            </button>
          ))}
          <label style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={consolidated} onChange={(e) => setConsolidated(e.target.checked)} />
            {scopeLabel}で表示
          </label>
          <button onClick={onExportStatement} style={{ padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>
            ⬇ この諸表をCSV
          </button>
        </div>
        {stmtTab === 'pl' && <StatementTable lines={buildIncomeStatement(stmtFin)} />}
        {stmtTab === 'bs' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>資産の部</div>
              <StatementTable lines={buildBalanceSheet(stmtFin).assets} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>負債・純資産の部</div>
              <StatementTable lines={buildBalanceSheet(stmtFin).liabilitiesEquity} />
            </div>
          </div>
        )}
        {stmtTab === 'cf' && <StatementTable lines={buildCashflowStatement(stmtFin)} />}
        {stmtTab === 'var' && <StatementTable lines={buildVariableCostingStatement(stmtFin)} />}
        {stmtTab === 'ci' && <StatementTable lines={buildComprehensiveIncome(stmtFin)} />}
        {stmtTab === 'soce' && <StatementTable lines={buildEquityChangeStatement(stmtFin)} />}
        {stmtTab === 'quarter' && <StatementTable lines={buildQuarterlyStatement(stmtHistory)} />}
        {stmtTab === 'notes' && <StatementTable lines={buildNotesStatement(stmtFin)} />}
        {stmtTab === 'suppl' && <StatementTable lines={buildSupplementarySchedule(stmtFin)} />}
        {stmtTab === 'breakdown' && <StatementTable lines={buildAccountBreakdown(stmtFin)} />}
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
          ※ 諸表・指標・チャートは同じ概算財務データに連動。CFは簡易間接法（営業=純利益+減価償却・投資/財務は概算）。包括利益のOCI・株主資本変動の配当はデータ無しのため0/概算。四半期は月次履歴を3ヶ月集計、注記/附属明細/勘定科目内訳はテンプレート+概算値。連結は内部取引消去なしの単純合算。
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
        ※ 事業別の貸借対照表データが無いため、各事業の BS / CF は売上・収益性から概算生成しています（自己資本比率は収益性で変動）。概算であり財務助言ではありません。
      </div>
    </div>
  );
}
