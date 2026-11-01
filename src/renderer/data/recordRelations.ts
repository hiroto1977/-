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
 *
 * ## パス 224 —— 走査は「誰かが書いた綴り」しか見えない
 *
 * パス 223 はここで「関係を持つのは 2 collection だけ」と結論した。その根拠は
 * **綴りの走査** (`より前` / `下限が上限` ほか) で、次の 2 つをまるごと見落としていた:
 *
 *   - **ヘルパー越しの断り** —— `parseBalanceSheet` の `atMost(v, limit, message)` は
 *     文を**引数**で受けるので、`throw new Error('…以下で…')` を探す走査には映らない。
 *     `if (v !== undefined && v > limit)` も、比較が連言の片側なので構文の走査にも映らない。
 *   - **言い回しの違う断り** —— 「人件費は販管費以下で入力してください」
 *     「連続下落(危険)期数は警告期数以上で入力してください」。
 *
 * 実測は**綴りを捨てて振る舞いで数えた** (`writerRestoreParity.test.ts`)。
 * ある欄へ**別の欄の値を借りてきて** (借りた値はそれ自体は正当である)、書き手が断り
 * 復元が通す組を全部拾う —— 16 collection / 借用 496 通りで **35 件**。裁定すると
 * **7 件が関係**で、残り 18 件は「復元は型だけ見る」という意図された差だった:
 *
 *   balance-sheet    現預金・棚卸資産・売上債権 ≦ 流動資産 / 仕入債務 ≦ 流動負債 /
 *                    有利子負債 ≦ 負債合計                              (5 件)
 *   kpi-actuals      人件費 ≦ 販管費                                     (1 件・予算も同じ)
 *   highlight-settings  連続下落 危険 ≧ 警告                             (1 件)
 *
 * 通した記録から出る答え (2026-09-14 実測・流動資産 100 万 / 棚卸 900 万 / 現預金 800 万 /
 * 有利子負債 9,000 万 / 負債合計 150 万):
 *
 *   流動比率 100% ・ **当座比率 −800%** ・ 自己資本比率 75% (健全) ・
 *   **借入金月商倍率 90 ヶ月** ・ **債務償還年数 75 年** ・ CCC 395.4 日
 *
 * 当座比率が負になる企業は無い。しかもこの 3 つは**金融機関へ渡す書面**
 * (`bankSubmission.ts` §4 / §5) に刷られる。
 * `highlight-settings` は逆順だと `severity` の三項が常に `critical` 側へ倒れ、
 * **`warning` の枝が到達不能**になる (2 期の下落が「危険」として出る)。
 *
 * **走査は綴りではなく振る舞いで数える。** 綴りの走査は、書き手が書いた言葉の
 * 範囲しか見えない —— 書き手が言葉を変えれば黙る。
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
 * 内数 ≦ 親項目。どちらかが数でなければ関係は成り立つ (未入力の任意欄を含む)。
 *
 * `parseBalanceSheet` が 2026-09-07 から持っていた `atMost` と同じ判定 ——
 * **message を引数で渡すヘルパーだったので、パス 223 の綴りの走査には 1 件も見えなかった。**
 */
function atMostField(inner: string, outer: string, message: string): RecordRelation {
  return {
    message,
    holds: (r) => {
      const v = r[inner];
      const limit = r[outer];
      if (typeof v !== 'number' || typeof limit !== 'number') return true;
      return v <= limit;
    },
  };
}

/** 内数 ≦ 親項目の合計。合計の項のどれかが数でなければ関係は成り立つ。 */
function atMostSum(inner: string, outers: readonly string[], message: string): RecordRelation {
  return {
    message,
    holds: (r) => {
      const v = r[inner];
      if (typeof v !== 'number') return true;
      let total = 0;
      for (const o of outers) {
        const part = r[o];
        if (typeof part !== 'number') return true;
        total += part;
      }
      return v <= total;
    },
  };
}

/** a ≧ b。どちらかが数でなければ関係は成り立つ。 */
function atLeastField(greater: string, lesser: string, message: string): RecordRelation {
  return {
    message,
    holds: (r) => {
      const a = r[greater];
      const b = r[lesser];
      if (typeof a !== 'number' || typeof b !== 'number') return true;
      return a >= b;
    },
  };
}

/**
 * KPI 実績と予算は**同じ書き手 (`parseKpiActual`) が書く**ので、関係も同じ 1 つの配列から
 * 両方の collection へ渡す (写さない)。
 */
const KPI_RELATIONS: readonly RecordRelation[] = [
  atMostField('laborCost', 'sga', '人件費は販管費以下で入力してください'),
];

/**
 * collection ごとの関係。**ここに無い collection は関係を持たない**
 * (`recordRelations.test.ts` が書き手の走査と突き合わせ、
 * `writerRestoreParity.test.ts` が書き手の振る舞いそのものと突き合わせる)。
 */
export const RECORD_RELATIONS: Readonly<Record<string, readonly RecordRelation[]>> = {
  /*
   * 貸借対照表の**内数 ≦ 親項目** (パス 224)。文は `parseBalanceSheet` が
   * 2026-09-07 から投げていた物そのままで、順序も書き手の順序に合わせる
   * (`relationIssue` は最初に破れた 1 件を返すため)。
   */
  'balance-sheet': [
    atMostField('cash', 'currentAssets', '現預金は流動資産以下で入力してください'),
    atMostField('inventory', 'currentAssets', '棚卸資産は流動資産以下で入力してください'),
    atMostField('accountsReceivable', 'currentAssets', '売上債権は流動資産以下で入力してください'),
    atMostField('accountsPayable', 'currentLiabilities', '仕入債務は流動負債以下で入力してください'),
    atMostSum('interestBearingDebt', ['currentLiabilities', 'fixedLiabilities'], '有利子負債は負債合計以下で入力してください'),
  ],
  'kpi-actuals': KPI_RELATIONS,
  'kpi-budgets': KPI_RELATIONS,
  'highlight-settings': [
    atLeastField('declineCriticalStreak', 'declineWarnStreak', '連続下落(危険)期数は警告期数以上で入力してください'),
  ],
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
