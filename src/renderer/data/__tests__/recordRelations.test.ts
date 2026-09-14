/**
 * 記録の**欄と欄の関係** (パス 223)。
 *
 * 2026-09-14 の実測: 画面の入口は関係を 7 件断っていたのに、復元の入口
 * (`COLLECTION_SHAPES`) は **0/7** しか見ていなかった。通った記録から
 * `batchSchedule` は「播種の 1 か月前に収穫予定 (実績起算)」を返していた。
 *
 * ここで留めるのは 3 つ:
 *   1. 台帳の関係が実際に破れを捕まえる (7 件を総当たり)。
 *   2. **両方の入口**が同じ台帳を読む (画面が断るなら復元も落とす)。
 *   3. **書き手の中に自前の欄どうしの比較が残っていない** (走査 —— 台帳を
 *      迂回して増やせないこと)。
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { RECORD_RELATIONS, relationIssue, relationsHold } from '../recordRelations';
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
  it('関係を持つ collection は 2 つ・関係は 7 件 (2026-09-14 実測)', () => {
    expect(Object.keys(RECORD_RELATIONS).sort()).toEqual([
      'hydroponics-batches',
      'hydroponics-control',
    ]);
    expect(Object.values(RECORD_RELATIONS).flat().length).toBe(7);
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
  const WRITER = src('../hydroponicsLog.ts');

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

  it('書き手は台帳を読んでいる (両方の入口で)', () => {
    expect(WRITER).toContain("relationIssue(HYDROPONICS_BATCHES_COLLECTION");
    expect(WRITER).toContain("relationIssue(HYDROPONICS_CONTROL_COLLECTION");
  });

  it('形の検査は台帳を読んでいる', () => {
    const shapes = src('../collectionShapes.ts');
    expect(shapes).toContain('relationsHold(name, data)');
  });
});
