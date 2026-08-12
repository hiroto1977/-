/** @vitest-environment jsdom */
/**
 * EligibilityChecker のレンダー回帰テスト。
 *
 * 判定そのものは `data/eligibility.ts` の純関数テストで担保しているので、
 * ここは「判定結果が画面に落ちるところ」だけを見る:
 * - 収録した制度が全件描画される (判定はできているのに表示から漏れる、を防ぐ)
 * - 「対象」と「要確認」が語として区別されている
 *   (要確認を対象と見せると、取れない資金を前提に計画を立てさせてしまう)
 * - 制度ごとに出典リンクが出る
 * - 外部リンクは href に直接遷移させず openExternal 経由にする
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EligibilityChecker } from '../EligibilityChecker';
import { PROGRAM_RULES, judgeEligibility } from '../../data/eligibility';

beforeAll(() => {
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: () => Promise.resolve(),
  };
});

function render(): string {
  return renderToStaticMarkup(createElement(EligibilityChecker));
}

describe('EligibilityChecker — レンダー', () => {
  it('例外なく描画できる', () => {
    let html = '';
    expect(() => {
      html = render();
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
  });

  it('収録している制度が全件出る（表示から漏れない）', () => {
    const html = render();
    for (const rule of PROGRAM_RULES) {
      expect(html).toContain(rule.name);
    }
  });

  it('制度の数だけ出典リンクが出る', () => {
    const html = render();
    const links = html.match(/出典を開く/g) ?? [];
    expect(links).toHaveLength(PROGRAM_RULES.length);
  });

  it('出典 URL が href に入っている', () => {
    const html = render();
    for (const rule of PROGRAM_RULES) {
      expect(html).toContain(rule.sourceUrl);
    }
  });

  it('未入力の初期状態の内訳が判定結果と一致する', () => {
    const html = render();
    const r = judgeEligibility({
      age: null,
      gender: 'unspecified',
      entity: 'individual',
      managementYears: null,
      certifiedFarmer: null,
      certifiedNewFarmer: null,
    });
    expect(html).toContain(`要件を満たす ${r.eligible.length} 件`);
    expect(html).toContain(`入力が足りない ${r.needsCheck.length} 件`);
    expect(html).toContain(`対象外 ${r.ineligible.length} 件`);
  });

  it('性別を要件にした制度が無いことを明記する', () => {
    expect(render()).toContain('性別を要件にしているものはありません');
  });

  it('判定に効かない入力は、効かないと画面に書く', () => {
    // 入力欄があるのに何も書かないと「考慮されている」と読まれる。
    // 事業形態は受け取るが収録範囲では判定を変えない。
    const html = render();
    expect(html).toContain('事業形態（個人／法人）も判定には効いていません');
  });

  it('「要件を満たす」が採否の保証でないことを画面上で断っている', () => {
    const html = render();
    expect(html).toContain('採択・審査の結果ではありません');
    expect(html).toContain('採否を保証するものではありません');
  });

  it('審査で見られる要件を判定と別立てで出す', () => {
    const html = render();
    expect(html).toContain('審査で見られる要件（判定には含めていません）');
    for (const c of PROGRAM_RULES.flatMap((r) => r.reviewChecks)) {
      expect(html).toContain(c);
    }
  });

  it('入力欄が揃っている', () => {
    const html = render();
    for (const label of [
      '年齢',
      '性別',
      '事業形態',
      '経営管理の従事年数',
      '認定農業者か',
      '認定新規就農者か',
    ]) {
      expect(html).toContain('aria-label=' + JSON.stringify(label));
    }
  });

  it('前提となる認定は既定を「未回答」にする（答えていない人を対象外に落とさない）', () => {
    const html = render();
    // 既定が「いいえ」だと、未回答のまま全制度が対象外に見える。
    expect(html).not.toContain('対象外 9 件');
    expect(html).toContain('未回答');
  });
});
