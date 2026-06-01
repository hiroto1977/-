/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  issueInviteCode,
  verifyInviteCode,
  activateInternalLicense,
  deactivateInternalLicense,
  hasInternalLicense,
  readInternalLicense,
  INTERNAL_INVITE_SECRET,
} from '../internalLicense';

// jsdom provides localStorage; reset between tests.
beforeEach(() => {
  localStorage.clear();
});

describe('issueInviteCode / verifyInviteCode', () => {
  it('issues a stable SVCHUB-prefixed code for a given secret + label', () => {
    const a = issueInviteCode('');
    const b = issueInviteCode('');
    expect(a).toBe(b); // deterministic
    expect(a).toMatch(/^SVCHUB-[0-9A-Z]{8}$/);
  });

  it('produces different codes per label', () => {
    expect(issueInviteCode('alice')).not.toBe(issueInviteCode('bob'));
    expect(issueInviteCode('')).not.toBe(issueInviteCode('alice'));
  });

  it('verifies a matching code (case-insensitive, trims whitespace)', () => {
    const code = issueInviteCode('社員A');
    expect(verifyInviteCode(code, '社員A')).toBe(true);
    expect(verifyInviteCode('  ' + code.toLowerCase() + '  ', '社員A')).toBe(true);
  });

  it('rejects a wrong code or wrong label or wrong secret', () => {
    expect(verifyInviteCode('SVCHUB-00000000', '')).toBe(false);
    expect(verifyInviteCode(issueInviteCode('alice'), 'bob')).toBe(false);
    expect(verifyInviteCode(issueInviteCode('', 'other-secret'), '', INTERNAL_INVITE_SECRET)).toBe(false);
    expect(verifyInviteCode(123 as never, '')).toBe(false);
  });
});

describe('activate / read / deactivate internal license', () => {
  it('starts with no license', () => {
    expect(hasInternalLicense()).toBe(false);
    expect(readInternalLicense()).toBeNull();
  });

  it('activates with a valid generic code and persists', () => {
    const code = issueInviteCode('');
    expect(activateInternalLicense(code)).toBe(true);
    expect(hasInternalLicense()).toBe(true);
    const lic = readInternalLicense();
    expect(lic?.code).toBe(code);
    expect(typeof lic?.activatedAt).toBe('string');
  });

  it('activates with a label-specific code when the holder matches', () => {
    const code = issueInviteCode('yamada');
    expect(activateInternalLicense(code, 'yamada')).toBe(true);
    expect(hasInternalLicense()).toBe(true);
  });

  it('rejects an invalid code (no activation)', () => {
    expect(activateInternalLicense('SVCHUB-DEADBEEF')).toBe(false);
    expect(hasInternalLicense()).toBe(false);
  });

  it('deactivates and returns to no-license', () => {
    activateInternalLicense(issueInviteCode(''));
    expect(hasInternalLicense()).toBe(true);
    deactivateInternalLicense();
    expect(hasInternalLicense()).toBe(false);
    expect(readInternalLicense()).toBeNull();
  });

  it('ignores a tampered stored license (forged code) on read', () => {
    localStorage.setItem('servicehub.internalLicense', JSON.stringify({ code: 'SVCHUB-FORGED01', holder: '', activatedAt: new Date().toISOString() }));
    expect(readInternalLicense()).toBeNull();
    expect(hasInternalLicense()).toBe(false);
  });

  it('survives malformed JSON in storage', () => {
    localStorage.setItem('servicehub.internalLicense', '{not json');
    expect(() => readInternalLicense()).not.toThrow();
    expect(readInternalLicense()).toBeNull();
  });
});
