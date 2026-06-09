import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { ServiceActionPanel } from '../components/ServiceActionPanel';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { jpy } from '../../shared/formatters';
import {
  calcCompoundingFutureValue,
  calcTotalReturn,
  calcRealCost,
  calcStdDev,
  calcDcaSimulation,
} from '../../shared/mutualFundsMetrics';
import {
  requiredMonthlyContribution,
  yearsToDouble,
  emergencyFund,
  inflationAdjustedValue,
  realRateOfReturn,
  emergencyFundCoverage,
  goalProjection,
} from '../../shared/savingsPlanning';
import { convertToJpy, fxGainLoss, ttRates, roundTripCost } from '../../shared/fxCurrency';

const simInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 110,
};

export function MutualFundsPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'mutual-funds',
    SNAPSHOT.mutualFunds,
  );
  const { holdings, portfolio, recentDividends } = data;

  const [simMonthly, setSimMonthly] = useState('30000');
  const [simRate, setSimRate] = useState('5');
  const [simYears, setSimYears] = useState('20');
  const sim = useMemo(
    () => calcCompoundingFutureValue(Number(simMonthly) || 0, Number(simRate) || 0, Number(simYears) || 0),
    [simMonthly, simRate, simYears],
  );

  // 貯蓄計画: 目標達成積立額・72の法則・緊急予備資金。
  const [goalTarget, setGoalTarget] = useState('10000000');
  const [goalRate, setGoalRate] = useState('3');
  const [goalYears, setGoalYears] = useState('10');
  const [monthlyExpense, setMonthlyExpense] = useState('300000');
  const requiredMonthly = useMemo(
    () => requiredMonthlyContribution(Number(goalTarget) || 0, Number(goalRate) || 0, Number(goalYears) || 0),
    [goalTarget, goalRate, goalYears],
  );
  const doubleYears = useMemo(() => yearsToDouble(Number(goalRate) || 0), [goalRate]);
  const emergency = useMemo(() => emergencyFund(Number(monthlyExpense) || 0, 6), [monthlyExpense]);

  // 追加: 現行積立での目標達成見込み・インフレ調整後の実質価値・実質利回り・予備資金充足率。
  const [currentMonthly, setCurrentMonthly] = useState('30000');
  const [inflationRate, setInflationRate] = useState('2');
  const [cashOnHand, setCashOnHand] = useState('900000');
  const projection = useMemo(
    () => goalProjection(Number(currentMonthly) || 0, Number(goalTarget) || 0, Number(goalRate) || 0, Number(goalYears) || 0),
    [currentMonthly, goalTarget, goalRate, goalYears],
  );
  const realTarget = useMemo(
    () => inflationAdjustedValue(Number(goalTarget) || 0, Number(inflationRate) || 0, Number(goalYears) || 0),
    [goalTarget, inflationRate, goalYears],
  );
  const realRate = useMemo(
    () => realRateOfReturn(Number(goalRate) || 0, Number(inflationRate) || 0),
    [goalRate, inflationRate],
  );
  const efCoverage = useMemo(
    () => emergencyFundCoverage(Number(cashOnHand) || 0, Number(monthlyExpense) || 0, 6),
    [cashOnHand, monthlyExpense],
  );

  // トータルリターン (分配金再投資ベース) と保有銘柄リターンのリスク (標準偏差)。
  const [holdYears, setHoldYears] = useState('5');
  const totalDividends = useMemo(
    () => recentDividends.reduce((acc, d) => acc + d.amount, 0),
    [recentDividends],
  );
  const totalReturn = useMemo(
    () => calcTotalReturn(portfolio.totalCostBasis, portfolio.totalValuation, totalDividends, Number(holdYears) || 0),
    [portfolio.totalCostBasis, portfolio.totalValuation, totalDividends, holdYears],
  );
  const risk = useMemo(() => calcStdDev(holdings.map((h) => h.ytdReturnPct)), [holdings]);

  // 実質コスト (信託報酬 + 隠れコスト) と複利での蝕み効果。
  const [costExpense, setCostExpense] = useState('1.0');
  const [costHidden, setCostHidden] = useState('0.2');
  const [costGross, setCostGross] = useState('5');
  const realCost = useMemo(
    () => calcRealCost(portfolio.totalValuation, Number(costExpense) || 0, Number(costHidden) || 0, Number(costGross) || 0, Number(holdYears) || 0),
    [portfolio.totalValuation, costExpense, costHidden, costGross, holdYears],
  );

  // ドルコスト平均法シミュレーション (価格系列はカンマ区切り入力)。
  const [dcaMonthly, setDcaMonthly] = useState('30000');
  const [dcaPrices, setDcaPrices] = useState('10000, 9500, 11000, 10500, 12000');
  const dca = useMemo(() => {
    const prices = dcaPrices.split(',').map((p) => Number(p.trim())).filter((p) => Number.isFinite(p));
    return calcDcaSimulation(Number(dcaMonthly) || 0, prices);
  }, [dcaMonthly, dcaPrices]);

  // 外貨換算・為替損益。
  const [fxAmount, setFxAmount] = useState('10000');
  const [fxAcqRate, setFxAcqRate] = useState('130');
  const [fxCurRate, setFxCurRate] = useState('150');
  const fxJpy = useMemo(() => convertToJpy(Number(fxAmount) || 0, Number(fxCurRate) || 0), [fxAmount, fxCurRate]);
  const fxPnl = useMemo(
    () => fxGainLoss({ amountForeign: Number(fxAmount) || 0, acquisitionRate: Number(fxAcqRate) || 0, currentRate: Number(fxCurRate) || 0 }),
    [fxAmount, fxAcqRate, fxCurRate],
  );

  // TT スプレッド・往復両替コスト (現在レートを TTM=仲値とみなす)。
  const [fxFee, setFxFee] = useState('0.5');
  const fxTt = useMemo(
    () => ttRates(Number(fxCurRate) || 0, Number(fxFee) || 0),
    [fxCurRate, fxFee],
  );
  const fxRoundTrip = useMemo(
    () => (fxTt ? roundTripCost(convertToJpy(Number(fxAmount) || 0, fxTt.ttm), fxTt.tts, fxTt.ttb) : null),
    [fxTt, fxAmount],
  );

  return (
    <div>
      <StatusBar
        serviceId="mutual-funds"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>投資信託 · {holdings.length} 銘柄 / 評価額 {jpy(portfolio.totalValuation)}</>}
      />

      <Section title="ポートフォリオ" count={4}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Stat label="評価額" value={jpy(portfolio.totalValuation)} />
          <Stat label="取得原価" value={jpy(portfolio.totalCostBasis)} />
          <Stat label="評価損益" value={jpy(portfolio.unrealizedGain)} positive={portfolio.unrealizedGain >= 0} />
          <Stat label="評価損益率" value={`${portfolio.unrealizedGainPct.toFixed(1)}%`} positive={portfolio.unrealizedGainPct >= 0} />
        </div>
      </Section>

      <Section title="トータルリターン・リスク (分配金再投資ベース・概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            保有年数
            <input type="text" inputMode="decimal" value={holdYears} onChange={(e) => setHoldYears(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Stat
            label="トータルリターン"
            value={totalReturn.totalReturnPct === null ? '—' : `${totalReturn.totalReturnPct}%`}
            positive={(totalReturn.totalReturnPct ?? 0) >= 0}
          />
          <Stat
            label="年率換算 (CAGR)"
            value={totalReturn.cagrPct === null ? '—' : `${totalReturn.cagrPct}%`}
            positive={(totalReturn.cagrPct ?? 0) >= 0}
          />
          <Stat label="累計分配金" value={jpy(totalDividends)} />
          <Stat label="リスク (銘柄YTDの標準偏差)" value={risk === null ? '—' : `${risk}%`} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 分配金は再投資された前提で元本に対する総合収益として概算。リスクは保有銘柄のYTDリターンの母標準偏差です。概算であり投資助言ではありません。
        </div>
      </Section>

      <Section title="実質コスト (信託報酬 + 隠れコスト・概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            信託報酬 (年率%)
            <input type="text" inputMode="decimal" value={costExpense} onChange={(e) => setCostExpense(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            隠れコスト (年率%)
            <input type="text" inputMode="decimal" value={costHidden} onChange={(e) => setCostHidden(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            想定年率 (%)
            <input type="text" inputMode="decimal" value={costGross} onChange={(e) => setCostGross(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="実質コスト率 (年率)" value={`${realCost.annualCostPct}%`} />
          <Stat label="年間コスト概算" value={jpy(realCost.annualCostYen)} />
          <Stat label={`${holdYears}年累計の蝕み効果`} value={jpy(realCost.cumulativeCostYen)} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 評価額 {jpy(portfolio.totalValuation)} を元本としコストがリターンを複利で蝕む効果を概算。隠れコストは売買委託手数料等の目安です。概算であり投資助言ではありません。
        </div>
      </Section>

      <Section title="ドルコスト平均法シミュレーション (概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            毎月の積立額 (円)
            <input type="text" inputMode="decimal" value={dcaMonthly} onChange={(e) => setDcaMonthly(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 240 }}>
            各期の基準価額 (カンマ区切り)
            <input type="text" value={dcaPrices} onChange={(e) => setDcaPrices(e.target.value)} style={{ ...simInputStyle, width: '100%' }} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Stat label="取得口数" value={dca.totalUnits.toLocaleString()} />
          <Stat label="平均取得単価" value={dca.averageCost === null ? '—' : jpy(dca.averageCost)} />
          <Stat label="評価額" value={jpy(dca.finalValuation)} />
          <Stat label="評価損益" value={jpy(dca.gain)} positive={dca.gain >= 0} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 各期に一定額を投じ、価格が下がった期ほど多くの口数を取得する効果を概算。手数料・税は含みません。概算であり投資助言ではありません。
        </div>
      </Section>

      <Section title="保有銘柄" count={holdings.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>銘柄コード</th>
              <th style={thStyle}>ファンド名</th>
              <th style={thNum}>口数</th>
              <th style={thNum}>基準価額</th>
              <th style={thNum}>評価額</th>
              <th style={thNum}>YTD</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.code}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{h.code}</td>
                <td style={tdStyle}>
                  {h.name}
                  {h.userTag && (
                    <span style={{ marginLeft: 6, padding: '1px 6px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderRadius: 3, fontSize: 10 }}>
                      {h.userTag}
                    </span>
                  )}
                </td>
                <td style={tdNum}>{h.units.toLocaleString()}</td>
                <td style={tdNum}>{jpy(h.navPerUnit)}</td>
                <td style={tdNum}>{jpy(h.valuation)}</td>
                <td style={{ ...tdNum, color: h.ytdReturnPct >= 0 ? '#22c55e' : '#ef4444' }}>
                  {h.ytdReturnPct >= 0 ? '+' : ''}{h.ytdReturnPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <ServiceActionPanel serviceId="mutual-funds" serviceLabel="投資信託" />

      <Section title="直近の分配金" count={recentDividends.length}>
        {recentDividends.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>分配金履歴はまだありません</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>銘柄コード</th>
                <th style={thStyle}>支払日</th>
                <th style={thNum}>金額</th>
              </tr>
            </thead>
            <tbody>
              {recentDividends.map((d, i) => (
                <tr key={`${d.code}-${i}`}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{d.code}</td>
                  <td style={tdStyle}>{d.paidAt}</td>
                  <td style={tdNum}>{jpy(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="積立シミュレーション (複利・概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            月額積立 (円)
            <input type="text" inputMode="decimal" value={simMonthly} onChange={(e) => setSimMonthly(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            想定年率 (%)
            <input type="text" inputMode="decimal" value={simRate} onChange={(e) => setSimRate(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            積立年数
            <input type="text" inputMode="decimal" value={simYears} onChange={(e) => setSimYears(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="将来評価額" value={jpy(sim.futureValue)} positive />
          <Stat label="累計拠出額" value={jpy(sim.totalContributed)} />
          <Stat label={`運用益 (${sim.gainPct.toFixed(1)}%)`} value={jpy(sim.totalGain)} positive={sim.totalGain >= 0} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 毎月末積立・年率一定を仮定した複利の概算です。実際の運用成績は変動し元本割れの可能性があります。投資助言ではありません。
        </div>
      </Section>

      <Section title="貯蓄計画 (目標達成・緊急予備資金・概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            目標額 (円)
            <input type="text" inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            想定年率 (%)
            <input type="text" inputMode="decimal" value={goalRate} onChange={(e) => setGoalRate(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            達成年数
            <input type="text" inputMode="decimal" value={goalYears} onChange={(e) => setGoalYears(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            毎月の生活費 (円)
            <input type="text" inputMode="decimal" value={monthlyExpense} onChange={(e) => setMonthlyExpense(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            現行の毎月積立 (円)
            <input type="text" inputMode="decimal" value={currentMonthly} onChange={(e) => setCurrentMonthly(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            想定インフレ率 (%)
            <input type="text" inputMode="decimal" value={inflationRate} onChange={(e) => setInflationRate(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            現預金 (円)
            <input type="text" inputMode="decimal" value={cashOnHand} onChange={(e) => setCashOnHand(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="目標達成に必要な毎月積立額" value={jpy(requiredMonthly)} />
          <Stat label="72の法則 (資産倍増)" value={doubleYears === null ? '—' : `約 ${doubleYears} 年`} />
          <Stat label="緊急予備資金 (生活費6か月)" value={jpy(emergency)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
          <Stat
            label="現行積立での到達見込み"
            value={`${jpy(projection.projected)}${projection.onTrack ? ' (達成)' : ` (不足 ${jpy(projection.shortfall)})`}`}
          />
          <Stat label="必要な追加積立 (毎月)" value={jpy(projection.additionalMonthly)} />
          <Stat label="目標額のインフレ調整後 実質価値" value={jpy(realTarget)} />
          <Stat label="実質利回り (インフレ調整後)" value={realRate === null ? '—' : `${realRate}%`} />
          <Stat label="予備資金 充足率" value={`${efCoverage.coveragePct}%`} />
          <Stat
            label="現預金でまかなえる月数"
            value={efCoverage.monthsCovered === null ? '—' : `約 ${efCoverage.monthsCovered} か月`}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 毎月末積立・年率一定を仮定した概算です。実質価値は (1+インフレ率)^年数 で割り引いた購買力、実質利回りはフィッシャー式 (1+名目)/(1+インフレ)−1。緊急予備資金は生活費の6か月分（会社員3〜6・自営6〜12か月が目安）。投資助言ではありません。
        </div>
      </Section>

      <Section title="外貨換算・為替損益 (概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            外貨額
            <input type="text" inputMode="decimal" value={fxAmount} onChange={(e) => setFxAmount(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            取得時レート
            <input type="text" inputMode="decimal" value={fxAcqRate} onChange={(e) => setFxAcqRate(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            現在レート
            <input type="text" inputMode="decimal" value={fxCurRate} onChange={(e) => setFxCurRate(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="現在の円換算額" value={jpy(fxJpy)} />
          <Stat label="為替損益" value={jpy(fxPnl.gain)} positive={fxPnl.gain >= 0} />
          <Stat label="損益率" value={fxPnl.gainPct === null ? '—' : `${fxPnl.gainPct}%`} positive={(fxPnl.gainPct ?? 0) >= 0} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 為替変動による円ベースの損益のみの概算で、手数料・スプレッド・税は含みません。投資助言ではありません。
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '16px 0 12px' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            片道手数料 (円/通貨)
            <input type="text" inputMode="decimal" value={fxFee} onChange={(e) => setFxFee(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="TTM (仲値)" value={fxTt ? `${fxTt.ttm}` : '—'} />
          <Stat label="TTS (売・顧客が買う)" value={fxTt ? `${fxTt.tts}` : '—'} />
          <Stat label="TTB (買・顧客が売る)" value={fxTt ? `${fxTt.ttb}` : '—'} />
          <Stat label="往復両替コスト" value={fxRoundTrip ? jpy(fxRoundTrip.costJpy) : '—'} positive={false} />
          <Stat label="往復コスト率" value={fxRoundTrip && fxRoundTrip.costPct !== null ? `${fxRoundTrip.costPct}%` : '—'} positive={false} />
          <Stat label="売り戻し後の円" value={fxRoundTrip ? jpy(fxRoundTrip.endJpy) : '—'} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 現在レートを TTM(仲値) とみなし、TTS=TTM+手数料 / TTB=TTM−手数料 で算出。往復コストは円→外貨→円の即時往復で失うスプレッド損の概算です。投資助言ではありません。
        </div>
      </Section>
    </div>
  );
}

