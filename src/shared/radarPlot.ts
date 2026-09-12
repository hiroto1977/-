/**
 * レーダー図に**何を描き、何を描かないか** —— 画面と書き出しが同じ 1 つを読む。
 * (2026-09-12 · パス 190)
 *
 * ## 実測した欠陥
 *
 * `renderer/pages/TeamRadarPage.tsx` の `RadarChart` は 2026-09-09 (パス 65/66) から
 * この規則を**持っていた**:
 *
 * > **値の無い軸が 1 つでもあれば、その人の多角形は描かない。** `?? 0` を当てると
 * > 欠けた頂点が中心に落ち、「その軸が最低」という幾何になる (パス 59: 0 は座標に
 * > 入ると主張ではなく幾何になる)。閉じた多角形は全軸に頂点を要求するので、部分的に
 * > 描くこともできない —— 描かずに、誰の何が欠けているかを図の外で名指しする。
 *
 * **渡す物の側には届いていなかった。** `main/clients/teamradar.ts` の
 * `renderTeamRadarSvg` は `m.scores[i] ?? 0` を 2 か所 (多角形の頂点と点) で使う。
 * 実測 (720×720・軸 5 本・点が 4 つの人):
 *
 * ```
 *   polygon 360.0,118.0 551.7,307.7 448.9,492.3 300.8,451.5 360.0,370.0
 *   中心     360,370                                        ^^^^^^^^^^^ ここ
 * ```
 *
 * 最後の頂点が**中心そのもの**に落ちている。書き出した SVG は「Canva 用」として
 * 人に渡す物なので、パス 41 (断りが画面にだけ乗り、渡す物には乗らない) と
 * パス 66 (同じ規則を 3 か所のうち 1 か所しか直していなかった) の合わせ技である。
 *
 * ブラウザ版は `web-shim.ts` が `tryGrabSvgFromPage()` で**画面の SVG をそのまま**
 * 出すので既に正しい —— デスクトップ版だけが 2 つ目の実装で外れていた。
 *
 * ## 置き方
 *
 * 判断 (描く / 描かない / 誰の何が欠けたか) はここだけが持つ。座標の計算は
 * 呼ぶ側に置いたまま (画面は React・書き出しは文字列で、同じにはできない)。
 */

import { SCORE_MAX, SCORE_MIN } from './teamRadarState';

/**
 * その値は図に置けるか —— **欠測の判定はここ 1 つ。**
 *
 * 欠測の表れ方は 2 通りある。どちらも「その軸が最低」ではない:
 *
 * | 形 | 出どころ |
 * | --- | --- |
 * | `null` / 配列が軸より短い | 感情レーダー (記録が無い軸) · 古い下書き |
 * | **`0` (= 範囲 1-5 の外)** | 下書きの `finiteOrZero` が数でない値を 0 に倒した分 |
 *
 * 2 つ目が効く —— 評点の欄は `isEvaluatedScore` を見て「—」と刷るのに、
 * **同じ画面の多角形は 0 を中心に置いていた** (2026-09-12 · パス 190)。
 * 同じ欠測について、数字は「無い」と言い、図は「最低」と言っていた。
 */
export function isPlottableScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= SCORE_MIN && v <= SCORE_MAX;
}

/** レーダーに載せる 1 人。**軸の値は欠けうる** (記録が無い軸は `null`)。 */
export interface RadarCandidate {
  readonly id: string;
  readonly name: string;
  readonly scores: readonly (number | null | undefined)[];
}

/** 描ける 1 人 —— 全軸に値が在る。 */
export interface DrawableRadarMember {
  readonly id: string;
  readonly name: string;
  /** 軸と同じ長さ・同じ順。 */
  readonly scores: readonly number[];
}

/** 描けなかった 1 人と、その理由 (どの軸が欠けているか)。 */
export interface OmittedRadarMember {
  readonly id: string;
  readonly name: string;
  /** 欠けている軸の名前 (軸名が空なら「軸 N」)。 */
  readonly missingAxes: readonly string[];
}

export interface RadarPlotPlan {
  readonly drawable: readonly DrawableRadarMember[];
  readonly omitted: readonly OmittedRadarMember[];
}

/** 軸の呼び名。名前が無ければ位置で呼ぶ (無言で落とさない)。 */
export function axisName(axes: readonly string[], index: number): string {
  const label = axes[index];
  return label !== undefined && label.length > 0 ? label : `軸 ${index + 1}`;
}

/**
 * 誰を描き、誰を描かないかを決める。
 *
 * **軸の数が 0 なら誰も描けない** (図そのものが成り立たない) —— 全員を
 * 「欠けている」に入れても言えることが無いので、両方空で返す。
 */
export function planRadarPlot(
  axes: readonly string[],
  members: readonly RadarCandidate[],
): RadarPlotPlan {
  if (axes.length === 0) return { drawable: [], omitted: [] };
  const drawable: DrawableRadarMember[] = [];
  const omitted: OmittedRadarMember[] = [];
  for (const m of members) {
    const scores: number[] = [];
    const missingAxes: string[] = [];
    for (let i = 0; i < axes.length; i++) {
      const v = m.scores[i];
      if (isPlottableScore(v)) scores.push(v);
      else missingAxes.push(axisName(axes, i));
    }
    if (missingAxes.length === 0) drawable.push({ id: m.id, name: m.name, scores });
    else omitted.push({ id: m.id, name: m.name, missingAxes });
  }
  return { drawable, omitted };
}

/**
 * 描かなかった人を名指しする 1 行。全員描けていれば `null`。
 *
 * **これは図の外に出す**（画面でも書き出す SVG でも）—— 図の中で「無い」を
 * 表す形が無いから描かないのであって、黙って落とすためではない。
 */
export function omittedRadarNote(plan: RadarPlotPlan): string | null {
  if (plan.omitted.length === 0) return null;
  const parts = plan.omitted.map((m) => `${m.name} (${m.missingAxes.join('・')})`);
  return `評点が入っていない軸があるため、${plan.omitted.length} 名を図に描いていません: ${parts.join(' / ')}`;
}
