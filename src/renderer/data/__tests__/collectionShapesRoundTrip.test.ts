/**
 * **書く側が実際に書く物は、復元の形の検査 (`collectionShapes.ts`) を必ず通る** —— 対照。
 *
 * 台帳の判定が厳し過ぎると、正しいバックアップの復元でレコードが黙って消える (= 別の事故)。
 * だから collection ごとに、アプリ自身の書き手 (parseX / 画面が組む literal / 既定値) で作った
 * 中身を **JSON で往復させてから** (NaN → null、undefined の欄は消える) 判定に通す。
 *
 * ## 母集団の照合 (2026-09-24 · パス 439)
 *
 * 隣の `collectionShapes.test.ts` は **`SAMPLES` が `COLLECTION_SHAPES` と両方向に揃うこと**を
 * 機械で留めている。ところが**その標本は手書きのリテラル**で、形を書いた人が同じファイルに書く
 * ので**構造上一致する**。食い違いうるのは**アプリの実物の書き手**のほう —— つまり
 * **機械が載っていたのは、食い違えない写しの側だった**。
 *
 * 24 個目の collection が足された日、手書きの標本は既存の門が強制するが、ここは黙る。
 * その書き手が形の拒む物を出していれば、利用者自身の記録が**復元で落ちる** ——
 * `collectionShapes.ts` 自身が「落とし過ぎは復元の欠落 = 別の事故になる」と書いている当のことである。
 *
 * だから**綴りではなく振る舞いで数える** —— 照合したことを `roundTrips()` が記録し、
 * 最後の `it` が `COLLECTION_SHAPES` の鍵と**両方向**に突き合わせる。検査ファイルを綴りで
 * 走査する形にすると、書き方を変えた日に黙る (パス 334 / 412 / 418 の家系)。
 */
import { describe, expect, it } from 'vitest';
import { COLLECTION_SHAPES, hasCollectionShape } from '../collectionShapes';
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
import { parseBatch, parseControlRecord, parseReading } from '../hydroponicsLog';
import { executeFreeConnector } from '../connectorExecution';
import { FREE_CONNECTOR_REGISTRY } from '../../../shared/connectors/freeConnectors';

/** IndexedDB / バックアップと同じ往復 (structured clone は NaN を残すが、バックアップ JSON は null にする)。 */
const viaJson = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
/**
 * 照合しつつ**どの collection を実際に通したか**を記録する。
 *
 * 記録を綴りの走査ではなく実行で採るのは、`for (const c of [...])` のような形でも
 * 数えられるようにするため (走査だと書き方に依る)。
 */
const CHECKED = new Set<string>();
function roundTrips(collection: string, value: unknown, label?: string): void {
  CHECKED.add(collection);
  expect(hasCollectionShape(collection, viaJson(value)), label ?? collection).toBe(true);
}

const okOf = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe('書く側の出力 → collectionShapes (往復)', () => {
  it('sales-entries: parseSalesEntry (note あり / 無し)', () => {
    roundTrips('sales-entries', parseSalesEntry({ date: '2026-04-01', channel: 'amazon', amount: '1000', orders: '2', note: 'x' }));
    roundTrips('sales-entries', parseSalesEntry({ date: '2026-04-01', channel: 'shopify', amount: 1000, orders: 1 }));
  });

  it('kpi-actuals / kpi-budgets: parseKpiActual (laborCost あり / 無し)', () => {
    const withLabor = viaJson(parseKpiActual({ period: '2026-04', unit: '全社', revenue: '1000', cogs: '100', advertising: '10', sga: '50', depreciation: '5', laborCost: '30' }));
    const without = viaJson(parseKpiActual({ period: '2026-04', unit: 'EC', revenue: 1000, cogs: 100, advertising: 10, sga: 50, depreciation: 5 }));
    for (const c of ['kpi-actuals', 'kpi-budgets']) {
      roundTrips(c, withLabor, c);
      roundTrips(c, without, c);
    }
  });

  it('balance-sheet: parseBalanceSheet (任意欄あり / 無し)', () => {
    const full = viaJson(parseBalanceSheet({
      asOf: '2026-03-31', currentAssets: '8', cash: '3', inventory: '1', accountsReceivable: '2', fixedAssets: '4',
      currentLiabilities: '5', accountsPayable: '1', fixedLiabilities: '3', interestBearingDebt: '2', netIncome: '1',
    }));
    const minimal = viaJson(parseBalanceSheet({ asOf: '2026-03-31', currentAssets: 8, fixedAssets: 4, currentLiabilities: 5, fixedLiabilities: 3, netIncome: -1 }));
    roundTrips('balance-sheet', full);
    roundTrips('balance-sheet', minimal);
  });

  it('team-members: parseMember (役割 3 種)', () => {
    for (const role of ['member', 'admin', 'owner']) {
      roundTrips('team-members', parseMember({ name: '山田', email: 'y@example.com', role }), role);
    }
  });

  it('business-units: parseBusinessUnit (全部 / 名前だけ)', () => {
    roundTrips('business-units', okOf(parseBusinessUnit({ name: 'EC', category: '小売', startedOn: '2026-01', note: 'n', revenue: '100', variableCost: '10', fixedCost: '5' })).entry);
    roundTrips('business-units', okOf(parseBusinessUnit({ name: 'EC' })).entry);
  });

  it('bank-submission-settings: parseSubmissionProfile + parseBankFormat (画面が保存する組)', () => {
    const profile = okOf(parseSubmissionProfile({ companyName: '株式会社X', representative: '山田', address: '東京', fiscalYearEnd: '2026-03' })).profile;
    roundTrips('bank-submission-settings', { profile, format: parseBankFormat({}) });
    roundTrips('bank-submission-settings', { profile: EMPTY_PROFILE, format: parseBankFormat({ unit: 'thousand', negative: 'minus' }) });
  });

  it('shigyo-contacts / shigyo-consultations: parseShigyoContact / parseShigyoConsultation', () => {
    roundTrips('shigyo-contacts', parseShigyoContact({ serviceId: 'tax-accountant', name: '田中', firm: '', phone: '', email: '' }));
    roundTrips('shigyo-contacts', parseShigyoContact({ serviceId: 'tax-accountant', name: '田中' }));
    roundTrips('shigyo-consultations', parseShigyoConsultation({ serviceId: 'tax-accountant', date: '2026-04-01', topic: '決算', status: '相談予約' }));
  });

  it('realestate-properties / mutualfund-holdings: parsePropertyEntry / parseHoldingEntry (任意欄あり / 無し)', () => {
    roundTrips('realestate-properties', parsePropertyEntry({ name: 'A', type: 'apartment', monthlyRent: '100000', purchasePrice: '10000000', occupied: true, monthlyExpenses: '1000', monthlyLoan: '50000' }));
    roundTrips('realestate-properties', parsePropertyEntry({ name: 'A', type: 'apartment', monthlyRent: 100000, purchasePrice: 10000000, occupied: false }));
    roundTrips('mutualfund-holdings', parseHoldingEntry({ code: '1234', name: 'F', units: '10000', navPerUnit: '12345', acquisitionCost: '10000', ytdReturnPct: '1.5' }));
    roundTrips('mutualfund-holdings', parseHoldingEntry({ name: 'F', units: 0, navPerUnit: 0, valuation: '500000' }));
    // ★ 年初来リターンを空欄で足した控えは null を書く (パス 122)。復元の形が null を落とせば、その控えごと消える。
    const blankYtd = parseHoldingEntry({ name: 'F', units: '10000', navPerUnit: '12345' });
    expect(blankYtd.ytdReturnPct).toBeNull();
    expect(blankYtd.acquisitionCost).toBeNull(); // 取得額の空欄も null (パス 123)
    roundTrips('mutualfund-holdings', blankYtd);
  });

  it('manual-metrics / manual-overrides: parseManualMetric + scope、画面の { scope, path, value }', () => {
    const metric = okOf(parseManualMetric({ label: '来店数', value: '120', unit: 'count', note: 'n', businessId: 'b1' })).entry;
    roundTrips('manual-metrics', { scope: 'sales', ...metric });
    const bare = okOf(parseManualMetric({ label: '来店数', value: '120', unit: 'count' })).entry;
    roundTrips('manual-metrics', { scope: 'sales', ...bare });
    roundTrips('manual-overrides', { scope: 'sales', path: 'summary.revenue', value: 1000 });
  });

  it('overview-overrides / overview-custom-metrics: 画面の { path, value, note } と parseCustomMetric', () => {
    roundTrips('overview-overrides', { path: 'kpi.revenue', value: 1000, note: 'n' });
    roundTrips('overview-overrides', { path: 'kpi.revenue', value: 1000 });
    roundTrips('overview-custom-metrics', okOf(parseCustomMetric({ label: 'L', value: '12', unit: 'pct', note: 'n' })).entry);
    roundTrips('overview-custom-metrics', okOf(parseCustomMetric({ label: 'L', value: '12', unit: 'yen' })).entry);
  });

  it('highlight-settings: parseHighlightSettings (既定 / 指定)', () => {
    roundTrips('highlight-settings', parseHighlightSettings({}));
    roundTrips('highlight-settings', parseHighlightSettings({ declineWarnStreak: '2', declineCriticalStreak: '4', laborShareWarnPct: '55', singleChannelWarnPct: '70' }));
  });

  it('hydroponics-setup / hydroponics-crops: 既定値と品目一覧', () => {
    roundTrips('hydroponics-setup', HYDROPONICS_DEFAULTS);
    roundTrips('hydroponics-setup', { ...HYDROPONICS_DEFAULTS, lowPotassium: true, switchDaysBeforeHarvest: 7, measuredPotassiumMgPer100g: 120, measuredSodiumMgPer100g: 10 });
    roundTrips('hydroponics-crops', { crops: DEFAULT_CROP_LIST });
  });

  it('hydroponics-readings / -batches / -control: 書く側の parse (パス 194)', () => {
    // 測定 —— **空欄は null (未測定)**。形の判定が null を落とせば、その控えごと消える。
    const reading = parseReading({ at: '2026-09-13', values: { ec: '1.2', ph: '' } });
    expect(reading.values.ph).toBeNull();
    roundTrips('hydroponics-readings', reading);
    roundTrips('hydroponics-readings', parseReading({ at: '2026-09-13', values: { ec: '1.2' }, batchId: 'b1', note: 'n' }));
    // ロット —— 日付の 3 欄は未定なら null。
    const batch = parseBatch({ id: 'b1', cropId: 'leaf-lettuce', sowDate: '2026-09-01', panels: '10', state: 'nursery' });
    expect(batch.transplantedDate).toBeNull();
    roundTrips('hydroponics-batches', batch);
    // 設定 —— **設備の 4 欄は未入力の null**。
    const control = parseControlRecord({});
    expect(control.tankLiters).toBeNull();
    roundTrips('hydroponics-control', control);
    roundTrips('hydroponics-control', parseControlRecord({ tankLiters: '1000', stockEcRisePerMlPerL: '0.002', alkalinityMgCaCO3PerL: '80', acidNormality: '1' }));
  });

  it('parameter-overrides: 書く側の literal', () => {
    roundTrips('parameter-overrides', { values: { 'tax.corporate.rate': 0.232 } });
    roundTrips('parameter-overrides', { values: {} });
  });

  /**
   * connector-output は**実物の書き手が挿した物そのもの**を通す。
   *
   * 手書きの literal を置くと、それは**形を書いた人が書いた写し**なので構造上一致し、
   * 実物の `executeFreeConnector` が別の欄を挿すようになっても黙る (この検査ファイル
   * そのものが直そうとしている非対称・パス 439)。シンクは注入できるので捕まえられる。
   */
  it('connector-output: 実物の executeFreeConnector が挿した記録', async () => {
    const inserted: { collection: string; record: Record<string, unknown> }[] = [];
    const result = await executeFreeConnector(
      FREE_CONNECTOR_REGISTRY,
      'stocks-to-storage-export',
      { symbol: 'AAPL', shares: 10, avgCost: 150 },
      {
        putLibrary: async () => {
          throw new Error('この経路は storage なのでライブラリへは書かない');
        },
        insertStorage: async (collection, record) => {
          inserted.push({ collection, record });
        },
      },
    );
    expect(result.ok, result.message).toBe(true);
    expect(inserted, '実物の書き手が 1 件挿した').toHaveLength(1);
    expect(inserted[0]!.collection).toBe('connector-output');
    roundTrips('connector-output', inserted[0]!.record);
  });
});

/**
 * **母集団の照合 —— 走らせた結果で数える** (`describe` の後ろに置くので全件の後に走る)。
 *
 * 「どの collection を実物の書き手で通したか」は `roundTrips()` が実行時に記録する。
 * 検査ファイルを綴りで走査する形にすると、書き方を変えた日に黙る (パス 334 / 412 / 418 の家系)。
 */
describe('往復の母集団 (実行で数える)', () => {
  it('★ 形を持つ collection は全部、実物の書き手で往復させている (両方向)', () => {
    expect([...CHECKED].sort(), '往復させた collection vs 形の台帳').toEqual(Object.keys(COLLECTION_SHAPES).sort());
  });

  it('走査が空虚でない (床)', () => {
    expect(CHECKED.size, '往復させた collection の数').toBeGreaterThanOrEqual(23);
  });
});
