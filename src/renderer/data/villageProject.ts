/**
 * 村の 3D 投影 (2026-11-04) —— 依存を足さずに「傾けた地面」を描くための座標変換。
 *
 * 地面は CSS の `perspective(P) rotateX(θ) scale(z)` で傾ける。その上に立つ物 (住人・木・看板) は
 * 傾けず、同じ式で**画面の座標へ投影した点**に置く (立ち絵は常に正面を向く = あつ森の見え方)。
 * 式は CSS の変換行列と同じなので、地面の上の点と立ち絵の足元がずれない。
 *
 * 遠近 P は景色の高さに比例させる (`P = k · H`) —— こうすると投影は**百分率だけ**で閉じ、
 * 景色の大きさを測らなくても位置が決まる (測るのは地面の CSS に渡す P の px だけ)。
 */

/** 地面の傾き (度)。0 = 真上から・90 = 真横。 */
export const TILT_DEG = 52;
/** 遠近 P の景色の高さに対する比 (大きいほど遠近が弱い)。 */
export const PERSPECTIVE_K = 3.5;
/** 地面の拡大 (1 = 景色の幅いっぱい)。 */
export const GROUND_ZOOM = 0.9;
/** 地面全体を下へずらす量 (景色の高さに対する百分率)。 */
export const GROUND_SHIFT_PCT = 6;

export interface Projected {
  /** 景色の左端からの百分率。 */
  readonly x: number;
  /** 景色の上端からの百分率。 */
  readonly y: number;
  /** 手前ほど大きい (1 = 地面の中心の大きさ)。立ち絵の拡大率に使う。 */
  readonly scale: number;
}

/**
 * 地面の座標 (景色に対する百分率・50,50 が中心) を、画面の百分率と拡大率へ投影する。
 * 景色の外 (0 未満・100 超) も投影できる (地面は景色より広い)。
 */
export function projectPoint(xPct: number, yPct: number): Projected {
  const rad = (TILT_DEG * Math.PI) / 180;
  const dy = ((yPct - 50) / 100) * GROUND_ZOOM;
  // 奥行き z' (手前が正) を P で割った値。1 に近づくと地平線 (無限遠) になる。
  const t = (dy * Math.sin(rad)) / PERSPECTIVE_K;
  const s = 1 / (1 - Math.min(t, 0.95));
  return {
    x: 50 + (xPct - 50) * GROUND_ZOOM * s,
    y: 50 + GROUND_SHIFT_PCT + dy * 100 * Math.cos(rad) * s,
    scale: GROUND_ZOOM * s,
  };
}

/** 地面の CSS 変換 (投影と同じ式)。`heightPx` は景色の高さ (px)。 */
export function groundTransform(heightPx: number): string {
  return `perspective(${Math.round(PERSPECTIVE_K * heightPx)}px) rotateX(${TILT_DEG}deg) scale(${GROUND_ZOOM})`;
}
