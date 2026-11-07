/**
 * Team Radar の下書き (localStorage `servicehub.teamradar.draft.v1`) の形。
 * 保存値は型が守らないので、読むときは `sanitizeRadarDraft` を通す —— `members` が配列でない値だと
 * `.map` で、`axes` が同じ長さの文字列だと配列として扱った所で、画面が落ちる。
 */
import { isRecord } from './persistedShape';
import {
  AXIS_COUNT,
  MAX_AXIS_LABEL_CHARS,
  MAX_CHART_TITLE_CHARS,
  MAX_DEPARTMENT_CHARS,
  MAX_EVALUATED_AT_CHARS,
  MAX_MEMBER_NAME_CHARS,
  MAX_MEMBER_NOTE_CHARS,
  SCORE_MAX,
  SCORE_MIN,
} from '../../shared/teamRadarState';
import { clampToCeiling } from '../../shared/inputCeiling';

export interface TeamMember {
  id: string;
  name: string;
  scores: number[];
  notes?: Record<number, string>;
}

export interface RadarDraft {
  title?: string;
  axes?: string[];
  department?: string;
  evaluatedAt?: string;
  members?: TeamMember[];
}

const finiteOrZero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * id・name が文字列で scores が配列なら受ける。点は数でなければ 0 (並びを崩さない)。付箋は軸番号→文字列だけ。
 *
 * **表示する自由文は読むときに天井を掛ける** (2026-10-31 · パス 569)。保存の関門
 * (TeamRadarPage の `fieldsOverCeiling`) と snapshot の `validateMembers` は名前・付箋を
 * 上限で断るのに、この下書きの読みは長さを 1 つも見ていなかった —— 手で直した
 * localStorage・旧版の下書きが 200,000 字の名前を持つと、画面 (一覧・レーダーの凡例・
 * aria) にそのまま描かれ 2.2M 字に膨れた (パス 419 / 568 の「入口が出口より厳しい」)。
 * `name` / 付箋は**表示専用** (結合は `id` でする) なので、入力欄の天井と同じ
 * `clampToCeiling` で読むときに畳む。**`id` は同一性の鍵なので畳まない** (切ると別の
 * メンバーを指す · パス 420)。正当な値 (≤ 上限) は 1 字も変わらない。
 */
export function sanitizeTeamMember(value: unknown): TeamMember | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.scores)) return null;
  const member: TeamMember = { id: value.id, name: clampToCeiling(value.name, MAX_MEMBER_NAME_CHARS), scores: value.scores.map(finiteOrZero) };
  if (isRecord(value.notes)) {
    const notes: Record<number, string> = {};
    for (const [k, text] of Object.entries(value.notes)) {
      const axis = Number(k);
      if (Number.isInteger(axis) && axis >= 0 && typeof text === 'string') notes[axis] = clampToCeiling(text, MAX_MEMBER_NOTE_CHARS);
    }
    member.notes = notes;
  }
  return member;
}

/**
 * 形の合う欄だけを持つ下書き。オブジェクトでなければ空 (= 下書きなし)。
 *
 * 表示する自由文 (チャート名・部署・評価時点・軸名) は読むときに天井を掛ける ——
 * 保存の関門 (`fieldsOverCeiling`) が断る上限と同じ物で畳む (パス 569 · 上記)。
 */
export function sanitizeRadarDraft(value: unknown): RadarDraft {
  if (!isRecord(value)) return {};
  const out: RadarDraft = {};
  if (typeof value.title === 'string') out.title = clampToCeiling(value.title, MAX_CHART_TITLE_CHARS);
  if (typeof value.department === 'string') out.department = clampToCeiling(value.department, MAX_DEPARTMENT_CHARS);
  if (typeof value.evaluatedAt === 'string') out.evaluatedAt = clampToCeiling(value.evaluatedAt, MAX_EVALUATED_AT_CHARS);
  if (Array.isArray(value.axes)) out.axes = value.axes.filter((a): a is string => typeof a === 'string').map((a) => clampToCeiling(a, MAX_AXIS_LABEL_CHARS));
  if (Array.isArray(value.members)) out.members = value.members.map(sanitizeTeamMember).filter((m): m is TeamMember => m !== null);
  return out;
}

/**
 * 追加したメンバーの評点の初期値 —— **軸の数と範囲は保存の関門と同じ物から組む** (パス 493g)。
 *
 * 2026-09-27 まで画面は `scores: [3, 3, 3, 3, 3]` と**5 つを字面で**書いていた。保存の関門
 * (`validateMembers`) は `scores.length === AXIS_COUNT` を要求するので、軸を 1 つ足した日に
 * 画面で足したメンバーだけが「member scores must be an array of length 6」で保存を断られる形だった。
 * 値は範囲の真ん中 (1〜5 なら 3)。「未評価」で始めるかは利用者の判断待ち (docs/REMAINING_WORK.md)。
 */
export function newMemberScores(): number[] {
  const mid = Math.round((SCORE_MIN + SCORE_MAX) / 2);
  return Array.from({ length: AXIS_COUNT }, () => mid);
}
