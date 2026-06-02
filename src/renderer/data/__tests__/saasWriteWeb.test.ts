import { describe, expect, it, vi } from 'vitest';
import { createGithubIssue, createNotionPage, sendSlackMessage } from '../saasWriteWeb';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('createGithubIssue', () => {
  it('POSTs to the issues endpoint with bearer auth and returns the mapped result', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 7, html_url: 'https://github.com/o/r/issues/7', title: 'Bug' }),
    );
    const res = await createGithubIssue({ owner: 'o', repo: 'r', title: 'Bug', body: 'desc' }, 'ghp_x', fetchFn);
    expect(res).toEqual({ number: 7, url: 'https://github.com/o/r/issues/7', title: 'Bug' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer ghp_x');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toMatchObject({ title: 'Bug', body: 'desc' });
  });

  it('trims inputs and url-encodes owner/repo', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 1, html_url: 'u', title: 't' }),
    );
    await createGithubIssue({ owner: ' a/b ', repo: ' c ', title: ' t ' }, 'tok', fetchFn);
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.github.com/repos/a%2Fb/c/issues');
  });

  it('rejects missing required fields without calling fetch', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(createGithubIssue({ owner: 'o', repo: 'r' }, 'tok', fetchFn)).rejects.toThrow(/必須/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('surfaces API errors with status and body excerpt', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(422, { message: 'Validation Failed' }));
    await expect(
      createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn),
    ).rejects.toThrow(/GitHub API 422/);
  });

  it('filters non-string labels', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 1, html_url: 'u', title: 't' }),
    );
    await createGithubIssue({ owner: 'o', repo: 'r', title: 't', labels: ['bug', 3, 'ui'] }, 'tok', fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[0]![1]!.body as string).labels).toEqual(['bug', 'ui']);
  });
});

describe('createNotionPage', () => {
  it('POSTs to the pages endpoint via the transport and maps the result', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p1', url: 'https://notion.so/p1' }));
    const res = await createNotionPage({ parentPageId: 'par', title: 'T', body: 'hi' }, 'secret', transport);
    expect(res).toEqual({ id: 'p1', url: 'https://notion.so/p1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    const sent = JSON.parse(init.body as string);
    expect(sent.parent).toEqual({ page_id: 'par' });
    expect(sent.children).toHaveLength(1);
  });
  it('omits children when no body', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p', url: 'u' }));
    await createNotionPage({ parentPageId: 'par', title: 'T' }, 'tok', transport);
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).children).toEqual([]);
  });
  it('requires parentPageId and title', async () => {
    const transport = vi.fn();
    await expect(createNotionPage({ title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'unauthorized' }));
    await expect(createNotionPage({ parentPageId: 'p', title: 'T' }, 'tok', transport)).rejects.toThrow(/Notion API 401/);
  });
});

describe('sendSlackMessage', () => {
  it('POSTs to chat.postMessage and returns ts/channel', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, ts: '1.2', channel: 'C1' }));
    const res = await sendSlackMessage({ channel: '#general', text: 'hello' }, 'xoxb', transport);
    expect(res).toEqual({ ts: '1.2', channel: 'C1' });
    expect(transport.mock.calls[0]![0]).toBe('https://slack.com/api/chat.postMessage');
  });
  it('throws when Slack returns ok:false even on HTTP 200', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: false, error: 'channel_not_found' }));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow(/channel_not_found/);
  });
  it('requires channel and text', async () => {
    const transport = vi.fn();
    await expect(sendSlackMessage({ channel: 'C' }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
});
