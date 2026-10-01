/**
 * 配色の選択 (ライト / ダーク / OS に合わせる) —— 2026-09-18 (パス 317)。
 *
 * UI 再設計 (2026-09-17) は `color-scheme: light` を宣言し、OS がダークでもパステルで描いた
 * (ダークを選べる設定は無かった)。ここは**選択を 1 か所で持つ**:
 *
 *   保存 … localStorage `servicehub.theme` (入口 `data/localWrite.ts` を通す。成否は画面が出す)
 *   解決 … 'system' は `matchMedia('(prefers-color-scheme: dark)')` で light / dark に解く
 *   適用 … `<html data-theme="light|dark">` (`styles.css` の `:root[data-theme="dark"]` が読む)
 *
 * 既定は **light** —— 何も選んでいない利用者の見た目を変えない (OS がダークでも再設計の配色のまま。
 * 「OS に合わせる」は選んだ人だけ)。読めなかった (プライベートウィンドウなど) 時も light で描き、
 * 設定画面がその理由を言う (読みの台帳 `storageReadLedger.test.ts`: three-state)。
 *
 * `data-theme` には**解いた後の値**だけを置く —— CSS 側でも `prefers-color-scheme` を見ると
 * ダークのトークン表が 2 か所になる (規則は 1 つ)。OS の変更に追随するのは JS のこの 1 か所。
 *
 * ## デザイン (すっきり / かわいい) —— 2026-09-26
 *
 * 配色 (明るさ) とは別の軸を 1 つ持つ: **デザイン** は形と色の表そのもの。
 *
 *   保存 … localStorage `servicehub.design` (入口 `data/localWrite.ts` を通す)
 *   適用 … `<html data-design="clean|cute">` (`styles.css` のトークン表 4 枚のうち 2 枚を選ぶ)
 *
 * 既定は **すっきり** (白地・細い罫・橙のアクセント・サイドバー | AI チャット | 画面 の 3 列)。
 * パス 322 の「かわいい」(パステル・丸いピル・浮いたカード) は設定画面から選び直せる。
 * 配色とデザインは掛け合わせ (2 × 2) —— どちらを選んでも、もう片方はそのまま残る。
 */
import { readLocalString, writeLocalString, type LocalWriteResult } from './data/localWrite';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

/** localStorage の鍵。`lint:storage` の台帳・`eraseAll.ts` の在庫・読み書きの台帳と同じ綴り。 */
export const THEME_KEY = 'servicehub.theme';
export const DEFAULT_THEME: ThemeChoice = 'light';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
export const THEME_LABELS: Readonly<Record<ThemeChoice, string>> = {
  light: 'ライト',
  dark: 'ダーク',
  system: 'OS に合わせる',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemeChoice(raw: unknown): raw is ThemeChoice {
  return typeof raw === 'string' && (THEME_CHOICES as readonly string[]).includes(raw);
}

/** 保存値を選択に戻す。知らない値・壊れた値は既定 (light) —— 選択は設定画面から選び直せる。 */
export function sanitizeThemeChoice(raw: unknown): ThemeChoice {
  return isThemeChoice(raw) ? raw : DEFAULT_THEME;
}

export function resolveScheme(choice: ThemeChoice, prefersDark: boolean): ResolvedScheme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

export interface ThemeRead {
  readonly choice: ThemeChoice;
  /** 保存領域を読めたか。値が無い (まだ選んでいない) のは `readable: true`。 */
  readonly readable: boolean;
  /** 読めなかった理由 (読めたなら `null`)。入口の文をそのまま画面に渡す。 */
  readonly message: string | null;
}

/** 入口 `readLocalString` を通して読む。読めなければ既定で描き、理由は画面に渡す。 */
export function readThemeChoice(): ThemeRead {
  const got = readLocalString(THEME_KEY);
  return { choice: sanitizeThemeChoice(got.value), readable: got.readable, message: got.message };
}

export function writeThemeChoice(choice: ThemeChoice): LocalWriteResult {
  return writeLocalString(THEME_KEY, choice);
}

type MatchMediaHost = { matchMedia?: (query: string) => MediaQueryList };

/** `matchMedia` が無い環境 (古い WebView・jsdom) や投げる環境は「ダークではない」。 */
export function osPrefersDark(win: MatchMediaHost = window): boolean {
  if (typeof win.matchMedia !== 'function') return false;
  try {
    return win.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** `<html data-theme>` に解いた値を置く。属性は解いた値だけ (選択そのものは localStorage が持つ)。 */
export function applyScheme(scheme: ResolvedScheme, doc: Pick<Document, 'documentElement'> = document): void {
  doc.documentElement.setAttribute('data-theme', scheme);
}

/** 母体へ伝えるのに要る分だけの document (検査は素の object を渡す)。 */
export type HostDoc = Pick<Document, 'documentElement'> & {
  readonly defaultView?: Window | null;
  readonly querySelector?: Document['querySelector'];
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * 母体に解いた配色を伝える (パス 318): PWA の `<meta name="theme-color">` (GitHub Pages の配布物だけが持つ) と、
 * デスクトップ版の窓の下地 (`serviceHub.setColorScheme` → main → `BrowserWindow.setBackgroundColor` と次回起動の色)。
 *
 * 色は stylesheet の `--bg` の**実値**を読む —— palette をここに写さない (main も持たない。持つのは起動の既定 1 値だけで、
 * それは `windowPrefs.test.ts` が stylesheet と照合する)。実値が `#rrggbb` でない (styles の無い jsdom・未定義) なら
 * 何も伝えない。橋の失敗は起動の一瞬の色にしか効かないので戻り値を待たない (fold —— 理由は SESSION_HANDOFF パス 318)。
 *
 * ## ここが届かない母体が 1 つある (2026-09-21 · パス 363)
 *
 * 上の 2 つ (PWA の meta・デスクトップの窓) で母体を数え切ったつもりだったが、**3 つ目が在る** ——
 * `assets/manifest.webmanifest` の `background_color` (インストールした PWA の起動画面) と
 * `theme_color` (OS がインストール時に控える色)。**どちらも頁の JS より先に読まれる**ので、
 * この関数は構造的に届かない。実測するとその 2 欄は `#0e0f13` で、
 * **このアプリの `--bg` がどの版でも取ったことのない値**だった
 * (今のライト `#fff7fa` / 今のダーク `#1b1520` / 再設計前 `#0f1117`)。
 * 届かない以上、縛るのは検査しかない —— 母集団と束縛は `shared/__tests__/hostChromeColorCensus.test.ts`。
 */
export function syncHostChrome(scheme: ResolvedScheme, doc: HostDoc = document): void {
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return;
  const bg = view.getComputedStyle(doc.documentElement).getPropertyValue('--bg').trim();
  if (!HEX_COLOR.test(bg)) return;
  doc.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', bg);
  const bridge = (view as { serviceHub?: { setColorScheme?: (s: ResolvedScheme, b: string) => Promise<unknown> } }).serviceHub;
  if (typeof bridge?.setColorScheme === 'function') {
    void bridge.setColorScheme(scheme, bg).catch(() => undefined);
  }
}

/**
 * 選択を適用し、'system' のあいだは OS の変更に追随する。戻り値は追随をやめる関数
 * (選択を変えるときは前の追随を止めてから次を掛ける —— `selectTheme` がそうする)。
 */
export function applyThemeChoice(
  choice: ThemeChoice,
  deps: { win?: MatchMediaHost; doc?: HostDoc } = {},
): () => void {
  const win = deps.win ?? window;
  const doc = deps.doc ?? document;
  const paint = (scheme: ResolvedScheme) => {
    applyScheme(scheme, doc);
    syncHostChrome(scheme, doc);
  };
  paint(resolveScheme(choice, osPrefersDark(win)));
  if (choice !== 'system' || typeof win.matchMedia !== 'function') return () => {};
  let mql: MediaQueryList;
  try {
    mql = win.matchMedia(DARK_QUERY);
  } catch {
    return () => {};
  }
  if (typeof mql.addEventListener !== 'function') return () => {};
  const onChange = (e: MediaQueryListEvent) => paint(e.matches ? 'dark' : 'light');
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** いま掛かっている OS への追随を止める手。'system' 以外のときは何もしない関数。 */
let stopFollowing: () => void = () => {};

/**
 * 設定画面から選ぶ: 適用してから保存する。**適用は保存に失敗しても行う** (この場では効く) ——
 * 戻り値の成否で画面が「次回のために保存できなかった」と言う。
 */
export function selectTheme(choice: ThemeChoice): LocalWriteResult {
  stopFollowing();
  stopFollowing = applyThemeChoice(choice);
  return writeThemeChoice(choice);
}

/** 起動時 (`main.tsx`): 保存された選択を読んで適用する。描画より先に呼ぶ (ライトの一瞬を作らない)。 */
export function applySavedTheme(): ThemeRead {
  const read = readThemeChoice();
  stopFollowing();
  stopFollowing = applyThemeChoice(read.choice);
  return read;
}


/* ---------------------------------------------------------------------------
 * デザイン (すっきり / かわいい) —— 2026-09-26
 * ------------------------------------------------------------------------- */

export type DesignChoice = 'clean' | 'cute';

/** localStorage の鍵。`lint:storage` の台帳・`eraseAll.ts` の在庫・読み書きの台帳と同じ綴り。 */
export const DESIGN_KEY = 'servicehub.design';
/**
 * 既定は**すっきり** —— 利用者の依頼 (2026-09-26「こんな感じの UI にして」) で既定を替えた。
 * 以前のパステルを選んでいた人も、選んだ記録は持っていない (既定だった) ので、すっきりで開く。
 * 設定画面の「かわいい」1 つで戻せる。
 */
export const DEFAULT_DESIGN: DesignChoice = 'clean';
export const DESIGN_CHOICES: readonly DesignChoice[] = ['clean', 'cute'];
export const DESIGN_LABELS: Readonly<Record<DesignChoice, string>> = {
  clean: 'すっきり',
  cute: 'かわいい',
};

export function isDesignChoice(raw: unknown): raw is DesignChoice {
  return typeof raw === 'string' && (DESIGN_CHOICES as readonly string[]).includes(raw);
}

/** 保存値をデザインに戻す。知らない値・壊れた値は既定 (すっきり) —— 設定画面から選び直せる。 */
export function sanitizeDesignChoice(raw: unknown): DesignChoice {
  return isDesignChoice(raw) ? raw : DEFAULT_DESIGN;
}

export interface DesignRead {
  readonly choice: DesignChoice;
  /** 保存領域を読めたか。値が無い (まだ選んでいない) のは `readable: true`。 */
  readonly readable: boolean;
  /** 読めなかった理由 (読めたなら `null`)。入口の文をそのまま画面に渡す。 */
  readonly message: string | null;
}

/** 入口 `readLocalString` を通して読む。読めなければ既定で描き、理由は画面に渡す。 */
export function readDesignChoice(): DesignRead {
  const got = readLocalString(DESIGN_KEY);
  return { choice: sanitizeDesignChoice(got.value), readable: got.readable, message: got.message };
}

export function writeDesignChoice(choice: DesignChoice): LocalWriteResult {
  return writeLocalString(DESIGN_KEY, choice);
}

/** `<html data-design>` に置く。 */
export function applyDesign(choice: DesignChoice, doc: Pick<Document, 'documentElement'> = document): void {
  doc.documentElement.setAttribute('data-design', choice);
}

/**
 * いま効いているデザイン。**属性から読む** (状態を 2 か所に持たない —— 描画より先に `main.tsx` が
 * 属性を置き、選び直しも属性を書き換える)。知らない値・無い値は既定。
 */
export function currentDesign(doc: Pick<Document, 'documentElement'> = document): DesignChoice {
  return sanitizeDesignChoice(doc.documentElement.getAttribute('data-design'));
}

const designListeners = new Set<() => void>();

/** デザインの変化を聞く (App が列の構成を切り替える)。戻り値は聞くのをやめる関数。 */
export function subscribeDesign(listener: () => void): () => void {
  designListeners.add(listener);
  return () => {
    designListeners.delete(listener);
  };
}

/** いま解けている配色 (属性から)。デザインを替えたとき、母体へ伝え直すのに使う。 */
function currentScheme(doc: Pick<Document, 'documentElement'>): ResolvedScheme {
  return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * 設定画面から選ぶ: 適用 → 母体へ伝え直す → 聞き手へ知らせる → 保存。**適用は保存に失敗しても行う**
 * (配色の `selectTheme` と同じ —— この場では効き、戻り値の成否で画面が「次回のために保存できなかった」と言う)。
 *
 * 母体へ伝え直すのは、下地の色 (`--bg`) がデザインで変わるから —— 窓の下地と PWA の theme-color は
 * 配色だけでなくデザインにも追随する (伝えないと、次回起動の一瞬が前のデザインの色になる)。
 */
export function selectDesign(choice: DesignChoice, doc: HostDoc = document): LocalWriteResult {
  applyDesign(choice, doc);
  syncHostChrome(currentScheme(doc), doc);
  for (const listener of [...designListeners]) listener();
  return writeDesignChoice(choice);
}

/** 起動時 (`main.tsx`): 保存されたデザインを読んで適用する。配色より先に呼ぶ (母体へ伝える --bg が決まる)。 */
export function applySavedDesign(doc: Pick<Document, 'documentElement'> = document): DesignRead {
  const read = readDesignChoice();
  applyDesign(read.choice, doc);
  return read;
}
