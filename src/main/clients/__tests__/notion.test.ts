import { describe, expect, it, vi } from 'vitest';
import { fetchNotionSnapshot, ACTIONS } from '../notion';

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

describe('fetchNotionSnapshot edge cases', () => {
  it('handles a results array that is missing entirely', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({} /* no results */));
    const snap = await fetchNotionSnapshot({ token: 'secret_x', fetch: fetchMock });
    expect(snap.pages).toEqual([]);
  });

  it('falls back to "(無題)" when a page has properties but no title property', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 'p1',
            object: 'page',
            url: 'https://notion.so/p1',
            last_edited_time: '2026-05-10T00:00:00Z',
            properties: {
              Status: { type: 'select', select: { name: 'Done' } }, // not a title
            },
          },
        ],
      }),
    );
    const snap = await fetchNotionSnapshot({ token: 'secret_x', fetch: fetchMock });
    expect(snap.pages[0].title).toBe('(無題)');
  });

  it('falls back to "(無題)" when title is the right type but the array is empty', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 'p2',
            object: 'page',
            url: 'https://notion.so/p2',
            last_edited_time: '2026-05-10T00:00:00Z',
            properties: { Name: { type: 'title', title: [] } },
          },
        ],
      }),
    );
    const snap = await fetchNotionSnapshot({ token: 'secret_x', fetch: fetchMock });
    expect(snap.pages[0].title).toBe('(無題)');
  });
});

describe('ACTIONS["create-page"]', () => {
  it('POSTs to /v1/pages with parent + title + body block', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'p1', url: 'https://notion.so/p1' }),
    );

    const result = (await ACTIONS['create-page']({
      token: 'secret_x',
      fetch: fetchMock,
      payload: { parentPageId: 'parent-id', title: 'New', body: 'hello world' },
    })) as { id: string; url: string };

    expect(result).toEqual({ id: 'p1', url: 'https://notion.so/p1' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.parent).toEqual({ page_id: 'parent-id' });
    expect(body.properties.title.title[0].text.content).toBe('New');
    expect(body.children).toHaveLength(1);
    expect(body.children[0].paragraph.rich_text[0].text.content).toBe('hello world');
  });

  it('omits the body block when no body is provided', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'p2', url: 'https://notion.so/p2' }),
    );
    await ACTIONS['create-page']({
      token: 't',
      fetch: fetchMock,
      payload: { parentPageId: 'p', title: 'No body' },
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).children).toEqual([]);
  });

  it('rejects with missing parentPageId/title before any network call', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-page']({ token: 't', fetch: fetchMock, payload: { parentPageId: 'p' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
