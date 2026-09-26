/**
 * **入口が「N 文字まで」と述べるなら、N 文字ちょうどは通さなければならない。**
 * (2026-09-23 · パス 422)
 *
 * `ceilingUnitCensus` の走査は**綴り**を見る。この検査は**振る舞い**を見る ——
 * 実物の入口を絵文字で境界ちょうどまで埋め、① 境界は通る ② 境界 +1 は断る
 * ③ 断りの文が名乗る数が境界と一致する、を 6 つ全部に掛ける。
 *
 * ## なぜ走査だけでは足りないか
 *
 * 走査は `.length` という**書き方**を探す。`Array.from(x).length` や
 * `[...x].length` は文字を数えるので正しいが綴りは `.length` で、逆に
 * 新しい書き方 (`x.at(-1)` を使った自前の数え方など) は綴りに現れない。
 * **利用者が見るのは書き方ではなく答えである。**
 *
 * ## 標本に絵文字を使う理由
 *
 * 絵文字 (U+1F600) は **1 文字 / 2 コード単位**なので、コード単位で数える実装は
 * ちょうど半分で断る。直す前の実測: 事業名は 60 文字と言いながら **31 文字**で、
 * 項目名は 40 文字と言いながら **21 文字**で断っていた。
 * BMP の文字 (`あ`) では 1 文字 = 1 コード単位なので**この欠陥は見えない** ——
 * だから既存の境界検査は全部緑のままだった。
 */
import { describe, expect, it } from 'vitest';
import {
  parseBusinessUnit,
  BUSINESS_NAME_MAX,
  BUSINESS_CATEGORY_MAX,
  BUSINESS_NOTE_MAX,
} from '../businessUnits';
import { parseCustomMetric, CUSTOM_METRIC_MAX_LABEL, CUSTOM_METRIC_MAX_NOTE } from '../overviewOverrides';
import { parseKpiActual, MAX_KPI_UNIT_CHARS } from '../kpiActuals';
import { countChars } from '../../../shared/inputCeiling';

/** 1 文字 / 2 コード単位。コード単位で数える実装はちょうど半分で断る。 */
const E = '😀';

/** 「境界ちょうどは通り、+1 は断る」を測れる形に畳む。 */
interface Entrance {
  readonly label: string;
  readonly max: number;
  /** 断ったなら理由の文、通ったなら null。 */
  readonly run: (value: string) => string | null;
}

const ENTRANCES: readonly Entrance[] = [
  {
    label: '事業名 (businessUnits)',
    max: BUSINESS_NAME_MAX,
    run: (v) => {
      const r = parseBusinessUnit({ name: v });
      return r.ok ? null : r.reason;
    },
  },
  {
    label: '区分 (businessUnits)',
    max: BUSINESS_CATEGORY_MAX,
    run: (v) => {
      const r = parseBusinessUnit({ name: 'x', category: v });
      return r.ok ? null : r.reason;
    },
  },
  {
    label: 'メモ (businessUnits)',
    max: BUSINESS_NOTE_MAX,
    run: (v) => {
      const r = parseBusinessUnit({ name: 'x', note: v });
      return r.ok ? null : r.reason;
    },
  },
  {
    label: '項目名 (overviewOverrides)',
    max: CUSTOM_METRIC_MAX_LABEL,
    run: (v) => {
      const r = parseCustomMetric({ label: v, unit: 'yen', value: '1' });
      return r.ok ? null : r.reason;
    },
  },
  {
    label: 'メモ (overviewOverrides)',
    max: CUSTOM_METRIC_MAX_NOTE,
    run: (v) => {
      const r = parseCustomMetric({ label: 'x', unit: 'yen', value: '1', note: v });
      return r.ok ? null : r.reason;
    },
  },
  {
    label: '事業名 (kpiActuals)',
    max: MAX_KPI_UNIT_CHARS,
    run: (v) => {
      try {
        parseKpiActual({
          period: '2026-01', unit: v,
          revenue: 1, cogs: 0, advertising: 0, sga: 0, depreciation: 0,
        });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
  },
];

describe('文面が名乗る単位 — 入口は「N 文字」を文字で数える (パス 422)', () => {
  it('★ 走査が空撃ちでない (6 つの入口を実際に呼んでいる)', () => {
    expect(ENTRANCES).toHaveLength(6);
    for (const e of ENTRANCES) expect(e.max, e.label).toBeGreaterThan(0);
  });

  it.each(ENTRANCES.map((e) => [e.label, e] as const))(
    '★ %s: 絵文字で境界ちょうどは通り、+1 は断る',
    (_label, e) => {
      const atMax = E.repeat(e.max);
      // 標本が的に当たっている —— 文字では境界ちょうど、コード単位では倍。
      expect(countChars(atMax), '標本が境界ちょうどでない').toBe(e.max);
      expect(atMax.length, '標本がコード単位で倍になっていない').toBe(e.max * 2);

      expect(e.run(atMax), `${e.label}: ${e.max} 文字ちょうどを断っている`).toBeNull();
      const over = e.run(E.repeat(e.max + 1));
      expect(over, `${e.label}: ${e.max + 1} 文字を通している`).not.toBeNull();
      // 断りの文は、実際に使った天井と同じ数を名乗る (文面と実装が揃っている)。
      expect(over!, `${e.label}: 断りの文が天井の数を名乗っていない`).toContain(String(e.max));
    },
  );

  it('★ BMP の文字では答えが 1 つも変わらない (正当な入力の回帰)', () => {
    for (const e of ENTRANCES) {
      expect(e.run('あ'.repeat(e.max)), `${e.label}: BMP の境界を断っている`).toBeNull();
      expect(e.run('あ'.repeat(e.max + 1)), `${e.label}: BMP の境界 +1 を通している`).not.toBeNull();
    }
  });
});
