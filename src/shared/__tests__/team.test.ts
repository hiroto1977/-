import { describe, expect, it } from 'vitest';
import {
  ROLE_ORDER,
  ROLE_LABEL,
  isRole,
  roleRank,
  can,
  canAssignRole,
  seatsRemaining,
  canAddMember,
  canChangeRole,
  canRemoveMember,
} from '../team';

describe('roles', () => {
  it('orders member < admin < owner', () => {
    expect(ROLE_ORDER).toEqual(['member', 'admin', 'owner']);
    expect(roleRank('member')).toBeLessThan(roleRank('admin'));
    expect(roleRank('admin')).toBeLessThan(roleRank('owner'));
  });

  it('isRole guards input', () => {
    expect(isRole('owner')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole(null)).toBe(false);
  });

  it('maps each role to its Japanese label', () => {
    // ROLE_LABEL の各ラベルを固定 (ObjectLiteral {} / 各 StringLiteral "" の変異を kill)。
    expect(ROLE_LABEL).toEqual({ owner: 'オーナー', admin: '管理者', member: 'メンバー' });
  });
});

describe('can', () => {
  it('member can view+edit but not manage', () => {
    expect(can('member', 'view')).toBe(true);
    expect(can('member', 'edit-data')).toBe(true);
    expect(can('member', 'manage-members')).toBe(false);
    expect(can('member', 'manage-billing')).toBe(false);
  });

  it('admin can manage members + integrations but not billing/delete', () => {
    // view / edit-data も明示確認 (admin の Set 内 'view'/'edit-data' StringLiteral を kill)。
    expect(can('admin', 'view')).toBe(true);
    expect(can('admin', 'edit-data')).toBe(true);
    expect(can('admin', 'manage-members')).toBe(true);
    expect(can('admin', 'manage-integrations')).toBe(true);
    expect(can('admin', 'manage-billing')).toBe(false);
    expect(can('admin', 'delete-org')).toBe(false);
  });

  it('owner can do everything', () => {
    // owner の Set 内 'view'/'edit-data'/'manage-integrations' StringLiteral も kill。
    expect(can('owner', 'view')).toBe(true);
    expect(can('owner', 'edit-data')).toBe(true);
    expect(can('owner', 'manage-integrations')).toBe(true);
    expect(can('owner', 'manage-members')).toBe(true);
    expect(can('owner', 'manage-billing')).toBe(true);
    expect(can('owner', 'delete-org')).toBe(true);
  });
});

describe('canAssignRole', () => {
  it('lets owners grant roles strictly below owner', () => {
    expect(canAssignRole('owner', 'admin')).toBe(true);
    expect(canAssignRole('owner', 'member')).toBe(true);
    expect(canAssignRole('owner', 'owner')).toBe(false);
  });

  it('lets admins grant only member', () => {
    expect(canAssignRole('admin', 'member')).toBe(true);
    expect(canAssignRole('admin', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'owner')).toBe(false);
  });

  it('forbids members entirely', () => {
    expect(canAssignRole('member', 'member')).toBe(false);
  });
});

describe('seat limits', () => {
  it('computes remaining seats with a finite cap', () => {
    expect(seatsRemaining({ used: 3, limit: 25 })).toBe(22);
    expect(seatsRemaining({ used: 25, limit: 25 })).toBe(0);
    expect(seatsRemaining({ used: 30, limit: 25 })).toBe(0);
  });

  it('treats Infinity as unlimited', () => {
    expect(seatsRemaining({ used: 999, limit: Infinity })).toBe(Infinity);
    expect(canAddMember({ used: 999, limit: Infinity })).toBe(true);
  });

  it('canAddMember reflects the cap', () => {
    expect(canAddMember({ used: 0, limit: 1 })).toBe(true);
    expect(canAddMember({ used: 1, limit: 1 })).toBe(false);
  });
});

describe('canRemoveMember', () => {
  it('never removes the last owner', () => {
    expect(canRemoveMember('owner', 1)).toBe(false);
    expect(canRemoveMember('owner', 2)).toBe(true);
  });
  it('allows removing non-owners regardless', () => {
    expect(canRemoveMember('admin', 1)).toBe(true);
    expect(canRemoveMember('member', 1)).toBe(true);
  });
});

// 削除の側だけが「オーナーは 1 人以上」を守っていた (2026-09-06 実測)。役割の
// `<select>` は全員に 3 つの選択肢を出し、`onChangeRole` は素で `edit` を呼ぶので、
// オーナー 1 人の組織でその 1 人を「メンバー」にすると**オーナーが 0 人**になる。
// そうなると削除の守り自体が効かなくなり (`canRemoveMember(*, 0)` は true)、
// `canAssignRole` は「自分より下の役割しか与えられない」規則なのでオーナーを
// 作り直す道も無い。同じ不変条件は同じ強さで守る。
describe('canChangeRole', () => {
  it('最後のオーナーは降格できない', () => {
    expect(canChangeRole('owner', 'member', 1)).toBe(false);
    expect(canChangeRole('owner', 'admin', 1)).toBe(false);
  });

  it('オーナーが 2 人以上なら降格できる', () => {
    expect(canChangeRole('owner', 'member', 2)).toBe(true);
    expect(canChangeRole('owner', 'admin', 3)).toBe(true);
  });

  it('オーナーのままなら 1 人でも通す (同じ値を選び直しただけ)', () => {
    expect(canChangeRole('owner', 'owner', 1)).toBe(true);
  });

  it('オーナー以外の変更は数に関係なく通す (昇格を妨げない)', () => {
    expect(canChangeRole('member', 'owner', 0)).toBe(true);
    expect(canChangeRole('member', 'admin', 1)).toBe(true);
    expect(canChangeRole('admin', 'member', 1)).toBe(true);
  });

  it('0 人 (既に壊れている状態) からオーナーを立て直せる', () => {
    // 守りが入る前に 0 人になった端末でも、昇格の道は閉じない。
    expect(canChangeRole('member', 'owner', 0)).toBe(true);
    expect(canChangeRole('admin', 'owner', 0)).toBe(true);
  });

  it('削除の守りと同じ境目を使う (1 人までは断る・2 人から通す)', () => {
    for (const n of [0, 1]) {
      expect(canChangeRole('owner', 'member', n), `owners=${n}`).toBe(false);
      expect(canRemoveMember('owner', n), `owners=${n}`).toBe(false);
    }
    for (const n of [2, 5]) {
      expect(canChangeRole('owner', 'member', n), `owners=${n}`).toBe(true);
      expect(canRemoveMember('owner', n), `owners=${n}`).toBe(true);
    }
  });
});
