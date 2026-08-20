/**
 * Secret redaction — shared between the Electron main process (API error
 * bodies) and the renderer (BYO-proxy error bodies). Strips anything that
 * looks like a bearer/API token from a string so error messages can't leak
 * credentials reflected back by an upstream service or a third-party proxy.
 *
 * Single source of truth: `src/main/clients/types.ts` re-exports this so the
 * redaction logic exists once.
 *
 * ## なぜヘッダ名から探すのか
 *
 * 以前は `Authorization:` という **HTTP の線上の書き方**だけを見ていた。
 * ところが本文を返してくるのは相手のサーバと**利用者が用意したプロキシ**で、
 * その手の実装はヘッダを JSON にして返す:
 *
 *     {"headers":{"authorization":"Bearer key_…"}}
 *
 * この形は `Authorization` の直後が `"` なので、コロン直結を要求する旧規則に
 * 一致せず、鍵がそのまま画面とログに出ていた (2026-08-20 実測)。送っている
 * 資格情報ヘッダは `Authorization` / `x-api-key` / `x-goog-api-key` の 3 種類
 * なので、**名前を起点に、線上の書き方と JSON の書き方の両方**を伏せる。
 *
 * ここは全経路の最後の関門である (`src/shared/api/http.ts`,
 * `src/renderer/network/proxy.ts`, `src/renderer/web-shim.ts`,
 * `src/renderer/oauth/pkce.ts`, `src/shared/ai/chat.ts` ほか)。
 *
 * 覆う範囲:
 *   - 資格情報ヘッダの値 — `Authorization: Bearer …` も `"authorization":"Bearer …"` も
 *   - 単独の `Bearer …` / `Basic …` (16 字以上。英単語を巻き添えにしない長さ)
 *   - sk-ant-…, ghp_…, ghs_…, ghu_…, ya29.…, xoxb-…, xoxp-…, secret_…, AIza…
 *   - Atlassian ATATT… tokens
 *   - JSON token fields (access_token / refresh_token / token / api_key / …)
 */

/**
 * 方式が付いていれば残し、無ければ値だけを伏せる。
 *
 * `const hideValue = () => …` ではなく **関数宣言**にしてある。矢印を定数に
 * 束ねると本体がモジュール読み込み時に評価される = 変異検査では「静的変異体」
 * になり、テストが読み込みより後に走るぶん、書き換えても誰も気付けない。
 * 同じ理由で、下の正規表現もモジュール定数に括り出さず本体へ置いている。
 */
function hideValue(name: string, sep: string, scheme?: string): string {
  return scheme === undefined ? `${name}${sep}[REDACTED]` : `${name}${sep}${scheme} [REDACTED]`;
}

export function redactSecrets(input: string): string {
  return (
    input
      // 資格情報ヘッダ (JSON / 引用符付きの形)。
      //   1: 引用符 — 後方参照で閉じ側も同じ字に揃える (JSON の `"` でも、
      //      Python 風の repr が返す `'` でも通る)。
      //   2: ヘッダ名 — **長い名前を先**に並べる (`x-goog-api-key` が
      //      `api-key` に食われないようにする)。
      //   3: 名前と値のあいだ — **そのまま書き戻す**ので形が崩れない。
      //   4: 認証方式 — あれば残す。「Bearer だったのか Basic だったのか」は
      //      秘密ではなく、原因究明にはむしろ要る。
      // 値は「エスケープ列か、閉じ引用符以外」。`\"` を跨げるので、入れ子の
      // JSON に鍵を隠して閉じ引用符を先出しする細工が効かない。
      // 方式のあとの空白は `\s` (1 個) で足りる — 2 個目以降は値側が飲み込む。
      // `\s+` と書くと「1 個か 2 個以上か」で結果が変わらない = 確かめようの
      // ない指定になる。
      .replace(
        /(["'])(proxy-authorization|authorization|x-goog-api-key|x-api-key|api-key)\1(\s*:\s*)\1(?:(Bearer|Basic)\s)?(?:\\.|(?!\1)[^\\])*\1/gi,
        (_m, q: string, name: string, sep: string, scheme?: string) =>
          hideValue(`${q}${name}${q}`, `${sep}${q}`, scheme) + q,
      )
      // 同じヘッダの、HTTP の線上の書き方 (`名前: 値`)。値は `\S+` —
      // 空白まで**丸ごと**伏せる。引用符やカンマで区切ると、それを含む
      // トークンの尻尾が残る。引用符付きの形は上の規則が先に処理して
      // `"…":"[REDACTED]"` にしてあり、そこでは名前の直後がコロンではない
      // ので、この規則が二度当たって閉じ引用符まで飲み込むことはない。
      .replace(
        /\b(proxy-authorization|authorization|x-goog-api-key|x-api-key|api-key)(\s*:\s*)(?:(Bearer|Basic)\s+)?\S+/gi,
        (_m, name: string, sep: string, scheme?: string) => hideValue(name, sep, scheme),
      )
      // ヘッダ名が付いていない裸の `Bearer …` / `Basic …`。16 字以上に限る。
      // 実在するトークンは十分長く、逆に "Basic authentication" (14 字) の
      // ような**英文を伏せてしまうと、読めば分かるはずの 401 の説明が消える**。
      // 区切り文字を値から除いてあるので、伏せたあとの `[REDACTED]` (10 字)
      // に再び当たることもない (`[` も除外文字に入っている)。
      .replace(/\b(Bearer|Basic)\s+[^\s"'\\,;)[\]}]{16,}/g, '$1 [REDACTED]')
      // 発行元が分かる接頭辞。`AIza…` は Google の API キー — このアプリは
      // YouTube で `?key=…` の形の URL に載せて送るので、URL ごとどこかへ
      // 書き出されたときに備えてここでも拾う。
      .replace(/\b(sk-ant-|ghp_|ghs_|ghu_|gho_|ghr_|xoxp-|xoxb-|xoxa-|secret_|AIza)[A-Za-z0-9_-]{8,}/g, '$1[REDACTED]')
      .replace(/\bya29\.[A-Za-z0-9_-]{10,}/g, 'ya29.[REDACTED]')
      // Atlassian API token (Jira/Confluence PAT) — always begins `ATATT`.
      .replace(/\bATATT[A-Za-z0-9_=.-]{16,}/g, 'ATATT[REDACTED]')
      // The value sub-pattern `(?:[^"\\]|\\.)*` correctly skips over
      // JSON-escaped characters (`\"`, `\\`, etc.) so a token rendered
      // inside a nested JSON-in-JSON error response can't smuggle a
      // closing-quote past the redactor. Without it, an upstream reply
      // like `{"error_description":"Token \"ATATT3xFfGF0…\" rejected"}`
      // would only redact `Token \` and leave the secret in the rest.
      .replace(/"(access_token|refresh_token|token|api_key|apikey|password)"\s*:\s*"(?:[^"\\]|\\.)*"/gi, '"$1":"[REDACTED]"')
  );
}
