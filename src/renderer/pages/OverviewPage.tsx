import { useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { useCollection } from '../data/useCollection';
import {
  BUSINESS_UNITS_COLLECTION,
  financialUnitsFromBusinessUnits,
  sortBusinessUnits,
  type BusinessUnitInput,
} from '../data/businessUnits';
import {
  HIGHLIGHT_SETTINGS_COLLECTION,
  parseHighlightSettings,
  type HighlightSettings,
} from '../data/highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../data/managementHighlights';
import { INDUSTRY_PRESETS } from '../data/industryPresets';
import { SALES_COLLECTION, type SalesEntry } from '../data/sales';
import { KPI_ACTUALS_COLLECTION, monthlyTrendSeries, summarizeFundamentals, type KpiActual } from '../data/kpiActuals';
import { profitSensitivity, breakEvenDeltaPct, requiredRevenueForTarget, fixedCostReductionImpact, operatingLeverage } from '../data/profitSensitivity';
import { KPI_BUDGETS_COLLECTION } from '../data/budgetVariance';
import { BALANCE_SHEET_COLLECTION, type BalanceSheet } from '../data/balanceSheet';
import { MEMBERS_COLLECTION, type Member } from '../data/members';
import {
  HYDROPONICS_COLLECTION,
  HYDROPONIC_CROPS_COLLECTION,
  HYDROPONICS_DEFAULTS,
  cropListFromRecords,
  economicsFromSetup,
  hydroponicsBusinessUnit,
  lowPotassiumFromSetup,
  resolveCrop,
  type HydroponicCropListRecord,
  type HydroponicsSetup,
} from '../data/hydroponicsSetup';
import { latestRecord } from '../data/latestRecord';
import { useParameters } from '../data/parameterOverrides';
import {
  businessConsumptionParams,
  ckdPotassiumLimits,
  corporateTaxRates,
  financialHealthBands,
  hydroponicsProductionParams,
  lowPotassiumParams,
  radarAxisBands,
} from '../../shared/parameters';
import {
  CKD_POTASSIUM_LIMIT_MG,
  checkNutrientSolution,
  servingGramsWithinLimit,
  type HydroponicCrop,
  type LowPotassiumParams,
} from '../../shared/hydroponics';
import {
  CROP_FIELD_LABELS,
  CROP_NUMERIC_FIELDS,
  DEFAULT_CROP_LIST,
  addCrop,
  findCrop,
  isBuiltinCropId,
  missingBuiltinCrops,
  parseCropNumber,
  removeCrop,
  restoreBuiltinCrops,
  type CropListChange,
  type CropNumericField,
} from '../../shared/hydroponicCrops';
import { GuardedNumber } from '../components/GuardedNumber';
import { readNumberOr0, type NumSpec } from '../data/inputGuards';
import { usePlan } from '../plan/usePlan';
import { localIsoDate } from '../../shared/localDate';
import { buildBusinessOverview } from '../data/overview';
import {
  MANUAL_OVERRIDES_COLLECTION,
  applyManualOverrides,
  type ManualOverrideEntry,
} from '../data/manualData';
import { VERDICT_LABEL, buildManagementScorecard } from '../../shared/managementScorecard';
import { buildManagementHighlights, summarizeHighlights, RISK_BAND_LABEL, type RiskBand } from '../data/managementHighlights';
import { buildManagementReport } from '../data/managementReport';
import { sparklinePoints } from '../data/sparkline';
import { cashForecastTrajectory } from '../data/cashForecast';
import { combineCashflowDebtService } from '../data/cashflowDebtService';
import { useServiceData } from '../hooks/useServiceData';
import { RealtimeTicker, type RealtimeRow } from '../components/RealtimeTicker';
import { annualizedPace } from '../../shared/realtimeProjection';
import { FinancialAnalysis } from '../components/FinancialAnalysis';
import { BankSubmissionPanel } from '../components/BankSubmissionSheet';
import {
  BANK_SUBMISSION_COLLECTION,
  buildBankSubmissionSheet,
  settingsFromRecord,
  type BankSubmissionSettings,
} from '../data/bankSubmission';
import { SNAPSHOT } from '../data/snapshot';

const SCORE_COLOR = (s: number | null): string =>
  s === null ? 'var(--text-mute)' : s >= 80 ? '#22c55e' : s >= 60 ? '#3ec98a' : s >= 40 ? '#f59e0b' : '#ef4444';
const TREND_LABEL: Record<string, string> = { up: '↗ 上昇', down: '↘ 下降', flat: '→ 横ばい', none: '—' };
const TREND_COLOR: Record<string, string | undefined> = { up: '#22c55e', down: '#ef4444', flat: undefined, none: undefined };
const RISK_BAND_COLOR: Record<RiskBand, string> = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e', none: 'var(--text-mute)' };

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

/**
 * 設備・費用・実測値の入力欄の性質。読み取り (`readNumberOr0`) と警告
 * (`GuardedNumber`) が同じ関数を使うので、「警告は出ないのに 0 で計算されて
 * いた」が起きない。以前は `Number()` で読めない値を黙って 0 にしていた ——
 * 全角の「１００」や「10万」を打つと床面積 0 のまま試算が出て、画面には
 * 自信のある間違った数字が並んだ。
 *
 * 0 を断るのは、0 だと試算そのものが意味を失う欄だけ (床面積・段数・割合・
 * 単価)。費用は 0 が実態のこともある (自己所有なら地代家賃 0)。実測値は
 * **0 = 未測定** が仕様なので、未入力も 0 も黙って通す。
 */
const HYDRO_SPECS = {
  floorAreaSqm: { label: '床面積 (m²)', kind: 'area' },
  tiers: { label: '棚の段数', kind: 'count', allowZero: false, sane: 30 },
  usableRatioPct: { label: '栽培に使える割合 (%)', kind: 'percent', allowZero: false, max: 100 },
  yieldRatePct: { label: '歩留まり (%)', kind: 'percent', allowZero: false, max: 100 },
  unitPriceYen: { label: '販売単価 (円/株)', kind: 'money', allowZero: false, sane: 10_000 },
  electricityYenPerKwh: { label: '電力単価 (円/kWh)', kind: 'money', sane: 200 },
  energyIntensityKwhPerKg: { label: '電力原単位 (kWh/kg)', kind: 'energy' },
  seedYenPerPlant: { label: '種苗費 (円/株)', kind: 'money', sane: 1_000 },
  nutrientYenPerPlant: { label: '肥料・養液 (円/株)', kind: 'money', sane: 1_000 },
  packagingYenPerPlant: { label: '包装・資材 (円/株)', kind: 'money', sane: 1_000 },
  laborYenPerMonth: { label: '人件費 (円/月)', kind: 'money' },
  depreciationYenPerMonth: { label: '減価償却費 (円/月)', kind: 'money' },
  rentYenPerMonth: { label: '地代家賃 (円/月)', kind: 'money' },
  otherFixedYenPerMonth: { label: 'その他固定費 (円/月)', kind: 'money' },
  switchDaysBeforeHarvest: { label: '切替 (収穫前・日)', kind: 'days', allowZero: false },
  measuredPotassiumMgPer100g: { label: '実測カリウム (mg/100g)', kind: 'mgPer100g', allowEmpty: true },
  measuredSodiumMgPer100g: { label: '実測ナトリウム (mg/100g)', kind: 'mgPer100g', allowEmpty: true },
} as const satisfies Record<string, NumSpec>;

/** 品目の入力欄の文字列 (品目名 + 数値の欄)。 */
type CropDraftForm = Record<'label' | CropNumericField, string>;

/** 選んでいる品目の値を入力欄へ写す (似た品目から少し変えて足すのが普通の使い方)。 */
function cropDraftFrom(c: HydroponicCrop): CropDraftForm {
  const draft = { label: '' } as CropDraftForm;
  for (const f of CROP_NUMERIC_FIELDS) draft[f] = String(c[f]);
  return draft;
}

const cropFieldLabel: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2,
};

/**
 * 水耕栽培の設備・費用を入力するパネル。
 *
 * 初期値は参考値だが、**保存するまで経営サマリーには載らない**。参考値が
 * そのまま経営数値になると、サンプルと実データの区別がつかなくなる。
 *
 * 品目の一覧は利用者が増減できる (`crops` / `onCropsChange`)。一覧は設定とは
 * 別のレコードに保存され、**設定を保存し直すまで試算の品目は変わらない**
 * (足しただけで数字が動くと、何を保存したのか分からなくなる)。
 */
/** 上限の表示。制限のない病期 (null) は「—」。 */
function mgOf(v: number | null): string {
  return v === null ? '—' : num.format(v);
}

/** 3 病期とも学会の目安のままか (上書きされていれば出典の言い方を変える)。 */
function ckdLimitsAreDefault(limits: ReturnType<typeof ckdPotassiumLimits>): boolean {
  return (['G3b', 'G4', 'G5'] as const).every((s) => limits[s] === CKD_POTASSIUM_LIMIT_MG[s]);
}

function HydroponicsPanel({
  current,
  crops,
  lowKParams,
  onSave,
  onCropsChange,
}: {
  current: HydroponicsSetup | null;
  crops: readonly HydroponicCrop[];
  /** 低カリウム評価の基準 (台帳の値。案内文の日数に使う)。 */
  lowKParams: LowPotassiumParams;
  onSave: (s: HydroponicsSetup) => Promise<void> | void;
  onCropsChange: (crops: readonly HydroponicCrop[]) => Promise<void> | void;
}) {
  const base = current ?? HYDROPONICS_DEFAULTS;
  const [cropId, setCropId] = useState<string>(base.cropId);
  const [form, setForm] = useState({
    floorAreaSqm: String(base.floorAreaSqm),
    tiers: String(base.tiers),
    usableRatioPct: String(base.usableRatioPct),
    yieldRatePct: String(base.yieldRatePct),
    unitPriceYen: String(base.unitPriceYen),
    switchDaysBeforeHarvest: String(base.switchDaysBeforeHarvest ?? 8),
    measuredPotassiumMgPer100g: String(base.measuredPotassiumMgPer100g ?? 0),
    measuredSodiumMgPer100g: String(base.measuredSodiumMgPer100g ?? 0),
    electricityYenPerKwh: String(base.electricityYenPerKwh),
    energyIntensityKwhPerKg: String(base.energyIntensityKwhPerKg),
    seedYenPerPlant: String(base.seedYenPerPlant),
    nutrientYenPerPlant: String(base.nutrientYenPerPlant),
    packagingYenPerPlant: String(base.packagingYenPerPlant),
    laborYenPerMonth: String(base.laborYenPerMonth),
    depreciationYenPerMonth: String(base.depreciationYenPerMonth),
    rentYenPerMonth: String(base.rentYenPerMonth),
    otherFixedYenPerMonth: String(base.otherFixedYenPerMonth),
  });
  const [saved, setSaved] = useState(false);
  const [lowK, setLowK] = useState(base.lowPotassium === true);
  const [ec, setEc] = useState('');
  const [ph, setPh] = useState('');

  // 選んだ品目が消されていれば先頭へ寄せる。select の value と試算の品目を
  // 必ず同じにするため、以降は `crop.id` を使う。
  const crop = resolveCrop(cropId, crops);
  const [draft, setDraft] = useState<CropDraftForm>(() => cropDraftFrom(crop));
  const [cropNotice, setCropNotice] = useState<string | null>(null);
  const missingBuiltins = missingBuiltinCrops(crops);
  const savedCrop = current === null ? undefined : findCrop(crops, current.cropId);

  /** 一覧の増減を保存し、新しい一覧を返す。断られたら文言を出して null (投げない)。 */
  const applyCrops = async (r: CropListChange): Promise<readonly HydroponicCrop[] | null> => {
    if (!r.ok) {
      setCropNotice(r.issues.join('。'));
      return null;
    }
    await onCropsChange(r.crops);
    return r.crops;
  };
  const onAddCrop = async () => {
    const next = await applyCrops(addCrop(crops, {
      ...draft,
      ...Object.fromEntries(CROP_NUMERIC_FIELDS.map((f) => [f, parseCropNumber(draft[f])])),
    }));
    if (next === null) return;
    const added = next[next.length - 1]!;
    setCropId(added.id);
    setSaved(false);
    setDraft((d) => ({ ...d, label: '' }));
    setCropNotice(`「${added.label}」を足して品目に選びました。試算に使うには設定を保存してください。`);
  };
  const onRemoveCrop = async (target: HydroponicCrop) => {
    if ((await applyCrops(removeCrop(crops, target.id))) === null) return;
    setCropNotice(`「${target.label}」を消しました。`);
  };
  const onRestoreCrops = async () => {
    if ((await applyCrops(restoreBuiltinCrops(crops))) === null) return;
    setCropNotice('参考値の品目を戻しました。');
  };

  // 読めない値は 0 になるが、同じ欄の `GuardedNumber` がその旨を出す (黙って 0 にしない)。
  const n = readNumberOr0;

  const field = (key: keyof typeof form) => (
    <GuardedNumber
      spec={HYDRO_SPECS[key]}
      value={form[key]}
      width={110}
      onChange={(v) => { setForm((f) => ({ ...f, [key]: v })); setSaved(false); }}
    />
  );

  const nutrient = ec.trim() !== '' && ph.trim() !== ''
    ? checkNutrientSolution(crop, n(ec), n(ph))
    : null;

  return (
    <div>
      <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
        栽培設備と費用を入力すると、出荷株数・月次損益・電力を試算して経営サマリーに載せます。
        初期値は公開資料の参考値です（<strong>保存するまで経営サマリーには反映されません</strong>）。
        <strong>※ 概算試算であり、事業計画や投資判断の保証ではありません。</strong>
      </p>

      {current !== null && savedCrop === undefined && (
        <div style={{ color: '#f59e0b', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
          保存した設定の品目「{current.cropId}」は一覧にありません。先頭の品目（{crops[0]!.label}）で試算しています。
          品目を選び直して保存してください。
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={cropFieldLabel}>
          品目
          <select
            value={crop.id}
            aria-label="品目"
            onChange={(e) => { setCropId(e.target.value); setSaved(false); }}
            style={{ ...settingsInput, width: 150 }}
          >
            {crops.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          育苗 {crop.nurseryDays} 日 ＋ 定植後 {crop.growOutDays} 日 ／ 収穫 {crop.harvestWeightG} g/株 ／
          パネル {crop.plantsPerPanel} 穴 ／ 養液 EC {crop.ecLow}〜{crop.ecHigh} mS/cm・pH {crop.phLow}〜{crop.phHigh}
        </div>
      </div>

      <details style={{ marginBottom: 10 }}>
        <summary style={{ fontSize: 12, color: 'var(--text-mute)', cursor: 'pointer' }}>
          品目を増やす・減らす（現在 {crops.length} 品目）
        </summary>
        <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: 'var(--text-mute)', fontSize: 11, lineHeight: 1.6, margin: 0 }}>
            参考値の {DEFAULT_CROP_LIST.length} 品目は出発点です。自分の品目を足し、使わない品目は消せます
            （最後の 1 品目は消せません）。値は桁と形だけ確かめます — 正しさは実測で置き換えてください。
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.9 }}>
            {crops.map((c) => (
              <li key={c.id}>
                {c.label}
                <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
                  {isBuiltinCropId(c.id) ? '（参考値）' : '（追加）'}
                  育苗 {c.nurseryDays} 日・定植後 {c.growOutDays} 日・{c.harvestWeightG} g/株・パネル {c.plantsPerPanel} 穴
                </span>{' '}
                <button
                  type="button"
                  disabled={crops.length <= 1}
                  aria-label={`${c.label} を消す`}
                  onClick={async () => { await onRemoveCrop(c); }}
                  style={{ fontSize: 11 }}
                >
                  消す
                </button>
              </li>
            ))}
          </ul>
          {missingBuiltins.length > 0 && (
            <div>
              <button type="button" onClick={async () => { await onRestoreCrops(); }} style={{ fontSize: 11 }}>
                参考値の品目を戻す（{missingBuiltins.map((c) => c.label).join('・')}）
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={cropFieldLabel}>
              品目名
              <input
                type="text"
                value={draft.label}
                aria-label="品目名"
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                style={{ ...settingsInput, width: 150 }}
              />
            </label>
            {CROP_NUMERIC_FIELDS.map((f) => (
              <label key={f} style={cropFieldLabel}>
                {CROP_FIELD_LABELS[f]}
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft[f]}
                  aria-label={CROP_FIELD_LABELS[f]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                  style={settingsInput}
                />
              </label>
            ))}
            <button type="button" onClick={async () => { await onAddCrop(); }}>
              この品目を足す
            </button>
          </div>
          {cropNotice && <div role="status" style={{ fontSize: 12, lineHeight: 1.6 }}>{cropNotice}</div>}
        </div>
      </details>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        {field('floorAreaSqm')}
        {field('tiers')}
        {field('usableRatioPct')}
        {field('yieldRatePct')}
        {field('unitPriceYen')}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        {field('electricityYenPerKwh')}
        {field('energyIntensityKwhPerKg')}
        {field('seedYenPerPlant')}
        {field('nutrientYenPerPlant')}
        {field('packagingYenPerPlant')}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        {field('laborYenPerMonth')}
        {field('depreciationYenPerMonth')}
        {field('rentYenPerMonth')}
        {field('otherFixedYenPerMonth')}
        <button
          type="button"
          onClick={async () => {
            await onSave({
              cropId: crop.id,
              floorAreaSqm: n(form.floorAreaSqm),
              tiers: n(form.tiers),
              usableRatioPct: n(form.usableRatioPct),
              yieldRatePct: n(form.yieldRatePct),
              unitPriceYen: n(form.unitPriceYen),
              electricityYenPerKwh: n(form.electricityYenPerKwh),
              energyIntensityKwhPerKg: n(form.energyIntensityKwhPerKg),
              seedYenPerPlant: n(form.seedYenPerPlant),
              nutrientYenPerPlant: n(form.nutrientYenPerPlant),
              packagingYenPerPlant: n(form.packagingYenPerPlant),
              laborYenPerMonth: n(form.laborYenPerMonth),
              depreciationYenPerMonth: n(form.depreciationYenPerMonth),
              rentYenPerMonth: n(form.rentYenPerMonth),
              otherFixedYenPerMonth: n(form.otherFixedYenPerMonth),
              lowPotassium: lowK,
              switchDaysBeforeHarvest: n(form.switchDaysBeforeHarvest),
              measuredPotassiumMgPer100g: n(form.measuredPotassiumMgPer100g),
              measuredSodiumMgPer100g: n(form.measuredSodiumMgPer100g),
            });
            setSaved(true);
          }}
        >
          保存して経営サマリーへ反映
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          養液 EC (mS/cm)
          <input type="text" inputMode="decimal" value={ec} onChange={(e) => setEc(e.target.value)} style={settingsInput} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          養液 pH
          <input type="text" inputMode="decimal" value={ph} onChange={(e) => setPh(e.target.value)} style={settingsInput} />
        </label>
        {nutrient && (
          <div style={{ fontSize: 12, color: nutrient.ok ? '#22c55e' : '#f59e0b', lineHeight: 1.7 }}>
            {nutrient.ok
              ? `適正範囲内です（EC ${crop.ecLow}〜${crop.ecHigh} / pH ${crop.phLow}〜${crop.phHigh}）。`
              : `範囲外です — ${!nutrient.ecInRange ? `EC は ${crop.ecLow}〜${crop.ecHigh} mS/cm` : ''}${!nutrient.ecInRange && !nutrient.phInRange ? '、' : ''}${!nutrient.phInRange ? `pH は ${crop.phLow}〜${crop.phHigh}` : ''} が目安。EC が高すぎるとレタス類は苦味が出ます。`}
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={lowK}
            onChange={(e) => { setLowK(e.target.checked); setSaved(false); }}
          />
          低カリウム栽培として扱う（腎臓病の方向け）
        </label>
        <p style={{ color: 'var(--text-mute)', fontSize: 11, lineHeight: 1.6, margin: '6px 0 10px' }}>
          収穫前 {lowKParams.switchDaysMin}〜{lowKParams.switchDaysMax} 日に、培養液の硝酸カリウムを同濃度の硝酸ナトリウムへ置き換えます。
          カリウムを抜いた分をナトリウムで補って浸透圧と EC を保つ方法です（培養液にナトリウムが無いと生育不良になります）。
          <strong>カリウム量は出荷ロットごとに実測してください。</strong>測っていない値を「低カリウム」として出すことはできません。
        </p>
        {lowK && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {field('switchDaysBeforeHarvest')}
            {field('measuredPotassiumMgPer100g')}
            {field('measuredSodiumMgPer100g')}
          </div>
        )}
      </div>
      {saved && <div style={{ color: '#22c55e', fontSize: 12, marginTop: 6 }}>保存しました。経営サマリーに反映されています。</div>}
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
  const thresholds = latestRecord(settingsRecords)?.data ?? DEFAULT_HIGHLIGHT_THRESHOLDS;
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

  // 手入力の保存先は全画面共通 (manual-overrides)。入力欄は App が 1 か所で
  // 描くので、ここは「読んで適用する」だけを持つ。
  const overridesCol = useCollection<ManualOverrideEntry>(MANUAL_OVERRIDES_COLLECTION);

  // 登録した事業を事業間比較へ合流させる。同梱の 10 件は**模擬データ**なので、
  // 実績と並べる以上は見分けが付かないといけない — ラベルに「(サンプル)」を付け、
  // `sample: true` を立て、利用者の事業を先に置く (既定の選択が自分の事業になる)。
  // 棒グラフは 1 本ずつラベルが付くので並べてよいが、連結は 1 つの数に潰れる。
  // そちらは `consolidationScope` が出所ごとに分けて合算する。
  const { records: businessUnitRecords } = useCollection<BusinessUnitInput>(BUSINESS_UNITS_COLLECTION);
  const userFinancialUnits = useMemo(
    () => financialUnitsFromBusinessUnits(sortBusinessUnits(businessUnitRecords)),
    [businessUnitRecords],
  );
  const overrideRecords = overridesCol.records;

  // 水耕栽培: 最新の 1 件を採用する (貸借対照表と同じ扱い)。品目の一覧は
  // 別 collection に持つ (増減のたびに設定の履歴を増やさない)。
  const hydroCol = useCollection<HydroponicsSetup>(HYDROPONICS_COLLECTION);
  const cropCol = useCollection<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);
  const hydroSetup = latestRecord(hydroCol.records)?.data ?? null;
  const crops = useMemo(() => cropListFromRecords(cropCol.records), [cropCol.records]);
  // 台帳の数値パラメータ (設定画面で上書きできる)。試算の関数へ引数で渡す —
  // 台帳を読む大域の状態は置かない (`shared/parameters.ts`)。
  const { values: paramValues } = useParameters();
  const productionParams = useMemo(() => hydroponicsProductionParams(paramValues), [paramValues]);
  const lowKParams = useMemo(() => lowPotassiumParams(paramValues), [paramValues]);
  const ckdLimits = useMemo(() => ckdPotassiumLimits(paramValues), [paramValues]);
  const corpRates = useMemo(() => corporateTaxRates(paramValues), [paramValues]);
  const bizConsumption = useMemo(() => businessConsumptionParams(paramValues), [paramValues]);
  const healthBands = useMemo(() => financialHealthBands(paramValues), [paramValues]);
  const radarBands = useMemo(() => radarAxisBands(paramValues), [paramValues]);
  const hydroponics = useMemo(
    () => economicsFromSetup(hydroSetup, crops, productionParams),
    [hydroSetup, crops, productionParams],
  );
  // 水耕栽培も 1 事業として並べる。別枠の「参考」にすると、全社の数字に
  // 入っているのかどうかが画面から分からない。未入力なら並ばない。
  const hydroUnit = useMemo(() => hydroponicsBusinessUnit(hydroponics), [hydroponics]);
  const financialUnits = useMemo(
    () => [
      ...userFinancialUnits,
      ...(hydroUnit === null ? [] : [hydroUnit]),
      ...SNAPSHOT.business.units.map((u) => ({
        id: u.id,
        label: `${u.label} (サンプル)`,
        sample: true,
        current: {
          revenue: u.current.revenue,
          variableCost: u.current.variableCost,
          fixedCost: u.current.fixedCost,
          profit: u.current.profit,
          profitMargin: u.current.profitMargin,
        },
        // 月次 KPI をそのまま通す。売上と利益だけに絞ると、3 軸グラフが
        // 過去の指標を出せなくなる (snapshot は元から全項目を持っている)。
        history: u.history.map((h) => ({
          revenue: h.revenue,
          variableCost: h.variableCost,
          fixedCost: h.fixedCost,
          profit: h.profit,
          profitMargin: h.profitMargin,
        })),
      })),
    ],
    [userFinancialUnits, hydroUnit],
  );
  const lowPotassium = useMemo(() => lowPotassiumFromSetup(hydroSetup, lowKParams), [hydroSetup, lowKParams]);

  const computedOverview = useMemo(
    () =>
      buildBusinessOverview({
        plan,
        sales: salesRecords.map((r) => r.data),
        kpiActuals: kpiRecords.map((r) => r.data),
        kpiBudgets: budgetRecords.map((r) => r.data),
        // BS は最新の 1 レコードを採用。
        balanceSheet: latestRecord(bsRecords)?.data ?? null,
        accounting: accountingMonthly,
        members: memberRecords.map((r) => ({ role: r.data.role })),
        hydroponics,
        lowPotassium,
      }),
    [plan, salesRecords, kpiRecords, budgetRecords, bsRecords, accountingMonthly, memberRecords, hydroponics, lowPotassium],
  );

  // 手入力の上書きを自動計算の上に重ねる。**ここ 1 か所**で、以降の表示・
  // スコアカード・レポートすべてが手入力後の数値を見る。
  const applied = useMemo(
    () => applyManualOverrides('overview', computedOverview, overrideRecords.map((r) => r.data)),
    [computedOverview, overrideRecords],
  );
  const overview = applied.overview;

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
  const highlightSummary = useMemo(() => summarizeHighlights(highlights), [highlights]);

  const monthlyTrend = useMemo(() => monthlyTrendSeries(kpiRecords.map((r) => r.data)), [kpiRecords]);

  /*
   * 秒単位の帯に出す行。
   *
   * **ここに渡すのは「年額」である。** 集計値 (総売上・営業利益) は年初来の
   * 実績なので、そのまま渡すと「年額を按分し直した値」になり、実績より
   * 小さい数が出てしまう。年換算のペースへ直してから渡す。
   *
   * 年初のうちは経過が小さく、わずかな実績が莫大な年換算に化ける。
   * `annualizedPace` は下限 (既定 1%) 未満なら `null` を返すので、
   * その間は帯に出さない —— 0 除算の Infinity を画面へ流すより、
   * 出さないほうが正しい。
   */
  const realtimeRows: RealtimeRow[] = useMemo(() => {
    const now = new Date();
    const rows: RealtimeRow[] = [];
    const salesPace = annualizedPace(overview.sales.totalAmount, now);
    if (salesPace !== null && salesPace > 0) {
      rows.push({
        label: '売上 (年換算ペース)',
        annual: salesPace,
        color: '#3ec98a',
        hint: '年初来の実績を経過で割り戻した年換算',
      });
    }
    if (overview.kpi.hasData) {
      const opPace = annualizedPace(overview.kpi.operatingProfit, now);
      if (opPace !== null && opPace !== 0) {
        rows.push({ label: '営業利益 (年換算ペース)', annual: opPace, color: '#4f9cf9' });
      }
    }
    return rows;
  }, [overview.sales.totalAmount, overview.kpi.hasData, overview.kpi.operatingProfit]);
  const fundamentals = useMemo(() => summarizeFundamentals(kpiRecords.map((r) => r.data)), [kpiRecords]);
  const sensitivity = useMemo(() => {
    if (!overview.kpi.hasData) return null;
    return { rows: profitSensitivity(fundamentals), breakEvenDelta: breakEvenDeltaPct(fundamentals), fixedCuts: fixedCostReductionImpact(fundamentals), dol: operatingLeverage(fundamentals) };
  }, [overview.kpi.hasData, fundamentals]);

  const [targetProfit, setTargetProfit] = useState('');
  const targetRevenue = useMemo(() => {
    const t = Number(targetProfit);
    if (!overview.kpi.hasData || !Number.isFinite(t) || targetProfit.trim() === '') return null;
    return requiredRevenueForTarget(fundamentals, t);
  }, [overview.kpi.hasData, fundamentals, targetProfit]);

  const [reportCopied, setReportCopied] = useState(false);
  const report = useMemo(
    () => buildManagementReport(overview, scorecard, highlights, localIsoDate(), monthlyTrend, sensitivity?.breakEvenDelta ?? null),
    [overview, scorecard, highlights, monthlyTrend, sensitivity],
  );

  // 金融機関等提出用の書面。書式と提出者情報は 1 レコードに保存し、最新を採用する
  // (ハイライトのしきい値と同じ読み方)。数字は上の `overview` / `scorecard` /
  // `debtService` をそのまま書式に通す — 画面と書面で計算を分けない。
  const submissionCol = useCollection<BankSubmissionSettings>(BANK_SUBMISSION_COLLECTION);
  const submissionSettings = useMemo(
    () => settingsFromRecord(latestRecord(submissionCol.records)?.data),
    [submissionCol.records],
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const kpiPeriods = useMemo(() => kpiRecords.map((r) => r.data.period), [kpiRecords]);
  const balanceSheetAsOf = latestRecord(bsRecords)?.data.asOf ?? null;
  const sheetModel = useMemo(
    () =>
      buildBankSubmissionSheet({
        overview,
        scorecard,
        debtService,
        kpiPeriods,
        balanceSheetAsOf,
        today: localIsoDate(),
        settings: submissionSettings,
      }),
    [overview, scorecard, debtService, kpiPeriods, balanceSheetAsOf, submissionSettings],
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
    a.download = `management-report-${localIsoDate()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasData =
    salesRecords.length > 0 || kpiRecords.length > 0 || memberRecords.length > 0;

  if (sheetOpen) {
    return (
      <BankSubmissionPanel
        model={sheetModel}
        settings={submissionSettings}
        onSave={(s) => submissionCol.add(s)}
        onClose={() => setSheetOpen(false)}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          title="金額を千円単位・負数を △ で表す金融機関等の書式に揃え、A4 で印刷できる書面を開きます"
        >
          金融機関等提出用の書式で表示
        </button>
      </div>
      {hasData && highlights.length > 0 && (
        <Section title={`経営ハイライト — 総合 ${scorecard.overallScore}/100（${VERDICT_LABEL[scorecard.verdict]}）`}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
            <span
              style={{
                fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 999,
                color: '#fff', background: RISK_BAND_COLOR[highlightSummary.riskBand],
              }}
            >
              総合リスク: {RISK_BAND_LABEL[highlightSummary.riskBand]}
            </span>
            <span style={{ color: 'var(--text-mute)' }}>🔴 要対応 {highlightSummary.critical}</span>
            <span style={{ color: 'var(--text-mute)' }}>🟡 注意 {highlightSummary.warning}</span>
            <span style={{ color: 'var(--text-mute)' }}>🟢 良好 {highlightSummary.good}</span>
            <span style={{ color: 'var(--text-mute)' }}>／ 計 {highlightSummary.total} 件</span>
          </div>
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
            {sensitivity.dol !== null && (
              <> 営業レバレッジ <strong>{sensitivity.dol}倍</strong>（売上+1%で営業利益+{sensitivity.dol}%）。</>
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
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 6 }}>固定費を削減したら (営業利益の改善)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sensitivity.fixedCuts.map((c) => (
                <Tile
                  key={c.reductionPct}
                  label={`固定費 −${c.reductionPct}%`}
                  value={yen.format(c.newOperatingProfit)}
                  accent={c.newOperatingProfit >= 0 ? '#22c55e' : '#ef4444'}
                  sub={`改善 +${yen.format(c.profitImprovement)}`}
                />
              ))}
            </div>
          </div>
        </Section>
      )}

      {applied.staleDerived.length > 0 && (
        <Section title="自動値のままの指標">
          <div
            data-stale-derived
            style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-mute)' }}
          >
            <strong style={{ color: '#f59e0b' }}>
              手で置いた数値から計算される指標が、自動値のままです。
            </strong>
            <div style={{ marginTop: 4 }}>{applied.staleDerived.map((d) => d.label).join(' / ')}</div>
            <div style={{ marginTop: 4 }}>
              上書きは表示の置き換えであり、再計算はしません。必要なものは画面下の
              「事業・数値の手入力」から併せて置いてください。
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

        {realtimeRows.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <RealtimeTicker
              rows={realtimeRows}
              note="年初来の実績を経過で割り戻した年換算ペースを、さらに経過で按分した「ここまでの発生見込み」です。集計の元データはこの刻みでは取り直しません (上流の API 上限を守るため) — 取り直しは上の更新ボタンから。"
            />
          </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))', gap: 12 }}>
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
              {overview.kpi.yoy && overview.kpi.yoy.revenueYoYPct !== null && (
                <Tile
                  label="前年同月比 (YoY)"
                  value={`${overview.kpi.yoy.revenueYoYPct > 0 ? '+' : ''}${overview.kpi.yoy.revenueYoYPct}%`}
                  accent={overview.kpi.yoy.revenueYoYPct >= 0 ? '#22c55e' : '#ef4444'}
                  sub={`${overview.kpi.yoy.period} vs ${overview.kpi.yoy.priorPeriod}`}
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

      <Section title={`水耕栽培の試算${overview.hydroponics ? ` — 日産 ${num.format(overview.hydroponics.shippedPlantsPerDay)} 株` : ''}`}>
        <HydroponicsPanel
          current={hydroSetup}
          crops={crops}
          lowKParams={lowKParams}
          onSave={(s) => hydroCol.add(s)}
          onCropsChange={(c) => cropCol.add({ crops: c })}
        />
        {overview.hydroponics && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '14px 0 4px' }}>
              生産量（入力した設備から）
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Tile label="出荷株数 (日)" value={`${num.format(overview.hydroponics.shippedPlantsPerDay)} 株`} />
              <Tile label="出荷株数 (月)" value={`${num.format(overview.hydroponics.shippedPlantsPerMonth)} 株`} />
              <Tile label="出荷重量 (年)" value={`${num.format(Math.round(overview.hydroponics.shippedKgPerYear))} kg`} />
              <Tile
                label="電力量 (年)"
                value={`${num.format(overview.hydroponics.energyKwhPerYear)} kWh`}
                sub="歩留まりが落ちても減らない（照明は動き続ける）"
              />
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>収支（月次）</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Tile label="月商" value={yen.format(overview.hydroponics.revenue)} />
              <Tile
                label="営業利益"
                value={yen.format(overview.hydroponics.operatingProfit)}
                accent={overview.hydroponics.operatingProfit >= 0 ? '#22c55e' : '#ef4444'}
                sub={`営業利益率 ${overview.hydroponics.operatingMarginPct.toFixed(1)}%`}
              />
              <Tile
                label="出荷 1 株あたり原価"
                value={safeYen(Math.round(overview.hydroponics.costPerShippedPlantYen))}
                sub="変動費と固定費の両方を売れた株が背負う"
              />
              <Tile
                label="電気代が費用に占める割合"
                value={`${overview.hydroponics.electricityCostRatioPct.toFixed(1)}%`}
                sub={`年間 ${yen.format(overview.hydroponics.electricityYenPerYear)}`}
              />
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>損益分岐</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Tile
                label="損益分岐の出荷株数 (月)"
                value={
                  overview.hydroponics.breakEvenPlantsPerMonth === null
                    ? '—'
                    : `${num.format(overview.hydroponics.breakEvenPlantsPerMonth)} 株`
                }
                accent={overview.hydroponics.meetsBreakEven ? '#22c55e' : '#ef4444'}
                sub={
                  overview.hydroponics.breakEvenPlantsPerMonth === null
                    ? '単価が株あたり変動費以下です。何株売っても固定費を回収できません。'
                    : overview.hydroponics.meetsBreakEven
                      ? '現在の出荷量で固定費を回収できています。'
                      : `現在の出荷は ${num.format(overview.hydroponics.shippedPlantsPerMonth)} 株。単価か歩留まりを上げるか、固定費を下げる必要があります。`
                }
              />
              <Tile label="損益分岐点売上高 (月)" value={yen.format(overview.hydroponics.bep)} />
              <Tile label="限界利益率" value={`${overview.hydroponics.contributionRatio.toFixed(1)}%`} />
            </div>

            {overview.hydroponics.lowPotassium && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>
                  低カリウム栽培（腎臓病の方向け）
                </div>
                {overview.hydroponics.lowPotassium.measured ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <Tile
                        label="実測カリウム"
                        value={`${overview.hydroponics.lowPotassium.potassiumMgPer100g} mg/100g`}
                        sub={`通常品 ${overview.hydroponics.lowPotassium.referenceMgPer100g} mg/100g 比 ${overview.hydroponics.lowPotassium.reductionPct >= 0 ? '−' : '+'}${Math.abs(overview.hydroponics.lowPotassium.reductionPct).toFixed(1)}%`}
                        accent={overview.hydroponics.lowPotassium.reductionPct > 0 ? '#22c55e' : '#ef4444'}
                      />
                      <Tile
                        label="切替 (収穫前)"
                        value={`${hydroSetup?.switchDaysBeforeHarvest ?? 0} 日`}
                        accent={overview.hydroponics.lowPotassium.switchWindowOk ? undefined : '#f59e0b'}
                        sub={
                          overview.hydroponics.lowPotassium.switchWindowOk
                            ? `目安 ${lowKParams.switchDaysMin}〜${lowKParams.switchDaysMax} 日の範囲内`
                            : `目安は ${lowKParams.switchDaysMin}〜${lowKParams.switchDaysMax} 日です`
                        }
                      />
                      <Tile
                        label="食塩相当量"
                        value={
                          overview.hydroponics.lowPotassium.saltEquivalentGPer100g === null
                            ? '未測定'
                            : `${overview.hydroponics.lowPotassium.saltEquivalentGPer100g.toFixed(2)} g/100g`
                        }
                        sub="カリウムを抜いた分ナトリウムが増えます"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {(['G3b', 'G4'] as const).map((stage) => {
                        const grams = servingGramsWithinLimit(overview.hydroponics!.lowPotassium!, stage, 20, ckdLimits);
                        return (
                          <Tile
                            key={stage}
                            label={`${stage} の方が食べられる量`}
                            value={grams === null ? '—' : `${num.format(grams)} g`}
                            sub="1 日のカリウム上限の 20% をこの野菜に充てた場合"
                          />
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: '3px solid #ef4444',
                      borderRadius: 6,
                      padding: '8px 12px',
                      marginBottom: 12,
                      fontSize: 13,
                      color: 'var(--text)',
                    }}
                  >
                    ⚠️ <strong>カリウムを実測していません。</strong>この状態では低カリウム野菜として出荷できません。
                    出荷ロットごとに測定し、実測値を入力してください。
                  </div>
                )}
                <p style={{ color: 'var(--text-mute)', fontSize: 11, lineHeight: 1.7, marginBottom: 12 }}>
                  カリウム制限は慢性腎臓病の{' '}
                  <strong>
                    G3b で {mgOf(ckdLimits.G3b)} mg/日以下、G4 で {mgOf(ckdLimits.G4)} mg/日以下、G5 で {mgOf(ckdLimits.G5)} mg/日以下
                  </strong>
                  が目安です（{ckdLimitsAreDefault(ckdLimits) ? '日本腎臓学会' : '設定画面で上書きした値'}）。G3a までは一律の制限を設けません。血清カリウム値が安定していれば制限しないこともあり、
                  <strong>実際の指示は主治医と管理栄養士が個別に決めます</strong>。ここの数字は栽培側の管理用で、
                  食事指導に代わるものではありません。
                </p>
              </>
            )}

            <p style={{ color: 'var(--text-mute)', fontSize: 11, lineHeight: 1.7 }}>
              この節の数値は<strong>入力した栽培設備からの試算</strong>で、KPI 実績には合算していません
              （実績と計画が同じ数字として並ばないようにするため）。電気代は販管費に入れています —
              棚を止めない限り出ていく費用なので、変動費に入れると限界利益が実態より大きく出て
              損益分岐点を低く見せるからです。
            </p>
          </>
        )}
      </Section>

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

      <Section title="事業別 財務指標分析 (15指標 × レーダー/折れ線/円/棒)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          下の一覧・グラフには<strong>登録した事業</strong>（画面下の「事業・数値の手入力」で
          売上高を入れたもの）が先に並びます。続く「(サンプル)」付きの 10 件は
          <strong>同梱の模擬データ</strong>で、ご自身の実績ではありません。
          {userFinancialUnits.length === 0 && (
            <> いまは登録した事業がないため、サンプルのみを表示しています。</>
          )}
        </div>
        <FinancialAnalysis
          units={financialUnits}
          effectiveTaxRate={paramValues['finance.effectiveTaxRate']}
          corporateTaxRates={corpRates}
          businessConsumption={bizConsumption}
          healthBands={healthBands}
          radarBands={radarBands}
        />
      </Section>
    </div>
  );
}
