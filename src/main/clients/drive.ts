import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';

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

// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator
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

// --- write-side actions --------------------------------------------------

interface CreateFolderPayload {
  name: string;
  parentId?: string; // omitted → "My Drive" root
}

interface DriveCreateFileResponse {
  id: string;
  name: string;
  webViewLink?: string;
}

async function createFolder(
  ctx: ActionContext,
): Promise<{ id: string; name: string; url: string }> {
  const { name, parentId } = ctx.payload as unknown as CreateFolderPayload;
  if (!name) throw new Error('name is required');

  const res = await jsonFetch<DriveCreateFileResponse>(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
    { fetch: ctx.fetch, serviceId: 'drive' },
  );

  return {
    id: res.id,
    name: res.name,
    url: res.webViewLink ?? `https://drive.google.com/drive/folders/${res.id}`,
  };
}

export const ACTIONS: ActionMap = {
  'create-folder': createFolder,
};
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator
