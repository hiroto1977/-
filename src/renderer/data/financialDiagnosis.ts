/**
 * 財務健全度 総合診断 (Phase 5) — radarAxes が算出した 15 指標の 0-100 スコアを
 * 解釈し、総合スコア / 格付け / カテゴリ別評価 / 強み・弱み + 一般的なコメントに
 * まとめる純粋ロジック。指標・チャート・諸表と同じ FinancialInputs に連動する。
 *
 * **重要 — 概算であり財務助言ではありません。** コメントは一般情報であり、
 * 個別の経営・財務助言ではありません。
 */

import type { RadarAxis } from './financialRatios';

export type HealthGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type HealthLevel = 'good' | 'warn' | 'bad';

export interface CategoryScore {
  readonly category: string;
  readonly score: number; // 0-100 (カテゴリ内軸の平均)
  readonly axisKeys: readonly string[];
}

export interface AxisComment {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly level: HealthLevel;
  readonly comment: string;
}

export interface FinancialDiagnosis {
  readonly overallScore: number; // 0-100 (全15軸の平均)
  readonly grade: HealthGrade;
  readonly categories: readonly CategoryScore[];
  readonly strengths: readonly AxisComment[]; // スコア上位 (good)
  readonly weaknesses: readonly AxisComment[]; // スコア下位 (要改善)
}

/** 軸キー → カテゴリ (安全性 / 収益性 / 効率性)。 */
const CATEGORY_OF: Record<string, string> = {
  equityRatio: '安全性', currentRatio: '安全性', fixedLongTermFit: '安全性',
  debtToMonthlySales: '安全性', debtRepaymentYears: '安全性',
  operatingMargin: '収益性', ordinaryMargin: '収益性', netMargin: '収益性',
  ebitdaMargin: '収益性', laborShare: '収益性', roa: '収益性', roe: '収益性',
  receivablesTurnover: '効率性', inventoryTurnover: '効率性', ccc: '効率性',
};
const CATEGORY_ORDER = ['安全性', '収益性', '効率性'] as const;

/** 改善が必要な軸への一般的なコメント (warn/bad 時)。 */
const IMPROVE_HINT: Record<string, string> = {
  equityRatio: '自己資本比率が低め。利益の内部留保で純資産の積み増しを検討。',
  currentRatio: '流動比率が低め。短期の支払能力・運転資金の確保に注意。',
  fixedLongTermFit: '固定長期適合率が高め。固定資産を長期資金で賄えているか確認を。',
  debtToMonthlySales: '借入金月商倍率が高め。月商に対する借入残高の水準に注意。',
  debtRepaymentYears: '債務償還年数が長め。キャッシュ創出力に対する借入水準を確認。',
  operatingMargin: '営業利益率が低め。本業の採算（原価・固定費）の見直しを。',
  ordinaryMargin: '経常利益率が低め。営業外損益も含めた採算を確認。',
  netMargin: '当期純利益率が低め。特別損益・税負担も含め最終利益を確認。',
  ebitdaMargin: 'EBITDAマージンが低め。償却前の稼ぐ力を確認。',
  laborShare: '労働分配率が高め。付加価値に対する人件費の水準に注意。',
  receivablesTurnover: '売上債権回転率が低め。回収サイトの長期化に注意。',
  inventoryTurnover: '棚卸資産回転率が低め。在庫の滞留に注意。',
  ccc: 'CCC（現金化日数）が長め。回収・在庫・支払のサイト最適化を検討。',
  roa: 'ROA が低め。総資産に対する収益性（資産効率）を確認。',
  roe: 'ROE が低め。自己資本に対する収益性を確認。',
};

function levelOf(score: number): HealthLevel {
  if (score >= 70) return 'good';
  if (score >= 45) return 'warn';
  return 'bad';
}

function gradeOf(score: number): HealthGrade {
  if (score >= 80) return 'S';
  if (score >= 65) return 'A';
  if (score >= 50) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

function commentOf(axis: { key: string; label: string }, level: HealthLevel): string {
  if (level === 'good') return `${axis.label}は良好な水準です。`;
  return IMPROVE_HINT[axis.key] ?? `${axis.label}の水準に注意。`;
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length));

/** レーダー軸 (0-100) から総合診断を作る。純粋。 */
export function diagnoseFinancials(axes: readonly RadarAxis[]): FinancialDiagnosis {
  const overallScore = mean(axes.map((a) => a.score));
  const categories: CategoryScore[] = CATEGORY_ORDER.map((cat) => {
    const inCat = axes.filter((a) => CATEGORY_OF[a.key] === cat);
    return { category: cat, score: mean(inCat.map((a) => a.score)), axisKeys: inCat.map((a) => a.key) };
  });
  const comments: AxisComment[] = axes.map((a) => {
    const level = levelOf(a.score);
    return { key: a.key, label: a.label, score: a.score, level, comment: commentOf(a, level) };
  });
  const byScoreDesc = [...comments].sort((x, y) => y.score - x.score);
  const strengths = byScoreDesc.filter((c) => c.level === 'good').slice(0, 3);
  const weaknesses = [...comments]
    .filter((c) => c.level !== 'good')
    .sort((x, y) => x.score - y.score)
    .slice(0, 3);
  return { overallScore, grade: gradeOf(overallScore), categories, strengths, weaknesses };
}
