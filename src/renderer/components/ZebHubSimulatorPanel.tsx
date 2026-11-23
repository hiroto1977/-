import { useMemo, useState } from 'react';
import { Section } from './StatusBar';
import { GuardedNumber } from './GuardedNumber';
import { Stat } from './Stat';
import { RefusedFieldsNote } from './RefusedFieldsNote';
import { readNumberOr0, refusalLabels, refusedFields, refusingSpecs, type NumSpec } from '../data/inputGuards';
import {
  COST_COMPONENT_LABEL,
  DEFAULT_ZEB_HUB_INPUT as D,
  chooseBatterySize,
  simulateZebHub,
  zebHubInputErrors,
  type ZebHubInput,
} from '../../shared/zebHubFinance';
import { jpyWhole } from '../../shared/formatters';
import { simulateOutage, solarProfileKw, type OutageResult } from '../../shared/zebHubEms';

/**
 * 防災オフグリッド ZEB 拠点の収支 (2026-11-23)。
 *
 * ペロブスカイト太陽電池 + 大型蓄電池 + 水循環プラントを持つ 1 拠点の、利回り・回収年数・
 * 災害時の持ち時間と、蓄電池の容量の比べを出す。計算は `shared/zebHubFinance.ts` が持ち、
 * ここは入力を集めて結果を並べるだけ。入力は保存しない (その場の試算)。
 */

/** 比べる蓄電池の容量 (標準自律用 550 kWh 〜 市場取引ハイブリッド用 2,000 kWh)。 */
export const ZEB_BATTERY_CANDIDATES_KWH: readonly number[] = [0, 550, 1000, 1500, 2000];

const SPECS = refusingSpecs('judgement', {
  pvKw: { label: '発電の定格 (kW)', kind: 'kw', allowZero: false },
  yieldPerKw: { label: '1 kW あたりの発電量 (kWh/kW/日)', kind: 'kwhPerKwDay', allowZero: false },
  batteryKwh: { label: '蓄電池の容量 (kWh)', kind: 'kwh', allowZero: true },
  baseLoad: { label: '1 日の消費 (kWh)', kind: 'kwh', allowZero: false },
  criticalLoad: { label: '災害時に止めない負荷 (kWh/日)', kind: 'kwh', allowZero: true },
  gridPrice: { label: '買う電気の単価 (円/kWh)', kind: 'yenPerKwh', sane: 200 },
  wheelingValue: { label: '自己託送の価値 (円/kWh)', kind: 'yenPerKwh', sane: 200 },
  marketPrice: { label: '市場へ売る単価 (円/kWh)', kind: 'yenPerKwh', sane: 200 },
  spread: { label: '値差取引の差益 (円/kWh)', kind: 'yenPerKwh', sane: 200 },
  otherRevenue: { label: 'ほかの年間純収入 (円/年)', kind: 'money' },
  buildingCost: { label: '建築本体 (円)', kind: 'money' },
  pvCost: { label: 'ペロブスカイト発電 (円)', kind: 'money' },
  waterCost: { label: '水循環・生産プラント (円)', kind: 'money' },
  discountPct: { label: '割引率 (%)', kind: 'percent', max: 100 },
  pvSubsidyPct: { label: 'ペロブスカイトの補助率 (%)', kind: 'percent', max: 100 },
  batterySubsidyPct: { label: '蓄電池の補助率 (%)', kind: 'percent', max: 100 },
  batterySubsidyCap: { label: '蓄電池の補助の上限 (円)', kind: 'money' },
  minAutonomyHours: { label: '災害時に要る持ち時間 (h)', kind: 'hours', sane: 720 },
  refrigeration: { label: '冷凍冷蔵の消費 (kWh/日)', kind: 'kwh', allowZero: true },
} as const satisfies Record<string, NumSpec>);

type FieldKey = keyof typeof SPECS;

const FIELD_ORDER: readonly FieldKey[] = [
  'pvKw',
  'yieldPerKw',
  'batteryKwh',
  'baseLoad',
  'criticalLoad',
  'gridPrice',
  'wheelingValue',
  'marketPrice',
  'spread',
  'otherRevenue',
  'buildingCost',
  'pvCost',
  'waterCost',
  'discountPct',
  'pvSubsidyPct',
  'batterySubsidyPct',
  'batterySubsidyCap',
  'minAutonomyHours',
  'refrigeration',
];

/** 停電の持ち時間を見る長さ (時間)。災害のあと 3 日を自力で持つことを目安にする。 */
export const OUTAGE_HOURS = 72;
/** 停電の始まりの時刻 —— 日の入り (18 時)。翌朝まで発電が無い、いちばん厳しい始まり方。 */
export const OUTAGE_START_HOUR = 18;
/** 1 日の消費のうち、止めない負荷と冷凍冷蔵を除いた残りを 空調 : 店舗・EV に分ける比 (標準拠点の 45 : 35)。 */
const HVAC_SHARE_OF_REST = 45 / 80;

export interface OutageView {
  /** 晴れの日の発電があり、取り置き分だけが残っているとき (平時の取引で回す分を使い切った夜)。 */
  readonly reserveOnly: OutageResult;
  /** 雨や曇りが続き発電が無く、満充電から始めたとき。 */
  readonly noSun: OutageResult;
}

/**
 * 夕方 6 時に停電したときの持ち時間を、2 つの始まり方で出す。蓄電池が無ければ null。
 * 負荷の段は 止めない負荷 / 冷凍冷蔵 / 空調 / 店舗・EV —— 1 日の消費から前の 2 つを引いた残りを 45 : 35 で分ける。
 */
export function outageView(input: ZebHubInput, refrigerationKwhPerDay: number): OutageView | null {
  if (!(input.batteryKwh > 0)) return null;
  const rest = Math.max(0, input.baseLoadKwhPerDay - input.criticalLoadKwhPerDay - refrigerationKwhPerDay);
  const tierLoadKw = {
    0: input.criticalLoadKwhPerDay / 24,
    1: refrigerationKwhPerDay / 24,
    2: (rest * HVAC_SHARE_OF_REST) / 24,
    3: (rest * (1 - HVAC_SHARE_OF_REST)) / 24,
  };
  const profile = solarProfileKw(input.pvKw * input.specificYieldKwhPerKwDay);
  const fromDusk = [...profile.slice(OUTAGE_START_HOUR), ...profile.slice(0, OUTAGE_START_HOUR)];
  const run = (startSoc: number, pvKwByHour: readonly number[]): OutageResult =>
    simulateOutage({
      batteryKwh: input.batteryKwh,
      startSoc,
      tierLoadKw,
      pvKwByHour,
      roundTripEfficiency: input.roundTripEfficiency,
      maxHours: OUTAGE_HOURS,
    });
  // 使えない底 (1 − 深さ) + 災害用の取り置き分。
  const reserveSoc = 1 - input.usableDepth + input.usableDepth * input.reserveShare;
  return { reserveOnly: run(reserveSoc, fromDusk), noSun: run(1, [0]) };
}

const outageText = (r: OutageResult): string =>
  r.survived ? `${OUTAGE_HOURS} 時間以上 (止めない負荷は最後まで動く)` : `${r.criticalHours} 時間`;

const pctText = (share: number): string => String(Math.round(share * 1000) / 10);

const INITIAL: Readonly<Record<FieldKey, string>> = {
  pvKw: String(D.pvKw),
  yieldPerKw: String(Math.round(D.specificYieldKwhPerKwDay * 100) / 100),
  batteryKwh: String(D.batteryKwh),
  baseLoad: String(D.baseLoadKwhPerDay),
  criticalLoad: String(D.criticalLoadKwhPerDay),
  gridPrice: String(D.gridPurchasePrice),
  wheelingValue: String(D.wheelingValue),
  marketPrice: String(D.marketSalePrice),
  spread: String(D.arbitrageSpread),
  otherRevenue: String(D.otherRevenuePerYear),
  buildingCost: String(D.buildingCost),
  pvCost: String(D.pvCost),
  waterCost: String(D.waterPlantCost),
  discountPct: pctText(D.discountRate),
  pvSubsidyPct: '66.7',
  batterySubsidyPct: '33.3',
  batterySubsidyCap: '60000000',
  minAutonomyHours: '24',
  refrigeration: '0',
};

/** 画面の欄から計算の入力を組む (欄に無い前提は標準値のまま)。 */
export function zebInputFromFields(fields: Readonly<Record<FieldKey, string>>, sameArea: boolean): ZebHubInput {
  const n = (k: FieldKey): number => readNumberOr0(fields[k]);
  return {
    ...D,
    pvKw: n('pvKw'),
    specificYieldKwhPerKwDay: n('yieldPerKw'),
    batteryKwh: n('batteryKwh'),
    baseLoadKwhPerDay: n('baseLoad'),
    criticalLoadKwhPerDay: n('criticalLoad'),
    gridPurchasePrice: n('gridPrice'),
    wheelingValue: n('wheelingValue'),
    selfWheelingSameArea: sameArea,
    marketSalePrice: n('marketPrice'),
    arbitrageSpread: n('spread'),
    otherRevenuePerYear: n('otherRevenue'),
    buildingCost: n('buildingCost'),
    pvCost: n('pvCost'),
    waterPlantCost: n('waterCost'),
    discountRate: n('discountPct') / 100,
    subsidies: [
      { id: 'perovskite', name: 'ペロブスカイト導入支援', targets: ['pv'], rate: n('pvSubsidyPct') / 100, cap: null },
      {
        id: 'storage',
        name: '蓄電池の導入支援',
        targets: ['battery'],
        rate: n('batterySubsidyPct') / 100,
        cap: n('batterySubsidyCap'),
      },
    ],
  };
}

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 } as const;

const yearsText = (y: number | null): string => (y === null ? '回収できません' : `${Math.round(y * 10) / 10} 年`);
const irrText = (r: number | null): string => (r === null ? '算定できません' : `${Math.round(r * 1000) / 10}%`);
const hoursText = (h: number | null): string => (h === null ? '—' : `${Math.round(h)} 時間`);

export function ZebHubSimulatorPanel() {
  const [fields, setFields] = useState<Record<FieldKey, string>>({ ...INITIAL });
  const [sameArea, setSameArea] = useState(D.selfWheelingSameArea);
  const set = (k: FieldKey) => (value: string) => setFields((prev) => ({ ...prev, [k]: value }));

  const refused = refusedFields(SPECS, fields);
  const input = useMemo(() => zebInputFromFields(fields, sameArea), [fields, sameArea]);
  const errors = refused.length > 0 ? [] : zebHubInputErrors(input);
  const ready = refused.length === 0 && errors.length === 0;
  const result = useMemo(() => (ready ? simulateZebHub(input) : null), [ready, input]);
  const sizes = useMemo(
    () =>
      ready ? chooseBatterySize(input, ZEB_BATTERY_CANDIDATES_KWH, readNumberOr0(fields.minAutonomyHours)) : null,
    [ready, input, fields.minAutonomyHours],
  );

  const firstNet = result?.years[0]?.net ?? null;
  const loadsFit = readNumberOr0(fields.criticalLoad) + readNumberOr0(fields.refrigeration) <= readNumberOr0(fields.baseLoad);
  const outage = useMemo(
    () => (ready && loadsFit ? outageView(input, readNumberOr0(fields.refrigeration)) : null),
    [ready, loadsFit, input, fields.refrigeration],
  );

  return (
    <Section title="防災オフグリッド ZEB 拠点の収支 — 利回り・回収年数・蓄電池の容量 (概算)">
      <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
        ペロブスカイト太陽電池・大型蓄電池・水循環プラントを持つ 1 拠点の収支を試算します。電気は
        <strong>敷地内で使う → 同じエリアの自社拠点へ自己託送 → 市場へ売る</strong>の順に配り、蓄電池のうち
        災害用の取り置き分 (使える容量の {pctText(D.reserveShare)}%) は平時の取引に使いません。ペロブスカイトは
        {D.pvReplacementIntervalYears} 年ごとに貼り替え、蓄電池は {D.batteryLifeYears} 年で取り替える費用を入れています。
        補助率と上限は<strong>公募要領で確かめて入れ直してください</strong> (同じ費用に 2 つの補助金は重ねません)。
        <strong>※ 概算であり、設計・法務・税務・投資の助言ではありません。</strong>
      </div>
      <div className="field-grid" style={{ marginBottom: 12 }}>
        {FIELD_ORDER.map((k) => (
          <GuardedNumber key={k} spec={SPECS[k]} value={fields[k]} onChange={set(k)} width={150} />
        ))}
        <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
          <input type="checkbox" checked={sameArea} onChange={(e) => setSameArea(e.target.checked)} />
          同じ送配電エリアに送り先の自社拠点がある
        </label>
      </div>
      {!sameArea && (
        <p style={{ fontSize: 12, color: 'var(--text-mute)' }} data-zeb-cross-area>
          エリアを跨ぐ自己託送は制度上できないため、余りはすべて市場の単価で売る前提で計算します。
        </p>
      )}

      {refused.length > 0 && <RefusedFieldsNote labels={refusalLabels(SPECS, refused, FIELD_ORDER)} />}
      {errors.length > 0 && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--danger)' }} data-zeb-input-errors>
          入力を確かめてください: {errors.join(' / ')}
        </p>
      )}

      {result && sizes && firstNet !== null && (
        <>
          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <Stat label="初期費用 (補助前)" value={jpyWhole(result.capexTotal)} />
            <Stat label="補助金" value={jpyWhole(result.subsidy.total)} />
            <Stat label="補助後の投資" value={jpyWhole(result.netInvestment)} />
            <Stat label="1 年目の純収支" value={jpyWhole(firstNet)} positive={firstNet >= 0} />
            <Stat label={`正味現在価値 (${D.horizonYears} 年)`} value={jpyWhole(result.npv)} positive={result.npv >= 0} />
            <Stat label="内部収益率" value={irrText(result.irr)} />
            <Stat label="投資回収年数" value={yearsText(result.paybackYears)} />
            <Stat label="災害時の持ち時間 (取り置き分)" value={hoursText(result.reserveAutonomyHours)} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-mute)' }} data-zeb-breakdown>
            初期費用の内訳: {(['building', 'pv', 'battery', 'water'] as const)
              .map((c) => `${COST_COMPONENT_LABEL[c]} ${jpyWhole(result.capex[c])}`)
              .join(' / ')}
            。選んだ補助金: {result.subsidy.chosen.length > 0
              ? result.subsidy.chosen.map((s) => `${s.name} ${jpyWhole(s.amount)}`).join(' / ')
              : 'なし'}
            。
          </p>
          {result.paybackYears === null && (
            <p role="note" style={{ fontSize: 12, color: 'var(--warning)' }} data-zeb-no-payback>
              ⚠️ この前提では投資を回収できません。電気の収支だけでは建物の費用を賄えないことが多いので、
              建物の使い道 (店舗・賃料・養殖や栽培の売上・EV 充電) の年間純収入を「ほかの年間純収入」に入れて確かめてください。
            </p>
          )}

          <h3 style={{ fontSize: 13, margin: '12px 0 6px' }}>停電の間に止めない負荷を動かせる時間</h3>
          {!loadsFit ? (
            <p role="alert" style={{ fontSize: 12, color: 'var(--danger)' }} data-zeb-outage-loads>
              止めない負荷と冷凍冷蔵の合計が 1 日の消費を超えています。数字を確かめてください。
            </p>
          ) : outage === null ? (
            <p style={{ fontSize: 12, color: 'var(--warning)' }} data-zeb-outage-none>
              蓄電池が無いため、夜の停電では止めない負荷を動かせません。
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }} data-zeb-outage>
              夕方 {OUTAGE_START_HOUR} 時に停電した場合 ({OUTAGE_HOURS} 時間まで):
              <br />・晴れの日の発電があり、取り置き分だけが残っているとき: <strong>{outageText(outage.reserveOnly)}</strong>
              <br />・雨や曇りが続いて発電が無く、満充電から始めたとき: <strong>{outageText(outage.noSun)}</strong>
              <br />
              <span style={{ color: 'var(--text-mute)' }}>
                自立運転に入ると店舗・EV 充電はすぐ止め、残量 60% で空調、30% で冷凍冷蔵を止めます。
                止めない負荷 (水循環ポンプ・殺菌灯・通信) は残量 5% まで動かします。晴れの日の発電は季節と向きを入れない目安です。
              </span>
            </p>
          )}

          <h3 style={{ fontSize: 13, margin: '12px 0 6px' }}>蓄電池の容量の比べ</h3>
          <table style={tableStyle} data-zeb-battery-table>
            <thead>
              <tr>
                <th>容量</th>
                <th>正味現在価値</th>
                <th>内部収益率</th>
                <th>回収年数</th>
                <th>持ち時間 (取り置き分)</th>
              </tr>
            </thead>
            <tbody>
              {sizes.rows.map((r) => (
                <tr key={r.batteryKwh} data-zeb-battery-row={r.batteryKwh}>
                  <td>{r.batteryKwh.toLocaleString('ja-JP')} kWh</td>
                  <td>{jpyWhole(r.npv)}</td>
                  <td>{irrText(r.irr)}</td>
                  <td>{yearsText(r.paybackYears)}</td>
                  <td>{hoursText(r.reserveAutonomyHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--text-mute)' }} data-zeb-battery-choice>
            最も得な容量: {sizes.best.batteryKwh.toLocaleString('ja-JP')} kWh。
            {sizes.bestMeetingAutonomy === null
              ? ` 災害時に ${fields.minAutonomyHours} 時間を賄える候補はありません —— 容量を増やすか、止めない負荷を見直してください。`
              : ` 災害時に ${fields.minAutonomyHours} 時間を賄える中で最も得な容量: ${sizes.bestMeetingAutonomy.batteryKwh.toLocaleString('ja-JP')} kWh。`}
          </p>
        </>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6, marginTop: 10 }} data-zeb-checks>
        確かめること: 系統連系の条件 (ノンファーム型接続・出力制御) / 自己託送の契約と送配電エリア /
        蓄電池の事故報告・電気主任技術者・消防法の防火区画 / 上水と中水の完全分離 (逆流を防ぐ吐水口空間) /
        中水の濃縮水の処分 (下水へ流さないなら蒸発・処分の設備と費用) —— どれも所管と専門家に確かめてください。
      </div>
    </Section>
  );
}
