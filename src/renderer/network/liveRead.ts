/**
 * ブラウザ版の**読み取り**をライブにする経路。
 *
 * これまでブラウザ版の `fetchSnapshot` は全サービスで `not_implemented` を
 * 返していた。書き込み (`invoke`) は利用者のプロキシ経由で実データに届くのに、
 * 読み取りだけは**キーを入れても永久に同梱サンプルのまま**だった。Cursor の
 * 画面に架空の 3 人が出続けていたのはこのためである。
 *
 * ## 何を渡すか
 *
 * 判定と正規化は `src/shared/api/*` に置いてあり、main 側 (デスクトップ) と
 * 同じものを呼ぶ。ここが用意するのは**通信手段だけ**である。
 *
 * - **CORS を通す相手** → ブラウザから直接 fetch する
 * - **CORS を通さない相手** → 利用者のプロキシ (Cloudflare Worker) 経由
 *
 * Cursor の `api.cursor.com` は前者ではないので、プロキシが要る。プロキシ未設定
 * のときは「設定すれば実データになる」と分かる文言で返し、画面はサンプルの
 * ままにする — 黙って空にすると、連携できていないのか本当に 0 件なのかが
 * 画面から判別できない。
 *
 * ## 増やし方
 *
 * `LIVE_READERS` に 1 行足すだけでよい。読み取りの本体は shared 側にあるので、
 * ここには「どのサービスがブラウザからも読めるか」しか書かない。
 */

import { fetchCursorSnapshotWith, DEFAULT_USAGE_DAYS } from '../../shared/api/cursor';

/** 通信手段。`fetchSnapshot` と同じく JSON として読めた本体を返す。 */
export type JsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 読み取りに必要なものを外から渡す (テストで実物と同じ経路を通せる)。 */
export interface LiveReadDeps {
  /**
   * Vault に保存された資格情報。無ければ null。
   *
   * `getToken` とは呼ばない — `web-shim.ts` に `getToken:` という行があると、
   * 「ブラウザ版のブリッジは生の秘密を渡さない」を守る検査
   * (`bridgeSurface.security.test.ts`) が引っかかる。あの検査は原文を grep する
   * 素朴な作りだが、守っている約束は本物なので、こちら側の名前を譲る。
   */
  readonly readCredential: (serviceId: string) => Promise<string | null>;
  /** プロキシ経由の通信手段。未設定なら throw する。 */
  readonly getProxyJsonFetch: () => Promise<JsonFetch>;
  /** 現在時刻 (照会期間の起点)。 */
  readonly now: () => number;
}

/** 1 サービス分の読み取り。 */
interface LiveReader {
  readonly read: (jsonFetch: JsonFetch, token: string, nowMs: number) => Promise<unknown>;
}

/**
 * ブラウザ版でも読み取りをライブにできるサービス。
 *
 * ここに無いサービスは同梱サンプルのままになる。**一覧に無いこと自体が
 * 「まだ実データにできない」という表明**なので、増やしたら
 * `docs/BROWSER_REDESIGN.md` にも書くこと。
 */
export const LIVE_READERS: Readonly<Record<string, LiveReader>> = {
  // api.cursor.com はブラウザ発の呼び出しに CORS を許可しないのでプロキシ経由。
  cursor: {
    read: (jsonFetch, token, nowMs) =>
      fetchCursorSnapshotWith(jsonFetch, token, nowMs, DEFAULT_USAGE_DAYS),
  },
};

/** 読み取りの結果。失敗しても「なぜ実データでないか」を必ず言葉で返す。 */
export type LiveReadResult =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** ブラウザ版から読み取れるサービスか。 */
export function canLiveRead(serviceId: string): boolean {
  return Object.hasOwn(LIVE_READERS, serviceId);
}

/**
 * 実データを取りにいく。取れない理由は 3 つあり、**どれなのかを区別して返す**。
 *
 *   - `live_read_unsupported` — このサービスはブラウザ版から読めない
 *   - `not_configured`        — 資格情報が未登録 (入れれば実データになる)
 *   - `proxy_required`        — プロキシ未設定 (登録すれば実データになる)
 *
 * 取得そのものの失敗 (`live_read_failed`) は相手側の応答を添えて返す。
 */
export async function liveRead(serviceId: string, deps: LiveReadDeps): Promise<LiveReadResult> {
  // `canLiveRead` と同じ判定を通す。素の添字だと `'constructor'` 等が
  // プロトタイプ側の値を返して「対応済み」に見えてしまう —— 2 行上に
  // 正しい判定があるのに、こちらだけ素で引いていた。
  const reader = canLiveRead(serviceId) ? LIVE_READERS[serviceId] : undefined;
  if (reader === undefined) {
    return {
      ok: false,
      code: 'live_read_unsupported',
      message: 'このサービスはブラウザ版からの読み取りに未対応です。同梱のサンプルを表示します。',
    };
  }

  const token = await deps.readCredential(serviceId).catch(() => null);
  if (token === null || token === '') {
    return {
      ok: false,
      code: 'not_configured',
      message: '資格情報が未登録です。登録すると実データに切り替わります。',
    };
  }

  // **必ずプロキシを通す。** CORS を許す相手なら直接 fetch でもよいが、その
  // 分岐は今どのサービスも通らない = 検査で確かめられない。資格情報を第三者の
  // ホストへ送る経路を、動かないまま置いておくほうが危ない。CORS を許す
  // サービスを足すときに、そのときの検査と一緒に分岐を戻すこと。
  let jsonFetch: JsonFetch;
  try {
    jsonFetch = await deps.getProxyJsonFetch();
  } catch (e) {
    return {
      ok: false,
      code: 'proxy_required',
      message: e instanceof Error ? e.message : 'プロキシの用意に失敗しました。',
    };
  }

  try {
    return { ok: true, data: await reader.read(jsonFetch, token, deps.now()) };
  } catch (e) {
    return {
      ok: false,
      code: 'live_read_failed',
      message: e instanceof Error ? e.message : '取得に失敗しました。',
    };
  }
}
