/**
 * ゴール DSL (`goalDsl.ts`) と ゴールコーチの状態 (`CoachState`) の相互変換。純ロジック・IO なし。
 *
 * - **保つ物**: 木の形 (親子と兄弟の順)・種類 (目的 / 目標 / 節目 / タスク)・題名・期日・
 *   タスクの分数・済み。`buildTree` が作った状態は `fromCoachState` → `toCoachState` で
 *   **ノード列が完全に一致する** (id は先行順の連番で、`buildTree` も先行順に振る)。
 * - **保たない物**: `phase` / `persona` / `answers` (聞き取りの途中経過)。`toCoachState` は
 *   `phase: 'active'` (木が空なら `'persona'`)・`persona: null`・`answers: {}`・`startedOn: 今日`
 *   の状態を返す。
 * - **捨てる物は理由つきで返す** (黙って捨てない): 予定 (コーチの木に種類が無い)・
 *   コーチの状態の読めない欄 (親の無い節・循環・重複 id など)。
 * - 分数 `0` (見積なし) は DSL では「分数の指定なし」(`null`) で、戻すと `0`。
 * - **`sanitizeCoachState` を通して、有効な状態だけを返す** (通らなければ状態を返さず断る)。
 */

import { isCalendarDate } from '../../shared/isoDate';
import { INVISIBLE_UNITS } from '../../shared/escape';
import { clampToCeiling, moreThanChars } from '../../shared/inputCeiling';
import { sanitizeCoachState, type CoachState, type GoalNode, type NodeKind } from './goalCoach';
import {
  MAX_DSL_DEPTH,
  MAX_DSL_NODES,
  MAX_DSL_TASK_MINUTES,
  MAX_DSL_TITLE_CHARS,
  isLeafKind,
  validateGoalDslDoc,
  type DslError,
  type DslKind,
  type GoalDslDoc,
  type GoalDslItem,
} from './goalDsl';

export type FromCoachResult =
  | { readonly ok: true; readonly doc: GoalDslDoc; readonly notes: readonly string[] }
  | { readonly ok: false; readonly errors: readonly DslError[] };

export type ToCoachResult =
  | { readonly ok: true; readonly state: CoachState; readonly dropped: readonly string[] }
  | { readonly ok: false; readonly errors: readonly DslError[] };

/** 木を作るときの 1 項目 (子の一覧だけ書き換える)。 */
interface Draft {
  kind: DslKind;
  title: string;
  due: string | null;
  minutes: number | null;
  done: boolean;
  children: Draft[];
}

const NODE_KINDS: ReadonlySet<string> = new Set<NodeKind>(['purpose', 'goal', 'milestone', 'task']);

/** 題名を DSL の 1 行に収まる形へ (見えない字・改行は空白へ、空白の連なりは 1 つへ)。 */
function titleForDsl(raw: string): { readonly title: string; readonly changed: boolean } {
  let t = raw.replace(INVISIBLE_UNITS, ' ').replace(/\s+/g, ' ').trim();
  if (t === '') t = '(無題)';
  if (moreThanChars(t, MAX_DSL_TITLE_CHARS)) t = clampToCeiling(t, MAX_DSL_TITLE_CHARS).trim();
  return { title: t, changed: t !== raw };
}

/**
 * コーチの状態 → 木。**切らずに断る**のは項目数だけ (`MAX_DSL_NODES` 超)。それ以外で
 * 読めなかった物は木へ入れず `notes` に理由を返す。
 */
export function fromCoachState(state: CoachState): FromCoachResult {
  const nodes: readonly GoalNode[] = state.nodes;
  if (nodes.length > MAX_DSL_NODES) return { ok: false, errors: [{ line: 0, message: `項目が多すぎます (${MAX_DSL_NODES} 件まで)` }] };
  const notes: string[] = [];

  const byId = new Map<number, GoalNode>();
  for (const n of nodes) {
    if (byId.has(n.id)) notes.push(`#${n.id} が重複しているため、後の物を除きました`);
    else byId.set(n.id, n);
  }
  const kids = new Map<number, GoalNode[]>();
  const rootNodes: GoalNode[] = [];
  for (const n of byId.values()) {
    if (n.parent === null) rootNodes.push(n);
    else if (byId.has(n.parent) && n.parent !== n.id) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
    else {
      notes.push(`#${n.id} の親 #${String(n.parent)} が見当たらないため、根として扱いました`);
      rootNodes.push(n);
    }
  }

  const roots: Draft[] = [];
  const seen = new Set<number>();
  // 反復の深さ優先 (入れ子の深さで再帰しない)。target = 子を足す先の一覧。
  const stack: { node: GoalNode; target: Draft[]; depth: number }[] = [];
  for (let i = rootNodes.length - 1; i >= 0; i -= 1) stack.push({ node: rootNodes[i] as GoalNode, target: roots, depth: 0 });
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const { node, target, depth } = next;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    if (depth >= MAX_DSL_DEPTH) {
      notes.push(`#${node.id} は入れ子が深すぎる (${MAX_DSL_DEPTH} 段まで) ため除きました`);
      continue;
    }
    if (!NODE_KINDS.has(node.kind)) {
      notes.push(`#${node.id} の種類が読めないため除きました`);
      continue;
    }
    const t = titleForDsl(node.title);
    if (t.changed) notes.push(`#${node.id} の題名を 1 行に収まる形へ直しました`);
    let due: string | null = null;
    if (node.due !== null) {
      if (isCalendarDate(node.due)) due = node.due;
      else notes.push(`#${node.id} の期日が読めないため空にしました`);
    }
    let minutes: number | null = null;
    if (node.minutes !== 0) {
      if (node.kind === 'task' && Number.isInteger(node.minutes) && node.minutes >= 1 && node.minutes <= MAX_DSL_TASK_MINUTES) minutes = node.minutes;
      else notes.push(`#${node.id} の分数 ${String(node.minutes)} は書けないため空にしました`);
    }
    const item: Draft = { kind: node.kind, title: t.title, due, minutes, done: node.done === true, children: [] };
    target.push(item);
    // 葉 (タスク) の子は同じ階層へ移す (DSL ではタスクの下に書けない)
    const childTarget = isLeafKind(item.kind) ? target : item.children;
    const childDepth = isLeafKind(item.kind) ? depth : depth + 1;
    const children = kids.get(node.id) ?? [];
    if (isLeafKind(item.kind) && children.length > 0) notes.push(`#${node.id} (タスク) の下の項目は同じ階層へ移しました`);
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push({ node: children[i] as GoalNode, target: childTarget, depth: childDepth });
  }
  for (const n of byId.values()) {
    if (!seen.has(n.id)) notes.push(`#${n.id} は根から辿れない (循環) ため除きました`);
  }
  return { ok: true, doc: { items: roots }, notes };
}

/**
 * 木 → コーチの状態。木を `validateGoalDslDoc` で検め (通らなければ断る)、先行順に
 * id を 1 から振る。**予定はコーチの木に載らないので捨て、理由を `dropped` に返す。**
 * 最後に `sanitizeCoachState` を通し、通った状態だけを返す。
 */
export function toCoachState(doc: GoalDslDoc, today: string): ToCoachResult {
  if (!isCalendarDate(today)) return { ok: false, errors: [{ line: 0, message: '今日の日付が暦に在る YYYY-MM-DD ではありません' }] };
  const problems = validateGoalDslDoc(doc);
  if (problems.length > 0) return { ok: false, errors: problems };

  const dropped: string[] = [];
  const nodes: GoalNode[] = [];
  const kept: { id: number; line: number; title: string }[] = [];
  let line = 0;
  let nextId = 1;
  const stack: { item: GoalDslItem; parent: number | null }[] = [];
  for (let i = doc.items.length - 1; i >= 0; i -= 1) stack.push({ item: doc.items[i] as GoalDslItem, parent: null });
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const { item, parent } = next;
    line += 1;
    if (item.kind === 'event') {
      dropped.push(`行 ${line} の予定「${item.title}」はコーチの木に載せません (予定は目的・目標・節目・タスクのどれでもありません)`);
      continue;
    }
    const id = nextId;
    nextId += 1;
    nodes.push({ id, parent, kind: item.kind, title: item.title, due: item.due, minutes: item.minutes === null ? 0 : item.minutes, done: item.done });
    kept.push({ id, line, title: item.title });
    for (let i = item.children.length - 1; i >= 0; i -= 1) stack.push({ item: item.children[i] as GoalDslItem, parent: id });
  }

  const state = sanitizeCoachState({
    v: 1,
    phase: nodes.length === 0 ? 'persona' : 'active',
    persona: null,
    answers: {},
    startedOn: today,
    nodes,
    nextId,
  });
  if (state === null) return { ok: false, errors: [{ line: 0, message: 'コーチの状態として読めませんでした' }] };
  for (const k of kept) {
    const got = state.nodes.find((n) => n.id === k.id);
    if (got !== undefined && got.title !== k.title) dropped.push(`行 ${k.line} の題名の空白の連なりを 1 つにまとめました`);
  }
  return { ok: true, state, dropped };
}
