import { describe, expect, it } from 'vitest';
import { rereadModule } from './rereadModule';
// 依存先 (./num / ./taxCalc) を先頭で読み込んでおく。検査の中で初めて評価すると、
// 依存先の直下の値まで「その検査が覆った」と数えられる (rereadModule.ts の docblock・パス 495)。
import '../funding';

/**
 * **資金調達レーダーのモジュール直下の値を、読み直して字面で留める** (パス 502)。
 *
 * `FUNDING_KINDS` (レーダーの 6 軸) と `NO_SECURED_FUNDING_NOTE` (確定が 0 のときの
 * 断り書き) は**モジュール直下で 1 度だけ評価される値**で、これを使う他の検査は
 * 値そのものを主張せず**定数どうしを比べていた**:
 *
 *   - `expect(agg.map((a) => a.kind)).toEqual([...FUNDING_KINDS])` —— 表が `[]` に
 *     なれば両辺が `[]` で通る
 *   - `unavailableNote: NO_SECURED_FUNDING_NOTE` —— 文が `''` になれば両辺が `''` で通る
 *
 * しかも他の検査は先頭の静的 import で値を読むので、変異体は届かない。web-shim を
 * 検査の中で読み込む検査 (`advisorKeySlotParity` ほか) はこのモジュールを評価し直して
 * 値を**覆う**が、値を主張しないので変異体は生き残っていた (Stryker の static な生存)。
 * 期待値を**字面で**書き、`rereadModule` (対象だけを読み直す) で評価し直した値を
 * 比べると、直下の値を書き換える変異体がここで落ちる。
 */
const fresh = () => rereadModule<typeof import('../funding')>(import.meta.url, '../funding');

const NO_SECURED_NOTE =
  '確定した調達がまだ無いため、資金調達の質スコアは算定していません（返済不要比率・税引後比率はいずれも確定総額で割る指標です）。申請中・予定の案件はパイプライン総額に出ています。';

describe('資金調達レーダー — モジュール直下の値 (読み直して字面で留める)', () => {
  it('★ 資金調達の種別は 6 つで、順序はレーダーの軸の並びのまま (期待値は字面で書く)', async () => {
    const mod = await fresh();
    expect(mod.FUNDING_KINDS).toEqual([
      'subsidy',
      'grant',
      'loan',
      'jfc',
      'benefit',
      'crowdfunding',
    ]);
    // 集計は同じ表の順序で軸を返す (読み直した側の関数で観測する)。
    expect(mod.aggregateByKind([]).map((a) => a.kind)).toEqual([
      'subsidy',
      'grant',
      'loan',
      'jfc',
      'benefit',
      'crowdfunding',
    ]);
  });

  it('★ 確定した調達が無いときの断り書きを字面で留める (質スコアも同じ文を返す)', async () => {
    const mod = await fresh();
    expect(mod.NO_SECURED_FUNDING_NOTE).toBe(NO_SECURED_NOTE);
    // 利用者に届くのは質スコアの `unavailableNote` (確定 0 件の集計 → 算定不能)。
    expect(mod.fundingQualityScore(mod.summarize([])).unavailableNote).toBe(NO_SECURED_NOTE);
  });

  it('★ 特定収入の調整が要らない基準 (5%) と実効税率の既定 (30%) は数のまま', async () => {
    const mod = await fresh();
    expect(mod.SPECIFIED_INCOME_THRESHOLD).toBe(0.05);
    expect(mod.DEFAULT_EFFECTIVE_TAX_RATE).toBe(0.3);
  });
});
