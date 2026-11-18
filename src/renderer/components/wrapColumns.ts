/**
 * **広い枠では N 列、狭い枠では折り返す**格子の列の指定 (2026-11-18)。
 *
 * `repeat(4, 1fr)` のような固定の列数は、スマホ幅では 1 列が中身より細くなり、中身が枠の右へ出る
 * (横へ動かさないと見えない)。ここが返す指定は、1 列の幅が `minPx` を割るところで列を減らす:
 *
 * - 枠が広い間は、1 列の最小幅が「枠の 1/N」なので、ちょうど N 列 (それまでと同じ並び)。
 * - 1/N が `minPx` を割ると、最小幅は `minPx` になり、入るだけの列数へ折り返す。
 * - 枠が `minPx` より細ければ 1 列 (`min(100%, …)`)。
 *
 * 空の列は詰めない (`auto-fill`) —— 子が N より少ない格子の見た目を、それまでと変えないため。
 */
export function wrapColumns(columns: number, minPx: number, gapPx = 12): string {
  const share = `calc((100% - ${(columns - 1) * gapPx}px) / ${columns})`;
  return `repeat(auto-fill, minmax(min(100%, max(${minPx}px, ${share})), 1fr))`;
}
