/**
 * 額面の逆算 `solveGrossForTakeHomeChecked` の**省略したときの既定**を留める (パス 502)。
 *
 * 引数 `withCare` (40〜64 歳の介護保険料を上乗せするか) の既定は `false`。既存の検査は
 * どれも `false` / `true` を**明示して**呼ぶので、既定そのものを `true` へ変えても緑だった。
 * 既定が `true` になると、介護保険の対象でない人に「介護保険料込み」の額面を答える
 * (同じ手取りに必要な額面が大きく出る)。
 *
 * 年分は固定する (社会保険料・基礎控除が年分で動くため)。
 */
import { describe, expect, it } from 'vitest';
import { solveGrossForTakeHomeChecked } from '../welfareScheme';

const TARGET = 300_000;
const YEAR = 2026;

describe('solveGrossForTakeHomeChecked — withCare を省くと介護保険なしで解く', () => {
  it('省略した結果は false を明示した結果と完全に一致し、true とは違う', () => {
    const omitted = solveGrossForTakeHomeChecked(TARGET, undefined, undefined, YEAR);
    const off = solveGrossForTakeHomeChecked(TARGET, false, undefined, YEAR);
    const on = solveGrossForTakeHomeChecked(TARGET, true, undefined, YEAR);
    expect(omitted).toEqual(off);
    // 対照: 介護保険料が上乗せされる分、同じ手取りに必要な額面は大きい (= この検査は空虚ではない)。
    expect(on.gross).toBeGreaterThan(off.gross);
    expect(omitted).not.toEqual(on);
  });
});
