import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
import { displayDateOf } from '../../shared/isoDate';
import { objectRows } from '../../shared/apiResponse';
import { DRIVE_CREATE_FOLDER_PATH, GOOGLE_DRIVE_API, checkDriveFolder, driveFolderInit, parseCreatedDriveFolder } from '../../shared/api/google';
import type { ActionData } from '../../shared/actionData';

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
  /** 更新日 (`YYYY-MM-DD`・利用者の時計)。**読めなければ `null`** (パス 410)。 */
    modifiedTime: string | null;
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
    files: objectRows<DriveFile>(data.files).map((f) => ({
      id: f.id,
      title: f.name,
      mimeType: f.mimeType,
      // **日付として読めるかで決める** (2026-09-22 · パス 410)。パス 409 は投げない
      // ようにしただけで `slice(0, 10)` を据え置いていた —— 読み手は 1 つ
      // (`displayDateOf`) で、読めなければ `null` を返して画面が理由を言う。
      modifiedTime: displayDateOf(f.modifiedTime),
      viewUrl: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
    })),
  };
}

// --- write-side actions --------------------------------------------------

/**
 * `create-folder` の payload の宣言 (§3.2 の表がこの名前で照合する)。欄の判定は
 * shared の `checkDriveFolder` (`DriveFolderFields` = 欄が unknown の受け口) が行う。
 */
export interface CreateFolderPayload {
  name: string;
  parentId?: string; // omitted → "My Drive" root
}

async function createFolder(
  ctx: ActionContext,
): Promise<ActionData<'drive/create-folder'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/google.ts の 1 つ (ブラウザ版も同じ関数 · 2026-09-18)。
  const folder = checkDriveFolder(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${GOOGLE_DRIVE_API}${DRIVE_CREATE_FOLDER_PATH}`,
    driveFolderInit(folder, ctx.token),
    { fetch: ctx.fetch, serviceId: 'drive' },
  );
  return parseCreatedDriveFolder(res);
}

export const ACTIONS: ActionMap = {
  'create-folder': createFolder,
};
