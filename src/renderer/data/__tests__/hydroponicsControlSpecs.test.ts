/**
 * **水耕栽培の運転設定 18 欄に天井を入れる** (2026-09-21 · パス 373)。
 *
 * ## 見つけた物 (実測)
 *
 * 画面は 18 欄を**素の `<input type="text">`** で出し (ラベルも生の鍵名
 * `waterTempLowC` のまま)、保存側の検査は 3 つだけだった:
 *
 * ```
 *   req    (目標域 10 + 残アルカリ度)  有限なら何でも通る —— 負も可・上限なし
 *   optNum (調製の 4 欄)               有限かつ > 0 だけ   —— 上限なし
 *   days   (周期・しきい値 3 欄)       1 以上の整数         —— 上限なし
 * ```
 *
 * 効いていたのは `relationIssue` の「下限 ≦ 上限」だけ。結果 (実測):
 *
 * ```
 *   topUpLiters(1, { …, tankLiters: 1e12 })
 *     → { liters: 990000000000, why: '液位 1% を満水まで戻す量です…' }
 * ```
 *
 * **桁を 1 つ多く打っただけの値が、自信のある指示として出る。**
 * 酸を量る指示 (`acidToNeutralizeAlkalinity`) も同じ経路を通る。
 *
 * ## 直し方
 *
 * 幅は `CONTROL_FIELD_BOUNDS` **ただ 1 つ**で、書き側 (画面の `GuardedNumber` と
 * `parseControlRecord`) と**読み側** (`readControlRecord`) の両方が読む ——
 * 入口だけ締めると「入口が出口より厳しい」非対称になり、古い保存値や復元で
 * 入った桁違いがそのまま指示になる (パス 359 が名指しした形)。
 */
import { describe, expect, it } from 'vitest';
import {
  CONTROL_FIELD_BOUNDS,
  controlFieldOutOfRange,
  outOfRangeControlNote,
  READING_FIELD_SPECS,
  topUpLiters,
  type ControlFieldKey,
} from '../../../shared/hydroponicsControl';
import { unitOfKind } from '../inputGuards';
import {
  HYDROPONICS_CONTROL_DEFAULTS,
  HYDROPONICS_CONTROL_SPECS,
  dosingFrom,
  readControlRecord,
} from '../hydroponicsLog';

const KEYS = Object.keys(CONTROL_FIELD_BOUNDS) as readonly ControlFieldKey[];
const stored = (data: unknown) => [{ createdAt: 1, data }];

describe('運転設定の幅は 1 つで、書き側と読み側の両方が読む (パス 373)', () => {
  it('★ 走査が実物に当たる (18 欄・台帳と既定が双方向)', () => {
    expect(KEYS.length, '欄の数が変わった').toBe(18);
    const defaults = Object.keys(HYDROPONICS_CONTROL_DEFAULTS).sort();
    expect([...KEYS].sort(), '台帳と既定がずれている').toEqual(defaults);
    expect(Object.keys(HYDROPONICS_CONTROL_SPECS).sort(), '入力仕様がずれている').toEqual(defaults);
  });

  it('★ 単位語は借りない (種類が名乗る単位 === 台帳の単位)', () => {
    for (const k of KEYS) {
      expect(
        unitOfKind(HYDROPONICS_CONTROL_SPECS[k].kind),
        `${k}: 近い種類を借りると「0 ${unitOfKind(HYDROPONICS_CONTROL_SPECS[k].kind)} として計算されています」と嘘の単位を言う`,
      ).toBe(CONTROL_FIELD_BOUNDS[k].unit);
    }
  });

  it('★ 目標域 10 欄の幅は測定仕様から導く (数を 2 度書かない)', () => {
    const pairs: readonly (readonly [ControlFieldKey, keyof typeof READING_FIELD_SPECS])[] = [
      ['waterTempLowC', 'waterTempC'],
      ['waterTempHighC', 'waterTempC'],
      ['airTempLowC', 'airTempC'],
      ['airTempHighC', 'airTempC'],
      ['humidityLowPct', 'humidityPct'],
      ['humidityHighPct', 'humidityPct'],
      ['co2LowPpm', 'co2Ppm'],
      ['co2HighPpm', 'co2Ppm'],
      ['dissolvedOxygenLowMgL', 'dissolvedOxygenMgL'],
      ['waterLevelLowPct', 'waterLevelPct'],
    ];
    for (const [key, field] of pairs) {
      expect(CONTROL_FIELD_BOUNDS[key].min, `${key} の下端`).toBe(READING_FIELD_SPECS[field].plausibleMin);
      expect(CONTROL_FIELD_BOUNDS[key].max, `${key} の上端`).toBe(READING_FIELD_SPECS[field].plausibleMax);
      expect(CONTROL_FIELD_BOUNDS[key].unit, `${key} の単位`).toBe(READING_FIELD_SPECS[field].unit);
    }
  });

  it('★ 台帳の理由はどれも「適正域ではない」ことを書いている', () => {
    for (const k of KEYS) {
      expect(CONTROL_FIELD_BOUNDS[k].why.length, `${k}: 理由が無い`).toBeGreaterThan(10);
      expect(CONTROL_FIELD_BOUNDS[k].min, `${k}: 下端 > 上端`).toBeLessThan(CONTROL_FIELD_BOUNDS[k].max);
    }
  });

  it('★ 幅の判定 (標本と対照)', () => {
    expect(controlFieldOutOfRange('tankLiters', 1000), '正当な容量を断っている').toBe(false);
    expect(controlFieldOutOfRange('tankLiters', 1e12), '桁違いを通している').toBe(true);
    expect(controlFieldOutOfRange('tankLiters', null), '未入力を幅の外と数えている').toBe(false);
    expect(controlFieldOutOfRange('waterTempLowC', -100), '有り得ない温度を通している').toBe(true);
    expect(controlFieldOutOfRange('waterTempLowC', 18), '正当な温度を断っている').toBe(false);
    expect(controlFieldOutOfRange('solutionChangeIntervalDays', 14.5), '整数でない日数を通している').toBe(true);
    // **濃酸は正当** —— 狭めて正当な値を拒むほうが害が大きい (台帳の理由と同じ判断)。
    expect(controlFieldOutOfRange('acidNormality', 36), '濃硫酸 (約 36 N) を断っている').toBe(false);
  });

  it('★ 読み側が幅の外を既定へ倒し、倒したことを返す', () => {
    const read = readControlRecord(stored({ ...HYDROPONICS_CONTROL_DEFAULTS, tankLiters: 1e12 }));
    expect(read.outOfRange, '倒したことを報せていない').toEqual(['tankLiters']);
    expect(read.record.tankLiters, '桁違いをそのまま持っている').toBeNull();
    const note = outOfRangeControlNote(read.outOfRange);
    expect(note, '画面へ出す文が無い').not.toBeNull();
    expect(note, '欄を名指ししていない').toContain('養液タンクの容量');
  });

  it('★ 正当な値はそのまま通る (門が広すぎ / 狭すぎでない)', () => {
    const read = readControlRecord(stored({ ...HYDROPONICS_CONTROL_DEFAULTS, tankLiters: 1000 }));
    expect(read.outOfRange, '正当な値を倒している').toEqual([]);
    expect(read.record.tankLiters).toBe(1000);
    expect(outOfRangeControlNote(read.outOfRange), '倒していないのに文が出る').toBeNull();
  });

  it('★ 見つけた形そのもの: 桁違いのタンク容量が指示にならない', () => {
    const read = readControlRecord(stored({ ...HYDROPONICS_CONTROL_DEFAULTS, tankLiters: 1e12 }));
    const advice = topUpLiters(1, dosingFrom(read.record));
    expect(advice.kind, '990,000,000,000 L を指示として出している').not.toBe('top-up');
    // 対照: 幅の内なら今までどおり量が出る。
    const okRead = readControlRecord(stored({ ...HYDROPONICS_CONTROL_DEFAULTS, tankLiters: 1000 }));
    expect(topUpLiters(1, dosingFrom(okRead.record)).kind, '正当な容量で量が出ない').toBe('top-up');
  });
});
