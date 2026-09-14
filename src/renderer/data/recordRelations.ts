/**
 * 保存する記録の**欄と欄の関係**を 1 か所に置く。
 *
 * 記録には 2 つの入口が在る:
 *
 *   1. **画面** —— `hydroponicsLog.ts` の `parseBatch` / `parseControlSettings` などが
 *      人の入力を読んで断る。
 *   2. **復元** —— `collectionShapes.ts` の `COLLECTION_SHAPES` がバックアップ・
 *      古い保存・手で直した JSON を読んで落とす (パス 69 で足した門)。
 *
 * 2026-09-14 の実測 (パス 223) —— 画面の入口は欄と欄の関係を **7 件**断っていたのに、
 * 復元の入口は **0/7** しか見ていなかった (型だけ見る):
 *
 *   hydroponics-batches  定植 ≧ 播種 / 収穫 ≧ 播種 / 収穫 ≧ 定植
 *   hydroponics-control  養液温度・室温・相対湿度・CO₂ の 下限 ≦ 上限
 *
 * 通した結果はもっともらしい嘘になる。播種 2026-09-10 / 定植 2026-08-01 の記録を
 * `batchSchedule` に渡すと **収穫予定 2026-08-11** —— 播種の 1 か月**前** —— を
 * `harvestCountedFrom: 'actual-transplant'` (実績起算) として返していた。
 * 下限 > 上限 の管理値は、書いた本人のコメントどおり「全項目が範囲外」になる。
 *
 * **だから台帳は 1 つにする。** 2 つ書くと必ず片方が古びる (パス 24 / 95 / 220 と
 * 同じ形)。画面も復元もこの台帳を読み、`recordRelations.test.ts` が
 * 「書き手の中に自前の欄どうしの比較が残っていないこと」を両方向から確かめる。
 */

/** 記録 1 件が満たすべき、欄と欄の関係。 */
export interface RecordRelation {
  /** 破れたときに画面へ出す文 (画面の入口が throw する文そのもの)。 */
  readonly message: string;
  /**
   * 満たしていれば true。**型の検査を通った後の記録だけを渡す** ——
   * ここでは型を見ず、関係だけを見る。読めない値は型の検査が先に落とす。
   */
  readonly holds: (rec: Readonly<Record<string, unknown>>) => boolean;
}

/** 日付の前後。どちらかが null (未定) なら関係は成り立つ。 */
function onOrAfter(later: string, earlier: string, message: string): RecordRelation {
  return {
    message,
    holds: (r) => {
      const a = r[later];
      const b = r[earlier];
      if (typeof a !== 'string' || typeof b !== 'string') return true;
      return a >= b;
    },
  };
}

/** 下限 ≦ 上限。どちらかが数でなければ関係は成り立つ (型の検査が先に落とす)。 */
function lowAtMostHigh(low: string, high: string, label: string): RecordRelation {
  return {
    message: `${label}の下限が上限を超えています`,
    holds: (r) => {
      const l = r[low];
      const h = r[high];
      if (typeof l !== 'number' || typeof h !== 'number') return true;
      return l <= h;
    },
  };
}

/**
 * collection ごとの関係。**ここに無い collection は関係を持たない**
 * (`recordRelations.test.ts` が書き手の走査と突き合わせる)。
 */
export const RECORD_RELATIONS: Readonly<Record<string, readonly RecordRelation[]>> = {
  'hydroponics-batches': [
    onOrAfter('transplantedDate', 'sowDate', '定植日が播種日より前になっています'),
    onOrAfter('harvestedDate', 'sowDate', '収穫日が播種日より前になっています'),
    onOrAfter('harvestedDate', 'transplantedDate', '収穫日が定植日より前になっています'),
  ],
  'hydroponics-control': [
    lowAtMostHigh('waterTempLowC', 'waterTempHighC', '養液温度'),
    lowAtMostHigh('airTempLowC', 'airTempHighC', '室温'),
    lowAtMostHigh('humidityLowPct', 'humidityHighPct', '相対湿度'),
    lowAtMostHigh('co2LowPpm', 'co2HighPpm', 'CO₂'),
  ],
};

/**
 * 記録が collection の関係をすべて満たすか。破れていれば**最初の 1 件の文**を返す。
 * 関係を持たない collection は常に null。
 */
export function relationIssue(
  collection: string,
  rec: Readonly<Record<string, unknown>>,
): string | null {
  for (const rel of RECORD_RELATIONS[collection] ?? []) {
    if (!rel.holds(rec)) return rel.message;
  }
  return null;
}

/** 関係を満たしているか (形の検査から呼ぶ真偽版)。 */
export function relationsHold(collection: string, rec: Readonly<Record<string, unknown>>): boolean {
  return relationIssue(collection, rec) === null;
}
