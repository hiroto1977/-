/**
 * **専属カウンセラーの名簿と記録を、保管層の行から組む 1 つの口** (2026-10-29 · パス 555)。
 *
 * 読み手は 2 画面 (`MentorPage` / `TeamPage` の「ひとりひとりの負担」) で、どちらも同じ規則で
 * 読まなければ、同じ人が片方の画面に居てもう片方に居ない形になる。
 * - 保管値は型が守らない (復元・古い版): メールが読めない行は名簿に入れず、役割が読めなければ
 *   member として扱う (`malformedStoreRenders` —— パス 551 で `memberKeyOf(undefined)` が投げた)。
 * - 記録は読める項目だけを採り、行は残す (`sanitizeMentorSession`)。
 */
import type { StoredRecord } from './store';
import type { Member } from './members';
import { displayField } from '../../shared/apiResponse';
import { isRole } from '../../shared/team';
import { memberKeyOf, sanitizeMentorSession, type MentorMember, type MentorSession } from '../../shared/mentor';

export function mentorRoster(records: readonly StoredRecord<Member>[]): readonly MentorMember[] {
  return records
    .filter((r) => typeof r.data.email === 'string' && r.data.email.trim() !== '')
    .map((r) => ({ key: memberKeyOf(r.data.email), name: displayField(r.data.name) || displayField(r.data.email), role: isRole(r.data.role) ? r.data.role : 'member' }));
}

export interface StoredMentorSession {
  readonly id: string;
  readonly raw: MentorSession;
  readonly session: MentorSession;
}

export function storedMentorSessions(records: readonly StoredRecord<MentorSession>[]): readonly StoredMentorSession[] {
  const out: StoredMentorSession[] = [];
  for (const r of records) {
    const s = sanitizeMentorSession(r.data);
    if (s !== null) out.push({ id: r.id, raw: r.data, session: s });
  }
  return out;
}
