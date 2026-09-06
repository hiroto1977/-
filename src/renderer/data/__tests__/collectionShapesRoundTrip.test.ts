/**
 * **書く側が実際に書く物は、復元の形の検査 (`collectionShapes.ts`) を必ず通る** —— 対照。
 *
 * 台帳の判定が厳し過ぎると、正しいバックアップの復元でレコードが黙って消える (= 別の事故)。
 * だから collection ごとに、アプリ自身の書き手 (parseX / 画面が組む literal / 既定値) で作った
 * 中身を **JSON で往復させてから** (NaN → null、undefined の欄は消える) 判定に通す。
 */
import { describe, expect, it } from 'vitest';
import { hasCollectionShape } from '../collectionShapes';
import { parseSalesEntry } from '../sales';
import { parseKpiActual } from '../kpiActuals';
import { parseBalanceSheet } from '../balanceSheet';
import { parseMember } from '../members';
import { parseBusinessUnit } from '../businessUnits';
import { parseSubmissionProfile, EMPTY_PROFILE } from '../bankSubmission';
import { parseBankFormat } from '../../../shared/bankFormat';
import { parseShigyoContact, parseShigyoConsultation } from '../shigyoDirectory';
import { parseHoldingEntry, parsePropertyEntry } from '../investments';
import { parseManualMetric } from '../manualData';
import { parseCustomMetric } from '../overviewOverrides';
import { parseHighlightSettings } from '../highlightSettings';
import { HYDROPONICS_DEFAULTS } from '../hydroponicsSetup';
import { DEFAULT_CROP_LIST } from '../../../shared/hydroponicCrops';

/** IndexedDB / バックアップと同じ往復 (structured clone は NaN を残すが、バックアップ JSON は null にする)。 */
const viaJson = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
const okOf = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe('書く側の出力 → collectionShapes (往復)', () => {
  it('sales-entries: parseSalesEntry (note あり / 無し)', () => {
    expect(hasCollectionShape('sales-entries', viaJson(parseSalesEntry({ date: '2026-04-01', channel: 'amazon', amount: '1000', orders: '2', note: 'x' })))).toBe(true);
    expect(hasCollectionShape('sales-entries', viaJson(parseSalesEntry({ date: '2026-04-01', channel: 'shopify', amount: 1000, orders: 1 })))).toBe(true);
  });

  it('kpi-actuals / kpi-budgets: parseKpiActual (laborCost あり / 無し)', () => {
    const withLabor = viaJson(parseKpiActual({ period: '2026-04', unit: '全社', revenue: '1000', cogs: '100', advertising: '10', sga: '50', depreciation: '5', laborCost: '30' }));
    const without = viaJson(parseKpiActual({ period: '2026-04', unit: 'EC', revenue: 1000, cogs: 100, advertising: 10, sga: 50, depreciation: 5 }));
    for (const c of ['kpi-actuals', 'kpi-budgets']) {
      expect(hasCollectionShape(c, withLabor), c).toBe(true);
      expect(hasCollectionShape(c, without), c).toBe(true);
    }
  });

  it('balance-sheet: parseBalanceSheet (任意欄あり / 無し)', () => {
    const full = viaJson(parseBalanceSheet({
      asOf: '2026-03-31', currentAssets: '8', cash: '3', inventory: '1', accountsReceivable: '2', fixedAssets: '4',
      currentLiabilities: '5', accountsPayable: '1', fixedLiabilities: '3', interestBearingDebt: '2', netIncome: '1',
    }));
    const minimal = viaJson(parseBalanceSheet({ asOf: '2026-03-31', currentAssets: 8, fixedAssets: 4, currentLiabilities: 5, fixedLiabilities: 3, netIncome: -1 }));
    expect(hasCollectionShape('balance-sheet', full)).toBe(true);
    expect(hasCollectionShape('balance-sheet', minimal)).toBe(true);
  });

  it('team-members: parseMember (役割 3 種)', () => {
    for (const role of ['member', 'admin', 'owner']) {
      expect(hasCollectionShape('team-members', viaJson(parseMember({ name: '山田', email: 'y@example.com', role }))), role).toBe(true);
    }
  });

  it('business-units: parseBusinessUnit (全部 / 名前だけ)', () => {
    expect(hasCollectionShape('business-units', viaJson(okOf(parseBusinessUnit({ name: 'EC', category: '小売', startedOn: '2026-01', note: 'n', revenue: '100', variableCost: '10', fixedCost: '5' })).entry))).toBe(true);
    expect(hasCollectionShape('business-units', viaJson(okOf(parseBusinessUnit({ name: 'EC' })).entry))).toBe(true);
  });

  it('bank-submission-settings: parseSubmissionProfile + parseBankFormat (画面が保存する組)', () => {
    const profile = okOf(parseSubmissionProfile({ companyName: '株式会社X', representative: '山田', address: '東京', fiscalYearEnd: '2026-03' })).profile;
    expect(hasCollectionShape('bank-submission-settings', viaJson({ profile, format: parseBankFormat({}) }))).toBe(true);
    expect(hasCollectionShape('bank-submission-settings', viaJson({ profile: EMPTY_PROFILE, format: parseBankFormat({ unit: 'thousand', negative: 'minus' }) }))).toBe(true);
  });

  it('shigyo-contacts / shigyo-consultations: parseShigyoContact / parseShigyoConsultation', () => {
    expect(hasCollectionShape('shigyo-contacts', viaJson(parseShigyoContact({ serviceId: 'tax-accountant', name: '田中', firm: '', phone: '', email: '' })))).toBe(true);
    expect(hasCollectionShape('shigyo-contacts', viaJson(parseShigyoContact({ serviceId: 'tax-accountant', name: '田中' })))).toBe(true);
    expect(hasCollectionShape('shigyo-consultations', viaJson(parseShigyoConsultation({ serviceId: 'tax-accountant', date: '2026-04-01', topic: '決算', status: '相談予約' })))).toBe(true);
  });

  it('realestate-properties / mutualfund-holdings: parsePropertyEntry / parseHoldingEntry (任意欄あり / 無し)', () => {
    expect(hasCollectionShape('realestate-properties', viaJson(parsePropertyEntry({ name: 'A', type: 'apartment', monthlyRent: '100000', purchasePrice: '10000000', occupied: true, monthlyExpenses: '1000', monthlyLoan: '50000' })))).toBe(true);
    expect(hasCollectionShape('realestate-properties', viaJson(parsePropertyEntry({ name: 'A', type: 'apartment', monthlyRent: 100000, purchasePrice: 10000000, occupied: false })))).toBe(true);
    expect(hasCollectionShape('mutualfund-holdings', viaJson(parseHoldingEntry({ code: '1234', name: 'F', units: '10000', navPerUnit: '12345', acquisitionCost: '10000', ytdReturnPct: '1.5' })))).toBe(true);
    expect(hasCollectionShape('mutualfund-holdings', viaJson(parseHoldingEntry({ name: 'F', units: 0, navPerUnit: 0, valuation: '500000' })))).toBe(true);
  });

  it('manual-metrics / manual-overrides: parseManualMetric + scope、画面の { scope, path, value }', () => {
    const metric = okOf(parseManualMetric({ label: '来店数', value: '120', unit: 'count', note: 'n', businessId: 'b1' })).entry;
    expect(hasCollectionShape('manual-metrics', viaJson({ scope: 'sales', ...metric }))).toBe(true);
    const bare = okOf(parseManualMetric({ label: '来店数', value: '120', unit: 'count' })).entry;
    expect(hasCollectionShape('manual-metrics', viaJson({ scope: 'sales', ...bare }))).toBe(true);
    expect(hasCollectionShape('manual-overrides', viaJson({ scope: 'sales', path: 'summary.revenue', value: 1000 }))).toBe(true);
  });

  it('overview-overrides / overview-custom-metrics: 画面の { path, value, note } と parseCustomMetric', () => {
    expect(hasCollectionShape('overview-overrides', viaJson({ path: 'kpi.revenue', value: 1000, note: 'n' }))).toBe(true);
    expect(hasCollectionShape('overview-overrides', viaJson({ path: 'kpi.revenue', value: 1000 }))).toBe(true);
    expect(hasCollectionShape('overview-custom-metrics', viaJson(okOf(parseCustomMetric({ label: 'L', value: '12', unit: 'pct', note: 'n' })).entry))).toBe(true);
    expect(hasCollectionShape('overview-custom-metrics', viaJson(okOf(parseCustomMetric({ label: 'L', value: '12', unit: 'yen' })).entry))).toBe(true);
  });

  it('highlight-settings: parseHighlightSettings (既定 / 指定)', () => {
    expect(hasCollectionShape('highlight-settings', viaJson(parseHighlightSettings({})))).toBe(true);
    expect(hasCollectionShape('highlight-settings', viaJson(parseHighlightSettings({ declineWarnStreak: '2', declineCriticalStreak: '4', laborShareWarnPct: '55', singleChannelWarnPct: '70' })))).toBe(true);
  });

  it('hydroponics-setup / hydroponics-crops: 既定値と品目一覧', () => {
    expect(hasCollectionShape('hydroponics-setup', viaJson(HYDROPONICS_DEFAULTS))).toBe(true);
    expect(hasCollectionShape('hydroponics-setup', viaJson({ ...HYDROPONICS_DEFAULTS, lowPotassium: true, switchDaysBeforeHarvest: 7, measuredPotassiumMgPer100g: 120, measuredSodiumMgPer100g: 10 }))).toBe(true);
    expect(hasCollectionShape('hydroponics-crops', viaJson({ crops: DEFAULT_CROP_LIST }))).toBe(true);
  });

  it('parameter-overrides / connector-output: 書く側の literal', () => {
    expect(hasCollectionShape('parameter-overrides', viaJson({ values: { 'tax.corporate.rate': 0.232 } }))).toBe(true);
    expect(hasCollectionShape('parameter-overrides', viaJson({ values: {} }))).toBe(true);
    expect(hasCollectionShape('connector-output', viaJson({ connectorId: 'github-issues', key: 'issues', payload: [{ id: 1 }] }))).toBe(true);
  });
});
