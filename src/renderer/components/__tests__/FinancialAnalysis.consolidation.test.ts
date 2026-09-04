/** @vitest-environment jsdom */
/**
 * 連結（合算）の対象範囲テスト。
 *
 * 背景 — これは実際に作り込んだ退行の再発防止テストです。
 * 事業間比較に利用者の事業を出せるようにした時点で、`units` に
 * 「利用者の実績」と「同梱のサンプル 10 件」が同居するようになりました。
 * 棒グラフは 1 本ずつラベルが付くので並べてよいのですが、連結は
 * **すべてを 1 つの数に潰します**。実績とサンプルを足した合計は
 * どちらの会社の数でもなく、しかも画面には「全事業合算」と出ていました。
 *
 * そこで `consolidationScope` が出所で切り分けます:
 *   - 実績が 1 件でもある → 実績だけを合算 (サンプルは足さない)
 *   - 実績が 1 件も無い   → 全部 (= すべてサンプル) を合算
 * そして合算した集合を必ずラベルに書きます。
 *
 * 検証は 3 段階:
 *   A) 純粋関数 — 範囲の選び方とラベル
 *   B) SSR      — チェックボックスの文言が集合を名指しするか (押す前に分かるか)
 *   C) 実 DOM   — 実際にチェックを入れ、出た合計がサンプルを含んでいないか
 *
 * C が本体です。A だけでは「関数は正しいが画面が呼んでいない」を見逃します。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis } from '../FinancialAnalysis';
import { consolidationScope, consolidationLabel } from '../../data/consolidation';
import type { FinancialUnit } from '../FinancialAnalysis';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

/** 月次売上だけ変えた最小 FinancialUnit。 */
function unit(id: string, monthlyRevenue: number, sample?: boolean): FinancialUnit {
  const variableCost = Math.round(monthlyRevenue * 0.4);
  const fixedCost = Math.round(monthlyRevenue * 0.3);
  const profit = monthlyRevenue - variableCost - fixedCost;
  return {
    id,
    label: `${id}事業`,
    current: { revenue: monthlyRevenue, variableCost, fixedCost, profit, profitMargin: 30 },
    history: [],
    ...(sample === undefined ? {} : { sample }),
  };
}

// ===== A) 純粋関数 =======================================================

describe('consolidationScope — 合算する集合の選び方', () => {
  const isSample = (u: FinancialUnit) => u.sample === true;

  it('実績とサンプルが混在すると実績だけを返す', () => {
    const scope = consolidationScope([unit('own', 100), unit('s1', 500, true)], isSample);
    expect(scope.parts.map((u) => u.id)).toEqual(['own']);
  });

  it('実績が混在するとき isSample は false', () => {
    const scope = consolidationScope([unit('own', 100), unit('s1', 500, true)], isSample);
    expect(scope.isSample).toBe(false);
  });

  it('実績が複数あればすべて返す', () => {
    const scope = consolidationScope([unit('a', 100), unit('b', 200), unit('s1', 500, true)], isSample);
    expect(scope.parts.map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('すべてサンプルなら全件を返す (合算対象が消えない)', () => {
    const scope = consolidationScope([unit('s1', 500, true), unit('s2', 300, true)], isSample);
    expect(scope.parts.map((u) => u.id)).toEqual(['s1', 's2']);
  });

  it('すべてサンプルのとき isSample は true', () => {
    const scope = consolidationScope([unit('s1', 500, true), unit('s2', 300, true)], isSample);
    expect(scope.isSample).toBe(true);
  });

  it('すべて実績ならそのまま全件・isSample は false', () => {
    const scope = consolidationScope([unit('a', 100), unit('b', 200)], isSample);
    expect(scope.parts.map((u) => u.id)).toEqual(['a', 'b']);
    expect(scope.isSample).toBe(false);
  });

  it('sample 未指定は実績として扱う (既定はサンプルではない)', () => {
    const scope = consolidationScope([unit('a', 100)], isSample);
    expect(scope.isSample).toBe(false);
  });

  it('sample: false を明示しても実績として扱う', () => {
    const scope = consolidationScope([unit('a', 100, false), unit('s1', 500, true)], isSample);
    expect(scope.parts.map((u) => u.id)).toEqual(['a']);
  });

  it('空配列なら空を返し isSample は true (0 件を実績の合計と言わない)', () => {
    const scope = consolidationScope([] as FinancialUnit[], isSample);
    expect(scope.parts).toEqual([]);
    expect(scope.isSample).toBe(true);
  });

  it('元の配列を書き換えない', () => {
    const items = [unit('own', 100), unit('s1', 500, true)];
    consolidationScope(items, isSample);
    expect(items.map((u) => u.id)).toEqual(['own', 's1']);
  });
});

describe('consolidationLabel — 何を足したかを書く', () => {
  it('サンプルの合算はサンプルと明示する', () => {
    expect(consolidationLabel(10, true)).toBe('連結（サンプル 10 件の合算）');
  });

  it('実績の合算は自分の事業と明示する', () => {
    expect(consolidationLabel(3, false)).toBe('連結（自分の事業 3 件の合算）');
  });

  it('件数をそのまま出す (サンプル)', () => {
    expect(consolidationLabel(1, true)).toContain('1 件');
  });

  it('件数をそのまま出す (実績)', () => {
    expect(consolidationLabel(7, false)).toContain('7 件');
  });

  it('どちらの文言も「全事業合算」とは言わない (出所を隠さない)', () => {
    expect(consolidationLabel(2, true)).not.toContain('全事業');
    expect(consolidationLabel(2, false)).not.toContain('全事業');
  });
});

// ===== B) SSR — 押す前に何を足すか分かるか ================================

describe('連結チェックボックスの文言 (SSR)', () => {
  it('サンプルだけのとき「サンプル N 件」と出る', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, {
      units: [unit('s1', 500, true), unit('s2', 300, true)],
    }));
    expect(html).toContain('連結（サンプル 2 件の合算）で表示');
  });

  it('実績が 1 件でもあれば「自分の事業 N 件」に変わる', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, {
      units: [unit('own', 1_000_000), unit('s1', 5_000_000, true), unit('s2', 3_000_000, true)],
    }));
    expect(html).toContain('連結（自分の事業 1 件の合算）で表示');
  });

  it('実績があるときサンプル件数を数に含めない', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, {
      units: [unit('own', 1_000_000), unit('s1', 5_000_000, true), unit('s2', 3_000_000, true)],
    }));
    expect(html).not.toContain('連結（自分の事業 3 件の合算）');
  });

  it('「全事業合算」という文言はもう出さない', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, {
      units: [unit('own', 1_000_000), unit('s1', 5_000_000, true)],
    }));
    expect(html).not.toContain('全事業合算');
  });
});

// ===== C) 実 DOM — 出た合計にサンプルが混ざっていないか ====================
//
// ここが本体。A の関数が正しくても、画面が合計を別経路で作っていれば意味がない。
// 数字は「両方の実績を足さないと出ない値」を選ぶ:
//   実績 100万 + 200万 = 月 300万 → 年 3,600万   ← 単体では絶対に出ない
//   これにサンプル 500万 を足すと 年 9,600万     ← 出てはいけない値

/** React の onChange を発火させるチェックボックス操作。 */
function toggleCheckbox(box: HTMLInputElement): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
  if (!setter) throw new Error('HTMLInputElement checked setter not found');
  setter.call(box, !box.checked);
  box.dispatchEvent(new Event('click', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('連結を実際に押したときの合計', () => {
  let container: HTMLDivElement;
  const units = [unit('a', 1_000_000), unit('b', 2_000_000), unit('s1', 5_000_000, true)];
  const REAL_ONLY = yen.format(36_000_000);   // (100万+200万) x 12
  const WITH_SAMPLE = yen.format(96_000_000); // それにサンプル 500万 x 12 を足した値

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function renderAndConsolidate(): string {
    const root = createRoot(container);
    act(() => { root.render(createElement(FinancialAnalysis, { units })); });
    const box = Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .find((el) => el.parentElement?.textContent?.includes('連結')) as HTMLInputElement | undefined;
    if (!box) throw new Error('連結チェックボックスが見つからない');
    act(() => { toggleCheckbox(box); });
    const html = container.innerHTML;
    act(() => { root.unmount(); });
    return html;
  }

  it('実績 2 件を足した額が出る', () => {
    expect(renderAndConsolidate()).toContain(REAL_ONLY);
  });

  it('サンプルを含んだ額は出ない (これが退行の本体)', () => {
    expect(renderAndConsolidate()).not.toContain(WITH_SAMPLE);
  });

  it('見出しが合算した集合を名指しする', () => {
    expect(renderAndConsolidate()).toContain('連結（自分の事業 2 件の合算）');
  });
});
