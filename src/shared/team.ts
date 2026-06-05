// Team / RBAC model — pure, dependency-free role and seat logic shared by
// main + renderer. Pairs with the plan-tier model (`plan.ts`): a plan grants
// a seat cap (`maxSeats`) and the `team-seats` feature; this module decides
// who can do what and whether another member can be added.

export type Role = 'owner' | 'admin' | 'member';

/** Lowest → highest authority. */
export const ROLE_ORDER: readonly Role[] = ['member', 'admin', 'owner'];

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
};

/** Coarse capabilities a role may hold. */
export type Capability =
  | 'view' // read dashboards
  | 'edit-data' // create/edit business records (sales, KPI actuals, …)
  | 'manage-integrations' // configure tokens / connect services
  | 'manage-members' // invite/remove members, change roles
  | 'manage-billing' // change plan / billing
  | 'delete-org'; // destructive org-level actions

const ROLE_CAPABILITIES: Readonly<Record<Role, ReadonlySet<Capability>>> = {
  member: new Set<Capability>(['view', 'edit-data']),
  admin: new Set<Capability>(['view', 'edit-data', 'manage-integrations', 'manage-members']),
  owner: new Set<Capability>([
    'view',
    'edit-data',
    'manage-integrations',
    'manage-members',
    'manage-billing',
    'delete-org',
  ]),
};

export function isRole(v: unknown): v is Role {
  // typeof は v を string に絞る型述語として必須だが、includes は === 判定のため非文字列は
  // 元から弾かれ、typeof を true 固定する変異は runtime-equivalent。
  // Stryker disable next-line ConditionalExpression
  return typeof v === 'string' && (ROLE_ORDER as readonly string[]).includes(v);
}

export function roleRank(role: Role): number {
  return ROLE_ORDER.indexOf(role);
}

/** Whether `role` holds `capability`. */
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/**
 * Whether `actor` may assign `targetRole` to someone. Rule: you can only
 * grant a role strictly below your own (an admin can manage members but not
 * mint owners/other admins; only an owner can create admins). This prevents
 * privilege escalation through the member-management UI.
 */
export function canAssignRole(actor: Role, targetRole: Role): boolean {
  // manage-members を持たない唯一の役割は member (rank 0)。その場合 roleRank(target) < 0 は
  // 常に false で下の rank 比較と同値になるため、この能力ガードを外す変異は runtime-equivalent
  // (権限の明示ガードとして残す)。
  // Stryker disable next-line ConditionalExpression
  if (!can(actor, 'manage-members')) return false;
  return roleRank(targetRole) < roleRank(actor);
}

export interface SeatUsage {
  /** Current member count. */
  readonly used: number;
  /** Plan seat cap (`Infinity` = unlimited). */
  readonly limit: number;
}

export function seatsRemaining(usage: SeatUsage): number {
  // limit===Infinity でも Math.max(0, Infinity - used) = Infinity になるため、Infinity の
  // 特例分岐は冗長 (簡約して equivalent mutant を排除)。
  return Math.max(0, usage.limit - usage.used);
}

export function canAddMember(usage: SeatUsage): boolean {
  return seatsRemaining(usage) > 0;
}

/**
 * Guard for removing a member: the last owner can never be removed (an org
 * must always have at least one owner). `ownerCount` is the number of owners
 * currently in the org; `targetRole` is the role of the member to remove.
 */
export function canRemoveMember(targetRole: Role, ownerCount: number): boolean {
  if (targetRole === 'owner' && ownerCount <= 1) return false;
  return true;
}
