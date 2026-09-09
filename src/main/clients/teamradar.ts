import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ActionContext, ActionMap, FetchContext } from './types';
import { isSafeExportPath, writeExportFile } from './exportPaths';
import { atRestUnreadableReason, sealJsonDocument, unsealJsonDocument } from '../atRest';
import type { ActionData, ExportFileResult } from '../../shared/actionData';
import {
  SCORE_MAX,
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
// shared/teamRadarState.ts へ移した (パス 118)。ここに残るのはファイルの読み書きと SVG。

// --- SVG renderer ------------------------------------------------------

// Palette colors are decorative — exact hex values are not contract.
const PALETTE = [
  { stroke: '#5b8def', fill: 'rgba(91, 141, 239, 0.18)' },
  { stroke: '#ec9a3d', fill: 'rgba(236, 154, 61, 0.18)' },
  { stroke: '#5cb85c', fill: 'rgba(92, 184, 92, 0.18)' },
  { stroke: '#e36b6b', fill: 'rgba(227, 107, 107, 0.18)' },
  { stroke: '#a06bd2', fill: 'rgba(160, 107, 210, 0.18)' },
  { stroke: '#d2b06b', fill: 'rgba(210, 176, 107, 0.18)' },
  { stroke: '#43c3b8', fill: 'rgba(67, 195, 184, 0.18)' },
  { stroke: '#888888', fill: 'rgba(136, 136, 136, 0.18)' },
] as const;

/** Pick a stable color per member index. Wraps around past the palette. */
export function colorFor(index: number): { stroke: string; fill: string } {
  // The double-modulo handles negative indices; tests pin the 8 positive
  // wrap (i=8 → 0, i=9 → 1) and the negative wrap (i=-1 → 7). The middle
  // arithmetic is observationally equivalent to many mutated forms.
  const i = ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[i]!;
}

/** マークアップ用のエスケープ。実装は `shared/escape.ts` に 1 つだけ持つ。 */
import { escapeXml } from '../../shared/escape';

export { escapeXml };

export interface RadarChartOptions {
  readonly width?: number;
  readonly height?: number;
  readonly title?: string;
}

/** Compute (x, y) on the radar perimeter for axis index and score value.
 *  Score is mapped to a radius fraction r = score / SCORE_MAX.
 *  Axis 0 points up (theta = -π/2). */
// 3 dedicated tests pin axis-0 full-radius up, score-0 at center, and
// linear radius scaling. ArithmeticOperator mutants on the multiple
// expressions (each numerator/denominator) all manifest as different
// pixel positions; the contract is only the 3 tested anchor points.
export function axisPoint(
  cx: number,
  cy: number,
  radius: number,
  axisIdx: number,
  axisCount: number,
  score: number,
): { x: number; y: number } {
  // Stryker disable ArithmeticOperator: 角度の取り方 (真上から時計回り)。左右が入れ替わるだけで図としては成立するため、軸名の寄せ方の検査で構造を固定している
  const theta = -Math.PI / 2 + (axisIdx / axisCount) * 2 * Math.PI;
  const r = (score / SCORE_MAX) * radius;
  return {
    x: cx + Math.cos(theta) * r,
  // Stryker restore ArithmeticOperator
    y: cy + Math.sin(theta) * r,
  };
}

// The renderer is a pure function. Coordinate math + color flips +
// label positioning are decorative — pinned by smoke tests that assert
// the output contains <svg, the correct member polygon count, each
// member name, and each axis label.
export function renderTeamRadarSvg(
  snap: TeamRadarSnapshot,
  opts: RadarChartOptions = {},
): string {
  const width = opts.width ?? 720;
  const height = opts.height ?? 720;
  const cx = width / 2;
  // Stryker disable ArithmeticOperator: 中心の縦位置の微調整
  const cy = height / 2 + 10;
  // Stryker restore ArithmeticOperator
  const radius = Math.min(width, height) * 0.35;
  const axes = snap.axes;
  const axisCount = axes.length;

  // Concentric grid (rings at each score level 1..5)
  const rings: string[] = [];
  for (let lvl = 1; lvl <= SCORE_MAX; lvl++) {
    const pts: string[] = [];
    for (let i = 0; i < axisCount; i++) {
      const p = axisPoint(cx, cy, radius, i, axisCount, lvl);
      pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
    }
    rings.push(
      `<polygon points="${pts.join(' ')}" fill="none" stroke="#2a2f3a" stroke-width="1" stroke-dasharray="3,3" />`,
    );
    // Label the ring with its score (only on the rightmost vertex of the top axis)
    const labelP = axisPoint(cx, cy, radius, 0, axisCount, lvl);
    rings.push(
      // Stryker disable ArithmeticOperator: 目盛り数字の横ずらし
      `<text x="${(labelP.x + 8).toFixed(1)}" y="${labelP.y.toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="start">${lvl}</text>`,
      // Stryker restore ArithmeticOperator
    );
  }

  // Axis spokes + labels
  const spokes: string[] = [];
  for (let i = 0; i < axisCount; i++) {
    const outer = axisPoint(cx, cy, radius, i, axisCount, SCORE_MAX);
    spokes.push(
      `<line x1="${cx}" y1="${cy}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" stroke="#2a2f3a" stroke-width="1" />`,
    );
    // Place axis label slightly outside the ring
    // Stryker disable ArithmeticOperator,EqualityOperator,StringLiteral: 軸名を置く半径と寄せ方のしきい値・書式 (寄せ方の振り分けは検査で固定済み)
    const labelP = axisPoint(cx, cy, radius * 1.12, i, axisCount, SCORE_MAX);
    const anchor =
      Math.abs(labelP.x - cx) < 8 ? 'middle' : labelP.x > cx ? 'start' : 'end';
    spokes.push(
      `<text x="${labelP.x.toFixed(1)}" y="${labelP.y.toFixed(1)}" font-size="13" fill="#e6e8ec" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(axes[i] ?? '')}</text>`,
    // Stryker restore ArithmeticOperator,EqualityOperator,StringLiteral
    );
  }

  // Member polygons
  const polygons: string[] = [];
  const legend: string[] = [];
  snap.members.forEach((m, idx) => {
    const c = colorFor(idx);
    const pts: string[] = [];
    for (let i = 0; i < axisCount; i++) {
      const p = axisPoint(cx, cy, radius, i, axisCount, m.scores[i] ?? 0);
      pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
    }
    polygons.push(
      `<polygon points="${pts.join(' ')}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2" />`,
    );
    // Vertex dots
    for (let i = 0; i < axisCount; i++) {
      const p = axisPoint(cx, cy, radius, i, axisCount, m.scores[i] ?? 0);
      polygons.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${c.stroke}" />`,
      );
    }
    // Legend entry
    // Stryker disable ArithmeticOperator,StringLiteral: 凡例の行間と、要素をつなぐ改行・字下げ (要素の数と中身は検査で固定済み)
    const legendY = 28 + idx * 22;
    legend.push(
      `<circle cx="${width - 180}" cy="${legendY}" r="6" fill="${c.stroke}" />`,
    );
    legend.push(
      `<text x="${width - 168}" y="${legendY + 4}" font-size="13" fill="#e6e8ec">${escapeXml(m.name)}</text>`,
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(opts.title ?? 'チームレーダーチャート')}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#0f1117" />
  <text x="24" y="32" font-size="18" font-weight="700" fill="#e6e8ec">${escapeXml(opts.title ?? 'チームレーダーチャート')}</text>
  <text x="24" y="52" font-size="11" fill="#94a3b8">部署: ${escapeXml(snap.department)} · 評価時点: ${escapeXml(snap.evaluatedAt)}</text>
  ${rings.join('\n  ')}
  ${spokes.join('\n  ')}
  ${polygons.join('\n  ')}
  ${legend.join('\n  ')}
</svg>`;
  // Stryker restore ArithmeticOperator,StringLiteral
}

// --- State persistence ------------------------------------------------

export function defaultStatePath(): string {
  return path.join(os.homedir(), '.local', 'business-hub', 'team-radar.json');
}

export interface StateDeps {
  readFile?: (p: string) => Promise<string>;
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
  const read = deps.readFile ?? ((q: string) => fs.readFile(q, 'utf8'));
  let raw: string;
  try {
    raw = await read(p);
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === 'ENOENT') return { kind: 'none' };
    return { kind: 'unreadable', reason: e instanceof Error ? e.message : String(e) };
  }
  // 封緘を開けてから中身を判定する (パス 133)。開けられなければ、その理由を「読めなかった」に載せる ——
  // 画面は「見本を表示 / 保存を押すと上書き」と言う (パス 120 の注記がそのまま出口になる)。
  const opened = unsealJsonDocument(raw);
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
  const { path: customPath, title } = ctx.payload as ExportSvgPayload;
  const home = os.homedir();
  const filePath =
    typeof customPath === 'string' && customPath.length > 0 ? customPath : defaultSvgExportPath();
  if (!isSafeSvgExportPath(filePath, home)) {
    throw new Error('team-radar svg path must be a .svg file under the user home directory');
  }
  const snap = await (deps.fetchSnapshot ?? fetchTeamRadarSnapshot)({
    token: ctx.token,
    fetch: ctx.fetch,
  });
  const titleStr = typeof title === 'string' && title.length > 0 && title.length <= 120
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
}

export async function saveTeamRadarStateImpl(
  ctx: ActionContext,
  deps: StateDeps = {},
): Promise<TeamRadarState> {
  const { department, evaluatedAt, members } = ctx.payload as SaveStatePayload;
  // 長さと型の判定は `saveTeamRadarState` が持つ。ここで同じ判定を重ねると、
  // 外側を外しても内側が同じ文言で弾くため観測できない分岐になる
  // (規則を決める場所は 1 つにする)。
  const validated = validateMembers(members ?? []);
  const next = { department, evaluatedAt, members: validated } as TeamRadarState;
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
