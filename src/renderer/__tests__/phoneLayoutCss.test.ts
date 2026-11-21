/**
 * **スマホ幅で右が切れない並び** (2026-11-18) —— 利用者の実機 (412px) で見つかった 3 つの崩れが戻らないこと。
 *
 * 1. **事業ダッシュボードの 2 列** —— 240px 固定の絞り込みの列の右に本文を並べたままだったので、本文が約 100px に
 *    潰れて右が切れていた (枠が横を切るので、横へ動かして見ることもできない)。狭い枠では縦に積む。
 *    切り替えは**画面の幅ではなく枠の幅** (`@container`) で決める —— 同じ画面は村の殻の役場の窓にも開く。
 * 2. **状態の帯の名前 (`.status-bar .who`)** —— 幅の基準が 0 だったので、後ろの折り返さない札 (担当士業) と同じ行に
 *    押し込まれ、1 字ずつの縦書きに潰れることが在った。基準を持たせて、収まらない札を次の行へ送る。
 * 3. **列の数を固定した格子** —— `repeat(5, 1fr)` のような格子は狭い枠でも 5 列のままで、中身が枠を越える。
 *    事業ダッシュボードの格子は、収まる数だけ並べる形 (`auto-fit` + `minmax(min(…px, 100%), 1fr)`) で書く。
 *
 * 描いた結果 (どの画面にも右が切れた要素が無いこと) は実機の suite `opened` が全画面で測る。
 * ここは**規則の綴り**を留める (値を写さず、向きと有無だけを見る)。
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { declOf, rules } from './themeCss';
import { readOriginalDir, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';
import { wrapColumns } from '../components/wrapColumns';

const BUSINESS = readOriginalSource(resolve(new URL('../pages/BusinessPage.tsx', import.meta.url).pathname));

/** 列の数を固定した格子 (`repeat(3, 1fr)` / `1fr 1fr 1fr`)。 */
const FIXED_COLUMNS = /gridTemplateColumns:\s*'(?:repeat\(\s*\d+\s*,|(?:1fr\s+)+1fr')/;

describe('事業ダッシュボード: 狭い枠では絞り込みと本文を縦に積む', () => {
  it('★ 画面の根は枠として名乗り (container-type)、2 列は基本の規則では横並び', () => {
    const page = rules().find((r) => r.selector === '.biz-page' && r.context === '');
    expect(declOf(page!, 'container-type')).toBe('inline-size');
    const layout = rules().find((r) => r.selector === '.biz-layout' && r.context === '');
    expect(declOf(layout!, 'display')).toBe('flex');
    expect(declOf(layout!, 'flex-direction'), '基本は横並び (flex の既定)').toBeUndefined();
    const main = rules().find((r) => r.selector === '.biz-main' && r.context === '');
    expect(declOf(main!, 'min-width'), '本文は中身の幅で枠を押し広げない').toBe('0');
  });

  it('★ 枠が狭いとき (@container) は縦に積み、絞り込みは固定の幅と追従をやめる', () => {
    const narrow = rules().filter((r) => r.context.startsWith('@container'));
    const layout = narrow.find((r) => r.selector === '.biz-layout');
    expect(layout, '狭い枠の .biz-layout の規則が在る').toBeDefined();
    expect(layout!.context).toMatch(/max-width:\s*\d+px/);
    expect(declOf(layout!, 'flex-direction')).toBe('column');
    const side = narrow.find((r) => r.selector === '.biz-sideboard');
    expect(declOf(side!, 'flex'), '240px 固定をやめる').toBe('none');
    expect(declOf(side!, 'position'), '追従 (sticky) をやめる').toBe('static');
    expect(declOf(side!, 'max-height')).toBe('none');
  });

  it('★ 画面はその規則の class を使い、2 列の並びを inline の style に書き戻していない', () => {
    const code = stripComments(BUSINESS);
    for (const cls of ['biz-page', 'biz-layout', 'biz-sideboard', 'biz-main']) {
      expect(code, cls).toContain(`className="${cls}"`);
    }
    expect(code, '絞り込みの列の幅を inline で固定しない').not.toContain("flex: '0 0 240px'");
    // 標本: 針は直す前の綴りに当たる。
    expect("style={{ flex: '0 0 240px', display: 'flex' }}").toContain("flex: '0 0 240px'");
  });

  it('★ 列の数を固定した格子が無い (収まる数だけ並べる)', () => {
    const lines = stripComments(BUSINESS).split('\n');
    const fixed = lines.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => FIXED_COLUMNS.test(l));
    expect(fixed.map(({ n, l }) => `${n}: ${l.trim()}`)).toEqual([]);
    const grids = lines.filter((l) => l.includes('gridTemplateColumns'));
    expect(grids.length, '格子そのものは在る (走査が空虚でない)').toBeGreaterThanOrEqual(6);
    for (const l of grids) expect(l, l.trim()).toMatch(/repeat\(auto-fi(?:t|ll), minmax\(min\(\d+px, 100%\), 1fr\)\)/);
  });

  it('標本: 針は直す前の 3 つの綴りを落とし、今の綴りは落とさない', () => {
    expect(FIXED_COLUMNS.test("gridTemplateColumns: 'repeat(5, 1fr)',")).toBe(true);
    expect(FIXED_COLUMNS.test("gridTemplateColumns: '1fr 1fr 1fr',")).toBe(true);
    expect(FIXED_COLUMNS.test("gridTemplateColumns: '1fr 1fr 1fr 1fr',")).toBe(true);
    expect(FIXED_COLUMNS.test("gridTemplateColumns: 'repeat(auto-fit, minmax(min(84px, 100%), 1fr))',")).toBe(false);
  });
});

describe('状態の帯の名前は、後ろの札に押し潰されない', () => {
  it('★ .status-bar .who の幅の基準は 0 でなく、最小の幅を持つ', () => {
    const who = rules().find((r) => r.selector === '.status-bar .who' && r.context === '');
    expect(who).toBeDefined();
    const flex = declOf(who!, 'flex') ?? '';
    const basis = flex.trim().split(/\s+/)[2] ?? '';
    expect(/^\d+px$/.test(basis), `flex の 3 つ目 (基準) を px で持つ (${flex})`).toBe(true);
    expect(parseFloat(basis)).toBeGreaterThanOrEqual(100);
    const min = declOf(who!, 'min-width') ?? '';
    expect(min, '枠より広くは要求しない (min(…px, 100%))').toMatch(/^min\(\d+px, 100%\)$/);
    const bar = rules().find((r) => r.selector === '.status-bar' && r.context === '');
    expect(declOf(bar!, 'flex-wrap'), '収まらない要素は次の行へ送る').toBe('wrap');
  });

  it('標本: 針は直す前の形 (flex: 1 / min-width: 0) を落とす', () => {
    const before = '.status-bar .who { display: flex; flex: 1; min-width: 0; }';
    const who = rules(before).find((r) => r.selector === '.status-bar .who');
    const basis = (declOf(who!, 'flex') ?? '').trim().split(/\s+/)[2] ?? '';
    expect(/^\d+px$/.test(basis)).toBe(false);
    expect(declOf(who!, 'min-width')).toBe('0');
  });

  it('対照: @container の中の規則も走査に映る (降りないと 1 つも見えない)', () => {
    const css = '.a { color: red; }\n@container (max-width: 720px) { .a { flex-direction: column; } }';
    const inner = rules(css).filter((r) => r.context.startsWith('@container'));
    expect(inner.map((r) => r.selector)).toEqual(['.a']);
    expect(declOf(inner[0]!, 'flex-direction')).toBe('column');
  });
});

/**
 * ## 2 度目の測定 (同じ日): 「横へ動かさないと見えない」画面が 8 つ残っていた
 *
 * 1 度目は「切れて見えない」要素だけを数えた。実機の suite が税金の画面の折れ線を指したので、
 * 「枠の中で横へ動かせば見える」物 (表を除く) も 412px で数えると、8 画面に在った ——
 * 列の数を固定した格子 (税金・品質ほか 6 画面 24 か所)・最小の幅を固定した欄・折り返さない札・幅の固定された並び。
 * ここはその綴りが戻らないことを留める (描いた結果は実機の suite `opened` が測る)。
 */
const RENDERER = resolve(new URL('..', import.meta.url).pathname);

/** 画面と部品の `.tsx` (直下)。 */
function screenSources(): ReadonlyArray<{ file: string; code: string }> {
  const out: Array<{ file: string; code: string }> = [];
  for (const dir of ['pages', 'components']) {
    for (const name of readOriginalDir(resolve(RENDERER, dir))) {
      if (!name.endsWith('.tsx')) continue;
      out.push({ file: `${dir}/${name}`, code: stripComments(readOriginalSource(resolve(RENDERER, dir, name))) });
    }
  }
  return out;
}

describe('画面と部品: 列の数を固定した格子を書かない', () => {
  it('★ pages / components のどの画面にも、列の数を固定した格子が無い', () => {
    const sources = screenSources();
    expect(sources.length, '走査が空虚でない').toBeGreaterThanOrEqual(100);
    const fixed = sources.flatMap(({ file, code }) =>
      code
        .split('\n')
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => FIXED_COLUMNS.test(l))
        .map(({ l, n }) => `${file}:${n}: ${l.trim()}`),
    );
    expect(fixed).toEqual([]);
    // 格子そのものは使われている (針が何も見ていないのではない)。
    const grids = sources.reduce((sum, { code }) => sum + (code.match(/gridTemplateColumns/g)?.length ?? 0), 0);
    expect(grids).toBeGreaterThanOrEqual(60);
    const wrapped = sources.reduce((sum, { code }) => sum + (code.match(/wrapColumns\(/g)?.length ?? 0), 0);
    expect(wrapped, '折り返す格子の指定を通る所').toBeGreaterThanOrEqual(24);
  });

  it('wrapColumns: 広い枠では N 列・1 列が minPx を割ると折り返し・枠より広くは要求しない', () => {
    expect(wrapColumns(4, 150)).toBe('repeat(auto-fill, minmax(min(100%, max(150px, calc((100% - 36px) / 4))), 1fr))');
    expect(wrapColumns(2, 200)).toBe('repeat(auto-fill, minmax(min(100%, max(200px, calc((100% - 12px) / 2))), 1fr))');
    expect(wrapColumns(3, 170, 8)).toBe('repeat(auto-fill, minmax(min(100%, max(170px, calc((100% - 16px) / 3))), 1fr))');
    // 固定の列数の針には当たらない。
    expect(FIXED_COLUMNS.test(`gridTemplateColumns: '${wrapColumns(4, 150)}',`)).toBe(false);
  });
});

describe('画面と部品: 幅を固定して枠の右へ出ていた並びが戻らない', () => {
  const source = (file: string): string => {
    const hit = screenSources().find((s) => s.file === file);
    if (hit === undefined) throw new Error(`ファイルが無い: ${file}`);
    return hit.code;
  };

  it('★ 秒単位の表示 (RealtimeTicker) の行は折り返し、折れ線は枠に合わせて縮む', () => {
    const code = source('components/RealtimeTicker.tsx');
    expect(code).toContain('data-ticker-row');
    expect(code).toContain("flexWrap: 'wrap'");
    expect(code, '3 列の格子へ戻していない').not.toContain("minmax(120px, 1fr) minmax(140px, auto) auto");
    expect(code.match(/maxWidth: '100%'/g)?.length, '折れ線の svg (2 つ) は枠より広くならない').toBe(2);
    // 標本: 針は直す前の綴りに当たる。
    expect("gridTemplateColumns: 'minmax(120px, 1fr) minmax(140px, auto) auto',").toContain(
      'minmax(120px, 1fr) minmax(140px, auto) auto',
    );
  });

  it('★ 担当士業の札は折り返せる (nowrap にしない)', () => {
    const code = source('components/StatusBar.tsx');
    const at = code.indexOf('data-duty-owner={serviceId}');
    expect(at).toBeGreaterThan(0);
    // 札の開きタグ (属性の中の矢印 `=>` で切らないよう、中身の文の手前までを取る)。
    const tag = code.slice(at, code.indexOf('担当:', at));
    expect(tag).not.toContain("whiteSpace: 'nowrap'");
    expect(tag).toContain("maxWidth: '100%'");
    expect("style={{ fontSize: 11, whiteSpace: 'nowrap' }}").toContain("whiteSpace: 'nowrap'");
  });

  it('★ 数値の札 (Stat) は格子の列を押し広げず、値は中で折り返す', () => {
    const code = source('components/Stat.tsx');
    expect(code).toContain('minWidth: 0');
    expect(code).toContain("overflowWrap: 'anywhere'");
  });

  it('★ 最小の幅は枠より広く要求しない (設定の数値の行・記録の行・基準価額の欄・書式の見本)', () => {
    expect(source('components/ParametersPanel.tsx')).not.toContain("'minmax(220px, 1fr) auto'");
    expect(source('components/ParametersPanel.tsx')).toContain("'minmax(0, 1fr) auto'");
    expect(source('components/ServiceActionPanel.tsx')).not.toContain("'1fr 140px auto'");
    expect(source('components/ServiceActionPanel.tsx')).toContain("'minmax(0, 1fr) minmax(0, 140px) auto'");
    expect(source('pages/MutualFundsPage.tsx')).not.toContain('minWidth: 240 ');
    expect(source('pages/MutualFundsPage.tsx')).toContain("minWidth: 'min(240px, 100%)'");
    expect(source('pages/TemplatesPage.tsx')).not.toContain('minWidth: 360,');
    expect(source('pages/TemplatesPage.tsx')).toContain("minWidth: 'min(360px, 100%)'");
    // 標本: 針は直す前の綴りに当たる。
    expect("gridTemplateColumns: 'minmax(220px, 1fr) auto',").toContain("'minmax(220px, 1fr) auto'");
    expect("gridTemplateColumns: '1fr 140px auto', gap: 8").toContain("'1fr 140px auto'");
    expect('gap: 2, flex: 1, minWidth: 240 }}>').toContain('minWidth: 240 ');
    expect('padding: 16,\n minWidth: 360,').toContain('minWidth: 360,');
  });
});

