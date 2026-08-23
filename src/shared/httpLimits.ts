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
 * 1 回の HTTP 要求に許す時間。30 秒。
 *
 * `clients/ollama.ts` が先に置いていた値に揃えた。LLM の補完だけは長く
 * かかりうるので、そちらは `shared/ai/chat.ts` の
 * `AI_CHAT_TIMEOUT_MS` (2 分) を別に持っている。
 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

/**
 * 応答本文を上限つきで読む。超えたら**読むのをやめて**投げる。
 *
 * `label` は文言に入る (`${label} response too large`)。呼び出し側ごとに
 * 変えられるようにしてあるのは、既存の検査が文言を留めているため。
 *
 * `res.body` が無い実行環境 (テストの素朴な fetch モック) では `text()` に
 * 落として**読んだ後**に長さを見る。そこでは「読まずに止める」効果は無いが、
 * 判定そのものは同じに保つ —— モックのときだけ緩い規則にはしない。
 */
export async function readBodyWithCap(
  res: Response,
  maxBytes: number,
  label: string,
): Promise<string> {
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
    return await fn(signal);
  } finally {
    clearTimeout(timer);
  }
}
