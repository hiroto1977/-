import { describe, expect, it } from 'vitest';
import { MAX_TOKEN_INPUT_CHARS, checkTokenInput } from '../tokenInput';

/**
 * `secrets:set` は上限超えなどを `return;` で黙って捨てていて、renderer からは
 * 保存できた場合と区別が付かなかった (2026-08 監査)。規則と**理由**をここに置く。
 */
describe('checkTokenInput — 受理', () => {
  it('前後の空白を落として返す', () => {
    expect(checkTokenInput('  ghp_abc  ')).toEqual({ ok: true, value: 'ghp_abc' });
  });

  it('上限ちょうどは受理する (境界)', () => {
    const value = 'a'.repeat(MAX_TOKEN_INPUT_CHARS);
    expect(checkTokenInput(value)).toEqual({ ok: true, value });
  });

  it('空白を落とした結果が上限内なら受理する', () => {
    const value = 'a'.repeat(MAX_TOKEN_INPUT_CHARS);
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
    const r = checkTokenInput('a'.repeat(MAX_TOKEN_INPUT_CHARS + 1));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('too-long');
    expect(r.message).toContain(String(MAX_TOKEN_INPUT_CHARS + 1));
    expect(r.message).toContain(String(MAX_TOKEN_INPUT_CHARS));
  });

  /*
   * **刷る数も「字」である** (2026-09-13 · パス 196)。文面は
   * 「N 文字 / 上限 M 文字」と言うのに、N は `value.length` (コード単位) だった ——
   * 絵文字の資格情報では**実際の倍の数**を刷り、しかもその値は天井を超えていない。
   */
  it('★ 絵文字は字で数える (天井いっぱいは通り、文面の数も字)', () => {
    const atLimit = '\u{1F600}'.repeat(MAX_TOKEN_INPUT_CHARS);
    expect(atLimit.length).toBe(MAX_TOKEN_INPUT_CHARS * 2); // コード単位では 2 倍
    expect(checkTokenInput(atLimit)).toMatchObject({ ok: true });
    const over = checkTokenInput(atLimit + '\u{1F600}');
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error('unreachable');
    expect(over.message).toContain(`${MAX_TOKEN_INPUT_CHARS + 1} 文字`);
    // コード単位の数 (2 倍) を刷っていないこと。
    expect(over.message).not.toContain(`${(MAX_TOKEN_INPUT_CHARS + 1) * 2} 文字`);
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

describe('MAX_TOKEN_INPUT_CHARS', () => {
  it('64KiB — main と renderer で同じ値を使う唯一の定義', () => {
    expect(MAX_TOKEN_INPUT_CHARS).toBe(65536);
  });
});

/*
 * 改行・制御文字 (2026-08-22 に追加)。
 *
 * 注入はできない —— 実測で `new Headers()` が CR/LF/NUL を含む値を
 * 「is an invalid header value」で throw する。直す理由は**失敗する場所**で、
 * 折り返した PAT を貼ると「保存は成功 → 次の取得で不可解な TypeError」に
 * なっていた。保存時に理由つきで断る。
 */
describe('checkTokenInput — 改行・制御文字', () => {
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const NUL = String.fromCharCode(0);

  it.each([
    ['CRLF が途中にある', 'ghp_aaa' + CR + LF + 'bbb'],
    ['LF だけ', 'ghp_aaa' + LF + 'bbb'],
    ['CR だけ', 'ghp_aaa' + CR + 'bbb'],
    ['NUL', 'ghp_aaa' + NUL + 'bbb'],
    ['タブ', 'ghp_aaa\tbbb'],
    ['DEL (0x7f)', 'ghp_aaa' + String.fromCharCode(127) + 'bbb'],
  ])('%s は断る', (_label, raw) => {
    const r = checkTokenInput(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('control-char');
      expect(r.message).toContain('制御文字');
    }
  });

  it('前後の改行は trim で落ちるので受理する (折り返しではなく余白)', () => {
    const r = checkTokenInput(LF + '  ghp_valid  ' + CR + LF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('ghp_valid');
  });

  it('通常のトークンは今までどおり通る', () => {
    const r = checkTokenInput('ghp_' + 'a'.repeat(36));
    expect(r.ok).toBe(true);
  });
});
