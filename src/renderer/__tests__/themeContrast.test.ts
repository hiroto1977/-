/**
 * **トークン表 (4 枚) の文字色 × 地の色の対比** (2026-10-02 · パス 503)。
 *
 * `themeTokens.test.ts` は表の**形** (名前が揃うか・ダークがライトを上書きするか) を見る。ここは表の**中身**を見る ——
 * 「その色の字をその地に置いて読めるか」を WCAG 2.x AA の 4.5:1 (通常の文字) で測る。
 *
 * ## 何が見つかったか (実機で描画済みの色を 4 配色 × 全 75 画面で測った・約 8.9 万の文字要素)
 *
 * 直す前は 4 配色で割った要素が **すっきり × ライト 468 (2.1%)・すっきり × ダーク 455 (2.0%)・かわいい × ライト 10,343 (47.2%)・
 * かわいい × ダーク 577 (2.6%)**。かわいいのライトが半分近くを割っていたのは、**主役の字の白 (`--on-gradient`) が淡い
 * グラデーションの上で 2.1:1** だったため (サイドバーの全項目の記号・ホームの全ボタンの字)。表の中身は誰も測っていなかった —— 形の検査
 * (`themeTokens.test.ts`) は色を 1 つも読まない。
 *
 * ## 規則
 *
 * 1. 台帳 `PAIRS` の対 (文字の色トークン × その字を載せる地のトークン) はどの配色でも 4.5:1 以上。
 *    **地が半透明なら下の地 (`--bg` と、かわいいの光輪 `--glow-*`) に重ねて**測る。グラデーションは全部の停止点で測って最悪を取る。
 * 2. **文字の色トークンは台帳に載る (双方向)** —— `*-fg` / `--on-*` / 意味色などの「字の色」が新しく足されたら、
 *    その字を載せる地を台帳に書かせる (書かずに足すと、描いて初めて 2.1:1 に気付く)。
 * 3. 標本: 測りが空でない (白黒 21:1・既知の割る対は割る)。
 * 4. (製品の写し `shared/readableInk.ts` が測定の道具 `scripts/lib/contrast.cjs` と同じ答えを出すことは、モジュールの隣の
 *    `src/shared/__tests__/readableInk.test.ts` が格子で突き合わせる。)
 *
 * ## ここが見ない物 (実機の suite `contrast` が見る)
 *
 * 表の対が合っていても、**描く側が別の対を作る**ことがある: 塗りの上に地の字 (`--text`) を載せる・意味色の塗りの上に固定の白を載せる・
 * 配色に追随しない面 (濃紺の盤・白い板) の上にトークンの字を載せる。これらはトークン表を見ても出てこない。
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { effectiveTables, type ThemeName } from './themeCss';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}
interface Math3 {
  parse: (s: string) => Rgba | null;
  over: (top: Rgba, bottom: Rgba, extra?: number) => Rgba;
  ratio: (a: Rgba, b: Rgba) => number;
  hex: (c: Rgba) => string;
}
const { contrastMath } = createRequire(import.meta.url)('../../../scripts/lib/contrast.cjs') as { contrastMath: () => Math3 };
const M = contrastMath();

const TABLES = effectiveTables();
const THEMES = Object.keys(TABLES) as ThemeName[];

/** `var(--x)` の連鎖をたどって、その名前が持つ**字面の値**を返す。たどれなければ null。 */
function literal(t: Map<string, string>, name: string, depth = 0): string | null {
  if (depth > 8) return null;
  const v = t.get(name);
  if (v === undefined) return null;
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? literal(t, m[1]!, depth + 1) : v;
}

/** 色の字面 → 不透明な候補の列。グラデーションは停止点ごと・半透明は各 `bases` に重ねる。 */
function candidates(value: string, bases: readonly Rgba[]): Rgba[] {
  if (value === 'transparent') return [...bases];
  const stops = /gradient\(/.test(value)
    ? [...value.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)].map((m) => M.parse(m[0])).filter((c): c is Rgba => c !== null)
    : [M.parse(value)].filter((c): c is Rgba => c !== null);
  if (stops.length === 0) throw new Error(`色として読めない: ${value}`);
  const out: Rgba[] = [];
  for (const s of stops) for (const b of bases) out.push(M.over(s, b, 1));
  return out;
}

/** 面の地 (`--bg`) と、かわいいの光輪 (`--glow-*` が不透明な色のとき) —— 半透明の面が重なる下地の候補。 */
function baseGrounds(t: Map<string, string>): Rgba[] {
  const bg = M.parse(literal(t, '--bg') ?? '');
  if (bg === null) throw new Error('--bg が色として読めない');
  const bases: Rgba[] = [bg];
  for (const name of ['--glow-1', '--glow-2', '--glow-3']) {
    const g = M.parse(literal(t, name) ?? '');
    if (g !== null && g.a >= 1) bases.push(M.over(g, bg, 1));
  }
  return bases;
}

interface Pair {
  /** 字の色のトークン。 */
  readonly ink: string;
  /** その字を載せる地のトークン (全部で 4.5:1 以上)。 */
  readonly grounds: readonly string[];
  /** なぜこの地か (画面のどこに出るか)。 */
  readonly why: string;
}

/** 面の地 —— 本文と補助の字はこのどれの上にも載る。 */
const SURFACES = ['--bg', '--bg-elevated', '--panel', '--bg-sidebar', '--control-bg', '--control-hover-bg', '--drawer-bg', '--empty-bg', '--sidebar-active-bg', '--hero-bg'] as const;

/**
 * 字の色の台帳。**新しい字の色トークンを足したら、その字を載せる地をここへ書く** (規則 2 が両方向で見る)。
 * 地は「その配色で実際に載る面」を並べる —— 載らない面まで並べると、直す必要のない所で落ちる。
 */
const PAIRS: readonly Pair[] = [
  { ink: '--text', grounds: [...SURFACES, '--accent-soft', '--accent-soft-2'], why: '本文' },
  { ink: '--text-muted', grounds: [...SURFACES, '--badge-muted-bg'], why: '補助の字・placeholder 以外の薄い字 (ホームの見出しの下の説明は --hero-bg の上)' },
  { ink: '--placeholder', grounds: ['--control-bg', '--bg-elevated', '--bg'], why: '入力欄の見本の字 (サイドバーの検索・チャット欄・各画面の入力欄)' },
  { ink: '--accent-strong', grounds: ['--bg', '--bg-elevated', '--panel', '--bg-sidebar', '--accent-soft', '--sidebar-active-bg'], why: '強調の字・リンク・選択中の項目名' },
  { ink: '--heading-accent', grounds: ['--bg', '--bg-elevated', '--panel', '--bg-sidebar'], why: '節の見出し・サイドバーの区分名' },
  { ink: '--success', grounds: ['--bg', '--bg-elevated', '--panel', '--control-bg', '--bg-sidebar'], why: '成功・利益・良好の字' },
  { ink: '--warning', grounds: ['--bg', '--bg-elevated', '--panel', '--control-bg', '--bg-sidebar'], why: '注意の字' },
  { ink: '--danger', grounds: ['--bg', '--bg-elevated', '--panel', '--control-bg', '--bg-sidebar'], why: '危険・赤字・エラーの字' },
  { ink: '--info', grounds: ['--bg', '--bg-elevated', '--panel', '--control-bg', '--bg-sidebar'], why: '情報の字 (対応中・独占業務の札・グラフの現在値)' },
  // 塗りの上の字 —— 塗りが変われば字も変わる (塗りの上へ地の字を載せると読めない)
  { ink: '--on-accent', grounds: ['--accent'], why: '単色の主役の塗り (選択中のボタン・タブ・チップ) の上の字' },
  { ink: '--on-gradient', grounds: ['--gradient'], why: '主役のグラデーション (primary ボタン・トップバーの記号・先頭へ戻る) の上の字' },
  { ink: '--on-status', grounds: ['--success', '--danger', '--warning', '--info', '--text-muted'], why: '意味色の塗り (利益率の札・総合リスクの札・状態の札) の上の字 (= 地 --bg)' },
  // 部品ごとの対
  { ink: '--kbd-fg', grounds: ['--kbd-bg'], why: 'ショートカットの札' },
  { ink: '--chip-fg', grounds: ['--chip-bg'], why: 'チップ' },
  { ink: '--icon-fg', grounds: ['--icon-bg'], why: 'サイドバーの項目の記号' },
  { ink: '--icon-active-fg', grounds: ['--icon-active-bg'], why: '選択中のサイドバー項目の記号' },
  { ink: '--topbar-icon-fg', grounds: ['--topbar-icon-bg'], why: 'トップバーの記号' },
  { ink: '--badge-fg', grounds: ['--accent-soft-2'], why: '札 (既定)' },
  { ink: '--badge-warn-fg', grounds: ['--badge-warn-bg'], why: '札 (注意)' },
  { ink: '--badge-ok-fg', grounds: ['--badge-ok-bg'], why: '札 (良好)' },
  { ink: '--user-bubble-fg', grounds: ['--user-bubble-bg'], why: 'チャットの利用者の吹き出し' },
  { ink: '--item-active-fg', grounds: ['--sidebar-active-bg'], why: '選択中のサイドバー項目の名前' },
  { ink: '--sidebar-title-fg', grounds: ['--bg-sidebar'], why: 'サイドバーの見出し (サービスハブ)' },
  { ink: '--button-hover-fg', grounds: ['--control-hover-bg'], why: '押せる物にポインタを載せたときの字' },
];

/** 「字の色」と名乗るトークン名 (規則 2 の母集団)。 */
const INK_NAME = /^--(?:on-[\w-]+|[\w-]+-fg|text|text-muted|placeholder|accent-strong|heading-accent|success|warning|danger|info)$/;

function measure(theme: ThemeName, pair: Pair): { ground: string; ratio: number }[] {
  const t = TABLES[theme];
  const bases = baseGrounds(t);
  const out: { ground: string; ratio: number }[] = [];
  const inkLit = literal(t, pair.ink);
  if (inkLit === null) throw new Error(`${theme}: ${pair.ink} が定義されていない / たどれない`);
  for (const g of pair.grounds) {
    const gLit = literal(t, g);
    if (gLit === null) throw new Error(`${theme}: 地 ${g} が定義されていない / たどれない`);
    // 字の色は、その地の上に重ねて (半透明の字は地に溶ける) 測る。地の候補ごとの最悪を取る。
    let worst = Infinity;
    for (const ground of candidates(gLit, bases)) {
      for (const ink of candidates(inkLit, [ground])) worst = Math.min(worst, M.ratio(ink, ground));
    }
    out.push({ ground: g, ratio: worst });
  }
  return out;
}

describe.each(THEMES)('トークン表の対比 —— %s', (theme) => {
  it('★ 台帳の字 × 地の対は、すべて 4.5:1 以上 (WCAG 2.x AA・通常の文字)', () => {
    const failing: string[] = [];
    for (const pair of PAIRS) {
      for (const { ground, ratio } of measure(theme, pair)) {
        if (ratio < 4.5) failing.push(`${pair.ink} on ${ground}: ${ratio.toFixed(2)}:1 (${pair.why})`);
      }
    }
    expect(failing, '読めない対 —— 字の色か地の色を直す (字を載せる面を替えるのでもよい)').toEqual([]);
  });

  it('★ 字の色トークンは台帳に載る (双方向 —— 足したら地を書かせる・台帳に載せた名前は表に在る)', () => {
    const t = TABLES[theme];
    const declaredInks = [...t.keys()].filter((n) => INK_NAME.test(n));
    const inLedger = new Set(PAIRS.map((p) => p.ink));
    const missing = declaredInks.filter((n) => !inLedger.has(n));
    expect(missing, '台帳に無い字の色 (その字を載せる地を PAIRS に書く)').toEqual([]);
    const gone = [...inLedger].filter((n) => !t.has(n));
    expect(gone, '台帳に在るが表に無い名前').toEqual([]);
    // 地のトークンも実在する (綴り違いで測りが黙って空になるのを防ぐ)
    const grounds = new Set(PAIRS.flatMap((p) => p.grounds));
    expect([...grounds].filter((g) => !t.has(g)), '台帳が名指しする地が表に無い').toEqual([]);
  });
});

describe('トークン表の対比 —— 標本 (測りが空でない)', () => {
  it('白と黒は 21:1・同じ色は 1:1', () => {
    const w = M.parse('#ffffff')!;
    const k = M.parse('#000000')!;
    expect(M.ratio(w, k)).toBeCloseTo(21, 5);
    expect(M.ratio(w, w)).toBeCloseTo(1, 5);
  });

  it('★ 既知の読めない対は割る (直す前の姿: かわいいのライトの白い字 × 主役のグラデーション)', () => {
    // 直す前の `--on-gradient: #ffffff` を主役のグラデーションの最悪の停止点 (#ff8fc0) に置くと 2.1:1。
    const white = M.parse('#ffffff')!;
    const pink = M.parse('#ff8fc0')!;
    expect(M.ratio(white, pink)).toBeLessThan(2.2);
    expect(M.ratio(white, pink)).toBeLessThan(4.5);
    // 今の値はその最悪の停止点でも読める
    const now = TABLES['かわいい × ライト'];
    const ink = M.parse(literal(now, '--on-gradient')!)!;
    expect(M.ratio(ink, pink)).toBeGreaterThanOrEqual(4.5);
  });

  it('★ 台帳は実際に 4 枚の表へ当たる (宣言した対はどれも測られる・床: 対 24 件以上)', () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(24);
    const declared = PAIRS.reduce((n, p) => n + p.grounds.length, 0);
    for (const theme of THEMES) {
      let n = 0;
      for (const pair of PAIRS) n += measure(theme, pair).length;
      // 測りが黙って対を飛ばさない (名前が解けない対は `measure` が投げる)。実測は 4 枚とも宣言と同数。
      expect(n, `${theme}: 測った対の数`).toBe(declared);
    }
    // 半透明・グラデーションの地まで測っている (かわいいのサイドバーは半透明・選択中の項目はグラデーション)
    const cuteLight = TABLES['かわいい × ライト'];
    expect(candidates(literal(cuteLight, '--sidebar-active-bg')!, baseGrounds(cuteLight)).length).toBeGreaterThanOrEqual(2);
    expect(candidates(literal(cuteLight, '--bg-sidebar')!, baseGrounds(cuteLight)).length).toBeGreaterThanOrEqual(1);
  });
});
