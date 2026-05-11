import { jsonFetch, type FetchContext } from './types';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

interface DriveListResponse {
  files: DriveFile[];
}

export interface DriveSnapshot {
  files: {
    id: string;
    title: string;
    mimeType: string;
    modifiedTime: string;
    viewUrl: string;
  }[];
}

export async function fetchDriveSnapshot(ctx: FetchContext): Promise<DriveSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'drive' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const url =
    'https://www.googleapis.com/drive/v3/files' +
    '?orderBy=modifiedTime%20desc' +
    '&pageSize=10' +
    '&fields=files(id,name,mimeType,modifiedTime,webViewLink)';

  const data = await jsonFetch<DriveListResponse>(url, { headers }, fetchCtx);

  return {
    files: (data.files ?? []).map((f) => ({
      id: f.id,
      title: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime.slice(0, 10),
      viewUrl: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
    })),
  };
}
