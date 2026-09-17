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
 */
import { MAX_HTTP_RESPONSE_BYTES, readBodyWithCap } from '../../shared/httpLimits';
import { redactForMessage, MAX_RESPONSE_BODY_IN_MESSAGE } from '../../shared/redact';
import { isHeaderName, isHeaderValue, normalizeHeaderValue } from '../../shared/headerValue';
import { isPrivateOrReservedTarget } from '../../shared/privateTarget';
import {
  describeProxyEndpointFailure,
  normalizeProxyEndpoint,
  reviewStoredProxyConfig,
  type ProxyCredentials,
  type ProxyEndpointFailure,
} from '../../shared/proxyEndpoint';

// Constants + IDB infra below — decorative error strings, default-arrow
// fallbacks, and the request/response envelope structure are pinned by
// the 13 integration tests via `getProxyConfig` / `setProxyConfig` /
// `fetchViaProxy` round-trip + validation cases.
/**
 * **この DB は平文である。** `sharedSecret` (Worker への簡易認証) もここに入る。
 *
 * 保管庫 (`business-hub-vault`) とは別で、暗号化されない。実測 (2026-08-23) で
 * ブラウザ版に平文で残る資格情報はこれだけだった。設定画面の「保存時の保護状態」は
 * **トークン**について述べており、ここは含まない (見出しにも範囲を書いた)。
 *
 * 漏れたときに何が起きるかは測ってある: `docs/PROXY_EXAMPLE.md` の Worker は
 * 秘密の照合 (定数時間) とは**別に** `denyReason(target)` で宛先を検査し、
 * DoH で名前解決してから private/reserved を弾く (DNS rebinding 対策込み)。
 * つまり秘密だけを得ても **SSRF にはならない** —— 公開宛先への中継に使える
 * だけで、これは Worker の持ち主の帯域の話に留まる。
 * 保管庫へ移すには「解錠前に proxy を使う経路」の可否を決める必要があるため、
 * ここでは**現状を書くに留める** (勝手に設計を変えない)。
 */
const DB_NAME = 'business-hub-preferences';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'proxy';

/** 設定の形そのものは shared 側が持つ (保存時・読み出し時で同じ検証を通すため)。 */
export type ProxyConfig = ProxyCredentials;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Stryker disable next-line ConditionalExpression: DB_VERSION が 1 のあいだ onupgradeneeded は
  // 新規作成時にしか走らず contains は常に false。将来のバージョン上げに備えた防御 (等価変異)。
  if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
    req.onerror = () => reject(req.error ?? new Error('preferences open failed'));
  });
}

// Stryker disable next-line BlockStatement: 本体を空にすると undefined を返すが、
// `await undefined` は即座に解決し、fake-indexeddb ではトランザクションが
// 別途コミットされるため観測差が出ない (等価変異)。
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
    tx.onerror = () => reject(tx.error ?? new Error('tx failed'));
  });
}

/**
 * 保存されている設定を、**読み出しのたびに検証して**返す。
 *
 * 検証を保存時にしか置かないと、検証が緩かった頃の値や別経路で書かれた値が
 * そのまま資格情報の送り先になる。弾いた理由も返すので、設定画面は
 * 「保存はされているが今の規則では使えない」ことを利用者に言える。
 */
export async function inspectStoredProxyConfig(): Promise<{
  config: ProxyConfig | null;
  rejected: ProxyEndpointFailure | null;
  /**
   * 保管先そのものが読めなかったときの例外。**`config: null` の理由が
   * 「設定していない」なのか「確認できない」なのかを分ける** ——
   * 混ぜると、設定済みの利用者に「登録してください」と言うことになる。
   */
  unreadable: unknown;
}> {
  let stored: ProxyConfig | null;
  try {
    stored = await readStoredProxyConfig();
  } catch (err) {
    return { config: null, rejected: null, unreadable: err };
  }
  return { ...reviewStoredProxyConfig(stored), unreadable: null };
}

/**
 * 使える設定だけを返す。弾かれた理由が要るときは `inspectStoredProxyConfig`。
 *
 * **読めなければ投げる。** `inspectStoredProxyConfig` を通して `null` に丸めると、
 * 読み出しの失敗が「未設定」と区別できなくなる —— それは 2026-09-06 に直した
 * ばかりの形である (`readStoredProxyConfig` の注記)。呼び出し側が「未設定でも
 * 構わない」と決めているなら、その場で `.catch()` を書けばよい。
 */
export async function getProxyConfig(): Promise<ProxyConfig | null> {
  return reviewStoredProxyConfig(await readStoredProxyConfig()).config;
}

/**
 * 保管された設定を読む。**開けなければ投げる。**
 *
 * 2026-09-06 まではここで `catch { return null; }` していた (「未設定として扱う
 * 防御」)。ところが `null` は上まで通り、設定画面は**「未設定」の札**を出し、
 * ブラウザ版の shim は**「設定でプロキシの URL を登録してください」**と言う ——
 * **登録した本人に、登録し直せと言う**ことになる。しかも URL と共有シークレット
 * を打ち直した末に、同じ所で失敗する。
 *
 * 「無い」と「確認できない」を分けるのは、`dbPosture.ts` が診断について
 * 書いているのと同じ理由である。使える設定だけが要る側 (`getProxyConfig`) は
 * これまでどおり `null` を受け取る。
 */
async function readStoredProxyConfig(): Promise<ProxyConfig | null> {
  const db = await openDb();
  try {
    const cfg = await new Promise<ProxyConfig | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as ProxyConfig | undefined);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
    return cfg ?? null;
  } finally {
    db.close();
  }
}

export async function setProxyConfig(cfg: ProxyConfig | null): Promise<void> {
  // 保存するのは**正規化した URL**。検証した文字列と保存する文字列を
  // 一致させておかないと、読み出し側の再検証が別のものを見ることになる。
  let toStore: ProxyConfig | null = null;
  if (cfg !== null) {
    const review = reviewStoredProxyConfig(cfg);
    if (review.config === null) {
      // rejected が null になるのは raw が null/undefined のときだけで、
      // ここは cfg !== null なので必ず理由が付く = `?? 'not-a-url'` は到達しない。
      // Stryker disable next-line StringLiteral
      throw new Error(describeProxyEndpointFailure(review.rejected ?? 'not-a-url'));
    }
    toStore = review.config;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
      // Stryker disable next-line ConditionalExpression: 削除の代わりに null を put しても、
    // 読み出し側 (`reviewStoredProxyConfig`) が null を弾いて同じ「設定なし」になるため観測差が無い。
    // レコードを残さないほうが正しいので delete を維持する。
  if (toStore === null) tx.objectStore(STORE).delete(KEY);
    else tx.objectStore(STORE).put(toStore, KEY);
    await txDone(tx);
  } finally {
    db.close();
  }
}

interface ProxyResponseEnvelope {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/*
 * 値の規則は `shared/headerValue.ts` が 1 つだけ持つ (パス 296)。
 *
 * パス 295 はここに専用の正規表現を置いていたが、同じ知識が要求側 (共有秘密・
 * トークン) には無く、3 通りに割れていた。加えてその regex は**プラットフォームより
 * 厳しく**、末尾に改行が付いた値を丸ごと落としていた —— `new Response()` は
 * それを受理して前後の HTTP 空白を剥がすだけなので、落とす理由が無かった。
 * 正規化してから検査すれば、残す物も落とす物もプラットフォームと一致する。
 */

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    /*
     * **ここでは返さない。** 早期 return を置くと、消しても `parsed` は undefined の
     * ままで下の門が同じ `INVALID_ENVELOPE` を返す —— つまり**測れない分岐**が 1 つ
     * 残る (2026-09-06 の変異検査で生存。`localWrite` の `const OK` や `bankFormat` の
     * `-0` 正規化と同じ判断で、pragma で黙らせるのではなく分岐ごと消す)。
     */
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return INVALID_ENVELOPE;
  const env = parsed as Record<string, unknown>;
  // Stryker disable next-line ConditionalExpression: 先頭の `typeof env.status === 'number'` を
  // true 固定にしても、後ろの `Number.isInteger` は数値以外に対して必ず false を返すため
  // 観測差が出ない (等価変異)。型の門を先に置くのは読み手のためである。
  const status = typeof env.status === 'number' && Number.isInteger(env.status) && env.status >= 200 && env.status <= 599 ? env.status : 502;
  const headers: Record<string, string> = {};
  if (typeof env.headers === 'object' && env.headers !== null && !Array.isArray(env.headers)) {
    for (const [name, raw] of Object.entries(env.headers as Record<string, unknown>)) {
      if (typeof raw !== 'string' || !isHeaderName(name)) continue;
      // 正規化してから検査し、**正規化後の値を残す** —— `new Response()` が送る値と
      // ここで持つ値を同じにする (調べた物と開く物を一致させる)。
      const value = normalizeHeaderValue(raw);
      if (isHeaderValue(value)) headers[name] = value;
    }
  }
  return { status, headers, body: typeof env.body === 'string' ? env.body : '' };
}

/** Stream-read a Response body with a hard byte cap. Throws if the cap
 *  is exceeded mid-stream (so we don't buffer the whole oversized payload). */
async function readWithCap(res: Response, maxBytes: number): Promise<string> {
  // 判定の本体は `shared/httpLimits.ts` に 1 つだけ置く。2026-08-22 まで
  // ここにしか無く、`clients/types.ts` の `jsonFetch` (SaaS 74 本が通る口)
  // には上限が無かった。同じ問いなので、実装も 1 つにする。
  return readBodyWithCap(res, maxBytes, 'proxy');
}

/** 10 MiB. Defense-in-depth cap on proxy response body to prevent OOM /
 *  DoS when a compromised or malicious proxy returns a huge payload. */
export const MAX_PROXY_RESPONSE_BYTES = MAX_HTTP_RESPONSE_BYTES;

/*
 * SSRF の送り先判定 (`isPrivateOrReservedTarget`) は 2026-09-17 (パス 300) に
 * `src/shared/privateTarget.ts` へ移した —— `imageUrlGate` も同じ判定を
 * 要るのに `shared → renderer` の import が境界で禁止されていたため。
 * ここでは re-export だけを残す (呼び出し側と検査の import 先は変えない)。
 * 判定の中身・DNS rebinding の限界・Worker 側との突き合わせは移した先の docblock に在る。
 */
export { isPrivateOrReservedTarget } from '../../shared/privateTarget';

/** プロキシ経由で target URL を呼び出し、Response 互換オブジェクトを返す。 */
export async function fetchViaProxy(targetUrl: string, init: RequestInit, cfg: ProxyConfig): Promise<Response> {
  if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
    throw new Error('target URL is required');
  }
  // Defense-in-depth: reject obviously bad target URLs before forwarding.
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('target URL の形式が不正です');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('target URL は http(s) のみ対応');
  }
  if (isPrivateOrReservedTarget(parsed)) {
    throw new Error('target URL の宛先がプライベート / 予約アドレスです (SSRF 防止)');
  }

  // Convert RequestInit headers to a flat object.
  const flatHeaders: Record<string, string> = {};
  // Stryker disable next-line ConditionalExpression: headers が無いまま中へ入っても、
  // instanceof も Array.isArray も false で `Object.assign(flat, undefined)` は無操作なので同じ結果。
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        flatHeaders[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) flatHeaders[k] = v;
    } else {
      Object.assign(flatHeaders, init.headers as Record<string, string>);
    }
  }

  const envelope = {
    // Forward the NORMALIZED url — the exact string the SSRF guard validated —
    // never the raw input. Otherwise the object we check and the string we send
    // can disagree whenever the proxy's URL parser differs from WHATWG:
    // `https://public.com\@169.254.169.254/` parses to hostname `public.com`
    // here (allowed) but a non-WHATWG parser on the proxy side may read the
    // authority as `169.254.169.254`. `parsed.href` collapses that ambiguity
    // (it normalizes to `https://public.com/@169.254.169.254/`), so client and
    // proxy cannot be made to disagree (2026-07 security audit).
    url: parsed.href,
    method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
    headers: flatHeaders,
    body: typeof init.body === 'string' ? init.body : undefined,
  };

  // 送り先も**呼び出し側から渡されたまま**では使わない。この関数は export
  // されていて、保存経路を通らない cfg でも呼べる。資格情報が乗る口なので
  // ここでも同じ規則で確かめ、正規化した URL へ送る。
  const proxyChecked = normalizeProxyEndpoint(cfg.url);
  if (!proxyChecked.ok) throw new Error(describeProxyEndpointFailure(proxyChecked.reason));

  const proxyHeaders: Record<string, string> = { 'content-type': 'application/json' };
  // `&&` の左だけで足りる — undefined も空文字も falsy なので `.length > 0` は
  // 一度も結果を変えない (変異検査で redundant と判明)。
  if (cfg.sharedSecret) {
    proxyHeaders['x-proxy-auth'] = cfg.sharedSecret;
  }

  // **呼び出し側の signal を捨てない。** 2026-08-22 まで `init` から
  // url / method / headers / body だけを取り出しており、`signal` は
  // envelope にも下の fetch にも渡っていなかった。呼び出し側 (`runAiChat`)
  // が timeout を付けても、プロキシ経由の道だけ効かない —— 「守っている
  // つもりの守り」になる。中継先が固まったら、こちらの待ちも切る。
  const proxyRes = await fetch(proxyChecked.url, {
    method: 'POST',
    headers: proxyHeaders,
    body: JSON.stringify(envelope),
    signal: init.signal ?? undefined,
  });

  if (!proxyRes.ok) {
    const body = await proxyRes.text().catch(() => '');
    // A misbehaving proxy may echo the forwarded request (incl. the
    // Authorization header) back in its error body. Redact before surfacing.
    throw new Error(`proxy ${proxyRes.status}: ${redactForMessage(body, MAX_RESPONSE_BODY_IN_MESSAGE)}`);
  }

  // Defense-in-depth: cap response body before json() to prevent OOM on
  // a compromised/malicious proxy returning a huge payload.
  //
  // 宣言長 (Content-Length) の先手の門はここに**自前で**書いてあったが、
  // 2026-08-31 に `readBodyWithCap` へ畳んだ (同じ問いに答えを 2 つ持たない)。
  // `cl > 0` を要求する理由 —— `Content-Length: -1` は有限かつ上限以下として
  // すり抜けるので、壊れた宣言は byte 単位の門へ委ねる —— も向こうへ移した。
  // 文言は同じ (`proxy response too large (N > 上限 bytes)`)。
  const bodyText = await readWithCap(proxyRes, MAX_PROXY_RESPONSE_BYTES);
  // 封筒の形はここで確かめる (空・非 JSON・範囲外の status・壊れた headers は 502 に畳む —
  // `new Response()` に投げさせない)。呼び出し側は普通の Response として扱える。
  const env = parseProxyEnvelope(bodyText);
  return new Response(env.body, { status: env.status, headers: env.headers });
}

/*
 * `PROXY_REQUIRED_SERVICES` は 2026-08-27 に**削除した**。
 *
 * 「CORS 直接呼び出しが不可能で proxy 必須なのは notion / atlassian /
 * cloudflare の 3 つ」という表だったが、**実装はその方針をやめている**。
 * `network/liveRead.ts` は全サービスを**必ずプロキシへ通す**:
 *
 *   > CORS を許す相手なら直接 fetch でもよいが、その分岐は今どのサービスも
 *   > 通らない = 検査で確かめられない。資格情報を第三者のホストへ送る経路を、
 *   > 動かないまま置いておくほうが危ない。
 *
 * つまりこの表は**実装より緩い方針**を述べたまま残っており、しかも検査が
 * 「github は proxy 必須では**ない**」と固定していた。読んだ人が
 * 「github は直接 fetch してよい」と受け取ると、上の注記がまさに危ないと
 * 言っている直接経路を戻すことになる。**production からの参照は 0 件**
 * だった (定義と検査だけが生きていた)。
 *
 * 方針は `liveRead.ts` の 1 か所に置く。表を 2 つ持たない。
 */
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression
