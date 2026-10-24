/**
 * **資格情報の保管の断りの文面と、包んだ後の長さの境目を値で留める** (2026-09-30 · パス 502)。
 *
 * 全掃引 #179 の生存 3 件:
 *   - `brokenStoredCredentialMessage` の文面 —— main の検査は `toBe(brokenStoredCredentialMessage('github'))`
 *     と**関数自身の答えと比べる**ので、文面を空にしても両辺が一緒に空になって通った。
 *   - 保存できる形にできない応答 (循環参照・BigInt) の文面 —— 検査は `reason` だけを見ていた。
 *   - `chars > MAX_TOKEN_INPUT_CHARS` —— 既存の標本は「上限 − 20」と「上限ちょうどの本体」で、
 *     **包んだ後がちょうど上限**の境目を見ていなかった (`>` と `>=` が区別できない)。
 *
 * 期待は手で書く (関数の答えを期待に使わない)。
 */
import { describe, expect, it } from 'vitest';
import { countChars } from '../inputCeiling';
import { MAX_TOKEN_INPUT_CHARS } from '../tokenInput';
import { brokenStoredCredentialMessage, checkTokenSetForStorage } from '../vaultToken';

describe('brokenStoredCredentialMessage — サービス名から始め、登録し直しを案内する (全文)', () => {
  it.each(['github', 'notion', 'microsoft-365'])('★ %s', (id) => {
    expect(brokenStoredCredentialMessage(id)).toBe(`${id} の保存された資格情報が壊れています。設定から登録し直してください`);
  });
});

describe('checkTokenSetForStorage — 保存できない応答の断り (全文)', () => {
  it('★ 循環参照は「保存できる形にできない」と理由つきで断る (投げない)', () => {
    const cyclic: Record<string, unknown> = { accessToken: 'abc' };
    cyclic['self'] = cyclic;
    expect(checkTokenSetForStorage(cyclic)).toEqual({
      ok: false,
      reason: 'unserializable',
      message: '認可サーバの応答を保存できる形にできません',
    });
  });

  it('★ BigInt を含む応答も同じ断り (JSON にできない)', () => {
    expect(checkTokenSetForStorage({ accessToken: 'abc', expiresIn: 10n })).toEqual({
      ok: false,
      reason: 'unserializable',
      message: '認可サーバの応答を保存できる形にできません',
    });
  });

  it('対照: 使える形なら、測った文字列そのものを返す (包んだ物と書く物が同じ)', () => {
    expect(checkTokenSetForStorage({ accessToken: 'abc' })).toEqual({ ok: true, serialized: '{"accessToken":"abc"}' });
  });
});

describe('checkTokenSetForStorage — 包んだ後の長さの境目 (ちょうど上限は通り、1 字超えたら断る)', () => {
  // 包みの字数は JSON.stringify から実測する (`{"accessToken":""}` = 18 字)。
  const overhead = countChars(JSON.stringify({ accessToken: '' }));

  it('★ 包んだ後がちょうど上限なら通る', () => {
    const tokens = { accessToken: 'x'.repeat(MAX_TOKEN_INPUT_CHARS - overhead) };
    const r = checkTokenSetForStorage(tokens);
    expect(r.ok).toBe(true);
    expect(r.ok && countChars(r.serialized)).toBe(MAX_TOKEN_INPUT_CHARS);
  });

  it('★ 包んだ後が 1 字超えたら、長さと上限を名乗って断る', () => {
    const tokens = { accessToken: 'x'.repeat(MAX_TOKEN_INPUT_CHARS - overhead + 1) };
    expect(checkTokenSetForStorage(tokens)).toEqual({
      ok: false,
      reason: 'too-long',
      message: `認可サーバの応答が長すぎます (${MAX_TOKEN_INPUT_CHARS + 1} 文字 / 上限 ${MAX_TOKEN_INPUT_CHARS} 文字)`,
    });
  });
});
