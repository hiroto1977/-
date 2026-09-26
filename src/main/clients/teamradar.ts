import { readStateFile } from '../stateFile';
import * as fs from 'node:fs/promises';
import { countChars } from '../../shared/inputCeiling';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ActionContext, ActionMap, FetchContext } from './types';
import { isSafeExportPath, writeExportFile } from './exportPaths';
import { atRestUnreadableReason, sealJsonDocument, unsealJsonDocument } from '../atRest';
import type { ActionData, ExportFileResult } from '../../shared/actionData';
import {
  MAX_CHART_TITLE_CHARS,
  buildTeamRadarSnapshot,
  readStoredTeamRadar,
  validateMembers,
  validateTeamRadarState,
  type StoredTeamRadar,
  type TeamRadarSnapshot,
  type TeamRadarState,
} from '../../shared/teamRadarState';

// 軸・形・判定・既定値・スナップショットの組み立ては shared/teamRadarState.ts が 1 つだけ持つ
// (パス 118 —— ブラウザ版の save-state / fetchSnapshot が同じ物を通す)。検査はここから読むので再輸出する。
export {
  AXIS_COUNT,
  CANONICAL_AXES,
  DEFAULT_TEAM_RADAR,
  SCORE_MAX,
  SCORE_MIN,
  isValidMemberId,
  isValidScore,
  validateMembers,
} from '../../shared/teamRadarState';
export type { AxisLabel, StoredTeamRadar, TeamMember, TeamRadarSnapshot, TeamRadarState } from '../../shared/teamRadarState';

/**
 * Team radar chart — 18 番目のサービス。
 *
 * 営業チーム (またはあらゆるチーム) のメンバー個々のスキルを 1-5 段階で
 * 評価し、5 軸 (営業力 / 顧客対応力 / プレゼン力 / 交渉力 / 顧客管理力)
 * のレーダーチャートで可視化する。SVG をエクスポートして Canva に
 * ドラッグ&ドロップして再利用できる「経営支援システム」の人材分析モジュール。
 *
 * 設計原則:
 *  - スキル軸は固定 5 軸 (CANONICAL_AXES); 拡張は将来課題
 *  - スコアは 1-5 整数 (validator で範囲チェック)
 *  - SVG は self-contained (no <script>, no external assets) — Canva
 *    でも安全にインポート可能
 *  - 状態は ~/.local/business-hub/team-radar.json に atomic 書き込み (中身は OS のキーチェーンで封緘 ——
 *    `main/atRest.ts`・パス 133。氏名と評価を含むので、`secrets.json` / 感情ログと同じ約束)
 */

// 見本 (DEFAULT_TEAM_RADAR) と判定 (isValidScore / isValidMemberId / validateMembers) は
// shared/teamRadarState.ts へ移した (パス 118)。SVG の組み立ては shared/teamRadarSvg.ts へ
// 移した (パス 268)。ここに残るのはファイルの読み書きと action の口。

// --- SVG renderer ------------------------------------------------------

/*
 * 組み立ては `shared/teamRadarSvg.ts` が 1 つだけ持つ (パス 268)。
 *
 * ここに在った間、ブラウザ版は**同じ action の 2 つ目の実装**として画面の
 * `<svg>` を DOM から掻き取っており、`<svg>` の外に在る ⚠ の断り (描けなかった人の
 * 名指し)・標題・部署・評価時点・凡例が**書き出した SVG から落ちていた**。
 * 検査はここから読むので再輸出する。
 */
export {
  axisPoint,
  colorFor,
  renderTeamRadarSvg,
  type RadarChartOptions,
} from '../../shared/teamRadarSvg';
/** マークアップ用のエスケープ。実装は `shared/escape.ts` に 1 つだけ持つ。 */
export { escapeXml } from '../../shared/escape';
import { renderTeamRadarSvg } from '../../shared/teamRadarSvg';

// --- State persistence ------------------------------------------------

export function defaultStatePath(): string {
  return path.join(os.homedir(), '.local', 'business-hub', 'team-radar.json');
}

export interface StateDeps {
  readFile?: (p: string) => Promise<string>;
  /** 読む前の大きさの門 (`stateFile.ts`)。省くと注入の読み手では後門だけ。 */
  stat?: (p: string) => Promise<{ size: number }>;
  writeFile?: (p: string, c: string) => Promise<void>;
  mkdir?: (p: string) => Promise<void>;
  rename?: (a: string, b: string) => Promise<void>;
  statePath?: () => string;
}

// Default-arrow lambdas in deps fallback only run in production (tests
// always inject deps).
/**
 * 保存先を読む —— 「まだ無い」(ENOENT) と「読めなかった」(権限・I/O・壊れた中身) を分ける (パス 120)。
 * それまでは両方を黙って見本に倒していた。読めた後の判定は shared (`readStoredTeamRadar`) が持つ。
 */
export async function loadTeamRadarState(
  deps: StateDeps = {},
): Promise<StoredTeamRadar> {
  const p = (deps.statePath ?? defaultStatePath)();
  // 大きさの門と 3 状態の読みは `stateFile.ts` の 1 つ (パス 313)。
  const file = await readStateFile(p, { readFile: deps.readFile, stat: deps.stat });
  if (file.kind !== 'read') return file;
  // 封緘を開けてから中身を判定する (パス 133)。開けられなければ、その理由を「読めなかった」に載せる ——
  // 画面は「見本を表示 / 保存を押すと上書き」と言う (パス 120 の注記がそのまま出口になる)。
  const opened = unsealJsonDocument(file.text);
  if (!opened.ok) return { kind: 'unreadable', reason: atRestUnreadableReason(opened.reason) };
  return readStoredTeamRadar(opened.json);
}

/**
 * 0600 で書いて、**書いた後に締める**。
 *
 * `mode` は新規作成のときしか効かないので、固定名の `.tmp` が既に 644 で
 * 残っていると 644 のまま本体へ被さる (2026-08-25 実測)。
 * 留めているのは `main/__tests__/staleTmpMode.test.ts`。
 */
async function writeTight(target: string, contents: string): Promise<void> {
  // Stryker disable next-line ObjectLiteral: `mode` を落としても**直後の
  // `chmod` が同じ 600 を掛ける**ので、最終状態は変わらない (等価変異)。
  // 明示を残すのは、作成→chmod の隙間を狭めるため (上の注記のとおり
  // `mode` は新規作成のときしか効かず、既存ファイルには chmod が要る)。
  await fs.writeFile(target, contents, { mode: 0o600 });
  await fs.chmod(target, 0o600);
}

export async function saveTeamRadarState(
  state: TeamRadarState,
  deps: StateDeps = {},
): Promise<void> {
  // Validate before persisting so a bad payload doesn't poison the file.
  // 判定は shared の 1 つ (members → department → evaluatedAt の順・文面も同じ)。ブラウザ版の
  // save-state も同じ物を通す (パス 118 までブラウザ版は素通しだった)。
  validateTeamRadarState(state);
  const p = (deps.statePath ?? defaultStatePath)();
  const tmp = p + '.tmp';
  const mkdirFn = deps.mkdir ?? ((dir: string) => fs.mkdir(dir, { recursive: true }).then(() => undefined));
  /*
   * **0600 で書く。ここに入るのは他人の評価である。**
   *
   * `team-radar.json` の中身は部署名・**メンバーの氏名**・軸ごとの 1〜5 評価・
   * 付箋コメント —— 人事評価そのもので、しかも**利用者本人ではなく第三者**の
   * 情報である。にもかかわらず実測 (2026-08-23) では **644** で書かれていた:
   *
   * ```
   *   secrets.json               600  (明示)
   *   service-hub-emotions.json  600  (明示)
   *   team-radar.json            644  ← ここだけ既定のまま
   * ```
   *
   * 同じ機械の他の利用者が同僚の評価を読める状態だった。
   *
   * **既にある 644 のファイルも次の保存で直る。** `mode` は新規作成のときしか
   * 効かないが、この関数は `tmp` を作って `rename` で被せるので、本体の
   * 古い権限は残らない。
   *
   * **ただし「毎回 0600 で作られたものになる」は誤りだった (2026-08-25 訂正)。**
   * `tmp` は固定名 (`p + '.tmp'`) なので、**それ自体が既に 644 で存在する**と
   * `writeFile(..., { mode: 0o600 })` はその権限を変えずに上書きし、
   * 644 のまま本体へ被さる。下の `writeFn` で書いた後に `chmod` して閉じた。
   *
   * `atomicWriteFile` に寄せなかったのは、`writeFile` / `rename` の
   * 差し替え口を検査が使っているため —— 得られる性質は同じ
   * (あちらは一意な tmp 名なのでこの形にはならない)。
   *
   * (`fs.writeFile` の既定の符号化は utf8 で、options を渡しても変わらない。)
   */
  const writeFn = deps.writeFile ?? writeTight;
  const renameFn = deps.rename ?? ((a: string, b: string) => fs.rename(a, b));
  await mkdirFn(path.dirname(p));
  // 封緘して書く (パス 133): 他人の氏名と評価なので、secrets.json / 感情ログと同じ約束 (main/atRest.ts) を通す。
  await writeFn(tmp, sealJsonDocument(JSON.stringify(state)));
  await renameFn(tmp, p);
}

// --- Snapshot fetcher --------------------------------------------------

export interface SnapshotDeps {
  loadState?: (deps?: StateDeps) => Promise<StoredTeamRadar>;
}

export async function fetchTeamRadarSnapshotImpl(
  _ctx: FetchContext,
  deps: SnapshotDeps = {},
): Promise<TeamRadarSnapshot> {
  const loader = deps.loadState ?? loadTeamRadarState;
  // 形の組み立ては shared (ブラウザ版の枝と同じ関数)。見本を返すときだけ isMock。
  return buildTeamRadarSnapshot(await loader());
}

export async function fetchTeamRadarSnapshot(
  ctx: FetchContext,
): Promise<TeamRadarSnapshot> {
  return fetchTeamRadarSnapshotImpl(ctx);
}

// --- SVG export --------------------------------------------------------

export function defaultSvgExportPath(): string {
  return path.join(os.homedir(), '.local', 'business-hub', 'data', 'team-radar.svg');
}

// Same path-traversal guard pattern as the business-dashboard export.
export function isSafeSvgExportPath(filePath: string, home: string): boolean {
  return isSafeExportPath(filePath, home, '.svg');
}

// 書き出しの結果の形は台帳 `shared/actionData.ts` の `ExportFileResult` (パス 116)。

interface ExportSvgPayload {
  path?: unknown;
  title?: unknown;
  /**
   * **画面が見ている図** (パス 190)。`validateTeamRadarState` が通す形
   * (`department` / `evaluatedAt` / `members` / 任意の `axes`)。
   *
   * 2026-09-12 まで画面は `title` **だけ**を送り、本体は保存済み状態から読んでいた。
   * 実測では 1 枚の SVG が 2 つの部署・2 つの評価時点を同時に名乗った:
   *
   * ```
   *   title  編集したタイトル｜編集した部署 (2026-09-12)   ← 画面の編集後
   *   header 部署: 保存した部署 · 評価時点: 2026-01-01     ← 保存済み
   * ```
   *
   * まだ 1 度も保存していなければ**同梱の見本 3 人**が書き出され、画面は何も言わない。
   * ブラウザ版は `tryGrabSvgFromPage()` で画面の SVG をそのまま出すので、
   * デスクトップ版だけがこの食い違いを持っていた。
   *
   * 省略されたときだけ保存済み状態へ落とす (直接 action を叩く経路の後方互換)。
   */
  chart?: unknown;
}

export interface ExportSvgDeps {
  fetchSnapshot?: (ctx: FetchContext) => Promise<TeamRadarSnapshot>;
  writeFile?: (p: string, c: string) => Promise<void>;
  mkdir?: (p: string) => Promise<void>;
  now?: () => Date;
}

export async function exportTeamRadarSvgImpl(
  ctx: ActionContext,
  deps: ExportSvgDeps = {},
): Promise<ExportFileResult> {
  const { path: customPath, title, chart } = ctx.payload as ExportSvgPayload;
  const home = os.homedir();
  const filePath =
    typeof customPath === 'string' && customPath.length > 0 ? customPath : defaultSvgExportPath();
  if (!isSafeSvgExportPath(filePath, home)) {
    throw new Error('team-radar svg path must be a .svg file under the user home directory');
  }
  // **画面が送ってきた図を描く。** 判定は保存と同じ 1 つ (`validateTeamRadarState`) を
  // 通すので、書き出しの口から緩い値が入ることはない。送られていないときだけ
  // 保存済み状態へ落とす。
  const snap = chart === undefined
    ? await (deps.fetchSnapshot ?? fetchTeamRadarSnapshot)({ token: ctx.token, fetch: ctx.fetch })
    : buildTeamRadarSnapshot({ kind: 'saved', state: validateTeamRadarState(chart) });
  // 天井は `shared/teamRadarState.ts` が 1 つだけ持つ (パス 167 —— ここが字面で 120、
  // 画面の `maxLength` が字面で 64 と**既にずれていた**)。
  const titleStr = typeof title === 'string' && title.length > 0 && countChars(title) <= MAX_CHART_TITLE_CHARS
    ? title
    : 'チームレーダーチャート';
  const svg = renderTeamRadarSvg(snap, { title: titleStr });
  const mkdirFn = deps.mkdir ?? ((dir: string) => fs.mkdir(dir, { recursive: true }).then(() => undefined));
  const writeFn = deps.writeFile ?? writeExportFile;
  await mkdirFn(path.dirname(filePath));
  await writeFn(filePath, svg);
  const generatedAt = (deps.now ?? (() => new Date()))().toISOString();
  return { path: filePath, bytes: Buffer.byteLength(svg), generatedAt };
}

async function exportTeamRadarSvg(ctx: ActionContext): Promise<ActionData<'teamradar/export-svg'>> {
  return exportTeamRadarSvgImpl(ctx);
}

// --- save-state action -------------------------------------------------

interface SaveStatePayload {
  department?: unknown;
  evaluatedAt?: unknown;
  members?: unknown;
  /** 軸名 (パス 190)。**ここに欄が無い間、画面が送った軸名は黙って落ちていた。** */
  axes?: unknown;
}

export async function saveTeamRadarStateImpl(
  ctx: ActionContext,
  deps: StateDeps = {},
): Promise<TeamRadarState> {
  const { department, evaluatedAt, members, axes } = ctx.payload as SaveStatePayload;
  // 長さと型の判定は `saveTeamRadarState` が持つ。ここで同じ判定を重ねると、
  // 外側を外しても内側が同じ文言で弾くため観測できない分岐になる
  // (規則を決める場所は 1 つにする)。
  const validated = validateMembers(members ?? []);
  // 軸名は `validateTeamRadarState` が判定を持つ (件数と 1 文字以上)。省略なら欄を作らない
  // —— 既存の保存値と同じ形のままにする。
  const next = validateTeamRadarState({
    department,
    evaluatedAt,
    members: validated,
    ...(axes === undefined ? {} : { axes }),
  });
  await saveTeamRadarState(next, deps);
  return next;
}

async function saveTeamRadarStateAction(ctx: ActionContext): Promise<ActionData<'teamradar/save-state'>> {
  return saveTeamRadarStateImpl(ctx);
}

export const ACTIONS: ActionMap = {
  'save-state': saveTeamRadarStateAction,
  'export-svg': exportTeamRadarSvg,
};
