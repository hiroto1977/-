import { describe, expect, it, vi } from 'vitest';
import { fetchGithubSnapshot } from '../github';
import { FetchError } from '../types';

const userResponse = {
  login: 'octocat',
  name: 'Octo Cat',
  company: '@github',
  avatar_url: 'https://avatars.example/u',
  html_url: 'https://github.com/octocat',
  public_repos: 42,
  followers: 1000,
};

const searchResponse = {
  items: [
    {
      number: 7,
      title: 'Fix the thing',
      state: 'open',
      draft: false,
      html_url: 'https://github.com/o/r/pull/7',
      updated_at: '2026-05-10T00:00:00Z',
      head: { ref: 'feat/x' },
      base: { ref: 'main' },
    },
  ],
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
    statusText: ok ? 'OK' : 'Error',
  });
}

describe('fetchGithubSnapshot', () => {
  it('normalizes the user and pull request payloads', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse(searchResponse));

    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });

    expect(snapshot.user.login).toBe('octocat');
    expect(snapshot.user.name).toBe('Octo Cat');
    expect(snapshot.user.publicRepos).toBe(42);
    expect(snapshot.pullRequests).toHaveLength(1);
    expect(snapshot.pullRequests[0]).toMatchObject({
      number: 7,
      head: 'feat/x',
      base: 'main',
      htmlUrl: 'https://github.com/o/r/pull/7',
    });
  });

  it('sends Authorization and API headers', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ...userResponse }))
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    await fetchGithubSnapshot({ token: 'secret-token', fetch: fetchMock });

    const firstCall = fetchMock.mock.calls[0];
    const init = firstCall[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-token');
    expect(headers.Accept).toBe('application/vnd.github+json');
  });

  it('throws FetchError on HTTP failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Bad credentials', { status: 401, statusText: 'Unauthorized' }),
      );

    await expect(
      fetchGithubSnapshot({ token: 'bad', fetch: fetchMock }),
    ).rejects.toBeInstanceOf(FetchError);
  });

  it('falls back gracefully when name/company are null', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ...userResponse, name: null, company: null }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });

    expect(snapshot.user.name).toBe('octocat');
    expect(snapshot.user.company).toBe('');
  });
});
