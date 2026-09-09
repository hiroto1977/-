/**
 * チャットボット「手取り計算スキル」— 純ロジック・IO なし。
 *
 * 「額面40万の手取りは？」「手取り30万に必要な額面は？」のような自然文を
 * 検出し、既存の税・社保純モジュール (`shared/welfareScheme.ts` の
 * monthlyCompensation / solveGrossForTakeHome) でその場で概算する。
 * 計算は純関数のみで完結するため、ブラウザ版 (公開サイト) でも完全に動作する。
 *
 * スコープ: 「手取り」を含む月額の順算/逆算のみ。金額表記は
 * 「40万」「40万円」「400000」「400,000円」「40.5万」(NFKC で全角数字も可) に対応。
 * 扶養なし・40歳未満 (介護保険なし)・基礎控除のみの簡略モデル (welfareScheme 準拠)。
 */

import { monthlyCompensation, solveGrossForTakeHomeChecked } from '../../shared/welfareScheme';
import type { MonthlyCompensation } from '../../shared/welfareScheme';
import { jpy } from '../../shared/formatters';

/** 解析された計算クエリ。 */
export interface CalcQuery {
  /** take-home: 額面→手取り / required-gross: 手取り→必要額面。 */
  readonly kind: 'take-home' | 'required-gross';
  /** 入力金額 (円/月)。take-home なら額面、required-gross なら目標手取り。 */
  readonly amount: number;
}

/** 計算結果 (クエリ + 月次内訳)。 */
export interface CalcAnswer {
  readonly query: CalcQuery;
  /** 内訳 (gross は take-home なら入力額面、required-gross なら逆算した額面)。 */
  readonly comp: MonthlyCompensation;
  /**
   * 逆算 (`required-gross`) が目標手取りに**届いたか**。順算 (`take-home`) は
   * 何も解いていないので常に true。`false` のとき `comp.gross` は探索上限に
   * 張り付いた値なので、**「この額面なら目標が出る」と書いてはいけない**
   * (2026-09-09 · パス 103)。
   */
  readonly reached: boolean;
}

/**
 * 日本語の金額表記を円へ解析する。「40万」「40.5万円」「400,000」「400000円」。
 * 対応外・0 以下・非有限は null。
 */
/**
 * **金額として読まない単位。** 数のすぐ後ろがこれなら、その数は金額ではない。
 *
 * ## なぜ要るのか (2026-09-09 · パス 102 の実測)
 *
 * 直す前は「最初に見つかった数」を金額にしていた。この skill の断り書きは
 * **「扶養なし・40歳未満・基礎控除のみの概算です」** と書いてあり、つまり
 * **利用者に年齢を言わせる誘い**になっている。実測 (7 問中 4 問が誤答):
 *
 * | 質問 | 拾った数 | 出た答え |
 * | --- | ---: | --- |
 * | 42歳ですが額面30万の手取りは？ | **42** | 手取り **¥-11,326** |
 * | 私は45歳です。額面40万の手取りはいくら？ | **45** | 手取り ¥-11,323 |
 * | 従業員3人の会社で額面25万の手取りは？ | **3** | 手取り ¥-11,365 |
 * | 2026年の額面30万の手取りは？ | **2026** | 手取り ¥-9,352 |
 *
 * **答えは「見て分かる出鱈目」ではなかった** —— 社会保険料 ¥10,952 まで添えた
 * 体裁の整った内訳が出て、拾い間違えたことは文面から分からない。
 *
 * `年` は「2026年」を弾くために入れる。金額に「年」が続く言い方
 * (「30万年」) は無いので、金額を取りこぼす側の害は無い。
 */
const NON_MONEY_UNITS: readonly string[] = ['歳', '才', '人', '年', '月', '日', '時', '分', '秒', '件', '個', '回', '%'];

/**
 * **金額の位取り。** 数のすぐ後ろがこれなら、その倍率を掛ける。
 *
 * 億 と 兆 が無いと「手取り1億ほしい」は `1` だけを拾って **¥1** として答えて
 * いた (2026-09-09 · パス 103 の実測: 「💴 手取り ¥1/月 に必要な額面はおよそ
 * ¥11,426/月 です」)。**1 億倍の読み違いが、体裁の整った答えになる。**
 * 位取りとして読めば ¥100,000,000 になり、モデルの範囲外として断れる。
 *
 * 覆っていないのは**複合の位取り**(「3千万」「1億2千万」「20万5千円」)。
 * 完全な日本語数詞の解析 (十/百/千 と 万/億/兆 の入れ子) は別物なので、
 * ここでは**読み切れないなら断る** ({@link INCOMPLETE_AFTER})。
 */
const MONEY_SCALES: readonly (readonly [string, number])[] = [
  ['万', 10_000],
  ['億', 100_000_000],
  ['兆', 1_000_000_000_000],
];

/**
 * **読み切れていない印。** 数 (と位取り) の直後がこれなら、桁がまだ続いている
 * ので読みを捨てる —— 数字か、位取り字か、合成専用の「千」。
 *
 * 実測 (2026-09-09 · パス 103)。この規則を入れる前は、続きを黙って捨てて
 * **桁の違う答え**を返していた:
 *
 * | 質問 | 拾っていた額 | 訊かれていた額 |
 * | --- | ---: | ---: |
 * | 手取り3千万ほしい | **¥3** | ¥30,000,000 |
 * | 手取り20万5千円ほしい | **¥200,000** | ¥205,000 |
 *
 * 前者は 1,000 万倍・後者は 2.4% の差で、どちらも体裁の整った答えになる。
 * 読めないなら答えないほうが良い (パス 94 / 100 / 102 と同じ方針)。
 *
 * 「千」は位取りの表には入れない —— 単独の「30千円」は会計の記法で口語には
 * 無く、口語の「3千万」は万との合成が要る。合成を読まないので、**千が続く形は
 * 一律で断る**。
 */
const INCOMPLETE_AFTER: readonly string[] = ['千', ...MONEY_SCALES.map(([ch]) => ch)];

/**
 * 日本語の金額表記を円へ解析する。「40万」「40.5万円」「400,000」「400000円」。
 * 対応外・0 以下・非有限は null。
 *
 * **金額でない単位が付く数は飛ばして次を見る** (上の `NON_MONEY_UNITS`)。
 */
export function parseAmountJa(raw: string): number | null {
  const text = raw.normalize('NFKC');
  // 位取りの綴りは MONEY_SCALES から作る (正規表現に写すと台帳とずれる)。
  const scalePattern = MONEY_SCALES.map(([ch]) => ch).join('');
  const re = new RegExp(`([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*([${scalePattern}])?`, 'g');
  for (const m of text.matchAll(re)) {
    const digits = m[1];
    const scaleChar = m[2];
    if (digits === undefined) continue;
    // 数 (と位取り) の直後の 1 文字。金額でない単位ならこの数は金額ではない。
    const after = text.charAt(m.index + m[0].length);
    if (NON_MONEY_UNITS.includes(after)) continue;
    // 桁がまだ続いている (合成の位取り) なら、読み切れていないので捨てる。
    if (/[0-9]/.test(after) || INCOMPLETE_AFTER.includes(after)) continue;
    const base = Number.parseFloat(digits.replace(/,/g, ''));
    // 桁が大きすぎて Infinity になる入力 (例: 1 のあとに 0 が 309 個) を拒否する。
    if (!Number.isFinite(base)) continue;
    const scale = MONEY_SCALES.find(([ch]) => ch === scaleChar)?.[1] ?? 1;
    const rounded = Math.round(base * scale);
    // 位取りで有限を外れる入力 (例: 1e300 兆) も弾く。
    if (!Number.isFinite(rounded) || rounded <= 0) continue;
    return rounded;
  }
  return null;
}

/**
 * テキストから手取り計算クエリを検出する。
 *
 * - 「手取り」を含まなければ null (本スキルの対象外)。
 * - 「手取り<金額>」(直後に金額) → required-gross (その手取りに必要な額面の逆算)。
 * - それ以外で金額があれば → take-home (その額面の手取り計算)。
 * - 金額が無ければ null。
 */
const TEDORI = '手取り';
/** 「手取り」直後に許容する助詞 (これを挟んで金額が続けば逆算とみなす)。 */
const PARTICLES: readonly string[] = ['を', 'が', 'で'];

export function parseCalcQuery(text: string): CalcQuery | null {
  const s = text.normalize('NFKC');
  const idx = s.indexOf(TEDORI);
  if (idx === -1) return null;

  // 「手取り(を|が|で)?<金額>」— 直後 (任意の空白を挟む) に数字が始まれば逆算。
  let tail = s.slice(idx + TEDORI.length);
  if (PARTICLES.includes(tail.charAt(0))) tail = tail.slice(1);
  if (/^\s*[0-9]/.test(tail)) {
    const amount = parseAmountJa(tail);
    if (amount === null) return null;
    return { kind: 'required-gross', amount };
  }

  const amount = parseAmountJa(s);
  if (amount === null) return null;
  return { kind: 'take-home', amount };
}

/**
 * クエリを実行して月次内訳を得る (welfareScheme へ委譲)。
 *
 * `taxYear` を受けるのは検査のため。基礎控除の段階が年分で変わるので、
 * 既定 (現在の年) のままだと**暦が変わった日に検査が落ちる** — しかも
 * 落ちるのは 2028 年の元日で、そのとき理由を思い出せる人はいない。
 */
export function runCalcQuery(query: CalcQuery, taxYear = new Date().getFullYear()): CalcAnswer {
  if (query.kind === 'required-gross') {
    // **届いたかを一緒に受け取る。** 目標が高すぎると探索上限に張り付いた額面が
    // 返り、その額面では目標手取りが出ない (パス 103)。
    const solved = solveGrossForTakeHomeChecked(query.amount, false, undefined, taxYear);
    return {
      query,
      comp: monthlyCompensation(solved.gross, false, undefined, taxYear),
      reached: solved.reached,
    };
  }
  // 順算は何も解いていないので「届かなかった」は起きない。
  return { query, comp: monthlyCompensation(query.amount, false, undefined, taxYear), reached: true };
}

/**
 * 回答テキストを整形する (内容は表現 — 数値は runCalcQuery のテストで固定)。
 *
 * **手取りが 0 以下になる額面には答えない。** 社会保険料は標準報酬月額の
 * **最低等級**で下支えされるので、額面 ¥1 でも ¥10,952 が引かれ、手取りは
 * 負になる (実測: 額面 ¥1 → 手取り ¥-11,367 / 額面 ¥10,000 → ¥-1,418 /
 * 額面 ¥58,000 → ¥+46,342)。これは `welfareScheme` の欠陥ではなく**等級表の
 * 正しい適用**で、表の下端より低い額面はこのモデルの外である。
 *
 * 「手取りはいくら？」に**負の手取り**を答えると、体裁の整った内訳の形で
 * 成り立たない数を渡すことになる (2026-09-09 · パス 102)。**下限の金額を
 * ここに写さない** —— 「手取りが 0 以下なら範囲外」は表から導かれるので、
 * 等級表が動いても食い違わない。
 */
export function formatCalcAnswer(answer: CalcAnswer): string {
  const { query, comp, reached } = answer;
  const yen = (n: number) => jpy(Math.round(n));
  // **届かなかった逆算に額面を答えない。** 直す前は文が「必要な額面はおよそ
  // ¥3,000,000 です」と言い、**同じ答えの内訳が「手取り ¥1,724,127」**と言って
  // いた (目標 ¥1,800,000 で差 ¥75,873・目標 ¥5,000,000 なら差 ¥3,275,873 と
  // 無限に開く)。上限の値も最大手取りも写さず、答え自身から刷る。
  if (!reached) {
    return (
      `💴 手取り ${yen(query.amount)}/月 は、このモデルの範囲外です。` +
      `このモデルで扱える上限は 額面 ${yen(comp.gross)}/月 のときの 手取り ${yen(comp.takeHome)}/月 までです。\n` +
      `※ 標準報酬月額の等級表と基礎控除だけの簡略モデルなので、役員報酬のような高額は` +
      `「税務試算」ページか税理士へどうぞ。`
    );
  }
  if (comp.takeHome <= 0) {
    return (
      `💴 額面 ${yen(comp.gross)}/月 は、このモデルの範囲外です。` +
      `社会保険料は標準報酬月額の最低等級で下支えされるため、` +
      `この額面では手取りが 0 以下になります (差し引き ${yen(comp.employeeSocialInsurance + comp.incomeTax + comp.residentTax)}/月)。\n` +
      `※ 月額の金額を「額面30万」「手取り25万」のように書いてもう一度お試しください。`
    );
  }
  // Stryker disable all — 文面は表現。数値の正しさは runCalcQuery 側で担保。
  const breakdown =
    `額面 ${yen(comp.gross)}/月 → 社会保険料 ${yen(comp.employeeSocialInsurance)} / ` +
    `所得税 ${yen(comp.incomeTax)} / 住民税 ${yen(comp.residentTax)} / ` +
    `手取り ${yen(comp.takeHome)}`;
  const head =
    query.kind === 'required-gross'
      ? `💴 手取り ${yen(query.amount)}/月 に必要な額面はおよそ ${yen(comp.gross)}/月 です。\n${breakdown}`
      : `💴 ${breakdown}`;
  return (
    `${head}\n` +
    `※ 扶養なし・40歳未満・基礎控除のみの概算です。扶養控除・青色申告特別控除・` +
    `福利厚生スキームを含む詳細は「税務試算」ページでどうぞ。`
  );
  // Stryker restore all
}
