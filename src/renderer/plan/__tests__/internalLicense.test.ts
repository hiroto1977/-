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
    // hasInternalLicense() は自社商品ビルドでは常に true なので、ストレージ層
    // (readInternalLicense) で「コード未保存」を検証する。
    expect(readInternalLicense()).toBeNull();
  });

  it('activates with a valid generic code and persists', () => {
    const code = issueInviteCode('');
    expect(activateInternalLicense(code)).toBe(true);
    const lic = readInternalLicense();
    expect(lic?.code).toBe(code);
    expect(typeof lic?.activatedAt).toBe('string');
  });

  it('activates with a label-specific code when the holder matches', () => {
    const code = issueInviteCode('yamada');
    expect(activateInternalLicense(code, 'yamada')).toBe(true);
    expect(readInternalLicense()?.code).toBe(code);
  });

  it('rejects an invalid code (no activation persisted)', () => {
    expect(activateInternalLicense('SVCHUB-DEADBEEF')).toBe(false);
    expect(readInternalLicense()).toBeNull();
  });

  it('deactivates and clears the stored license', () => {
    activateInternalLicense(issueInviteCode(''));
    expect(readInternalLicense()).not.toBeNull();
    deactivateInternalLicense();
    expect(readInternalLicense()).toBeNull();
  });

  it('ignores a tampered stored license (forged code) on read', () => {
    localStorage.setItem('servicehub.internalLicense', JSON.stringify({ code: 'SVCHUB-FORGED01', holder: '', activatedAt: new Date().toISOString() }));
    expect(readInternalLicense()).toBeNull();
  });

  it('self-product build grants all-access (hasInternalLicense always true)', () => {
    // SELF_PRODUCT_ALL_ACCESS = true のため、コード未保存でも全機能が有効。
    expect(hasInternalLicense()).toBe(true);
  });

  it('survives malformed JSON in storage', () => {
    localStorage.setItem('servicehub.internalLicense', '{not json');
    expect(() => readInternalLicense()).not.toThrow();
    expect(readInternalLicense()).toBeNull();
  });
});
