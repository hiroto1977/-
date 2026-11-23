/**
 * 防災オフグリッド ZEB 拠点の EMS (エネルギー・水マネジメント) の判断 (2026-11-23)。
 *
 * 平時と災害時の運転の状態と、その移り変わり (状態遷移) を純関数で持つ。
 * 実機の制御器 (PCS・遮断器・ポンプの盤) へ指令を出すのではなく、**どの状態のとき何をするか**
 * の決まりを 1 か所に置き、検査で留めるための物である。
 *
 * ## 状態
 *   - `grid` (系統連系): 平時。電気は 敷地内 → 自己託送 → 市場 の順に配る。
 *   - `islanding` (解列中): 系統の停電を検知した直後。系統との遮断器を開き、
 *     蓄電池の PCS を自立運転 (電圧と周波数を自分で作る) へ切り替える途中。
 *   - `island` (自立運転): 系統から切り離して、太陽光と蓄電池だけで動く。
 *   - `blackout` (全停止): 蓄電池が下限まで減って止めた状態。発電が戻れば立ち上げ直す。
 *   - `blackstart` (立ち上げ): 全停止から、止められない負荷だけを先に戻す。
 *   - `resync` (系統へ戻す): 系統が安定して戻ったので、同期を取ってから連系し直す。
 *
 * ## 負荷の段 (止める順番)
 *   段 0 = 止めない (水循環ポンプ・殺菌灯・通信)、段 1 = 冷凍冷蔵、段 2 = 空調、
 *   段 3 = 店舗・EV 充電。自立運転では蓄電池の残量に応じて段 3 → 2 → 1 の順に止める。
 *   **段 0 は残量の下限 (`hardFloorSoc`) まで止めない** —— 水循環を止めると生物ろ過が死に、
 *   立ち上げ直しに数週間かかる (それを守るための拠点である)。
 *
 * ## 水の系統
 *   上水 (飲用) と中水 (循環) は**どの状態でもつながない** (クロスコネクションは作らない)。
 *   災害時に上水の水源を「水道」から「雨水 + RO 膜 + UV 殺菌」へ切り替えるが、
 *   RO か UV が働かないときは**飲用の供給を止める** —— 処理していない水を飲用へ回さない。
 *   中水への補給は上水から吐水口空間 (エアギャップ) を通してだけ行う。
 *
 * **概算・設計の検討用であり、系統連系・保安・消防・水道法の要件を満たす保証ではありません。**
 * 実機の保護協調・単独運転検出・同期投入の条件は、電力会社との協議と設備メーカーの設計で決まります。
 */

export type EmsMode = 'grid' | 'islanding' | 'island' | 'blackout' | 'blackstart' | 'resync';

export const EMS_MODE_LABEL: Readonly<Record<EmsMode, string>> = {
  grid: '系統連系 (平時)',
  islanding: '解列中',
  island: '自立運転',
  blackout: '全停止',
  blackstart: '立ち上げ',
  resync: '系統へ戻す',
};

/** 負荷の段。数字が大きいほど先に止める。 */
export type LoadTier = 0 | 1 | 2 | 3;

export const LOAD_TIERS: readonly LoadTier[] = [0, 1, 2, 3];

export const LOAD_TIER_LABEL: Readonly<Record<LoadTier, string>> = {
  0: '止めない負荷 (水循環ポンプ・殺菌灯・通信)',
  1: '冷凍冷蔵',
  2: '空調',
  3: '店舗・EV 充電',
};

/** 自立運転で負荷を止める残量の境目 (0〜1)。 */
export interface ShedThresholds {
  /** これを下回ったら段 3 を止める。 */
  readonly tier3Soc: number;
  /** これを下回ったら段 2 を止める。 */
  readonly tier2Soc: number;
  /** これを下回ったら段 1 を止める。 */
  readonly tier1Soc: number;
  /** これを下回ったら段 0 も止めて全停止にする (電池を守る下限)。 */
  readonly hardFloorSoc: number;
}

/**
 * 既定の境目。**店舗と EV は自立運転に入った時点で止める** (残量 100% でも)。
 * 防災拠点の蓄電池は、停電がいつまで続くか分からない間の水と食料のためにあるので、
 * 売上のための負荷に使わない。
 */
export const DEFAULT_SHED_THRESHOLDS: ShedThresholds = {
  tier3Soc: 1.01,
  tier2Soc: 0.6,
  tier1Soc: 0.3,
  hardFloorSoc: 0.05,
};

/** 境目の並びが正しいか (下限 < 段 1 < 段 2 ≦ 段 3)。誤りを返す (空なら正しい)。 */
export function shedThresholdErrors(t: ShedThresholds): string[] {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(t)) {
    if (!Number.isFinite(v) || v < 0) errors.push(`${k}: 0 以上の数で入れてください`);
  }
  if (!(t.hardFloorSoc < t.tier1Soc && t.tier1Soc < t.tier2Soc && t.tier2Soc <= t.tier3Soc)) {
    errors.push('境目は 下限 < 段 1 < 段 2 ≦ 段 3 の順に並べてください');
  }
  return errors;
}

/**
 * 自立運転で、残量 `soc` のときに動かしてよい段。
 * 下限を下回れば空 (全停止)。段 0 は下限まで必ず残る。
 */
export function activeTiers(soc: number, t: ShedThresholds = DEFAULT_SHED_THRESHOLDS): LoadTier[] {
  if (soc < t.hardFloorSoc) return [];
  const on: LoadTier[] = [0];
  if (soc >= t.tier1Soc) on.push(1);
  if (soc >= t.tier2Soc) on.push(2);
  if (soc >= t.tier3Soc) on.push(3);
  return on;
}

/* ─────────────────────────  状態の移り変わり  ───────────────────────── */

/** EMS が受ける出来事。 */
export type EmsEvent =
  | { readonly kind: 'grid-lost' }
  /** 遮断器が開き、PCS が自立運転で電圧を作れた (解列の完了)。 */
  | { readonly kind: 'island-formed' }
  /** 解列に失敗した (遮断器が開かない・PCS が立たない)。 */
  | { readonly kind: 'island-failed' }
  /** 系統が戻り、決めた時間ずっと安定している。 */
  | { readonly kind: 'grid-stable' }
  /** 同期が取れて連系し直した。 */
  | { readonly kind: 'resynced' }
  /** 蓄電池の残量の報告 (0〜1)。 */
  | { readonly kind: 'soc'; readonly soc: number }
  /** 発電が戻り、止めない負荷を賄える見込みが立った。 */
  | { readonly kind: 'pv-available' };

/** 状態が変わるときに盤へ出す指令。 */
export type EmsAction =
  | 'open-grid-breaker'
  | 'close-grid-breaker'
  | 'pcs-grid-forming'
  | 'pcs-grid-following'
  | 'potable-source-rain-ro-uv'
  | 'potable-source-municipal'
  | 'toilet-compost'
  | 'toilet-sewer'
  | 'shed-all-but-critical'
  | 'restore-critical'
  | 'stop-all-loads'
  | 'alert-operator';

export interface EmsTransition {
  readonly mode: EmsMode;
  readonly actions: readonly EmsAction[];
}

/**
 * 今の状態と出来事から、次の状態と出す指令を決める。
 * その状態で意味を持たない出来事は無視する (状態も指令も変えない) —— 例えば平時の `grid-stable`。
 */
export function nextEmsState(
  mode: EmsMode,
  event: EmsEvent,
  t: ShedThresholds = DEFAULT_SHED_THRESHOLDS,
): EmsTransition {
  const stay: EmsTransition = { mode, actions: [] };
  switch (mode) {
    case 'grid':
      return event.kind === 'grid-lost'
        ? {
            mode: 'islanding',
            // 遮断器を先に開いてから PCS に電圧を作らせる (系統へ逆に送電しない —— 作業員の感電を防ぐ)。
            actions: ['open-grid-breaker', 'pcs-grid-forming', 'potable-source-rain-ro-uv', 'toilet-compost'],
          }
        : stay;
    case 'islanding':
      if (event.kind === 'island-formed') return { mode: 'island', actions: [] };
      if (event.kind === 'island-failed') return { mode: 'blackout', actions: ['stop-all-loads', 'alert-operator'] };
      return stay;
    case 'island':
      if (event.kind === 'soc') {
        return event.soc < t.hardFloorSoc ? { mode: 'blackout', actions: ['stop-all-loads', 'alert-operator'] } : stay;
      }
      if (event.kind === 'grid-stable') return { mode: 'resync', actions: [] };
      return stay;
    case 'blackout':
      return event.kind === 'pv-available'
        ? { mode: 'blackstart', actions: ['pcs-grid-forming', 'restore-critical'] }
        : event.kind === 'grid-stable'
          ? { mode: 'resync', actions: [] }
          : stay;
    case 'blackstart':
      // 立ち上げ直したら、まず止めない負荷だけで自立運転へ (ほかの段は残量が戻ってから段ごとに戻す)。
      return event.kind === 'island-formed' ? { mode: 'island', actions: ['shed-all-but-critical'] } : stay;
    case 'resync':
      return event.kind === 'resynced'
        ? {
            mode: 'grid',
            actions: ['close-grid-breaker', 'pcs-grid-following', 'potable-source-municipal', 'toilet-sewer'],
          }
        : event.kind === 'grid-lost'
          ? { mode: 'island', actions: [] }
          : stay;
  }
}

/* ─────────────────────────  水の系統  ───────────────────────── */

export type PotableSource = 'municipal' | 'rain-ro-uv' | 'none';

export interface PotableStatus {
  readonly source: PotableSource;
  /** 飲用を出してよいか。 */
  readonly drinkable: boolean;
  readonly reason: string;
}

/**
 * 飲用 (上水) の供給元を決める。
 * 平時は水道。災害時は雨水を RO と UV で処理した物だけ —— どちらかが働かなければ飲用は止める。
 * **中水 (循環) を飲用へ回す選択肢は持たない** (型にも無い)。
 */
export function potableStatus(
  mode: EmsMode,
  equipment: { readonly roOk: boolean; readonly uvOk: boolean; readonly rainTankLiters: number },
): PotableStatus {
  if (mode === 'grid' || mode === 'resync') return { source: 'municipal', drinkable: true, reason: '水道から供給' };
  if (!equipment.roOk || !equipment.uvOk) {
    return { source: 'none', drinkable: false, reason: 'RO 膜か UV 殺菌が働かないため、飲用の供給を止めています' };
  }
  if (!(equipment.rainTankLiters > 0)) {
    return { source: 'none', drinkable: false, reason: '雨水タンクが空のため、飲用の供給を止めています' };
  }
  return { source: 'rain-ro-uv', drinkable: true, reason: '雨水を RO 膜と UV 殺菌で処理して供給' };
}

/* ─────────────────────────  停電の間の持ち時間  ───────────────────────── */

export interface OutageInput {
  /** 蓄電池の容量 (kWh)。 */
  readonly batteryKwh: number;
  /** 停電の始まりの残量 (0〜1)。 */
  readonly startSoc: number;
  /** 段ごとの消費 (kW)。段 0 → 段 3 の順。 */
  readonly tierLoadKw: Readonly<Record<LoadTier, number>>;
  /** 1 時間ごとの発電 (kW)。足りない時間は最後まで繰り返す (日の巡り)。 */
  readonly pvKwByHour: readonly number[];
  /** 蓄電池の往復効率 (0〜1)。充電の損として掛ける。 */
  readonly roundTripEfficiency: number;
  /** 何時間まで計算するか。 */
  readonly maxHours: number;
  readonly thresholds?: ShedThresholds;
}

export interface OutageHour {
  readonly hour: number;
  readonly socStart: number;
  readonly tiers: readonly LoadTier[];
  readonly loadKw: number;
  readonly pvKw: number;
  readonly socEnd: number;
}

export interface OutageResult {
  readonly hours: readonly OutageHour[];
  /** 止めない負荷 (段 0) を動かし続けられた時間。最後まで動けば `maxHours`。 */
  readonly criticalHours: number;
  /** 最後まで止めない負荷が止まらなかったか。 */
  readonly survived: boolean;
}

/**
 * 停電の間、1 時間ずつ残量と止める段を追う。
 * 段 0 が止まった最初の時間までを `criticalHours` として返す (発電で持ち直しても、止まった事実は消さない)。
 */
export function simulateOutage(input: OutageInput): OutageResult {
  const t = input.thresholds ?? DEFAULT_SHED_THRESHOLDS;
  const errors = [...shedThresholdErrors(t)];
  if (!(input.batteryKwh > 0)) errors.push('batteryKwh: 0 より大きい数で入れてください');
  if (!(input.startSoc >= 0 && input.startSoc <= 1)) errors.push('startSoc: 0〜1 で入れてください');
  if (!(input.roundTripEfficiency > 0 && input.roundTripEfficiency <= 1)) errors.push('roundTripEfficiency: 0 より大きく 1 以下で入れてください');
  if (!(Number.isInteger(input.maxHours) && input.maxHours >= 1 && input.maxHours <= 24 * 60)) errors.push('maxHours: 1〜1440 の整数で入れてください');
  if (input.pvKwByHour.length === 0) errors.push('pvKwByHour: 1 時間ぶん以上の発電を入れてください');
  for (const v of [...Object.values(input.tierLoadKw), ...input.pvKwByHour]) {
    if (!Number.isFinite(v) || v < 0) {
      errors.push('消費と発電は 0 以上の数で入れてください');
      break;
    }
  }
  if (errors.length > 0) throw new Error(`入力を確かめてください: ${errors.join(' / ')}`);

  const hours: OutageHour[] = [];
  let soc = input.startSoc;
  let criticalHours: number | null = null;
  for (let hour = 0; hour < input.maxHours; hour++) {
    // 長さ 0 は上で断っているので、添字は必ず範囲の中に在る。
    const pvKw = input.pvKwByHour[hour % input.pvKwByHour.length]!;
    const tiers = activeTiers(soc, t);
    if (!tiers.includes(0) && criticalHours === null) criticalHours = hour;
    const loadKw = tiers.reduce((sum: number, tier) => sum + input.tierLoadKw[tier], 0);
    const net = pvKw - loadKw;
    // 余り (正) は効率を掛けて充電し、不足 (負) はそのまま減らす —— 正なら net·η ≦ net、負なら net ≦ net·η。
    const delta = Math.min(net, net * input.roundTripEfficiency);
    const socEnd = Math.min(1, Math.max(0, soc + delta / input.batteryKwh));
    hours.push({ hour, socStart: soc, tiers, loadKw, pvKw, socEnd });
    soc = socEnd;
  }
  return { hours, criticalHours: criticalHours ?? input.maxHours, survived: criticalHours === null };
}

/**
 * 1 日の発電量 (kWh) を、日の出 6 時〜日の入り 18 時の山形 (正弦) に配った 24 時間の発電 (kW)。
 * 夜は 0。和は `dailyKwh` に一致する (配り方の誤差を除く)。停電の持ち時間を見るための目安で、
 * 季節・天気・設置面の向きは入れていない。
 */
export function solarProfileKw(dailyKwh: number): number[] {
  const weights = Array.from({ length: 24 }, (_, h) => Math.max(0, Math.sin(((h + 0.5 - 6) / 12) * Math.PI)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (dailyKwh * w) / total);
}
