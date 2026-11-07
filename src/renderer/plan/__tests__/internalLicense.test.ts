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

  it('derives exact golden codes (pins secret, FNV loop, # salt, padStart)', () => {
    // 既定シークレット + 空ラベルの golden。secret 値 / FNV ループ境界 / '#' 塩の変異を撃墜。
    expect(issueInviteCode('')).toBe('SVCHUB-1FLF1188');
    // 'yamada' は両 FNV 半が 6 桁 → padStart(7,'0') の先頭 0 が slice に効く golden で
    // padStart の '0' を '' にする変異を撃墜。
    expect(issueInviteCode('yamada')).toBe('SVCHUB-0SE20Y9N');
  });

  it('uses an empty label by default (issue/verify default-parameter intact)', () => {
    // label='' の既定値を別文字列にする mutant を無引数呼び出しで撃墜。
    expect(issueInviteCode()).toBe(issueInviteCode(''));
    expect(verifyInviteCode(issueInviteCode(''))).toBe(true);
  });

  it('normalizes the label (trim + lowercase) before hashing', () => {
    // label.trim().toLowerCase() を外す / toUpperCase に変える mutant を撃墜。
    expect(issueInviteCode('  YAMADA  ')).toBe(issueInviteCode('yamada'));
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
    // 既定 holder は '' (holder='' 既定値を別文字列にする mutant を撃墜)。
    expect(lic?.holder).toBe('');
    // LS_KEY が 'servicehub.internalLicense' であることを保存先キーで固定 (空文字化 mutant 撃墜)。
    expect(localStorage.getItem('servicehub.internalLicense')).not.toBeNull();
  });

  it('normalizes the stored code (trim + uppercase) and holder (trim)', () => {
    // code.trim().toUpperCase() / holder.trim() を外す mutant を、空白+小文字入力で撃墜。
    const code = issueInviteCode('yamada');
    expect(activateInternalLicense('  ' + code.toLowerCase() + '  ', '  yamada  ')).toBe(true);
    const lic = readInternalLicense();
    expect(lic?.code).toBe(code); // 正規化済み (大文字・トリム)
    expect(lic?.holder).toBe('yamada'); // トリム済み
  });

  it('accepts a generic code even when a holder label is supplied (|| "" fallback)', () => {
    // activate / read とも `verify(code, holder) || verify(code, '')` の汎用フォールバックを
    // 通る経路。第2 verify の '' を別文字列にする / 条件を落とす mutant を撃墜。
    const code = issueInviteCode('');
    expect(activateInternalLicense(code, 'somebody')).toBe(true);
    const lic = readInternalLicense();
    expect(lic?.code).toBe(code);
    expect(lic?.holder).toBe('somebody');
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

  it('rejects a forged code regardless of the stored holder (both verify gates reject)', () => {
    // 偽造コードは holder 一致経路 (verify(code, holder)) も汎用経路 (verify(code, '')) も
    // 通らず null。両 if の条件を true 固定する mutant は偽造ライセンスを返すため撃墜。
    localStorage.setItem(
      'servicehub.internalLicense',
      JSON.stringify({ code: 'SVCHUB-DEADBEEF', holder: 'attacker', activatedAt: new Date().toISOString() }),
    );
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
