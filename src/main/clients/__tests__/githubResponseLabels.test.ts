/**
 * GitHub の取得で「どの相手の、どの欄が足りないか」を言う文面と、書き込みの要求に載る身元
 * (2026-09-30 · パス 502)。
 *
 * 変異検査の全掃引が `github.ts` に 9 件の生存を残していた。`malformedResponseCensus.test.ts` は
 * 欄が欠けたとき**投げること**と欄の名が文に入ることまでを見るが、
 *
 *   - 文の頭の**相手の名** (`GitHub API`) は見ていない —— 画面はこの文をそのまま出すので、
 *     名前が空になると「 の応答に login (…) がありません」と**誰の応答か分からない**文になる。
 *   - 名前 (`name`) が在るときにそれを使うこと —— 無いときに `login` で埋めることしか見ていなかった
 *     (欄名を空にする変異体は「いつも login で埋める」になり、在る名前が消えても気付かない)。
 *   - `create-issue` の要求に載る `User-Agent` —— GitHub は UA の無い要求を断る。
 *
 * 文面は**値ごと** (`toThrow(new Error(…))`) で留める。`toThrow('文面')` は投げた値が偽だと照合そのものを
 * 飛ばして合格する (Vitest / chai の実測・CLAUDE.md の規約)。
 */
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, fetchGithubSnapshot } from '../github';

const user = {
  login: 'octocat',
  name: 'Octo Cat',
  company: '@github',
  avatar_url: 'https://avatars.example/u',
  html_url: 'https://github.com/octocat',
  public_repos: 42,
  followers: 1000,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** /user を撃ち分けた fetch (検索は空)。 */
function withUser(body: unknown): typeof fetch {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json(body))
    .mockResolvedValueOnce(json({ items: [] }));
}

describe('GitHub の取得 — 足りない欄の文面は「GitHub API」と名乗る', () => {
  const missingString = (field: string) => `GitHub API の応答に ${field} (非空の文字列) がありません (処理したことを確認できません)`;
  const missingNumber = (field: string) => `GitHub API の応答に ${field} (有限の数値) がありません (処理したことを確認できません)`;

  it.each(['login', 'avatar_url', 'html_url'])('%s が無ければ、相手と欄の名を言って断る', async (field) => {
    const body: Record<string, unknown> = { ...user };
    delete body[field];
    await expect(fetchGithubSnapshot({ token: 't', fetch: withUser(body) })).rejects.toThrow(new Error(missingString(field)));
  });

  it.each(['public_repos', 'followers'])('%s が数でなければ、相手と欄の名を言って断る', async (field) => {
    await expect(fetchGithubSnapshot({ token: 't', fetch: withUser({ ...user, [field]: '12' }) })).rejects.toThrow(
      new Error(missingNumber(field)),
    );
  });

  it('★ 複数の欄が欠けていれば、先に読む欄 (login) から断る', async () => {
    await expect(fetchGithubSnapshot({ token: 't', fetch: withUser({}) })).rejects.toThrow(new Error(missingString('login')));
  });
});

describe('GitHub の取得 — 利用者の名前', () => {
  it('★ 名前が在れば login ではなく名前を出す (無いときだけ login で埋める)', async () => {
    const snap = await fetchGithubSnapshot({ token: 't', fetch: withUser(user) });
    expect(snap.user.login).toBe('octocat');
    expect(snap.user.name).toBe('Octo Cat');
  });

  it('名前が文字列でない (数) ときも login で埋める', async () => {
    const snap = await fetchGithubSnapshot({ token: 't', fetch: withUser({ ...user, name: 42 }) });
    expect(snap.user.name).toBe('octocat');
  });
});

describe('GitHub の書き込み — 要求の身元', () => {
  it('★ create-issue の要求は User-Agent を載せる (GitHub は UA の無い要求を断る)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ number: 1, html_url: 'https://github.com/o/r/issues/1', title: 't', state: 'open' }, 201));
    await ACTIONS['create-issue']!({ token: 'tok', fetch: fetchMock, payload: { owner: 'o', repo: 'r', title: 't' } });
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('service-hub-desktop');
    // 読み (取得) の要求と同じ身元 —— 書き込みだけ別の名乗りにならない
    const read = withUser(user);
    await fetchGithubSnapshot({ token: 'tok', fetch: read });
    const readHeaders = ((read as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(readHeaders['User-Agent']).toBe(headers['User-Agent']);
  });
});
