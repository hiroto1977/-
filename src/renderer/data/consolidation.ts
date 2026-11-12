/**
 * 連結（合算）でどの集合を足すかを決める。
 *
 * 事業間比較には利用者の実績と同梱サンプルが同居する。棒グラフは 1 本ずつ
 * ラベルが付くので並べてよいが、連結は **すべてを 1 つの数に潰す**。
 * 実績とサンプルを足した合計はどちらの会社の数でもないので、出所で分ける。
 */

/** 合算対象と、それがサンプルの集合かどうか。 */
export interface ConsolidationScope<T> {
  readonly parts: readonly T[];
  /** true なら合算したのはサンプル。ラベルに必ず出すこと。 */
  readonly isSample: boolean;
}

/**
 * 合算する集合を選ぶ。
 *
 * 実績が 1 件でもあれば実績だけ、1 件も無ければ全部 (= すべてサンプル) を返す。
 * 「実績が無いときに空を返す」ようにはしない — 合算対象が消えると画面から
 * 連結ビューそのものが無くなり、サンプルしか無い状態を説明できなくなる。
 */
export function consolidationScope<T>(
  items: readonly T[],
  isSample: (item: T) => boolean,
): ConsolidationScope<T> {
  const real = items.filter((i) => !isSample(i));
  if (real.length > 0) return { parts: real, isSample: false };
  return { parts: items, isSample: true };
}

/**
 * 連結ビューの見出し。合算した集合と件数を必ず書く。
 *
 * 「全事業合算」のように出所を伏せた見出しにしない — 読む人はそれを
 * 自分の会社の数として受け取る。
 */
export function consolidationLabel(count: number, isSample: boolean): string {
  return isSample ? `連結（サンプル ${count} 件の合算）` : `連結（自分の事業 ${count} 件の合算）`;
}
