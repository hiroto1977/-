/**
 * 記録の**欄と欄の関係** (パス 223)。
 *
 * 2026-09-14 の実測: 画面の入口は関係を 7 件断っていたのに、復元の入口
 * (`COLLECTION_SHAPES`) は **0/7** しか見ていなかった。通った記録から
 * `batchSchedule` は「播種の 1 か月前に収穫予定 (実績起算)」を返していた。
 *
 * パス 224 —— その 7 件は**綴りの走査で数えた 7 件**だった。同じ問いを振る舞いで
 * 数え直すと (`writerRestoreParity.test.ts`)、**さらに 7 件**が出てきた:
 * ヘルパー越しの断り (`parseBalanceSheet` の `atMost`) と言い回しの違う断り
 * (「人件費は販管費以下」「危険期数は警告期数以上」)。台帳は 6 collection / 15 件になった。
 *
 * ここで留めるのは 3 つ:
 *   1. 台帳の関係が実際に破れを捕まえる (15 件を総当たり)。
 *   2. **両方の入口**が同じ台帳を読む (画面が断るなら復元も落とす)。
 *   3. **書き手の中に自前の欄どうしの比較が残っていない** (走査 —— 台帳を
 *      迂回して増やせないこと)。**この走査は綴りしか見えない** ので、
 *      母集団を数える役は `writerRestoreParity.test.ts` (借用による走査) が持つ。
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { RECORD_RELATIONS, relationIssue, relationsHold } from '../recordRelations';
import { BALANCE_SHEET_COLLECTION, computeBalanceSheetMetrics, normalizeBalanceSheet, parseBalanceSheet } from '../balanceSheet';
import { parseKpiActual } from '../kpiActuals';
import { HIGHLIGHT_SETTINGS_COLLECTION, parseHighlightSettings } from '../highlightSettings';
import {
  HYDROPONICS_BATCHES_COLLECTION,
  HYDROPONICS_CONTROL_COLLECTION,
  parseBatch,
  parseControlRecord,
} from '../hydroponicsLog';

/** 関係を満たす最小のロット。 */
const okBatch = {
  id: 'lot-1',
  cropId: 'leaf-lettuce',
  sowDate: '2026-09-10',
  panels: 4,
  state: 'growing',
  transplantedDate: null,
  harvestedDate: null,
  solutionChangedDate: null,
};

describe('RECORD_RELATIONS の台帳', () => {
  it('関係を持つ collection は 6 つ・関係は 15 件 (2026-09-14 実測・パス 224)', () => {
    expect(Object.keys(RECORD_RELATIONS).sort()).toEqual([
      'balance-sheet',
      'highlight-settings',
      'hydroponics-batches',
      'hydroponics-control',
      'kpi-actuals',
      'kpi-budgets',
    ]);
    expect(Object.values(RECORD_RELATIONS).flat().length).toBe(15);
  });

  it('KPI の実績と予算は同じ配列を指す (写しではない)', () => {
    expect(RECORD_RELATIONS['kpi-actuals']).toBe(RECORD_RELATIONS['kpi-budgets']);
  });

  it('載せた collection はすべて形の検査を持つ (綴りのずれを見つける)', () => {
    for (const name of Object.keys(RECORD_RELATIONS)) {
      expect(COLLECTION_SHAPES[name], name).toBeDefined();
    }
  });

  it('どの関係の文も空でない', () => {
    for (const rel of Object.values(RECORD_RELATIONS).flat()) {
      expect(rel.message.trim().length).toBeGreaterThan(5);
    }
  });

  it('関係を持たない collection は常に null (対照)', () => {
    expect(relationIssue('sales-entries', { date: '2026-09-10' })).toBeNull();
    expect(relationsHold('sales-entries', {})).toBe(true);
  });

  it('型が合わない値は関係の側では落とさない (型の検査が先に見る)', () => {
    // 日付が数値・下限が文字列でも関係は「成り立つ」— 二重に断らない。
    expect(relationIssue(HYDROPONICS_BATCHES_COLLECTION, { ...okBatch, transplantedDate: 5 })).toBeNull();
    expect(relationIssue(HYDROPONICS_CONTROL_COLLECTION, { waterTempLowC: 'x', waterTempHighC: 1 })).toBeNull();
  });
});

describe('ロットの日付の前後 — 両方の入口が断る', () => {
  const cases = [
    { name: '定植が播種より前', rec: { ...okBatch, transplantedDate: '2026-08-01' }, says: '定植日が播種日より前' },
    { name: '収穫が播種より前', rec: { ...okBatch, harvestedDate: '2026-01-01', state: 'harvested' }, says: '収穫日が播種日より前' },
    {
      name: '収穫が定植より前',
      rec: { ...okBatch, transplantedDate: '2026-10-01', harvestedDate: '2026-09-20', state: 'harvested' },
      says: '収穫日が定植日より前',
    },
  ];

  for (const c of cases) {
    it(`${c.name}: 画面の入口が断る`, () => {
      expect(() => parseBatch(c.rec)).toThrow(c.says);
    });
    it(`${c.name}: 復元の入口も落とす (2026-09-14 まで通していた)`, () => {
      expect(COLLECTION_SHAPES[HYDROPONICS_BATCHES_COLLECTION]!(c.rec)).toBe(false);
    });
  }

  it('前後が正しいロットは両方の入口を通る (対照 — 断りが全部を止めていないこと)', () => {
    const good = { ...okBatch, transplantedDate: '2026-10-01', harvestedDate: '2026-10-20', state: 'harvested' };
    expect(() => parseBatch(good)).not.toThrow();
    expect(COLLECTION_SHAPES[HYDROPONICS_BATCHES_COLLECTION]!(good)).toBe(true);
  });

  it('同じ日は通る (播種と定植が同日の水耕は在りうる)', () => {
    const same = { ...okBatch, transplantedDate: okBatch.sowDate };
    expect(() => parseBatch(same)).not.toThrow();
    expect(COLLECTION_SHAPES[HYDROPONICS_BATCHES_COLLECTION]!(same)).toBe(true);
  });

  it('養液交換日は播種より前でも通る (播種前に培養液を仕込むのは通常の作業)', () => {
    const pre = { ...okBatch, solutionChangedDate: '2026-09-01' };
    expect(() => parseBatch(pre)).not.toThrow();
    expect(COLLECTION_SHAPES[HYDROPONICS_BATCHES_COLLECTION]!(pre)).toBe(true);
  });
});

describe('管理値の 下限 ≦ 上限 — 両方の入口が断る', () => {
  /** 既定の管理値 (画面の入口を通る最小の組)。 */
  function baseControl(): Record<string, unknown> {
    const saved = parseControlRecord({});
    return { ...saved } as Record<string, unknown>;
  }

  const pairs = [
    ['waterTempLowC', 'waterTempHighC', '養液温度'],
    ['airTempLowC', 'airTempHighC', '室温'],
    ['humidityLowPct', 'humidityHighPct', '相対湿度'],
    ['co2LowPpm', 'co2HighPpm', 'CO₂'],
  ] as const;

  for (const [low, high, label] of pairs) {
    it(`${label}: 下限 > 上限 を両方の入口が断る`, () => {
      const base = baseControl();
      const bad = { ...base, [low]: (base[high] as number) + 1 };
      expect(relationIssue(HYDROPONICS_CONTROL_COLLECTION, bad)).toContain(label);
      expect(COLLECTION_SHAPES[HYDROPONICS_CONTROL_COLLECTION]!(bad)).toBe(false);
      expect(() => parseControlRecord(bad)).toThrow(`${label}の下限が上限を超えています`);
    });
  }

  it('既定の管理値は 4 組すべて満たす (対照)', () => {
    const base = baseControl();
    expect(relationIssue(HYDROPONICS_CONTROL_COLLECTION, base)).toBeNull();
    expect(COLLECTION_SHAPES[HYDROPONICS_CONTROL_COLLECTION]!(base)).toBe(true);
  });

  it('下限 == 上限 は通る (幅 0 の帯は「その値だけが正常」で矛盾しない)', () => {
    const base = baseControl();
    const flat = { ...base, waterTempLowC: base.waterTempHighC };
    expect(relationIssue(HYDROPONICS_CONTROL_COLLECTION, flat)).toBeNull();
  });
});

describe('走査 — 書き手が台帳を迂回していないこと (パス 223)', () => {
  /**
   * **原文で読む。** `collectionShapes.ts` は変異検査の対象なので、生の読みだと
   * 計器が書き換えた写しに当たって空の検査になる (残作業 A の門)。
   */
  const src = (rel: string): string => readOriginalSource(fileURLToPath(new URL(rel, import.meta.url)));
  /** 関係を持つ collection の書き手 4 ファイル (パス 224 で 1 → 4)。 */
  const WRITER_FILES = ['../hydroponicsLog.ts', '../balanceSheet.ts', '../kpiActuals.ts', '../highlightSettings.ts'] as const;
  const WRITER = WRITER_FILES.map((f) => src(f)).join('\n');

  /** 「欄と欄の関係」を理由に断っている文 (台帳に載せるべきもの)。 */
  const RELATIONAL_THROW = /throw new Error\([^)]*(?:より前|より後|下限が上限|上限が下限|合いません|一致しません)/g;

  it('走査が標本に当たる (空の検査でないこと)', () => {
    const sample = "  if (a < b) throw new Error('定植日が播種日より前になっています');";
    expect(sample.match(RELATIONAL_THROW)?.length).toBe(1);
    const sample2 = "  if (low > high) throw new Error(`${label}の下限が上限を超えています`);";
    expect(sample2.match(RELATIONAL_THROW)?.length).toBe(1);
    // 単独の欄の断りには当たらない。
    expect("throw new Error('ロット名を入力してください')".match(RELATIONAL_THROW)).toBeNull();
  });

  it('書き手の中に、台帳を通さない関係の断りが残っていない', () => {
    expect(WRITER.match(RELATIONAL_THROW) ?? []).toEqual([]);
  });

  it('書き手は台帳を読んでいる (関係を持つ 6 collection ぶん)', () => {
    for (const call of [
      'relationIssue(HYDROPONICS_BATCHES_COLLECTION',
      'relationIssue(HYDROPONICS_CONTROL_COLLECTION',
      'relationIssue(BALANCE_SHEET_COLLECTION',
      'relationIssue(KPI_ACTUALS_COLLECTION',
      'relationIssue(HIGHLIGHT_SETTINGS_COLLECTION',
    ]) {
      expect(WRITER, call).toContain(call);
    }
  });

  /**
   * パス 224 で消した自前の比較 —— 二度と戻らないように名指しで留める。
   * `atMost(` は文を**引数**で受けるヘルパーだったので、上の綴りの走査には映らなかった。
   */
  it('貸借対照表の書き手に、自前の内数チェック (atMost) が戻っていない', () => {
    expect(src('../balanceSheet.ts')).not.toContain('const atMost =');
    // 標本: 規則が実際にその文面へ当たること。
    expect('  const atMost = (v: number | undefined) => {}').toContain('const atMost =');
  });

  it('形の検査は台帳を読んでいる', () => {
    const shapes = src('../collectionShapes.ts');
    expect(shapes).toContain('relationsHold(name, data)');
  });
});

describe('貸借対照表の 内数 ≦ 親項目 — 両方の入口が断る (パス 224)', () => {
  /** 関係を満たす 1 件 (欄を全部埋めた実在しうる控え)。 */
  const okBs = {
    asOf: '2026-03-31',
    currentAssets: 8_000_000,
    cash: 3_000_000,
    inventory: 1_000_000,
    accountsReceivable: 2_000_000,
    fixedAssets: 4_000_000,
    currentLiabilities: 5_000_000,
    accountsPayable: 1_000_000,
    fixedLiabilities: 3_000_000,
    interestBearingDebt: 2_000_000,
    netIncome: 100_000,
  };

  /** 破る値と、出るべき文。5 件を総当たり。 */
  const BREAKS: readonly { readonly patch: Record<string, number>; readonly message: string }[] = [
    { patch: { cash: 9_000_000 }, message: '現預金は流動資産以下で入力してください' },
    { patch: { inventory: 9_000_000 }, message: '棚卸資産は流動資産以下で入力してください' },
    { patch: { accountsReceivable: 9_000_000 }, message: '売上債権は流動資産以下で入力してください' },
    { patch: { accountsPayable: 6_000_000 }, message: '仕入債務は流動負債以下で入力してください' },
    { patch: { interestBearingDebt: 9_000_000 }, message: '有利子負債は負債合計以下で入力してください' },
  ];

  it('既定の控えは両方の入口を通る (対照 — 断りが全部を止めていないこと)', () => {
    expect(relationIssue(BALANCE_SHEET_COLLECTION, okBs)).toBeNull();
    expect(COLLECTION_SHAPES[BALANCE_SHEET_COLLECTION]!(okBs)).toBe(true);
    expect(() => parseBalanceSheet(okBs)).not.toThrow();
  });

  for (const { patch, message } of BREAKS) {
    const field = Object.keys(patch)[0];
    it(`${field} が親項目を超えると、画面・復元・台帳の 3 つが断る`, () => {
      const bad = { ...okBs, ...patch };
      expect(() => parseBalanceSheet(bad)).toThrow(message);
      expect(relationIssue(BALANCE_SHEET_COLLECTION, bad)).toBe(message);
      expect(COLLECTION_SHAPES[BALANCE_SHEET_COLLECTION]!(bad)).toBe(false);
    });
  }

  it('等しいのは通る (現預金 = 流動資産 は在りうる)', () => {
    const equal = { ...okBs, cash: okBs.currentAssets, inventory: 0, accountsReceivable: 0 };
    expect(relationIssue(BALANCE_SHEET_COLLECTION, equal)).toBeNull();
    expect(() => parseBalanceSheet(equal)).not.toThrow();
  });

  it('未入力の任意欄は照合しない (欄の無い古い控えを落とさない)', () => {
    const minimal = { asOf: '2026-03-31', currentAssets: 1, fixedAssets: 1, currentLiabilities: 1, fixedLiabilities: 1, netIncome: 0 };
    expect(relationIssue(BALANCE_SHEET_COLLECTION, minimal)).toBeNull();
    expect(COLLECTION_SHAPES[BALANCE_SHEET_COLLECTION]!(minimal)).toBe(true);
  });

  it('有利子負債は負債合計 (流動 + 固定) と比べる — 片方だけでは足りない', () => {
    // 流動負債 500 万 + 固定負債 300 万 = 800 万。流動負債だけと比べていたら 600 万で落ちる。
    const within = { ...okBs, interestBearingDebt: 6_000_000 };
    expect(relationIssue(BALANCE_SHEET_COLLECTION, within)).toBeNull();
    const over = { ...okBs, interestBearingDebt: 8_000_001 };
    expect(relationIssue(BALANCE_SHEET_COLLECTION, over)).toBe('有利子負債は負債合計以下で入力してください');
  });

  it('内数が超える控えから 当座比率 を作らない (算定不能にする)', () => {
    // 2 つの門より前に保存された控えは残りうるので、計算の側でも受ける。
    const stale = { ...okBs, inventory: 9_000_000 };
    const m = computeBalanceSheetMetrics(normalizeBalanceSheet(stale));
    expect(m.quickRatioPct).toBeNull();
    // 対照: 満たしている控えなら値が出る。
    expect(computeBalanceSheetMetrics(normalizeBalanceSheet(okBs)).quickRatioPct).toBe(140);
  });
});

describe('KPI の 人件費 ≦ 販管費 — 両方の入口が断る (パス 224)', () => {
  const okKpi = { period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 300_000, advertising: 10_000, sga: 100_000, depreciation: 5_000, laborCost: 80_000 };

  it('満たす控えは両方の入口を通る (対照)', () => {
    expect(() => parseKpiActual(okKpi)).not.toThrow();
    for (const c of ['kpi-actuals', 'kpi-budgets'] as const) {
      expect(relationIssue(c, okKpi), c).toBeNull();
      expect(COLLECTION_SHAPES[c]!(okKpi), c).toBe(true);
    }
  });

  it('人件費 > 販管費 は実績・予算の両方で断られる', () => {
    const bad = { ...okKpi, laborCost: 900_000 };
    expect(() => parseKpiActual(bad)).toThrow('人件費は販管費以下で入力してください');
    for (const c of ['kpi-actuals', 'kpi-budgets'] as const) {
      expect(relationIssue(c, bad), c).toBe('人件費は販管費以下で入力してください');
      expect(COLLECTION_SHAPES[c]!(bad), c).toBe(false);
    }
  });

  it('人件費 == 販管費 は通る (販管費が人件費だけの事業は在りうる)', () => {
    const equal = { ...okKpi, laborCost: okKpi.sga };
    expect(() => parseKpiActual(equal)).not.toThrow();
    expect(relationIssue('kpi-actuals', equal)).toBeNull();
  });

  it('人件費の欄が無い控えは照合しない (任意欄)', () => {
    const { laborCost: _drop, ...without } = okKpi;
    expect(relationIssue('kpi-actuals', without)).toBeNull();
    expect(COLLECTION_SHAPES['kpi-actuals']!(without)).toBe(true);
  });
});

describe('連続下落 危険 ≧ 警告 — 両方の入口が断る (パス 224)', () => {
  const ok = { declineWarnStreak: 2, declineCriticalStreak: 4, laborShareWarnPct: 55, singleChannelWarnPct: 70 };

  it('満たす設定は両方の入口を通る (対照)', () => {
    expect(() => parseHighlightSettings(ok)).not.toThrow();
    expect(relationIssue(HIGHLIGHT_SETTINGS_COLLECTION, ok)).toBeNull();
    expect(COLLECTION_SHAPES[HIGHLIGHT_SETTINGS_COLLECTION]!(ok)).toBe(true);
  });

  it('危険 < 警告 は両方の入口が断る', () => {
    const bad = { ...ok, declineWarnStreak: 4, declineCriticalStreak: 1 };
    expect(() => parseHighlightSettings(bad)).toThrow('連続下落(危険)期数は警告期数以上で入力してください');
    expect(relationIssue(HIGHLIGHT_SETTINGS_COLLECTION, bad)).toBe('連続下落(危険)期数は警告期数以上で入力してください');
    expect(COLLECTION_SHAPES[HIGHLIGHT_SETTINGS_COLLECTION]!(bad)).toBe(false);
  });

  it('危険 == 警告 は通る (2 期で即「危険」とする運用は在りうる)', () => {
    const equal = { ...ok, declineWarnStreak: 3, declineCriticalStreak: 3 };
    expect(() => parseHighlightSettings(equal)).not.toThrow();
    expect(relationIssue(HIGHLIGHT_SETTINGS_COLLECTION, equal)).toBeNull();
  });

  it('既定のしきい値は関係を満たす (対照)', () => {
    expect(relationIssue(HIGHLIGHT_SETTINGS_COLLECTION, parseHighlightSettings({}))).toBeNull();
  });
});
