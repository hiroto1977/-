/**
 * **会計連携 (freee) の取り込みで落ちた取引を数え、落ちたことを述べる。**
 * (2026-09-12 · パス 153)
 *
 * ## なぜ要るか
 *
 * `main/clients/freee.ts` の `aggregateDealsByMonth` は、取引を月次キャッシュフローに
 * まとめるときに **3 通りの黙った取り落とし**をしていた:
 *
 * 1. `issue_date` が `YYYY-MM` として読めない取引を `continue` で**集計から外す**
 * 2. 金額が負の取引を `Math.max(0, amount)` で **0 円として数える**
 * 3. 金額が数として読めない取引が **NaN を伝播させる** —— `jsonFetch` は
 *    `JSON.parse(...) as T` で形を確かめないので `amount` 欠落は `undefined` のまま
 *    届き、`Math.max(0, undefined)` は NaN になる。NaN はその月の net を NaN にし、
 *    営業CF 累計も NaN で書面に出る (パス 98 の家系)。**外して数える** ——
 *    NaN を足し続けるより、外したと言うほうが読める。
 *
 * どれも件数を返さないので、画面も書面も「何件落としたか」を言えなかった。
 * そしてこの月次キャッシュフローは、freee の画面で止まらない:
 *
 * - 経営サマリー → **銀行提出用書面 §6「資金繰り・返済余力」** の 9 行
 *   (営業CF 累計・月次平均・資金ランウェイ・12 か月後の予測残高・予測最低残高・
 *   資金ショート予測・返済余力 DSCR・最悪月の DSCR・返済不足の月数)
 * - 書類スタジオ → **資金繰り表**の「月ごとの入出金」
 *
 * つまり落ちた取引は、**金融機関に渡る数字**を静かに動かしていた。
 *
 * ## 方針 —— 数え方は変えず、落としたことを述べる
 *
 * 集計の値は動かさない (このパスで銀行に渡る数字を黙って変えない)。
 * 変えるのは「言うかどうか」だけ —— パス 121 (`describeUnreadEntries`) と
 * パス 126 (`duplicateOrdersSheetNote`) が同じ形で閉じた。
 *
 * 文面を 1 か所に置くのは、**画面・書面・取り込み注記の 3 面が同じ事実を述べる**
 * ためである (3 面に書き分けると必ずどれかがずれる —— パス 101 の教訓)。
 * `main` と `renderer` はどちらも `shared/*` を import できるので、
 * 型も文面もここが唯一の出所になる。
 */

/** 取り込みで何件をどう扱ったか。**集計の値ではなく、集計の素性**を持つ。 */
export interface FreeeDealIntake {
  /** 応答に入っていた取引の件数 (落とした分を含む)。 */
  readonly deals: number;
  /** 取引日 (`issue_date`) が `YYYY-MM` として読めず、集計から外した件数。 */
  readonly skippedNoDate: number;
  /** 金額が有限の数でなく (欠落・文字列・NaN)、集計から外した件数。 */
  readonly skippedBadAmount: number;
  /** 金額が負で、0 円として数えた件数。 */
  readonly clampedNegative: number;
}

/** 取引を 1 件も読んでいない状態 (同梱の見本・未連携)。 */
export const NO_DEAL_INTAKE: FreeeDealIntake = {
  deals: 0,
  skippedNoDate: 0,
  skippedBadAmount: 0,
  clampedNegative: 0,
};

/** 素直に扱えなかった取引の合計。0 なら述べることは無い。 */
export function dealIntakeDropped(intake: FreeeDealIntake): number {
  return intake.skippedNoDate + intake.skippedBadAmount + intake.clampedNegative;
}

/**
 * 落とした内訳を**文**にする。**0 件の欄は文にしない** ——
 * 「0 件を外しました」は読む人の注意を空に使わせる。
 *
 * 句 (連用形) ではなく**完結した文**を返すのは、並び方で文法が壊れないようにするため。
 * 最初に「…を除き」「…として数え」という連用形の句を並べて末尾に「た集計です」を
 * 足す形で書いたら、**最後に来る句によって文が崩れた** (「除き」+「た」→「除きた」)。
 * 3 つの欄のうちどれが立つかは入力で変わるので、句の活用に末尾を合わせる設計は
 * 組み合わせのどこかで必ず壊れる。文にすれば順も個数も文法に触らない。
 */
function sentences(intake: FreeeDealIntake, wording: {
  readonly skipped: (n: number) => string;
  readonly badAmount: (n: number) => string;
  readonly clamped: (n: number) => string;
}): readonly string[] {
  const out: string[] = [];
  if (intake.skippedNoDate > 0) out.push(wording.skipped(intake.skippedNoDate));
  if (intake.skippedBadAmount > 0) out.push(wording.badAmount(intake.skippedBadAmount));
  if (intake.clampedNegative > 0) out.push(wording.clamped(intake.clampedNegative));
  return out;
}

/**
 * freee の画面に出す注記。落ちた取引が無ければ `null`。
 *
 * 「その分だけ実際と異なります」まで言う —— 件数だけ出して影響を言わないと、
 * 読んだ人は「些細な警告」として読み飛ばす。
 */
export function dealIntakeNote(intake: FreeeDealIntake): string | null {
  const parts = sentences(intake, {
    skipped: (n) => `取引日が読めない ${n} 件は集計から外しました。`,
    badAmount: (n) => `金額が数として読めない ${n} 件は集計から外しました。`,
    clamped: (n) => `金額が負の ${n} 件は 0 円として数えました。`,
  });
  if (parts.length === 0) return null;
  return (
    `会計連携で取得した取引 ${intake.deals} 件のうち、`
    + parts.join('')
    + '下の月次キャッシュフローは、その分だけ実際と異なります。'
  );
}

/**
 * 銀行提出用書面 §6 の断りに足す文。落ちた取引が無ければ `null`。
 *
 * 書面は相手が読む面なので、**何を除き何をどう数えたか**を言い切る形にする
 * (画面の「実際と異なります」という主観ではなく、処理の記述)。
 */
export function dealIntakeSheetNote(intake: FreeeDealIntake): string | null {
  const parts = sentences(intake, {
    skipped: (n) => `取引日が読めない ${n} 件は集計から除いています。`,
    badAmount: (n) => `金額が数として読めない ${n} 件は集計から除いています。`,
    clamped: (n) => `金額が負の ${n} 件は 0 円として数えています。`,
  });
  if (parts.length === 0) return null;
  return `上記の営業キャッシュフローは、会計連携で取得した取引 ${intake.deals} 件から組んだものです。` + parts.join('');
}

/**
 * 書類スタジオ「資金繰り表」の取り込み注記に足す文。落ちた取引が無ければ `null`。
 *
 * 取り込み注記は**これから書類を書く人への指示**なので、確かめる先まで書く。
 */
export function dealIntakeImportNote(intake: FreeeDealIntake): string | null {
  const parts = sentences(intake, {
    skipped: (n) => `取引日が読めない ${n} 件は集計から外れている。`,
    badAmount: (n) => `金額が数として読めない ${n} 件は集計から外れている。`,
    clamped: (n) => `金額が負の ${n} 件は 0 円として数えている。`,
  });
  if (parts.length === 0) return null;
  return (
    `月ごとの入出金は、会計連携で取得した取引 ${intake.deals} 件から組んでいる。`
    + parts.join('')
    + 'その分だけ実際と異なるので、元帳と突き合わせること。'
  );
}
