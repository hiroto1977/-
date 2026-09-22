import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { NotImplementedError, apiFetch, bearer, jsonBody, withQuery, type FetchFn } from './http';
import { displayField, requireChild, requireObject, requireString } from '../apiResponse';
import { CANVA_FOLDER_FIELDS, checkWriteFields, describeWriteFieldFailure } from '../writeFieldLimits';

/** 送り先は 1 つ。読み (下の class) も書き (フォルダの作成) も同じ定数を通る。 */
export const CANVA_API = 'https://api.canva.com/rest/v1';
const API = CANVA_API;

export interface CanvaDesign {
  readonly id: string;
  readonly title: string;
  readonly editUrl: string;
  readonly updatedAt: number;
}

export interface CanvaExportJob {
  readonly id: string;
  readonly status: string;
  readonly urls: readonly string[];
}

interface RawDesigns {
  items?: {
    id: string;
    title?: string;
    urls?: { edit_url?: string };
    updated_at?: number;
  }[];
}

interface RawExport {
  job?: { id: string; status: string; urls?: string[] };
}

export class CanvaClient implements ServiceClient {
  readonly id = 'canva';
  constructor(
    private readonly creds: ServiceCredentials = {},
    private readonly fetchFn?: FetchFn,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  private ctx(): { fetch?: FetchFn; serviceId: string } {
    return { fetch: this.fetchFn, serviceId: this.id };
  }

  async searchDesigns(query: string, limit = 20): Promise<CanvaDesign[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawDesigns>(
      withQuery(`${API}/designs`, {
        // 空文字を送ると「空文字に一致するもの」を探させることになるので落とす。
        query: query === '' ? undefined : query,
        ownership: 'any',
        sort_by: 'modified_descending',
        limit,
      }),
      { headers: bearer(String(this.creds.token)) },
      this.ctx(),
    );
    return (raw.items ?? []).map((d) => ({
      id: d.id,
      title: d.title ?? '',
      editUrl: d.urls?.edit_url ?? `https://www.canva.com/design/${d.id}`,
      updatedAt: d.updated_at ?? 0,
    }));
  }

  /**
   * 書き出しジョブを作る。
   *
   * Connect API の書き出しは**非同期**で、ここで返るのは受付結果。
   * `status` が成功になるまで URL は空でありうるので、完了したふりを
   * せず status をそのまま返す。
   */
  async exportDesign(designId: string, format: string): Promise<CanvaExportJob> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawExport>(
      `${API}/exports`,
      {
        method: 'POST',
        headers: jsonBody(String(this.creds.token)),
        body: JSON.stringify({ design_id: designId, format: { type: format } }),
      },
      this.ctx(),
    );
    return {
      id: raw.job?.id ?? '',
      status: raw.job?.status ?? '',
      urls: raw.job?.urls ?? [],
    };
  }

  /**
   * **未実装。**
   *
   * Connect API には「プロンプトから作る」入口が無い。`POST /rest/v1/designs`
   * は design_type と素材から**空のデザインを作る**もので、prompt を渡す先が
   * 無い。prompt を title に流し込めば動いているように見えるが、それは生成
   * ではない。以前のスタブは `{ ok: true }` を返しており、**何もしていない
   * のに成功**として扱われていた。
   */
  async generateDesign(_prompt: string): Promise<never> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    throw new NotImplementedError(
      this.id,
      'generateDesign',
      'Canva Connect API にプロンプトからデザインを生成する入口が無く、対応する一次資料を確認できていません',
    );
  }
}

// --- フォルダの作成 (POST /folders) ------------------------------------------
/*
 * **両ビルドが同じ関数を通る** (2026-09-18 · オントロジーの組み直し · github.ts と同じ形)。
 * 親フォルダは省略なら root。文字列でない親は台帳が断る (すり替えない)。
 */

export type CanvaTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface CanvaFolderFields {
  readonly name?: unknown;
  readonly parentFolderId?: unknown;
}

export interface CheckedFolder {
  readonly name: string;
  /** 省略なら "root"。 */
  readonly parentFolderId: string;
}

/** 欄の型・長さを共有台帳 (`CANVA_FOLDER_FIELDS`) で断る (パス 111)。 */
export function checkFolder(input: CanvaFolderFields): CheckedFolder {
  const bad = checkWriteFields(input, CANVA_FOLDER_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  return {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    parentFolderId:
      typeof input.parentFolderId === 'string' && input.parentFolderId.length > 0 ? input.parentFolderId : 'root',
  };
}

export const CANVA_FOLDERS_PATH = '/folders';

/** 要求の組み立て (`canva/create-folder`)。 */
export function canvaFolderInit(folder: CheckedFolder, token: string): RequestInit {
  return {
    method: 'POST',
    headers: jsonBody(token),
    body: JSON.stringify({ name: folder.name, parent_folder_id: folder.parentFolderId }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function createCanvaFolderRequest(
  folder: CheckedFolder,
  token: string,
  transport: CanvaTransport,
): Promise<Response> {
  return transport(`${CANVA_API}${CANVA_FOLDERS_PATH}`, canvaFolderInit(folder, token));
}

export interface CreatedFolder {
  readonly id: string;
  readonly name: string;
}

/** 応答の `folder.id` / `folder.name` を**形を確かめて**取る (パス 261 / 262)。 */
export function parseCreatedFolder(body: unknown): CreatedFolder {
  const folder = requireChild(requireObject(body, 'Canva API'), 'folder', 'Canva API');
  return {
    id: displayField(requireString(folder, 'id', 'Canva API')),
    name: displayField(requireString(folder, 'name', 'Canva API')),
  };
}
