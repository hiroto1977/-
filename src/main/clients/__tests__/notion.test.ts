import { describe, expect, it, vi } from 'vitest';
import { fetchNotionSnapshot } from '../notion';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchNotionSnapshot', () => {
  it('extracts page titles from properties and normalizes results', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 'p1',
            object: 'page',
            url: 'https://notion.so/p1',
            last_edited_time: '2026-05-10T00:00:00Z',
            properties: {
              Name: {
                type: 'title',
                title: [{ plain_text: 'Hello ' }, { plain_text: 'World' }],
              },
            },
          },
          {
            id: 'p2',
            object: 'database',
            url: 'https://notion.so/p2',
            last_edited_time: '2026-05-09T00:00:00Z',
            properties: {},
          },
        ],
      }),
    );

    const snap = await fetchNotionSnapshot({ token: 'secret_x', fetch: fetchMock });

    expect(snap.pages).toHaveLength(2);
    expect(snap.pages[0]).toMatchObject({ id: 'p1', title: 'Hello World', kind: 'page' });
    expect(snap.pages[1]).toMatchObject({ id: 'p2', title: '(無題)', kind: 'database' });
    expect(snap.note).toContain('2 件');
  });

  it('sends Bearer + Notion-Version headers and POST body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ results: [] }));
    await fetchNotionSnapshot({ token: 'secret_x', fetch: fetchMock });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret_x');
    expect(headers['Notion-Version']).toBeDefined();
    expect((init as RequestInit).method).toBe('POST');
  });
});
