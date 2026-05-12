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
    expect(snap.files[0].viewUrl).toBe('https://drive.google.com/file/d/f2/view');
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

    const result = (await ACTIONS['create-folder']({
      token: 'ya29.x',
      fetch: fetchMock,
      payload: { name: 'Reports', parentId: 'parent-id' },
    })) as { id: string; name: string; url: string };

    expect(result).toEqual({
      id: 'f1',
      name: 'Reports',
      url: 'https://drive.google.com/drive/folders/f1',
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe('Reports');
    expect(body.mimeType).toBe('application/vnd.google-apps.folder');
    expect(body.parents).toEqual(['parent-id']);
  });

  it('omits parents when no parentId is given (defaults to My Drive root)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'f2', name: 'x' }),
    );
    await ACTIONS['create-folder']({
      token: 't',
      fetch: fetchMock,
      payload: { name: 'x' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parents).toBeUndefined();
  });

  it('synthesizes a folder URL when the response omits webViewLink', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'f3', name: 'NoLink' }),
    );
    const result = (await ACTIONS['create-folder']({
      token: 't',
      fetch: fetchMock,
      payload: { name: 'NoLink' },
    })) as { url: string };
    expect(result.url).toBe('https://drive.google.com/drive/folders/f3');
  });

  it('rejects when name is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-folder']({ token: 't', fetch: fetchMock, payload: {} }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
