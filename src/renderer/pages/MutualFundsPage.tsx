import { useMemo, useState } from 'react';
import {
  MANUAL_OVERRIDES_COLLECTION,
  applyManualOverrides,
  type ManualOverrideEntry,
} from '../data/manualData';
import { GuardedNumber } from '../components/GuardedNumber';
import { readNumberOr0 } from '../data/inputGuards';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { ServiceActionPanel } from '../components/ServiceActionPanel';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { useCollection } from '../data/useCollection';
import {
  HOLDINGS_COLLECTION,
  normalizeHolding,
  parseHoldingEntry,
  holdingToForm,
  computeFundPortfolio,
  type HoldingEntry,
} from '../data/investments';
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
import { useParameters } from '../data/parameterOverrides';

const simInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 110,
};

const EMPTY_HOLDING_FORM = { code: '', name: '', units: '', navPerUnit: '', valuation: '', acquisitionCost: '', ytdReturnPct: '' };

export function MutualFundsPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'mutual-funds',
    SNAPSHOT.mutualFunds,
  );
  const { recentDividends } = data;

  // ユーザー追加の保有銘柄 (record store 永続化・端末内)。
  const { records: userHoldings, add: addHolding, edit: editHolding, remove: removeHolding } = useCollection<HoldingEntry>(HOLDINGS_COLLECTION);
  const [fundForm, setFundForm] = useState(EMPTY_HOLDING_FORM);
  const [fundError, setFundError] = useState<string>();
  /** 編集中のユーザー銘柄 id (null = 新規追加モード)。 */
  const [editingFundId, setEditingFundId] = useState<string | null>(null);

  /** デモ (snapshot) 行 + ユーザー行の結合リスト (追加行は「追加」チップ)。 */
  const holdings = useMemo(
    () => [
      ...data.holdings.map((h) => ({
        ...normalizeHolding(h),
        rowId: h.code,
        user: false as const,
        valuationMode: undefined,
        userTag: undefined,
      })),
      // 欄の無い控え (古い版・手で直した JSON) も読める形に整えてから使う。
      // 補いは `normalizeHolding` の 1 か所だけ —— 画面側に `??` を散らすと、
      // 実際に起きたように 1 つ (valuationMode) だけ補われて残りが漏れる。
      ...userHoldings.map((r) => ({
        ...normalizeHolding(r.data),
        userTag: '追加',
        rowId: r.id,
        user: true as const,
      })),
    ],
    [data.holdings, userHoldings],
  );

  // ポートフォリオ集計は結合リストから再計算 (追加ゼロなら snapshot と同値)。
  const computedPortfolio = useMemo(
    () =>
      computeFundPortfolio(
        holdings,
        data.portfolio.totalCostBasis,
        userHoldings.map((r) => normalizeHolding(r.data).acquisitionCost),
      ),
    [holdings, data.portfolio.totalCostBasis, userHoldings],
  );
  // 手入力の上書きを重ねる。入力欄は App が全画面共通で描くので、ここは
  // 読んで適用するだけ。
  const manualOverrides = useCollection<ManualOverrideEntry>(MANUAL_OVERRIDES_COLLECTION);
  const manualRecords = manualOverrides.records;
  const portfolio = useMemo(
    () =>
      applyManualOverrides('mutual-funds', computedPortfolio, manualRecords.map((r) => r.data))
        .overview,
    [computedPortfolio, manualRecords],
  );

  async function onSaveHolding() {
    try {
      const parsed = parseHoldingEntry(fundForm);
      setFundError(undefined);
      if (editingFundId !== null) {
        await editHolding(editingFundId, parsed);
        setEditingFundId(null);
      } else {
        await addHolding(parsed);
      }
      setFundForm(EMPTY_HOLDING_FORM);
    } catch (e) {
      setFundError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  /** ユーザー行の「編集」— フォームへ読み込み (auto の評価額は空欄のまま)。 */
  function onStartEditHolding(rowId: string, h: HoldingEntry) {
    setFundForm(holdingToForm(h));
    setEditingFundId(rowId);
    setFundError(undefined);
  }

  function onCancelEditHolding() {
    setEditingFundId(null);
    setFundForm(EMPTY_HOLDING_FORM);
    setFundError(undefined);
  }

  const [simMonthly, setSimMonthly] = useState('30000');
  const [simRate, setSimRate] = useState('5');
  const [simYears, setSimYears] = useState('20');
  const sim = useMemo(
    () => calcCompoundingFutureValue(readNumberOr0(simMonthly), readNumberOr0(simRate), readNumberOr0(simYears)),
    [simMonthly, simRate, simYears],
  );

  // 貯蓄計画: 目標達成積立額・72の法則・緊急予備資金。
  // 予備資金の月数は判断の要る参考値 (会社員 3〜6 / 自営 6〜12 か月) なので、
  // 台帳 `savings.emergencyFundMonths` から読んで引数で渡す (画面に写さない)。
  const { values: params } = useParameters();
  const efMonths = params['savings.emergencyFundMonths'];
  const [goalTarget, setGoalTarget] = useState('10000000');
  const [goalRate, setGoalRate] = useState('3');
  const [goalYears, setGoalYears] = useState('10');
  const [monthlyExpense, setMonthlyExpense] = useState('300000');
  const requiredMonthly = useMemo(
    () => requiredMonthlyContribution(readNumberOr0(goalTarget), readNumberOr0(goalRate), readNumberOr0(goalYears)),
    [goalTarget, goalRate, goalYears],
  );
  const doubleYears = useMemo(() => yearsToDouble(readNumberOr0(goalRate)), [goalRate]);
  const emergency = useMemo(
    () => emergencyFund(readNumberOr0(monthlyExpense), efMonths),
    [monthlyExpense, efMonths],
  );

  // 追加: 現行積立での目標達成見込み・インフレ調整後の実質価値・実質利回り・予備資金充足率。
  const [currentMonthly, setCurrentMonthly] = useState('30000');
  const [inflationRate, setInflationRate] = useState('2');
  const [cashOnHand, setCashOnHand] = useState('900000');
  const projection = useMemo(
    () => goalProjection(readNumberOr0(currentMonthly), readNumberOr0(goalTarget), readNumberOr0(goalRate), readNumberOr0(goalYears)),
    [currentMonthly, goalTarget, goalRate, goalYears],
  );
  const realTarget = useMemo(
    () => inflationAdjustedValue(readNumberOr0(goalTarget), readNumberOr0(inflationRate), readNumberOr0(goalYears)),
    [goalTarget, inflationRate, goalYears],
  );
  const realRate = useMemo(
    () => realRateOfReturn(readNumberOr0(goalRate), readNumberOr0(inflationRate)),
    [goalRate, inflationRate],
  );
  const efCoverage = useMemo(
    () => emergencyFundCoverage(readNumberOr0(cashOnHand), readNumberOr0(monthlyExpense), efMonths),
    [cashOnHand, monthlyExpense, efMonths],
  );

  // トータルリターン (分配金再投資ベース) と保有銘柄リターンのリスク (標準偏差)。
  const [holdYears, setHoldYears] = useState('5');
  const totalDividends = useMemo(
    () => recentDividends.reduce((acc, d) => acc + d.amount, 0),
    [recentDividends],
  );
  const totalReturn = useMemo(
    () => calcTotalReturn(portfolio.totalCostBasis, portfolio.totalValuation, totalDividends, readNumberOr0(holdYears)),
    [portfolio.totalCostBasis, portfolio.totalValuation, totalDividends, holdYears],
  );
  const risk = useMemo(() => calcStdDev(holdings.map((h) => h.ytdReturnPct)), [holdings]);

  // 実質コスト (信託報酬 + 隠れコスト) と複利での蝕み効果。
  const [costExpense, setCostExpense] = useState('1.0');
  const [costHidden, setCostHidden] = useState('0.2');
  const [costGross, setCostGross] = useState('5');
  const realCost = useMemo(
    () => calcRealCost(portfolio.totalValuation, readNumberOr0(costExpense), readNumberOr0(costHidden), readNumberOr0(costGross), readNumberOr0(holdYears)),
    [portfolio.totalValuation, costExpense, costHidden, costGross, holdYears],
  );

  // ドルコスト平均法シミュレーション (価格系列はカンマ区切り入力)。
  const [dcaMonthly, setDcaMonthly] = useState('30000');
  const [dcaPrices, setDcaPrices] = useState('10000, 9500, 11000, 10500, 12000');
  const dca = useMemo(() => {
    const prices = dcaPrices.split(',').map((p) => Number(p.trim())).filter((p) => Number.isFinite(p));
    return calcDcaSimulation(readNumberOr0(dcaMonthly), prices);
  }, [dcaMonthly, dcaPrices]);

  // 外貨換算・為替損益。
  const [fxAmount, setFxAmount] = useState('10000');
  const [fxAcqRate, setFxAcqRate] = useState('130');
  const [fxCurRate, setFxCurRate] = useState('150');
  const fxJpy = useMemo(() => convertToJpy(readNumberOr0(fxAmount), readNumberOr0(fxCurRate)), [fxAmount, fxCurRate]);
  const fxPnl = useMemo(
    () => fxGainLoss({ amountForeign: readNumberOr0(fxAmount), acquisitionRate: readNumberOr0(fxAcqRate), currentRate: readNumberOr0(fxCurRate) }),
    [fxAmount, fxAcqRate, fxCurRate],
  );

  // TT スプレッド・往復両替コスト (現在レートを TTM=仲値とみなす)。
  const [fxFee, setFxFee] = useState('0.5');
  const fxTt = useMemo(
    () => ttRates(readNumberOr0(fxCurRate), readNumberOr0(fxFee)),
    [fxCurRate, fxFee],
  );
  const fxRoundTrip = useMemo(
    () => (fxTt ? roundTripCost(convertToJpy(readNumberOr0(fxAmount), fxTt.ttm), fxTt.tts, fxTt.ttb) : null),
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
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <Stat label="評価額" value={jpy(portfolio.totalValuation)} />
          <Stat label="取得原価" value={jpy(portfolio.totalCostBasis)} />
          <Stat label="評価損益" value={jpy(portfolio.unrealizedGain)} positive={portfolio.unrealizedGain >= 0} />
          <Stat label="評価損益率" value={`${portfolio.unrealizedGainPct.toFixed(1)}%`} positive={portfolio.unrealizedGainPct >= 0} />
        </div>
      </Section>

      <Section title="トータルリターン・リスク (分配金再投資ベース・概算)">
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '保有年数', kind: 'years', allowZero: true, max: 100 }} value={holdYears} onChange={setHoldYears} width={120} />
        </div>
        <div className="stat-grid">
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
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '信託報酬 (%)', kind: 'percent', allowZero: true, max: 20 }} value={costExpense} onChange={setCostExpense} width={120} />
          <GuardedNumber spec={{ label: '隠れコスト (%)', kind: 'percent', allowZero: true, max: 20 }} value={costHidden} onChange={setCostHidden} width={120} />
          <GuardedNumber spec={{ label: '想定年率 (%)', kind: 'percent', allowZero: true, max: 100 }} value={costGross} onChange={setCostGross} width={120} />
        </div>
        <div className="stat-grid">
          <Stat label="実質コスト率 (年率)" value={`${realCost.annualCostPct}%`} />
          <Stat label="年間コスト概算" value={jpy(realCost.annualCostYen)} />
          <Stat label={`${holdYears}年累計の蝕み効果`} value={jpy(realCost.cumulativeCostYen)} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 評価額 {jpy(portfolio.totalValuation)} を元本としコストがリターンを複利で蝕む効果を概算。隠れコストは売買委託手数料等の目安です。概算であり投資助言ではありません。
        </div>
      </Section>

      <Section title="ドルコスト平均法シミュレーション (概算)">
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '毎月の積立額 (円)', kind: 'money', allowZero: false }} value={dcaMonthly} onChange={setDcaMonthly} width={120} />
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 240 }}>
            各期の基準価額 (カンマ区切り)
            <input type="text" value={dcaPrices} onChange={(e) => setDcaPrices(e.target.value)} style={{ ...simInputStyle, width: '100%' }} />
          </label>
        </div>
        <div className="stat-grid">
          <Stat label="取得口数" value={dca.totalUnits.toLocaleString()} />
          <Stat label="平均取得単価" value={dca.averageCost === null ? '—' : jpy(dca.averageCost)} />
          <Stat label="評価額" value={jpy(dca.finalValuation)} />
          <Stat label="評価損益" value={jpy(dca.gain)} positive={dca.gain >= 0} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 各期に一定額を投じ、価格が下がった期ほど多くの口数を取得する効果を概算。手数料・税は含みません。概算であり投資助言ではありません。
        </div>
      </Section>

      <Section title={editingFundId !== null ? `銘柄を編集中 — ${fundForm.name || '(無題)'}` : '銘柄を追加 (任意・この端末に保存)'}>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          {editingFundId !== null
            ? '値を書き換えて「保存」するとポートフォリオへ即時に自動反映されます。'
            : '上のポートフォリオへ即時反映されます。一覧の「編集」でいつでも入力し直せます。'}
          評価額は<strong>空欄なら「口数 ÷ 1万 × 基準価額」で自動計算</strong>、
          <strong>直接入力すればその値 (手動)</strong> — どちらの方式でも使えます。
          データはこの端末のブラウザ内 (IndexedDB) にのみ保存され、どこにも送信されません。
        </div>
        <div className="field-grid" style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            ファンド名
            <input type="text" value={fundForm.name} placeholder="例: ニッセイ外国株式"
              onChange={(e) => setFundForm((f) => ({ ...f, name: e.target.value }))} style={{ ...simInputStyle, width: 200 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            銘柄コード (任意)
            <input type="text" value={fundForm.code} placeholder="9C31118A"
              onChange={(e) => setFundForm((f) => ({ ...f, code: e.target.value }))} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            口数
            <input type="text" inputMode="numeric" value={fundForm.units} placeholder="500000"
              onChange={(e) => setFundForm((f) => ({ ...f, units: e.target.value }))} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            基準価額 (1万口)
            <input type="text" inputMode="numeric" value={fundForm.navPerUnit} placeholder="32000"
              onChange={(e) => setFundForm((f) => ({ ...f, navPerUnit: e.target.value }))} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            評価額 (円)
            <input type="text" inputMode="numeric" value={fundForm.valuation} placeholder="空欄=自動計算"
              onChange={(e) => setFundForm((f) => ({ ...f, valuation: e.target.value }))} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            取得額 (任意・円)
            <input type="text" inputMode="numeric" value={fundForm.acquisitionCost} placeholder="空欄=損益0"
              onChange={(e) => setFundForm((f) => ({ ...f, acquisitionCost: e.target.value }))} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            YTD % (任意)
            <input type="text" inputMode="decimal" value={fundForm.ytdReturnPct} placeholder="0"
              onChange={(e) => setFundForm((f) => ({ ...f, ytdReturnPct: e.target.value }))} style={simInputStyle} />
          </label>
          <button type="button" onClick={onSaveHolding}>
            {editingFundId !== null ? '保存 (自動反映)' : '＋ 銘柄を追加'}
          </button>
          {editingFundId !== null && (
            <button type="button" onClick={onCancelEditHolding} style={{ color: 'var(--text-mute)' }}>
              キャンセル
            </button>
          )}
        </div>
        {fundError && <div style={{ color: '#f87171', fontSize: 12 }}>{fundError}</div>}
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
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.rowId}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{h.code || '—'}</td>
                <td style={tdStyle}>
                  {h.name}
                  {h.userTag && (
                    <span style={{ marginLeft: 6, padding: '1px 6px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderRadius: 3, fontSize: 10 }}>
                      {h.userTag}
                    </span>
                  )}
                </td>
                <td style={tdNum}>{h.units > 0 ? h.units.toLocaleString() : '—'}</td>
                <td style={tdNum}>{h.navPerUnit > 0 ? jpy(h.navPerUnit) : '—'}</td>
                <td style={tdNum}>
                  {jpy(h.valuation)}
                  {h.user && (
                    <span
                      title={h.valuationMode === 'manual'
                        ? '手動入力の評価額 (編集で空欄にすると自動計算に戻ります)'
                        : '口数 ÷ 1万 × 基準価額 で自動計算 (口数・基準価額の編集に追従)'}
                      style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-mute)', cursor: 'help' }}
                    >
                      {h.valuationMode === 'manual' ? '手動' : '自動'}
                    </span>
                  )}
                </td>
                <td style={{ ...tdNum, color: h.ytdReturnPct >= 0 ? '#22c55e' : '#ef4444' }}>
                  {h.ytdReturnPct >= 0 ? '+' : ''}{h.ytdReturnPct.toFixed(1)}%
                </td>
                <td style={tdStyle}>
                  {h.user && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" onClick={() => onStartEditHolding(h.rowId, h)} style={{ fontSize: 11 }}>
                        編集
                      </button>
                      <button type="button" onClick={() => removeHolding(h.rowId)} style={{ fontSize: 11, color: '#f87171' }}>
                        削除
                      </button>
                    </span>
                  )}
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
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '毎月の積立額 (円)', kind: 'money', allowZero: false }} value={simMonthly} onChange={setSimMonthly} width={120} />
          <GuardedNumber spec={{ label: '想定年率 (%)', kind: 'percent', allowZero: true, max: 100 }} value={simRate} onChange={setSimRate} width={120} />
          <GuardedNumber spec={{ label: '積立年数', kind: 'years', allowZero: false, max: 80 }} value={simYears} onChange={setSimYears} width={120} />
        </div>
        <div className="stat-grid">
          <Stat label="将来評価額" value={jpy(sim.futureValue)} positive />
          <Stat label="累計拠出額" value={jpy(sim.totalContributed)} />
          <Stat label={`運用益 (${sim.gainPct.toFixed(1)}%)`} value={jpy(sim.totalGain)} positive={sim.totalGain >= 0} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 毎月末積立・年率一定を仮定した複利の概算です。実際の運用成績は変動し元本割れの可能性があります。投資助言ではありません。
        </div>
      </Section>

      <Section title="貯蓄計画 (目標達成・緊急予備資金・概算)">
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '目標額 (円)', kind: 'money', allowZero: false }} value={goalTarget} onChange={setGoalTarget} width={120} />
          <GuardedNumber spec={{ label: '想定年率 (%)', kind: 'percent', allowZero: true, max: 100 }} value={goalRate} onChange={setGoalRate} width={120} />
          <GuardedNumber spec={{ label: '達成年数', kind: 'years', allowZero: false, max: 80 }} value={goalYears} onChange={setGoalYears} width={120} />
          <GuardedNumber spec={{ label: '毎月の生活費 (円)', kind: 'money', allowZero: false }} value={monthlyExpense} onChange={setMonthlyExpense} width={120} />
          <GuardedNumber spec={{ label: '現在の積立額 (円)', kind: 'money', allowZero: true }} value={currentMonthly} onChange={setCurrentMonthly} width={120} />
          <GuardedNumber spec={{ label: '想定インフレ率 (%)', kind: 'percent', allowZero: true, max: 100 }} value={inflationRate} onChange={setInflationRate} width={120} />
          <GuardedNumber spec={{ label: '手元資金 (円)', kind: 'money', allowZero: true }} value={cashOnHand} onChange={setCashOnHand} width={120} />
        </div>
        <div className="stat-grid">
          <Stat label="目標達成に必要な毎月積立額" value={jpy(requiredMonthly)} />
          <Stat label="72の法則 (資産倍増)" value={doubleYears === null ? '—' : `約 ${doubleYears} 年`} />
          <Stat label={`緊急予備資金 (生活費${efMonths}か月)`} value={jpy(emergency)} />
        </div>
        <div className="stat-grid" style={{ marginTop: 12 }}>
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
          ※ 毎月末積立・年率一定を仮定した概算です。実質価値は (1+インフレ率)^年数 で割り引いた購買力、実質利回りはフィッシャー式 (1+名目)/(1+インフレ)−1。緊急予備資金は生活費の{efMonths}か月分（会社員3〜6・自営6〜12か月が目安。設定の「数値パラメータ」で変えられます）。投資助言ではありません。
        </div>
      </Section>

      <Section title="外貨換算・為替損益 (概算)">
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '外貨額', kind: 'ratio', allowZero: false, sane: 1e9 }} value={fxAmount} onChange={setFxAmount} width={120} />
          <GuardedNumber spec={{ label: '取得時レート', kind: 'ratio', allowZero: false, sane: 10000 }} value={fxAcqRate} onChange={setFxAcqRate} width={120} />
          <GuardedNumber spec={{ label: '現在レート', kind: 'ratio', allowZero: false, sane: 10000 }} value={fxCurRate} onChange={setFxCurRate} width={120} />
        </div>
        <div className="stat-grid">
          <Stat label="現在の円換算額" value={jpy(fxJpy)} />
          <Stat label="為替損益" value={jpy(fxPnl.gain)} positive={fxPnl.gain >= 0} />
          <Stat label="損益率" value={fxPnl.gainPct === null ? '—' : `${fxPnl.gainPct}%`} positive={(fxPnl.gainPct ?? 0) >= 0} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 為替変動による円ベースの損益のみの概算で、手数料・スプレッド・税は含みません。投資助言ではありません。
        </div>

        <div className="field-grid" style={{ margin: '16px 0 12px' }}>
          <GuardedNumber spec={{ label: '為替手数料 (片道・円)', kind: 'ratio', allowZero: true, sane: 1000 }} value={fxFee} onChange={setFxFee} width={120} />
        </div>
        <div className="stat-grid">
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

