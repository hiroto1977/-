/**
 * **見本 (snapshot) の行と利用者の記録を 1 本にまとめる画面の母集団** と、
 * その画面が「混ざっている」ことを述べているか (2026-09-12 · パス 187)。
 *
 * この形は 3 回直した: パス 120 (チームレーダーのバッジ)・パス 191/192
 * (見本と保存済みの区別) — そして今回、**集計の側**が残っていた。
 * 一覧の行には「デモ」の印が付くのに、見出しのタイル・合計・書面に向く
 * 数字には付かない。実測:
 *
 * | | 合計 (見本を含む) | 自分の分 |
 * | --- | ---: | ---: |
 * | 不動産 家賃収入 (月) | ¥913,000 | ¥90,000 |
 * | 不動産 月次キャッシュフロー | +¥248,000 | +¥5,000 |
 * | 投信 評価額 | ¥8,340,140 | ¥100,000 |
 * | 投信 実質コスト 5年累計 | ¥594,505 | ¥7,128 |
 * | 士業 連携 | 2 名 | 1 名 (顧問料は見本の値) |
 *
 * **母集団は走査で数える** —— 手で並べた台帳は、新しい画面が黙って増えたときに
 * 何も言わない (パス 85 / 95 / 107 で 3 度やらかした形)。印は
 * `user: false as const` —— 見本の行にだけ付く既存の目印。
 */
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

/** 走査する場所 (renderer の画面と共通部品)。 */
const ROOTS = ['src/renderer/pages', 'src/renderer/components'] as const;

/** 見本の行の目印 —— これが在る画面は「見本 + 自分の記録」を 1 本にしている。 */
const DEMO_ROW_MARK = /user:\s*false\s+as\s+const/;

/**
 * 混ざっていることを述べていることの印。
 * `data-…-demo-mix` の目印つきの節を持つこと (画面のテストが掴む所)。
 */
const DISCLOSURE_MARK = /data-[a-z-]*demo-mix\b/;

/**
 * コメントを落とす —— 説明の散文 (「同梱の見本 4 銘柄が入っている人には…」) は
 * 画面が刷る文字ではない。これを落とさないと、**理由を書いたことで検査が落ちる**
 * (`lint:zero-fold` と同じ扱い)。文字列リテラルの中の `//` までは解かないが、
 * この検査が見るのは日本語の一文の有無なので実害は無い。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readOriginalDirEntries(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__snapshots__') continue;
      out.push(...listFiles(path));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

/** 見本の行と利用者の記録を 1 本にしている画面 (走査で数える)。 */
function mergedScreens(): { path: string; src: string }[] {
  const found: { path: string; src: string }[] = [];
  for (const root of ROOTS) {
    for (const path of listFiles(root)) {
      const src = readOriginalSource(path);
      if (DEMO_ROW_MARK.test(src)) found.push({ path, src });
    }
  }
  return found;
}

/**
 * **今分かっている母集団** —— 走査がここより狭くなったら、それは走査が壊れた合図
 * (`user: false as const` の綴りが変わった・ファイルが動いた)。走査が**広く**
 * なるのは正常 (新しい画面) で、その画面は下の規則で断りを要求される。
 */
const KNOWN = [
  'src/renderer/components/ShigyoConsole.tsx',
  'src/renderer/pages/MutualFundsPage.tsx',
  'src/renderer/pages/RealEstatePage.tsx',
] as const;

/*
 * **この検査の粒度はファイル単位である。** ShigyoConsole は 2 本のリストを
 * 混ぜており (連携先・相談履歴)、断りは連携先について述べる —— 相談履歴は
 * 件数も金額もタイルに出さないので、行の「デモ」の印で足りる。ファイル単位の
 * 規則はその区別を見ないので、「1 本について述べていれば通る」。
 * **どのリストについて何を述べるかは画面のテストが持つ**
 * (`pages/__tests__/investmentDemoMixOnScreen.test.ts`)。
 */
describe('見本と自分の記録を混ぜる画面は、混ざっていることを述べる', () => {
  it('★ 母集団が空でない / 既知の画面をすべて含む (走査が死んでいないこと)', () => {
    const paths = mergedScreens().map((s) => s.path).sort();
    expect(paths.length).toBeGreaterThanOrEqual(KNOWN.length);
    for (const known of KNOWN) {
      expect(paths, `${known} が母集団から落ちた (走査が壊れている)`).toContain(known);
    }
  });

  it('★ 母集団のすべてが、混ざっていることを述べる節を持つ', () => {
    const missing = mergedScreens()
      .filter(({ src }) => !DISCLOSURE_MARK.test(src))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it('★ 対照: 目印を消した写しは「述べていない」と判定される (規則が当たること)', () => {
    const src = readOriginalSource('src/renderer/pages/RealEstatePage.tsx');
    expect(DEMO_ROW_MARK.test(src)).toBe(true);
    expect(DISCLOSURE_MARK.test(src)).toBe(true);
    // 目印の綴りを 1 字変えたら当たらない —— 空の検査でないことの標本。
    expect(DISCLOSURE_MARK.test(src.replace(/data-portfolio-demo-mix/g, 'data-portfolio-demo-mx'))).toBe(false);
  });

  it('★ 対照: コメントを落とす規則が、刷られる文面は落とさないこと', () => {
    // 説明のコメントは落ちる。
    expect(stripComments('// 同梱の見本 4 銘柄\nconst x = 1;')).not.toContain('同梱の見本 ');
    expect(stripComments('/* 同梱の見本 4 銘柄 */\nconst x = 1;')).not.toContain('同梱の見本 ');
    // JSX が刷る文面は残る —— ここが落ちると規則が何も守らない。
    expect(stripComments('<div>同梱の見本 {n} 銘柄</div>')).toContain('同梱の見本 ');
  });

  it('★ 断りの文面は共有モジュールが持つ (画面ごとに言い換わらない)', () => {
    // 3 つの文面はすべて data/ の純関数が持ち、画面は呼ぶだけ。
    const invest = readOriginalSource('src/renderer/data/investments.ts');
    expect(invest).toContain('export function demoMixNote');
    expect(invest).toContain('export function fundDemoMixNote');
    expect(readOriginalSource('src/renderer/data/shigyoDirectory.ts')).toContain('export function shigyoDemoMixNote');
    // 画面の側は文面を組み立てない (呼ぶだけ)。
    for (const [path, fn] of [
      ['src/renderer/pages/RealEstatePage.tsx', 'demoMixNote'],
      ['src/renderer/pages/MutualFundsPage.tsx', 'fundDemoMixNote'],
      ['src/renderer/components/ShigyoConsole.tsx', 'shigyoDemoMixNote'],
      ['src/renderer/pages/MutualFundsPage.tsx', 'fundCostPrincipalNote'],
    ] as const) {
      const src = readOriginalSource(path);
      expect(src, `${path} が ${fn} を呼んでいない`).toContain(`${fn}(`);
      const code = stripComments(src);
      expect(code, `${path} が文面を自分で組み立てている`).not.toContain('同梱の見本 ');
    }
  });
});
