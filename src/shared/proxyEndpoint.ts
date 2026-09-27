/**
 * BYO プロキシの送り先 URL の検証 — アプリ全体で 1 つだけ持つ。
 *
 * ブラウザ版は CORS で直接叩けない API (Notion / Atlassian / Cloudflare 等) を
 * 利用者が用意した Cloudflare Worker へ中継する。`fetchViaProxy` は
 * **呼び出し側のヘッダをそのまま封筒に入れて** worker へ POST するので、
 * `Authorization: Bearer <token>` も `x-api-key` もこの URL へ流れる。
 * つまりここは**アプリが持つ資格情報のほぼ全部が通る 1 本の口**である。
 *
 * ## なぜ「保存するとき」だけでは足りないのか
 *
 * 2026-08 の監査時点で検証は `setProxyConfig`（保存時）にしか無く、
 * `getProxyConfig`（読み出し）は IndexedDB にあるものをそのまま返していた。
 * 検証を書き込み側にしか置かないと、**検証が緩かった頃に保存された値**や
 * 別経路で書かれた値がそのまま使われる。同じ形は vault の反復回数でも
 * 一度踏んでいて（保存済みメタを読むときに範囲を確かめる）、そちらは
 * 読み出し側で確かめるように直してある。ここも同じにする。
 *
 * ## 平文 http は loopback だけ
 *
 * 資格情報が乗る以上、平文で remote へ送ってよい理由が無い。
 * `wrangler dev` は `http://127.0.0.1:8787` を出すので、ローカルだけは許す。
 * この「資格情報 + 平文 = 不可、ただし loopback は可」という判断は
 * `shared/aiEndpoint.ts` で先に決めたものなので、
 * **判定そのもの ({@link isLoopbackHostname}) を borrow して書き写さない**。
 * 同じ判断を 2 か所に書くと、必ずどちらかが先に古くなる。
 *
 * ## `aiEndpoint` と違ってクエリは許す
 *
 * あちらは `` `${base}/v1/messages` `` のように**後ろにパスを足す土台**なので、
 * クエリや断片が残っていると壊れた URL になる。こちらは POST する
 * **終点そのもの**なので `?v=2` のような route が正当にありうる。
 * 断片 (`#…`) だけは弾く — サーバへ送られないので、付いていること自体が
 * 貼り間違いの印である。
 */

import { countChars } from './inputCeiling';
import { isLoopbackHostname } from './aiEndpoint';
import { hasControlChar } from './controlChars';
import { isHeaderValue, normalizeHeaderValue } from './headerValue';

/** プロキシ URL の長さ上限。これを超える正当な worker URL は無い。 */
export const MAX_PROXY_URL_CHARS = 1024;

/** 共有秘密の長さ上限。 */
export const MAX_PROXY_SECRET_CHARS = 256;

export type ProxyEndpointFailure =
  | 'empty'
  | 'too-long'
  | 'control-char'
  | 'not-a-url'
  | 'not-http'
  | 'has-userinfo'
  | 'has-fragment'
  | 'insecure-remote'
  | 'secret-too-long'
  | 'secret-control-char'
  | 'secret-non-latin1';

export type ProxyEndpointResult = { ok: true; url: string } | { ok: false; reason: ProxyEndpointFailure };

/**
 * プロキシ URL を検証して正規化する。
 *
 * 通ったものは WHATWG が正規化した `href` で、`fetchViaProxy` は
 * **これを送る**。検証した文字列と送る文字列を一致させておかないと、
 * 解析器の違いで「調べた先」と「届く先」がずれうる
 * (中継先の検証で既に同じ理由から `parsed.href` を送っている)。
 */
export function normalizeProxyEndpoint(raw: unknown): ProxyEndpointResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'not-a-url' };
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (countChars(text) > MAX_PROXY_URL_CHARS) return { ok: false, reason: 'too-long' };
  // 制御文字はヘッダ / URL の分断に使われうる。解析の前に落とす。
  if (hasControlChar(text)) return { ok: false, reason: 'control-char' };

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'not-http' };
  // `https://user:pass@evil.example` のように本当の送り先を隠す形。
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, reason: 'has-userinfo' };
  if (parsed.hash !== '') return { ok: false, reason: 'has-fragment' };
  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    return { ok: false, reason: 'insecure-remote' };
  }

  return { ok: true, url: parsed.href };
}

/** 失敗理由を利用者向けの一文にする。設定画面とエラー文字列の両方で使う。 */
export function describeProxyEndpointFailure(reason: ProxyEndpointFailure): string {
  switch (reason) {
    case 'empty':
      return 'proxy URL が不正です (空です)。';
    case 'too-long':
      return `proxy URL が長すぎます (${MAX_PROXY_URL_CHARS} 文字まで)。`;
    case 'control-char':
      return 'proxy URL に制御文字が含まれています。';
    case 'not-a-url':
      return 'proxy URL の形式が不正です (例: https://your-worker.workers.dev)。';
    case 'not-http':
      return 'proxy URL は http(s) スキームのみ対応しています。';
    case 'has-userinfo':
      return 'proxy URL にユーザー名・パスワードを含められません (本当の送り先が隠れるため)。';
    case 'has-fragment':
      return 'proxy URL に # を含められません (サーバへ送られないため、貼り間違いの可能性があります)。';
    case 'insecure-remote':
      return 'このプロキシには API トークンが乗るため http:// は使えません (平文で流れるため)。https:// にするか、localhost / 127.0.0.1 のローカル worker を指定してください。';
    case 'secret-too-long':
      return `共有秘密が不正です (${MAX_PROXY_SECRET_CHARS} 字以内)。`;
    case 'secret-control-char':
      return '共有秘密に改行や制御文字が含まれています (貼り付け時の折り返しをご確認ください)。';
    case 'secret-non-latin1':
      return '共有秘密に要求ヘッダへ載せられない文字が含まれています (全角文字・絵文字など。半角で入力してください)。';
  }
}

/**
 * 共有秘密の検証。無指定は許す (worker 側が認証を要らないこともある)。
 *
 * **この値は `x-proxy-auth` ヘッダになる** (`renderer/network/proxy.ts`)。
 * 2026-09-16 (パス 296) まで、ここは**型と長さしか見ていなかった** —— 同じ
 * ファイルの 60 行上で URL 側が `hasControlChar` を通していたのに、秘密側は
 * 通していなかった。実測した 8 形の結果:
 *
 * | 入力 | 旧い関門 | `new Headers()` |
 * |---|---|---|
 * | 末尾 LF (ファイルや端末から貼ると付く) | 通す | **通すが剥がす** → 保存した秘密と送る秘密が違う |
 * | 先頭空白 / 末尾 TAB / 末尾 CR | 通す | **通すが剥がす** (同上) |
 * | 途中の CRLF | 通す | throw。**しかも例外文に秘密が平文で載る** |
 * | NUL / 非 Latin1 | 通す | throw |
 *
 * 前者 4 形が重い: 画面は「保存した」と言い、Worker には別の文字列が届くので
 * 認証は必ず落ち、**なぜ落ちるかを画面から知る道が無い**。
 *
 * だから正規化してから検査し、**正規化後の値を返す** —— 保存する物と送る物を
 * 同じにする。規則は `shared/headerValue.ts` が 1 つだけ持つ。
 */
export type ProxySecretCheck =
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly reason: ProxyEndpointFailure };

export function checkProxySecret(secret: unknown): ProxySecretCheck {
  if (secret === undefined) return { ok: true, value: undefined };
  if (typeof secret !== 'string') return { ok: false, reason: 'secret-too-long' };
  // `Headers` が黙って落とす前後の空白は、ここで落としておく。
  const value = normalizeHeaderValue(secret);
  // 空になったなら「秘密なし」と同じ —— 送信側は falsy でヘッダを付けないので、
  // `''` を保存しても観測差が無い。差の無い違いを保存しない。
  if (value.length === 0) return { ok: true, value: undefined };
  if (countChars(value) > MAX_PROXY_SECRET_CHARS) return { ok: false, reason: 'secret-too-long' };
  // 途中に残った CR/LF/TAB などは貼り間違いなので、理由を付けて断る
  // (資格情報の入口 `shared/tokenInput.ts` と同じ厳しさに揃える)。
  if (hasControlChar(value)) return { ok: false, reason: 'secret-control-char' };
  if (!isHeaderValue(value)) return { ok: false, reason: 'secret-non-latin1' };
  return { ok: true, value };
}

/** 真偽だけが要る呼び出し側のため。規則は `checkProxySecret` が 1 つだけ持つ。 */
export function isValidProxySecret(secret: unknown): boolean {
  return checkProxySecret(secret).ok;
}

/** プロキシ設定の中身。IndexedDB へ入る形そのもの。 */
export interface ProxyCredentials {
  /** Cloudflare Worker / Vercel Function 等の URL */
  readonly url: string;
  /** 任意の共有秘密 (ヘッダーで送信) */
  readonly sharedSecret?: string;
}

export interface StoredProxyReview {
  /** 使える設定。弾いたときは null。 */
  readonly config: ProxyCredentials | null;
  /** 弾いた理由。未設定 (何も保存されていない) のときも null。 */
  readonly rejected: ProxyEndpointFailure | null;
}

/**
 * 保存されていた値を検証して、使えるものだけを返す。
 *
 * **保存時と読み出し時の両方がこの 1 本を通る。** 判断を 2 か所に書くと、
 * 片方だけ厳しくしたときに「保存はできないが、既に入っている値は使える」
 * という抜けができる。実際 2026-08 の監査で見つかったのがその形だった。
 *
 * `raw` は `unknown` で受ける — IndexedDB から出てくる値も、呼び出し側が
 * 組み立てた値も、型が保証されているわけではないため。
 */
export function reviewStoredProxyConfig(raw: unknown): StoredProxyReview {
  if (raw === null || raw === undefined) return { config: null, rejected: null };
  const checked = normalizeProxyEndpoint((raw as { url?: unknown }).url);
  if (!checked.ok) return { config: null, rejected: checked.reason };
  const secret = checkProxySecret((raw as { sharedSecret?: unknown }).sharedSecret);
  if (!secret.ok) return { config: null, rejected: secret.reason };
  // **正規化後の値を持つ** —— `Headers` が前後の空白を落とすので、素の値を保存すると
  // 保存した秘密と送る秘密が違ってしまう (パス 296)。読み出しもこの 1 本を通るので、
  // 既に汚れた値が入っている端末でもここで揃う。
  const config: ProxyCredentials = secret.value === undefined
    ? { url: checked.url }
    : { url: checked.url, sharedSecret: secret.value };
  return { config, rejected: null };
}
