import { describe, expect, it } from 'vitest';
import {
  ROLE_ORDER,
  isRole,
  roleRank,
  can,
  canAssignRole,
  seatsRemaining,
  canAddMember,
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
});

describe('can', () => {
  it('member can view+edit but not manage', () => {
    expect(can('member', 'view')).toBe(true);
    expect(can('member', 'edit-data')).toBe(true);
    expect(can('member', 'manage-members')).toBe(false);
    expect(can('member', 'manage-billing')).toBe(false);
  });

  it('admin can manage members + integrations but not billing/delete', () => {
    expect(can('admin', 'manage-members')).toBe(true);
    expect(can('admin', 'manage-integrations')).toBe(true);
    expect(can('admin', 'manage-billing')).toBe(false);
    expect(can('admin', 'delete-org')).toBe(false);
  });

  it('owner can do everything', () => {
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
