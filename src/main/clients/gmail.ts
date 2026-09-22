import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
import { objectRows } from '../../shared/apiResponse';
import { localIsoDate } from '../../shared/localDate';
import { GMAIL_API, GMAIL_DRAFTS_PATH, checkGmailDraft, gmailDraftInit, parseCreatedDraft } from '../../shared/api/google';
import type { ActionData } from '../../shared/actionData';

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload?: { headers?: { name: string; value: string }[] };
}

export interface GmailSnapshot {
  threads: { id: string; sender: string; subject: string; date: string }[];
}

function headerValue(message: GmailMessage, name: string): string {
  /*
   * **`?? []` は配列であることも要素が物であることも保証しない** (2026-09-22 · パス 412)。
   *
   * 実測 (直す前・実物の `fetchGmailSnapshot` に食わせる) —— **3 形とも投げ、
   * Gmail の取得が丸ごと失敗した**:
   *
   * | 相手の応答 | 直す前 |
   * | --- | --- |
   * | `payload.headers` が文字列 | `headers.find is not a function` |
   * | 要素が `null` | `Cannot read properties of null (reading 'name')` |
   * | `h.name` が数 | `h.name.toLowerCase is not a function` |
   *
   * パス 409 は gmail の**一覧**を `objectRows` へ通したが、**ここは通っていなかった** ——
   * その census の針が `(… ?? []).map(` を 1 行で探す形だったので、
   * **変数へ入れてから使う形が母集団に入っていなかった**。
   */
  const target = name.toLowerCase();
  for (const h of objectRows<{ name?: unknown; value?: unknown }>(message.payload?.headers)) {
    if (typeof h.name !== 'string' || h.name.toLowerCase() !== target) continue;
    return typeof h.value === 'string' ? h.value : '';
  }
  return '';
}

export async function fetchGmailSnapshot(ctx: FetchContext): Promise<GmailSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'gmail' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const list = await jsonFetch<GmailListResponse>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=10',
    { headers },
    fetchCtx,
  );

  const ids = objectRows<{ id: string }>(list.messages).map((m) => m.id);
  const messages = await Promise.all(
    ids.map((id) =>
      jsonFetch<GmailMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers },
        fetchCtx,
      ),
    ),
  );

  return {
    threads: messages.map((m) => {
      // 受信日は利用者の時計で (UTC の日付だと日本の朝の受信が前日に見える)。
      const date = localIsoDate(new Date(Number(m.internalDate)));
      return {
        id: m.threadId,
        sender: headerValue(m, 'From'),
        subject: headerValue(m, 'Subject') || '(件名なし)',
        date,
      };
    }),
  };
}

// --- write-side actions --------------------------------------------------

/*
 * 下書きの組み立て (欄の判定・RFC 2822・base64url・要求・応答の読み) は
 * `shared/api/google.ts` の 1 つで、ブラウザ版も同じ関数を通る (パス 321)。
 * それまでここに在った `base64url` / `isSafeHeaderValue` / `buildRfc2822` は
 * shared へ移した —— 検査 (`gmail.test.ts` / `property.test.ts`) と
 * `shopify.ts` が読むので名前はここからも出す。
 */
export { buildRfc2822, isSafeHeaderValue } from '../../shared/rfc2822';

export interface CreateDraftPayload {
  to: string;
  subject: string;
  body?: string;
}

async function createDraft(ctx: ActionContext): Promise<ActionData<'gmail/create-draft'>> {
  const draft = checkGmailDraft(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${GMAIL_API}${GMAIL_DRAFTS_PATH}`,
    gmailDraftInit(draft, ctx.token),
    { fetch: ctx.fetch, serviceId: 'gmail' },
  );
  return parseCreatedDraft(res);
}

export const ACTIONS: ActionMap = {
  'create-draft': createDraft,
};
