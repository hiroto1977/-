import { describe, expect, it, vi } from 'vitest';
import { fetchGithubSnapshot, ACTIONS } from '../github';
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

const searchItem = {
  number: 7,
  title: 'Fix the thing',
  state: 'open',
  draft: false,
  html_url: 'https://github.com/o/r/pull/7',
  updated_at: '2026-05-10T00:00:00Z',
  pull_request: { url: 'https://api.github.com/repos/o/r/pulls/7' },
};

const prDetail = {
  number: 7,
  title: 'Fix the thing',
  state: 'open',
  draft: false,
  html_url: 'https://github.com/o/r/pull/7',
  updated_at: '2026-05-10T00:00:00Z',
  head: { ref: 'feat/x' },
  base: { ref: 'main' },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
    statusText: ok ? 'OK' : 'Error',
  });
}

describe('fetchGithubSnapshot', () => {
  it('fetches /user + /search/issues + per-PR details and merges them', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      // 1: /user, 2: /search/issues — run in Promise.all so order is fixed
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem] }))
      // 3: per-PR detail
      .mockResolvedValueOnce(jsonResponse(prDetail));

    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });

    expect(snapshot.user.login).toBe('octocat');
    expect(snapshot.user.publicRepos).toBe(42);
    expect(snapshot.pullRequests).toHaveLength(1);
    expect(snapshot.pullRequests[0]).toMatchObject({
      number: 7,
      head: 'feat/x', // populated from the PR detail, not the search response
      base: 'main',
      htmlUrl: 'https://github.com/o/r/pull/7',
    });
  });

  it('safely defaults head/base to "" when the PR detail omits them (kills `pr.head?.ref` → `pr.head.ref`)', async () => {
    // A PR detail response missing the `head` or `base` field would
    // make `pr.head.ref` throw under the mutation. Original code uses
    // optional chaining + ?? '' to default safely.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem] }))
      .mockResolvedValueOnce(
        jsonResponse({
          number: 7,
          title: 'No head/base in detail',
          state: 'open',
          draft: false,
          updated_at: '2026-05-12T00:00:00Z',
          html_url: 'https://github.com/o/r/pull/7',
          // head: missing
          // base: missing
        }),
      );
    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snapshot.pullRequests[0]!.head).toBe('');
    expect(snapshot.pullRequests[0]!.base).toBe('');
  });

  it('falls back to search-only fields when a per-PR detail fetch fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem] }))
      // PR detail 404s (private repo, etc.) — must not abort the snapshot
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });

    expect(snapshot.pullRequests).toHaveLength(1);
    expect(snapshot.pullRequests[0]).toMatchObject({
      number: 7,
      title: 'Fix the thing',
      head: '',
      base: '',
    });
  });

  it('skips the per-PR fetch entirely when pull_request.url is missing', async () => {
    // /search/issues sometimes returns issues that look like PRs but
    // lack pull_request.url (e.g. cross-repo bots). We must not blow up
    // dereferencing undefined, just fall back to the search fields.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              number: 9,
              title: 'No pull_request url',
              state: 'open',
              draft: false,
              html_url: 'https://github.com/o/r/issues/9',
              updated_at: '2026-05-10T00:00:00Z',
              // pull_request: missing
            },
          ],
        }),
      );

    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });
    // Only 2 fetch calls total: /user and /search/issues. NO per-PR call.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.pullRequests[0]).toMatchObject({
      number: 9,
      title: 'No pull_request url',
      head: '',
      base: '',
    });
  });

  it('coerces null head/base on the PR detail to empty strings', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem] }))
      .mockResolvedValueOnce(
        jsonResponse({ ...prDetail, head: null, base: null }),
      );

    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snapshot.pullRequests[0]!.head).toBe('');
    expect(snapshot.pullRequests[0]!.base).toBe('');
  });

  // --- security: pin PR detail fetches to api.github.com
  it('falls back when pull_request.url points off-host (defense against tampered search response)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { ...searchItem, pull_request: { url: 'https://evil.example.com/repos/o/r/pulls/7' } },
          ],
        }),
      );
    // No third mock — if the guard works, we never make a third call.
    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.pullRequests[0]).toMatchObject({ number: 7, head: '', base: '' });
  });

  it('falls back when pull_request.url uses http:// instead of https://', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { ...searchItem, pull_request: { url: 'http://api.github.com/repos/o/r/pulls/7' } },
          ],
        }),
      );
    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.pullRequests[0]!.head).toBe('');
  });

  it('falls back when pull_request.url is not a parseable URL at all', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ ...searchItem, pull_request: { url: 'not a url' } }],
        }),
      );
    const snapshot = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.pullRequests[0]!.number).toBe(7);
  });

  it('coerces missing draft field on the search result to false (kills `?? false` mutation)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              number: 11,
              title: 'No draft field',
              state: 'open',
              // draft: missing
              html_url: 'https://github.com/o/r/pull/11',
              updated_at: '2026-05-10T00:00:00Z',
              pull_request: undefined,
            },
          ],
        }),
      );
    const snap = await fetchGithubSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.pullRequests[0]!.draft).toBe(false);
  });

  it('sends Authorization and API headers', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    await fetchGithubSnapshot({ token: 'secret-token', fetch: fetchMock });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-token');
    expect(headers.Accept).toBe('application/vnd.github+json');
  });

  it('throws FetchError on HTTP 401 (top-level)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Bad credentials', { status: 401, statusText: 'Unauthorized' }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] })); // /search/issues still mocked due to Promise.all

    const err = await fetchGithubSnapshot({ token: 'bad', fetch: fetchMock }).catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).status).toBe(401);
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

describe('ACTIONS["create-issue"]', () => {
  it('POSTs to /repos/{owner}/{repo}/issues and returns the new issue', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          number: 42,
          html_url: 'https://github.com/o/r/issues/42',
          title: 'Hello',
          state: 'open',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = (await ACTIONS['create-issue']!({
      token: 'tok',
      fetch: fetchMock,
      payload: { owner: 'o', repo: 'r', title: 'Hello', body: 'body text' },
    })) as { number: number; url: string; title: string };

    expect(result).toEqual({ number: 42, url: 'https://github.com/o/r/issues/42', title: 'Hello' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).body).toBe(
      JSON.stringify({ title: 'Hello', body: 'body text', labels: undefined }),
    );
  });

  it('rejects when required fields are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-issue']!({
        token: 'tok',
        fetch: fetchMock,
        payload: { owner: 'o', repo: 'r' /* no title */ },
      }),
    ).rejects.toThrow(/title/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Individual missing-field tests kill the LogicalOperator `||` → `&&` mutation
  it('rejects when only owner is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-issue']!({
        token: 'tok',
        fetch: fetchMock,
        payload: { repo: 'r', title: 't' },
      }),
    ).rejects.toThrow(/owner/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when only repo is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-issue']!({
        token: 'tok',
        fetch: fetchMock,
        payload: { owner: 'o', title: 't' },
      }),
    ).rejects.toThrow(/repo/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces serviceId="github" in the FetchError on HTTP failure', async () => {
    // Kills StringLiteral mutant on github.ts:176 (serviceId arg).
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('Validation Failed', { status: 422 }),
    );
    const err = await ACTIONS['create-issue']!({
      token: 'tok',
      fetch: fetchMock,
      payload: { owner: 'o', repo: 'r', title: 't' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('github');
    // jsonFetch builds message as `${serviceId} ${status}: ...`; assert
    // the prefix so an empty serviceId would shift the leading token.
    expect((err as FetchError).message).toMatch(/^github 422:/);
  });

  it('url-encodes owner/repo to prevent path injection', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ number: 1, html_url: '', title: 'x', state: 'open' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await ACTIONS['create-issue']!({
      token: 'tok',
      fetch: fetchMock,
      payload: { owner: 'o/x', repo: 'r y', title: 't' },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.github.com/repos/o%2Fx/r%20y/issues');
  });
});
