import { describe, expect, it } from 'vitest';
import { TOKEN_MAX_LENGTH, checkTokenInput } from '../tokenInput';

/**
 * `secrets:set` は上限超えなどを `return;` で黙って捨てていて、renderer からは
 * 保存できた場合と区別が付かなかった (2026-08 監査)。規則と**理由**をここに置く。
 */
describe('checkTokenInput — 受理', () => {
  it('前後の空白を落として返す', () => {
    expect(checkTokenInput('  ghp_abc  ')).toEqual({ ok: true, value: 'ghp_abc' });
  });

  it('上限ちょうどは受理する (境界)', () => {
    const value = 'a'.repeat(TOKEN_MAX_LENGTH);
    expect(checkTokenInput(value)).toEqual({ ok: true, value });
  });

  it('空白を落とした結果が上限内なら受理する', () => {
    const value = 'a'.repeat(TOKEN_MAX_LENGTH);
    expect(checkTokenInput(`  ${value}  `)).toEqual({ ok: true, value });
  });
});

describe('checkTokenInput — 拒否', () => {
  it('空文字は empty', () => {
    const r = checkTokenInput('');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('empty');
    expect(r.message).toContain('入力してください');
  });

  it('空白のみは empty (trim 後に判定する)', () => {
    expect(checkTokenInput('   \t\n  ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('上限 +1 は too-long で、実長と上限を message に出す', () => {
    const r = checkTokenInput('a'.repeat(TOKEN_MAX_LENGTH + 1));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('too-long');
    expect(r.message).toContain(String(TOKEN_MAX_LENGTH + 1));
    expect(r.message).toContain(String(TOKEN_MAX_LENGTH));
  });

  it('文字列でない入力は empty (undefined / null / 数値 / オブジェクト)', () => {
    for (const value of [undefined, null, 0, 42, {}, [], true]) {
      expect(checkTokenInput(value), JSON.stringify(value) ?? 'undefined').toMatchObject({
        ok: false,
        reason: 'empty',
      });
    }
  });
});

describe('TOKEN_MAX_LENGTH', () => {
  it('64KiB — main と renderer で同じ値を使う唯一の定義', () => {
    expect(TOKEN_MAX_LENGTH).toBe(65536);
  });
});
