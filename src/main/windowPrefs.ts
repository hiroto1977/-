/**
 * 窓の下地色と配色 (2026-09-18 · パス 318)。
 *
 * renderer が配色 (ライト / ダーク / OS に合わせる) を解いた瞬間に `app:setColorScheme` で伝えてくる
 * **解いた後の scheme** と、stylesheet の `--bg` の**実値**を userData に残す。次の起動は `BrowserWindow`
 * を作る前にこれを読み、窓の下地をその色で塗る —— 保存した配色と違う色の一瞬 (淡いピンクの窓) を作らない。
 *
 * **色の出所は renderer の stylesheet だけ** —— main は palette を持たない。受け取る値は `#rrggbb` の形
 * だけを通す (信用できない文字列を `setBackgroundColor` に渡さない)。中身は scheme と色の 2 語で、秘密も
 * 個人情報も無いので封緘しない (台帳 `__tests__/atRestPolicy.test.ts` に理由)。
 *
 * 読めなかった・壊れていた・大きすぎたときは既定 (ライトの下地) で起動する —— 失うのは起動の一瞬の色
 * だけで、renderer が起動後にまた伝えてくるので次回には戻る (fold。理由は SESSION_HANDOFF パス 318)。
 */
import { app } from 'electron';
import path from 'node:path';
import { atomicWriteFile } from './atomicWrite';
import { readStateFile, type StateFileDeps } from './stateFile';

export type WindowScheme = 'light' | 'dark';

export interface WindowPrefs {
  readonly scheme: WindowScheme;
  /** `#rrggbb` (小文字)。stylesheet の `--bg` の実値。 */
  readonly background: string;
}

/**
 * renderer が伝えてくるまでの起動の色。`styles.css` の `:root { --bg }` (ライト) と同じ値でなければ
 * ならない —— `__tests__/windowPrefs.test.ts` が stylesheet を読んで照合する (写しを 2 か所に置く理由)。
 */
export const DEFAULT_WINDOW_PREFS: WindowPrefs = { scheme: 'light', background: '#fff7fa' };

const FILE_NAME = 'service-hub-window.json';

export function defaultStatePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

export function isWindowScheme(x: unknown): x is WindowScheme {
  return x === 'light' || x === 'dark';
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** `setBackgroundColor` に渡してよい形は `#rrggbb` だけ (名前色・rgba()・短縮形は通さない)。 */
export function isBackgroundColor(x: unknown): x is string {
  return typeof x === 'string' && HEX_COLOR.test(x);
}

/** 保存値・IPC の引数を形で絞る。合わなければ null (呼び出し側が既定へ倒すか断る)。 */
export function sanitizeWindowPrefs(raw: unknown): WindowPrefs | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { scheme, background } = raw as { scheme?: unknown; background?: unknown };
  if (!isWindowScheme(scheme) || !isBackgroundColor(background)) return null;
  return { scheme, background: background.toLowerCase() };
}

export interface WindowPrefsDeps extends StateFileDeps {
  statePath?: () => string;
  writeFile?: (p: string, content: string) => Promise<void>;
}

/** 起動時に読む。3 状態の読み (`stateFile.ts`) を通し、read 以外と壊れた中身は既定へ倒す。 */
export async function readWindowPrefs(deps: WindowPrefsDeps = {}): Promise<WindowPrefs> {
  const p = (deps.statePath ?? defaultStatePath)();
  const file = await readStateFile(p, { readFile: deps.readFile, stat: deps.stat });
  if (file.kind !== 'read') return DEFAULT_WINDOW_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    return DEFAULT_WINDOW_PREFS;
  }
  return sanitizeWindowPrefs(parsed) ?? DEFAULT_WINDOW_PREFS;
}

/** 原子的に書く (`secrets.json` / 状態ファイルと同じ約束 —— `stateWritePolicy.test.ts`)。 */
export async function writeWindowPrefs(prefs: WindowPrefs, deps: WindowPrefsDeps = {}): Promise<void> {
  const p = (deps.statePath ?? defaultStatePath)();
  const write = deps.writeFile ?? ((q: string, c: string) => atomicWriteFile(q, c, { mode: 0o600 }));
  await write(p, JSON.stringify(prefs));
}
