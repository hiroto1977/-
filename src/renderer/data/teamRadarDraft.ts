/**
 * Team Radar の下書き (localStorage `servicehub.teamradar.draft.v1`) の形。
 * 保存値は型が守らないので、読むときは `sanitizeRadarDraft` を通す —— `members` が配列でない値だと
 * `.map` で、`axes` が同じ長さの文字列だと配列として扱った所で、画面が落ちる。
 */
import { isRecord } from './persistedShape';

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

/** id・name が文字列で scores が配列なら受ける。点は数でなければ 0 (並びを崩さない)。付箋は軸番号→文字列だけ。 */
export function sanitizeTeamMember(value: unknown): TeamMember | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.scores)) return null;
  const member: TeamMember = { id: value.id, name: value.name, scores: value.scores.map(finiteOrZero) };
  if (isRecord(value.notes)) {
    const notes: Record<number, string> = {};
    for (const [k, text] of Object.entries(value.notes)) {
      const axis = Number(k);
      if (Number.isInteger(axis) && axis >= 0 && typeof text === 'string') notes[axis] = text;
    }
    member.notes = notes;
  }
  return member;
}

/** 形の合う欄だけを持つ下書き。オブジェクトでなければ空 (= 下書きなし)。 */
export function sanitizeRadarDraft(value: unknown): RadarDraft {
  if (!isRecord(value)) return {};
  const out: RadarDraft = {};
  if (typeof value.title === 'string') out.title = value.title;
  if (typeof value.department === 'string') out.department = value.department;
  if (typeof value.evaluatedAt === 'string') out.evaluatedAt = value.evaluatedAt;
  if (Array.isArray(value.axes)) out.axes = value.axes.filter((a): a is string => typeof a === 'string');
  if (Array.isArray(value.members)) out.members = value.members.map(sanitizeTeamMember).filter((m): m is TeamMember => m !== null);
  return out;
}
