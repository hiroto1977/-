/**
 * **操作子の見え方・届き方の測定の道具 `scripts/lib/controls.cjs` の、ブラウザの要らない部分** (2026-10-03 · パス 504)。
 *
 * 道具は 5 つの軸を測る (入力欄の輪郭・焦点の輪・押せる大きさ・キーボードで届く・名前)。**ページの中で走る
 * `measureControls()` と CDP の `axUnnamedControls()` は実機でしか試せない** (実機の suite `controls` の先頭に
 * 「割る物は割る・読める物は割らない」の対照を持つ) が、判定の**数と幾何** —— 3:1 ・2px ・24px ・間隔の例外の円・
 * 何を「割った」と数えるか —— は**純関数**なので、ここで境目ちょうどまで留める。
 *
 * 規則 (WCAG 2.x AA): 非テキストの部品とその状態は下の地に **3:1** (1.4.11)・目標は **24×24 CSS px** か、
 * 半径 12px の円が他の目標に触れない (2.5.8)・焦点の輪は **2px 以上で 3:1** (1.4.11 / 2.4.7)・
 * ホバーでだけ現れる物は焦点でも現れる (2.4.7)。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}
interface Part {
  kind: string;
  widthPx: number;
  ratio: number;
}
interface Math4 {
  MIN_NON_TEXT_RATIO: number;
  MIN_TARGET_PX: number;
  MIN_RING_PX: number;
  MIN_FOCUSED_OPACITY: number;
  isSmall: (r: Box) => boolean;
  centre: (r: Box) => { x: number; y: number };
  spacingConflict: (a: Box, others: Box[]) => number;
  boundaryBest: (border: number, fill: number) => number;
  boundaryOk: (border: number, fill: number) => boolean;
  indicatorVerdict: (parts: Part[]) => { ok: boolean; best: number; bestAny: number };
  revealOk: (opacity: number) => boolean;
}
interface Lib {
  controlMath: () => Math4;
  controlsExpression: (opts?: { focusSample?: number }) => string;
  NAME_ROLES: string[];
  fieldViolations: (rows: { border: number; fill: number; unknown?: boolean }[], C?: Math4) => unknown[];
  sliderViolations: (rows: { best: number; unknown?: boolean; readable?: boolean }[], C?: Math4) => unknown[];
  focusViolations: (rows: { focused: boolean; ok: boolean }[]) => unknown[];
  targetViolations: (rows: { undersized: boolean; spacingOk: boolean }[]) => unknown[];
  groupBy: <T extends { page?: string }>(rows: T[], keyOf: (r: T) => string) => { k: string; n: number; pages: Set<string>; sample: T }[];
}
const lib = createRequire(import.meta.url)('../../../scripts/lib/controls.cjs') as Lib;
const C = lib.controlMath();

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height, right: left + width, bottom: top + height });

describe('数 (WCAG 2.x の基準そのもの)', () => {
  it('★ 非テキストは 3:1・目標は 24px・輪は 2px・焦点で現れる最低の濃さは 0.5', () => {
    expect(C.MIN_NON_TEXT_RATIO).toBe(3);
    expect(C.MIN_TARGET_PX).toBe(24);
    expect(C.MIN_RING_PX).toBe(2);
    expect(C.MIN_FOCUSED_OPACITY).toBe(0.5);
  });
});

describe('小さい目標の判定と、間隔の例外 (WCAG 2.5.8)', () => {
  it('★ 24×24 ちょうどは小さくない・どちらか 1 辺が 24 未満なら小さい', () => {
    expect(C.isSmall(box(0, 0, 24, 24))).toBe(false);
    expect(C.isSmall(box(0, 0, 23.99, 24))).toBe(true);
    expect(C.isSmall(box(0, 0, 24, 23.99))).toBe(true);
    // 細長い目標 (幅が広くても高さが足りない) も小さい —— 面積ではなく 2 辺で見る
    expect(C.isSmall(box(0, 0, 616, 19))).toBe(true);
  });

  it('相手が無ければ衝突しない (-1)', () => {
    expect(C.spacingConflict(box(0, 0, 12, 12), [])).toBe(-1);
  });

  it('★ 小さい相手とは、中心の距離が 24 未満なら円が重なる・24 ちょうどは接するだけで重ならない', () => {
    const a = box(0, 0, 12, 12); // 中心 (6, 6)
    // 中心 (6 + 23.9, 6): 距離 23.9 < 24 → 触れる
    expect(C.spacingConflict(a, [box(23.9, 0, 12, 12)])).toBe(0);
    // 中心 (6 + 24, 6): 距離 24 → 接するだけ
    expect(C.spacingConflict(a, [box(24, 0, 12, 12)])).toBe(-1);
    // 斜めも距離で見る: (6, 6) と (6 + 17, 6 + 17) = 距離 24.04 → 重ならない / (6 + 16, 6 + 16) = 22.6 → 重なる
    expect(C.spacingConflict(a, [box(17, 17, 12, 12)])).toBe(-1);
    expect(C.spacingConflict(a, [box(16, 16, 12, 12)])).toBe(0);
  });

  it('★ 大きい相手とは、a の円 (半径 12) が相手の矩形に 12 未満まで近づくと触れる・12 ちょうどは接するだけ', () => {
    const a = box(0, 0, 12, 12); // 中心 (6, 6)・円の右端 x = 18
    const big = (left: number) => box(left, -50, 100, 100);
    // 相手の左端が 18 (= 中心から 12) → 接するだけ
    expect(C.spacingConflict(a, [big(18)])).toBe(-1);
    // 相手の左端が 17.9 → 触れる
    expect(C.spacingConflict(a, [big(17.9)])).toBe(0);
    // 角に近い相手: 円の中心から矩形の角までの距離で見る (縦横の差だけで見ない)
    const corner = box(15, 15, 100, 100); // 最も近い点 (15, 15): 距離 √(81 + 81) = 12.73 → 重ならない
    expect(C.spacingConflict(a, [corner])).toBe(-1);
    const nearer = box(14, 14, 100, 100); // (14, 14): √(64 + 64) = 11.31 → 触れる
    expect(C.spacingConflict(a, [nearer])).toBe(0);
  });

  it('★ 最初に触れた相手の添字を返す (どの相手が原因かを報せる)', () => {
    const a = box(0, 0, 12, 12);
    const others = [box(100, 100, 12, 12), box(10, 0, 12, 12), box(12, 0, 12, 12)];
    expect(C.spacingConflict(a, others)).toBe(1);
  });

  it('標本: 24px 以上の目標を並べた表 (押せる大きさを満たす行) は、小さい目標の対象にならない', () => {
    expect(C.isSmall(box(0, 0, 44, 44))).toBe(false);
  });
});

describe('入力欄の輪郭 (WCAG 1.4.11)', () => {
  it('★ 枠か塗りの**どちらか**が 3:1 以上なら境界は見える (最大を取る)', () => {
    expect(C.boundaryBest(1.27, 1.05)).toBe(1.27);
    expect(C.boundaryBest(1.27, 3.2)).toBe(3.2);
    expect(C.boundaryOk(3, 1)).toBe(true);
    expect(C.boundaryOk(2.99, 1.05)).toBe(false);
    expect(C.boundaryOk(1, 3)).toBe(true);
    expect(C.boundaryOk(0, 1)).toBe(false); // 枠も無く、塗りも地と同じ
  });

  it('標本: 直す前の実測値 (枠 1.27・塗り 1.05) は割る・直した後の枠 (3.4 以上) は通る', () => {
    expect(C.boundaryOk(1.27, 1.05)).toBe(false);
    expect(C.boundaryOk(1.33, 1.13)).toBe(false);
    expect(C.boundaryOk(3.44, 1.05)).toBe(true);
  });
});

describe('フォーカスの輪 (WCAG 1.4.11 / 2.4.7)', () => {
  const ring = (widthPx: number, ratio: number, kind = 'outline'): Part => ({ kind, widthPx, ratio });

  it('★ 幅 2px 以上で 3:1 以上の部品が 1 つでも在れば適合', () => {
    expect(C.indicatorVerdict([ring(3, 5.6)]).ok).toBe(true);
    expect(C.indicatorVerdict([ring(2, 3)]).ok).toBe(true);
    expect(C.indicatorVerdict([ring(3, 2.99)]).ok).toBe(false);
    expect(C.indicatorVerdict([ring(1.99, 6)]).ok).toBe(false);
  });

  it('★ 1px の枠の色替えだけでは輪と数えない (対比が高くても幅が足りない)・太い物があればそちらで適合', () => {
    const thin = C.indicatorVerdict([ring(1, 4.26, 'border')]);
    expect(thin.ok).toBe(false);
    expect(thin.best).toBe(0);
    expect(thin.bestAny).toBe(4.26);
    const both = C.indicatorVerdict([ring(1, 4.26, 'border'), ring(2, 5.6)]);
    expect(both.ok).toBe(true);
    expect(both.best).toBe(5.6);
  });

  it('★ 半透明の光彩 (直す前の実測 1.5:1 の輪) は割る', () => {
    expect(C.indicatorVerdict([ring(3, 1.55)]).ok).toBe(false);
    expect(C.indicatorVerdict([ring(3, 1.55), ring(3, 1.51, 'ring')]).ok).toBe(false);
  });

  it('輪が 1 つも無い (焦点を取っても何も出ない) は適合ではない', () => {
    const v = C.indicatorVerdict([]);
    expect(v.ok).toBe(false);
    expect(v.best).toBe(0);
    expect(v.bestAny).toBe(0);
  });

  it('★ 焦点で現れる濃さ: ホバーでだけ現れる (opacity 0) 物は、焦点でも現れなければならない', () => {
    expect(C.revealOk(1)).toBe(true);
    expect(C.revealOk(0.5)).toBe(true);
    expect(C.revealOk(0.49)).toBe(false);
    expect(C.revealOk(0)).toBe(false);
    // 直す前の `.fav-toggle` (ホバーしない限り opacity: 0 —— tabindex=0 なので焦点は落ちるのに、輪ごと見えなかった)
    expect(C.revealOk(0)).toBe(false);
  });
});

describe('基準を割った行の数え方', () => {
  it('★ 入力欄: 境界が 3:1 未満の行だけ・測れなかった行 (地が画像) は割ったとは数えない', () => {
    const rows = [
      { border: 1.27, fill: 1.05 },
      { border: 3.4, fill: 1 },
      { border: 1.2, fill: 1.1, unknown: true },
      { border: 0, fill: 3.1 },
    ];
    expect(lib.fieldViolations(rows)).toHaveLength(1);
    // 標本: unknown でなければ同じ行は割る (針が当たる)
    expect(lib.fieldViolations([{ border: 1.2, fill: 1.1 }])).toHaveLength(1);
  });

  it('★ フォーカス: 焦点を取れた行だけが対象 (取れなかった行は測れていないので「割った」と数えない)', () => {
    expect(lib.focusViolations([{ focused: true, ok: false }])).toHaveLength(1);
    expect(lib.focusViolations([{ focused: true, ok: true }])).toHaveLength(0);
    expect(lib.focusViolations([{ focused: false, ok: false }])).toHaveLength(0);
  });

  it('★ 目標: 24px 未満で、間隔の例外も満たさない行だけ', () => {
    expect(lib.targetViolations([{ undersized: true, spacingOk: false }])).toHaveLength(1);
    expect(lib.targetViolations([{ undersized: true, spacingOk: true }])).toHaveLength(0);
    expect(lib.targetViolations([{ undersized: false, spacingOk: false }])).toHaveLength(0);
  });

  it('★ スライダー: 3:1 未満・測れなかった (規則が読めない・地が画像) 行は割ったとは数えない', () => {
    expect(lib.sliderViolations([{ best: 2.9, readable: true }])).toHaveLength(1);
    expect(lib.sliderViolations([{ best: 3, readable: true }])).toHaveLength(0);
    expect(lib.sliderViolations([{ best: 0, readable: false }])).toHaveLength(0);
    expect(lib.sliderViolations([{ best: 1, readable: true, unknown: true }])).toHaveLength(0);
  });

  it('同じ原因の行は 1 つに畳み、画面の数と件数を持つ。画面の多い順', () => {
    const rows = [
      { page: 'a', sig: 'input', n: 1 },
      { page: 'b', sig: 'input', n: 2 },
      { page: 'b', sig: 'input', n: 3 },
      { page: 'c', sig: 'select', n: 4 },
    ];
    const g = lib.groupBy(rows, (r) => r.sig);
    expect(g).toHaveLength(2);
    expect(g[0]!.k).toBe('input');
    expect(g[0]!.n).toBe(3);
    expect([...g[0]!.pages].sort()).toEqual(['a', 'b']);
    expect(g[1]!.k).toBe('select');
  });
});

describe('名前が要る役割 (WCAG 4.1.2)', () => {
  it('★ ボタン・リンク・入力欄・選択・スライダー・タブ ほかを含み、`option` は含まない (名前を持つのは `select` のほう)', () => {
    for (const r of ['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'searchbox']) {
      expect(lib.NAME_ROLES, r).toContain(r);
    }
    expect(lib.NAME_ROLES).not.toContain('option');
    expect(lib.NAME_ROLES).not.toContain('listbox');
  });
});

describe('ページへ送る式 (controlsExpression)', () => {
  it('4 つの関数のソースを 1 つの式へ束ね、構文が通る (評価はしない —— DOM が要る)', () => {
    const e = lib.controlsExpression();
    expect(e.startsWith('(() => {')).toBe(true);
    for (const name of ['function contrastMath()', 'function groundTools(M)', 'function controlMath()', 'function measureControls(M, G, C, opts)']) {
      expect(e, name).toContain(name);
    }
    expect(() => new Function(`return ${e}`)).not.toThrow();
  });

  it('標本の数は JSON としてそのまま渡る (既定は空の設定)', () => {
    expect(lib.controlsExpression()).toContain('{})');
    expect(lib.controlsExpression({ focusSample: 7 })).toContain('{"focusSample":7})');
  });
});
