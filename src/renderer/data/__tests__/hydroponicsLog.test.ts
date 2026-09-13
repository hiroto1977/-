import { describe, expect, it } from 'vitest';
import {
  batchesFromRecords,
  controlRecordFromRecords,
  dosingFrom,
  HYDROPONICS_BATCHES_COLLECTION,
  HYDROPONICS_CONTROL_COLLECTION,
  HYDROPONICS_CONTROL_DEFAULTS,
  HYDROPONICS_READINGS_COLLECTION,
  MAX_BATCH_ID_CHARS,
  MAX_BATCH_PANELS,
  MAX_HYDROPONICS_NOTE_CHARS,
  parseBatch,
  parseControlRecord,
  parseReading,
  readingsFromRecords,
  settingsFrom,
  targetsFrom,
} from '../hydroponicsLog';
import { hasCollectionShape } from '../collectionShapes';
import {
  DEFAULT_ENVIRONMENT_TARGETS,
  READING_FIELDS,
} from '../../../shared/hydroponicsControl';
import { MAX_RECORD_NOTE_CHARS } from '../../../shared/recordEntryLimits';

/*
 * 水耕栽培の運転記録の保存 (2026-09-13 · パス 194)。
 *
 * ここで守るのは:
 *   - **空欄は未測定 (null)、読めない値は断る** —— 0 に倒さない
 *   - **読めない控えは件数として返す** —— 黙って空にしない (パス 121 / 188)
 *   - **設備の 4 欄は未入力を null で保つ** —— 既定を入れると「量を出せる」に化ける
 *   - 書いた物が `collectionShapes` を必ず通る (復元でレコードが消えない)
 */

const REC = (data: unknown, createdAt = 1): { createdAt: number; data: unknown } => ({ createdAt, data });
/** IndexedDB / バックアップと同じ往復。 */
const viaJson = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

describe('測定を書く (parseReading)', () => {
  it('全項目を入れれば全部数値で入る', () => {
    const r = parseReading({
      at: '2026-09-13',
      values: { ec: '1.2', ph: '6.0', waterTempC: '20', airTempC: '22', humidityPct: '70', co2Ppm: '900', dissolvedOxygenMgL: '7', waterLevelPct: '90' },
      batchId: 'b1',
      note: 'x',
    });
    expect(r.at).toBe('2026-09-13');
    expect(r.values.ec).toBe(1.2);
    expect(r.batchId).toBe('b1');
    expect(r.note).toBe('x');
  });

  it('★ 空欄は null (未測定)。0 に倒さない', () => {
    const r = parseReading({ at: '2026-09-13', values: { ec: '1.2', ph: '', co2Ppm: '   ' } });
    expect(r.values.ph, '★ 空欄が 0 になりました').toBeNull();
    expect(r.values.co2Ppm).toBeNull();
    // 触れていない欄も null。
    expect(r.values.airTempC).toBeNull();
    // 全項目そろっている (欄を落とさない)。
    expect(Object.keys(r.values).sort()).toEqual([...READING_FIELDS].sort());
  });

  it('★ 数でない値は断る (黙って落とさない)', () => {
    expect(() => parseReading({ at: '2026-09-13', values: { ec: 'ひくい' } })).toThrow(/数値/);
    expect(() => parseReading({ at: '2026-09-13', values: { ph: 'なし' } })).toThrow(/数値/);
  });

  it('★ 妥当範囲の外は保存する前に断る (校正を促す)', () => {
    expect(() => parseReading({ at: '2026-09-13', values: { ph: '99' } })).toThrow(/範囲/);
    expect(() => parseReading({ at: '2026-09-13', values: { ec: '-1' } })).toThrow(/範囲/);
    expect(() => parseReading({ at: '2026-09-13', values: { humidityPct: '120' } })).toThrow(/範囲/);
  });

  it('暦に無い測定日は断る', () => {
    expect(() => parseReading({ at: '2026-02-30', values: { ec: '1' } })).toThrow(/実在する日付/);
    expect(() => parseReading({ at: '2026-09', values: { ec: '1' } })).toThrow(/実在する日付/);
  });

  it('★ 1 項目も測っていない記録は断る (空の行を作らない)', () => {
    expect(() => parseReading({ at: '2026-09-13', values: {} })).toThrow(/1 項目/);
    expect(() => parseReading({ at: '2026-09-13' })).toThrow(/1 項目/);
  });

  it('★ メモは天井を超えたら切らずに断る。天井は業務メモと同じ値を読む', () => {
    expect(MAX_HYDROPONICS_NOTE_CHARS).toBe(MAX_RECORD_NOTE_CHARS);
    const long = 'あ'.repeat(MAX_HYDROPONICS_NOTE_CHARS + 1);
    expect(() => parseReading({ at: '2026-09-13', values: { ec: '1' }, note: long })).toThrow();
    // 天井ちょうどは通る (境界)。
    const edge = 'あ'.repeat(MAX_HYDROPONICS_NOTE_CHARS);
    expect(parseReading({ at: '2026-09-13', values: { ec: '1' }, note: edge }).note).toHaveLength(
      MAX_HYDROPONICS_NOTE_CHARS,
    );
  });

  it('書いた物は collectionShapes を通る (往復つき)', () => {
    const full = viaJson(parseReading({ at: '2026-09-13', values: { ec: '1.2' }, batchId: 'b1', note: 'n' }));
    const bare = viaJson(parseReading({ at: '2026-09-13', values: { ec: '1.2' } }));
    expect(hasCollectionShape(HYDROPONICS_READINGS_COLLECTION, full)).toBe(true);
    expect(hasCollectionShape(HYDROPONICS_READINGS_COLLECTION, bare)).toBe(true);
  });
});

describe('ロットを書く (parseBatch)', () => {
  const good = { id: 'b1', cropId: 'leaf-lettuce', sowDate: '2026-09-01', panels: '10', state: 'nursery' };

  it('必須が揃えば入る。未定の日付は null', () => {
    const b = parseBatch(good);
    expect(b.panels).toBe(10);
    expect(b.transplantedDate).toBeNull();
    expect(b.harvestedDate).toBeNull();
    expect(b.solutionChangedDate).toBeNull();
  });

  it('ロット名・品目・播種日・枚数・状態を断る', () => {
    expect(() => parseBatch({ ...good, id: '  ' })).toThrow(/ロット名/);
    expect(() => parseBatch({ ...good, id: 'x'.repeat(MAX_BATCH_ID_CHARS + 1) })).toThrow();
    expect(() => parseBatch({ ...good, cropId: '' })).toThrow(/品目/);
    expect(() => parseBatch({ ...good, sowDate: '2026-02-30' })).toThrow(/実在する日付/);
    expect(() => parseBatch({ ...good, panels: '0' })).toThrow(/1 以上の整数/);
    expect(() => parseBatch({ ...good, panels: '1.5' })).toThrow(/1 以上の整数/);
    expect(() => parseBatch({ ...good, panels: String(MAX_BATCH_PANELS + 1) })).toThrow(/枚まで/);
    expect(() => parseBatch({ ...good, state: 'sprouting' })).toThrow(/状態/);
  });

  it('★ 読めない日付は今日に倒さず断る', () => {
    expect(() => parseBatch({ ...good, transplantedDate: 'あした' })).toThrow(/定植日/);
    expect(() => parseBatch({ ...good, harvestedDate: '2026-13-01' })).toThrow(/収穫日/);
    expect(() => parseBatch({ ...good, solutionChangedDate: '2026/09/01' })).toThrow(/養液交換日/);
  });

  it('★ 日付の前後が逆なら断る (播種より前の定植・収穫は無い)', () => {
    expect(() => parseBatch({ ...good, transplantedDate: '2026-08-31' })).toThrow(/定植日が播種日より前/);
    expect(() => parseBatch({ ...good, harvestedDate: '2026-08-31' })).toThrow(/収穫日が播種日より前/);
    expect(() =>
      parseBatch({ ...good, transplantedDate: '2026-09-25', harvestedDate: '2026-09-20' }),
    ).toThrow(/収穫日が定植日より前/);
    // 同じ日は通る (境界)。
    expect(parseBatch({ ...good, transplantedDate: '2026-09-01' }).transplantedDate).toBe('2026-09-01');
  });

  it('書いた物は collectionShapes を通る (往復つき)', () => {
    expect(hasCollectionShape(HYDROPONICS_BATCHES_COLLECTION, viaJson(parseBatch(good)))).toBe(true);
    const full = parseBatch({
      ...good,
      state: 'growing',
      transplantedDate: '2026-09-25',
      solutionChangedDate: '2026-09-26',
      note: 'n',
    });
    expect(hasCollectionShape(HYDROPONICS_BATCHES_COLLECTION, viaJson(full))).toBe(true);
  });
});

describe('運転の設定を書く (parseControlRecord)', () => {
  it('空欄は既定へ倒す (入力欄の初期値)', () => {
    expect(parseControlRecord({})).toEqual(HYDROPONICS_CONTROL_DEFAULTS);
  });

  it('★ 設備の 4 欄は空欄なら null (0 ではない)', () => {
    const r = parseControlRecord({ tankLiters: '', stockEcRisePerMlPerL: '  ' });
    expect(r.tankLiters, '★ 未入力が 0 になりました').toBeNull();
    expect(r.stockEcRisePerMlPerL).toBeNull();
    expect(r.alkalinityMgCaCO3PerL).toBeNull();
    expect(r.acidNormality).toBeNull();
  });

  it('★ 設備の欄に 0 / 負を入れたら断る (0 除算と符号の逆転を作らない)', () => {
    for (const key of ['tankLiters', 'stockEcRisePerMlPerL', 'alkalinityMgCaCO3PerL', 'acidNormality']) {
      expect(() => parseControlRecord({ [key]: '0' }), key).toThrow(/0 より大きい/);
      expect(() => parseControlRecord({ [key]: '-1' }), key).toThrow(/0 より大きい/);
    }
  });

  it('★ 下限が上限を超えたら断る (全項目が範囲外になる形)', () => {
    expect(() => parseControlRecord({ waterTempLowC: '30', waterTempHighC: '20' })).toThrow(/養液温度/);
    expect(() => parseControlRecord({ airTempLowC: '30', airTempHighC: '20' })).toThrow(/室温/);
    expect(() => parseControlRecord({ humidityLowPct: '90', humidityHighPct: '50' })).toThrow(/相対湿度/);
    expect(() => parseControlRecord({ co2LowPpm: '1500', co2HighPpm: '400' })).toThrow(/CO₂/);
    // 同じ値は通る (境界)。
    expect(parseControlRecord({ waterTempLowC: '20', waterTempHighC: '20' }).waterTempLowC).toBe(20);
  });

  it('周期・しきい値は 1 以上の整数', () => {
    for (const key of ['solutionChangeIntervalDays', 'readingStaleDays', 'harvestNoticeDays']) {
      expect(() => parseControlRecord({ [key]: '0' }), key).toThrow(/1 以上の整数/);
      expect(() => parseControlRecord({ [key]: '1.5' }), key).toThrow(/1 以上の整数/);
    }
  });

  it('数でない値は断る', () => {
    expect(() => parseControlRecord({ waterTempLowC: 'つめたい' })).toThrow(/数値/);
  });

  it('書いた物は collectionShapes を通る (往復つき)', () => {
    expect(hasCollectionShape(HYDROPONICS_CONTROL_COLLECTION, viaJson(parseControlRecord({})))).toBe(true);
    const filled = parseControlRecord({ tankLiters: '1000', stockEcRisePerMlPerL: '0.002', alkalinityMgCaCO3PerL: '80', acidNormality: '1' });
    expect(hasCollectionShape(HYDROPONICS_CONTROL_COLLECTION, viaJson(filled))).toBe(true);
  });
});

describe('読み込み — 読めない控えを件数で返す', () => {
  it('★ 読めない測定は捨てるが件数を返す (黙って空にしない)', () => {
    const r = readingsFromRecords([
      REC({ at: '2026-09-13', values: { ec: 1 } }),
      REC({ at: '2026-02-30', values: { ec: 1 } }), // 暦に無い
      REC(null),
      REC('文字列'),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.unreadable, '★ 読めなかった件数を返していません').toBe(3);
  });

  it('測定は日付の新しい順', () => {
    const r = readingsFromRecords([
      REC({ at: '2026-09-10', values: { ec: 1 } }),
      REC({ at: '2026-09-13', values: { ec: 1 } }),
      REC({ at: '2026-09-11', values: { ec: 1 } }),
    ]);
    expect(r.items.map((x) => x.at)).toEqual(['2026-09-13', '2026-09-11', '2026-09-10']);
  });

  it('★ 読めないロットも件数で返す', () => {
    const r = batchesFromRecords([
      REC({ id: 'b1', cropId: 'leaf-lettuce', sowDate: '2026-09-01' }),
      REC({ id: '', cropId: 'leaf-lettuce', sowDate: '2026-09-01' }),
      REC({ id: 'b3', cropId: 'leaf-lettuce', sowDate: 'いつか' }),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.unreadable).toBe(2);
  });

  it('ロットは播種日の新しい順', () => {
    const r = batchesFromRecords([
      REC({ id: 'a', cropId: 'c', sowDate: '2026-08-01' }),
      REC({ id: 'b', cropId: 'c', sowDate: '2026-09-01' }),
    ]);
    expect(r.items.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('空の一覧は 0 件・読めない 0 件 (「無い」と「読めない」を分ける)', () => {
    expect(readingsFromRecords([])).toEqual({ items: [], unreadable: 0 });
    expect(batchesFromRecords([])).toEqual({ items: [], unreadable: 0 });
  });
});

describe('設定の読み込み', () => {
  it('保存が無ければ既定', () => {
    expect(controlRecordFromRecords([])).toEqual(HYDROPONICS_CONTROL_DEFAULTS);
    expect(controlRecordFromRecords([REC(null)])).toEqual(HYDROPONICS_CONTROL_DEFAULTS);
    expect(controlRecordFromRecords([REC(42)])).toEqual(HYDROPONICS_CONTROL_DEFAULTS);
  });

  it('最新の 1 件を採用する (createdAt で選ぶ)', () => {
    const r = controlRecordFromRecords([
      REC({ waterTempLowC: 10 }, 1),
      REC({ waterTempLowC: 16 }, 5),
      REC({ waterTempLowC: 12 }, 3),
    ]);
    expect(r.waterTempLowC).toBe(16);
  });

  it('★ 読めない欄は既定へ倒すが、設備の欄は null を保つ', () => {
    const r = controlRecordFromRecords([
      REC({ waterTempLowC: 'つめたい', tankLiters: 'たくさん', stockEcRisePerMlPerL: Number.NaN }),
    ]);
    expect(r.waterTempLowC).toBe(HYDROPONICS_CONTROL_DEFAULTS.waterTempLowC);
    expect(r.tankLiters, '★ 読めない容量が既定になりました (量を出せるに化ける)').toBeNull();
    expect(r.stockEcRisePerMlPerL).toBeNull();
  });

  it('目標域・調製・運転に分けて取り出せる', () => {
    const r = controlRecordFromRecords([]);
    expect(targetsFrom(r)).toEqual(DEFAULT_ENVIRONMENT_TARGETS);
    expect(dosingFrom(r).tankLiters).toBeNull();
    const s = settingsFrom(r, true, 7);
    expect(s.lowPotassium).toBe(true);
    expect(s.lowPotassiumSwitchDays).toBe(7);
    expect(s.solutionChangeIntervalDays).toBe(r.solutionChangeIntervalDays);
  });

  it('★ 低カリウムの 2 欄は試算側から来る (同じ値を 2 か所に置かない)', () => {
    const r = controlRecordFromRecords([]);
    // 運転の設定レコードには低カリウムの欄が無い。
    expect(Object.keys(r)).not.toContain('lowPotassium');
    expect(Object.keys(r)).not.toContain('switchDaysBeforeHarvest');
    // 渡されたものがそのまま効く。
    expect(settingsFrom(r, false, null).lowPotassiumSwitchDays).toBeNull();
  });

  it('★ 目標域を保存すると判定に届く (口が繋がっている)', () => {
    const saved = controlRecordFromRecords([REC(parseControlRecord({ airTempLowC: '25', airTempHighC: '30' }))]);
    expect(targetsFrom(saved).airTempLowC, '★ 保存した目標域が判定に届いていません').toBe(25);
    expect(targetsFrom(saved).airTempHighC).toBe(30);
  });
});
