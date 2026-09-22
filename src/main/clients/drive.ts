import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
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
    files: objectRows<DriveFile>(data.files).map((f) => ({
      id: f.id,
      title: f.name,
      mimeType: f.mimeType,
      /*
       * **非文字列の `modifiedTime` で投げない** (2026-09-22 · パス 409)。
       * 実測 (直す前): 欄が無い / 数だと `.slice` が無く TypeError になり、
       * **Drive 画面が丸ごと使えなくなった** (10 件のうち 1 件で全部)。
       *
       * ★ **読める値の答えは変えていない** —— ここはまだ `slice(0, 10)` で、
       *   パス 408 が Ollama について閉じた「日付として読めるかで決める」側
       *   (`parseTimestamp` → `localIsoDate`・読めなければ `null` + 画面が理由を言う)
       *   には**まだ寄せていない**。母集団は `docs/REMAINING_WORK.md` に在る。
       */
      modifiedTime: typeof f.modifiedTime === 'string' ? f.modifiedTime.slice(0, 10) : '',
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
