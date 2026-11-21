/**
 * 村の「会話の場面」と「頼んだ作業の流れ」(2026-11-06) —— 村人どうしの掛け合いと、会話で頼んだ作業が
 * 担当へ渡って進む様子を、景色の上で見せるための**判断だけ**を持つ純関数。
 *
 * - **AI は使わない・外へ何も送らない。** 台詞は組織の台帳 (名前・領域・重点) から決まる台本で、
 *   同じ入力は同じ場面になる (乱数なし)。台本であることは画面の見出しでも名乗る。
 * - **場面は 3 行で 1 本** (`SCENE_TICKS` 刻み)。2 人が向き合って交互に話し、最後に短い間を置く。
 * - **頼んだ作業の流れ** は 受付 → 割り当て (総括 → 役員 → 部長 → チーム) → 作業中 → 完了/失敗。
 *   作業中は結果が来るまで待つ (会話の部品が実際に実行した結果を知らせる)。待ちには上限があり、
 *   結果が届かなければ場面を畳む (終わったと偽らない)。
 * - 画面に出す文字列はどれも `displayField` の天井を通す。利用者が打った話題は
 *   `externalTextOnOneLine` で 1 行に畳んでから使う。
 */
import { displayField } from '../../shared/apiResponse';
import { externalTextOnOneLine } from './assistantMarkdown';
import type { Villager } from './villageData';

export interface SceneLine {
  readonly who: 'a' | 'b';
  readonly text: string;
}

/** 2 人の掛け合い 1 本 (3 行)。 */
export interface ChatterScene {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly lines: readonly SceneLine[];
}

/** 1 行を見せる刻み (1 刻み = 村の tick)。 */
export const SCENE_LINE_TICKS = 3;
/** 台本の行数 (どの場面も同じ)。 */
export const SCENE_LINES = 3;
/** 場面 1 本の長さ = 3 行 + 次へ移る前の間。 */
export const SCENE_TICKS = SCENE_LINES * SCENE_LINE_TICKS + 2;

/**
 * 村の tick が一周する値。**場面 1 本の長さの倍数**にして、一周の境目が場面の途中に当たらないようにする
 * (100000 は 14 で割り切れず、一周するたびに場面が途中で切れた)。
 */
export const TICK_WRAP = SCENE_TICKS * Math.floor(100000 / SCENE_TICKS);

/** 名前・領域・重点を画面に出すときの天井。 */
const NAME_CHARS = 24;
const FOCUS_CHARS = 32;
/** 利用者の話題を吹き出しへ出すときの天井。 */
const TOPIC_CHARS = 16;

const nameOf = (v: Villager): string => displayField(v.name, NAME_CHARS);

/**
 * 村人の関係から台本を組む。部長 ↔ チーム・役員 ↔ 部長・総括 ↔ 役員の 3 種。
 * 役員の街区をまたいで順に並べる (最初の数本が 1 つの街区に偏らない)。
 */
export function buildChatterScenes(villagers: readonly Villager[]): ChatterScene[] {
  // 鍵に undefined も許す: 持ち場の無い村人の引きは「見つからない」になり、守りの分岐を別に持たない。
  const byId = new Map<string | undefined, Villager>(villagers.map((v) => [v.id, v] as const));
  const coo = villagers.find((v) => v.kind === 'coo');
  const teamsOf = new Map<string | undefined, number>();
  for (const v of villagers) {
    if (v.kind === 'team') teamsOf.set(v.managerId, (teamsOf.get(v.managerId) ?? 0) + 1);
  }

  const perExec = new Map<string, ChatterScene[]>();
  const push = (execId: string, scene: ChatterScene): void => {
    const list = perExec.get(execId);
    if (list === undefined) perExec.set(execId, [scene]);
    else list.push(scene);
  };

  for (const v of villagers) {
    const exec = byId.get(v.execId);
    if (exec === undefined) continue;
    const execId = exec.id;

    if (v.kind === 'team') {
      const manager = byId.get(v.managerId);
      if (manager === undefined) continue;
      // 非文字列は displayField が '' にする: 無い・空・非文字列は同じ「台帳に無い」。
      const focus = displayField(v.focus, FOCUS_CHARS);
      const domain = displayField(v.domain, FOCUS_CHARS);
      push(execId, {
        id: `${manager.id}:${v.id}`,
        a: manager.id,
        b: v.id,
        lines: [
          { who: 'a', text: focus === '' ? `${nameOf(v)}の様子はどうだい？` : `${nameOf(v)}の重点は「${focus}」だったね。` },
          { who: 'b', text: domain === '' ? 'はい、持ち場で進めています。' : `はい、${domain}の担当として進めています。` },
          { who: 'a', text: `何かあれば${nameOf(exec)}にも相談しよう。` },
        ],
      });
    } else if (v.kind === 'manager') {
      const n = teamsOf.get(v.id) ?? 0;
      push(execId, {
        id: `${exec.id}:${v.id}`,
        a: exec.id,
        b: v.id,
        lines: [
          { who: 'a', text: n === 0 ? `${nameOf(v)}の部の様子を聞かせてください。` : `${nameOf(v)}の部は${n}チームを見ているね。` },
          { who: 'b', text: 'はい、各チームの重点を見ながら調整しています。' },
          { who: 'a', text: '助かります。引き続きお願いします。' },
        ],
      });
    } else if (v.kind === 'executive' && coo !== undefined) {
      push(execId, {
        id: `${coo.id}:${v.id}`,
        a: coo.id,
        b: v.id,
        lines: [
          { who: 'a', text: `${nameOf(v)}、街区で共有したいことはありますか？` },
          { who: 'b', text: 'はい、チームの重点を揃えて進めています。' },
          { who: 'a', text: '了解です。必要なら声をかけてください。' },
        ],
      });
    }
  }

  // 街区をまたいで 1 本ずつ取る (ラウンドロビン)。街区の並びは村人の登場順。
  const queues = [...perExec.values()];
  const longest = Math.max(0, ...queues.map((q) => q.length));
  return Array.from({ length: longest }, (_, round) => queues.flatMap((q) => q.slice(round, round + 1))).flat();
}

export interface SceneCursor {
  readonly scene: ChatterScene;
  /** 見せている行。場面の最後の間は null (台詞は出さない)。 */
  readonly lineIndex: number | null;
  /** 同じ行の間は変わらない鍵 (ログに 1 度だけ足すため)。 */
  readonly key: string;
}

/**
 * いまの tick で見せる場面。場面番号は**全場面の並び**で決め、そこが `eligible` に居ない (2 人が揃わない) ときだけ
 * 次の場面へ送る。該当が 1 本も無ければ null。
 *
 * 以前は「揃う場面だけを数え直した並び」で選んでいたので、街区の拡大などで揃う場面の数が変わると、
 * 場面の途中で別の掛け合いへ飛んだ。いまは揃う場面の数が変わっても、いま見せている場面が揃っているかぎり動かない。
 */
export function sceneCursor(
  scenes: readonly ChatterScene[],
  eligible: ReadonlySet<string>,
  tick: number,
): SceneCursor | null {
  const n = scenes.length;
  const slot = Math.floor(tick / SCENE_TICKS);
  // 並びを slot から 1 周だけ見て、最初に揃う場面を採る (場面が 0 件なら見る物が無く null)。
  const scene =
    Array.from({ length: n }, (_, k) => scenes[(slot + k) % n]!).find((s) => eligible.has(s.a) && eligible.has(s.b)) ??
    null;
  if (scene === null) return null;
  const within = tick - slot * SCENE_TICKS;
  const idx = Math.floor(within / SCENE_LINE_TICKS);
  const lineIndex = idx < SCENE_LINES ? idx : null;
  return { scene, lineIndex, key: `${scene.id}#${lineIndex === null ? 'gap' : lineIndex}` };
}

// ─── 頼んだ作業の流れ ──────────────────────────────────────────────────

export interface FlowStage {
  readonly speakerId: string;
  readonly listenerId?: string;
  /** 流れの札 (受付 / 割り当て / 作業中 / 完了 / 失敗)。 */
  readonly label: FlowLabel;
  readonly text: string;
}

export type FlowLabel = '受付' | '割り当て' | '作業中' | '完了' | '失敗';

export interface RequestFlow {
  /** 受付 → 割り当て … → 作業中。 */
  readonly stages: readonly FlowStage[];
  readonly done: FlowStage;
  readonly failed: FlowStage;
}

export interface FlowRoute {
  readonly executiveId?: string;
  readonly managerId?: string;
  readonly teamId?: string;
}

/** 受付 〜 作業中の各段は 1 tick ずつ見せる (経過 tick がそのまま段の番号)。完了 / 失敗の段を見せる刻み。 */
export const FLOW_END_HOLD_TICKS = 3;
/** 結果が来ないとき、作業中のまま待つ上限 (これを過ぎたら場面を畳む)。 */
export const FLOW_WAIT_CAP_TICKS = 60;

/**
 * 話題が担当へ渡る流れを組む。総括 (COO) が受け付け、役員 → 部長 → チームの順に渡し、
 * 最後の担当が作業に入る。担当が 1 人も見つからなければ総括が自分で受ける。
 * 総括が村に居なければ null (場面を出さない)。
 */
export function buildRequestFlow(
  villagers: readonly Villager[],
  route: FlowRoute,
  topic: string,
  work?: { readonly text?: string; readonly doneText?: string; readonly failedText?: string },
): RequestFlow | null {
  const byId = new Map<string | undefined, Villager>(villagers.map((v) => [v.id, v] as const));
  const coo = villagers.find((v) => v.kind === 'coo');
  if (coo === undefined) return null;
  const chain: Villager[] = [coo];
  for (const id of [route.executiveId, route.managerId, route.teamId]) {
    const v = byId.get(id);
    if (v !== undefined && v.id !== chain[chain.length - 1]!.id) chain.push(v);
  }
  const t = displayField(externalTextOnOneLine(topic), TOPIC_CHARS);
  const last = chain[chain.length - 1]!;
  const stages: FlowStage[] = [
    { speakerId: coo.id, listenerId: chain[1]?.id, label: '受付', text: `「${t}」を受け付けました。` },
  ];
  for (let i = 1; i < chain.length; i++) {
    stages.push({
      speakerId: chain[i - 1]!.id,
      listenerId: chain[i]!.id,
      label: '割り当て',
      text: `${nameOf(chain[i]!)}、「${t}」をお願いします。`,
    });
  }
  stages.push({ speakerId: last.id, label: '作業中', text: work?.text ?? `${nameOf(last)}が取りかかります。` });
  return {
    stages,
    done: { speakerId: last.id, label: '完了', text: work?.doneText ?? '回答を出しました。' },
    failed: { speakerId: last.id, label: '失敗', text: work?.failedText ?? 'うまくいきませんでした。' },
  };
}

export interface FlowOutcome {
  readonly kind: 'done' | 'failed';
  /** 結果が来た時点の経過 (流れが始まってからの tick)。 */
  readonly atElapsed: number;
}

export interface FlowCursor {
  readonly stage: FlowStage;
  /** 札の並びの中の位置 (0 起算)。完了 / 失敗は stages.length。 */
  readonly index: number;
  readonly phase: 'relay' | 'work' | 'end';
  /** 結果待ちで作業中のまま留まっているか。 */
  readonly waiting: boolean;
  /** 場面を畳んでよいか。 */
  readonly finished: boolean;
  readonly key: string;
}

/**
 * 流れが始まってから `elapsed` tick 経ったときの位置。結果 (`outcome`) が無いあいだは作業中で待ち、
 * 結果が来たら (または受付〜作業中を見せ終えたあとで) 完了 / 失敗の段へ移る。
 */
export function flowCursor(flow: RequestFlow, elapsed: number, outcome: FlowOutcome | null): FlowCursor {
  const n = flow.stages.length;
  const workIndex = n - 1;
  const lastStageEnds = n;
  const mk = (stage: FlowStage, index: number, phase: FlowCursor['phase'], waiting: boolean, finished: boolean): FlowCursor => ({
    stage,
    index,
    phase,
    waiting,
    finished,
    key: `flow#${index}${waiting ? 'w' : ''}`,
  });

  if (outcome === null) {
    if (elapsed >= lastStageEnds + FLOW_WAIT_CAP_TICKS) return mk(flow.stages[workIndex]!, workIndex, 'work', true, true);
    const idx = elapsed;
    if (idx < workIndex) return mk(flow.stages[idx]!, idx, 'relay', false, false);
    return mk(flow.stages[workIndex]!, workIndex, 'work', true, false);
  }

  const endStart = Math.max(lastStageEnds, outcome.atElapsed);
  if (elapsed < endStart) {
    const idx = Math.min(workIndex, elapsed);
    return mk(flow.stages[idx]!, idx, idx < workIndex ? 'relay' : 'work', false, false);
  }
  const end = outcome.kind === 'done' ? flow.done : flow.failed;
  return {
    stage: end,
    index: n,
    phase: 'end',
    waiting: false,
    finished: elapsed >= endStart + FLOW_END_HOLD_TICKS,
    key: `flow#end-${outcome.kind}`,
  };
}
