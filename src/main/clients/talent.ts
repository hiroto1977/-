import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LEADER_DISQUALIFIERS,
  ORGAN_DISEASES,
  SKILL_STEPS,
  achievementGap,
  diagnoseOrg,
  isValidLadderMember,
  judgeLeaderFitness,
  reviewLadder,
  sanitizeInitiatives,
  sanitizeReports,
  type AchievementStatus,
  type Disqualifier,
  type Initiative,
  type LadderMember,
  type LadderReview,
  type LeaderFitness,
  type OrganDisease,
  type OrgDiagnosis,
  type SkillStep,
  type DeptReport,
} from '../../shared/talent';
import type { ActionContext, ActionMap, FetchContext } from './types';

// 判定と定義表は shared にある。ここは I/O (状態の保存・取得) と
// action の口だけを持つ。**同じ判定を二度書かない。**
export * from '../../shared/talent';

/**
 * 人材育成 — 組織の診断と育成設計を「判定できる形」にしたサービス。
 *
 * 北の達人コーポレーション代表取締役社長 木下勝寿氏が公開している枠組み
 * (著書『チームX』『時間最短化、成果最大化の法則』および YouTube
 * 「北の達人チャンネル」) を、読み物ではなく**計算できる判定**として
 * 実装している。画面で眺めるだけの手引きは運用に載らないので、
 * 判定の本体はすべて純粋関数にしてここへ置く。
 *
 * 実装した判定は 4 つ:
 *
 *   1. `diagnoseOrg`        — 5つの企業組織病。**複数の部署で同じ病が挙がったら
 *                             個人ではなく仕組みの問題**、という切り分けを機械化する。
 *   2. `achievementGap`     — 達成確率100%キープの法則。施策の達成確率を合計し、
 *                             100% に足りない分を返す。「気合いで頑張ります」を潰す。
 *   3. `judgeLeaderFitness` — 登用判定。10ヶ条に **1つでも**該当したらリーダーには
 *                             据えない (能力ではなく姿勢の項目しかないのが要点)。
 *   4. `reviewLadder`       — 育成ロードマップ。STEP1 の滞留を検出する。
 *
 * ネットワークは使わない (`LOCAL_SERVICES`)。状態は teamradar と同じく
 * `~/.local/business-hub/` 配下へ 0600 で置く。
 *
 * ## 出典の扱い
 *
 * 各定義は `source` を持ち、**確認済み (`confirmed`) か、名称のみ確認で
 * 語釈が当方の読み解き (`gloss`) か**を型で持つ。曖昧なまま社内基準として
 * 配られると困るので、区別を落とせない形にしてある。
 */

// --- 状態の保存 --------------------------------------------------------

export interface TalentState {
  readonly reports: readonly DeptReport[];
  readonly initiatives: readonly Initiative[];
  readonly members: readonly LadderMember[];
  readonly updatedAt: string;
}

export function defaultStatePath(): string {
  return path.join(os.homedir(), '.local', 'business-hub', 'talent.json');
}

export interface StateDeps {
  readFile?: (p: string) => Promise<string>;
  writeFile?: (p: string, c: string) => Promise<void>;
  mkdir?: (p: string) => Promise<void>;
  statePath?: () => string;
}

const EMPTY_STATE: TalentState = {
  reports: [],
  initiatives: [],
  members: [],
  updatedAt: '',
};

/**
 * 保存された状態を読む。読めなければ空で返す —— 初回起動と壊れたファイルを
 * 区別しても画面ですることが同じなので、分けない。
 */
export async function loadTalentState(deps: StateDeps = {}): Promise<TalentState> {
  const p = (deps.statePath ?? defaultStatePath)();
  const read = deps.readFile ?? ((q: string) => fs.readFile(q, 'utf8'));
  try {
    const parsed = JSON.parse(await read(p)) as unknown;
    if (parsed === null || typeof parsed !== 'object') return EMPTY_STATE;
    const o = parsed as Record<string, unknown>;
    const updatedAt = o['updatedAt'];
    return {
      reports: sanitizeReports(o['reports']),
      initiatives: sanitizeInitiatives(o['initiatives']),
      members: Array.isArray(o['members']) ? o['members'].filter(isValidLadderMember) : [],
      updatedAt: typeof updatedAt === 'string' ? updatedAt.slice(0, 32) : '',
    };
  } catch {
    return EMPTY_STATE;
  }
}

/**
 * 0600 で書いて、**書いた後に締める**。
 *
 * `mode` は新規作成のときしか効かないので、固定名が既に 644 で残っていると
 * 644 のまま被さる (teamradar 側で 2026-08-25 に実測されている)。
 */
export async function saveTalentState(state: TalentState, deps: StateDeps = {}): Promise<TalentState> {
  const p = (deps.statePath ?? defaultStatePath)();
  const mkdir = deps.mkdir ?? ((q: string) => fs.mkdir(q, { recursive: true }).then(() => undefined));
  const write = deps.writeFile ?? (async (q: string, c: string) => {
    await fs.writeFile(q, c, { mode: 0o600 });
    await fs.chmod(q, 0o600);
  });
  const clean: TalentState = {
    reports: sanitizeReports(state.reports),
    initiatives: sanitizeInitiatives(state.initiatives),
    members: Array.isArray(state.members) ? state.members.filter(isValidLadderMember) : [],
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt.slice(0, 32) : '',
  };
  await mkdir(path.dirname(p));
  await write(p, JSON.stringify(clean, null, 2));
  return clean;
}

// --- スナップショット --------------------------------------------------

export interface TalentSnapshot {
  readonly diseases: readonly OrganDisease[];
  readonly steps: readonly SkillStep[];
  readonly disqualifiers: readonly Disqualifier[];
  readonly diagnosis: OrgDiagnosis;
  readonly achievement: AchievementStatus;
  readonly ladder: LadderReview;
  readonly initiatives: readonly Initiative[];
  readonly updatedAt: string;
}

export interface SnapshotDeps {
  loadState?: (deps?: StateDeps) => Promise<TalentState>;
}

export async function fetchTalentSnapshotImpl(
  _ctx: FetchContext,
  deps: SnapshotDeps = {},
): Promise<TalentSnapshot> {
  const state = await (deps.loadState ?? loadTalentState)();
  return {
    diseases: ORGAN_DISEASES,
    steps: SKILL_STEPS,
    disqualifiers: LEADER_DISQUALIFIERS,
    diagnosis: diagnoseOrg(state.reports),
    achievement: achievementGap(state.initiatives),
    ladder: reviewLadder(state.members),
    initiatives: state.initiatives,
    updatedAt: state.updatedAt,
  };
}

export async function fetchTalentSnapshot(ctx: FetchContext): Promise<TalentSnapshot> {
  return fetchTalentSnapshotImpl(ctx);
}

// --- 書き込み側 --------------------------------------------------------

export interface SaveStateDeps extends StateDeps {
  save?: (s: TalentState, d?: StateDeps) => Promise<TalentState>;
}

export async function saveTalentStateImpl(
  ctx: ActionContext,
  deps: SaveStateDeps = {},
): Promise<TalentState> {
  const p = ctx.payload;
  const state: TalentState = {
    reports: sanitizeReports(p['reports']),
    initiatives: sanitizeInitiatives(p['initiatives']),
    members: Array.isArray(p['members']) ? p['members'].filter(isValidLadderMember) : [],
    updatedAt: typeof p['updatedAt'] === 'string' ? p['updatedAt'].slice(0, 32) : '',
  };
  return (deps.save ?? saveTalentState)(state, deps);
}

async function saveStateAction(ctx: ActionContext): Promise<TalentState> {
  return saveTalentStateImpl(ctx);
}

export interface JudgeResult {
  readonly fitness: LeaderFitness;
  readonly candidate: string;
}

export async function judgeLeaderImpl(ctx: ActionContext): Promise<JudgeResult> {
  const raw = ctx.payload['flagged'];
  const flagged = Array.isArray(raw) ? raw.filter((f): f is string => typeof f === 'string') : [];
  const name = ctx.payload['candidate'];
  return {
    fitness: judgeLeaderFitness(flagged),
    candidate: typeof name === 'string' ? name.slice(0, 64) : '',
  };
}

async function judgeLeaderAction(ctx: ActionContext): Promise<JudgeResult> {
  return judgeLeaderImpl(ctx);
}

export const ACTIONS: ActionMap = {
  'save-state': saveStateAction,
  'judge-leader': judgeLeaderAction,
};
