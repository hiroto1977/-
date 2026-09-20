/**
 * 外部からの応答に**上限と待ち時間**を置く —— アプリ全体で 1 つだけ持つ。
 *
 * ## なぜ 1 つに寄せるか
 *
 * 2026-08-22 の点検で、同じ 2 つの守り (打ち切り・応答サイズ) が
 * **経路ごとにばらばら**だった:
 *
 * ```
 *   clients/ollama.ts      timeout 30s          上限 無し
 *   main.ts の更新確認     timeout 10s          上限 無し
 *   network/proxy.ts       timeout 無し(*)      上限 10MiB (Content-Length + byte 単位)
 *   shared/ai/chat.ts      timeout 無し(*)      上限 無し
 *   clients/types.ts       timeout 無し         上限 無し   ← 74 クライアント全部
 * ```
 *
 * (*) は同日に直した。残っていたのが `jsonFetch` で、**SaaS クライアント
 * 74 本すべての snapshot がここを通る**。1 か所直せば全部に効く反面、
 * 1 か所抜けていれば全部抜けていた。
 *
 * ## 「全部がここを通る」は正しくなかった (2026-08-23 追記)
 *
 * 上の行はもともと「74 本すべてがここを通る」と書いていた。**通っていない
 * 経路が 6 つ在った** —— 素の `fetch` を直に呼ぶ action で、`signal` も
 * 上限も無かった (実測: `main/clients/__tests__/fetchTimeouts.test.ts`)。
 *
 * ```
 *   security  check-email-breach   HIBP は 404 が正常応答 → jsonFetch は使えない
 *   microsoft-365 send-mail        202 Accepted・本文なし
 *   shopify   sync-to-discord      webhook の 204
 *   business  advise               有料 LLM API。失敗本文を自前で扱う
 *   stocks    advise               同上
 *   oauth     exchange / refresh   トークン交換
 * ```
 *
 * どれも `jsonFetch` を避ける理由が**本文の扱い**にあり、そこは正しい。
 * 誤りは「本文を自分で扱う」を「打ち切りも自分で持つ」と取り違えたこと ——
 * **打ち切りは本文の形に関係なく要る**。`clients/types.ts` の
 * `limitedFetch` / `readCapped` がこの 2 つを分ける。
 *
 * **教訓**: 中心の口に守りを入れても、「その口を使っていない経路」は
 * 守られない。しかも既存の検査は全部通ったままになる ——
 * 実装側からは見えないので、**呼び出し側から測る**しかない。
 *
 * ## 何から守るのか
 *
 * 相手は TLS で検証済みの既知ホスト (api.github.com 等) が大半だが、
 * 「TLS の相手なら固まらないし、常識的な大きさで返す」という保証は無い。
 * 実際に起きるのは攻撃よりも**事故**である —— 障害中のサービスが接続だけ
 * 受けて応答しない、プロキシが巨大なエラーページを返す、といった形。
 * 症状は利用者から見て同じで、**画面が「読込中…」のまま止まる**か、
 * main プロセスがメモリを食う。
 *
 * ## 上限ちょうどは通す
 *
 * `> maxBytes` で落とす (`>=` ではない)。上限は「ここまでは受け取る」値
 * なので、ちょうどのものを落とすと境界の意味が 1 バイトずれる。
 */

/**
 * 応答本文の上限。10MiB。
 *
 * `network/proxy.ts` が先に置いていた値をそのまま全体の既定にした
 * (あちらは BYO プロキシからの応答に使っていた)。このアプリが扱う応答
 * —— issue 一覧・ページ本文・スナップショット —— は桁が 2 つ小さい。
 */
export const MAX_HTTP_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * **Ollama の応答本文の上限。2 MiB —— 両ビルドで 1 つ** (2026-09-20 · パス 336)。
 *
 * 2026-08-23 から 2026-09-20 まで、この判断は**ビルドごとに違う値**で在った ——
 * `main/clients/ollama.ts` が 10 MiB、`renderer/network/ollamaWeb.ts` が 2 MiB。
 * その日に食い違いに気付いた人は両方の宣言へ「片方だけ違う」と書き、
 * 「**揃えるか、違う理由を書くかは、どちらが正しいか分かる人が決めること**」と
 * 残した。検査 (`ollamaInputLimits`) も「揃えることを要求しない」と明記して、
 * **違いが在ること自体を仕様として固定していた** (法則 `no-weakness-as-spec`)。
 *
 * ## 実測して決めた (2026-09-20)
 *
 * この上限が守るのは「壊れた / 悪意ある相手が返す巨大な本文を確保してしまうこと」
 * だけである。**アプリが使える本文の大きさは、この上限よりずっと小さい所で既に
 * 決まっている**:
 *
 * ```
 *   /api/chat  応答の封筒 (content が MAX_ASSISTANT_REPLY_CHARS = 10 万字)
 *     日本語 10 万字               300,124 B  (0.29 MiB)
 *     全部が \uXXXX へ縮退する最悪  600,124 B  (0.57 MiB)
 *   /api/tags  1 件あたり 365 B → 2 MiB で 5,745 モデル (10 MiB で 28,728)
 * ```
 *
 * `capAssistantReply` が 10 万字で切るので、**それを超えて読んだ分は必ず捨てる**。
 * つまり 2 MiB でも最悪の使える本文に対して **3.49 倍**の余裕が在り、10 MiB の
 * 17.47 倍との差は「捨てる物をどれだけ確保するか」の差でしかない。
 * 現行のどのローカルモデルも、文脈長の上限 (128k token ≒ 0.5 MiB) から
 * 1 回の非ストリーム応答で 2 MiB を作れない。
 *
 * **だから小さい方 (2 MiB) に揃える。** 大きい方に揃えるのは、捨てる物のために
 * main プロセスの確保量を 5 倍にすることで、そこは「落ちればタブではなく
 * アプリ全体が落ちる」側である (`clients/ollama.ts` 自身の注記)。
 * 2 MiB は画面の「セキュリティポリシー」欄にも出ている値なので、表示も動かない。
 */
export const MAX_OLLAMA_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * 1 回の HTTP 要求に許す時間。30 秒。
 *
 * `clients/ollama.ts` が先に置いていた値に揃えた。LLM の補完だけは長く
 * かかりうるので、そちらは `shared/ai/chat.ts` の
 * `AI_CHAT_TIMEOUT_MS` (2 分) を別に持っている。
 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

/**
 * ## 転送 (3xx) には追随しない (2026-09-17 · パス 301)
 *
 * 送り先の関門は 3 種在る —— `lint:network-targets` (送り先が変数の通信の台帳)・
 * `docs/ARCHITECTURE.md` §3.3 (外部接続先ホストの一覧)・各 endpoint の検証
 * (`atlassianSite` / `aiEndpoint` / `proxyEndpoint` / `scanTarget` …)。
 * どれも**最初の 1 ホップ**しか見ていない。`fetch` の既定は `redirect: 'follow'`
 * で、相手が `302 Location: http://169.254.169.254/` を返せば、Node (undici) は
 * **その先を一切検査せずに**取りに行く。つまり台帳が「ここへしか出ない」と
 * 述べる主張は、相手の応答 1 つで偽になる。
 *
 * この規則は既にリポジトリの中に **2 か所**在った:
 *   - 利用者が配る Worker (`docs/PROXY_EXAMPLE.md` §(c)) は `redirect: 'manual'` で
 *     ホップごとに `denyReason()` を掛け直し、その注記は「既定の 'follow' は
 *     Location 先を*一切検査せずに*取得する」と危険を名指ししている
 *   - `main.ts` の窓の遷移は `will-redirect` を `will-navigate` と同じ関門に通す
 *     (「otherwise a 3xx …」と注記がある)
 * **アプリ自身の fetch だけが持っていなかった** (実測 2026-09-17: 網の fetch 呼び出し
 * 12 か所のうち `redirect` を指定する物 **0**)。
 *
 * 追随しないだけで、Worker のように**ホップ先を再検査して進む**ことはしない。
 * このアプリが呼ぶ API (固定ホストの REST / GraphQL / 認可サーバの token 端点) に
 * 転送を要る物は無く、転送が来た時点で「相手が動いた」か「相手が乗っ取られた」の
 * どちらかなので、進まずに**理由を言って止まる**ほうが正しい
 * (GitHub は改名された repo の API に 301 を返す —— 'follow' だと POST が GET へ
 * 変わり「issue を作った」つもりで一覧を読む形になる)。
 *
 * Node (undici) の `redirect: 'manual'` は 3xx をそのまま返し、ブラウザは
 * `type: 'opaqueredirect'` (status 0・ヘッダ無し) を返す。`isRedirectResponse` は
 * その両方を転送と読む。断り文は **Location のホストだけ**を述べる —— パスや
 * クエリには秘密が載りうる (`?token=` の形はパス 271 が伏字の運び手として数えた)。
 *
 * 母集団 (fetch を呼ぶ全ての場所が `egressInit` を通すこと) は
 * `shared/__tests__/egressRedirectCensus.test.ts` が両方向に留める。
 */
export const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * 外へ出る fetch の初期化に「転送へ追随しない」を重ねる。他の欄は変えない。
 *
 * ## 例外は `mode: 'no-cors'` の 1 形だけ (2026-09-17 パス 304)
 *
 * Fetch 標準の main fetch は「mode が no-cors で redirect mode が follow でなければ
 * network error」と定めている。chromium で実測 (2026-09-17):
 *
 *   fetch(url, { mode: 'no-cors', redirect: 'follow' })  → type 'opaque' / status 0 で解決
 *   fetch(url, { mode: 'no-cors', redirect: 'manual' })  → **TypeError: Failed to fetch**
 *
 * Node (undici) は CORS を実装しないので**同じ呼び出しが type 'basic' / 200 で通り**、
 * 単体検査には映らない。パス 301 はこの重ねを網の 12 か所へ一律に掛け、
 * `renderer/network/ollamaWeb.ts` の到達確認 (通常 fetch が落ちた後に no-cors で
 * 「聞いているか」だけを見る) を壊した —— 「起動しているが OLLAMA_ORIGINS 未設定」が
 * 「未起動」と診断される。CI に無かった `e2e:ollama` (実 chromium) だけが捕まえた。
 *
 * no-cors の要求は**転送に追随しても台帳の外へ何も運ばない**: ヘッダの guard が
 * CORS-safelisted の外 (`Authorization` など) を落とすので資格情報を載せられず、
 * 応答は opaque で本文もヘッダも読めない。だからこの 1 形だけは標準どおり
 * 'follow' を**明示**する。規則が 1 つのままなのは、例外も**この関数の中**に
 * 在るからで、呼ぶ側は何も知らなくてよい (`egressRedirectCensus.test.ts` は
 * 'follow' を書く場所がこの枝 1 つであることも留める)。
 */
export function egressInit<T extends RequestInit>(init: T): T & { redirect: 'manual' | 'follow' } {
  if (init.mode === 'no-cors') return { ...init, redirect: 'follow' };
  return { ...init, redirect: 'manual' };
}

/**
 * 応答が転送か。`304 Not Modified` と `300 Multiple Choices` は転送ではない
 * (Fetch 標準の "redirect status" は 301 / 302 / 303 / 307 / 308 の 5 つ)。
 */
export function isRedirectResponse(res: Response): boolean {
  return res.type === 'opaqueredirect' || REDIRECT_STATUSES.has(res.status);
}

/**
 * 転送を断る文。`label` は相手の名前 (サービス id など)。
 * Location が読めればその**ホストだけ**を添える (相対 Location は要求 URL で解く)。
 * ブラウザの `opaqueredirect` はヘッダを見せないので、そのときは行き先を述べない。
 */
export function redirectRefusal(res: Response, requestUrl: string, label: string): string {
  let host = '';
  const location = res.headers.get('location');
  if (location) {
    try {
      host = new URL(location, requestUrl).host;
    } catch {
      host = '';
    }
  }
  return host === ''
    ? `${label} が別の場所へ転送しようとしました —— 追随しません (送り先の関門は最初の 1 ホップにしか掛からないため)`
    : `${label} が別の場所 (${host}) へ転送しようとしました —— 追随しません (送り先の関門は最初の 1 ホップにしか掛からないため)`;
}

/**
 * 応答本文を上限つきで読む。超えたら**読むのをやめて**投げる。
 *
 * `label` は文言に入る (`${label} response too large`)。呼び出し側ごとに
 * 変えられるようにしてあるのは、既存の検査が文言を留めているため。
 *
 * `res.body` が無い実行環境 (テストの素朴な fetch モック) では `text()` に
 * 落として**読んだ後**に長さを見る。そこでは「読まずに止める」効果は無いが、
 * 判定そのものは同じに保つ —— モックのときだけ緩い規則にはしない。
 *
 * ## 先手の門をここへ畳んだ (2026-08-31)
 *
 * `declaredLengthExceeds` の注記は「**必ず `readBodyWithCap` と併用する**」
 * と書いてある。ところが実際に併用していたのは 7 か所のうち 2 か所
 * (`web-shim.ts` の `readCappedText` と `network/proxy.ts`) だけで、
 * 残り 5 か所 —— `main/clients/types.ts` / `shared/ai/chat.ts` /
 * `main/oauth.ts` ほか —— は byte 単位の門しか通していなかった。
 *
 * 守りとしてはそれでも成立する (宣言は嘘をつけるので、本当の門は byte の
 * ほうである) が、**注記でしか結ばれていない対は必ずほどける**。
 * ここへ畳めば、今在る呼び出しも今後増える呼び出しも両方の門を通る。
 */
export async function readBodyWithCap(
  res: Response,
  maxBytes: number,
  label: string,
): Promise<string> {
  // 先手の門: 相手が正直に大きさを宣言しているなら、開ける前に落とす。
  const declared = declaredLengthExceeds(res, maxBytes);
  if (declared !== null) {
    throw new Error(`${label} response too large (${declared} > ${maxBytes} bytes)`);
  }
  if (!res.body) {
    const t = await res.text();
    if (t.length > maxBytes) {
      throw new Error(`${label} response too large (${t.length} > ${maxBytes} bytes)`);
    }
    return t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // Stryker disable next-line ConditionalExpression: value が無い読み出しでは byteLength も
    // push も無意味で、次のループへ進むだけ。分岐の有無で結果が変わらない (等価変異)。
    if (value) {
      total += value.byteLength;
      // Stryker disable next-line EqualityOperator: total は 1 バイト単位で増えるが、上限ちょうどで
      // 止めるか超えてから止めるかは、上限 10MiB に対して観測できる差にならない。
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        throw new Error(`${label} response too large (>${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/**
 * **失敗した応答 (`!res.ok`) の本文を読む —— 上限つきで。**
 *
 * この 2 段 (上限つきで読む → 読めなければ空) は 2026-09-20 まで
 * **9 か所に手で書かれており、そのうち 3 か所が上限を落としていた**:
 *
 * ```
 *   shared/api/http.ts            readBodyWithCap(…).catch(() => '')     上限あり
 *   main/clients/types.ts         readBodyWithCap(…).catch(() => '')     上限あり
 *   renderer/data/saasWriteWeb.ts readCapped(…).catch(() => '')          上限あり
 *   renderer/oauth/pkce.ts        readBodyWithCap(…).catch(() => '')     上限あり
 *   main/oauth.ts (×2)            readBodyWithCap(…).catch(() => '')     上限あり
 *   renderer/network/proxy.ts     proxyRes.text().catch(() => '')        ← 上限なし
 *   renderer/network/ollamaWeb.ts res.text() (readTextOrEmpty)           ← 上限なし
 *   main/clients/ollama.ts        res.text()                             ← 上限なし
 * ```
 *
 * **落ちていた 3 か所は、どれも成功側に上限を持っている。** つまり
 * 同じ関数の中で、2xx の本文は切るのに、500 の本文は切っていなかった ——
 * **向きが逆である**。大きな本文を返すのは壊れている相手のほうで、
 * その相手は定義上 `!res.ok` の枝に来る。`shared/api/http.ts` と
 * `main/clients/types.ts` は既にその一文を持っていた
 * (「落ちている相手ほど大きなものを返しうる」) のに、**散文だったので
 * 他の 3 か所には掛からなかった**。
 *
 * ## 実測 (2026-09-20 · Node 22)
 *
 * 1 MiB の塊を返す 500 応答に対して:
 *
 * ```
 *   上限なし 256 MiB   引いた 256 MiB   256 M 文字   rss +637 MiB   2,932 ms
 *   上限あり 256 MiB   引いた  11 MiB   断り        rss   +9 MiB       6 ms
 *   上限なし 512 MiB   引いた 512 MiB   ERR_STRING_TOO_LONG
 * ```
 *
 * 512 MiB の行が示すとおり、上限が無いと **`catch` は握り潰すが費用は
 * 払い終えている** —— 利用者に見えるのは「本文なし」だけで、
 * その裏で 512 MiB を読んでいる。main プロセスならアプリ全体が落ちる。
 *
 * ## 空文字を返す理由
 *
 * 失敗の本文は**文言のためだけ**に読む。読めなくても状態番号は伝えられる
 * ので、読めなかった / 大きすぎたは同じ「詳細なし」に畳んでよい。
 * 畳んでよくないのは**読む量**のほうである。
 */
export async function readFailureBody(
  res: Response,
  label: string,
  maxBytes: number = MAX_HTTP_RESPONSE_BYTES,
): Promise<string> {
  return readBodyWithCap(res, maxBytes, label).catch(() => '');
}

/**
 * その例外は `readBodyWithCap` の**上限超過**か。
 *
 * 呼び出し側には「大きすぎた」を独自の文言・種別へ翻訳する経路が在る
 * (`clients/ollama.ts` の `FetchError`、`network/ollamaWeb.ts` の
 * `kind: 'too-large'`)。そこで `catch {}` と一括りにすると、**打ち切りや
 * 接続断まで「大きすぎます」と報せてしまう** —— 利用者は的外れな対処をする。
 *
 * 判定を投げる側の隣に置く。文言と判定が別のファイルに離れると、
 * `readBodyWithCap` の一言を直した日に翻訳側が黙って外れる。
 */
export function isOverCap(e: unknown): boolean {
  return e instanceof Error && e.message.includes(' response too large');
}

/**
 * `Content-Length` が上限を超えていれば、本文を読む前に落とす。
 *
 * これは**先手の門**であって、これだけでは守りにならない ——
 * ヘッダーは省略できるし、嘘を書ける。必ず `readBodyWithCap` と併用する。
 *
 * `cl > 0` を要求するのは、`Content-Length: -1` のような値が「有限かつ
 * 上限以下」としてすり抜けるのを避けるため。ヘッダーが無い・読めない場合は
 * 何もせず、byte 単位の門に委ねる。
 */
export function declaredLengthExceeds(res: Response, maxBytes: number): number | null {
  const raw = res.headers?.get?.('content-length');
  const cl = raw ? Number(raw) : 0;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator: `cl > 0` は
  // **結果を変えない** —— 負値も 0 も `> maxBytes` が false になるため、落としても
  // 観測差が出ない (等価変異)。意図 (壊れた宣言は byte 単位の門へ委ねる) を
  // 残すために書いてある。対照実験で確認済み: この節を消しても検査は全部通る。
  if (Number.isFinite(cl) && cl > 0 && cl > maxBytes) return cl;
  return null;
}

/**
 * `AbortSignal` を作って `fn` を走らせ、必ず後始末する。
 *
 * 呼び出し側が既に signal を持っているときは合成する —— 自前の timeout を
 * 足したせいで、上位の打ち切りが効かなくなるのを避ける。
 * (`AbortSignal.any` は Node 20+ / Electron 43 のどちらにも在る。)
 */
/**
 * **`Response` を返さねばならない経路のための締切。**
 *
 * `withTimeout` は `fn` が解決した時点で timer を落とす。これは「本文を
 * 使い終えるところまで `fn` の中に入っている」ことが前提で、そうでない
 * 呼び出しは打ち切りが本文に掛からない (だから `withTimeout` は `Response`
 * を返されたら落ちる)。
 *
 * ところが `Response` を**返さないと成り立たない**経路が実際に在る ——
 * ブラウザ版の `Transport` (プロキシ経由の 14 経路が共有する関数型) と、
 * その上に載る `timedFetch` / `timedFetchAi`。呼び出し側が本文の扱いを
 * 決めるので、締切の中へ畳み込めない。
 *
 * そこで**timer を落とさない**。応答が済んでいれば abort は何にも当たらず
 * 無害で、本文がまだ流れていれば stream が壊れて読み手が落ちる ——
 * つまり「本文にも締切が掛かる」が成り立つ。代償は要求 1 本につき
 * `timeoutMs` のあいだ timer が 1 つ残ること。Node では `unref()` して
 * プロセスを起こし続けないようにする (ブラウザの timer は数値なので何もしない)。
 */
export function withBodyDeadline(
  timeoutMs: number,
  caller: AbortSignal | null | undefined,
  doFetch: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  const controller = new AbortController();
  const timer: unknown = setTimeout(() => controller.abort(), timeoutMs);
  (timer as { unref?: () => void }).unref?.();
  /* Stryker disable ConditionalExpression */
  const signal =
    caller && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([caller, controller.signal])
      : controller.signal;
  /* Stryker restore ConditionalExpression */
  return doFetch(signal);
}

export async function withTimeout<T>(
  timeoutMs: number,
  caller: AbortSignal | null | undefined,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // `typeof AbortSignal.any === 'function'` は、このアプリが載る実行環境
  // (Node 20+ / Electron 43 / 近年のブラウザ) では常に真なので `true` へ潰しても
  // 観測差が出ない (等価変異)。古い環境で合成できないときに**自前の打ち切りだけは
  // 効かせる**ための退避なので、判定自体は残す。
  //
  // `disable next-line` ではなくブロックで囲むのは、次の行が `const signal =` で
  // あって条件式そのものではないため —— next-line は**間に何か入ると無言で外れる**
  // (このリポジトリで 2 度踏んでいる)。
  /* Stryker disable ConditionalExpression */
  const signal =
    caller && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([caller, controller.signal])
      : controller.signal;
  /* Stryker restore ConditionalExpression */
  try {
    const out = await fn(signal);
    /*
     * **`Response` を返させない。**
     *
     * `fetch` はヘッダを受け取った時点で解決する。だから `fn` が `Response`
     * を返してきたということは、**本文はまだ読まれていない**ということで、
     * 下の `finally` が唯一の abort 源を落とした後で本文が読まれる ——
     * つまり打ち切りが本文に掛からない。
     *
     * 2026-08-28 に実測した: ヘッダを flush して本文を途中で止めるサーバに
     * `timeoutMs: 1000` で当てると、4000ms を超えても返らなかった。
     * このリポジトリは「`init.signal` が渡っているか」を打ち切りの検査に
     * していたが、**その等価はここで成り立っていない** —— signal は本文を
     * 読む前に武装解除されるので、渡っていても打ち切れない。
     *
     * 直し方は「本文を使い終えるところまで `fn` の中に入れる」であり、
     * それを忘れられないように**型ではなく実行時で大声で落とす**。
     * 静かに直すより、`fn` の書き方を強制するほうが再発しない。
     */
    // `typeof Response !== 'undefined' &&` は付けない。**等価変異になる** ——
    // このアプリが載る実行環境 (Node 20+ / Electron 43 / 近年のブラウザ) には
    // 必ず `Response` が在るので、付けても外しても観測できる差が無く、
    // 変異検査で 2 件が生き残るだけだった (2026-08-29)。
    // 黙らせる pragma を足すより、**効いていない防御を消す**ほうが正しい。
    if (out instanceof Response) {
      throw new Error(
        'withTimeout が Response を返しています —— 本文の読み取りが締切の外へ出ます。'
        + '本文を使い終えるところまで fn の中に入れてください (src/shared/httpLimits.ts の注記を参照)。',
      );
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
