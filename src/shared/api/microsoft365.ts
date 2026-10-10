/**
 * Microsoft Graph の送信 — **両ビルドが 1 つの実装を通る** (2026-09-15 · パス 274)。
 *
 * ## なぜホストだけを共有にしなかったか
 *
 * 最初はホストの字面 (`GRAPH_BASE`) だけをここへ移した。ところが
 * `verify:arch` の egress の自己検査が落ちた ——
 * 「`graph.microsoft.com` の行を 1 行消すと 1 件鳴る」が **0 件**になった。
 *
 * 理由: egress の走査は `src/main` なら**字面を全部**数えるが、
 * `shared` / `renderer` は**送信の文脈** (送信の呼び出しが近くに在る) しか数えない。
 * 宣言だけの module は「送らない」ので数えないのが正しく、**おかしいのは
 * 宣言だけを共有へ置いた私の側**だった。それをやると発信先の台帳の行が
 * どの実測にも支えられなくなり、行を消しても誰も鳴らない ——
 * パス 138 で塞いだ「台帳が実物より狭い」状態が戻る。
 *
 * `shared/api/cursor.ts` が通っているのは、あのファイルが
 * `CURSOR_API_BASE` を**宣言し、同じファイルで送っている**からである。
 * だからここも同じ形にした —— ホストと**要求の組み立て**を 1 つにする。
 *
 * ## 202 Accepted・本文なし
 *
 * Graph の `/me/sendMail` は 202 を本文なしで返すので、`res.json()` を
 * 呼んではいけない。成功の判定は `res.ok` だけで、**本文は読まない**。
 * 失敗のときだけ呼び出し側が本文を読む (伏字と上限はそれぞれの層が持つ)。
 */

import {
  MS365_EVENT_FIELDS,
  MS365_MAIL_FIELDS,
  checkWriteFields,
  describeWriteFieldFailure,
} from '../writeFieldLimits';
import { displayField, optionalString, requireObject, requireString } from '../apiResponse';

/** Graph の土台。版まで含めて 1 つ (`beta` へ動かすとき片側だけが動かないように)。 */
export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * 送信のために注入する fetch。**名前は `transport`** —— egress の走査
 * (`NETWORK_CALL_NAMES`) が送信の呼び出しとして知っている綴りで、
 * `saasWriteWeb.ts` の `Transport` と同じ役目である。別の名前 (`send` 等) に
 * すると、この module のホストの字面が走査から見えなくなる (パス 274 で実測)。
 */
export type GraphTransport = (url: string, init: RequestInit) => Promise<Response>;

/**
 * `checkMail` が受ける欄。**client 側の `SendMailPayload` と構造で合う** ——
 * `verify:arch` の payload の表は client に宣言を求めるので、欄の名前は
 * あちらにも在る。写しがずれないことは `microsoft365.test.ts` が
 * `MS365_MAIL_FIELDS` の鍵と突き合わせて留める (パス 274)。
 */
export interface GraphMailFields {
  readonly to?: unknown;
  readonly subject?: unknown;
  readonly body?: unknown;
}

/** 台帳を通った後の、外へ出す 3 欄。 */
export interface CheckedMail {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/**
 * 欄を**両ビルドで同じ台帳**で断る (パス 111)。通れば trim 済みの 3 欄を返す。
 * 断りの文面は `describeWriteFieldFailure` 1 つ。
 */
export function checkMail(input: GraphMailFields): CheckedMail {
  const bad = checkWriteFields(input, MS365_MAIL_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  // 台帳を通ったので `to` / `subject` は空でない文字列。`body` は任意。
  return {
    to: (input.to as string).trim(),
    subject: (input.subject as string).trim(),
    body: typeof input.body === 'string' ? input.body : '',
  };
}

/**
 * Graph へメールを送る。**この 1 つを両ビルドが通る。**
 *
 * 戻り値は相手の応答そのもの —— 成功/失敗の言い方 (`throw` / `err()`) と
 * 本文の読み方 (伏字・上限) は呼ぶ側の流儀に任せる (`checkWriteField` が
 * 理由を返して呼ぶ側が投げるのと同じ形)。
 */
/** 送信の path (共有 —— 両ビルドが同じ所へ出す)。 */
export const GRAPH_SEND_MAIL_PATH = '/me/sendMail';

/** 要求の本体 (Graph の message 封筒)。**組み立ては 1 つ**で両ビルドが読む。 */
export function graphMailInit(mail: CheckedMail, token: string): RequestInit {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: mail.subject,
        body: { contentType: 'Text', content: mail.body },
        toRecipients: [{ emailAddress: { address: mail.to } }],
      },
      saveToSentItems: true,
    }),
  };
}

export async function sendGraphMail(
  mail: CheckedMail,
  token: string,
  transport: GraphTransport,
): Promise<Response> {
  /*
   * **`GRAPH_BASE` はこの送信の呼び出しと同じ行に置く。** egress の走査は
   * shared を「送信の文脈」でしか数えないので、URL の組み立てを別の関数へ
   * 移すとホストが台帳の裏付けを失う —— パス 274 でこれを**2 度**踏んだ
   * (1 度目は宣言だけの module にしたとき、2 度目は `graphMailRequest` へ
   * URL を移したとき)。どちらも `verify:arch` の
   * 「`graph.microsoft.com` の行を消すと 1 件鳴る」が 0 件になって気づいた。
   */
  return transport(`${GRAPH_BASE}${GRAPH_SEND_MAIL_PATH}`, graphMailInit(mail, token));
}

// --- 予定の作成 (POST /me/events) ---------------------------------------
/*
 * **パス 275 で足した。** パス 274 は send-mail だけを繋ぎ、`create-event` は
 * 「プロキシ経路をまだ用意していない」と台帳に書いて残した。その後 4 行の
 * 断りの**理由を実測**したところ、これは「出来ない」ではなく
 * **画面に在るボタンが `action_not_found` で落ちる**状態だった
 * (`Microsoft365Page.tsx:122` が呼んでいる)。経路はパス 274 で出来ているので、
 * 断りを残す理由はもう無い。
 *
 * 予定作成は **201 Created・本文あり** で、送信 (202・本文なし) とは違う ——
 * 作った資源を返すので、呼ぶ側は本文の形を確かめられる (確かめるべきである)。
 */

/** 予定の時刻に添える時間帯。**両ビルドで 1 つ** (片側だけ動くとずれる)。 */
export const GRAPH_EVENT_TIME_ZONE = 'Tokyo Standard Time';

/** `checkEvent` が受ける欄 (client 側の `CreateEventPayload` と構造で合う)。 */
export interface GraphEventFields {
  readonly subject?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly location?: unknown;
}

/** 台帳を通った後の、外へ出す 4 欄。 */
export interface CheckedEvent {
  readonly subject: string;
  readonly start: string;
  readonly end: string;
  readonly location: string;
}

/** 欄を**両ビルドで同じ台帳** (`MS365_EVENT_FIELDS`) で断る。 */
export function checkEvent(input: GraphEventFields): CheckedEvent {
  const bad = checkWriteFields(input, MS365_EVENT_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  // 台帳を通ったので `subject` / `start` / `end` は空でない文字列。`location` は任意。
  return {
    subject: (input.subject as string).trim(),
    start: (input.start as string).trim(),
    end: (input.end as string).trim(),
    location: typeof input.location === 'string' ? input.location : '',
  };
}

/** 作成の path (共有 —— 両ビルドが同じ所へ出す)。 */
export const GRAPH_CREATE_EVENT_PATH = '/me/events';

/** 要求の本体 (Graph の event 封筒)。**組み立ては 1 つ**で両ビルドが読む。 */
export function graphEventInit(event: CheckedEvent, token: string): RequestInit {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: event.subject,
      start: { dateTime: event.start, timeZone: GRAPH_EVENT_TIME_ZONE },
      end: { dateTime: event.end, timeZone: GRAPH_EVENT_TIME_ZONE },
      location: { displayName: event.location },
    }),
  };
}

export async function createGraphEvent(
  event: CheckedEvent,
  token: string,
  transport: GraphTransport,
): Promise<Response> {
  // ホストは送信の呼び出しと**同じ行**に置く (理由は `sendGraphMail` の注記)。
  return transport(`${GRAPH_BASE}${GRAPH_CREATE_EVENT_PATH}`, graphEventInit(event, token));
}

/** 作成された予定のうち、画面へ渡す 3 欄。 */
export interface CreatedGraphEvent {
  readonly id: string;
  readonly subject: string;
  readonly webLink: string;
}

/**
 * 応答の `id` / `subject` / `webLink` を**形を確かめて**取る。
 *
 * ## なぜ 3 つ目の部品をここに置いたか (2026-09-22 · パス 414)
 *
 * この module は「欄の判定 (`checkEvent`) → 要求の組み立て (`graphEventInit`)」
 * まで**両ビルドで 1 つ**に揃えてあったが、**応答の読みだけが 2 つ在った**:
 *
 * | ビルド | 直す前 |
 * | --- | --- |
 * | ブラウザ版 (`saasWriteWeb.ts`) | `requireString(o, 'id')` / `optionalString(o, 'subject')` / `optionalString(o, 'webLink')` |
 * | **デスクトップ版** (`main/clients/microsoft-365.ts`) | **`res.id` / `res.subject ?? …` / `res.webLink ?? ''`** |
 *
 * `??` は null / undefined しか受けないので、実測 (直す前・実物の handler に食わせる):
 *
 * | 応答 | デスクトップ版が返した物 |
 * | --- | --- |
 * | `{subject: {a:1}}` | `subject=object:{"a":1}` (物がそのまま) |
 * | `{webLink: 42}` | `webLink=number:42` |
 * | `{id: undefined}` | `id=undefined` (**画面は「作成しました」と言う**) |
 *
 * ★ **今日この違いは画面に出ない** —— `Microsoft365Page` は `webLink` を
 * リンクの宛先にするだけで (非文字列は `shellTargetOrNull` が落とす)、`subject` は
 * 描いていない。つまりこれは**罠であって生きた欠陥ではない**。それでも 1 つに
 * するのは、パス 402 / 407 と同じ理由で「**同じアプリが同じ問いに 2 通り答え、
 * 弱い方が main に立っている**」形だからである (どちらが危ない側かは名前からは
 * 分からない)。
 *
 * `subject` / `id` は画面へ出しうるので天井 (`displayField`) を通す。
 * `webLink` は**通さない** —— URL を 256 字で切ると「押すと別の頁が開く」に
 * なるので、切るより型で落とすほうが正しい (外側の関門は `externalUrlOrNull`)。
 */
export function parseCreatedGraphEvent(body: unknown, fallbackSubject: string): CreatedGraphEvent {
  const o = requireObject(body, 'Microsoft Graph');
  return {
    id: displayField(requireString(o, 'id', 'Microsoft Graph')),
    subject: displayField(optionalString(o, 'subject') ?? fallbackSubject),
    webLink: optionalString(o, 'webLink') ?? '',
  };
}
