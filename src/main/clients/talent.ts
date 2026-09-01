import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EMPTY_TALENT_STATE,
  buildTalentSnapshot,
  judgeLeaderFitness,
  sanitizeTalentState,
  type LeaderFitness,
  type TalentSnapshot,
  type TalentState,
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

export function defaultStatePath(): string {
  return path.join(os.homedir(), '.local', 'business-hub', 'talent.json');
}

export interface StateDeps {
  readFile?: (p: string) => Promise<string>;
  writeFile?: (p: string, c: string) => Promise<void>;
  mkdir?: (p: string) => Promise<void>;
  statePath?: () => string;
}

/**
 * 保存された状態を読む。読めなければ空で返す —— 初回起動と壊れたファイルを
 * 区別しても画面ですることが同じなので、分けない。
 */
export async function loadTalentState(deps: StateDeps = {}): Promise<TalentState> {
  const p = (deps.statePath ?? defaultStatePath)();
  const read = deps.readFile ?? ((q: string) => fs.readFile(q, 'utf8'));
  try {
    return sanitizeTalentState(JSON.parse(await read(p)) as unknown);
  } catch {
    return EMPTY_TALENT_STATE;
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
  const clean = sanitizeTalentState(state);
  await mkdir(path.dirname(p));
  await write(p, JSON.stringify(clean, null, 2));
  return clean;
}

// --- スナップショット --------------------------------------------------

export interface SnapshotDeps {
  loadState?: (deps?: StateDeps) => Promise<TalentState>;
}

export async function fetchTalentSnapshotImpl(
  _ctx: FetchContext,
  deps: SnapshotDeps = {},
): Promise<TalentSnapshot> {
  return buildTalentSnapshot(await (deps.loadState ?? loadTalentState)());
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
  return (deps.save ?? saveTalentState)(sanitizeTalentState(ctx.payload), deps);
}

async function saveStateAction(ctx: ActionContext): Promise<TalentState> {
  return saveTalentStateImpl(ctx);
}

export interface JudgeResult {
  readonly fitness: LeaderFitness;
  readonly candidate: string;
}

/**
 * `judge-leader` が renderer から受け取る形。
 *
 * **型は宣言するが信用しない** —— `unknown` で受けて下で選り分ける。
 * 名前を付けてあるのは `docs/ARCHITECTURE.md` §3.2 の payload 表と
 * `verify:arch` が突き合わせる先を作るため (2026-09-01)。
 */
interface JudgeLeaderPayload {
  flagged?: unknown;
  candidate?: unknown;
}

export async function judgeLeaderImpl(ctx: ActionContext): Promise<JudgeResult> {
  const { flagged: raw, candidate: name } = ctx.payload as unknown as JudgeLeaderPayload;
  const flagged = Array.isArray(raw) ? raw.filter((f): f is string => typeof f === 'string') : [];
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
