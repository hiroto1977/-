/**
 * **自己検査の 3 分岐 (緑 / 赤 / 0 件) を画面ごと刷る。** (2026-09-12 · パス 150)
 *
 * これはパス 68 の持ち越しを閉じるものである。`docs/REMAINING_WORK.md` の
 * 「持ち越し: パス 68 に同じ穴が残っている」がこう書いていた:
 *
 * > `ChartsPage.tsx:133/142` の 3 分岐 (緑 / 赤 / **0 件**) は
 * > `data/__tests__/charts.test.ts` の 2 本しか留めておらず、**画面を通る検査が無い。**
 * > パス 70 と同じ `vi.mock` の手が使えるが、`CHART_DATASETS` を空にする差し替えは
 * > 画面の他の節も空にするため、**「床が鳴った」のか「画面が壊れた」のか読めない
 * > 検査になりかねない**。別のパスで、分離できる形を設計してから置く。
 *
 * **分離できる形**は、見本の一覧を画面の引数にすることだった (`ChartsPage` の
 * `datasets` prop)。そうすると 0 件は「この画面に 0 件を渡す」だけで作れて、
 * モジュールの定数を差し替えないので他の節は素のまま動く。
 *
 * **そして測って分かったのは、もっと悪いことだった。** 0 件の枝は
 * 「読めない検査」どころか **到達不能** だった —— `const FIRST = CHART_DATASETS[0]!`
 * がモジュールの定数だったので、見本が空だと画面は注記を出す前に投げていた
 * (実測: `TypeError: Cannot read properties of undefined (reading 'id')`)。
 * つまりパス 72 が「0 件を緑にしない」ために書いた枝は、**1 度も出せなかった**。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHART_DATASETS } from '../../data/chartFixtures';
import type { SelfCheckReport } from '../../data/chartSelfCheck';

/**
 * `runSelfCheck` の戻り値だけを差し替えられるようにする。
 * **既定では実物へ委ねる** —— 緑と 0 件の枝は実際の計算を通したい
 * (画面と検査器が繋がっていることも同時に見るため)。
 */
const h = vi.hoisted(() => ({ override: null as SelfCheckReport | null }));
vi.mock('../../data/chartSelfCheck', async (orig) => {
  const real = (await orig()) as typeof import('../../data/chartSelfCheck');
  return {
    ...real,
    runSelfCheck: (...args: Parameters<typeof real.runSelfCheck>): SelfCheckReport =>
      h.override ?? real.runSelfCheck(...args),
  };
});

const { ChartsPage } = await import('../ChartsPage');

const GREEN = 'var(--ok, #27ae60)';
const RED = 'var(--ng, #eb5757)';

/** 画面を刷る。`datasets` を省けば既定 (同梱の見本) が使われる。 */
function screen(datasets?: readonly (typeof CHART_DATASETS)[number][]): string {
  return renderToStaticMarkup(createElement(ChartsPage, { datasets }));
}

beforeEach(() => {
  h.override = null;
});

describe('可視化の自己検査 — 画面の 3 分岐 (パス 150)', () => {
  it('★ 既定 (実物の見本) は緑「すべて通過」で、件数を実物から刷る', () => {
    const html = screen();
    expect(html).toContain(`全 ${CHART_DATASETS.length} データセット × 3 種すべて通過`);
    expect(html).toContain(GREEN);
    expect(html).not.toContain(RED);
    expect(html).not.toContain('検査対象のデータセットがありません');
  });

  it('★ 0 件 — 緑でも赤でもない断り書きを出す (投げない)', () => {
    /*
     * 直す前はここで `TypeError` だった。**「0 件は緑にしない」という判断は
     * 出せて初めて効く。**
     */
    const html = screen([]);
    expect(html).toContain('検査対象のデータセットがありません');
    expect(html).toContain('検査は 1 件も走っていません');
    // 緑 (すべて通過) でも赤 (失敗) でもない。
    expect(html).not.toContain('すべて通過');
    expect(html).not.toContain('項目が失敗');
    expect(html).not.toContain(GREEN);
    expect(html).not.toContain(RED);
  });

  it('★ 0 件 — 図の節も「描けません」と言う (空の図を並べない)', () => {
    const html = screen([]);
    expect(html).toContain('見本データが 1 件もありません');
    expect(html).toContain('個別の検査結果はありません');
    // 図の節そのものを出さない (題名だけ在って中身が無い枠を作らない)。
    expect(html).not.toContain('折れ線グラフ');
    expect(html).not.toContain('レーダーチャート');
    expect(html).not.toContain('<svg');
  });

  it('★ 失敗があれば赤で件数を出す (検査器が壊れたら画面が赤くなる)', () => {
    h.override = {
      datasets: [],
      passed: 5,
      failed: 3,
      allPassed: false,
      checkedDatasets: 2,
    };
    const html = screen();
    expect(html).toContain('3 項目が失敗');
    expect(html).toContain('5 項目は通過');
    expect(html).toContain(RED);
    expect(html).not.toContain('すべて通過');
  });

  it('★ 対照: 差し替えが効いている (同じ差し替えで allPassed を立てると緑になる)', () => {
    // **これが無いと、上の赤が「差し替えのせい」か「画面の枝」か分からない。**
    h.override = { datasets: [], passed: 8, failed: 0, allPassed: true, checkedDatasets: 2 };
    const html = screen();
    expect(html).toContain('全 2 データセット × 3 種すべて通過（8 項目）');
    expect(html).toContain(GREEN);
    expect(html).not.toContain(RED);
  });

  it('★ 見本の一覧は引数から刷る (題材の選択肢が実物と一致する)', () => {
    const html = screen();
    // 選ばれている option には `selected=""` が付くので、属性だけを見る。
    for (const d of CHART_DATASETS) expect(html).toContain(`<option value="${d.id}"`);
    // 1 つだけ渡せばその 1 つだけが選択肢になる (モジュール定数を見ていない証拠)。
    const one = screen([CHART_DATASETS[0]!]);
    expect(one).toContain(`<option value="${CHART_DATASETS[0]!.id}"`);
    for (const d of CHART_DATASETS.slice(1)) expect(one).not.toContain(`<option value="${d.id}"`);
  });

  it('★ 「データなし (退化)」は 3 種すべてを理由つきの断りにする (画面から到達できる)', () => {
    /*
     * `components/Charts.tsx` の `EmptyChart` 3 枝は 2026-09-12 まで
     * **画面から到達できなかった** (上の 4 つの見本はどれも描ける値を持つ)。
     * この見本を足したことで、利用者がこの選択肢を選べば 3 つの断りが出る。
     */
    const degenerate = CHART_DATASETS.find((d) => d.id === 'nodata');
    expect(degenerate, '退化の見本が消えた (この枝に画面から行けなくなる)').toBeDefined();
    const html = screen([degenerate!]);
    expect(html).toContain('データがありません（描ける値がありません）');
    expect(html).toContain('データがありません（正の値が 1 つもない）');
    expect(html).toContain('レーダーには 3 本以上の軸が必要です');
    // 図は 1 つも描かれない。
    expect(html).not.toContain('<svg');
    // それでも自己検査は走っている (0 件ではない)。
    expect(html).toContain('すべて通過');
  });
});
