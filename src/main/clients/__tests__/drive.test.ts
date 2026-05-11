import { describe, expect, it, vi } from 'vitest';
import { fetchDriveSnapshot } from '../drive';

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
