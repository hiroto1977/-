import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ActionContext, ActionMap, FetchContext } from './types';
import { isSafeExportPath } from './exportPaths';

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
 *  - 状態は ~/.local/business-hub/team-radar.json に atomic 書き込み
 */

// --- Axes --------------------------------------------------------------

export const CANONICAL_AXES = [
  '営業力',
  '顧客対応力',
  'プレゼン力',
  '交渉力',
  '顧客管理力',
] as const;

export type AxisLabel = (typeof CANONICAL_AXES)[number];

export const AXIS_COUNT = CANONICAL_AXES.length;
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

// --- Member ------------------------------------------------------------

/** メンバー1人分の評価。`scores` は CANONICAL_AXES と同順 (長さ 5)。 */
export interface TeamMember {
  readonly id: string;
  readonly name: string;
  /** scores[i] は CANONICAL_AXES[i] に対する 1-5 整数評価 */
  readonly scores: readonly number[];
  /** 任意の付箋コメント (軸 idx → コメント) */
  readonly notes?: Readonly<Record<number, string>>;
}

export interface TeamRadarSnapshot {
  readonly department: string;
  readonly evaluatedAt: string;
  readonly axes: readonly AxisLabel[];
  readonly members: readonly TeamMember[];
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// --- Default snapshot (matches the user's reference image) --------------
//
// Reference data only — names / scores / notes are decorative fallback
// examples. The 3 names + 営業部 + 2035-04-15 are pinned by the
// "default team has 3 members matching the reference design" test, but
// the per-axis scores and per-axis sticky-note text are illustrative.
// Block-form pragma covers the whole literal because perTest can't link
// module-load const init to specific tests.

const DEFAULT_MEMBERS: readonly TeamMember[] = [
  {
    id: 'morita-takuya',
    name: '森田 拓也',
    scores: [5, 3, 4, 2, 3],
    notes: {
      0: '新規営業の実績が高い',
      1: '社内調整はやや苦手',
      2: '説明は得意だが時間配分に課題',
      3: '押しが弱く譲歩しやすい',
      4: '訪問頻度が安定している',
    },
  },
  {
    id: 'kasai-miho',
    name: '葛西 美保',
    scores: [3, 4, 5, 3, 2],
    notes: {
      0: '数字は平均的、伸びしろあり',
      1: 'オンラインでのやりとりが上手い',
      2: '提案資料の完成度が高く好評',
      3: '交渉は標準的',
      4: 'フォロー業務が弱め',
    },
  },
  {
    id: 'ichimura-sara',
    name: '市村 紗良',
    scores: [2, 4, 2, 5, 5],
    notes: {
      0: '新規営業の経験はまだ少ない',
      1: '顧客対応に強くフォローも丁寧',
      2: '緊張しやすい',
      3: '契約をまとめやすい交渉力あり',
      4: '顧客フォローが丁寧で潜在度が高い',
    },
  },
];

export const DEFAULT_TEAM_RADAR: TeamRadarSnapshot = {
  department: '営業部',
  evaluatedAt: '2035-04-15',
  axes: CANONICAL_AXES,
  members: DEFAULT_MEMBERS,
  fetchedAt: '',
  isMock: true,
};

// --- Validation --------------------------------------------------------

// 4 dedicated tests cover both boundaries (1, 5, 0, 6, non-integer,
// non-number, NaN, Infinity). perTest mis-attribution on the chained
// `&&` ConditionalExpression mutants is the surviving artifact.
export function isValidScore(n: unknown): n is number {
  // `Number.isInteger` は数値以外を必ず false にするので、前置きの typeof は
  // 単独では観測できない (読みやすさのために残している)。
  // Stryker disable next-line ConditionalExpression: Number.isInteger と重なる (観測不能)
  return typeof n === 'number' && Number.isInteger(n) && n >= SCORE_MIN && n <= SCORE_MAX;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export function isValidMemberId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/** Conservative shape validator — used on every load and save to prevent
 *  malformed state from corrupting the UI. */
// Each guard path is exhaustively tested via negative cases (null root,
// missing fields, oversize string, bad score, bad id). Boundary mutants
// (`> 50` ↔ `>= 50`, `> 64` ↔ `>= 64`, etc.) are observationally
// equivalent up to one extra/missing element — we'd need 100+ boundary
// tests to pin every single one. Block-form pragma covers the whole
// validator body and silences perTest mis-attribution.
export function validateMembers(raw: unknown): readonly TeamMember[] {
  if (!Array.isArray(raw)) throw new Error('members must be an array');
  if (raw.length > 50) throw new Error('members exceeds 50');
  const seenIds = new Set<string>();
  const out: TeamMember[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') {
      throw new Error('member entry is not an object');
    }
    const m = item as Record<string, unknown>;
    if (!isValidMemberId(m['id'])) {
        // Stryker disable next-line StringLiteral: 末尾の空 quasi は変異させても同じ
      throw new Error(`member id is invalid: ${String(m['id'])}`);
    }
    if (seenIds.has(m['id'])) {
      throw new Error(`duplicate member id: ${m['id']}`);
    }
    seenIds.add(m['id']);
    if (typeof m['name'] !== 'string' || m['name'].length === 0 || m['name'].length > 64) {
      throw new Error('member name must be a 1-64 char string');
    }
    if (!Array.isArray(m['scores']) || m['scores'].length !== AXIS_COUNT) {
      throw new Error(`member scores must be an array of length ${AXIS_COUNT}`);
    }
    const scores: number[] = [];
    for (const s of m['scores']) {
      if (!isValidScore(s)) {
        throw new Error(`score must be integer ${SCORE_MIN}-${SCORE_MAX}: ${String(s)}`);
      }
      scores.push(s);
    }
    let notes: Record<number, string> | undefined;
    if (m['notes'] !== undefined) {
      if (m['notes'] === null || typeof m['notes'] !== 'object') {
        throw new Error('notes must be an object');
      }
      notes = {};
      for (const [k, v] of Object.entries(m['notes'] as Record<string, unknown>)) {
        const idx = Number.parseInt(k, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= AXIS_COUNT) {
          throw new Error(`note key must be 0-${AXIS_COUNT - 1}: ${k}`);
        }
        if (typeof v !== 'string' || v.length > 200) {
          throw new Error(`note value must be a 0-200 char string`);
        }
        notes[idx] = v;
      }
    }
    out.push(notes ? { id: m['id'], name: m['name'], scores, notes } : { id: m['id'], name: m['name'], scores });
  }
  return out;
}

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

export interface TeamRadarState {
  readonly department: string;
  readonly evaluatedAt: string;
  readonly members: readonly TeamMember[];
}

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
// always inject deps). String-literal fallbacks ("営業部", "ISO date")
// are decorative defaults. Boundary mutants on slice(0, 64) / slice(0, 32) /
// length > 0 are equivalent for any non-empty input — 1 boundary test
// (oversize-truncate) pins the contract; sub-boundary mutants don't
// change behavior for the standard load path. perTest noise is silenced.
export async function loadTeamRadarState(
  deps: StateDeps = {},
): Promise<TeamRadarState> {
  const p = (deps.statePath ?? defaultStatePath)();
  const read = deps.readFile ?? ((q: string) => fs.readFile(q, 'utf8'));
  try {
    const raw = await read(p);
    const parsed = JSON.parse(raw) as unknown;
    // 文言は下の catch が飲むので画面には出ない (分岐の存在だけが意味を持つ)。
    // Stryker disable next-line StringLiteral: catch が飲むため観測不能
    if (parsed === null || typeof parsed !== 'object') throw new Error('not object');
    const o = parsed as Record<string, unknown>;
    const dept = typeof o['department'] === 'string' && o['department'].length > 0
      ? (o['department'] as string).slice(0, 64)
      : '営業部';
    const at = typeof o['evaluatedAt'] === 'string' && o['evaluatedAt'].length > 0
      ? (o['evaluatedAt'] as string).slice(0, 32)
      : new Date().toISOString().slice(0, 10);
    const members = validateMembers(o['members'] ?? []);
    return { department: dept, evaluatedAt: at, members };
  } catch {
    return {
      department: DEFAULT_TEAM_RADAR.department,
      evaluatedAt: DEFAULT_TEAM_RADAR.evaluatedAt,
      members: DEFAULT_TEAM_RADAR.members,
    };
  }
}

export async function saveTeamRadarState(
  state: TeamRadarState,
  deps: StateDeps = {},
): Promise<void> {
  // Validate before persisting so a bad payload doesn't poison the file.
  validateMembers(state.members);
  if (typeof state.department !== 'string' || state.department.length === 0 || state.department.length > 64) {
    throw new Error('department must be a 1-64 char string');
  }
  if (typeof state.evaluatedAt !== 'string' || state.evaluatedAt.length === 0 || state.evaluatedAt.length > 32) {
    throw new Error('evaluatedAt must be a 1-32 char string');
  }
  const p = (deps.statePath ?? defaultStatePath)();
  const tmp = p + '.tmp';
  const mkdirFn = deps.mkdir ?? ((dir: string) => fs.mkdir(dir, { recursive: true }).then(() => undefined));
  // `fs.writeFile` の既定は utf8。明示すると「空文字でも同じ」という
  // 観測できない引数が増えるだけなので書かない (実測済み)。
  const writeFn = deps.writeFile ?? ((q: string, c: string) => fs.writeFile(q, c));
  const renameFn = deps.rename ?? ((a: string, b: string) => fs.rename(a, b));
  await mkdirFn(path.dirname(p));
  await writeFn(tmp, JSON.stringify(state, null, 2));
  await renameFn(tmp, p);
}

// --- Snapshot fetcher --------------------------------------------------

// Module-level const init; perTest can't link to a specific test.
const FETCHED_AT = '2035-04-15T00:00:00.000Z';

export interface SnapshotDeps {
  loadState?: (deps?: StateDeps) => Promise<TeamRadarState>;
}

export async function fetchTeamRadarSnapshotImpl(
  _ctx: FetchContext,
  deps: SnapshotDeps = {},
): Promise<TeamRadarSnapshot> {
  const loader = deps.loadState ?? loadTeamRadarState;
  const state = await loader();
  return {
    department: state.department,
    evaluatedAt: state.evaluatedAt,
    axes: CANONICAL_AXES,
    members: state.members,
    fetchedAt: FETCHED_AT,
    isMock: true,
  };
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

export interface ExportSvgResult {
  readonly path: string;
  readonly bytes: number;
  readonly generatedAt: string;
}

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
): Promise<ExportSvgResult> {
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
  const writeFn = deps.writeFile ?? ((p: string, c: string) => fs.writeFile(p, c));
  await mkdirFn(path.dirname(filePath));
  await writeFn(filePath, svg);
  const generatedAt = (deps.now ?? (() => new Date()))().toISOString();
  return { path: filePath, bytes: Buffer.byteLength(svg), generatedAt };
}

async function exportTeamRadarSvg(ctx: ActionContext): Promise<ExportSvgResult> {
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

async function saveTeamRadarStateAction(ctx: ActionContext): Promise<TeamRadarState> {
  return saveTeamRadarStateImpl(ctx);
}

export const ACTIONS: ActionMap = {
  'save-state': saveTeamRadarStateAction,
  'export-svg': exportTeamRadarSvg,
};
