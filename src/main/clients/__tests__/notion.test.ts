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

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret_x');
    // `toBeDefined()` は空文字でも通ってしまう。Notion は版を名乗らないと
    // 400 を返すので、値そのものを固定する。
    expect(headers['Notion-Version']).toBe('2022-06-28');
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
    expect(snap.pages[0]!.title).toBe('(無題)');
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
    expect(snap.pages[0]!.title).toBe('(無題)');
  });
});

describe('ACTIONS["create-page"]', () => {
  it('POSTs to /v1/pages with parent + title + body block', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'p1', url: 'https://notion.so/p1' }),
    );

    const result = (await ACTIONS['create-page']!({
      token: 'secret_x',
      fetch: fetchMock,
      payload: { parentPageId: 'parent-id', title: 'New', body: 'hello world' },
    })) as { id: string; url: string };

    expect(result).toEqual({ id: 'p1', url: 'https://notion.so/p1' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
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
    await ACTIONS['create-page']!({
      token: 't',
      fetch: fetchMock,
      payload: { parentPageId: 'p', title: 'No body' },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).children).toEqual([]);
  });

  it('rejects with missing parentPageId/title before any network call', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-page']!({ token: 't', fetch: fetchMock, payload: { parentPageId: 'p' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// --- 見出しの取り出し --------------------------------------------------
//
// Notion のページ属性は名前が自由なので、「type が title のもの」を探す。
// 探し方が崩れると、別の属性の中身を見出しとして出したり落ちたりする。

async function titleOf(properties: unknown): Promise<string> {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
    jsonResponse({
      results: [
        {
          id: 'p1',
          url: 'https://notion.so/p1',
          last_edited_time: '2026-05-01T00:00:00.000Z',
          object: 'page',
          properties,
        },
      ],
    }),
  );
  const snap = await fetchNotionSnapshot({ token: 't', fetch: fetchMock });
  return snap.pages[0]!.title;
}

describe('extractTitle — 探し方', () => {
  it('type が title でない属性の中身は見出しにしない', async () => {
    // `title` という名前の配列を持つだけの属性に引っ張られない。
    expect(
      await titleOf({ Notes: { type: 'rich_text', title: [{ plain_text: '別の属性' }] } }),
    ).toBe('(無題)');
  });

  it('type が title でも中身が配列でなければ落ちない', async () => {
    expect(await titleOf({ Name: { type: 'title', title: 'not-an-array' } })).toBe('(無題)');
  });

  it('属性の値が null でも落ちない', async () => {
    expect(await titleOf({ Broken: null, Name: { type: 'title', title: [{ plain_text: 'OK' }] } })).toBe(
      'OK',
    );
  });

  it('title でない属性が先に並んでいても飛ばして探す', async () => {
    expect(
      await titleOf({
        Status: { type: 'select', select: { name: 'Done' } },
        Name: { type: 'title', title: [{ plain_text: '議事録' }] },
      }),
    ).toBe('議事録');
  });

  it('plain_text の無い要素は空として繋ぐ', async () => {
    expect(
      await titleOf({ Name: { type: 'title', title: [{ plain_text: 'A' }, {}, { plain_text: 'B' }] } }),
    ).toBe('AB');
  });

  it('前後の空白は落とす', async () => {
    expect(await titleOf({ Name: { type: 'title', title: [{ plain_text: '  余白付き  ' }] } })).toBe(
      '余白付き',
    );
  });

  it('空白だけの見出しは「(無題)」にする', async () => {
    expect(await titleOf({ Name: { type: 'title', title: [{ plain_text: '   ' }] } })).toBe('(無題)');
  });
});

// --- 送り先と問い合わせの中身 ------------------------------------------

describe('fetchNotionSnapshot — 送り先と並び順', () => {
  it('Notion の search を叩き、トークンは Authorization だけに載る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ results: [] }));
    await fetchNotionSnapshot({ token: 'secret_abc', fetch: fetchMock });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/search');
    expect(url).not.toContain('secret_abc');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('「最後に編集した順に新しいものから 10 件」で問い合わせる', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ results: [] }));
    await fetchNotionSnapshot({ token: 't', fetch: fetchMock });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.page_size).toBe(10);
    // sort が落ちると Notion は関連度順で返す。画面の「最近のページ」と
    // いう意味が変わるのに、ページは並んでいるので気付けない。
    expect(body.sort).toEqual({ direction: 'descending', timestamp: 'last_edited_time' });
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    await expect(fetchNotionSnapshot({ token: 't', fetch: fetchMock })).rejects.toMatchObject({
      serviceId: 'notion',
      status: 401,
    });
  });

  it('teams は常に空（この API からは取れない）', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ results: [] }));
    const snap = await fetchNotionSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.teams).toEqual([]);
  });

  it('0 件のときは「共有されていない」と伝え、あるときは件数を出す', async () => {
    const empty = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ results: [] }));
    expect((await fetchNotionSnapshot({ token: 't', fetch: empty })).note).toBe(
      'インテグレーションに共有されたページなし',
    );

    const two = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        results: [
          { id: 'a', url: 'u', last_edited_time: 'x', object: 'page' },
          { id: 'b', url: 'u', last_edited_time: 'x', object: 'database' },
        ],
      }),
    );
    expect((await fetchNotionSnapshot({ token: 't', fetch: two })).note).toBe('2 件取得');
  });
});

describe('ACTIONS["create-page"] — 送り方', () => {
  it('/v1/pages へ POST し、版とトークンを名乗る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'n1', url: 'https://notion.so/n1' }));

    await ACTIONS['create-page']!({
      token: 'secret_abc',
      fetch: fetchMock,
      payload: { parentPageId: 'parent', title: 'T', body: '本文' },
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(url).not.toContain('secret_abc');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret_abc');
    expect(headers['Notion-Version']).toBe('2022-06-28');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('本文は Notion の段落ブロックの形で送る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'n2', url: 'https://notion.so/n2' }));
    await ACTIONS['create-page']!({
      token: 't',
      fetch: fetchMock,
      payload: { parentPageId: 'parent', title: 'T', body: '本文' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    // 形が崩れると Notion は 400 を返す。画面には「作れなかった」としか出ない。
    expect(body.children).toEqual([
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: '本文' } }] },
      },
    ]);
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    await expect(
      ACTIONS['create-page']!({
        token: 't',
        fetch: fetchMock,
        payload: { parentPageId: 'p', title: 'T' },
      }),
    ).rejects.toMatchObject({ serviceId: 'notion', status: 403 });
  });

  it('parentPageId / title が欠けていれば理由を添えて断る', async () => {
    for (const payload of [{ title: 'T' }, { parentPageId: 'p' }, {}]) {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        ACTIONS['create-page']!({ token: 't', fetch: fetchMock, payload }),
      ).rejects.toThrow('parentPageId and title are required');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});
