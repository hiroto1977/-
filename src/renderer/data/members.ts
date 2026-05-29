/**
 * Team members — persisted in the local record store (collection
 * `team-members`). Validation + role/email parsing live here; seat-limit and
 * permission rules come from the pure `shared/team.ts` model. Consumed in the
 * renderer via `useCollection(MEMBERS_COLLECTION)`.
 */
import { isRole, type Role } from '../../shared/team';

export const MEMBERS_COLLECTION = 'team-members';

export interface Member extends Record<string, unknown> {
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

/** Permissive but sane email check — we only persist it, never send mail. */
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

export function parseMember(input: { name?: unknown; email?: unknown; role?: unknown }): Member {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0 || name.length > 64) throw new Error('氏名は 1〜64 文字で入力してください');

  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!isEmail(email)) throw new Error('メールアドレスの形式が正しくありません');

  if (!isRole(input.role)) throw new Error('役割が不正です');

  return { name, email, role: input.role };
}

/** Count owners in a member list (for the "last owner" guard). */
export function countOwners(members: readonly Member[]): number {
  return members.reduce((acc, m) => acc + (m.role === 'owner' ? 1 : 0), 0);
}
