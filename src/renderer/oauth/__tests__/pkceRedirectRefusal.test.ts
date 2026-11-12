/**
 * Google のトークン交換は、転送 (3xx) に追随しない (2026-09-30 · パス 502)。
 *
 * 変異検査の全掃引が `oauth/pkce.ts` の転送の拒否 4 件 (分岐そのもの・断りの文・行き先の解き方・相手の名)
 * を残していた —— `pkce.test.ts` は交換の成功・HTTP エラー・上限・形を見るが、**転送の応答を 1 度も
 * 返していない** (どの検査もその行を通らない = 未到達)。
 *
 * 交換の要求には `code` と `code_verifier` が載る。token 端点が動いた (あるいは経路の途中が握った) 応答の
 * `Location` へ追随すると、**認可コードと検証子が別の場所へ再送される**。送り先の関門は最初の 1 ホップにしか
 * 掛からないので、追随しない規則 (`httpLimits.ts`) が唯一の守りである。
 */
import { describe, expect, it, vi } from 'vitest';
import { exchangeGoogleCode } from '../pkce';

const baseArgs = {
  code: 'the-code',
  verifier: 'the-verifier',
  expectedState: 'st-xyz',
  receivedState: 'st-xyz',
  clientId: 'cid',
  redirectUri: 'http://x',
};

const redirect = (status: number, location: string): Response => new Response(null, { status, headers: { location } });
const refusal = (host: string) =>
  `token exchange が別の場所 (${host}) へ転送しようとしました —— 追随しません (送り先の関門は最初の 1 ホップにしか掛からないため)`;

describe('exchangeGoogleCode — token 端点の転送には追随しない (パス 502)', () => {
  it.each([301, 302, 303, 307, 308])('★ %s は行き先の host を言って断り、別の場所へ再送しない', async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(redirect(status, 'https://evil.example/collect'));
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(new Error(refusal('evil.example')));
    // 1 回だけ・送り先は token 端点そのもの (Location へは取りに行かない)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://oauth2.googleapis.com/token');
  });

  it('★ 相対の Location は、token 端点の URL から解いた行き先を言う (相手は oauth2.googleapis.com のまま)', async () => {
    // 行き先の解き方 (基準の URL) を誤ると、相対の Location は host を言えず別の文になる
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(redirect(307, '/oauth2/v2/token'));
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(new Error(refusal('oauth2.googleapis.com')));
  });

  it('★ 要求は redirect: manual で出す (転送を勝手に辿らせない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(redirect(302, 'https://evil.example/'));
    await exchangeGoogleCode(baseArgs, fetchMock).catch(() => undefined);
    expect(fetchMock.mock.calls[0]![1]?.redirect).toBe('manual');
  });

  it('対照: 転送でない失敗 (400) は従来どおり「token exchange <状態>」と本文を言う (転送の枝に入らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(new Error('token exchange 400: {"error":"invalid_grant"}'));
  });
});
