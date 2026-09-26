/**
 * **collection ごとの「書く側の形の標本」** —— `collectionShapes.test.ts` から
 * 出した (2026-09-24 · パス 441)。
 *
 * ここは `__tests__/` の中の**検査ではない**ファイル (`malformedRows.ts` /
 * `docCheckSource.ts` / `jsdomWait.ts` と同じ形)。2 本目の読み手
 * (`__audits__/malformedFieldSweep.audit.ts` —— 欄ごとに 1 つずつ壊す走査) が
 * 要ったので出した。**検査ファイルから import すると、その describe が 2 度登録される。**
 *
 * 標本そのものは手書きである。それが**構造上ずれない側**であることは
 * パス 439 が測った —— 形を書いた本人が同じ台帳に書くので、形を変えれば
 * 同じ手が標本も直す。`collectionShapes.test.ts` が `COLLECTION_SHAPES` と
 * **両方向**に突き合わせるので、23 個目が足された日は落ちる。
 *
 * だからここは「**その collection の正しい行はこれ**」の 1 つの出どころとして使える ——
 * 走査が「正しい行 + 1 欄だけ壊す」を作るには、正しい行の側が要る。
 */
export interface Sample {
  readonly good: Record<string, unknown>;
  readonly required: readonly string[];
  readonly optional: readonly string[];
  /** 列挙の欄と、一覧の外の値。 */
  readonly enumOut?: readonly (readonly [string, string])[];
  /**
   * **null を値として書く**任意の欄 (台帳)。既定では任意の欄の null は「在るのに違う」で落とすが、
   * ここに挙げた欄は null を「未入力」として通す (投資信託の年初来リターン · パス 122)。台帳に無い欄の
   * null が通れば、それは形が緩んだ報せ。
   */
  readonly nullable?: readonly string[];
}

const KPI = {
  good: { period: '2026-04', unit: '全社', revenue: 1000, cogs: 100, advertising: 10, sga: 50, depreciation: 5, laborCost: 30 },
  required: ['period', 'unit', 'revenue', 'cogs', 'advertising', 'sga', 'depreciation'],
  optional: ['laborCost'],
} as const satisfies Sample;

export const SAMPLES: Readonly<Record<string, Sample>> = {
  'sales-entries': {
    good: { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: 'x' },
    required: ['date', 'channel', 'amount', 'orders'],
    optional: ['note'],
    enumOut: [['channel', 'nope']],
  },
  'kpi-actuals': KPI,
  'kpi-budgets': KPI,
  'balance-sheet': {
    good: {
      asOf: '2026-03-31', currentAssets: 8, cash: 3, inventory: 1, accountsReceivable: 2, fixedAssets: 4,
      currentLiabilities: 5, accountsPayable: 1, fixedLiabilities: 3, interestBearingDebt: 2, netIncome: 1,
    },
    required: ['asOf', 'currentAssets', 'fixedAssets', 'currentLiabilities', 'fixedLiabilities', 'netIncome'],
    optional: ['cash', 'inventory', 'accountsReceivable', 'accountsPayable', 'interestBearingDebt'],
  },
  'team-members': {
    good: { name: '山田', email: 'y@example.com', role: 'member' },
    required: ['name', 'email', 'role'],
    optional: [],
    enumOut: [['role', 'god']],
  },
  'business-units': {
    good: { name: 'EC', category: '小売', startedOn: '2026-01', note: 'n', revenue: 100, variableCost: 10, fixedCost: 5 },
    required: ['name'],
    optional: ['category', 'startedOn', 'note', 'revenue', 'variableCost', 'fixedCost'],
  },
  'bank-submission-settings': {
    good: { profile: { companyName: 'X' }, format: { unit: 'yen' } },
    required: [],
    optional: ['profile', 'format'],
  },
  'shigyo-contacts': {
    good: { serviceId: 'tax-accountant', name: '田中', firm: '事務所', phone: '03', email: 't@example.com' },
    required: ['serviceId', 'name'],
    optional: ['firm', 'phone', 'email'],
  },
  'shigyo-consultations': {
    good: { serviceId: 'tax-accountant', date: '2026-04-01', topic: '決算', status: '相談予約' },
    required: ['serviceId', 'date', 'topic', 'status'],
    optional: [],
    enumOut: [['status', '不明']],
  },
  'realestate-properties': {
    good: { name: 'A', type: 'apartment', monthlyRent: 100, purchasePrice: 1000, occupied: true, monthlyExpenses: 1, monthlyLoan: 2 },
    required: ['name', 'type', 'monthlyRent', 'purchasePrice', 'occupied'],
    optional: ['monthlyExpenses', 'monthlyLoan'],
  },
  'mutualfund-holdings': {
    good: { code: '1234', name: 'F', units: 10, navPerUnit: 10000, valuation: 10000, valuationMode: 'auto', acquisitionCost: 9000, ytdReturnPct: 1 },
    required: ['name', 'units', 'navPerUnit', 'valuation'],
    optional: ['code', 'valuationMode', 'acquisitionCost', 'ytdReturnPct'],
    enumOut: [['valuationMode', 'guess']],
    // 空欄で足した控えは null を書く (パス 122 / 123)。復元の形が null を落とせば、控えごと消える。
    nullable: ['acquisitionCost', 'ytdReturnPct'],
  },
  'parameter-overrides': {
    good: { values: { 'tax.rate': 0.1 } },
    required: [],
    optional: ['values'],
  },
  'manual-metrics': {
    good: { scope: 'all', label: 'L', value: 1, unit: 'yen', note: 'n', businessId: 'b1' },
    required: ['scope', 'label', 'value', 'unit'],
    optional: ['note', 'businessId'],
    enumOut: [['unit', 'kg']],
  },
  'manual-overrides': {
    good: { scope: 'all', path: 'a.b', value: 1 },
    required: ['scope', 'path', 'value'],
    optional: [],
  },
  'hydroponics-setup': {
    good: {
      floorAreaSqm: 100, tiers: 4, usableRatioPct: 70, cropId: 'lettuce', yieldRatePct: 90, unitPriceYen: 150,
      electricityYenPerKwh: 30, energyIntensityKwhPerKg: 10, seedYenPerPlant: 5, nutrientYenPerPlant: 3,
      packagingYenPerPlant: 10, laborYenPerMonth: 200000, depreciationYenPerMonth: 50000, rentYenPerMonth: 80000,
      otherFixedYenPerMonth: 10000, lowPotassium: true, switchDaysBeforeHarvest: 7, measuredPotassiumMgPer100g: 120,
      measuredSodiumMgPer100g: 10,
    },
    required: ['floorAreaSqm', 'tiers', 'usableRatioPct', 'cropId'],
    optional: [
      'yieldRatePct', 'unitPriceYen', 'electricityYenPerKwh', 'energyIntensityKwhPerKg', 'seedYenPerPlant',
      'nutrientYenPerPlant', 'packagingYenPerPlant', 'laborYenPerMonth', 'depreciationYenPerMonth', 'rentYenPerMonth',
      'otherFixedYenPerMonth', 'lowPotassium', 'switchDaysBeforeHarvest', 'measuredPotassiumMgPer100g', 'measuredSodiumMgPer100g',
    ],
  },
  'hydroponics-crops': { good: { crops: [] }, required: [], optional: ['crops'] },
  // 運転管理 (2026-09-13 ・ パス 194)。
  'hydroponics-readings': {
    good: { at: '2026-09-13', values: { ec: 1.0, ph: 6.0, co2Ppm: null }, batchId: 'b1', note: 'n' },
    required: ['at', 'values', 'batchId'],
    optional: ['note'],
  },
  'hydroponics-batches': {
    good: {
      id: 'b1',
      cropId: 'leaf-lettuce',
      sowDate: '2026-09-01',
      panels: 10,
      state: 'nursery',
      transplantedDate: null,
      harvestedDate: null,
      solutionChangedDate: null,
      note: '',
    },
    required: [
      'id', 'cropId', 'sowDate', 'panels', 'state',
      // `orNull(calendarDate)` なので **null は通るが undefined は落ちる** —— 必須の側。
      'transplantedDate', 'harvestedDate', 'solutionChangedDate',
    ],
    optional: ['note'],
    enumOut: [['state', 'sprouting']],
  },
  'hydroponics-control': {
    good: {
      waterTempLowC: 18,
      waterTempHighC: 22,
      airTempLowC: 18,
      airTempHighC: 25,
      humidityLowPct: 60,
      humidityHighPct: 80,
      co2LowPpm: 400,
      co2HighPpm: 1500,
      dissolvedOxygenLowMgL: 5,
      waterLevelLowPct: 60,
      tankLiters: null,
      stockEcRisePerMlPerL: null,
      alkalinityMgCaCO3PerL: null,
      acidNormality: null,
      residualAlkalinityMgCaCO3PerL: 30,
      solutionChangeIntervalDays: 14,
      readingStaleDays: 3,
      harvestNoticeDays: 3,
    },
    required: [
      'waterTempLowC', 'waterTempHighC', 'airTempLowC', 'airTempHighC', 'humidityLowPct',
      'humidityHighPct', 'co2LowPpm', 'co2HighPpm', 'dissolvedOxygenLowMgL', 'waterLevelLowPct',
      'residualAlkalinityMgCaCO3PerL', 'solutionChangeIntervalDays', 'readingStaleDays', 'harvestNoticeDays',
      // 設備の 4 欄は `orNull(num)` —— **未入力 (null) は通るが、欄そのものが
      // 無い控えは落とす** (「入力していない」と「古い版の控え」を混ぜない)。
      'tankLiters', 'stockEcRisePerMlPerL', 'alkalinityMgCaCO3PerL', 'acidNormality',
    ],
    optional: [],
  },
  'highlight-settings': {
    good: { declineWarnStreak: 2, declineCriticalStreak: 3, laborShareWarnPct: 60, singleChannelWarnPct: 60 },
    required: [],
    optional: ['declineWarnStreak', 'declineCriticalStreak', 'laborShareWarnPct', 'singleChannelWarnPct'],
  },
  'overview-overrides': { good: { path: 'a', value: 1, note: 'n' }, required: ['path', 'value'], optional: ['note'] },
  'overview-custom-metrics': {
    good: { label: 'L', value: 1, unit: 'pct', note: 'n' },
    required: ['label', 'value', 'unit'],
    optional: ['note'],
    enumOut: [['unit', 'kg']],
  },
  'connector-output': { good: { connectorId: 'c', key: 'k', payload: { anything: [1, 'x'] } }, required: ['connectorId', 'key'], optional: [] },
};
