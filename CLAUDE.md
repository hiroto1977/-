# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **🆕 セッション引継ぎ:** 新しい Claude Code セッションを開始した場合、
> まず [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) を読んでください。
> 進行中タスク・確立されたパターン・既知の罠・残作業を簡潔にまとめています。
> `.claude/settings.json` の SessionStart hook (`scripts/session-context.cjs`)
> が自動でこのファイルの存在を案内します。

## Project

Service Hub — a Japanese-facing business dashboard exposing **76 services** through a unified,
category-grouped sidebar (おすすめ / 士業連携 / 分析・ツール / 外部サービス連携). **Not every service has a sidebar
entry of its own**: `uber-eats` and `demae-can` are consumed inside the Business Dashboard instead
(`BusinessPage.tsx` reads their snapshots directly). That split is a reasoned, bidirectional ledger in
`src/renderer/__tests__/sidebarCoverage.test.ts` — a service that silently loses its sidebar entry fails
CI (it would also become impossible to delete its saved credentials from the UI), and an id that is
still in the ledger while back on the sidebar fails too. Services span third-party SaaS
(GitHub, WordPress.com, Atlassian, Notion, Google Drive / Calendar / Gmail, Slack, Canva,
Microsoft 365, Dropbox, Salesforce, Discord, Asana, Linear, Sentry, Shopify, Stripe, LINE), local
tools (Skills, Security, Cloudflare, Emotions, Ollama, KPI, Stocks, Storage), business operations
(Home, Business Dashboard, Team Radar, Templates, Library, Settings, Quality), food delivery
(Uber Eats, 出前館), investment (Real Estate 不動産投資, Mutual Funds 投資信託) and eight 士業
professional integrations (税理士 / 公認会計士 / 社労士 / 弁護士 / 司法書士 / 行政書士 / 中小企業診断士 / 弁理士)
with a verified 事業仕分け duty map (`professionalMap.ts`) and a local-first CRM.

**Two runtime targets ship from the same codebase:**
1. **Electron desktop app** (`npm run dev` / `npm run build`) — full OS integration, 3-process model.
2. **Browser standalone** (`npm run build:web` → `dist/standalone.html`) — a single self-contained HTML
   file (実測 11.34 MiB full / 3.15 MiB `build:web:lite` mobile variant — 2026-09-15 パス 275 後の計測: 11,891,350 B / 3,304,096 B (**両方 +918 B** —— 断りの台帳 `DESKTOP_ONLY` の**理由**を誰も検算しておらず、残る 4 行を測ると **2 行が偽・1 行は生きた欠陥**だった (`microsoft-365/create-event` は画面にボタンが在るのに `action_not_found`・`stocks/backtest` の「デスクトップ側の計算」はブラウザ版が同じ計算を戦略ごとに走らせており偽・`docstudio/list-collections` の「ローカルを読む」は 3 要素のリテラル定数で偽)。create-event を共有へ寄せて繋ぎ、理由を**種類**にして種類ごとに検査を付けた。`dead-action` の行は画面から呼ばれていてはならない)・2026-09-15 パス 274 後の計測: 11,890,432 B / 3,303,178 B (**両方 +890 B** —— `microsoft-365/send-mail` がデスクトップ版にしか無く、ブラウザ版では `action_not_found` だった (隣の `gmail/create-draft` は同じ CORS → Worker の形で動いていた)。画面は穴を「デスクトップ版の機能です」と説明し、検査も「プロキシ経路も用意していない」と台帳に書いて**穴を仕様として固定していた**。ホスト・欄の判定・要求の組み立てを `shared/api/microsoft365.ts` に寄せ、両ビルドが同じ関数を通す)・2026-09-15 パス 273 後の計測: 11,889,542 B / 3,302,288 B (「相手の本文をどれだけ画面へ載せてよいか」の天井が **5 値・19 か所の裸のリテラル**で、最も多い 200 (15 か所) にだけ名前も理由も無かったのを `shared/redact.ts` の 3 段の梯子へ寄せた分で**両方 +10 B** —— 80 の 2 か所は **main ↔ ブラウザ版の双子**で、一致していたが一致を留めている物が何も無かった (パス 269 が 300 で塞いだ穴と同じ形)。天井そのものは 1 字も変えていない)・パス 271 後の計測: 11,889,532 B / 3,302,278 B (伏字の**3 本目の運び手** —— URL のクエリ引数 —— を `redact.ts` に足した分で**両方 +196 B**。それまでの規則は**ヘッダ名**と**JSON 項目名**の 2 本しか見ておらず、`?api_key=` / `?apikey=` / `?access_token=` / `?token=` / `?auth=` / `?key=` の **6 形すべてが素通り**していた。`redact.ts` は両ビルドが読むので LITE も同じだけ増える)・2026-09-15 パス 269 後の計測: 11,889,336 B / 3,302,082 B (`assistant/chatAll` の**提供者ごと**のエラー文の天井が `redactForMessage(msg, 300)` という**字面でビルドごとに 1 つずつ**在ったのを `shared/assistantLimits.ts` の `MAX_ENSEMBLE_ERROR_CHARS` 1 つに寄せた分で**両方 +8 B** —— 応答そのものの天井 (2,000) より狭い理由 (最大 5 提供者ぶんが 1 つの文に積まれる) がどこにも書かれておらず、数字だけが 2 か所に在った。**本体の直しは出荷物に入らない** —— 「無いこと」を主張する検査が変異検査の中で空になる穴 (網が `readFileSync` しか見ていなかった) を塞いだのはゲート側である)・2026-09-15 支払明細書 4 種 (給与 / 賞与 / 役員報酬 / 役員賞与) を書類スタジオに足した後の計測: 11,889,328 B / 3,302,074 B (**両方 +29,582 B** —— 書式 52 → 56 と、交付前チェック 4 本・法的位置づけ・事業仕分けの台帳 4 行ずつ。賃金台帳の注記が 2026-08 から「給与明細は労働者へ交付する通知 (所得税法231条等)・台帳とは別物」と述べていたのに、**交付する側の明細書が 1 つも無かった**)・パス 268 後の計測: 11,859,746 B / 3,272,492 B (チームレーダーの SVG の組み立てを `shared/teamRadarSvg.ts` へ移し、**ブラウザ版が画面の `<svg>` を DOM から掻き取るのをやめた**分で**両方 +2,723 B** —— 掻き取れるのは `<svg>` 要素だけで、標題・部署・評価時点・凡例・⚠ の断りはその外側に在ったので、書き出した SVG は 244 バイトの裸の図だった)・2026-09-15 パス 267 後も 11,857,023 B / 3,269,769 B で **byte 単位で不変** (直したのは `src/main/` の `action:invoke` だけで、ブラウザ版はこのハンドラを 1 行も読み込まない —— **資格情報の要らない 15 サービスの action がデスクトップ版で 1 度も呼ばれておらず**、同じボタンがブラウザ版では動いていた)・2026-09-15 パス 266 後の計測: 11,857,023 B / 3,269,769 B (`cursor` の日次利用の 5 欄が鍵の不在を 0 に倒しており、**「採択率 0%」と「4 つのうち 1 つだけを数えたリクエスト数」**を刷っていた —— `readNum` / `sumOrNull` と画面の `qty` で**両方 +124 B**。`shared/api/cursor.ts` は両ビルドが読むので LITE も同じだけ増える)・2026-09-15 パス 265 後の計測: 11,856,899 B / 3,269,645 B (`as const` が画面の型を実物より狭くしていた真偽値 12 件に `as boolean` を足し、**その死んだ枝が「✅ 連携中」だった** —— デスクトップの funding の fetcher は Phase 6 まで見本の Map を必ず渡すので、何も繋いでいない利用者に連携を名乗っていた。出どころ (`FundingLinkSource`) と文言 2 つを共有へ置いた分で**両方 +373 B** —— `shared/funding.ts` は両ビルドが読むので LITE も同じだけ増える)・2026-09-14 パス 264 後の計測: 11,856,526 B / 3,269,272 B (鍵が無い応答から**件数の文**を組み立てていた 3 件 (`notion` の「共有されたページなし」= 利用者の設定の診断・`microsoft-365` の「直近 0 件 / 未読 0 件」= サマリーの 2 カード・`ollama` の「既知 CVE」= 版が読めないだけ) を`shared/apiResponse.ts` の `readArrayField` (空の配列は read: true) へ通した分で**両方 +283 B**)・2026-09-14 パス 263 後の計測: 11,856,243 B / 3,268,989 B (`cursor` が「相手が 0 件と答えた」と「応答を読めなかった」を分けるようにした分で**両方 +1,829 B** —— `rowsOf` は 5 つの違う状況を `[]` に畳んでおり、`{teamMembers:[]}` (0 名と答えた) も `null` も `{}` もスカラーも、見出しに `Cursor · 0 名 / 稼働 0 日 / $0.00` を緑のライブ表示で刷っていた (両方向に嘘)。shared と renderer の両方に掛かるので LITE も同じだけ増える)・2026-09-14 パス 262 後も 11,854,414 B / 3,267,160 B で **byte 単位で不変** (`jsonFetch<T>` に封筒の要求を置き、`github` の 6 欄と `freee` の事業所を要求したが、直したのは `src/main/` だけ —— ブラウザ版はこの 13 クライアントを 1 つも読み込まない (読み取りは `liveRead.ts` の `cursor` だけ・書き込みはパス 261 で直した `saasWriteWeb.ts`)。本文 `null` で 12 クライアントが `Cannot read properties of null` を画面へ漏らしていた)・2026-09-14 パス 261 後の計測: 11,854,414 B / 3,267,160 B (外部サービスの「成功した」応答を**読むところで**検証する共有規則 2 つ (`shared/apiResponse.ts` / `shared/securityResponse.ts`) と、`saasWriteWeb.ts` の 12 経路・`main/clients/security.ts` の 2 経路の配線で**両方 +2,625 B** —— 200 の本文が `{}` でも**6 経路が成功として返し**、2 経路は `undefined` を埋め込んだ URL を押せるリンクとして渡し、`security` は空の「漏洩」を 1 件でっち上げていた。安全の判定を作る 2 つは両ビルドが同じ実装を読むのでLITE も同じだけ増える)・2026-09-14 パス 260 後は 11,851,789 B / 3,264,535 B (認可サーバのトークン端点の応答を**読むところで**検証する共有規則 `shared/tokenResponse.ts` と、`oauth.ts` の裸のキャスト 2 か所の置き換えで**両方 +618 B** —— 規則はブラウザ版 `pkce.ts` に既に在り、main には 1 つも無かった。`{"refresh_token":{"a":1}}` の応答 1 つで**働いていた更新トークンが置き換わり**、以後そのサービスは 401 のまま画面は「設定済み」と出していた。`pkce.ts` も同じ関数を読むので両ビルドが同じだけ増える)・2026-09-14 パス 259 後は 11,851,171 B / 3,263,917 B で **byte 単位で不変** (`checkTokenSetForStorage` を呼ぶのは `main/secrets.ts` だけなので、ブラウザ版からは tree-shaking で丸こと落ちる —— 出荷 HTML に 0 件。認可サーバの応答 1 つで全サービスの資格情報が読めなくなる穴を塞いだ)・2026-09-14 パス 258 後の計測: 11,851,171 B / 3,263,917 B (落とした理由を「上限 200 件」から**実際に切った仕組み**へ分けた分と、欄の長さの天井をコード単位から**文字**へ揃えた分で**両方 +434 B** —— 1 件しか送っていない利用者に「上限 200 件」と刷っていた (上限は 200/200/500 なので `sent <= cap` が成り立ち、理由は証明可能に偽だった)。絵文字 33 個の部署名は 33 文字 / 66 コード単位で、旧い天井だと 33 文字で断られていた)・2026-09-14 パス 254 後の計測: 11,850,737 B / 3,263,483 B (一覧から AI へ送る本文の予算を `row.length` (コード単位) から `countChars` (文字) へ移した分で**両方 −3 B** —— 門は両ビルドとも文字で測るのに予算だけがコード単位で、絵文字 10 個の件名 600 行で 2,617 字送った時点で 362 行を落とし、画面は「5000 字までのため」と**成り立たない理由**を述べていた。`lint:charset` に制御・不可視文字の 4 群 (Trojan Source を含む) を述したがゲートなので出荷物には入らない)・2026-09-14 パス 252 後の計測: 11,850,740 B / 3,263,486 B (床と天井の**単位**を揃えた分で**両方 +216 B** —— 「12 文字以上」と 9 か所で述べるマスターパスワードの関門が `password.length` (コード単位) を数えており、`'😀'.repeat(6)` (**実文字数 6**) で満たせていた。`atLeastChars` / `moreThanChars` は **n 文字目で切り上げる** (上限は*拒むために*在るので 100 MB を辿ってはいけない)。下限の規則の写し 2 つは式ごと `meetsPasswordPolicy` へ寄せたので規則は 1 つになった。走査 `ceilingUnitCensus` と対照は出荷物に入らない)・2026-09-14 パス 248 後の計測: 11,850,524 B / 3,263,270 B (パス 249 は検査と文書だけなので **byte 単位で不変**。main の Ollama 許可表を共有台帳 `OLLAMA_READ_PATHS` から**組み立てる**ようにし (手写しの 3 経路をやめた)、Atlassian の欄の天井 3 つを `shared/atlassianSite.ts` へ移して**両ビルドが読む**ようにした分で**両方 +56 B** —— ブラウザ版は token と site に天井が無く、main 側にはその理由 (`btoa` の多バイト文字列) まで書かれていた。ゲート `lint:shared-judgement` と検査・対照は出荷物に入らない。パス 247 は文書だけなので byte 単位で不変だった)・2026-09-14 パス 246 後の計測: 11,850,468 B / 3,263,214 B (デスクトップ版の `getValidToken` が壊れた TokenSet を**生の JSON のまま Bearer として返していた**のを断るようにし (`reason: 'broken-token-set'`)、断りの文面を `brokenStoredCredentialMessage` 1 つに寄せた分で**両方 +29 B** —— `Authorization: Bearer {"refreshToken":"…"}` が相手先 API へ出ていた。呼び出し側の変更は 0 行 (断る器は最初から在った)。実測と対照は検査なので出荷物に入らない)・2026-09-14 パス 245 後の計測: 11,850,439 B / 3,263,185 B (制御文字の規則を `shared/tokenInput.ts` の `hasControlChars` 1 つに切り出し、**両ビルドの保管層** (`vault.setToken` / `secrets.setToken`) に床として置いた分で**両方 +72 B** —— 入口の関門を通らない書き込みが 2 本残っていた (`setOAuthTokens` は IPC ハンドラを経由せず、Google トークン 4 本は保管庫を直接叩く)。**床は JSON の包みの中を見られない**ので、包む側の断りは別に要る)・2026-09-14 パス 244 後の計測: 11,850,367 B / 3,263,113 B (資格情報の入口 2 本を共有の `checkTokenInput` へ通し、`redact.ts` に「ヘッダ名を持たない引用」の規則を 1 本足した分で**両方 +337 B** —— プラットフォームの例外文面 (`Headers.append: "<値>" is an invalid header value.`) は ヘッダ名を含まないので、接頭辞を持たない鍵 (HIBP / VirusTotal の 64 桁 16 進) が丸ごと画面へ出ていた。実測の 10 経路と `<input>` の CR/LF 消毒の境目は検査なので出荷物に入らない)・2026-09-14 パス 240 後の計測: 11,850,030 B / 3,262,776 B (保存済みソルトの床を凍結値 `MIN_STORED_SALT_BYTES` へ分け、生成の `SALT_BYTES = MIN_SALT_BYTES` は残した分で**両方 +8 B** —— 直したのは主に注記の置き場所(危険は使う側に書かれていて、上げる編集をする宣言行には書かれていなかった)。原文の検査は出荷物に入らない)・パス 239 後の計測: 11,850,022 B / 3,262,768 B (封緘した物が自分を作った PBKDF2 の反復回数を覚える —— 凍結値 `LEGACY_KDF_ITERATIONS`・`VaultMeta.recoveryIterations`・`EncryptionMeta.iterations` と `deriveKeyFromMnemonic` / `createPassphraseRecordCipher` の引数化で**両方 +176 B**。`recoverWithMnemonic` が導出に使った回数を書き残していなかった 1 行がこの中で最も重い)・パス 236〜237 後も 11,849,846 B / 3,262,592 B で **byte 単位で不変** (236 は文書だけ。237 の `deriveAesKey` の床 2 行は**出荷物に入らない関数の中**に在る —— レコード封緘の書き込み・解錠の経路はまるごと tree-shaking で落ちており、出荷 HTML に `暗号化は既に有効です` / `レコードは平文に戻しましたが` は 0 件)・2026-09-14 パス 235 後の計測: 11,849,846 B / 3,262,592 B (`shared/lookup.ts` の `lookup` / `has` と 6 つの引き手の配線・`requiredPermissionFor` の `| null` 化と `UNKNOWN_CAPABILITY_PERMISSION` で**両方 +141 B** —— prototype の鍵を `Object.hasOwn` で落とす床。総当たりのゲートは検査なので出荷物に入らない)・パス 232〜234 後は 11,849,705 B / 3,262,451 B で byte 単位で不変 (検査・文書・コメントだけ。最小化でコメントは落ちる)・2026-09-14 パス 231 後の計測: 11,849,705 B / 3,262,451 B (`redact.ts` に発行元の分かる接頭辞を 11 形足した分で**両方 +432 B** —— `github_pat_` (GitHub 細粒度 PAT) / `ntn_` (Notion) / `1//` (Google 更新トークン) / JWT (microsoft-365) の 4 家系は**今日預かっているサービス**の鍵で、裸で本文に現れると素通りしていた。台帳の母集団を `SERVICE_CREDENTIAL_USE` へ移した census は検査なので出荷物に入らない)・パス 229 後は 11,849,273 B / 3,262,019 B (率の非有限の床を `shared/formatters.ts` の `pct` / `pctOrDash` に 1 つ置き、4 つの写し —— `num.ts` の `ratioPctOrDash`・経営サマリー 2 つ・不動産 1 つ —— を通した分で**両方 +26 B**。`digits` を省くと丸めないので**刷る字は 1 文字も変わらない**。走査の絶対の主張と印の標本は検査なので出荷物に入らない)・パス 228 後は 11,849,247 B / 3,261,993 B (要件を外れた食事補助を給与課税の現物給与として**計算に入れ直す** `taxableInKind` と比較表の行・断りの書き換えで**両方 +325 B** —— 要件を満たしていれば 0 なので、そのときの数字はパス 228 より前と完全に一致する)・パス 227 後は 11,848,922 B / 3,261,668 B (既定の帯へ倒した軸を名指しする `defaultBandAxes` / `defaultBandNote` と診断カードの ⚠️ で**両方 +1,046 B** —— 倒し込み自体は残す)・パス 226 後は 11,847,876 B / 3,260,622 B (年初来リターンの下限 `RETURN_FLOOR_PCT` = 事実 と、集約・改善提案・一覧の 3 面の断りで**両方 +1,675 B** —— 上端 (書き手の 1000%) は打ち間違いの門なので読む側では落とさない)・パス 225 後は 11,846,201 B / 3,258,947 B (期が読める行だけを通す漏斗 `readablePeriodRows` と 2 つの断り文・3 面の配線で**両方 +1,074 B**)・パス 224 後は 11,845,127 B / 3,257,873 B (書き手が断る「欄と欄」7 件 —— 貸借対照表の内数 ≦ 親項目 5 件・人件費 ≦ 販管費・連続下落 危険 ≧ 警告 —— を `RECORD_RELATIONS` へ移し、書き手 3 つが台帳を読む分で**両方 +989 B**。走査を綴りから振る舞い (借用) へ移した検査は出荷物に入らない)・パス 223 後は 11,844,138 B / 3,256,884 B (記録の欄と欄の関係を 1 か所に置く `recordRelations.ts` を、画面の入口と復元の入口の両方が読む分で**両方 +873 B**)・パス 222 後は 11,843,265 B / 3,256,011 B (等しくてはならない組 `PARAMETER_DISTINCT` と画面の断りで**両方 +696 B** —— 軸の一覧は `RADAR_AXIS_KEYS` から導くので 15 軸ぶんの写しは出荷物に入らない)・パス 221 後は 11,842,569 B / 3,255,315 B (台帳の欄と欄の順序を見る `parameterOrder.ts`・画面の断り・法人事業税の段を使う前に昇順へ畳む `orderedBusinessTaxLimits` で**両方 +2,623 B**。パス 220 は検査と文書だけなので byte 単位で不変だった)・パス 219 後は 11,839,946 B / 3,252,692 B (食事補助の非課税要件の判定 `mealSubsidyVerdict` と画面の ⛔ で両方 +1,296 B)・パス 218 後は 11,838,650 B / 3,251,396 B (`maxEmployeeSocialInsurance` と社会保険料の ⚠️ の基準で両方 +214 B)・パス 217 後は 11,838,436 B / 3,251,182 B (iDeCo の法定上限 `IDECO_ANNUAL_CAP_MAX` と関門の `max` 2 件・選択肢の断りで両方 +114 B)・パス 216 後は 11,838,322 B / 3,251,068 B (工場プランの 2 欄を素の `<input>` から `GuardedNumber` に替えた分で**両方 -106 B** —— 宣言を表に寄せたので JSX の重複が減った)・パス 215 後は 11,838,428 B / 3,251,174 B (物件フォームの宣言を書き手の隣へ移した分で両方 +133 B —— 一致の検査は出荷物に入らない)・パス 214 後は 11,838,295 B / 3,251,041 B (⛔ の欄が在れば保存しない `saveRefusalNote` と水耕栽培の設備・費用の門で両方 +310 B)・パス 213 後は 11,837,985 B / 3,250,731 B (人材の給与計算 `PAYROLL_READS` 3 段と `data-live-clock` の印で両方 +466 B —— 走査の一般化 `readings()` は検査なので出荷物には入らない)・パス 212 後は 11,837,519 B / 3,250,265 B (貿易の金額 7 欄の `TRADE_SPECS` / `TRADE_READS` と段ごとの断り・輸出の「日本の事実」を別の段に切り出した分で両方 +762 B)・パス 211 後は 11,836,757 B / 3,249,503 B (投資信託の `MF_REFUSAL_SPECS` を 3→12 欄・`MF_READS` を 2→6 段に広げ、予備資金を独立の段に切り出した分で両方 +889 B)・パス 210 後は 11,835,868 B / 3,248,614 B (水循環プランナーの `WC_SPECS` 10 欄 + `WC_READS` 5 段と段ごとの断りで両方 +1,308 B —— 常設ゲート `guardedJudgements.test.ts` は検査なので出荷物には入らない)・パス 209 後は 11,834,560 B / 3,247,306 B (⛔ の「マイナスの値」を段ごとに断る共有の `refusedFields` / `refusalLabels` / `refusalNote` と `RefusedFieldsNote` で両方 +1,484 B —— パス 206 の断りを部品に畳んだので、不動産 4 段 + 投資信託 2 段を足しても増分はこれだけ)・パス 208 後は 11,833,076 B / 3,245,822 B (貿易の率の天井 `MAX_TRADE_RATE` と段ごとの `null` で両方 +816 B)・パス 207 後は 11,832,260 B / 3,245,006 B (率の天井 `MAX_PLAN_RATE_PCT` / `MAX_COST_RATE_PCT` と断り 5 本で両方 +2,419 B)・パス 206 後は 11,829,841 B / 3,242,587 B (都市計画の判定を段ごとに断る `ZONING_READS` / `ZoningRefusal` で両方 +1,722 B)・パス 205 後は 11,828,119 B / 3,240,865 B (財務分析の漏斗 `saneMonthlyKpi` ほか 6 件で両方 +193 B)・パス 204 後は 11,827,926 B / 3,240,672 B (非有限の入口 43 件の消毒・年分の漏斗 `resolveTaxYear`・符号を残す `finiteOr0` で両方 +784 B)・パス 203 後は 11,827,142 B / 3,239,888 B (非有限の入口 14 件を契約どおりに倒した分)・パス 202 後は 11,826,879 B / 3,239,625 B (比較だけの関門 1 件を `nonNeg` に通した分で両方 +20 B)・パス 201 後は 11,826,859 B / 3,239,605 B (消毒の綴り 5 通りを共有の `nonNeg` 1 つに畳んだ分で**両方 -799 B**)・パス 200 後は 11,827,658 B / 3,240,404 B (日付の組み立ての漏斗 `utcMsFromParts` で両方 +102 B)・パス 199 後は 11,827,556 B / 3,240,302 B (課税期間の範囲の関門と画面の断りで両方 +849 B)・パス 198 後は 11,826,707 B / 3,239,453 B (年数の天井 2 つと `jpy` の床・画面の断りで両方 +1,530 B)・パス 197 後は 11,825,177 B / 3,237,923 B (`maxLength` を 16 欄から外し関門を 4 つ足した分で両方 +1,797 B)・パス 196 後は 11,823,380 B / 3,236,126 B (両方 +72 B)・パス 195 後は 11,823,308 B / 3,236,054 B (両方 -29 B)・パス 194 後は 11,823,337 B / 3,236,083 B (**水耕栽培の運転管理 1 サービス分で 両方 +42,223 B** —— 共有の判定・調製・日程と画面 1 枚ぶん。学術コーパスに依らないので LITE も同じだけ増える)・パス 193 後は 11,781,114 B / 3,193,860 B・パス 192 後は 11,780,315 B / 3,193,061 B・パス 191 後は 11,780,034 B / 3,192,780 B・パス 190 後は 11,779,996 B / 3,192,742 B)。天井は CI が両方に掛けている: 16 MB / 4 MB、85% で警告。パス 189 後は 11,778,832 B / 3,191,576 B・パス 188 後は 11,776,126 B / 3,188,874 B・パス 187 後は 11,774,564 B / 3,187,312 B・パス 186 後は 11,771,487 B / 3,184,235 B・パス 185 後は 11,771,393 B / 3,184,141 B・パス 184 後は 11,770,727 B / 3,183,475 B (パス 183 から**両方が 5,168 B 減った** —— テンプレートの SVG の組み立てが 3 写しから 1 つになった分)・パス 183 後は 11,775,895 B / 3,188,643 B・パス 182 後は 11,774,254 B / 3,187,002 B・パス 181 後は 11,765,766 B / 3,178,512 B・前日 2026-09-11 は 11,752,227 B / 3,164,973 B。LITE は 85% の警告線 3.4 MB (CI は 3,400,000 B で見る) まで残り約 160 KB) that runs in any browser with no Node/Electron. See `docs/BROWSER_REDESIGN.md`.

Each service page starts from a static snapshot in `src/renderer/data/snapshot.ts` and can swap to a
live REST fetch. The `useServiceData(serviceId, snapshot)` hook returns `data`, `source`
(`'snapshot'` | `'live'`), `status`, `errorMessage`, and `refresh()`.

All verified (sourced) knowledge datasets — academic concepts (`academicKnowledge.ts`), tax/labor/legal
compliance (`complianceKnowledge.ts`), subsidies (`subsidyKnowledge.ts`), support hotlines
(`counselorKnowledge.ts`), and economic history (`economicHistoryKnowledge.ts`) — are the single source
of truth for an **Obsidian knowledge vault** (`knowledge-vault/`, 7,000+ notes, `npm run vault:build`)
and are injected as context into the AI-orchestration runtime per executive role
(`orchestration/knowledge-map.json`, `orchestration/knowledge-context.cjs`, `npm run orchestrate:context`
/ dispatch). `vault:check` (in `verify:all`/CI) enforces vault sync, forbids duplicate ids
(`node scripts/dedupe-knowledge.cjs` consolidates), and fails when the concept table in
`docs/ACADEMIC_KNOWLEDGE.md` is stale — that table is **generated** from the corpus by
`npm run knowledge:md` (never hand-edit rows; 2026-09-05 実測で手書き表は本体と 942 行／909 項目ずれていた).
See `docs/KNOWLEDGE_VAULT.md`.

## Commands

```bash
npm install              # install deps
npm run dev              # Vite + Electron, hot reload (desktop dev)
npm run build:web        # → dist/standalone.html (browser build; runs inline-html.cjs)
npm run build:web:lite   # → dist/standalone-lite.html (~2MB モバイル版・学術コーパス非搭載)
npm run e2e              # Playwright 実機 E2E (desktop/phone/tablet)。e2e:lite で LITE 版を検証
npm run perf             # 起動性能ゲート (実 chromium)。起動時の巨大 JSON.parse を検出。
                         #   フル版と LITE 版の**両方**が要る。vite の emptyOutDir が dist/ を掃除するので
                         #   `build:web && build:web:lite` と続けると**フル版が消えて perf が落ちる** ——
                         #   フル版を退避してから lite を作ること (e2e.yml がその順序を持っている)。
                         #   `build:renderer` も vite なので、走らせるならブラウザ版より**前に**
npm run e2e:ollama       # Ollama 連携 E2E (スタブ Ollama + 実 chromium)。未起動/CORS未許可/接続成功の3状態
npm run ollama           # Ollama CLI (ブラウザ不要・CORS 無縁)。`-- chat <model> "..."` で対話
npm run ollama:setup     # 導入→モデル取得→起動→1往復して確認。足りない段だけ埋める
                         #   `-- --check` で現状確認のみ / `-- --origin <URL>` でブラウザ許可も案内
npm run build:renderer   # tsc -b + vite build only (no packaging)
npm run build            # full desktop build: tsc -b, vite build, electron-builder installers
npm run typecheck        # tsc -b --noEmit --force (uses tsconfig project references)
npm test                 # vitest run (src/**/__tests__/ 。件数は docs/ARCHITECTURE.md の表が持つ
                         #   — 数を 2 か所に書くと必ず食い違うので、ここには書かない)
npm run test:watch       # vitest watch mode
npm run lint             # eslint . --max-warnings 0 (flat config in eslint.config.js, ESLint 9 + typescript-eslint)
npm run smoke            # xvfb + Electron screenshot smoke test of every page
npm run smoke:app        # 実物の `electron .` を起動して 8 秒生きているか
                         #   (主プロセス dist-electron/main.js を通す唯一の検査)
npm run scaffold -- <id> "<Label>" <ICON> [bearer|oauth|json]   # generate a new service end-to-end
```

Run a single test: `npx vitest run path/to/file.test.ts`, or filter by name: `npx vitest run -t "pattern"`.
Vitest config is in `vitest.config.ts` (node environment).

### Custom quality gates (all run in CI — keep them green)

```bash
npm run verify:arch        # docs/ARCHITECTURE.md file:line refs + live metrics must match reality
npm run lint:imports       # main / preload / renderer import-boundary enforcement
npm run lint:forbidden     # forbidden patterns (nodeIntegration: true / contextIsolation: false /
                           #   sandbox: false / webSecurity: false / eval / innerHTML ほか 38 種)
npm run lint:workflow-security # .github/workflows/: permissions の明示・第三者 action の SHA 固定・
                           #   pull_request_target 禁止・run: への信用できない値の埋め込み
npm run lint:network-targets # 送り先ホストが変数で決まる通信の台帳 (資格情報の流出経路)
npm run lint:docs          # cross-document consistency
npm run lint:citations     # 出典の内部矛盾 (同一 DOI が別々の出版年・別々の著作で引かれていないか)、
                           #   種別の偽装 (雑誌・ブログ・百科事典の URL に 'academic' が付いていないか)、
                           #   同じ URL は同じ種別 (項目ごとに 'academic' / 'media' が揺れていないか)
npm run lint:doi-prefix    # DOI プレフィックス(=登録機関=出版社) とラベルの出版社の矛盾。
                           #   ISSN を埋め込む DOI (APA / Elsevier PII / Wiley j. / SAGE) は台帳 164 誌で、誌の略号を
                           #   持つ DOI (INFORMS / Oxford / Wiley / Springer / Annual Reviews / MIT / Emerald) は
                           #   台帳 153 誌で誌名も照合し、ISSN の検査数字も検算する (1 回しか引かれない誤 DOI を拾う)
npm run lint:charset       # 他文字種・簡体字の混入 (CJK は共有ブロックなので字を列挙するしかない)
npm run lint:knowledge-refs # 裁定台帳が実在しない知識 id を参照していないか
npm run lint:test-coverage # サービスごとに `<id>.test.ts` が在り、**登録済みの action が
                           #   すべてその中でクォート付きで現れる**こと。加えて `LIVE_ACTIONS` の
                           #   各項はクライアントの `ACTIONS` を指す識別子ただ 1 つで (index.ts に
                           #   直書きした action は検査を素通りする)、`ACTIONS` を export する
                           #   クライアントは全部 `LIVE_ACTIONS` に載る (逆向き)。
                           #   **action を持たないサービスは許される** —— 2026-09-15 実測で
                           #   **76 のうち 48 が action を 1 つも登録していない** (ゲートの
                           #   self-test にも「テストはあるが action 0 件 → 0 件鳴る」が在る)。
                           #   2026-09-15 まで、この行は「every service must have a test +
                           #   an action registered」と書かれていた —— **後半は偽**で、
                           #   死んだ action を消せない理由として実際に私が引用した (パス 275)
npm run lint:csp           # 出荷 HTML の CSP を**実物**に当てる (self-test のみ verify:all。
                           #   成果物への適用は ci.yml が inject-pwa 適用後に行う)。
                           #   雛形側 (index.html / inline-html.cjs の buildCsp) は
                           #   `shared/__tests__/shippedCsp.test.ts` が既に留めている ——
                           #   こちらが見るのは **注入後の公開ファイル** と landing / デモ 3 本
npm run lint:deps          # 依存の供給網 (本番依存の閉包 5 件 / インストール時コード 3 件 /
                           #   **セキュリティの床 4 件** の台帳・取得元は registry のみ・integrity 必須。
                           #   本番依存は単一 HTML へ畳み込まれ保管庫と同じオリジンで走るので、
                           #   増やすなら理由を書く。床は「上流が直るまで自分で押さえている版」で、
                           #   道 (overrides / devDependencies の範囲) を問わず 1 つの台帳に載せ、
                           #   宣言の消失・指定の緩み・lockfile の解決版 (入れ子の複製も) を見る。
                           #   **床が今日の勧告にまだ十分かは網が要る** → `npm run audit:floors`
                           #   (CI では走らせない。定期点検の道具)
npm run lint:storage       # ブラウザに残す物の台帳 (IndexedDB 4 / Cache Storage 1 /
                           #   localStorage 21 / sessionStorage 4。cookie と OPFS は 0 件だが走査はする)。
                           #   新しい保存先が黙って増えないこと・バックアップが覆うのは 1 つだけ・
                           #   **媒体そのものが `docs/DATA_PROTECTION.md` の在庫に載っていること**・
                           #   **ハードリセット (すべてのデータを削除) が台帳の全行を覆うこと** (規則 11、パス 136)
npm run lint:shell         # scripts/*.sh: bash -n syntax + strict mode (set -euo pipefail)
npm run lint:mutation-scope # 変異検査の「測っていない範囲」の台帳 (広い Stryker disable と、
                           #   **理由が書かれていない pragma** —— 無言の pragma はその行の変異体を
                           #   消すので、測っていない範囲が「100%」として報告される)
npm run lint:regex         # 正規表現の破滅的バックトラック (ReDoS) を実測。worker + 番犬つき
                           #   (モデル応答を解析する assistantMarkdown.ts が主眼。指数のみ)
npm run lint:parameter-prose # 画面が刷る数字と、計算に使う数字の出所が同じか
                           #   (`parameters.ts` の台帳で上書きできる 115 の定数について、
                           #   renderer が既定定数を**直接**刷っていないか。上書きすると
                           #   「効いているのに画面が古い数字で説明する」形になる。
                           #   倒し込み (`??` / 既定引数 / `=== 既定`) は規則の外・
                           #   それ以外の直接使用は台帳に理由つきで登録する)
npm run lint:zero-fold     # 「割れない値を 0 に倒す」箇所の**母集団**を数え、
                           #   `docs/REMAINING_WORK.md` の生成ブロックと突き合わせる
                           #   (`? … : 0` / `?? 0` / `|| 0`。コメントと文字列は落とす)。
                           #   **これは分母であって欠陥の一覧ではない** —— 正しい 0
                           #   (0 除算の防御・明示的な費用 0・作図の座標) と本物の欠陥の
                           #   両方を含み、どちらかは読まないと決まらない。数は機械が、
                           #   判断は散文が持つ。2026-09-08 まで件数は手で書かれ誰も検算せず、
                           #   母集団が 26 ファイル (実測 106) と 4 倍ずれていた
npm run lint:shared-judgement # 「述語は共有したが、no と言われたあとの動作が両ビルドで
                           #   違う」の**母集団**を数え、`docs/REMAINING_WORK.md` の
                           #   生成ブロックと突き合わせる (shared 138 / 両ビルドが
                           #   import 44 / うち否定で答えられる 21)。判定の台帳は
                           #   **両方向**に鳴る —— 母集団に入ったのに台帳に無ければ落ち、
                           #   台帳に在るのに母集団から消えても落ちる。
                           #   **これも分母であって欠陥の一覧ではない** —— 対称な物・
                           #   意図した非対称・本物の欠陥 (パス 246 の vaultToken) が
                           #   混ざる。読んでいない物に「対称だろう」とは書かない
npm run verify:all         # typecheck + all of the above + eslint (37 ゲート)
                           #   **`npm test` は含まない。** CI は両方走らせるので、
                           #   push 前は `npm test && npm run verify:all` の両方を回すこと
                           #   (verify:all だけを見て「全 green」と言うと CI で落ちる)
npm run mutate             # Stryker mutation testing (target: 100%); mutate:triage / mutate:next help
npm run knowledge:auto     # knowledge autopilot: audit → regen (vault+NotebookLM) → verify → work queue
npm run knowledge:md       # docs/ACADEMIC_KNOWLEDGE.md の概念表を academicKnowledge.ts から再生成
                           #   (表は生成物 — 手で行を書かない。vault:check が「再生成 == committed」を検証)
                           #   (weekly CI: knowledge-auto.yml; consume queue per docs/KNOWLEDGE_AUTOPILOT.md)
```

These are plain Node scripts in `scripts/` — there is no AST parser dependency; they grep marker
comments and source. `verify:arch` will fail if you change architecture without updating
`docs/ARCHITECTURE.md`. CI (`.github/workflows/ci.yml`) runs a single consolidated job on push to
`main` and PRs to `main` (one `npm ci`, then typecheck + **all 37 `verify:all` gates**, vitest +
coverage, and `build:web` asserting `dist/standalone.html` is generated and non-trivial) — collapsed
from 3 jobs
to 1 to minimize GitHub Actions minutes on the free tier. **`lint:docs` enforces that every gate in
`verify:all` actually appears in `ci.yml`** — adding a gate without wiring it into CI leaves it
existing but guarding nothing, which is exactly what happened to `lint:citations`,
`lint:knowledge-refs` and `verify:knowledge` (the provenance gate) until 2026-07-30.
`.github/workflows/release.yml` builds Mac/Win/Linux installers on `v*` tags;
`dependency-audit.yml` runs **weekly** (Mon 07:00 JST) — `npm audit` (全体 / prod) +
`audit:floors` を突き合わせ、要対応を常設 Issue 1 つに集める。**PR の門は狭いまま**
(`--omit=dev --audit-level=high`) で、狭くした外側 (dev の勧告・床の古び) を週次が受け持つ。
予定実行なので誰の PR も赤くしない;
`mutation.yml` runs Stryker (weekly + on pushes to `main` that touch `stryker.config.json`,
`vitest.config.ts`, `src/main/clients/**` or `src/main/oauth.ts`). `e2e` / `e2e:lite` / `perf` / `smoke:app` **are** wired into `.github/workflows/e2e.yml`, but it does **not run by
default** (Actions 分の節約): trigger it from the Actions tab (`workflow_dispatch`) or by putting the
**`run-e2e` label** on a PR. `e2e:ollama` / `smoke` are **not** in CI at all.
`smoke:app` は 2026-08-26 に足した —— **実物の `electron .` を起動する唯一の検査**で、
それまで誰も主プロセスを通しておらず、`dist-electron/main.js` は 2 週間ほど起動不能なまま
全 CI が緑だった (`scripts/smoke-app.cjs` の冒頭に経緯)。 All of them need a real
browser or Electron — run them locally before shipping renderer or startup-performance changes.

## Architecture

Three TypeScript build contexts, kept separate via `tsconfig` project references:

- **`src/main/`** — Electron main process. `main.ts` creates the `BrowserWindow` and registers IPC
  handlers (`app:*`, `secrets:*`, `fetch:snapshot`, action invoke). `secrets.ts` persists tokens in
  the Electron `userData` dir, encrypted with `safeStorage` when the OS keychain is available
  (base64 fallback so Linux dev without a keychain still works). `oauth.ts` implements a real OAuth
  2.0 Authorization-Code + PKCE flow via a loopback `127.0.0.1` HTTP server (RFC 7636 / 8252); pure
  helpers (PKCE gen, URL building, token-request body) are exported for unit tests. Live REST clients
  live under `src/main/clients/`.
- **`src/preload/`** — Context-isolated preload exposing a typed `window.serviceHub` bridge via
  `contextBridge.exposeInMainWorld`. The bridge type is re-declared globally in
  `src/shared/bridge.d.ts` so the renderer calls it without imports.
- **`src/renderer/`** — React app. `App.tsx` renders the category-grouped sidebar from `SERVICES`
  (`services.ts`) and mounts the active page inside `components/PageErrorBoundary.tsx` (a render
  error stays inside that page's frame; the sidebar keeps working). The renderer never sees raw tokens — it only calls
  `serviceHub.setToken / clearToken / listConfigured / fetchSnapshot / invoke / openExternal`.

### The single source of truth for services

`src/shared/serviceId.ts` exports the `SERVICE_IDS` array and `ServiceId` union — **this is the one
true list**, imported by `services.ts` (sidebar), `clients/index.ts` (fetchers), and the preload
bridge. Three parallel maps in `src/main/clients/index.ts` are keyed by `ServiceId`:

- `LIVE_FETCHERS` — a **total** `Record<ServiceId, fetcher>`. A runtime invariant at module load
  throws if any `ServiceId` is missing an entry, so a forgotten service crashes loudly at app start
  rather than on first click. Note: many entries are static stubs (investment, 士業, food delivery)
  that just satisfy the invariant and return `SNAPSHOT[id]` directly — only the SaaS clients do real
  network I/O.
- `LOCAL_SERVICES` — services whose fetcher reads local resources and needs no saved credentials
  (a missing token is not an error for these).
- `LIVE_ACTIONS` — `Partial<Record<ServiceId, ActionMap>>` of write-side actions, invoked from the
  renderer via `serviceHub.invoke()`.

### Adding a service

**Use the scaffolder** — don't wire services by hand:

```bash
npm run scaffold -- <id> "<Label>" <ICON> [bearer|oauth|json]
```

It creates the client + test + page and patches `serviceId.ts`, `clients/index.ts`, `services.ts`,
and `snapshot.ts` by inserting at `// SCAFFOLD:ADD_*` marker comments. `auth-kind`: `bearer` (PAT/API
token → `Authorization: Bearer`), `oauth` (OAuth access token, same wire as bearer), `json`
(`{email,token,site}` Basic auth, e.g. Atlassian). Then fill the TODOs in the generated client, run
`npm run typecheck && npm test`, and `git checkout` the patched files to undo. Full guide:
`docs/ADDING_A_SERVICE.md`.

### Page composition

Each service page calls `useServiceData(id, SNAPSHOT[id])` and renders with the shared
`components/StatusBar.tsx` (unified refresh button + optional `tokenSetup` credential slot) +
`Section` + `components/DataList.tsx` (cards with thumbnail / meta / badge / open-external). Keep
pages declarative — if a visual primitive is needed by more than one page, add it under `components/`.

### Live fetcher contract

A fetcher takes `{ token, fetch? }` and returns a value with the same shape as `SNAPSHOT[id]`.
`fetch` is injectable so fetchers are unit-testable under Node without a network. See
`src/main/clients/github.ts` and its `__tests__/github.test.ts` (mock with `vi.fn<typeof fetch>()`).

### API clients (`src/shared/api/*.ts`)

Framework-agnostic classes implementing `ServiceClient` (`id`, `isConfigured()`). Credentialed
methods must guard with `if (!this.isConfigured()) throw new NotConfiguredError(this.id);` before any
network call, so they can run from either the renderer or main depending on whether the token must
stay out of the renderer.

### Browser standalone layer (`build:web`)

The browser target adds: `web-shim.ts` (a `window.serviceHub` polyfill imported first in `main.tsx`),
`web-templates.ts`, and a client-side security/storage stack under `src/renderer/`:

- `security/vault.ts` — WebCrypto AES-GCM-256 with a PBKDF2-SHA-256 (600k iter) key derived from the
  master password; key is `extractable: false`, memory-only. `LockScreen.tsx` + `autoLock.ts` lock on
  tab-hidden / idle.
- `library/library.ts` — IndexedDB blob store. `fs/fsa.ts` — File System Access API wrapper.
- `network/proxy.ts` — routes CORS-blocked APIs (Notion / Atlassian / Cloudflare) through a
  user-supplied Cloudflare Worker (`docs/PROXY_EXAMPLE.md`). `oauth/pkce.ts` — out-of-band paste PKCE
  for `file://`.

`scripts/inline-html.cjs` inlines CSS/JS into `dist/standalone.html`. Vite (`vite.config.ts`) has
`root: 'src/renderer'`, renderer build → repo-root `dist/`, Electron bundles → `dist-electron/`
(both gitignored).

## Conventions

- `window.serviceHub` is the **only** sanctioned way to call into the main process. Do not add
  `nodeIntegration: true` or remove `contextIsolation` — extend the preload bridge instead
  (`lint:forbidden` enforces this).
- External links must go through `window.serviceHub.openExternal(url)` (→ `shell.openExternal`), never
  `window.open`, so the OS browser handles them.
- Add new service IDs to `SERVICE_IDS` in `src/shared/serviceId.ts` (not `services.ts`) — the type
  system then flags every dependent switch/lookup, and prefer `npm run scaffold` over manual edits.
- **計算に使う固定の数字 (法定値・参考値・しきい値・前提) は `src/shared/parameters.ts` の台帳に登録し、
  画面は `useParameters()` で読んで関数へ引数で渡す。** 既定値はモジュールの定数をそのまま参照する
  (数字を写さない)。登録した値は**必ず配線し、`parameterWiring.test.ts` で「上書きすると画面が動く」を
  対照つきで留める** — 「設定できるのに効かない」項目を作らない。安全上限 (timeout / 応答サイズ /
  PBKDF2 反復 / 入力長) は台帳に載せない。
- When you change architecture, update `docs/ARCHITECTURE.md` too — `verify:arch` checks its
  `file:line` references and metrics against the real tree.
- **不在を主張する検査には、標本を添える。** `not.toMatch(/…/)` や
  `!body.includes('…')` は、綴りが 1 つ違えば黙る — どの入力でも通る空の検査になる。
  規則が**実際にその文面へ当たる**ことを、同じテストの中で標本に対して確かめること
  (2026-08-25 に 2 件やらかした。どちらも「記憶の言い換え」に対して正規表現を書いていた)。
  肯定形で書けるならそのほうが安全 — **有ることの検査は、無ければ必ず鳴る**。
- **対照を回すまで、検査は信用しない。** 守っている物を実際に壊し、狙った項目が
  落ちることを見る。**鳴らない対照は「合格」ではなく「その検査についての報せ」である。**

## Branching

Active development for Claude Code sessions happens on the branch designated in the task prompt
(e.g. `claude/claude-md-docs-qqUAT`). The default branch is `main`.
