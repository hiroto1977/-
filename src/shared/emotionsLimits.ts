/**
 * `emotions` の action が受け取る入力の上限 —— **両ビルドで 1 つだけ持つ。**
 *
 * ## なぜ要るか (2026-08-23)
 *
 * ブラウザ版 (`web-shim.ts`) は上限を持っていたのに、**デスクトップ版
 * (`main/clients/emotions.ts`) が持っていなかった**:
 *
 * ```
 *              analyze-text の text      log-mood の note
 *   ブラウザ   5000 字で断る              ★ 実は素通し (下記)
 *   main       空でなければ通す           `String(note ?? '')` —— 検査なし
 * ```
 *
 * **向きが逆である。** `main` は IPC の**信頼境界**で、レンダラーから来た
 * payload を最初に受ける側なのに、そこだけ上限が無かった。
 *
 * (テンプレートの `validateParams` は逆に main だけが厳しく、それは
 * 正しい —— あちらは main がファイル書き出しの手前に立っているため。
 * こちらは「境界の側が緩い」ので直す。)
 *
 * ## ★ 訂正 (同日・後から実測)
 *
 * 上の表の「ブラウザ 2000 字で断る」は **間違い**だった。ブラウザ版で
 * 上限を持っていたのは `analyze-text` だけで、`log-mood` の note は
 * `data/emotionsWeb.ts` の `logMood` が `String(note ?? '')` するだけの
 * **素通し**だった —— 5 万字を渡すと 5 万字そのまま localStorage に載る。
 * つまり main 側の修正は**片側の思い込みに基づいて**入っていた。
 *
 * ブラウザ版の保存先は localStorage で、容量は**オリジン全体で共有**する。
 * `MAX_MOODS` は件数を抑えるが 1 件の大きさは抑えないので、青天井だと
 * 保管庫のメタや proxy 設定といった**別機能の書き込みが先に落ちる**。
 *
 * 現在は両方の `logMood` が `MAX_MOOD_NOTE_CHARS` を見る。ずれは
 * `emotionsLogMoodParity.test.ts` が**振る舞いで**留めている ——
 * 「どちらが持っているか」を注記で語らせない。
 *
 * ## 何が起きうるか
 *
 * - `text` は Anthropic の要求本文へそのまま載る。**有料 API へ任意長を
 *   送れる**うえ、main プロセスの記憶にも載る
 * - `note` は気分ログとして**保存される**。上限が無いと保存先が
 *   際限なく育つ
 *
 * どちらも「乗っ取られたレンダラー」を前提にした話で、通常操作では
 * 起きない。それでもこのリポジトリは他の action で一様に上限を置いており、
 * ここだけ抜けていた。
 *
 * ## 値
 *
 * ブラウザ版が既に使っていた値をそのまま採る。**厳しい側へ寄せるのではなく、
 * 既に運用されている側へ揃える** —— 利用者から見た挙動を変えないため。
 */

/** `analyze-text` が受け取る本文の上限。 */
export const MAX_ANALYZE_TEXT_CHARS = 5000;

/** `log-mood` のメモの上限。 */
export const MAX_MOOD_NOTE_CHARS = 2000;

/*
 * ## 保存件数の上限 (2026-08-25 に寄せた)
 *
 * この 2 つは **`main/clients/emotions.ts` と `renderer/data/emotionsWeb.ts` の
 * 両方で `const` として宣言されていた** —— 同じ名前・同じ値が 2 か所にある形。
 *
 * `dualBuildDecisions.test.ts` の検出器は **export された関数名**の積集合を
 * 見るので、**モジュール直下の `const` は見えない**。上の note/text の上限を
 * ここへ寄せたときも、この 2 つは残っていた。
 *
 * ずれると「どちらのビルドで記録したかで、残る件数が変わる」。
 * ブラウザ版の保存先は localStorage で**容量はオリジン全体で共有**するので、
 * 件数の上限は他機能の書き込みが落ちるかどうかにも効く。
 */

/** 気分ログの保持件数 (古いものから捨てる)。 */
export const MAX_MOODS = 365;

/** 分析結果の保持件数 (新しいものを先頭に積む)。 */
export const MAX_ANALYSES = 50;

/*
 * ## 一覧から本文を組む所の天井 (2026-09-12 · パス 156)
 *
 * パス 112 は「AI への入力の天井を、画面が共有定数から読む」で閉じたつもりだった。
 * 実測すると、**`MAX_ANALYZE_TEXT_CHARS` を読んでいる画面は `EmotionsPage` 1 つだけ**で、
 * `analyze-text` を呼ぶ画面は 3 つ在った:
 *
 * | 画面 | 本文の作り | 天井 |
 * |---|---|---|
 * | `EmotionsPage` | 利用者が打つ textarea | `maxLength={MAX_ANALYZE_TEXT_CHARS}` |
 * | `GmailPage` | 受信スレッドの件名と送信者を全件 join | **無し** |
 * | `SlackPage` | チャンネル名と purpose を全件 join | **無し** |
 *
 * 後ろ 2 つは**利用者が長さを決められない** —— スレッドやチャンネルの数で決まる。
 * 超えると `analyze-text` は断る (`text exceeds 5000 chars`) が、それは英語の
 * 生の例外文が alert に出るだけで、**利用者に打てる手が無い** (一覧を減らせない)。
 * パス 66 の形 (「3 か所のうち 1 か所しか直していなかった」) である。
 *
 * ## 方針 —— 先頭から入るぶんだけ送り、何件外したかを**押す前に**言う
 *
 * 途中を飛ばして詰めることはしない。分析が読むのは一覧の**先頭からの連続した一部**で、
 * 間に穴が開くと「受信トレイを見た」という主張が実物と違う物になる。
 * パス 105 (助言が銘柄を黙って 25 件に切っていた) と同じ扱い ——
 * **切るのはよいが、切ったと言う。**
 */

/** 一覧から組んだ本文と、その素性 (何件入って何件外れたか)。 */
export interface AnalyzeTextBatch {
  /** 送る本文 (行を `\n` で連結)。入る行が無ければ空文字。 */
  readonly text: string;
  /** 先頭から入った行数。 */
  readonly included: number;
  /** 入らなかった行数 (末尾側)。 */
  readonly omitted: number;
}

/**
 * 行の一覧を、上限に収まる本文へ詰める。**先頭から連続して**入れ、入らなくなったら止める。
 *
 * 1 行目だけで上限を超える場合は `included: 0` / `text: ''` を返す ——
 * その行を切って送るより、**送れないと言う**方が正しい (切った本文を分析させると
 * 途中で切れた件名が分析結果に混ざる)。呼び出し側は `included === 0` で押せなくする。
 */
export function packAnalyzeText(
  rows: readonly string[],
  max: number = MAX_ANALYZE_TEXT_CHARS,
): AnalyzeTextBatch {
  const taken: string[] = [];
  let length = 0;
  for (const row of rows) {
    // 2 行目以降は連結の `\n` も数える。ここを忘れると行数ぶんだけ上限を超える。
    const cost = row.length + (taken.length === 0 ? 0 : 1);
    if (length + cost > max) break;
    taken.push(row);
    length += cost;
  }
  return { text: taken.join('\n'), included: taken.length, omitted: rows.length - taken.length };
}

/**
 * 押す前に画面へ出す断り。全部入るなら `null` (述べることが無い)。
 *
 * **件数と理由の両方**を言う —— 「先頭 12 件だけ送ります」だけでは、
 * なぜそうなるのかが読めない。
 */
export function analyzeBatchNote(
  batch: AnalyzeTextBatch,
  max: number = MAX_ANALYZE_TEXT_CHARS,
): string | null {
  if (batch.omitted === 0) return null;
  const total = batch.included + batch.omitted;
  if (batch.included === 0) {
    return `1 件目だけで ${max} 字を超えるため、分析に送れる行がありません。`;
  }
  return (
    `${total} 件のうち、先頭 ${batch.included} 件だけを分析に送ります`
    + ` (1 回に送れるのは ${max} 字までのため、残り ${batch.omitted} 件は含みません)。`
  );
}
