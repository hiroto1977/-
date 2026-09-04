import { describe, expect, it, vi } from 'vitest';
import { fetchDriveSnapshot, ACTIONS } from '../drive';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchDriveSnapshot', () => {
  it('normalizes Drive file responses', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        files: [
          {
            id: 'f1',
            name: 'Plan.docx',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-05-10T12:34:56Z',
            webViewLink: 'https://docs.google.com/document/d/f1',
          },
        ],
      }),
    );

    const snap = await fetchDriveSnapshot({ token: 'ya29.x', fetch: fetchMock });

    expect(snap.files[0]).toMatchObject({
      id: 'f1',
      title: 'Plan.docx',
      modifiedTime: '2026-05-10',
      viewUrl: 'https://docs.google.com/document/d/f1',
    });
  });

  it('synthesizes a viewUrl when webViewLink is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        files: [
          {
            id: 'f2',
            name: 'image.png',
            mimeType: 'image/png',
            modifiedTime: '2026-04-01T00:00:00Z',
          },
        ],
      }),
    );
    const snap = await fetchDriveSnapshot({ token: 'x', fetch: fetchMock });
    expect(snap.files[0]!.viewUrl).toBe('https://drive.google.com/file/d/f2/view');
  });
});

describe('ACTIONS["create-folder"]', () => {
  it('POSTs files.create with folder mimeType + parents', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: 'f1',
        name: 'Reports',
        webViewLink: 'https://drive.google.com/drive/folders/f1',
      }),
    );

    const result = (await ACTIONS['create-folder']!({
      token: 'ya29.x',
      fetch: fetchMock,
      payload: { name: 'Reports', parentId: 'parent-id' },
    })) as { id: string; name: string; url: string };

    expect(result).toEqual({
      id: 'f1',
      name: 'Reports',
      url: 'https://drive.google.com/drive/folders/f1',
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe('Reports');
    expect(body.mimeType).toBe('application/vnd.google-apps.folder');
    expect(body.parents).toEqual(['parent-id']);
  });

  it('omits parents when no parentId is given (defaults to My Drive root)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'f2', name: 'x' }),
    );
    await ACTIONS['create-folder']!({
      token: 't',
      fetch: fetchMock,
      payload: { name: 'x' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.parents).toBeUndefined();
  });

  it('synthesizes a folder URL when the response omits webViewLink', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'f3', name: 'NoLink' }),
    );
    const result = (await ACTIONS['create-folder']!({
      token: 't',
      fetch: fetchMock,
      payload: { name: 'NoLink' },
    })) as { url: string };
    expect(result.url).toBe('https://drive.google.com/drive/folders/f3');
  });

  it('rejects when name is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-folder']!({ token: 't', fetch: fetchMock, payload: {} }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// --- 送り先と資格情報 --------------------------------------------------
//
// Google の OAuth アクセストークンを持ち歩く経路なので、「どこへ」
// 「どうやって」載せるかが変わったら落ちるようにしておく。

function headersOf(call: Parameters<typeof fetch>): Record<string, string> {
  return (call[1]?.headers ?? {}) as Record<string, string>;
}

describe('fetchDriveSnapshot — 送り先と問い合わせの中身', () => {
  async function callWith(token = 'ya29.secret') {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ files: [] }));
    await fetchDriveSnapshot({ token, fetch: fetchMock });
    return fetchMock;
  }

  it('Google Drive の files を叩き、トークンは Authorization だけに載る', async () => {
    const fetchMock = await callWith();
    const call = fetchMock.mock.calls[0]!;
    const url = new URL(String(call[0]));
    expect(url.origin).toBe('https://www.googleapis.com');
    expect(url.pathname).toBe('/drive/v3/files');
    expect(headersOf(call).Authorization).toBe('Bearer ya29.secret');
    // クエリに載せるとサーバのアクセスログに残る。
    expect(String(call[0])).not.toContain('ya29.secret');
  });

  it('「更新の新しい順に 10 件」で問い合わせる', async () => {
    const fetchMock = await callWith();
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    // orderBy が落ちると Drive の既定 (作成順に近い) になり、
    // 「最近さわったファイル」という画面の意味が変わる。
    expect(url.searchParams.get('orderBy')).toBe('modifiedTime desc');
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('必要な項目だけ取り寄せる', async () => {
    const fetchMock = await callWith();
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    // fields を落とすと Drive は全メタデータを返す。要らないものまで
    // 受け取らないための指定なので、消えたら落ちるようにしておく。
    expect(url.searchParams.get('fields')).toBe(
      'files(id,name,mimeType,modifiedTime,webViewLink)',
    );
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('token expired', { status: 401 }));
    await expect(fetchDriveSnapshot({ token: 't', fetch: fetchMock })).rejects.toMatchObject({
      serviceId: 'drive',
      status: 401,
    });
  });

  it('files ごと無い応答でも空配列を返して落ちない', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}));
    const snap = await fetchDriveSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.files).toEqual([]);
  });
});

describe('ACTIONS["create-folder"] — 送り方', () => {
  it('files.create へ POST し、トークンは Authorization だけに載る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'd1', name: '資料', webViewLink: 'https://x' }));

    await ACTIONS['create-folder']!({
      token: 'ya29.secret',
      fetch: fetchMock,
      payload: { name: '資料' },
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://www.googleapis.com');
    expect(parsed.pathname).toBe('/drive/v3/files');
    // 作った直後に画面へ出すのに要る 3 項目。
    expect(parsed.searchParams.get('fields')).toBe('id,name,webViewLink');
    expect(url).not.toContain('ya29.secret');

    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ya29.secret');
    // JSON だと名乗らないと Drive はボディを読まない。
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    await expect(
      ACTIONS['create-folder']!({ token: 't', fetch: fetchMock, payload: { name: 'x' } }),
    ).rejects.toMatchObject({ serviceId: 'drive', status: 403 });
  });

  it('名前が無ければ送らない（理由も添える）', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-folder']!({ token: 't', fetch: fetchMock, payload: {} }),
    ).rejects.toThrow('name is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
