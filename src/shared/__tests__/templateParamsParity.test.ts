import { describe, expect, it } from 'vitest';
import { validateParams, type TemplateParams } from '../../main/clients/templates';
import { renderTemplateForWeb, TEMPLATE_CATALOG_FOR_WEB } from '../../renderer/web-templates';
import { escapeXml, isHexColor, safeColor } from '../escape';

/*
 * **テンプレート引数の検査は 2 つある。揃っている所と、意図的に違う所がある。**
 *
 * どちらも「SVG に埋めてよい値か」を決める:
 *
 *   main/clients/templates.ts   validateParams()        → 違反は throw
 *   renderer/web-templates.ts   renderTemplateForWeb()  → 違反は既定値へ
 *
 * 2026-08-22 に実測した差:
 *
 * | 入力                | main            | ブラウザ            |
 * |---------------------|-----------------|---------------------|
 * | 10 万字の title     | **throw**       | 23 万字の SVG を出す |
 * | title に NUL        | **throw**       | **NUL をそのまま出す** |
 * | 色 `red; x`         | **throw**       | 既定色へ落とす (安全) |
 *
 * ## 揃えないのが正しい
 *
 * main の `validateParams` は **IPC 境界の番人**である —— レンダラーから来た
 * payload が main プロセスのファイル書き出しへ渡る手前に立っている。
 * ブラウザ版には**その境界が無い**。呼ぶのはページ自身の UI で、ページの中で
 * 敵のスクリプトが動いているなら既に Vault ごと持って行かれている。
 *
 * **危ないのは「一貫性のために揃えよう」と考えること。** 揃える方向は
 * ブラウザ側の緩さへ寄せる (= main の境界の番人を外す) 側にしか働かない。
 * だから**違いのほうを検査で留める** —— 揃えた瞬間にここが落ちる。
 *
 * ## 揃っていなければならない所
 *
 * **エスケープは同じ実装を使う。** ここがずれると、片方のビルドだけ SVG へ
 * 生の `<` が出る。`lint:forbidden` は「エスケープの再実装」を禁じているが、
 * 禁止は*書き写し*を止めるだけで、**同じ物を使っていること**は別に確かめる
 * 必要がある。
 *
 * **色は「抜けられないこと」だけが揃っていればよい。** 判定は 2 つあり、
 * これも意図的に違う (`shared/escape.ts` が理由を書いている):
 *
 *   isHexColor  書き出し API の**契約**。`#RRGGBB` ちょうどだけ
 *   safeColor   **描画を止めずに危険な値だけ落とす**。3/6/8 桁と
 *               英字だけの名前つきの色 (`red` 等) も通す
 *
 * 最初この 2 つを「同じはず」と決めつけた検査を書いて落とした ——
 * **コードではなく検査の思い込みのほうが誤りだった。** 緩い側が通す値
 * (`#fff` / `red` 等) も引用符・空白・山括弧を含まないので属性から抜けられない。
 * そこを直接留めてある。
 */

const DEF = TEMPLATE_CATALOG_FOR_WEB[0]!;
const NUL = String.fromCharCode(0);

const mainAccepts = (params: Record<string, unknown>): boolean => {
  try {
    validateParams(params, DEF.defaults as unknown as TemplateParams);
    return true;
  } catch {
    return false;
  }
};

describe('揃っていなければならない所 — エスケープと色', () => {
  it('ブラウザ側は共有のエスケープをそのまま使っている (再実装していない)', () => {
    const svg = renderTemplateForWeb(DEF, { title: '<script>&"x"' });
    // 生の `<` は出ない。共有 escapeXml の出力がそのまま入っている。
    expect(svg).not.toContain('<script>');
    expect(svg).toContain(escapeXml('<script>&"x"'));
  });

  it('main 側も同じエスケープを export している (2 つの実装が並ばない)', async () => {
    const mod = await import('../../main/clients/templates');
    expect(mod.escapeXml).toBe(escapeXml);
  });

  /*
   * **色の判定も 2 つあり、これも意図的に違う** (`shared/escape.ts` が理由を
   * 書いている):
   *
   *   isHexColor  書き出し API の**契約**。`#RRGGBB` ちょうどだけ
   *   safeColor   **描画を止めずに危険な値だけ落とす**。3/6/8 桁と
   *               英字だけの名前つきの色 (`red` 等) も通す
   *
   * 私はここを最初「同じはず」と決めつけた検査を書いて落とした。
   * コードではなく**検査の思い込みのほう**が誤りだった。
   */
  it.each([
    ['#0f1117', true, true],
    ['#FFFFFF', true, true],
    ['#fff', false, true],
    ['#0f1117ff', false, true],
    ['red', false, true],
    ['rebeccapurple', false, true],
    ['red; x', false, false],
    ['" onload="alert(1)', false, false],
    ['', false, false],
    ['#0f5facff" onload="x', false, false],
  ])('%s → 契約は %s / 描画側は %s', (color, contractOk, renderOk) => {
    expect(isHexColor(color), '書き出し契約の判定が動いた').toBe(contractOk);
    const kept = safeColor(color, DEF.defaults.accentColor) === color;
    expect(kept, '描画側の判定が動いた').toBe(renderOk);
    // main は契約側 —— 答えは isHexColor と一致する。
    expect(mainAccepts({ accentColor: color })).toBe(contractOk);
  });

  /*
   * **緩い側 (`safeColor`) が通す値も、属性から抜けられない。**
   * 契約より緩いこと自体は問題ではなく、「抜けられるか」が問題である。
   */
  it.each(['#fff', '#0f1117ff', 'red', 'rebeccapurple'])(
    '描画側だけが通す %s も、引用符・空白・山括弧を含まない',
    (color) => {
      expect(safeColor(color, DEF.defaults.accentColor)).toBe(color);
      expect(color).not.toMatch(/["'<>\s]/);
      const svg = renderTemplateForWeb(DEF, { accentColor: color });
      expect(svg).not.toContain('onload');
      expect(svg).toContain(`fill="${color}"`);
    },
  );

  it('どちらのビルドも、色に見せかけた属性割りを SVG へ出さない', () => {
    const svg = renderTemplateForWeb(DEF, { accentColor: '" onload="alert(1)' });
    expect(svg).not.toContain('onload');
    expect(mainAccepts({ accentColor: '" onload="alert(1)' })).toBe(false);
  });
});

describe('意図的に違う所 — main だけが境界の番人を持つ', () => {
  /*
   * ここが「両方 throw する」に変わったら、ブラウザ側に無用な制限が入ったか、
   * main の番人が消えたかのどちらかである。**どちらも意図的な判断であるべき**
   * なので、変えるときはこの検査を一緒に直すことになる。
   */
  it('長すぎる文字列: main は拒む / ブラウザは出す', () => {
    const long = 'a'.repeat(100_000);
    expect(mainAccepts({ title: long }), 'main の長さ制限が消えている').toBe(false);
    // ブラウザ側は落ちずに出し切る (利用者自身の入力・利用者自身のファイル)。
    const svg = renderTemplateForWeb(DEF, { title: long });
    expect(svg.length).toBeGreaterThan(100_000);
  });

  it('NUL: main は拒む / ブラウザはそのまま出す', () => {
    const withNul = 'a' + NUL + 'b';
    expect(mainAccepts({ title: withNul }), 'main の NUL 検査が消えている').toBe(false);
    expect(renderTemplateForWeb(DEF, { title: withNul })).toContain(NUL);
  });

  it('文字列でない値は、どちらも既定値へ落とす (ここは同じ)', () => {
    for (const v of [42, null, undefined, {}, []]) {
      expect(mainAccepts({ title: v })).toBe(true);
    }
    const svg = renderTemplateForWeb(DEF, { title: 42 as unknown as string });
    expect(svg).toContain(escapeXml(DEF.defaults.title));
  });

  /*
   * 「全部違う」でも「全部同じ」でもないことを直接見る —— 表が空虚に
   * 通っていないことの確認。
   */
  it('同じ答えを返す入力と、違う答えを返す入力の両方がある', () => {
    // 同じ: 属性から抜けられる色はどちらも通さない。
    expect(mainAccepts({ accentColor: 'red; x' })).toBe(false);
    expect(safeColor('red; x', DEF.defaults.accentColor)).toBe(DEF.defaults.accentColor);
    // 違う: 長さは main だけが拒む。
    expect(mainAccepts({ title: 'a'.repeat(100_000) })).toBe(false);
    expect(renderTemplateForWeb(DEF, { title: 'a'.repeat(100_000) }).length).toBeGreaterThan(1000);
    // 違う: 名前つきの色は描画側だけが通す。
    expect(mainAccepts({ accentColor: 'red' })).toBe(false);
    expect(safeColor('red', DEF.defaults.accentColor)).toBe('red');
  });
});
