import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHED_THRESHOLDS as T,
  EMS_MODE_LABEL,
  LOAD_TIERS,
  LOAD_TIER_LABEL,
  activeTiers,
  nextEmsState,
  potableStatus,
  shedThresholdErrors,
  simulateOutage,
  solarProfileKw,
  type EmsEvent,
  type EmsMode,
  type OutageInput,
} from '../zebHubEms';

const ALL_EVENTS: readonly EmsEvent[] = [
  { kind: 'grid-lost' },
  { kind: 'island-formed' },
  { kind: 'island-failed' },
  { kind: 'grid-stable' },
  { kind: 'resynced' },
  { kind: 'soc', soc: 0.5 },
  { kind: 'soc', soc: 0.01 },
  { kind: 'pv-available' },
];
const ALL_MODES = Object.keys(EMS_MODE_LABEL) as EmsMode[];

describe('状態の移り変わり', () => {
  it('★ 停電: 遮断器を先に開き、それから自立運転の電圧を作り、上水を雨水 + RO + UV へ・トイレをコンポストへ', () => {
    expect(nextEmsState('grid', { kind: 'grid-lost' })).toEqual({
      mode: 'islanding',
      actions: ['open-grid-breaker', 'pcs-grid-forming', 'potable-source-rain-ro-uv', 'toilet-compost'],
    });
  });

  it('★ 解列の完了で自立運転・失敗なら全停止して人へ知らせる', () => {
    expect(nextEmsState('islanding', { kind: 'island-formed' })).toEqual({ mode: 'island', actions: [] });
    expect(nextEmsState('islanding', { kind: 'island-failed' })).toEqual({
      mode: 'blackout',
      actions: ['stop-all-loads', 'alert-operator'],
    });
  });

  it('★ 自立運転: 残量が下限を下回れば全停止・下限ちょうどは続ける', () => {
    expect(nextEmsState('island', { kind: 'soc', soc: T.hardFloorSoc - 0.001 })).toEqual({
      mode: 'blackout',
      actions: ['stop-all-loads', 'alert-operator'],
    });
    expect(nextEmsState('island', { kind: 'soc', soc: T.hardFloorSoc })).toEqual({ mode: 'island', actions: [] });
  });

  it('★ 自立運転・全停止から、系統が安定して戻れば同期へ。同期が取れて初めて連系し直す', () => {
    expect(nextEmsState('island', { kind: 'grid-stable' })).toEqual({ mode: 'resync', actions: [] });
    expect(nextEmsState('blackout', { kind: 'grid-stable' })).toEqual({ mode: 'resync', actions: [] });
    expect(nextEmsState('resync', { kind: 'resynced' })).toEqual({
      mode: 'grid',
      actions: ['close-grid-breaker', 'pcs-grid-following', 'potable-source-municipal', 'toilet-sewer'],
    });
  });

  it('★ 同期の途中でまた停電したら自立運転へ戻る', () => {
    expect(nextEmsState('resync', { kind: 'grid-lost' })).toEqual({ mode: 'island', actions: [] });
  });

  it('★ 全停止から発電が戻れば立ち上げ、立ち上がったら止めない負荷だけで自立運転', () => {
    expect(nextEmsState('blackout', { kind: 'pv-available' })).toEqual({
      mode: 'blackstart',
      actions: ['pcs-grid-forming', 'restore-critical'],
    });
    expect(nextEmsState('blackstart', { kind: 'island-formed' })).toEqual({
      mode: 'island',
      actions: ['shed-all-but-critical'],
    });
  });

  it('★ 遮断器を閉じる指令は、同期が取れたときにしか出さない (どの状態・どの出来事でも)', () => {
    for (const mode of ALL_MODES) {
      for (const event of ALL_EVENTS) {
        const next = nextEmsState(mode, event);
        if (next.actions.includes('close-grid-breaker')) {
          expect([mode, event.kind]).toEqual(['resync', 'resynced']);
        }
      }
    }
  });

  it('意味を持たない出来事は無視する (状態も指令も変えない)', () => {
    const changing = new Set([
      'grid:grid-lost',
      'islanding:island-formed',
      'islanding:island-failed',
      'island:grid-stable',
      'island:soc:0.01',
      'blackout:pv-available',
      'blackout:grid-stable',
      'blackstart:island-formed',
      'resync:resynced',
      'resync:grid-lost',
    ]);
    for (const mode of ALL_MODES) {
      for (const event of ALL_EVENTS) {
        const key = event.kind === 'soc' ? `${mode}:soc:${event.soc}` : `${mode}:${event.kind}`;
        if (changing.has(key)) continue;
        expect(nextEmsState(mode, event), key).toEqual({ mode, actions: [] });
      }
    }
  });

  it('境目を渡せば、その下限で全停止を決める', () => {
    const t = { ...T, hardFloorSoc: 0.2 };
    expect(nextEmsState('island', { kind: 'soc', soc: 0.15 }, t).mode).toBe('blackout');
    expect(nextEmsState('island', { kind: 'soc', soc: 0.15 }).mode).toBe('island');
  });

  it('状態と段の名前がそろう', () => {
    expect(EMS_MODE_LABEL).toEqual({
      grid: '系統連系 (平時)',
      islanding: '解列中',
      island: '自立運転',
      blackout: '全停止',
      blackstart: '立ち上げ',
      resync: '系統へ戻す',
    });
    expect(LOAD_TIERS).toEqual([0, 1, 2, 3]);
    expect(LOAD_TIER_LABEL).toEqual({
      0: '止めない負荷 (水循環ポンプ・殺菌灯・通信)',
      1: '冷凍冷蔵',
      2: '空調',
      3: '店舗・EV 充電',
    });
  });
});

describe('負荷を止める順番', () => {
  it('★ 自立運転に入った時点で店舗・EV は止める (残量 100% でも)', () => {
    expect(activeTiers(1)).toEqual([0, 1, 2]);
  });

  it('★ 残量が減るにつれて 空調 → 冷凍冷蔵 の順に止め、止めない負荷は下限まで残す', () => {
    expect(activeTiers(T.tier2Soc)).toEqual([0, 1, 2]);
    expect(activeTiers(T.tier2Soc - 0.01)).toEqual([0, 1]);
    expect(activeTiers(T.tier1Soc)).toEqual([0, 1]);
    expect(activeTiers(T.tier1Soc - 0.01)).toEqual([0]);
    expect(activeTiers(T.hardFloorSoc)).toEqual([0]);
    expect(activeTiers(T.hardFloorSoc - 0.001)).toEqual([]);
  });

  it('段 3 の境目を下げれば、店舗・EV も動かす', () => {
    expect(activeTiers(0.9, { ...T, tier3Soc: 0.8 })).toEqual([0, 1, 2, 3]);
    expect(activeTiers(0.8, { ...T, tier3Soc: 0.8 })).toEqual([0, 1, 2, 3]);
  });

  it('境目の並びと値を検める', () => {
    expect(shedThresholdErrors(T)).toEqual([]);
    expect(shedThresholdErrors({ ...T, tier2Soc: T.tier3Soc })).toEqual([]);
    expect(shedThresholdErrors({ ...T, hardFloorSoc: 0 })).toEqual([]);
    const order = '境目は 下限 < 段 1 < 段 2 ≦ 段 3 の順に並べてください';
    expect(shedThresholdErrors({ ...T, tier1Soc: T.hardFloorSoc })).toEqual([order]);
    expect(shedThresholdErrors({ ...T, tier2Soc: T.tier1Soc })).toEqual([order]);
    expect(shedThresholdErrors({ ...T, tier3Soc: T.tier2Soc - 0.01 })).toEqual([order]);
    expect(shedThresholdErrors({ ...T, hardFloorSoc: -0.1 })).toEqual(['hardFloorSoc: 0 以上の数で入れてください']);
    expect(shedThresholdErrors({ ...T, tier1Soc: Number.NaN })).toEqual(['tier1Soc: 0 以上の数で入れてください', order]);
  });
});

describe('飲用 (上水) の供給元', () => {
  const ok = { roOk: true, uvOk: true, rainTankLiters: 1000 };

  it('★ 平時と同期中は水道', () => {
    for (const mode of ['grid', 'resync'] as const) {
      expect(potableStatus(mode, { roOk: false, uvOk: false, rainTankLiters: 0 })).toEqual({
        source: 'municipal',
        drinkable: true,
        reason: '水道から供給',
      });
    }
  });

  it('★ 災害時は雨水 + RO + UV。RO か UV が働かなければ飲用を止める (処理していない水を出さない)', () => {
    for (const mode of ['islanding', 'island', 'blackout', 'blackstart'] as const) {
      expect(potableStatus(mode, ok)).toEqual({ source: 'rain-ro-uv', drinkable: true, reason: '雨水を RO 膜と UV 殺菌で処理して供給' });
      for (const broken of [{ ...ok, roOk: false }, { ...ok, uvOk: false }]) {
        expect(potableStatus(mode, broken)).toEqual({
          source: 'none',
          drinkable: false,
          reason: 'RO 膜か UV 殺菌が働かないため、飲用の供給を止めています',
        });
      }
    }
  });

  it('雨水タンクが空 (や読めない量) なら止める', () => {
    for (const liters of [0, Number.NaN]) {
      expect(potableStatus('island', { ...ok, rainTankLiters: liters })).toEqual({
        source: 'none',
        drinkable: false,
        reason: '雨水タンクが空のため、飲用の供給を止めています',
      });
    }
  });
});

describe('停電の間の持ち時間', () => {
  /** 手で追える拠点: 100 kWh・止めない 2 kW・冷凍 1 kW・空調 3 kW・店舗 10 kW・発電なし。 */
  const BASE: OutageInput = {
    batteryKwh: 100,
    startSoc: 1,
    tierLoadKw: { 0: 2, 1: 1, 2: 3, 3: 10 },
    pvKwByHour: [0],
    roundTripEfficiency: 0.9,
    maxHours: 200,
  };

  it('★ 段を止めながら減り、止めない負荷が止まった時間を返す', () => {
    const r = simulateOutage(BASE);
    expect(r.hours[0]).toEqual({ hour: 0, socStart: 1, tiers: [0, 1, 2], loadKw: 6, pvKw: 0, socEnd: 0.94 });
    // 残量 0.6 を下回るまで 6 kW、0.3 を下回るまで 3 kW、0.05 を下回るまで 2 kW
    expect(r.survived).toBe(false);
    const stopped = r.hours.find((h) => !h.tiers.includes(0));
    expect(stopped?.hour).toBe(r.criticalHours);
    expect(r.criticalHours).toBe(r.hours.findIndex((h) => h.tiers.length === 0));
    expect(r.hours.every((h) => h.socEnd >= 0)).toBe(true);
    expect(r.hours).toHaveLength(200);
  });

  it('★ 発電で充電し、止めない負荷を最後まで動かせば survived', () => {
    const r = simulateOutage({ ...BASE, maxHours: 48, pvKwByHour: [10] });
    expect(r.survived).toBe(true);
    expect(r.criticalHours).toBe(48);
    expect(r.hours.every((h) => h.socEnd <= 1)).toBe(true);
  });

  it('充電は効率を掛け、放電はそのまま減る', () => {
    const r = simulateOutage({ ...BASE, startSoc: 0.5, maxHours: 1, pvKwByHour: [6] }); // 段 0・1 = 3 kW、余り 3
    expect(r.hours[0]!.socEnd).toBeCloseTo(0.5 + (3 * 0.9) / 100, 10);
    const d = simulateOutage({ ...BASE, startSoc: 0.5, maxHours: 1, pvKwByHour: [1] }); // 不足 2
    expect(d.hours[0]!.socEnd).toBeCloseTo(0.48, 10);
    const even = simulateOutage({ ...BASE, startSoc: 0.5, maxHours: 1, pvKwByHour: [3] }); // ちょうど
    expect(even.hours[0]!.socEnd).toBe(0.5);
  });

  it('発電の並びは日の巡りとして繰り返す', () => {
    const r = simulateOutage({ ...BASE, maxHours: 5, pvKwByHour: [0, 7] });
    expect(r.hours.map((h) => h.pvKw)).toEqual([0, 7, 0, 7, 0]);
  });

  it('始まりから下限を下回っていれば、0 時間', () => {
    const r = simulateOutage({ ...BASE, startSoc: 0.01, maxHours: 3 });
    expect(r.criticalHours).toBe(0);
    expect(r.survived).toBe(false);
  });

  it('★ 一度止まったら、持ち直しても止まった時間を消さない', () => {
    const r = simulateOutage({ ...BASE, startSoc: 0.01, maxHours: 10, pvKwByHour: [50] });
    expect(r.hours[0]!.tiers).toEqual([]);
    expect(r.hours.some((h) => h.tiers.includes(0))).toBe(true);
    expect(r.criticalHours).toBe(0);
  });

  it('入力の誤りは計算せずに断る', () => {
    const bad = (patch: Partial<OutageInput>) => () => simulateOutage({ ...BASE, ...patch });
    expect(bad({ batteryKwh: 0 })).toThrow('batteryKwh: 0 より大きい数で入れてください');
    expect(bad({ startSoc: 1.2 })).toThrow('startSoc: 0〜1 で入れてください');
    expect(bad({ startSoc: -0.1 })).toThrow('startSoc: 0〜1 で入れてください');
    expect(bad({ roundTripEfficiency: 0 })).toThrow('roundTripEfficiency: 0 より大きく 1 以下で入れてください');
    expect(bad({ roundTripEfficiency: 1.1 })).toThrow('roundTripEfficiency: 0 より大きく 1 以下で入れてください');
    expect(bad({ maxHours: 0 })).toThrow('maxHours: 1〜1440 の整数で入れてください');
    expect(bad({ maxHours: 1.5 })).toThrow('maxHours: 1〜1440 の整数で入れてください');
    expect(bad({ maxHours: 1441 })).toThrow('maxHours: 1〜1440 の整数で入れてください');
    expect(bad({ pvKwByHour: [] })).toThrow('pvKwByHour: 1 時間ぶん以上の発電を入れてください');
    expect(bad({ pvKwByHour: [-1] })).toThrow('消費と発電は 0 以上の数で入れてください');
    expect(bad({ tierLoadKw: { 0: Number.NaN, 1: 1, 2: 1, 3: 1 } })).toThrow('消費と発電は 0 以上の数で入れてください');
    expect(bad({ thresholds: { ...T, tier1Soc: 0 } })).toThrow('境目は');
    expect(bad({ batteryKwh: 0, startSoc: 2 })).toThrow(
      'batteryKwh: 0 より大きい数で入れてください / startSoc: 0〜1 で入れてください',
    );
    expect(bad({ pvKwByHour: [-1, -2] })).toThrow(/^入力を確かめてください: 消費と発電は 0 以上の数で入れてください$/);
    expect(bad({ maxHours: 1, startSoc: 0, roundTripEfficiency: 1, batteryKwh: 0.001 })).not.toThrow();
    expect(bad({ maxHours: 1440 })).not.toThrow();
  });

  it('境目を渡せば、その境目で止める', () => {
    const r = simulateOutage({ ...BASE, maxHours: 1, thresholds: { ...T, tier3Soc: 0.9 } });
    expect(r.hours[0]!.tiers).toEqual([0, 1, 2, 3]);
  });
});

describe('1 日の発電の配り方', () => {
  it('★ 夜 (18 時〜翌 6 時) は 0・昼は正・和は 1 日の発電量', () => {
    const p = solarProfileKw(240);
    expect(p).toHaveLength(24);
    for (const h of [0, 3, 5, 18, 21, 23]) expect(p[h], `${h} 時`).toBe(0);
    for (let h = 6; h < 18; h++) expect(p[h]!, `${h} 時`).toBeGreaterThan(0);
    expect(p.reduce((s, v) => s + v, 0)).toBeCloseTo(240, 8);
    // 正午をはさんで左右対称・正午がいちばん多い
    expect(p[11]).toBeCloseTo(p[12]!, 10);
    expect(p[6]).toBeCloseTo(p[17]!, 10);
    expect(Math.max(...p)).toBeCloseTo(p[11]!, 10);
    expect(p[6]!).toBeLessThan(p[11]!);
  });

  it('発電 0 なら全部 0', () => {
    expect(solarProfileKw(0).every((v) => v === 0)).toBe(true);
  });
});
