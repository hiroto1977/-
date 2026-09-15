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

import { MS365_MAIL_FIELDS, checkWriteFields, describeWriteFieldFailure } from '../writeFieldLimits';

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
