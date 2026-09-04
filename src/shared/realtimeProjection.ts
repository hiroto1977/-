/**
 * 時刻から決まる値 —— **本当に毎秒動くもの**だけをここに置く。
 *
 * ## なぜ純粋関数として切り出すのか
 *
 * 「秒単位でリアルタイム更新」を素朴に作ると、1 秒ごとに同じ計算を回して
 * 同じ数字を描き直すだけになる。画面は「動いている風」に見えるが、
 * **値は 1 つも変わっていない**。それは更新ではなく点滅である。
 *
 * 本当に毎秒変わるのは「時刻が入っている値」だけ ——
 * 年初からの経過、その経過に応じた発生額、実績から引いた年換算のペース、
 * 着地見込み。ここはその計算だけを持ち、画面も DOM も触らない。
 *
 * 元データ (売上・KPI・フォーム入力) の再取得は別の話で、そちらを毎秒
 * 叩くと有料 API の上限に当たり利用者の鍵を焼く。**描画の刻みと取得の
 * 刻みは分ける** —— この 2 つを混ぜないために、ここは時刻しか受け取らない。
 *
 * 税務試算 (`#tax`) と経営サマリー (`#overview`) の両方が使う。同じ判断を
 * 2 か所に書くと必ずずれる (このリポジトリで何度も出た形)。
 */

/** 1 年の長さ (ms)。うるう年があるので実測する。 */
function yearSpanMs(year: number): number {
  return Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1);
}

/** その年の 1 月 1 日 00:00:00 (ローカル) からの経過 (ms)。 */
function elapsedInYearMs(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  return now.getTime() - start.getTime();
}

/**
 * 経過と年の長さから割合を出し、0..1 に留める。
 *
 * **切り出してあるのは、留める側を測れるようにするため。**
 * `yearProgress` 経由では `Date` の年が必ず一致するので溢れが作れず、
 * 「1 を超えたら 1 にする」枝はどのテストからも到達しない ——
 * 到達しない守りは、消しても誰も気付かない (このリポジトリで
 * `proxy.ts` の到達しない分岐を消した前例がある)。
 *
 * 溢れは現実に起きる: `yearSpanMs` は UTC で計るが `elapsedInYearMs` は
 * ローカルの元日から計るので、**秋に時計が 1 時間戻る地域**では年末の
 * 経過が年の長さを 1 時間ぶん上回る。そのまま年額に掛けると見込みが
 * 年額を超える。
 */
export function clampYearRatio(elapsedMs: number, spanMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(spanMs) || spanMs <= 0) return 0;
  const ratio = elapsedMs / spanMs;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * 年内の経過割合 (0 以上 1 以下)。
 *
 * 元日の 0 時ちょうどは 0、大晦日の 24 時直前は 1 に限りなく近い。
 */
export function yearProgress(now: Date): number {
  return clampYearRatio(elapsedInYearMs(now), yearSpanMs(now.getFullYear()));
}

/**
 * 年額のうち「今ここまでに発生した分」。
 *
 * 税や手取りは年額で出るが、実際には日々積み上がっている。その積み上がりを
 * 秒の粒度で見せるための値で、**毎秒はっきり増える**。
 */
export function accruedSoFar(annual: number, now: Date): number {
  if (!Number.isFinite(annual)) return 0;
  return annual * yearProgress(now);
}

/** 年額を 1 秒あたりに割った額。「いま何円ずつ増えているか」。 */
export function perSecond(annual: number, now: Date): number {
  if (!Number.isFinite(annual)) return 0;
  const span = yearSpanMs(now.getFullYear());
  if (span <= 0) return 0;
  return annual / (span / 1000);
}

/**
 * 年内の残り (ms)。**0 を下回らない** —— 上と同じ理由 (時計が戻る地域では
 * 年末に経過が年の長さを超えうる) なので、留める側を `clampRemaining` として
 * 切り出し、測れるようにしてある。
 */
export function clampRemaining(spanMs: number, elapsedMs: number): number {
  if (!Number.isFinite(spanMs) || !Number.isFinite(elapsedMs)) return 0;
  return Math.max(0, spanMs - elapsedMs);
}

export function remainingInYearMs(now: Date): number {
  return clampRemaining(yearSpanMs(now.getFullYear()), elapsedInYearMs(now));
}

/**
 * 実績と経過割合から年換算のペースを出す。
 *
 * 経過が極端に小さいうち (元日の未明など) は、わずかな実績が莫大な年換算に
 * 化ける。**割り算の前に下限を置く** —— `minProgress` 未満なら年換算は
 * 出さず `null` を返し、呼び出し側が「まだ出せない」と表示できるようにする。
 * 0 除算を黙って Infinity にして画面へ流すより、出さないほうが正しい。
 */
export function annualizedPace(actual: number, now: Date, minProgress = 0.01): number | null {
  if (!Number.isFinite(actual)) return null;
  const p = yearProgress(now);
  if (p < minProgress || p <= 0) return null;
  return actual / p;
}

/** 経過 ms を `H:MM:SS` に整える (時は桁を詰めない)。 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}`;
}

/** 残り日数 (切り上げ)。「あと何日」の表示用。 */
export function remainingDays(now: Date): number {
  return Math.ceil(remainingInYearMs(now) / 86_400_000);
}
