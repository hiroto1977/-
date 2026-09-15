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
 * 一致せず、鍵がそのまま画面とログに出ていた (2026-08-20 実測)。だから
 * **名前を起点に、線上の書き方と JSON の書き方の両方**を伏せる。
 *
 * ## なぜ名前を「列挙」しないのか
 *
 * 2026-08-23 まで、その名前は `authorization` / `x-api-key` / `x-goog-api-key` /
 * `api-key` / `proxy-authorization` の**列挙**だった。列挙は守りの中心にあるが、
 * **新しいヘッダを足す側には何の強制も無い**。実測で送っている 6 種のうち
 * 3 種が抜けていた:
 *
 *   - `x-apikey`     (VirusTotal)          — どの形でも漏れる
 *   - `x-proxy-auth` (BYO プロキシの共有秘密) — どの形でも漏れる
 *   - `hibp-api-key` (HIBP)                — 線上の形は `\bapi-key` に偶然
 *     当たっていたが、JSON の形は引用符が名前の直前を要求するので漏れる
 *
 * `x-proxy-auth` がとくに悪い。本文を返してくるのは上に書いたとおり**利用者が
 * 用意したプロキシ**で、その共有秘密がそのプロキシ自身の応答経由で画面と
 * 不具合報告に出ていた。
 *
 * そこで名前を「接頭辞つきの形」で書くようにした (`(?:[a-z0-9]+-)*` +
 * `authorization` / `api-?key` / `proxy-auth`)。`x-`, `hibp-`, `x-goog-`,
 * `proxy-` のような**仕入れ先ごとの接頭辞は、もう列挙に足さなくてよい**。
 * 引用符と引用符のあいだ全部に一致することを求めるので、`"author"` /
 * `"authorization_endpoint"` / `"idempotency-key"` は巻き添えにしない。
 *
 * そのうえで、**送っている側から数え直す**検査を置いた
 * (`scripts/scan-credential-headers.cjs` + `__tests__/redactionCoverage.test.ts`)。
 * 正規表現の字面ではなく、実物の `redactSecrets` に本文を通して秘密が消えるかを
 * 見るので、ここを書き換えても検査を欺けない。
 *
 * ここは全経路の最後の関門である (`src/shared/api/http.ts`,
 * `src/renderer/network/proxy.ts`, `src/renderer/web-shim.ts`,
 * `src/renderer/oauth/pkce.ts`, `src/shared/ai/chat.ts` ほか)。
 *
 * 覆う範囲:
 *   - 資格情報ヘッダの値 — `Authorization: Bearer …` も `"authorization":"Bearer …"` も
 *     (`x-apikey` / `hibp-api-key` / `x-proxy-auth` のような接頭辞つきも同じ形で)
 *   - 単独の `Bearer …` / `Basic …` (16 字以上。英単語を巻き添えにしない長さ)
 *   - 発行元が分かる接頭辞 — sk-ant-… / sk-proj-… / sk-… (OpenAI) /
 *     ghp_… ghs_… ghu_… gho_… ghr_… **github_pat_…** (GitHub) /
 *     xoxb-… xoxp-… xoxa-… (Slack) / secret_… **ntn_…** (Notion) /
 *     **lin_api_… lin_oauth_…** (Linear) / **sntrys_…** (Sentry) /
 *     shpat_… shpss_… shpca_… (Shopify) / sk_live_… rk_live_… **whsec_…**
 *     (Stripe) / AIza… ya29.… **1//…** (Google) / **sl.…** (Dropbox) /
 *     **1/<gid>:<hex>** (Asana) / ATATT… (Atlassian) / **eyJ….….…** (JWT —
 *     Microsoft 365 / Salesforce) / **00D…!…** (Salesforce セッション)
 *   - 接頭辞を持たない 3 形 (Cloudflare / LINE / Discord) は模様で見分けられない
 *     ので、ヘッダ名・JSON 項目名・**URL のクエリ引数**の規則が受け持つ (census が測る)
 *   - URL のクエリ引数 (`?api_key=` / `?access_token=` / `?token=` / `?key=` …) ——
 *     **3 本目の運び手。パス 271 で足した** (それまで 6 形すべて素通り)
 *   - JSON token fields (access_token / refresh_token / token / api_key /
 *     client_secret / sharedSecret / password / …)
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

import { clampToCeiling } from './inputCeiling';

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
        /(["'])((?:[a-z0-9]+-)*(?:authorization|api-?key|proxy-auth))\1(\s*:\s*)\1(?:(Bearer|Basic)\s)?(?:\\.|(?!\1)[^\\])*\1/gi,
        (_m, q: string, name: string, sep: string, scheme?: string) =>
          hideValue(`${q}${name}${q}`, `${sep}${q}`, scheme) + q,
      )
      // 同じヘッダの、HTTP の線上の書き方 (`名前: 値`)。値は `\S+` —
      // 空白まで**丸ごと**伏せる。引用符やカンマで区切ると、それを含む
      // トークンの尻尾が残る。引用符付きの形は上の規則が先に処理して
      // `"…":"[REDACTED]"` にしてあり、そこでは名前の直後がコロンではない
      // ので、この規則が二度当たって閉じ引用符まで飲み込むことはない。
      // **こちらには接頭辞のまとめ書きを置かない。** 引用符つきの規則 (上) は
      // 名前が引用符と引用符に挟まれるので `hibp-` のような仕入れ先接頭辞まで
      // 一致させる必要があるが、線上の形は `\b` があるので `hibp-api-key:` の
      // `api-key` から一致でき、**手前の `hibp-` はそのまま残る**ので
      // 仕上がりの文字列は同じになる。実測 (2026-08-23・10 例): 接頭辞あり/なしで
      // 出力が違うものは 0、漏れの有無も一致。**書いても効かない指定は、
      // 効いているように読める分だけ害がある** (変異検査でも生存し続ける)。
      .replace(
        /\b(authorization|api-?key|proxy-auth)(\s*:\s*)(?:(Bearer|Basic)\s+)?\S+/gi,
        (_m, name: string, sep: string, scheme?: string) => hideValue(name, sep, scheme),
      )
      // ヘッダ名が付いていない裸の `Bearer …` / `Basic …`。16 字以上に限る。
      // 実在するトークンは十分長く、逆に "Basic authentication" (14 字) の
      // ような**英文を伏せてしまうと、読めば分かるはずの 401 の説明が消える**。
      // 区切り文字を値から除いてあるので、伏せたあとの `[REDACTED]` (10 字)
      // に再び当たることもない (`[` も除外文字に入っている)。
      .replace(/\b(Bearer|Basic)\s+[^\s"'\\,;)[\]}]{16,}/g, '$1 [REDACTED]')
      /*
       * **プラットフォーム自身のエラー文面 —— ヘッダ名を持たない引用。**
       *
       * 上の 3 規則はどれも「ヘッダ名が在る」か「方式が在る」ことに掛かって
       * いる。このファイルの冒頭は、接頭辞を持たない 3 形 (Cloudflare の 40 字 /
       * LINE / Discord) を裸では伏せない理由として
       * **「ヘッダ名・JSON 項目名の規則が受け持つ」**と宣言している ——
       * つまり安全の根拠は「その値は必ず名前と一緒に現れる」という前提である。
       *
       * その前提が崩れる経路が 1 本在った。値に HTTP ヘッダとして不正なバイト
       * (LF / NUL) が混ざると `new Headers()` が投げ、undici の文面は
       *
       *   Headers.append: "<値>" is an invalid header value.
       *
       * ——**値だけを引用符で抱え、ヘッダ名を含まない**。`limitedFetch` は
       * `fetch` の例外をそのまま再送出し、`main.ts` の `safeErrorMessage` を
       * 通って画面の赤いバッジに出る。2026-09-14 の実測 (10 経路):
       *
       *   hibp-api-key / x-apikey  64 桁 16 進が**丸ごと**素通り (規則が 0 件当たる)
       *   Authorization ×8         `Bearer [REDACTED]\n<後半>` —— 改行で分断された
       *                            後半 20〜86 字が裸で残る (`{16,}` に届かないため)
       *
       * 名前が無いので名前には掛けられない。**引用の中身をまとめて伏せる** ——
       * ただし方式 (Bearer / Basic) は秘密ではなく原因究明に要るので残す
       * (上の規則と同じ判断)。
       *
       * 末尾の `value` を要求するので、**ヘッダ名が不正な場合の双子**
       * (`"…" is an invalid header name.`) は伏せない —— あちらの引用は
       * 名前であって秘密ではなく、伏せると原因が読めなくなる。
       *
       * 文面の頭ではなく**末尾の句**に掛けるのは、同じ句を使う別の入口
       * (`Request constructor: …`) にも同じだけ効かせるためである。
       */
      .replace(
        /"((?:Bearer|Basic)\s)?[^"]{16,}"(?=\s+is an invalid header value)/g,
        (_m, scheme?: string) => `"${scheme ?? ''}[REDACTED]"`,
      )
      /*
       * 発行元が分かる接頭辞。`AIza…` は Google の API キー — このアプリは
       * YouTube で `?key=…` の形の URL に載せて送るので、URL ごとどこかへ
       * 書き出されたときに備えてここでも拾う。
       *
       * **2026-08-29: 数えたら 5 形が抜けていた。**
       *
       * ここには `sk-ant-` が在って **OpenAI の `sk-` / `sk-proj-` が無かった**。
       * 2026-08-23 に「`sk-ant-…` を含む例外がそのまま renderer へ届いていた」
       * のを直したときに、**その事故の接頭辞だけを足して一般化しなかった**
       * 跡である。同じ事故が OpenAI の鍵で起きれば、今日でもそのまま漏れる。
       * 実測して素通りを確認した形: `sk-proj-` / `sk-` / `sk_live_` /
       * `rk_live_` / `shpat_`。このアプリはどれも預かる
       * (OpenAI は 5 社の 1 つ、Stripe と Shopify はサービス一覧に在る)。
       *
       * 経路は塞がっていない —— `shared/ai/chat.ts` は失敗応答の本文を
       * `redactForMessage(body, 200)` に通して画面へ出す。`compat`
       * (LiteLLM / LM Studio / 自前サーバ) が本文に鍵を書き返せば、
       * 伏字を通り抜けて表示される。
       */
      .replace(
        /\b(sk-ant-|sk-proj-|ghp_|ghs_|ghu_|gho_|ghr_|github_pat_|xoxp-|xoxb-|xoxa-|secret_|ntn_|lin_api_|lin_oauth_|AIza|shpat_|shpss_|shpca_|sk_live_|sk_test_|rk_live_|rk_test_|whsec_)[A-Za-z0-9_-]{8,}/g,
        '$1[REDACTED]',
      )
      /*
       * **2026-09-14 (パス 231): 25 形のうち 14 形が裸で素通りしていた。**
       *
       * 2026-08-29 は「5 形が抜けていた」を直したが、抜けを**数える道**は
       * 作らなかった (ヘッダ名の側には `scan-credential-headers.cjs` +
       * `redactionCoverage.test.ts` の census が在るのに、接頭辞の側は
       * 手書きの列挙のまま)。このアプリが預かる資格情報の形を 25 並べて
       * 実物の `redactSecrets` に**裸で**通したところ:
       *
       *   伏せた 11 / 素通り 14
       *
       * **今日預かっている 23 サービス** (`SERVICE_CREDENTIAL_USE` が
       * `fetch` / `action`) に効くのは、そのうち 4 家系である:
       *
       *   - `github_pat_…` —— **GitHub の細粒度 PAT**。今の GitHub が既定で
       *     発行する形で、このファイルが例に使い画面の placeholder が
       *     `ghp_…` と書いている当のサービスの、**今日もっとも普通に
       *     使われる鍵**が伏字の外に在った。
       *   - `ntn_…` —— Notion の新しい内部連携トークン (旧 `secret_` は在った)。
       *   - `1//…`  —— Google の更新トークン (drive / calendar / gmail /
       *     youtube。`ya29.` のアクセストークンは在った)。
       *   - `eyJ….….…` —— JWT (microsoft-365 のアクセストークン)。
       *
       * 残り (Linear / Sentry / Dropbox / Asana / Stripe の whsec / Salesforce)
       * は 2026-08 の監査で `none` に倒して**入力欄を閉じた**サービスだが、
       * それ以前に保存された分は今も残りうる (`credentialUse.ts` が掃除の
       * 導線を持っているのはそのためである) ので、同じ規則で伏せる。
       *
       * 上の一括規則に混ぜられるのは本体が `[A-Za-z0-9_-]` の形だけなので、
       * 区切り記号を含む 6 形は下に分けて書く。
       *
       * 接頭辞を持たない 3 形 (Cloudflare の 40 字・LINE のチャネルトークン・
       * Discord の bot トークン) は**模様で見分けられない** ——
       * 伏せようとすれば同じ長さの英数字を何でも伏せることになる。
       * あちらはヘッダ名・JSON 項目名の規則が受け持ち、
       * `redactionCoverage.test.ts` がその「受け持てている」ことを測る。
       */
      // Sentry の `sntrys_…` は base64 なので `=` `+` `/` を含みうる。
      // 本体を狭く書くと尻尾が残る (伏せたつもりで漏れる) ので広く取る。
      .replace(/\bsntrys_[A-Za-z0-9_=+/.-]{16,}/g, 'sntrys_[REDACTED]')
      // Dropbox の短命トークン。実物は 130 字を超えるので 20 字以上に限れば
      // 散文の「…sl.」には当たらない (直後に空白の無い長い英数字が要る)。
      .replace(/\bsl\.[A-Za-z0-9_-]{20,}/g, 'sl.[REDACTED]')
      /*
       * JWT (`eyJ…` = base64url の `{"`)。Microsoft 365 / Salesforce の
       * アクセストークンはこの形で、**ドット 2 つ**を要求するので
       * 難読化した JSON の塊 (ドットを持たない) は巻き込まない。
       */
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'eyJ[REDACTED]')
      // Google の更新トークン (`1//0g…`)。`\b` の手前は非単語字なので
      // `…/v1//foo` のような道 (`v` が単語字) には当たらない。
      .replace(/\b1\/\/[A-Za-z0-9_-]{20,}/g, '1//[REDACTED]')
      // Asana の PAT (`1/<gid>:<32 桁の 16 進>`)。構造が細かいので誤爆しない。
      .replace(/\b1\/\d{10,}:[0-9a-f]{32}\b/g, '1/[REDACTED]')
      // Salesforce のセッション ID (`00D…!AQ…`)。組織 ID と `!` が目印。
      .replace(/\b00D[A-Za-z0-9]{12,15}![A-Za-z0-9._=-]{20,}/g, '00D[REDACTED]')
      /*
       * 接頭辞の付かない旧 OpenAI 鍵 (`sk-` + 英数)。**上の規則より後に置く** ——
       * `sk-ant-` / `sk-proj-` は既に伏せてあり、残りの `ant-[REDACTED]` は
       * `[` で止まって 20 字に届かないので二重には当たらない。
       *
       * 20 字を要求するのは英文を巻き込まないため。`\b` は日本語の直後でも
       * 立つ (CJK は `\w` ではない) ので、短くすると散文を伏せかねない。
       * 実在の OpenAI 鍵は 40 字を超える。
       */
      .replace(/\bsk-[A-Za-z0-9_-]{20,}/g, 'sk-[REDACTED]')
      .replace(/\bya29\.[A-Za-z0-9_-]{10,}/g, 'ya29.[REDACTED]')
      // Atlassian API token (Jira/Confluence PAT) — always begins `ATATT`.
      .replace(/\bATATT[A-Za-z0-9_=.-]{16,}/g, 'ATATT[REDACTED]')
      // The value sub-pattern `(?:[^"\\]|\\.)*` correctly skips over
      // JSON-escaped characters (`\"`, `\\`, etc.) so a token rendered
      // inside a nested JSON-in-JSON error response can't smuggle a
      // closing-quote past the redactor. Without it, an upstream reply
      // like `{"error_description":"Token \"ATATT3xFfGF0…\" rejected"}`
      // would only redact `Token \` and leave the secret in the rest.
      .replace(
        /"(access_token|refresh_token|token|api_key|apikey|client_?secret|shared_?secret|password)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
        '"$1":"[REDACTED]"',
      )
      /*
       * **3 本目の運び手 —— URL のクエリ引数。** (2026-09-15 · パス 271)
       *
       * ここまでの規則が見ているのは 2 本だけである: **ヘッダ名**
       * (`authorization:` / `api-key:` …) と **JSON の項目名**
       * (`"access_token":` …)。このファイルの冒頭も、接頭辞を持たない鍵を
       * 裸では伏せない理由として「ヘッダ名と JSON 項目名の規則が受け持つ」と
       * 宣言している。**`?key=…` はそのどちらでもない。**
       *
       * 実測 (2026-09-15・`redactSecrets` を直接呼んだ):
       *
       *   ?api_key=Z…  ?apikey=Z…  ?access_token=Z…
       *   ?token=Z…    ?auth=Z…    ?key=Z…          —— **6 形すべて素通り**
       *
       * このアプリがクエリに資格情報を載せる所は 1 つ在る ——
       * `main/clients/youtube.ts` の `&key=${apiKey}` (Google API キー)。
       * それが今日漏れないのは、**Google が鍵に `AIza` を付けているから**である
       * (接頭辞の規則が拾う。実測で確認した)。つまり**運び手を知っていたからでは
       * なく、発行元の親切に依っていた**。鍵の形が変わるか、接頭辞を持たない
       * サービスが `?api_key=` を使い始めた日に、そこは黙って裸になる。
       *
       * **今日の実害は測って 0 だった** —— `src/` の例外文面で URL を
       * 差し込んでいる所は 1 つも無く (`FetchError` は `ctx.serviceId` だけを
       * 名乗る)、`new URL()` の失敗も `{ok:false, reason}` に畳まれる。
       * これは**深さの守り**で、塞いだのは運び手である。
       *
       * 名前は残して値だけ伏せる (どの引数だったかは原因究明に要る)。
       * 値の下限を 8 字にしてあるのは `?key=1` のような id を巻き添えに
       * しないため。上限は置かない —— 区切り (`&` / 空白 / `#` / 引用符) で
       * 止まるので、長い鍵でも尻尾が残らない。
       *
       * **`?sig=` / `?signature=` は入れていない。** 事前署名 URL の署名は
       * 同じ class だが、このアプリは 1 つも作らない (実測 0 件) ので、
       * 使っていない綴りを規則へ足すと「効いているように読める」だけになる
       * (このファイルが 2026-08-23 に学んだこと)。
       */
      .replace(
        /([?&])((?:[a-z0-9]+[_-])?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|secret|password|auth|key))(=)([^&\s"'`#<>]{8,})/gi,
        (_m, lead: string, name: string, eq: string) => `${lead}${name}${eq}[REDACTED]`,
      )
  );
}

/**
 * エラーメッセージへ本文を載せるときの上限 — **秘匿を先に、切り詰めを後に**。
 *
 * ## 順序を間違えると秘密がそのまま残る
 *
 * 2026-08-21 の監査時点で、`redactSecrets` の呼び出し 17 箇所すべてが
 * `redactSecrets(body.slice(0, 200))` と書いていた。**切ってから伏せている。**
 *
 * `redactSecrets` の規則は「模様」で秘密を見つける。模様には終わりが要る:
 *
 * - `"access_token":"…"` の規則は**閉じ引用符**まで含めて 1 つの模様である
 * - `Bearer …` の規則は 16 文字以上を要求する
 * - `ghp_…` などの接頭辞は 8 文字以上を要求する
 *
 * 200 文字で切ると、模様の終わりが切り落とされることがある。すると
 * **規則そのものが当たらなくなり、見えている部分は伏せられない**。
 *
 * 実測 (詰め物の長さを 0〜220 で振って最大を測った):
 *
 * | 順序 | 60 文字のトークンのうち漏れた文字数 |
 * |---|---|
 * | `redactSecrets(body.slice(0, 200))` | **60 (全部)** |
 * | `redactSecrets(body).slice(0, 200)` | 0 |
 *
 * 閉じ引用符がちょうど 200 文字目の外側に落ちる位置 (詰め物 116) では、
 * トークン全体が本文に見えているのに規則が当たらない。**断片ではなく
 * 丸ごと**出る。この文字列は画面に出て不具合報告に貼られる — それが
 * `redactSecrets` の存在理由である。
 *
 * ## 走査の上限
 *
 * 伏せてから切るには本文全体を走査することになるが、プロキシの応答は
 * 10 MiB まで許しているので、エラー経路で毎回それを舐めるのは避けたい。
 * 先に `REDACT_SCAN_LIMIT` まで切ってから伏せる。
 *
 * これで同じ問題が 8192 文字目に移るのではないか、という疑いは当たらない:
 * 困るのは「`maxLength` より前から始まり `REDACT_SCAN_LIMIT` より後で
 * 終わる秘密」だけで、それは 1 つのトークンが約 8000 文字あるという意味に
 * なる。実在しない。**上限を置いていること自体は事実なので書いておく。**
 */
export const REDACT_SCAN_LIMIT = 8192;

/**
 * 応答本文をエラーメッセージへ載せられる形にする。
 *
 * **`redactSecrets(body.slice(n))` と書かないこと。** 理由は
 * `REDACT_SCAN_LIMIT` の説明にある。`lint:forbidden` が再発を落とす。
 */
export function redactForMessage(input: string, maxChars: number): string {
  /*
   * **どちらの切り方も文字の境界で行う** (2026-09-13 · パス 196)。
   * ここは `.slice()` を 2 回使っていた —— UTF-16 のコード単位で切るので、
   * 境界がサロゲート対の真ん中に落ちると**孤立サロゲートが残る**。
   * この関数は両ビルドの**すべてのエラー 1 行が通る唯一の漏斗**なので、
   * 残った孤立サロゲートは画面 (DOM) と IPC と `JSON.stringify` へそのまま行き、
   * UTF-8 を往復した所で `\uFFFD` に化ける。エラー文には利用者が貼った値
   * (ファイル名・URL・作物名) が載りうるので、絵文字も JIS 2004 の漢字も来る。
   * 上限そのものは変えていない (2000 字 / 走査 8192 字) —— 切り方だけを直した。
   */
  return clampToCeiling(redactSecrets(clampToCeiling(input, REDACT_SCAN_LIMIT)), maxChars);
}

/** 利用者へ見せるエラー 1 行の上限 (**文字**)。ここを超える説明は画面でも読めない。 */
export const ERROR_MESSAGE_MAX_CHARS = 2000;

/**
 * 例外を「利用者へ見せてよい 1 行」にする。**伏字を通した後**を返す。
 *
 * main 側 (`src/main/main.ts`) にだけ置いてあったが、ブラウザ版の
 * `web-shim.ts` は main の役目をそのまま引き受けているのに、同じ関門が
 * 無かった (2026-08-22)。この注記は当初
 * 「個々の呼び出し元は本文を添えるとき `redactForMessage` を通しているので
 * 実際に漏れてはいなかった」と書いていたが、**それは誤りだった** ——
 * `web-shim` の `assistant.chatAll` は誤りの文言を `err()` ではなく
 * `ok({ answers })` の中身として返しており、そこだけ関門を通っていなかった
 * (2026-08-23 に実測で鍵の逐語到達を確認して塞いだ)。
 * **最後にもう一度通す口が片側にしか無い**のは、新しい経路が足された
 * ときに効いてくる非対称である。規則は 1 つだけ持つ。
 *
 * 伏字は冪等なので、既に伏せてある文字列を通しても形は変わらない。
 */
export function safeErrorMessage(err: unknown): string {
  return redactForMessage(err instanceof Error ? err.message : String(err), ERROR_MESSAGE_MAX_CHARS);
}
