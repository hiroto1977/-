import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { isHexColor } from '../escape';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * **母体 (OS / ブラウザの枠) へ伝える下地色の母集団** — 2026-09-21 · パス 363。
 *
 * 出どころは 1 つしかない: `src/renderer/styles.css` の `:root { --bg }` (既定 = ライト) と
 * `:root[data-theme="dark"] { --bg }`。ところがこの決定の**写し**は実測で 5 つ在り、
 * 機械が縛っていたのは **1 つだけ**だった:
 *
 * ```
 *   src/main/windowPrefs.ts       #fff7fa    ✅ windowPrefs.test.ts が styles.css と照合
 *   src/renderer/theme.ts         字面なし     ✅ theme.test.ts + e2e (--bg の実値を読む)
 *   scripts/inject-pwa.cjs        #fff7fa    ❌ 何も縛っていない
 *   assets/manifest.webmanifest   #0e0f13    ❌ 何も縛っていない
 *   scripts/build-landing.cjs     #0f1117 ×2 ❌ 同じファイルの中に 2 度
 * ```
 *
 * **縛られていない 3 つのうち 2 つが、今日その場で誤っていた。**
 *
 * ① `assets/manifest.webmanifest` の `theme_color` / `background_color` は `#0e0f13` で、
 *    これは**このアプリの `--bg` がどの版でも取ったことのない値**である (実測:
 *    今のライト `#fff7fa` / 今のダーク `#1b1520` / 再設計前 `#0f1117`。
 *    `git log -S 0e0f13 -- src/renderer/styles.css` は **0 コミット**)。
 *    `background_color` は**インストールした PWA の起動画面**、`theme_color` は
 *    OS がインストール時に控える色で、**どちらも頁の JS より先に読まれる** ——
 *    つまり `syncHostChrome` (パス 318) は構造的に届かない。
 *    パス 318 の docblock は母体を 2 つ (`<meta name="theme-color">` と
 *    デスクトップの窓) しか数えておらず、**3 つ目がこれ**だった。
 *
 * ② `scripts/inject-pwa.cjs` は `content="#fff7fa"` を**注入先 3 文書すべてに**足していた。
 *    ランディング (`_site/index.html` = 公開サイトの根) は `--bg: #0f1117` の暗い頁で、
 *    自分の theme-color を既に持っている —— 実測すると注入後のランディングには
 *    **theme-color が 2 つ** (`#0f1117` と `#fff7fa`) 載っていた。HTML の規定では
 *    最初が勝つので見た目は正しかったが、**どちらが効くかを決めていたのは byte の順序**である。
 *
 * ## この検査が持つもの
 *
 * 母集団は**走査で導く** —— `src` / `scripts` / `assets` のうち母体の色に関わる綴り
 * (`theme-color` / `theme_color` / `background_color` / `setBackgroundColor` / `backgroundColor`)
 * を持つファイル全部。台帳は**両方向**: 新しい持ち主が生えたら落ち、台帳に在るのに
 * 母集団から消えても落ちる。種類ごとに要求が違う (下の `KIND_RULES`)。
 *
 * **色の字面は「コード」だけを見る** (ブロックコメントと、行頭が `//` / `*` の行は落とす)。
 * この docblock 自身が上の表で 4 つの色を挙げているので、注記を読んだままだと
 * 「字面を持たない」の主張が自分の説明文で落ちる (パス 348 と同じ形)。
 */

const req = createRequire(import.meta.url);
const ROOT = path.join(__dirname, '..', '..', '..');
const STYLES = path.join(ROOT, 'src/renderer/styles.css');

/** 母体の色に関わる綴り。母集団はこれを持つファイル。 */
const SPELLINGS = /theme-color|theme_color|background_color|setBackgroundColor|backgroundColor/;
const SCAN_EXT = new Set(['.ts', '.tsx', '.cjs', '.js', '.css', '.html', '.webmanifest']);
const SCAN_ROOTS = ['src', 'scripts', 'assets'];

/** `#rrggbb` の字面。3 桁短縮や `rgba()` は `windowPrefs.ts` の関門が別に拒む。 */
const HEX6 = /#[0-9a-fA-F]{6}\b/g;

/**
 * 注記を落として**コードだけ**にする。
 *
 * ブロックコメントを消し、行頭が `//` または `*` の行を捨てる。**行末の `//` は消さない** ——
 * URL (`https://…`) を含む行を巻き込むと、その行の色を見落とす側に倒れる。
 * 行末注記に色を書いたら落ちるが、それは安全側の誤りである。
 */
export function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*'));
    })
    .join('\n');
}

export function hexLiterals(src: string): string[] {
  return [...codeOnly(src).matchAll(HEX6)].map((m) => m[0].toLowerCase());
}

/** `styles.css` の `:root` (修飾なし = 既定) / `:root[data-theme="dark"]` の `--bg`。 */
function bgFromStyles(qualified: boolean): string {
  const css = readOriginalSource(STYLES);
  // 行頭の錨は `themeTokens.test.ts` の `block()` と同じ形 —— 修飾なしの `:root {` は
  // `:root[data-theme="dark"] {` に当たらない (`:root` の直後が `[` なので `\s*\{` を満たさない)。
  const re = qualified ? /^:root\[data-theme="dark"\]\s*\{([^}]*)\}/m : /^:root\s*\{([^}]*)\}/m;
  const rule = re.exec(css);
  if (rule === null) throw new Error(`styles.css から ${qualified ? 'ダーク' : '既定'} の :root を取り出せませんでした`);
  const body = rule[1]!;
  const bg = /--bg:\s*(#[0-9a-fA-F]{6})\b/.exec(body);
  if (bg === null) throw new Error('styles.css の :root に --bg がありません');
  return bg[1]!.toLowerCase();
}

const LIGHT_BG = bgFromStyles(false);
const DARK_BG = bgFromStyles(true);

function walk(dir: string, out: string[]): void {
  for (const entry of readOriginalDirEntries(dir)) {
    if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!SCAN_EXT.has(path.extname(entry.name))) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
}

/** 母集団 (リポジトリ相対・並び順固定)。 */
export function hostChromeFiles(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(path.join(ROOT, root), files);
  return files
    .filter((f) => SPELLINGS.test(readOriginalSource(f)))
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .sort();
}

type Kind = 'pinned-literal' | 'own-document' | 'derives' | 'no-op' | 'observes' | 'names-only';

interface Row {
  readonly kind: Kind;
  readonly why: string;
}

/**
 * 母体の色に関わるファイル全件 (両方向)。
 *
 * `pinned-literal` … 色の字面を持つ。**コード中の `#rrggbb` は全部ライトの `--bg` と一致**すること。
 * `own-document`   … その文書自身の色 (アプリの `--bg` ではない)。**1 か所で持つ**こと。
 * `derives`        … 読むだけ。**コードに `#rrggbb` を 1 つも持たない**こと。
 * `no-op` / `observes` / `names-only` … 母体へ色を決めない。要求は無いが、台帳に載せて数える。
 */
const HOST_CHROME: Readonly<Record<string, Row>> = {
  'assets/manifest.webmanifest': {
    kind: 'pinned-literal',
    why: 'インストールした PWA の起動画面 (background_color) と OS が控える色 (theme_color)。頁の JS より先に読まれるので syncHostChrome は届かない',
  },
  'src/main/windowPrefs.ts': {
    kind: 'pinned-literal',
    why: '起動時の窓の下地 (BrowserWindow の backgroundColor)。保存値が無い / 読めないときの既定',
  },
  'scripts/build-landing.cjs': {
    kind: 'own-document',
    why: 'ランディングはアプリとは別の配色を持つ独立した頁。theme-color と :root{--bg} の 2 か所が要るので LANDING_BG 1 つから出す',
  },
  'scripts/inject-pwa.cjs': {
    kind: 'derives',
    why: '注入先の文書自身の :root{--bg} を読む (パス 363 までは #fff7fa の手書きで、ランディングに対して誤っていた)',
  },
  'src/renderer/theme.ts': {
    kind: 'derives',
    why: 'syncHostChrome が stylesheet の --bg の実値を読んで meta と橋へ渡す',
  },
  'src/main/main.ts': {
    kind: 'derives',
    why: 'windowPrefs.background をそのまま BrowserWindow へ渡す (自分では決めない)',
  },
  'src/renderer/web-shim.ts': {
    kind: 'no-op',
    why: 'ブラウザ版に窓は無く setColorScheme は何もしない。このファイルの色の字面は書き出す文書 (事業ダッシュボード) 自身の配色で、母体の色ではない',
  },
  'scripts/e2e/core.cjs': { kind: 'observes', why: 'theme suite が meta と --bg の一致を実ブラウザで見る' },
  'scripts/screenshot.cjs': { kind: 'observes', why: '全画面を撮る道具。背景色を指定して撮るだけで、公開物の色は決めない' },
  'scripts/screenshot-dashboard.cjs': { kind: 'observes', why: '全画面を撮る道具。背景色を指定して撮るだけで、公開物の色は決めない' },
  'scripts/overflow-check.cjs': { kind: 'observes', why: '横はみ出しを測る道具。測るために背景を置くだけで、公開物の色は決めない' },
  'scripts/runtime-security-exp.cjs': { kind: 'observes', why: '実行時の守り (contextIsolation ほか) を実機で測る道具。公開物の色は決めない' },
  'scripts/integrity-chain.cjs': {
    kind: 'names-only',
    why: '完全性チェーンの保護対象の説明文に windowPrefs.ts が出てくるだけ。色そのものは持たない',
  },
  /*
   * **この行はパス 363 の作業中にこの検査自身が見つけた。** 法則
   * `copy-pinned-by-parity` の statement に `theme_color` / `background_color` を
   * 書いた瞬間に `laws.ts` が母集団へ入り、「母集団のファイルはすべて台帳に在る」が
   * その場で落ちた —— 走査が生きている証拠なので、避けずに載せる。
   */
  'src/shared/ontology/laws.ts': {
    kind: 'names-only',
    why: '法則 copy-pinned-by-parity の statement が欄の名前を引用するだけ。色そのものは持たない',
  },
  'scripts/lint-forbidden-patterns.cjs': {
    kind: 'names-only',
    why: 'KNOWN_SUPPRESSIONS の注記が inject-pwa.cjs の theme-color の写しを説明するだけ。色そのものは持たない',
  },
};

describe('母体へ伝える下地色 — 走査と針が生きている', () => {
  it('styles.css から既定 (ライト) とダークの --bg が取り出せて、違う値である', () => {
    expect(LIGHT_BG).toMatch(/^#[0-9a-f]{6}$/);
    expect(DARK_BG).toMatch(/^#[0-9a-f]{6}$/);
    expect(LIGHT_BG).not.toBe(DARK_BG);
  });

  it('★ 標本: 色の字面の針は当たる (注記の中は当たらない)', () => {
    expect(hexLiterals("const c = '#abcdef';")).toEqual(['#abcdef']);
    expect(hexLiterals('/* 表: #0e0f13 は古い */\nconst x = 1;')).toEqual([]);
    expect(hexLiterals('// #0e0f13\nconst x = 1;')).toEqual([]);
    // 短縮形は見ない (関門が別に拒む)。regex の文字クラスも色ではない。
    expect(hexLiterals("const c = '#abc'; const re = /#[0-9a-f]{6}/;")).toEqual([]);
  });

  it('母集団が空にならない (走査が死んでいない)', () => {
    expect(hostChromeFiles().length).toBeGreaterThanOrEqual(10);
  });
});

describe('母体へ伝える下地色 — 台帳は両方向', () => {
  it('★ 母集団のファイルはすべて台帳に在る', () => {
    const missing = hostChromeFiles().filter((f) => !Object.hasOwn(HOST_CHROME, f));
    expect(missing, '母体の色に関わるファイルが増えている — 種類と理由を台帳へ').toEqual([]);
  });

  it('★ 台帳の行はすべて母集団に在る', () => {
    const found = new Set(hostChromeFiles());
    const stale = Object.keys(HOST_CHROME).filter((f) => !found.has(f));
    expect(stale, '台帳に在るのに母集団から消えた — 古い登録は次の 1 件を隠す').toEqual([]);
  });

  it('理由が空の行が無い', () => {
    for (const [file, row] of Object.entries(HOST_CHROME)) {
      expect(row.why.length, `${file} の理由が空`).toBeGreaterThan(10);
    }
  });
});

describe('母体へ伝える下地色 — 種類ごとの要求', () => {
  const rows = (kind: Kind): string[] =>
    Object.entries(HOST_CHROME)
      .filter(([, r]) => r.kind === kind)
      .map(([f]) => f);

  it('★ pinned-literal の色は 1 つ残らず styles.css の既定 (ライト) の --bg と一致する', () => {
    const files = rows('pinned-literal');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const lits = hexLiterals(readOriginalSource(path.join(ROOT, file)));
      expect(lits.length, `${file} に色の字面が無い — 針が外れたか、値が消えた`).toBeGreaterThan(0);
      for (const lit of lits) {
        expect(lit, `${file} の ${lit} が styles.css の --bg (${LIGHT_BG}) と違う`).toBe(LIGHT_BG);
      }
    }
  });

  it('★ derives は色の字面を 1 つも持たない (読むのであって写さない)', () => {
    const files = rows('derives');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(
        hexLiterals(readOriginalSource(path.join(ROOT, file))),
        `${file} が色を写している — 出どころは styles.css か、その文書自身`,
      ).toEqual([]);
    }
  });

  it('★ manifest は 2 つの色の欄を持ち、両方が同じ値である', () => {
    const manifest = JSON.parse(readOriginalSource(path.join(ROOT, 'assets/manifest.webmanifest'))) as Record<
      string,
      unknown
    >;
    expect(manifest.theme_color).toBe(LIGHT_BG);
    expect(manifest.background_color).toBe(LIGHT_BG);
  });

  it('★ ランディングは自分の下地を 1 か所 (LANDING_BG) で持ち、2 つの出口がそれを読む', () => {
    const src = readOriginalSource(path.join(ROOT, 'scripts/build-landing.cjs'));
    const decl = [...codeOnly(src).matchAll(/const LANDING_BG = '(#[0-9a-fA-F]{6})';/g)];
    expect(decl.length, 'LANDING_BG の宣言がちょうど 1 つであること').toBe(1);
    expect(src).toContain('<meta name="theme-color" content="${LANDING_BG}">');
    expect(src).toContain(':root{--bg:${LANDING_BG};');
    // 出口のどちらにも字面を書き戻していないこと (肯定形で確かめた上の 2 行の裏)。
    expect(src).not.toContain(`content="${decl[0]![1]!}"`);
  });
});

/*
 * **注入の振る舞い** — 実物 (`scripts/inject-pwa.cjs`) を借りて、3 つの枝と
 * 「決められないなら落とす」を留める。字面ではなく振る舞いで見るのは、
 * 綴りを言い換えられた瞬間に黙る検査にしないため (パス 362)。
 */
describe('inject-pwa — theme-color は文書から導く', () => {
  const { injectPwaTags, documentBackground, themeColorTag } = req('../../../scripts/inject-pwa.cjs') as {
    injectPwaTags: (html: string) => string;
    documentBackground: (html: string) => string | null;
    themeColorTag: (html: string) => string;
  };

  const doc = (head: string): string =>
    `<!doctype html><html><head><meta charset="utf-8">${head}</head><body></body></html>`;
  const colorsIn = (html: string): string[] =>
    [...html.matchAll(/<meta name="theme-color" content="([^"]*)">/g)].map((m) => m[1]!);

  it('★ 自分の theme-color を名乗る文書には足さない (ランディングの形)', () => {
    const html = doc('<meta name="theme-color" content="#0f1117"><style>:root{--bg:#0f1117}</style>');
    expect(themeColorTag(html)).toBe('');
    expect(colorsIn(injectPwaTags(html))).toEqual(['#0f1117']);
  });

  it('★ 名乗っていない文書には、その文書の :root{--bg} を足す (アプリの形)', () => {
    const html = doc('<style>:root{color-scheme:light;--bg: #fff7fa;--x:1}:root[data-theme=dark]{--bg:#1b1520}</style>');
    expect(documentBackground(html)).toBe('#fff7fa');
    expect(colorsIn(injectPwaTags(html))).toEqual(['#fff7fa']);
  });

  it('★ ダークの :root は既定ではないので選ばない', () => {
    const html = doc('<style>:root[data-theme=dark]{--bg:#1b1520}</style>');
    expect(documentBackground(html)).toBeNull();
    expect(colorsIn(injectPwaTags(html))).toEqual([]);
  });

  it('色が読めない文書には足さない (誤った色より無色。manifest の theme_color が受ける)', () => {
    const html = doc('<title>t</title>');
    expect(colorsIn(injectPwaTags(html))).toEqual([]);
    expect(injectPwaTags(html)).toContain('rel="manifest"');
  });

  it('★ 既定を名乗る <style> が食い違ったら落とす (走査順で公開色を決めない)', () => {
    const html = doc('<style>:root{--bg:#111111}</style><style>:root{--bg:#222222}</style>');
    expect(() => documentBackground(html)).toThrow(/2 通り/);
  });

  it('同じ色を 2 つの <style> が言うのは矛盾ではない', () => {
    const html = doc('<style>:root{--bg:#111111}</style><style>:root{--bg:#111111}</style>');
    expect(documentBackground(html)).toBe('#111111');
  });

  /*
   * **写しは 1 つ在る。ずれを留める。**
   *
   * `inject-pwa.cjs` は素の CJS なので `shared/escape.ts` の `isHexColor` を
   * 読めず、`#[0-9a-fA-F]{6}` の写しを持つ (`lint:forbidden` の台帳に理由つきで登録)。
   * 写しが避けられないなら、**同じ標本を両方に通して**答えが割れないことを見る
   * (法則 `copy-pinned-by-parity`)。
   */
  it('★ 受け取る色の形は shared の isHexColor と一致する (写しのパリティ)', () => {
    const samples = ['#fff7fa', '#FFF7FA', '#0f1117', '#abc', '#abcdefff', 'red', 'rgba(1,2,3,.5)', '#12345', ''];
    for (const value of samples) {
      const html = doc(`<style>:root{--bg:${value}}</style>`);
      const got = documentBackground(html);
      expect(got === null, `${value} の扱いが isHexColor と割れている`).toBe(!isHexColor(value));
      if (got !== null) expect(got).toBe(value.toLowerCase());
    }
  });

  it('★ 返す値は必ず isHexColor を満たす', () => {
    const html = doc('<style>:root{--bg:#AbCdEf}</style>');
    const got = documentBackground(html);
    expect(got).not.toBeNull();
    expect(isHexColor(got!)).toBe(true);
  });
});
