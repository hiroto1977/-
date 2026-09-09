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

import { monthlyCompensation, solveGrossForTakeHome } from '../../shared/welfareScheme';
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
 * 日本語の金額表記を円へ解析する。「40万」「40.5万円」「400,000」「400000円」。
 * 対応外・0 以下・非有限は null。
 *
 * **金額でない単位が付く数は飛ばして次を見る** (上の `NON_MONEY_UNITS`)。
 */
export function parseAmountJa(raw: string): number | null {
  const text = raw.normalize('NFKC');
  for (const m of text.matchAll(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(万)?/g)) {
    const digits = m[1];
    const man = m[2];
    if (digits === undefined) continue;
    // 数 (と「万」) の直後の 1 文字。金額でない単位ならこの数は金額ではない。
    const after = text.charAt(m.index + m[0].length);
    if (NON_MONEY_UNITS.includes(after)) continue;
    const base = Number.parseFloat(digits.replace(/,/g, ''));
    // 桁が大きすぎて Infinity になる入力 (例: 1 のあとに 0 が 309 個) を拒否する。
    if (!Number.isFinite(base)) continue;
    const yen = man === '万' ? base * 10_000 : base;
    const rounded = Math.round(yen);
    if (rounded <= 0) continue;
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
    const gross = solveGrossForTakeHome(query.amount, false, undefined, taxYear);
    return { query, comp: monthlyCompensation(gross, false, undefined, taxYear) };
  }
  return { query, comp: monthlyCompensation(query.amount, false, undefined, taxYear) };
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
  const { query, comp } = answer;
  const yen = (n: number) => jpy(Math.round(n));
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
