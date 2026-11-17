// 生成物 —— src/renderer/network/proxy.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * BYO Proxy — CORS ブロックされる API (Notion / Atlassian / Cloudflare 等)
 * をユーザー自身が運用するプロキシ経由で呼び出すための薄いラッパー。
 *
 * プロトコル (docs/PROXY_EXAMPLE.md §1):
 *   client → proxy:   POST <proxy-url>
 *     Content-Type: application/json
 *     X-Proxy-Auth: <secret>   (optional)
 *     Body: { url, method, headers, body }
 *
 *   proxy → upstream: 透過呼び出し
 *
 *   proxy → client:   200 OK
 *     Body: { status, headers, body }
 *
 * ⚠ 機密性の前提: このプロキシは upstream へ Authorization ヘッダーを *透過* する
 * 必要があるため、プロキシ運用者は転送されるトークンを技術的に閲覧できる。
 * 第三者運用のプロキシではなく **ユーザー自身が管理する** Worker を使うこと
 * (docs/PROXY_EXAMPLE.md)。本クライアントの防御は (a) SSRF 宛先ブロック、
 * (b) レスポンスサイズ上限、(c) プロキシのエラー応答に含まれうるトークンの
 * redactSecrets による秘匿 — に限られる。
 *
 * ## Mamori で書いてある (2026-11-10 · MG-055)
 *
 * 元は TypeScript。IndexedDB・保管庫・`fetch`・`Response`・`Headers` の口は `proxyHost.ts` の薄い壁へ閉じ込め、
 * 判断 (宛先の検査・平文 http / userinfo / ポートの拒否・封筒の解析・保存時 MAC の 3 状態・転送への非追随・
 * 応答サイズの上限・失敗本文の伏字) は全部ここに残した。書き直したのは `as` (欄の読みは `hostField`)・
 * 添字への代入 (`headers[name] = …` は `Map` を作って `Object.fromEntries`)・template 文字列は連結で、
 * 組み上がる文字列は 1 字も変えていない。
 */

import { isPrivateOrReservedTarget } from '../../shared/privateTarget';
import { egressInit, isRedirectResponse, MAX_HTTP_RESPONSE_BYTES, readBodyWithCap, readFailureBody, redirectRefusal } from '../../shared/httpLimits';
import { redactForMessage, MAX_RESPONSE_BODY_IN_MESSAGE } from '../../shared/redact';
import { describeProxyEndpointFailure, normalizeProxyEndpoint, reviewStoredProxyConfig, type ProxyCredentials, type ProxyEndpointFailure } from '../../shared/proxyEndpoint';
import { isHeaderName, isHeaderValue, normalizeHeaderValue } from '../../shared/headerValue';
import { hostReadStoredRecord, hostWriteStoredRecord, hostVaultUnlocked, hostAuthTag, hostVerifyAuthTag, hostField, hostFlattenHeaders, hostFetch, hostMakeResponse } from './proxyHost';

export { isPrivateOrReservedTarget } from '../../shared/privateTarget';

/** 設定の形そのものは shared 側が持つ (保存時・読み出し時で同じ検証を通すため)。 */
export type ProxyConfig = ProxyCredentials;

/**
 * **保存時 MAC** (2026-10-31 · threat: T-230 の隣 · 566-B)。
 *
 * この設定は**平文**の IndexedDB (`business-hub-preferences`) に残る (解錠前も読めるようにするため)。
 * ところが平文ゆえに IndexedDB へ書ける相手は送り先 URL を自分の Worker へ差し替えられる ——
 * `fetchViaProxy` は呼び出し側の `Authorization` をそのまま封筒に載せるので、差し替えれば
 * 資格情報がまるごと盗れる。T-219 の step-up は画面の書き手にしか効かず、**生の IDB 書き込みを
 * 素通りさせていた** (`setProxyConfig` を迂回する直接書き込み)。
 *
 * 対策: 解錠中に master 鍵で認証タグ (`vault.authTag`) を付けて平文の隣に置き、読み出し側が
 * 検証して**未検証なら使わない**。差し替えられた URL はタグと一致しない (または未署名) ので断られる。
 * タグは平文を保管庫の外に残したまま隣に置くだけ —— 保管庫のトークン名前空間は汚さない。
 *
 * ## 検証の 3 状態
 * - **解錠中 × タグが一致** → 使う。
 * - **解錠中 × 未署名 (`unstamped`)** → この修正より前の記録 (レガシー) か剥がされた物。区別できないので断る。
 * - **解錠中 × 不一致 (`tampered`)** → 鍵違い・改竄。断る。
 * - **ロック中** → 検証できない。だが**資格情報が乗る読みは必ず getToken の後 = 解錠後**なので、
 *   ロック中の読みに秘密は乗らない。検証を保留して素の設定を返す (旧挙動 · 下の reviewAndVerify)。
 *
 * ## 残余
 * 同一オリジンで**解錠中**の攻撃者は `vault.authTag` を自分で呼んで正しいタグを作れる (在メモリの
 * 鍵を持つ相手は何でもできる)。この MAC が守るのは**静止時の改竄** —— アプリが動いていない間・
 * 別プロセス・別の拡張からの IDB 書き込み。T-230 (保存時刻の認証) と同じ形である。
 */
const PROXY_MAC_DOMAIN = 'proxy-config';

/** 未検証の理由。`rejected` (URL/秘密の形) とは別の軸 (改竄 / 未署名)。 */
export type ProxyMacProblem = 'unstamped' | 'tampered';

/** 画面・shim が「検証できない設定は使えない」を言うときの一文 (1 か所に持つ)。 */
export const PROXY_UNVERIFIED_MESSAGE = 'プロキシ設定を検証できませんでした（未署名または改竄の可能性があります）。設定画面でプロキシを保存し直してください。';

/** IndexedDB に入る形そのもの (平文の設定 + 任意の認証タグ。タグは不透明で中を読まない)。 */
interface StoredProxyRecord {
  url: string;
  sharedSecret?: string;
  mac?: unknown;
}

/**
 * 認証タグに束ねる正準形。**保存される正規化済みの値から作る** (`reviewStoredProxyConfig`
 * が返す config) ので、保存時と読み出し時で必ず一致する。固定順の配列なので鍵順や
 * `undefined` の曖昧さが無い。
 */
function proxyMacCanonical(cfg: ProxyConfig): string {
  return JSON.stringify([cfg.url, cfg.sharedSecret ?? null]);
}

/**
 * 保存されている設定を、**読み出しのたびに検証して**返す。
 *
 * 検証を保存時にしか置かないと、検証が緩かった頃の値や別経路で書かれた値が
 * そのまま資格情報の送り先になる。弾いた理由も返すので、設定画面は
 * 「保存はされているが今の規則では使えない」ことを利用者に言える。
 */
export async function inspectStoredProxyConfig(): Promise<StoredProxyInspection> {
  let raw: unknown = undefined;
  try {
    raw = await hostReadStoredRecord();
  } catch (err) {
    return { config: null, rejected: null, unverified: null, unreadable: err };
  }
  return { ...await reviewAndVerify(raw), unreadable: null };
}

/** `inspectStoredProxyConfig` の答え。 */
export interface StoredProxyInspection {
  readonly config: ProxyConfig | null;
  readonly rejected: ProxyEndpointFailure | null;
  /**
   * 認証タグの検証に落ちた理由 (`unstamped` / `tampered`)。URL/秘密の形 (`rejected`) とは
   * 別の軸で、保存時 MAC (566-B) の結果。`config` が null の理由が「形が不正」なのか
   * 「検証できない」なのかを分ける。
   */
  readonly unverified: ProxyMacProblem | null;
  /**
   * 保管先そのものが読めなかったときの例外。**`config: null` の理由が
   * 「設定していない」なのか「確認できない」なのかを分ける** ——
   * 混ぜると、設定済みの利用者に「登録してください」と言うことになる。
   */
  readonly unreadable: unknown;
}

/** 形と認証の検証を通った結果 (`unreadable` を除く)。 */
interface ReviewedProxy {
  readonly config: ProxyConfig | null;
  readonly rejected: ProxyEndpointFailure | null;
  readonly unverified: ProxyMacProblem | null;
}

/**
 * 保存されていた生の値を、形 (shared) と認証タグ (566-B) の両方で検める。
 *
 * 形の検証は `reviewStoredProxyConfig` が 1 本持つ (保存時・読み出し時で同じ)。
 * その上に MAC の検証を重ねる —— **検証できない設定は資格情報の送り先として使わない**
 * (`PROXY_MAC_DOMAIN` の docblock の脅威そのもの)。3 状態の切り分けはそこに在る。
 */
async function reviewAndVerify(raw: unknown): Promise<ReviewedProxy> {
  const review = reviewStoredProxyConfig(raw);
  if (review.config === null) return { config: null, rejected: review.rejected, unverified: null };
  // ロック中は検証できない。資格情報が乗る読みは必ず `vault.getToken` の後 = 解錠後なので
  // (web-shim の `runProxyBearer` / security 鍵の経路)、ロック中の読みに秘密は乗らない。
  // 検証を保留して素の設定を返す (旧挙動)。
  if (!hostVaultUnlocked()) return { config: review.config, rejected: null, unverified: null };
  const mac = hostField(raw, 'mac');
  if (mac === undefined) {
    // 未署名 —— この修正より前に保存された物 (レガシー) か、タグを剥がされた物。区別できない
    // ので断る (fail closed · 未検証なら使わない)。利用者は設定画面で保存し直せば署名が付く。
    return { config: null, rejected: null, unverified: 'unstamped' };
  }
  const verified = await hostVerifyAuthTag(PROXY_MAC_DOMAIN, proxyMacCanonical(review.config), mac);
  if (!verified) return { config: null, rejected: null, unverified: 'tampered' };
  return { config: review.config, rejected: null, unverified: null };
}

/**
 * 使える設定だけを返す。弾かれた理由が要るときは `inspectStoredProxyConfig`。
 *
 * **読めなければ投げる。** `inspectStoredProxyConfig` を通して `null` に丸めると、
 * 読み出しの失敗が「未設定」と区別できなくなる —— それは 2026-09-06 に直した
 * ばかりの形である。呼び出し側が「未設定でも構わない」と決めているなら、
 * その場で `.catch()` を書けばよい。
 *
 * 保管された設定は**開けなければ投げる** (`hostReadStoredRecord`)。2026-09-06 までは `catch { return null; }` していて、
 * 設定画面は**「未設定」の札**を出し、ブラウザ版の shim は**「設定でプロキシの URL を登録してください」**と言った ——
 * **登録した本人に、登録し直せと言う**ことになる。しかも URL と共有シークレットを打ち直した末に、同じ所で失敗する。
 * 「無い」と「確認できない」を分けるのは、`dbPosture.ts` が診断について書いているのと同じ理由である。
 */
export async function getProxyConfig(): Promise<ProxyConfig | null> {
  const reviewed = await reviewAndVerify(await hostReadStoredRecord());
  return reviewed.config;
}

export async function setProxyConfig(cfg: ProxyConfig | null): Promise<void> {
  // 保存するのは**正規化した URL**。検証した文字列と保存する文字列を
  // 一致させておかないと、読み出し側の再検証が別のものを見ることになる。
  let toStore: StoredProxyRecord | null = null;
  if (cfg !== null) {
    const review = reviewStoredProxyConfig(cfg);
    if (review.config === null) {
      // rejected が null になるのは raw が null/undefined のときだけで、
      // ここは cfg !== null なので必ず理由が付く = `?? 'not-a-url'` は到達しない。
      // Stryker disable next-line StringLiteral
      throw new Error(describeProxyEndpointFailure(review.rejected ?? 'not-a-url'));
    }
    // **解錠中は master 鍵で認証タグを付ける** (保存時 MAC · 566-B · `PROXY_MAC_DOMAIN` の docblock)。
    // 画面 (SettingsPage) はブラウザ版では解錠済みのときしか描かれない (パス 455) ので、実際の保存は
    // 常にここを通ってタグが付く。ロック中は付けられない —— その記録は読み出し側が `unstamped` として
    // 断る (生の設定が検証されずに資格情報の送り先になるのを防ぐ)。
    if (hostVaultUnlocked()) {
      const mac = await hostAuthTag(PROXY_MAC_DOMAIN, proxyMacCanonical(review.config));
      toStore = { ...review.config, mac };
    } else {
      toStore = { ...review.config };
    }
  }
  await hostWriteStoredRecord(toStore);
}

interface ProxyResponseEnvelope {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const INVALID_ENVELOPE: ProxyResponseEnvelope = { status: 502, headers: {}, body: 'proxy returned an invalid envelope' };

/**
 * プロキシの応答封筒を読む。**相手は利用者が用意した Worker で、形は信じない。**
 *
 * 2026-09-05 まで `JSON.parse(text) as ProxyResponseEnvelope` をそのまま `new Response()` へ渡していた。
 * JSON が `null` なら `env.body` で TypeError、`status: 999` なら RangeError (200–599 の外)、
 * `headers` が配列や空白入りの名前・CR/LF 入りの値なら TypeError —— どれも「プロキシが壊れている」
 * ではなく `Failed to construct 'Response'` という文言で画面に出ていた。ここで形を確かめ、
 * 封筒として読めない物は 502 (bad gateway) に畳む。空の本文も同じ 502 (「何も返さなかった」)。
 * status が範囲外・欠落なら 502 にして本文は残す (相手のエラー文が読めるように)。
 */
export function parseProxyEnvelope(bodyText: string): ProxyResponseEnvelope {
  if (bodyText.length === 0) return { status: 502, headers: {}, body: '' };
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // **ここでは返さない。** 早期 return を置くと、消しても `parsed` は undefined の
    // ままで下の門が同じ `INVALID_ENVELOPE` を返す —— つまり**測れない分岐**が 1 つ
    // 残る (2026-09-06 の変異検査で生存。pragma で黙らせるのではなく分岐ごと消す)。
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return INVALID_ENVELOPE;
  const rawStatus = hostField(parsed, 'status');
  // Stryker disable next-line ConditionalExpression: 先頭の `typeof rawStatus === 'number'` を
  // true 固定にしても、後ろの `Number.isInteger` は数値以外に対して必ず false を返すため
  // 観測差が出ない (等価変異)。型の門を先に置くのは読み手のためである。
  const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 502;
  const rawHeaders = hostField(parsed, 'headers');
  const headers = new Map<string, string>();
  if (typeof rawHeaders === 'object' && rawHeaders !== null && !Array.isArray(rawHeaders)) {
    for (const entry of Object.entries(rawHeaders)) {
      const name = entry[0];
      const raw = entry[1];
      // `__proto__` は元の実装 (`headers[name] = value`) では物の原型への代入になり、文字列では**何も起きなかった**。
      // Map を経由すると本物の欄になってしまうので、同じく落とす (調べた物と送る物を一致させる)。
      if (typeof raw !== 'string' || !isHeaderName(name) || name === '__proto__') {
        continue;
      }
      // 正規化してから検査し、**正規化後の値を残す** —— `new Response()` が送る値と
      // ここで持つ値を同じにする (調べた物と開く物を一致させる)。
      const value = normalizeHeaderValue(raw);
      if (isHeaderValue(value)) {
        headers.set(name, value);
      }
    }
  }
  // threat: T-066 —— 本文を持てない status (204 / 205 / 304) では本文を捨てる (2026-10-15 · パス 523)。
  // `new Response(body, { status: 204 })` は本文が `''` でも TypeError を投げる (実測: 3 つとも
  // 「Invalid response status code」) ので、上流の 204 を忠実に中継した Worker の封筒が、アプリの
  // 「封筒が壊れている」ではなくブラウザ内部の文で落ちていた。
  const rawBody = hostField(parsed, 'body');
  const body = NULL_BODY_STATUSES.has(status) ? '' : typeof rawBody === 'string' ? rawBody : '';
  return { status, headers: Object.fromEntries(headers), body };
}

/** 本文を持てない status (Fetch 標準の null body status)。`Response` は本文が空文字でも拒む。 */
export const NULL_BODY_STATUSES: ReadonlySet<number> = new Set<number>([204, 205, 304]);

/**
 * 本文を上限つきで読む。超えたら途中で投げる (大きすぎる本文を丸ごと溜めない)。
 *
 * 判定の本体は `shared/httpLimits.ts` に 1 つだけ置く。2026-08-22 まで
 * ここにしか無く、`clients/types.ts` の `jsonFetch` (SaaS 74 本が通る口)
 * には上限が無かった。同じ問いなので、実装も 1 つにする。
 */
function readWithCap(res: Response, maxBytes: number): Promise<string> {
  return readBodyWithCap(res, maxBytes, 'proxy');
}

/**
 * 10 MiB. Defense-in-depth cap on proxy response body to prevent OOM /
 * DoS when a compromised or malicious proxy returns a huge payload.
 */
export const MAX_PROXY_RESPONSE_BYTES = MAX_HTTP_RESPONSE_BYTES;

/** 送り先 URL を解析する。解析できなければ投げる。 */
function parseTargetUrl(targetUrl: string): URL {
  try {
    return new URL(targetUrl);
  } catch {
    throw new Error('target URL の形式が不正です');
  }
}

/** プロキシ経由で target URL を呼び出し、Response 互換オブジェクトを返す。 */
export async function fetchViaProxy(targetUrl: string, init: RequestInit, cfg: ProxyConfig): Promise<Response> {
  if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
    throw new Error('target URL is required');
  }
  // Defense-in-depth: reject obviously bad target URLs before forwarding.
  const parsed = parseTargetUrl(targetUrl);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('target URL は http(s) のみ対応');
  }
  if (isPrivateOrReservedTarget(parsed)) {
    throw new Error('target URL の宛先がプライベート / 予約アドレスです (SSRF 防止)');
  }
  // **平文 http の公開ホストは断る** (2026-09-20 · パス 345)。
  //
  // 封筒の `headers` には利用者の `Authorization` がそのまま載り、Worker は
  // それを上流へ透過する。`http:` で呼べば Cloudflare と上流の間を素のまま流れる。
  // 実測 (2026-09-20): 呼び出し口 3 つ (`web-shim.ts` の 246 / 911 / 982) はどれも
  // `shared/api/*.ts` の https リテラルを渡しており、**平文で呼ぶ正当な用途は 0 件**。
  // LAN / loopback は 1 つ上の `isPrivateOrReservedTarget` が既に拒んでいるので、
  // ここに残るのは「公開ホストへ平文」だけである。
  //
  // 判定の順序は private → plaintext。`http://127.0.0.1:8080/admin` のような
  // 入力には **SSRF のほうが具体的な理由**なので、そちらを先に答える。
  // 同じ規則が Worker 側 (`docs/PROXY_EXAMPLE.md` の `denyReason`) にも在り、
  // `proxyWorkerParity.test.ts` が両方を同じ標本へ当てて結んでいる。
  if (parsed.protocol !== 'https:') {
    throw new Error('target URL は https のみ対応 (平文 http は資格情報が素のまま流れます)');
  }
  // **userinfo と既定以外のポートも断る** (2026-10-15 · パス 523 · threat: T-059)。
  //
  // Worker の許可リストは hostname しか見ないので、`https://<利用者>:<秘密>@api.notion.com/` は
  // 許可されたまま userinfo を上流へ運び、`https://api.notion.com:8443/` は同じホストの
  // **別のサービス**へ利用者の `Authorization` ごと届く。呼び出し口 3 つが渡すのは
  // `shared/api/*.ts` の https リテラル (ポート無し・userinfo 無し) なので正当な用途は 0 件。
  // Worker 側 (`docs/PROXY_EXAMPLE.md` の `denyReason`) も同じ 2 行を持ち、
  // `proxyWorkerParity.test.ts` が同じ標本を両方へ当てる。
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('target URL に userinfo (認証情報つきの URL) は使えません');
  }
  if (parsed.port !== '') {
    throw new Error('target URL に既定以外のポートは使えません');
  }
  // RequestInit の headers (Headers / 配列 / 物) を 1 つの平らな物にならす。
  const flatHeaders = hostFlattenHeaders(init.headers);
  // Forward the NORMALIZED url — the exact string the SSRF guard validated —
  // never the raw input. Otherwise the object we check and the string we send
  // can disagree whenever the proxy's URL parser differs from WHATWG:
  // `https://public.com\@169.254.169.254/` parses to hostname `public.com`
  // here (allowed) but a non-WHATWG parser on the proxy side may read the
  // authority as `169.254.169.254`. `parsed.href` collapses that ambiguity
  // (it normalizes to `https://public.com/@169.254.169.254/`), so client and
  // proxy cannot be made to disagree (2026-07 security audit).
  const envelope = { url: parsed.href, method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET', headers: flatHeaders, body: typeof init.body === 'string' ? init.body : undefined };
  // 送り先も**呼び出し側から渡されたまま**では使わない。この関数は export
  // されていて、保存経路を通らない cfg でも呼べる。資格情報が乗る口なので
  // ここでも同じ規則で確かめ、正規化した URL へ送る。
  const proxyChecked = normalizeProxyEndpoint(cfg.url);
  if (!proxyChecked.ok) {
    throw new Error(describeProxyEndpointFailure(proxyChecked.reason));
  }
  // `&&` の左だけで足りる — undefined も空文字も falsy なので `.length > 0` は
  // 一度も結果を変えない (変異検査で redundant と判明)。
  const proxyHeaders: Record<string, string> = cfg.sharedSecret ? { 'content-type': 'application/json', 'x-proxy-auth': cfg.sharedSecret } : { 'content-type': 'application/json' };
  // **呼び出し側の signal を捨てない。** 2026-08-22 まで `init` から
  // url / method / headers / body だけを取り出しており、`signal` は
  // envelope にも下の fetch にも渡っていなかった。呼び出し側 (`runAiChat`)
  // が timeout を付けても、プロキシ経由の道だけ効かない —— 「守っている
  // つもりの守り」になる。中継先が固まったら、こちらの待ちも切る。
  const proxyRes = await hostFetch(proxyChecked.url, egressInit({ method: 'POST', headers: proxyHeaders, body: JSON.stringify(envelope), signal: init.signal ?? undefined }));
  // 転送には追随しない (規則は httpLimits.ts)。封筒には上流の Authorization が載っており、
  // 307 / 308 はブラウザがそれを Location 先へ**そのまま再送**する —— `proxyEndpoint` の
  // 関門は 1 ホップ目にしか掛からない (調べた送り先と、送る送り先が別になる形)。
  if (isRedirectResponse(proxyRes)) {
    throw new Error(redirectRefusal(proxyRes, proxyChecked.url, 'proxy'));
  }
  if (!proxyRes.ok) {
    // **失敗の本文にも上限を掛ける** (2026-09-20 · パス 330)。ここは 1 行下の
    // 成功側が「compromised or malicious proxy returning a huge payload」を
    // 名指しして切っているのに、**その相手が実際に通る枝**だけ素の `text()`
    // だった —— 中継は利用者が配る Worker なので、返す本文の大きさは
    // このアプリの側では何も保証できない。
    // Stryker disable next-line StringLiteral: ラベルは「<label> response too large」の文に入るだけで、その例外は
    // `readFailureBody` の `.catch(() => '')` が握る —— 空文字を返す以外に外へ出る物が無く、観測できない (等価変異)。
    const body = await readFailureBody(proxyRes, 'proxy', MAX_PROXY_RESPONSE_BYTES);
    // A misbehaving proxy may echo the forwarded request (incl. the
    // Authorization header) back in its error body. Redact before surfacing.
    throw new Error('proxy ' + proxyRes.status + ': ' + redactForMessage(body, MAX_RESPONSE_BODY_IN_MESSAGE));
  }
  // Defense-in-depth: cap response body before json() to prevent OOM on
  // a compromised/malicious proxy returning a huge payload.
  //
  // 宣言長 (Content-Length) の先手の門は 2026-08-31 に `readBodyWithCap` へ畳んだ
  // (同じ問いに答えを 2 つ持たない)。`cl > 0` を要求する理由 ——
  // `Content-Length: -1` は有限かつ上限以下としてすり抜けるので、壊れた宣言は
  // byte 単位の門へ委ねる —— も向こうへ移した。文言は同じ
  // (`proxy response too large (N > 上限 bytes)`)。
  const bodyText = await readWithCap(proxyRes, MAX_PROXY_RESPONSE_BYTES);
  // 封筒の形はここで確かめる (空・非 JSON・範囲外の status・壊れた headers は 502 に畳む —
  // `new Response()` に投げさせない)。呼び出し側は普通の Response として扱える。
  const env = parseProxyEnvelope(bodyText);
  // threat: T-066 —— null body status には `null` を渡す (空文字でも `Response` は投げる)。
  return hostMakeResponse(NULL_BODY_STATUSES.has(env.status) ? null : env.body, env.status, env.headers);
}
