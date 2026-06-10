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
export function parseAmountJa(raw: string): number | null {
  const m = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(万)?/.exec(raw.normalize('NFKC'));
  // 不一致 (m が null) は digits の undefined 判定で弾く — グループ1 は非任意なので
  // 一致時は常に在る。万 グループも guard 前に読む (m null なら同様に undefined)。
  const digits = m?.[1];
  const man = m?.[2];
  if (digits === undefined) return null;
  const base = Number.parseFloat(digits.replace(/,/g, ''));
  // 桁が大きすぎて Infinity になる入力 (例: 1 のあとに 0 が 309 個) を拒否する。
  if (!Number.isFinite(base)) return null;
  const yen = man === '万' ? base * 10_000 : base;
  const rounded = Math.round(yen);
  if (rounded <= 0) return null;
  return rounded;
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

/** クエリを実行して月次内訳を得る (welfareScheme へ委譲)。 */
export function runCalcQuery(query: CalcQuery): CalcAnswer {
  if (query.kind === 'required-gross') {
    const gross = solveGrossForTakeHome(query.amount);
    return { query, comp: monthlyCompensation(gross) };
  }
  return { query, comp: monthlyCompensation(query.amount) };
}

/** 回答テキストを整形する (内容は表現 — 数値は runCalcQuery のテストで固定)。 */
export function formatCalcAnswer(answer: CalcAnswer): string {
  const { query, comp } = answer;
  const yen = (n: number) => jpy(Math.round(n));
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
