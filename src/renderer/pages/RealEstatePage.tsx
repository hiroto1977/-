import { useMemo, useState } from 'react';
import {
  MANUAL_OVERRIDES_COLLECTION,
  applyManualOverrides,
  type ManualOverrideEntry,
} from '../data/manualData';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { ServiceActionPanel } from '../components/ServiceActionPanel';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { useCollection } from '../data/useCollection';
import {
  PROPERTIES_COLLECTION,
  PROPERTY_TYPES,
  parsePropertyEntry,
  propertyToForm,
  computeRealEstatePortfolio,
  type PropertyEntry,
} from '../data/investments';
import { jpy } from '../../shared/formatters';
import { GuardedNumber } from '../components/GuardedNumber';
import { readNumberOr0, type NumSpec } from '../data/inputGuards';
import {
  calcRealEstateYield,
  calcRealEstateLeverage,
  calcNoiYield,
  calcDscr,
  calcBreakEvenOccupancyPct,
  calcNpv,
  calcIrr,
} from '../../shared/realEstateMetrics';
import { straightLineAnnual, straightLineSchedule } from '../../shared/depreciation';
import {
  planSite,
  planFactory,
  NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP,
  type RoadMultiplierCategory,
  planRoadSlope,
  planShadowRegulation,
  planSetbackTradeoff,
  SHADOW_HEIGHT_THRESHOLD_M,
} from '../../shared/zoningPlanner';
import { buildSchematicFloors } from '../../shared/buildingIso';
import { BuildingIso } from '../components/BuildingIso';
import {
  planWaterBalance,
  planRoSizing,
  planNitrification,
  planAeration,
  checkEffluent,
} from '../../shared/waterCyclePlanner';

const reInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 140,
};
// 読み取りは inputGuards に統一。警告 (GuardedNumber) と計算が同じ関数を使うので、
// 「警告は出ないのに 0 で計算されていた」が起きない。
const reNum = readNumberOr0;

const jpyM = (n: number) => `¥${(n / 1_000_000).toFixed(1)}M`;

/** 敷地プランナーの用途地域プリセット (指定値は土地ごとに異なるため編集可)。 */
const ZONE_PRESETS = [
  { key: 'kinsho', label: '近隣商業地域', cov: '80', far: '200', workshopCap: String(NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP) },
  { key: 'shogyo', label: '商業地域', cov: '80', far: '400', workshopCap: String(NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP) },
  { key: 'custom', label: 'その他 (手入力)', cov: '60', far: '200', workshopCap: '' },
] as const;

const EMPTY_PROPERTY_FORM = {
  name: '',
  type: PROPERTY_TYPES[0] as string,
  monthlyRent: '',
  purchasePrice: '',
  monthlyExpenses: '',
  monthlyLoan: '',
  occupied: true,
};

export function RealEstatePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'real-estate',
    SNAPSHOT.realEstate,
  );
  const { monthlyCashflow } = data;

  // ユーザー追加の物件 (record store 永続化・端末内)。
  const { records: userProps, add: addProperty, edit: editProperty, remove: removeProperty } = useCollection<PropertyEntry>(PROPERTIES_COLLECTION);
  const [propForm, setPropForm] = useState(EMPTY_PROPERTY_FORM);
  const [propError, setPropError] = useState<string>();
  /** 編集中のユーザー物件 id (null = 新規追加モード)。 */
  const [editingPropId, setEditingPropId] = useState<string | null>(null);

  /** デモ (snapshot) 行 + ユーザー行の結合リスト。 */
  const properties = useMemo(
    () => [
      ...data.properties.map((p) => ({ ...p, rowId: p.id, user: false as const })),
      ...userProps.map((r) => ({ ...r.data, rowId: r.id, user: true as const })),
    ],
    [data.properties, userProps],
  );

  // ポートフォリオ集計は結合リストから再計算する (追加ゼロなら snapshot と同値)。
  const computedPortfolio = useMemo(
    () => computeRealEstatePortfolio(properties, monthlyCashflow.operatingExpenses, monthlyCashflow.mortgagePayment),
    [properties, monthlyCashflow.operatingExpenses, monthlyCashflow.mortgagePayment],
  );
  // 手入力の上書きを重ねる。入力欄は App が全画面共通で描くので、ここは
  // 読んで適用するだけ。
  const manualOverrides = useCollection<ManualOverrideEntry>(MANUAL_OVERRIDES_COLLECTION);
  const manualRecords = manualOverrides.records;
  const portfolio = useMemo(
    () =>
      applyManualOverrides('real-estate', computedPortfolio, manualRecords.map((r) => r.data))
        .overview,
    [computedPortfolio, manualRecords],
  );

  async function onSaveProperty() {
    try {
      const parsed = parsePropertyEntry(propForm);
      setPropError(undefined);
      if (editingPropId !== null) {
        await editProperty(editingPropId, parsed);
        setEditingPropId(null);
      } else {
        await addProperty(parsed);
      }
      setPropForm(EMPTY_PROPERTY_FORM);
    } catch (e) {
      setPropError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  /** ユーザー行の「編集」— フォームへ読み込み、保存で自動反映。 */
  function onStartEditProperty(rowId: string, p: PropertyEntry) {
    setPropForm(propertyToForm(p));
    setEditingPropId(rowId);
    setPropError(undefined);
  }

  function onCancelEditProperty() {
    setEditingPropId(null);
    setPropForm(EMPTY_PROPERTY_FORM);
    setPropError(undefined);
  }

  // レバレッジ試算 (CCR・イールドギャップ) — 入力はローカル。
  const [reRentStr, setReRentStr] = useState('168000');
  const [rePriceStr, setRePriceStr] = useState('42000000');
  const [reExpenseStr, setReExpenseStr] = useState('600000');
  const [reEquityStr, setReEquityStr] = useState('10000000');
  const [reDebtStr, setReDebtStr] = useState('1500000');
  const [reLoanRateStr, setReLoanRateStr] = useState('2.0');
  const leverage = useMemo(() => {
    const y = calcRealEstateYield(reNum(reRentStr), reNum(rePriceStr), 1, reNum(reExpenseStr));
    const lev = calcRealEstateLeverage(y.annualNetIncome, reNum(reEquityStr), reNum(reDebtStr), y.netYieldPct, reNum(reLoanRateStr));
    return { y, lev };
  }, [reRentStr, rePriceStr, reExpenseStr, reEquityStr, reDebtStr, reLoanRateStr]);

  // 精緻化指標 (NOI 利回り・DSCR・損益分岐入居率) — レバレッジ試算の入力を再利用。
  const [reOccStr, setReOccStr] = useState('95'); // 想定入居率 (%)
  const refined = useMemo(() => {
    const annualGrossRent = reNum(reRentStr) * 12;
    const occ = Math.min(1, Math.max(0, reNum(reOccStr) / 100));
    const opex = reNum(reExpenseStr);
    const debt = reNum(reDebtStr);
    const noiY = calcNoiYield(annualGrossRent, occ, opex, reNum(rePriceStr));
    const dscr = calcDscr(noiY.noi, debt);
    const ber = calcBreakEvenOccupancyPct(opex, debt, annualGrossRent);
    return { noiY, dscr, ber };
  }, [reRentStr, reOccStr, reExpenseStr, reDebtStr, rePriceStr]);

  // NPV / IRR — 自己資金を初期投資 (マイナス) とし、各年の税引前CF、最終年に売却ネット手取りを加算。
  const [npvDiscountStr, setNpvDiscountStr] = useState('4.0'); // 割引率 (%)
  const [npvYearsStr, setNpvYearsStr] = useState('10'); // 保有年数
  const [npvSaleStr, setNpvSaleStr] = useState('35000000'); // 売却ネット手取り
  const dcf = useMemo(() => {
    const years = Math.max(1, Math.min(50, Math.round(reNum(npvYearsStr))));
    const annualCf = leverage.lev.annualCashflow; // 返済後の年間CF (概算)
    const sale = reNum(npvSaleStr);
    const equity = reNum(reEquityStr);
    const flows: number[] = [-equity];
    for (let t = 1; t <= years; t += 1) {
      flows.push(t === years ? annualCf + sale : annualCf);
    }
    const npv = calcNpv(flows, reNum(npvDiscountStr) / 100);
    const irr = calcIrr(flows);
    return { years, npv, irr };
  }, [npvYearsStr, npvSaleStr, reEquityStr, npvDiscountStr, leverage.lev.annualCashflow]);

  // 敷地プランナー — 用途地域の規制から建てられる規模と工場150㎡プランを試算。
  const [zoneKey, setZoneKey] = useState<(typeof ZONE_PRESETS)[number]['key']>('kinsho');
  const [zpSiteStr, setZpSiteStr] = useState('300');
  const [zpCovStr, setZpCovStr] = useState('80');
  const [zpFarStr, setZpFarStr] = useState('200');
  const [zpRoadStr, setZpRoadStr] = useState('6');
  const [zpCat, setZpCat] = useState<RoadMultiplierCategory>('other');
  const [zpCorner, setZpCorner] = useState(false);
  const [zpFireproof, setZpFireproof] = useState(false);
  const [zpCapStr, setZpCapStr] = useState(String(NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP));
  const [zpWorkshopStr, setZpWorkshopStr] = useState('');
  // 高さ制限 — 道路斜線 (法56条1項1号) と日影規制 (法56条の2)。
  const [zpHeightStr, setZpHeightStr] = useState('12.1');
  const [zpSetbackStr, setZpSetbackStr] = useState('1.5');
  const [zpRearStr, setZpRearStr] = useState('0.5');
  const [zpSideStr, setZpSideStr] = useState('3.0');
  const [zpSiteDepthStr, setZpSiteDepthStr] = useState('20');
  const [zpSiteWidthStr, setZpSiteWidthStr] = useState('15');
  const [zpShadowThresholdStr, setZpShadowThresholdStr] = useState(String(SHADOW_HEIGHT_THRESHOLD_M));
  // 対象区域かどうかは自治体の条例指定。'unknown' を既定にして断定しない。
  const [zpShadowArea, setZpShadowArea] = useState<'unknown' | 'yes' | 'no'>('unknown');

  function onZonePreset(key: (typeof ZONE_PRESETS)[number]['key']) {
    setZoneKey(key);
    const preset = ZONE_PRESETS.find((z) => z.key === key);
    if (preset) {
      setZpCovStr(preset.cov);
      setZpFarStr(preset.far);
      setZpCapStr(preset.workshopCap);
    }
  }

  const zoning = useMemo(() => {
    const site = planSite({
      siteArea: reNum(zpSiteStr),
      coverageRatioPct: reNum(zpCovStr),
      farPct: reNum(zpFarStr),
      roadWidthM: reNum(zpRoadStr),
      category: zpCat,
      cornerLot: zpCorner,
      fireproofBonus: zpFireproof,
    });
    const capRaw = zpCapStr.trim() === '' ? Number.POSITIVE_INFINITY : reNum(zpCapStr);
    const factory = planFactory({
      maxFootprint: site.maxFootprint,
      maxTotalFloor: site.maxTotalFloor,
      workshopCapSqm: capRaw,
      ...(zpWorkshopStr.trim() !== '' ? { desiredWorkshopSqm: reNum(zpWorkshopStr) } : {}),
    });
    const height = reNum(zpHeightStr);
    const slope = planRoadSlope({
      roadWidthM: reNum(zpRoadStr),
      setbackM: reNum(zpSetbackStr),
      category: zpCat,
      plannedHeightM: height,
    });
    const shadow = planShadowRegulation({
      plannedHeightM: height,
      thresholdM: reNum(zpShadowThresholdStr),
      ...(zpShadowArea === 'unknown' ? {} : { designatedArea: zpShadowArea === 'yes' }),
    });
    const tradeoff = planSetbackTradeoff({
      siteDepthM: reNum(zpSiteDepthStr),
      siteWidthM: reNum(zpSiteWidthStr),
      rearSetbackM: reNum(zpRearStr),
      sideSetbackTotalM: reNum(zpSideStr),
      maxFootprint: site.maxFootprint,
      roadWidthM: reNum(zpRoadStr),
      category: zpCat,
      plannedHeightM: height,
    });
    // 立体プレビューは「実際に建てられる寸法」で組む。トレードオフが建蔽率で
    // 頭打ちなら、幅はそのままで奥行を建蔽率上限に合わせて詰める。
    const isoWidth = tradeoff.buildableWidthM;
    const isoDepth =
      isoWidth > 0 ? Math.min(tradeoff.buildableDepthM, tradeoff.footprint / isoWidth) : 0;
    const schematic = buildSchematicFloors({
      widthM: isoWidth,
      depthM: isoDepth,
      workshopSqm: factory.workshopArea,
      groundOtherSqm: factory.groundFloorOther,
      upperFloorsSqm: factory.upperFloorsArea,
    });
    return {
      site, factory, slope, shadow, tradeoff, schematic,
      isoWidth, isoDepth,
      capUnlimited: zpCapStr.trim() === '',
    };
  }, [
    zpSiteStr, zpCovStr, zpFarStr, zpRoadStr, zpCat, zpCorner, zpFireproof, zpCapStr, zpWorkshopStr,
    zpHeightStr, zpSetbackStr, zpRearStr, zpSideStr, zpSiteDepthStr, zpSiteWidthStr,
    zpShadowThresholdStr, zpShadowArea,
  ]);

  // 水循環プランナー — クローズド水耕の水収支・RO 稼働率・硝化・排水規制を試算。
  const [wcVolStr, setWcVolStr] = useState('200');
  const [wcCycleStr, setWcCycleStr] = useState('14');
  const [wcRecoveryStr, setWcRecoveryStr] = useState('75');
  const [wcRejectionStr, setWcRejectionStr] = useState('90');
  const [wcWindowStr, setWcWindowStr] = useState('8');
  const [wcRoCapStr, setWcRoCapStr] = useState('600');
  const [wcTankStr, setWcTankStr] = useState('300');
  const [wcNStr, setWcNStr] = useState('50');
  const [wcConcNStr, setWcConcNStr] = useState('400');
  const [wcConcPStr, setWcConcPStr] = useState('40');
  const [wcToPublic, setWcToPublic] = useState(false);

  const water = useMemo(() => {
    const balance = planWaterBalance({
      systemVolumeL: reNum(wcVolStr),
      exchangeCycleDays: reNum(wcCycleStr),
      roRecoveryPct: reNum(wcRecoveryStr),
      roRejectionPct: reNum(wcRejectionStr),
    });
    const ro = planRoSizing({
      batchVolumeL: reNum(wcVolStr),
      processingWindowHours: reNum(wcWindowStr),
      exchangeCycleDays: reNum(wcCycleStr),
      ...(wcRoCapStr.trim() !== '' ? { machineCapacityLPerDay: reNum(wcRoCapStr) } : {}),
    });
    const nitri = planNitrification({ ammoniacalNMgL: reNum(wcNStr), volumeL: reNum(wcVolStr) });
    // 曝気タンクへの流入は「循環量 ÷ 交換周期」= 1 日あたりの入替量。
    const cycleDays = reNum(wcCycleStr);
    const aeration = planAeration({
      tankVolumeL: reNum(wcTankStr),
      inflowLPerDay: cycleDays > 0 ? reNum(wcVolStr) / cycleDays : 0,
    });
    const effluent = checkEffluent({
      concentrateTnMgL: reNum(wcConcNStr),
      concentrateTpMgL: reNum(wcConcPStr),
      annualDischargeL: balance.annualDischargeL,
      dischargeToPublicWater: wcToPublic,
    });
    return { balance, ro, nitri, aeration, effluent };
  }, [
    wcVolStr, wcCycleStr, wcRecoveryStr, wcRejectionStr, wcWindowStr, wcRoCapStr,
    wcTankStr, wcNStr, wcConcNStr, wcConcPStr, wcToPublic,
  ]);

  // 建物の減価償却 (定額法) — 取得後の建物は定額法。RC造の法定耐用年数は 47 年。
  const [bldgCostStr, setBldgCostStr] = useState('25000000');
  const [bldgLifeStr, setBldgLifeStr] = useState('47');
  const depreciation = useMemo(() => {
    const cost = reNum(bldgCostStr);
    const life = Math.round(reNum(bldgLifeStr));
    return { annual: straightLineAnnual(cost, life), schedule: straightLineSchedule(cost, life) };
  }, [bldgCostStr, bldgLifeStr]);

  return (
    <div>
      <StatusBar
        serviceId="real-estate"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>不動産投資 · {properties.length} 物件 / 月次 CF {jpy(portfolio.netCashflow)}</>}
      />

      <Section title="ポートフォリオ KPI" count={4}>
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <Stat label="月次キャッシュフロー" value={jpy(portfolio.netCashflow)} positive={portfolio.netCashflow >= 0} />
          <Stat label="ポートフォリオ利回り" value={`${portfolio.portfolioYield.toFixed(1)}%`} />
          <Stat label="入居率" value={`${(portfolio.occupancyRate * 100).toFixed(0)}%`} />
          <Stat label="月次家賃収入 (実績)" value={jpy(portfolio.grossRent)} />
        </div>
      </Section>

      <Section title={editingPropId !== null ? `物件を編集中 — ${propForm.name || '(無題)'}` : '物件を追加 (任意・この端末に保存)'}>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          {editingPropId !== null
            ? '値を書き換えて「保存」すると、KPI・キャッシュフロー・利回りへ即時に自動反映されます。'
            : '追加した物件は上の KPI・下の一覧とキャッシュフローに即時反映され、一覧の「編集」でいつでも入力し直せます。'}
          データはこの端末のブラウザ内 (IndexedDB) にのみ保存され、どこにも送信されません。
        </div>
        <div className="field-grid" style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            物件名
            <input type="text" value={propForm.name} placeholder="例: 福岡市アパート"
              onChange={(e) => setPropForm((f) => ({ ...f, name: e.target.value }))} style={{ ...reInputStyle, width: 180 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            種別
            <select value={propForm.type} onChange={(e) => setPropForm((f) => ({ ...f, type: e.target.value }))}
              style={{ ...reInputStyle, width: 130 }}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <GuardedNumber spec={{ label: '家賃 (月・円)', kind: 'money' }} value={propForm.monthlyRent} placeholder="100000"
            onChange={(v) => setPropForm((f) => ({ ...f, monthlyRent: v }))} />
          <GuardedNumber spec={{ label: '取得価格 (円)', kind: 'money', allowZero: false }} value={propForm.purchasePrice} placeholder="12000000"
            onChange={(v) => setPropForm((f) => ({ ...f, purchasePrice: v }))} />
          <GuardedNumber spec={{ label: '月次経費 (任意)', kind: 'money', allowEmpty: true, allowZero: true }} value={propForm.monthlyExpenses} placeholder="0"
            onChange={(v) => setPropForm((f) => ({ ...f, monthlyExpenses: v }))} />
          <GuardedNumber spec={{ label: '月次返済 (任意)', kind: 'money', allowEmpty: true, allowZero: true }} value={propForm.monthlyLoan} placeholder="0"
            onChange={(v) => setPropForm((f) => ({ ...f, monthlyLoan: v }))} />
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={propForm.occupied}
              onChange={(e) => setPropForm((f) => ({ ...f, occupied: e.target.checked }))} />
            入居中
          </label>
          <button type="button" onClick={onSaveProperty}>
            {editingPropId !== null ? '保存 (自動反映)' : '＋ 物件を追加'}
          </button>
          {editingPropId !== null && (
            <button type="button" onClick={onCancelEditProperty} style={{ color: 'var(--text-mute)' }}>
              キャンセル
            </button>
          )}
        </div>
        {propError && <div style={{ color: '#f87171', fontSize: 12 }}>{propError}</div>}
      </Section>

      <Section title="保有物件" count={properties.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>物件名</th>
              <th style={thStyle}>種別</th>
              <th style={thNum}>家賃 (月)</th>
              <th style={thNum}>取得価格</th>
              <th style={thNum}>表面利回り</th>
              <th style={thNum}>実質利回り (入居反映)</th>
              <th style={thStyle}>入居</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const y = calcRealEstateYield(p.monthlyRent, p.purchasePrice, p.occupied ? 1 : 0);
              return (
              <tr key={p.rowId}>
                <td style={tdStyle}>
                  {p.name}
                  {!p.user && (
                    <span style={{ marginLeft: 6, padding: '1px 6px', background: 'var(--bg-elev)', color: 'var(--text-mute)', borderRadius: 3, fontSize: 10 }}>
                      デモ
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{p.type}</td>
                <td style={tdNum}>{jpy(p.monthlyRent)}</td>
                <td style={tdNum}>{jpyM(p.purchasePrice)}</td>
                <td style={tdNum}>{y.grossYieldPct.toFixed(1)}%</td>
                <td style={tdNum}>{y.netYieldPct.toFixed(1)}%</td>
                <td style={tdStyle}>
                  <span style={{ color: p.occupied ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                    {p.occupied ? '● 入居中' : '○ 空室'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {p.user && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" onClick={() => onStartEditProperty(p.rowId, p)} style={{ fontSize: 11 }}>
                        編集
                      </button>
                      <button type="button" onClick={() => removeProperty(p.rowId)} style={{ fontSize: 11, color: '#f87171' }}>
                        削除
                      </button>
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <ServiceActionPanel serviceId="real-estate" serviceLabel="不動産投資" />

      <Section title="月次キャッシュフロー内訳" count={4}>
        <table style={tableStyle}>
          <tbody>
            <tr><td style={tdStyle}>家賃収入 (実績、空室除外)</td><td style={tdNum}>{jpy(portfolio.grossRent)}</td></tr>
            <tr><td style={tdStyle}>運営費用</td><td style={tdNum}>−{jpy(portfolio.operatingExpenses)}</td></tr>
            <tr><td style={tdStyle}>ローン返済</td><td style={tdNum}>−{jpy(portfolio.mortgagePayment)}</td></tr>
            <tr style={{ background: 'var(--bg-elev)' }}>
              <td style={{ ...tdStyle, fontWeight: 700 }}>純キャッシュフロー</td>
              <td style={{ ...tdNum, fontWeight: 700, color: portfolio.netCashflow >= 0 ? '#22c55e' : '#ef4444' }}>{jpy(portfolio.netCashflow)}</td>
            </tr>
          </tbody>
        </table>
        {userProps.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6, lineHeight: 1.6 }}>
            ※ 追加した {userProps.length} 物件の家賃・経費・返済を含めて再計算しています (デモ物件の経費・返済は既定値)。
          </div>
        )}
      </Section>

      <Section title="レバレッジ試算 (CCR・イールドギャップ)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          自己資金回収率 (CCR) と イールドギャップ (実質利回り − ローン金利) の目安です。
          イールドギャップがプラスなら借入が収益にプラスに働きます (正レバレッジ)。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          {([
            [{ label: '月額賃料', kind: 'money' }, reRentStr, setReRentStr],
            [{ label: '物件価格', kind: 'money', allowZero: false }, rePriceStr, setRePriceStr],
            [{ label: '年間経費', kind: 'money', allowZero: true }, reExpenseStr, setReExpenseStr],
            [{ label: '自己資金', kind: 'money', allowZero: true }, reEquityStr, setReEquityStr],
            [{ label: '年間返済額', kind: 'money', allowZero: true }, reDebtStr, setReDebtStr],
            [{ label: 'ローン金利(%)', kind: 'percent', allowZero: true, max: 30 }, reLoanRateStr, setReLoanRateStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} />
          ))}
        </div>
        <div className="stat-grid">
          <Stat label="実質利回り" value={`${leverage.y.netYieldPct}%`} />
          <Stat label="返済後CF (年)" value={jpy(leverage.lev.annualCashflow)} positive={leverage.lev.annualCashflow >= 0} />
          <Stat label="CCR (自己資金回収率)" value={`${leverage.lev.cashOnCashReturnPct}%`} />
          <Stat label="イールドギャップ" value={`${leverage.lev.yieldGapPct}%`} positive={leverage.lev.yieldGapPct >= 0} />
        </div>
      </Section>

      <Section title="精緻化指標 (NOI 利回り・DSCR・損益分岐入居率)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          上の試算入力に想定入居率を加え、空室損を控除した NOI ベースで評価します。
          DSCR は NOI ÷ 年間返済額で、<strong>1.0 未満は危険水域</strong>、1.2 以上が目安。
          損益分岐入居率を実際の入居率が下回ると赤字に転じます。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '想定入居率 (%)', kind: 'percent', min: 1, max: 100 }} value={reOccStr} onChange={setReOccStr} />
        </div>
        <div className="stat-grid">
          <Stat label="NOI (年)" value={jpy(refined.noiY.noi)} positive={refined.noiY.noi >= 0} />
          <Stat label="NOI 利回り" value={refined.noiY.noiYieldPct === null ? '—' : `${refined.noiY.noiYieldPct}%`} />
          <Stat
            label="DSCR"
            value={refined.dscr.dscr === null ? '—' : refined.dscr.dscr.toFixed(2)}
            positive={refined.dscr.band === 'healthy'}
          />
          <Stat label="損益分岐入居率" value={refined.ber === null ? '—' : `${refined.ber}%`} />
        </div>
      </Section>

      <Section title="NPV / IRR (割引キャッシュフロー試算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          自己資金を初期投資 (マイナス)、各年の返済後CF、最終年に売却ネット手取りを加えた
          キャッシュフロー列から NPV (割引率指定) と IRR (二分法で概算) を求めます。
          IRR は NPV がゼロになる割引率の目安です。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          {([
            [{ label: '割引率(%)', kind: 'percent', allowZero: true, max: 30 }, npvDiscountStr, setNpvDiscountStr],
            [{ label: '保有年数', kind: 'years', allowZero: false, max: 50 }, npvYearsStr, setNpvYearsStr],
            [{ label: '売却ネット手取り', kind: 'money', allowZero: true }, npvSaleStr, setNpvSaleStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} />
          ))}
        </div>
        <div className="stat-grid">
          <Stat label={`NPV (${dcf.years}年・割引後)`} value={dcf.npv === null ? '—' : jpy(dcf.npv)} positive={(dcf.npv ?? 0) >= 0} />
          <Stat label="IRR (年率概算)" value={dcf.irr === null ? '—' : `${(dcf.irr * 100).toFixed(2)}%`} positive={(dcf.irr ?? 0) >= 0} />
          <Stat label="返済後CF (年・前提)" value={jpy(leverage.lev.annualCashflow)} positive={leverage.lev.annualCashflow >= 0} />
        </div>
      </Section>

      <Section title="建物の減価償却 (定額法・概算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          建物 (1998年4月以降取得) は定額法。法定耐用年数は構造で異なります (RC造 47年 / 重量鉄骨 34年 / 木造 22年)。
          減価償却費は会計上の費用で節税に寄与しますが、<strong>※ 概算であり税務助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '建物取得価額 (円)', kind: 'money', allowZero: false }} value={bldgCostStr} onChange={setBldgCostStr} />
          <GuardedNumber spec={{ label: '耐用年数 (年)', kind: 'years', min: 1, max: 100 }} value={bldgLifeStr} onChange={setBldgLifeStr} />
        </div>
        <div className="stat-grid">
          <Stat label="年間減価償却費 (定額法)" value={jpy(depreciation.annual)} />
          <Stat label="償却年数" value={`${depreciation.schedule.length} 年`} />
        </div>
      </Section>

      <Section title="敷地プランナー — 建てられる規模と工場150㎡プラン (概算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          用途地域の建ぺい率・容積率・前面道路幅員から<strong>建築面積と延べ床面積の上限</strong>を概算し、
          近隣商業地域で植物工場などを計画する際の<strong>「作業場 150 ㎡以下 + 直売・カフェ併設」プラン</strong>を試算します。
          建ぺい率・容積率は都市計画で土地ごとに指定されるため、実際の指定値に書き換えてください。
          <strong>※ 概算であり建築・法務助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            用途地域プリセット
            <select value={zoneKey} onChange={(e) => onZonePreset(e.target.value as (typeof ZONE_PRESETS)[number]['key'])} style={{ ...reInputStyle, width: 160 }}>
              {ZONE_PRESETS.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
            </select>
          </label>
          {([
            [{ label: '敷地面積 (㎡)', kind: 'area' }, zpSiteStr, setZpSiteStr],
            [{ label: '建ぺい率 (%)', kind: 'percent', min: 1, max: 100 }, zpCovStr, setZpCovStr],
            [{ label: '容積率 (%)', kind: 'percent', min: 1, max: 1300 }, zpFarStr, setZpFarStr],
            [{ label: '前面道路幅員 (m)', kind: 'length', max: 100 }, zpRoadStr, setZpRoadStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} width={110} />
          ))}
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            道路乗数の区分
            <select value={zpCat} onChange={(e) => setZpCat(e.target.value as RoadMultiplierCategory)} style={{ ...reInputStyle, width: 150 }}>
              <option value="other">商業系ほか (6/10)</option>
              <option value="residential">住居系 (4/10)</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={zpCorner} onChange={(e) => setZpCorner(e.target.checked)} />
            角地 (+10%)
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={zpFireproof} onChange={(e) => setZpFireproof(e.target.checked)} />
            防火地域内の耐火建築物
          </label>
        </div>
        <div className="stat-grid" style={{ marginBottom: 14 }}>
          <Stat label="適用建ぺい率" value={`${zoning.site.effectiveCoveragePct}%`} />
          <Stat label="建築面積の上限" value={`${zoning.site.maxFootprint.toLocaleString()} ㎡`} />
          <Stat
            label={zoning.site.roadLimitedFarPct !== null && zoning.site.roadLimitedFarPct < reNum(zpFarStr) ? '実効容積率 (道路幅員で制限)' : '実効容積率'}
            value={`${zoning.site.effectiveFarPct}%`}
          />
          <Stat label="延べ床面積の上限" value={`${zoning.site.maxTotalFloor.toLocaleString()} ㎡`} />
        </div>
        {zoning.site.floorsToUseAll !== null && zoning.site.floorsToUseAll > 1 && (
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12 }}>
            延べ床上限を使い切るには約 {zoning.site.floorsToUseAll} フロア相当の計画になります。
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 8px' }}>📐 高さ制限 (道路斜線・日影規制)</div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '計画する最高高さ (m)', kind: 'length', max: 300 }} value={zpHeightStr} onChange={setZpHeightStr} width={130} />
          <GuardedNumber spec={{ label: '道路境界からの後退 (m)', kind: 'length', allowZero: true, max: 100 }} value={zpSetbackStr} onChange={setZpSetbackStr} width={130} />
          <GuardedNumber spec={{ label: '日影規制の対象高さ (m)', kind: 'length', max: 300 }} value={zpShadowThresholdStr} onChange={setZpShadowThresholdStr} width={130} />
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            日影規制の対象区域か (条例指定)
            <select value={zpShadowArea} onChange={(e) => setZpShadowArea(e.target.value as 'unknown' | 'yes' | 'no')} style={{ ...reInputStyle, width: 180 }}>
              <option value="unknown">未確認 (自治体に照会)</option>
              <option value="yes">対象区域</option>
              <option value="no">対象外</option>
            </select>
          </label>
        </div>
        <div className="stat-grid" style={{ marginBottom: 10 }}>
          <Stat label="道路斜線の高さ限度" value={`${zoning.slope.limitM.toLocaleString()} m`} />
          <Stat label={zoning.slope.ok ? '余裕' : '超過'} value={`${Math.abs(zoning.slope.marginM).toLocaleString()} m`} />
          <Stat label="この高さに必要な最小後退" value={`${zoning.slope.minSetbackM.toLocaleString()} m`} />
          <Stat label="日影規制を避けられる上限" value={`${zoning.shadow.maxHeightToAvoidM.toLocaleString()} m`} />
        </div>
        {!zoning.slope.ok && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>
            道路斜線を超えています — 後退を {zoning.slope.minSetbackM} m 以上取るか、高さを {zoning.slope.limitM} m 以下に抑える必要があります。
          </div>
        )}
        {zoning.shadow.regulated === null && zoning.shadow.exceedsThreshold && (
          <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>
            計画高さが {zoning.shadow.thresholdM} m を超えています。日影規制の対象区域かどうかは<strong>自治体の条例指定</strong>なのでここでは判定できません
            — 建築指導課に照会してください。対象だった場合は最高高さを {zoning.shadow.maxHeightToAvoidM} m 以下に抑えると対象から外れます。
          </div>
        )}
        {zoning.shadow.regulated === true && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>
            日影規制の対象です — 最高高さを {zoning.shadow.maxHeightToAvoidM} m 以下にすると対象から外れます (現在 {Math.abs(zoning.shadow.headroomM)} m 超過)。
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>↔️ 後退と建築面積のトレードオフ</div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={{ label: '敷地の奥行 (m)', kind: 'length', max: 2000 }} value={zpSiteDepthStr} onChange={setZpSiteDepthStr} width={120} />
          <GuardedNumber spec={{ label: '敷地の間口 (m)', kind: 'length', max: 2000 }} value={zpSiteWidthStr} onChange={setZpSiteWidthStr} width={120} />
          <GuardedNumber spec={{ label: '背面の後退 (m)', kind: 'length', allowZero: true, max: 100 }} value={zpRearStr} onChange={setZpRearStr} width={120} />
          <GuardedNumber spec={{ label: '側面の後退 合計 (m)', kind: 'length', allowZero: true, max: 200 }} value={zpSideStr} onChange={setZpSideStr} width={120} />
        </div>
        <div className="stat-grid" style={{ marginBottom: 10 }}>
          <Stat label="斜線を通す最小後退" value={`${zoning.tradeoff.requiredSetbackM.toLocaleString()} m`} />
          <Stat label="建てられる奥行" value={`${zoning.tradeoff.buildableDepthM.toLocaleString()} m`} />
          <Stat label="建てられる間口" value={`${zoning.tradeoff.buildableWidthM.toLocaleString()} m`} />
          <Stat
            label={zoning.tradeoff.limitedBy === 'coverage' ? '建築面積 (建ぺい率で頭打ち)' : '建築面積 (寸法で決まる)'}
            value={`${zoning.tradeoff.footprint.toLocaleString()} ㎡`}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 14 }}>
          高さを下げると必要な後退が減り、その分だけ奥行を使えます。建ぺい率の上限に当たるまでは、高さを削るほど建築面積が増えます。
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>🧊 立体プレビュー (分解アイソメ)</div>
        <BuildingIso
          widthM={zoning.isoWidth}
          depthM={zoning.isoDepth}
          floors={zoning.schematic}
          caption={`模式図です。間口 ${zoning.isoWidth.toLocaleString()} m × 奥行 ${zoning.isoDepth.toLocaleString()} m で、作業場を 1 階に敷き、残る延べ床を上階へ積んだ場合の概形。作業場を上階に置くと 150 ㎡ の合計制限を超えるため、緑は 1 階にしか出ません。`}
        />

        <div style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 8px' }}>🌱 工場プラン (作業場 + 直売・カフェ併設)</div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            作業場の法定上限 (㎡・空欄=制限なし)
            <input type="text" inputMode="numeric" value={zpCapStr} onChange={(e) => setZpCapStr(e.target.value)} style={{ ...reInputStyle, width: 150 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            希望する作業場面積 (㎡・空欄=上限まで)
            <input type="text" inputMode="numeric" value={zpWorkshopStr} onChange={(e) => setZpWorkshopStr(e.target.value)} style={{ ...reInputStyle, width: 170 }} />
          </label>
        </div>
        {zoning.factory.overCap && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>
            希望の作業場面積が法定上限を超えています — この用途地域では建てられないため、面積の縮小か準工業地域などの立地見直しが必要です。
          </div>
        )}
        <div className="stat-grid" style={{ marginBottom: 10 }}>
          <Stat label="作業場 (栽培室等)" value={`${zoning.factory.workshopArea.toLocaleString()} ㎡`} />
          <Stat label="1階の残り (直売・カフェ・事務)" value={`${zoning.factory.groundFloorOther.toLocaleString()} ㎡`} />
          <Stat label="2階以上に回せる面積" value={`${zoning.factory.upperFloorsArea.toLocaleString()} ㎡`} />
          <Stat
            label="作業場の延べ床比率"
            value={zoning.factory.workshopSharePct === null ? '—' : `${zoning.factory.workshopSharePct}%`}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          ※ 近隣商業地域・商業地域では、原動機を使用する工場は<strong>作業場の床面積合計 150 ㎡以下</strong>に制限されます
          (建築基準法48条・別表第二(り)項1号・(ぬ)項2号。日刊新聞印刷所・300㎡以下の自動車修理工場は例外)。
          150 ㎡は栽培室など<strong>実際に作業する部分</strong>で判定され、事務所・直売所などは作業場に算入しない取扱いが
          一般的なため、切り分けが設計の要点です。準住居は 50 ㎡、準工業・工業に面積上限はありません。
          建ぺい率は 60/80% の二択・容積率は 100〜500% から都市計画で指定 (53条1項3号・52条1項2号)。
          角地 +10%・防火地域内の耐火建築物等 +10% (指定 80% 区域は適用除外 = 100%) は53条3項・6項、
          前面道路 12m 未満の容積率制限 (幅員 × 住居系 4/10・その他 6/10 の低い方) は52条2項によります。
          <strong>見落としやすい規制:</strong> 近隣商業は条例指定区域で高さ 10m 超に日影規制が適用され (商業地域は対象外・法56条の2)、
          空調室外機・コンプレッサ等は騒音規制法の特定施設届出、一定規模超は駐車場附置義務条例の対象になりえます
          (工場立地法は農業 = 植物工場には不適用)。
          屋内栽培施設を「工場」としてどう扱うかは特定行政庁の個別判断です (令和2年 国住街第80号 技術的助言参照) —
          <strong>最終判断は必ず自治体の建築指導課への事前相談と建築確認で行ってください。</strong>
          LED の遮光・空調騒音・深夜搬出入への配慮は、住宅が混在しやすい近隣商業地域では特に重要です。
        </div>
      </Section>

      <Section title="水循環プランナー — クローズド水耕の水収支と機材規模 (概算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          有機水耕の閉ループ (生物処理 → 前処理 → RO) の<strong>水収支・RO 稼働率・硝化のアルカリ度消費・
          曝気タンクの滞留時間・排水の法規制</strong>を試算します。「排水を 100% 再利用」は物質収支上成立しない
          (濃縮廃液の排出が塩類の唯一の出口) こと、バッチ運転だと RO 膜が止水して詰まることを数値で確認できます。
          <strong>※ 概算であり設計・水処理・法務の専門助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          {([
            [{ label: '循環量 (L)', kind: 'ratio', allowZero: false, sane: 1e6 }, wcVolStr, setWcVolStr],
            [{ label: '交換周期 (日)', kind: 'count', allowZero: false, max: 365 }, wcCycleStr, setWcCycleStr],
            [{ label: 'RO 回収率 (%)', kind: 'percent', min: 1, max: 99 }, wcRecoveryStr, setWcRecoveryStr],
            [{ label: 'RO 塩除去率 (%)', kind: 'percent', min: 1, max: 100 }, wcRejectionStr, setWcRejectionStr],
            [{ label: 'RO 処理目標 (h)', kind: 'count', allowZero: false, max: 24 }, wcWindowStr, setWcWindowStr],
            [{ label: 'RO 機の日産 (L/日・空欄可)', kind: 'ratio', allowEmpty: true, allowZero: true, sane: 1e6 }, wcRoCapStr, setWcRoCapStr],
            [{ label: '曝気タンク容量 (L)', kind: 'ratio', allowZero: false, sane: 1e6 }, wcTankStr, setWcTankStr],
            [{ label: '硝化する N 濃度 (mg/L)', kind: 'ppm', allowZero: true }, wcNStr, setWcNStr],
            [{ label: '濃縮液の全窒素 (mg/L)', kind: 'ppm', allowZero: true }, wcConcNStr, setWcConcNStr],
            [{ label: '濃縮液の全りん (mg/L)', kind: 'ppm', allowZero: true }, wcConcPStr, setWcConcPStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} width={130} />
          ))}
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={wcToPublic} onChange={(e) => setWcToPublic(e.target.checked)} />
            濃縮液を公共用水域へ放流
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 8px' }}>💧 水収支 (1 バッチ)</div>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="再利用する透過水" value={`${water.balance.permeatePerBatchL.toLocaleString()} L`} />
          <Stat label="排出する濃縮廃液" value={`${water.balance.concentratePerBatchL.toLocaleString()} L`} />
          <Stat label="補給する新水" value={`${water.balance.freshMakeupPerBatchL.toLocaleString()} L`} />
          <Stat
            label="濃縮倍率"
            value={water.balance.concentrationFactor === null ? '∞ (排出口なし)' : `${water.balance.concentrationFactor}倍`}
          />
        </div>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="実際の水回収率" value={`${water.balance.recoveryPct}%`} />
          <Stat label="年間節水量" value={`${Math.round(water.balance.annualWaterSavedL).toLocaleString()} L`} />
          <Stat label="年間排出量" value={`${Math.round(water.balance.annualDischargeL).toLocaleString()} L`} />
          <Stat label="透過水の EC 持ち越し" value={`${water.balance.permeateEcCarryoverPct}%`} />
        </div>
        {water.balance.recoveryPct >= 100 && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
            回収率 100% は物質収支上成立しません — 排出をゼロにすると塩類が無限に蓄積します。ブリード (濃縮廃液の排出) が塩類の唯一の出口です。
          </div>
        )}
        {water.balance.accumulationRisk && (
          <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
            ⚠ RO 塩除去率が 90% 未満です — 透過水に 10% 超の塩が残り、閉ループで特定イオンが蓄積しやすくなります。
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>🔧 RO 稼働率と膜の保護</div>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="必要な RO 能力" value={`${Math.round(water.ro.requiredCapacityLPerDay).toLocaleString()} L/日`} />
          <Stat label="実処理時間" value={water.ro.actualProcessingHours === null ? '—' : `${water.ro.actualProcessingHours} h`} />
          <Stat label="稼働率 (周期比)" value={water.ro.dutyCyclePct === null ? '—' : `${water.ro.dutyCyclePct}%`} />
          <Stat label="連続止水日数" value={water.ro.idleDays === null ? '—' : `${water.ro.idleDays} 日`} />
        </div>
        {water.ro.capacityAdequate === false && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
            導入予定の RO 機では目標時間内にバッチを処理しきれません。能力の大きい機種か処理時間の延長が必要です。
          </div>
        )}
        {water.ro.stagnationRisk && (
          <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
            ⚠ 交換周期が長く RO 膜が大半の時間止水します — バイオフィルムが育ち、この設計が防ごうとしている目詰まりを運用で作ってしまいます。
            <strong>日々少量を入れ替える連続循環</strong>に変えるか、停止中の<strong>自動フラッシュ</strong>を制御に入れてください。
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>🧪 硝化・アルカリ度・曝気</div>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="硝化する窒素" value={`${water.nitri.nitrogenLoadG} g`} />
          <Stat label="消費アルカリ度" value={`${water.nitri.alkalinityConsumedGCaCO3} g (CaCO₃)`} />
          <Stat label="酸素要求量" value={`${water.nitri.oxygenDemandG} g`} />
          <Stat label="曝気タンク HRT" value={water.aeration.hrtHours === null ? '—' : `${water.aeration.hrtHours} h`} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8, lineHeight: 1.7 }}>
          給水は緩衝能ゼロの RO 水なので、消費したアルカリ度を戻さないと pH 制御が発振します。
          炭酸水素カリウムなら約 <strong>{water.nitri.khco3ToRedoseG} g</strong> の再付与が目安です。
          {water.aeration.adequate === false && (
            <span style={{ color: 'var(--warning)' }}>
              {' '}⚠ 曝気タンクの滞留時間 (HRT) が 24h 未満です — 有機物の無機化が不十分だと下流の膜が詰まります。
              目安タンク容量は約 {Math.round(water.aeration.requiredTankVolumeL).toLocaleString()} L。
            </span>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>⚖️ 濃縮廃液の排出</div>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="年間 窒素排出" value={`${water.effluent.annualNitrogenKg} kg`} />
          <Stat label="年間 りん排出" value={`${water.effluent.annualPhosphorusKg} kg`} />
          <Stat label="1日あたり排出" value={`${water.effluent.dailyDischargeM3} m³`} />
          <Stat label="地下水基準比 (硝酸性N)" value={`${water.effluent.nitrateVsGroundwaterFactor}倍`} />
        </div>
        {water.effluent.recommendReuse && (
          <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
            ⚠ 濃縮廃液の窒素・りんが一律排水基準を超えています。この液は硝酸・カリ・りん酸が濃縮された<strong>液肥そのもの</strong>なので、
            放流せず<strong>露地・土耕へ希釈施用</strong>するのが技術的にも法的にも安全です (捨てれば産業廃棄物・地下水の硝酸汚染の問題になります)。
          </div>
        )}
        {water.effluent.wpclNpApplicable && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
            排出水量が 50 m³/日以上のため、水質汚濁防止法の窒素・りん規制の対象になりえます。届出と処理設備が必要です。
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          ※ 硝化は窒素 1mg あたり CaCO₃ 換算 7.14mg のアルカリ度を消費し、酸素 4.57mg を要します (硝化の化学量論)。
          地下水の環境基準は硝酸性窒素及び亜硝酸性窒素で 10mg/L、公共用水域への一律排水基準は全窒素 120mg/L・全りん 16mg/L
          (閉鎖性水域の日間平均は 60 / 8mg/L) が目安です。<strong>実際の適用は自治体の上乗せ条例・地域指定・排出規模で変わる</strong>ため、
          放流を伴う場合は必ず自治体の環境部局に確認してください。濃縮廃液を捨てずに再利用すれば、これらの規制の多くを回避できます。
        </div>
      </Section>
    </div>
  );
}

