/**
 * **非テキストの色の台帳** (2026-10-03 · パス 504) —— 入力欄の枠・キーボードの焦点の輪・選んだ状態の塗りが使ってよい色と、
 * その色が隣り合う下の地。
 *
 * 2 つの検査が読む (検査ファイルから別の検査ファイルを import すると中の `describe` がもう一度走るので、台帳だけをここへ出した):
 *
 *   - `themeNonTextContrast.test.ts` —— 台帳の色 × 地の対が 4 配色すべてで 3:1 以上 (WCAG 2.x 1.4.11)。CSS の規則が使う色は台帳に在ること
 *   - `controlsCensus.test.ts` —— TSX の `style={{ border: … }}` が使う色は台帳に在ること (構文木)
 *
 * つまり「入力欄の枠にどの色を使ってよいか」の**答えは 1 つ**で、使う側 (CSS・TSX) はそれを越えられず、
 * 台帳の色は表の側で 3:1 を測っている。**色を足したいときは、まず台帳へ (その色が載る地を書いて) 足す** —— 測りが先、使うのが後。
 */

export interface Mark {
  /** 色のトークン (枠・輪・塗り)。別名 (`--focus-outline` = `--accent-strong`) も載せてよい —— 使う側との照合は本体の名前へ解いてから行う。 */
  readonly mark: string;
  /** その色が実際に隣り合う地のトークン (全部で 3:1 以上)。 */
  readonly grounds: readonly string[];
  /** 何に使うか。 */
  readonly why: string;
}

/** 入力欄が載る面。ホームの見出し帯 (`--hero-bg`) は入力欄が載らないので含めない (下の `UNMEASURED_GROUNDS`)。 */
export const FIELD_SURFACES = [
  '--bg',
  '--bg-elevated',
  '--panel',
  '--bg-sidebar',
  '--control-bg',
  '--control-hover-bg',
  '--drawer-bg',
  '--sidebar-active-bg',
  '--accent-soft',
  '--accent-soft-2',
  '--badge-muted-bg',
  '--empty-bg',
] as const;

/** 状態の色 (エラー・注意・成功・情報) が載る面 —— 文字の台帳 (`themeContrast.test.ts`) が 4.5:1 で測っている地と同じ。 */
export const STATE_SURFACES = ['--bg', '--bg-elevated', '--panel', '--bg-sidebar', '--control-bg'] as const;

/**
 * 非テキストの色の台帳。**CSS・TSX が入力欄の枠・輪・塗りに使うトークンは、ここに載っているものだけ。**
 */
export const MARKS: readonly Mark[] = [
  { mark: '--control-border', grounds: FIELD_SURFACES, why: '入力欄・選択欄・複数行欄の既定の枠 (中身が空のとき輪郭を示す唯一の物)' },
  { mark: '--text-muted', grounds: FIELD_SURFACES, why: 'ポインタを載せた入力欄の枠 (既定より濃くする。薄い --list-hover-border へ替えると既定より弱くなる)・情報の指摘の枠' },
  { mark: '--focus-outline', grounds: [...FIELD_SURFACES, '--hero-bg'], why: 'キーボードの焦点の輪・焦点を持つ入力欄の枠' },
  { mark: '--accent-strong', grounds: [...FIELD_SURFACES, '--hero-bg'], why: '選んだ状態の塗り (checkbox / radio / range の accent-color)・スライダーのつまみの縁' },
  { mark: '--danger', grounds: STATE_SURFACES, why: '「このままでは無効」と指された入力欄・読めない値の入力欄の枠' },
  { mark: '--warning', grounds: STATE_SURFACES, why: '「要確認」と指された入力欄・0 として計算される入力欄の枠' },
  { mark: '--success', grounds: STATE_SURFACES, why: '問題なしと確かめた入力欄の枠' },
  { mark: '--info', grounds: STATE_SURFACES, why: '情報の入力欄の枠' },
];

/**
 * 台帳に載せない (色, 地) の組。**理由が要り、組は実際に 3:1 を割ること** (割らない組が残っていれば台帳へ移す —— 両方向)。
 */
export const UNMEASURED_GROUNDS: readonly { readonly mark: string; readonly ground: string; readonly why: string }[] = [
  {
    mark: '--control-border',
    ground: '--hero-bg',
    why: 'ホームの見出し帯の上に入力欄は載らない (かわいい × ダークで 2.4:1)。載せたら実機の suite `controls` が実際の下の地で測って落とす',
  },
];

/** 「非テキストの色」と名乗るトークン名 (台帳の母集団)。`--focus-ring` は半透明の飾りで輪ではない。 */
export const MARK_NAME = /^--(?:control-border|focus-outline)$/;

/** WCAG 2.x 1.4.11 の下限。 */
export const MIN_NON_TEXT = 3;

/**
 * トークン名を**本体の名前**へ解く: `var(--別名)` の連鎖をたどり、最後に着いた名前を返す。
 * (`--text-mute` → `--text-muted`・`--focus-outline` → `--accent-strong`)。たどれなければ元の名前のまま。
 */
export function canonicalToken(name: string, light: ReadonlyMap<string, string>, depth = 0): string {
  const v = light.get(name);
  if (v === undefined || depth > 8) return name;
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? canonicalToken(m[1]!, light, depth + 1) : name;
}
