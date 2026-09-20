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
   file (実測 11.37 MiB full / 3.18 MiB `build:web:lite` mobile variant — **2026-09-20 パス 337 後も 11,930,723 B / 3,343,244 B で byte 単位で不変** (直したのは `scripts/` の説明文と新しい定期点検の道具・`src/shared/ontology/laws.ts`・検査 1 本だけ —— **オントロジーは出荷物に入らない** (読むのは検査と生成 script だけなので tree-shaking で丸ごと落ちる) し、`scripts/` と `__tests__/` も入らない。**両方を組んで実測した**。見つけたのは「門が意図して外した物の**理由**が実測と食い違っていたこと」 —— 結論は正しいが premise が偽で、次に式を足す人はその偽の premise から判断することになる)・**2026-09-20 パス 336 後の計測: 11,930,723 B / 3,343,244 B (両方 +18 B** —— **「分かる人が決めること」と書いたまま 1 か月近く残っていた 2 つの判断を、実測して決めた分**。増分が 18 B しか無いのは、どちらも**数字を 1 か所へ移しただけ**で新しいコードがほとんど無いため。① `MAX_RESPONSE_BYTES` が main 10 MiB / ブラウザ版 2 MiB に割れていた —— `shared/httpLimits.ts` の `MAX_OLLAMA_RESPONSE_BYTES` = **2 MiB** へ揃えた。決め手は実測で、`capAssistantReply` が 10 万字で切るので**アプリが使える最大の本文は `/api/chat` の封筒で 600,124 B** (全部が `\uXXXX` へ縮退する最悪。日本語なら 300,124 B)・`/api/tags` は 1 件 365 B で 2 MiB に **5,745 モデル**入る —— つまり 2 MiB でも最悪に対して **3.49 倍**の余裕が在り、10 MiB との差は「**捨てる物をどれだけ確保するか**」でしかなかった。小さい側へ揃えるのは、そこが「落ちればタブではなく**アプリ全体**が落ちる」main プロセスだからである (`clients/ollama.ts` 自身の注記)。画面の「セキュリティポリシー」欄の**デスクトップ版 10 MB だけが直書き**だったのも同時に直した (ブラウザ版の数字は定数から出ていた)。② `generatePkce` の乱数 byte 数が main verifier 32B / state 16B・renderer verifier 64B / state 32B と割れていた —— `shared/cryptoParams.ts` の `PKCE_VERIFIER_BYTES` / `OAUTH_STATE_BYTES` = **どちらも 32** へ。verifier は RFC 7636 §7.1 が 32-octet を **RECOMMENDED** で名指ししており、`S256` の challenge から verifier を求める難しさは **SHA-256 の原像計算 (256 bit)** で頭打ちなので、**64 octet は 1 bit も強くしない**。state の 16 B は床 (128 bit) **ちょうど**だったので 1 段上げた。**欠陥は「保留を検査に書いていたこと」** —— `ollamaInputLimits.test.ts` は「この検査は**揃えることを要求しない**」と明記し、両ビルド台帳の `why` にも「分かる人が決めること」と書いてあった。理由の欄が埋まるので検査は通り続け、**2026-08-23 から 2026-09-20 まで誰も決めなかった**。機械を足した: 台帳の `why` に**保留の決まり文句を置けない** (`dualBuildDecisions`・両方向・標本と対照つき)。法則 `no-weakness-as-spec` はこれで prose だけの法則ではなくなった (5 本 → 4 本)。`shared` は両ビルドが読むので LITE も同じだけ増える)・**2026-09-20 パス 335 後の計測: 11,930,705 B / 3,343,226 B (両方 +198 B** —— チームレーダーの取り込みに「これは利用者が保存した物か」の門 1 行を足し、読めなかったときの注記の 「見本を表示しています。」を shared の文から**画面**へ移した分 (`startedFromDraft` と `data-stored-fallback` の 2 文)。**欠陥は「見本が利用者の保管場所へ書き戻る」こと**: 画面は ①`data` が変わったら編集状態を揃える ②編集状態が変わったら `servicehub.teamradar.draft.v1` へ書く、の 2 つの効果を持ち、①に判定が無かったので**保存値が読めない / まだ無いときに返る飾りの見本が①を通って②へ流れ**、利用者が何も押していないのに端末の編集内容が消えていた。実測 (jsdom・下書きに 1 名入れて「更新」1 回): `saved` → 保存した物になる (筋が通る) / `none` と `unreadable` → **同梱の見本 3 人になる**。パス 120 (バッジと注記)・パス 121 (人材育成)・パス 309 (銘柄) と同じ家系で、この画面は「3 つを言い分ける」ところまでしか直っておらず**書き戻す側**が残っていた —— 同じファイルの 20 行下 (パス 160) が 「読めていない下書きを書き戻さない」と言っているのに、対になる「見本を書き戻さない」が無かった。**注記も 1 つ偽だった**: 下書きが在れば画面に出ているのは見本ではないのに「見本を表示しています。」と 刷っていた (直す前から・マウント時は下書きを優先して復元するため)。**この欠陥は 2026-09 の e2e の揺れ (パス 331 / 332 / 334 で 3 回) の原因でもあった** —— 上書きは `data` が landed した後の passive effect で起きるので、Playwright が paint で返った直後に書いた下書きが 潰され、次の待受 `[data-skill-radar-omitted]` が出ない。負荷で順序が入れ替わるため連鎖でだけ落ちていた。母集団の機械 `snapshotAdoptionCensus.test.ts` は**別名を収束まで解いて**数える (`data` の綴りだけだと `const snap = data as TalentSnapshot;` の `TalentPage` が映らず **1 件 → 2 件**・パス 334 の死角と同じ形)。renderer / shared は両ビルドが読むので LITE も同じだけ増える。e2e +3 と census は出荷物に入らない)・**2026-09-20 パス 334 後の計測: 11,930,507 B / 3,343,028 B (両方 −48 B** —— 手書きだった失敗本文の読み **7 か所**を `readFailureBody` へ通した分 (綴りが短くなるので減る)。**欠陥はコードではなく、パス 330 で私が書いた census の針だった** —— `readBodyWithCap|readFailureBody` の綴りだけを数えており、**本体が 1 行の別名** (`readCapped` ×2 / `readCappedText` / `readWithCap`) の先に在る呼び出しが 1 件も映っていなかった。実測 **26 件 → 44 件**で、見えていなかった 18 件のうち **7 件が失敗の枝の手書き** (`readCapped(res, ctx).catch(() => '')` —— business / security / shopify / stocks / web-shim ×3)。**7 件とも上限は掛かっていた**ので穴ではない。偽だったのは**パス 330 が publish した主張**のほうで、「失敗の枝は 9 か所・全部が `readFailureBody` を通る」は実際には **16 か所・7 か所が通っていない**だった。法則 `center-then-count-callers` が「**その関数を使っている場所ではなく、同じことをしている場所を数えろ**」と warn している当のことを私がやった。census は 44 行の台帳をやめ、**別名を機械で解決** (本体が `return readBodyWithCap(` の関数) して台帳は別名 4 行 + `.catch` の例外 2 行に縮め、**手書きの失敗の形が 0 件**であることを直接主張する形にした。renderer / main の両方を触ったが、減るのは renderer の 3 か所ぶん)・**2026-09-20 パス 332 後の計測: 11,930,555 B / 3,343,076 B (両方 +33 B** —— チャットボットの要望の書き出し (`chatbot-requests.md`) に `escapeMarkdownInline` を通した分と、本文の組み立てを検査できるよう純関数 `requestsMarkdown` へ切り出した分。**`escape.ts` はどちらのビルドにも既に在る**ので、増えるのは呼び出し 2 つと関数 1 つのぶんだけ。**欠陥は「通していない」を数える機械が無かったこと**: `escapeMarkdownInline` の docblock は適用先まで書いている (「1 行で終わらなければならない場所すべて —— 見出し・箇条書きの 1 項目・引用の 1 行」) のに、利用者が打った要望文が `- [ ] ${text}` の箇条書きとして素で `.md` に入っていた。実測 (5 形のうち **4 形で差**): 生 HTML の `<` が通り (**今日この画面から打てる**)、改行が在れば箇条書きから抜けて新しい Markdown 構造を書け、`|` で表の桁がずれ、末尾の `\` が後続の区切りを打ち消す。ファイルは名前のとおり**オーケストレーションの backlog 候補**として人へ渡る前提で、`escape.ts` が「書き出した `.md` はダウンロードして人に渡る」と述べている経路そのものである。`lint:forbidden` #11 が落とすのは**エスケープの再実装**であって「通していない」ではない —— 母集団 (`text/markdown` を作る **8 行 / 5 ファイル**) を `markdownExportCensus.test.ts` が両方向で持ち、自由文が入る行には **`shared/escape` からの import** を要求する (**名前が在るかで判定したら対照が鳴らなかった**ので直した)。renderer は両ビルドが読むので LITE も同じだけ増える)・**2026-09-20 パス 331 後の計測: 11,930,522 B / 3,343,043 B (両方 +14 B** —— OAuth の `state` を比べる定時間比較を `shared/constantTimeEquals.ts` の 1 つへ畳んだ分。**増分が小さいのは、実装そのものは元から renderer に在ったため** —— ブラウザ版が持っていた XOR ループを shared へ移し、`pkce.ts` は別名 1 行になった。増えたのは module の境界と別名のぶんだけで、main 側 (`timingSafeEqual` の除去) は出荷物に入らない。**欠陥は「写しは避けられない」と検査が書き留めていたこと**: 同じ判定が main と renderer に 1 つずつ在り、パリティ検査 `stateEqualsParity` の docblock が「まとめられる重複ではなく、同じ判断の 2 実装である」と**写しを仕様として固定していた** (法則 `no-weakness-as-spec` の形)。しかも**等価ですらなかった** —— main の `Buffer.from(s,'utf8')` は**孤立サロゲートをすべて U+FFFD へ潰す**ので、実測 (2026-09-20) サロゲート帯を跨ぐ 1 文字の総当たり 4,330,561 組のうち **4,192,256 組 (96.8%)** で答えが割れた (`base64url` の字だけなら 0 組 —— `state` が実際に取る形なので**今日の実害は 0**)。**母集団の機械は在ったが針が狭かった**: `dualBuildDecisions.test.ts` は 2026-08-23 から両ビルドの重複を数えていたのに、針が `^export function` だけで `export async function` と `export const` が 1 つも映らず、**13 件 → 22 件**だった (映っていなかった 9 件には `generatePkce` と、画面に出る定数 6 件 —— 投資助言でない旨の断り・既定のリスク値・戦略の目録 —— が含まれる)。針を広げ、分類に `shared-alias` / `value` を足し、`value` にも「パリティ検査が import していること」を要求した (`stocksConstantsParity.test.ts` 7 件が新規)。`shared` は両ビルドが読むので LITE も同じだけ増える)・**2026-09-20 パス 330 後の計測: 11,930,508 B / 3,343,029 B (両方 −52 B** —— 応答本文の上限を**読む所**へ寄せた分。`shared/httpLimits.ts` に `readFailureBody` (上限つきで読む → 読めなければ空) を 1 つ置き、手書きだった失敗本文の読み **9 か所**を全部そこへ通した。**減るのは、`Response` を受け取って自分で読む口 `parseJsonBody` を消したため** —— 13 の書き込み口が `readJson` (= 上限つきで読んでから `parseJsonText`) を呼ぶようになり、消した関数と短くなった呼び出しが、足した関数より大きい。**欠陥は「向きが逆」だった**: 失敗した応答 (`!res.ok`) の本文に上限が無い箇所が 3 つ在り (`network/proxy.ts` / `network/ollamaWeb.ts` / `main/clients/ollama.ts`)、どれも**同じ関数の成功側には上限が在った**。大きな本文を返すのは壊れている相手で、その相手は定義上 `!res.ok` に来る —— 3 つとも成功側の注記が危険を正しく述べていた (「compromised or malicious proxy returning a huge payload」「2GiB を確保してからそれを捨てる」「落ちればタブではなく**アプリ全体**が落ちる」) のに、その文が掛かっていたのは**その相手が通らない枝**である。実測 (Node 22・1 MiB の塊を返す 500 応答): 上限なし 256 MiB は**引いた 256 MiB / rss +637 MiB / 2,932 ms**、上限ありは**引いた 11 MiB / 断り / rss +9 MiB / 6 ms**、512 MiB では `ERR_STRING_TOO_LONG` —— つまり **`catch` は握り潰すが費用は払い終えている**。main の Ollama は成功側 2 か所 (`/api/version` と `/api/tags`) も素通しで、`apiResponse.ts` の docblock が「`readBodyWithCap` と `fetchViaProxy` が先に掛かっている (実測で確認済み)」と書いていた主張が**偽だった** (16 本のうち 2 本が通っていない) —— 訂正して、直し方を「上流を数える」から**「読む所で切る」**へ変えた。`shared` / `renderer` は両ビルドが読むので LITE も同じだけ減る。母集団の機械 `responseBodyCapCensus.test.ts` (生の読み 3 件・上限つきの読み 26 件を両方向) と `jsonBodyCensus.test.ts` の答えが 1 → **0 件**になった分は検査なので出荷物に入らない)・**2026-09-20 パス 329 後の計測: 11,930,560 B / 3,343,081 B (両方 +4,106 B** —— 計算書類 4 点に投資ポートフォリオを**参考の別紙**として併記した分 (`renderer/data/portfolioAnnex.ts` の組み立てと 3 つの断りの文・画面の紙 1 枚・`KessanPage.kind` と札の分岐)。**法定書類の中には入れない** —— 出所 (`mutual-funds` / `real-estate`) は `SERVICE_DATA_ORIGIN` が **`sample`** と言うとおり同梱の見本で、`shared/dataOrigin.ts` が自分で「決算書類・申告書類へ流れる数字を扱うアプリで、これは単なる表示崩れでは済まない」と書いている。断りの文が長いので**増分の大半は日本語の文** (紙に 3 つ刷る: 計算書類に含まれない / 出所 / 時価・取得価額と簿価の基準の違い)。renderer は両ビルドが読むので LITE も同じだけ増える。`portfolioAnnex.test.ts` 9 件・jsdom +3・e2e +5 は出荷物に入らない)・**2026-09-19 パス 328 後の計測: 11,926,454 B / 3,338,975 B (両方 +353 B** —— 「計算書類（4点まとめて）」を**名乗りどおり 4 枚ちょうど**にし (決算公告の要旨は会社法440条の公告で435条2項の計算書類ではないので束から外し、貸借対照表を選んだときだけ 2 枚目に付く)、文言 5 か所を「4 枚ちょうど / 要旨は貸借対照表側」に書き換えた分。**枝は 1 つ短くなったのに増えるのは、説明の文が伸びたため** (`show('bs')` → `sheet === 'bs'` は同じ長さ)。renderer は両ビルドが読むので LITE も同じだけ増える。jsdom +1・e2e kessanTax +1 は出荷物に入らない)・**2026-09-19 パス 327 後の計測: 11,926,101 B / 3,338,622 B (両方 −6 B** —— 鍵導出 3 か所の `hash: 'SHA-256'` を凍結値 `PBKDF2_HASH` へ置き換えた分。**書き写しを消したので減る** (最小化後は 3 つの文字列リテラルが 1 つになる)。`cryptoParams.ts` の docblock は「IV 長・反復回数・ハッシュを 1 つに集めた」と述べていたのに、**ハッシュだけは 3 つの導出すべてが書き写していた** —— `PBKDF2_HASH` を変えると封筒のメタ `kdfLabel()` だけが動いて導出は動かず、docblock 自身が言う「復号できないバックアップ」になる形だった。`security/` は両ビルドが読むので LITE も同じだけ減る。母集団の機械 `kdfParamsCensus.test.ts` と、法則の被覆の台帳 `lawCoverageLedger.test.ts` は検査なので出荷物に入らない)・**2026-09-19 パス 326 後も 11,926,107 B / 3,338,628 B で byte 単位で不変** (直したのは `src/main/` だけ —— `atomicWrite.ts` の `readFileWithBackup` に読む前の大きさの門を**中へ**置き (`maxBytes` を必須引数に)、`secrets.ts` が本体と控えの両方に `MAX_STORE_SIZE` を渡し、`devEnv.ts` の 7 つの同期読みに `MAX_DEV_ENV_FILE_BYTES` を足した。**ブラウザ版はこの 3 モジュールを 1 行も読み込まない**ので出荷物は動かない: 両方を組んで実測した。**控えの `.prev` には門が無く、本体を消せば主プロセスが丸ごと読んで `JSON.parse` していた** —— 門は `loadStore()` の先頭に在ったが、その下の読みが 2 つのファイルへ分岐しており、分岐は呼び出し側のコードに現れない。母集団の機械 `fileReadSizeGateCensus.test.ts` (`readFile` の 5 か所を両方向) も検査なので入らない)・**2026-09-19 パス 325 後の計測: 11,926,107 B / 3,338,628 B (両方 +5 B** —— `shared/scanTarget.ts` の `validateScanUrl` が返す物を生の文字列 `url` から解析後の `parsed.href` へ変えた分だけ。**調べた物 (parsed) と 第三者 (VirusTotal) へ送る物 (raw) が別だった** —— 実測で 8 形のうち 5 形が食い違う。`shared` は両ビルドが読むので LITE も同じだけ増える。同じパスで直した `main/clients/github.ts` (pin した後に生を fetch) と `main/clients/shopify.ts` の Discord webhook (pin した後に生へ POST) は **main だけ**なので出荷物に入らない。母集団の機械 `parsedUrlGateCensus.test.ts` (`new URL(` の 27 か所を種類つきの台帳へ・両方向) も検査なので入らない)・**2026-09-19 パス 324 後も 11,926,102 B / 3,338,623 B で byte 単位で不変** (直したのは `src/main/clients/slack.ts` の permalink —— `team.info` の応答の `domain` をそのまま `https://${domain}.slack.com/…` の **authority** に置いており、`/` `?` `#` `\` の 1 字で host が `.slack.com` の外へ出た —— と、`shared/api/slack.ts` に足した 1 ラベルの関門 `slackWorkspaceDomainOrNull` だけ。**関門は shared に置いたが読むのは main だけ**なので、ブラウザ版の bundle からは tree-shaking で丸ごと落ちる (両方を組んで実測した)。`lint:url-encoding` は authority を見ず、`lint:network-targets` は通信しか見ず、#5 (`externalUrlOrNull`) はスキームしか見ない —— **3 つの網の継ぎ目**で、母集団 5 行を `hostInterpolationCensus.test.ts` が台帳制 (両方向) で持つ。検査と法則は出荷物に入らない)・**2026-09-19 パス 323 後の計測: 11,926,102 B / 3,338,623 B (両方 +1,442 B** —— 書類スタジオの計算書類を 1 点 1 枚に: `KessanSheets` が書面ごとに `.ds-paper` を並べる (5 枚: 損益 / 貸借 / 変動 / 注記 / 公告の要旨・紙ごとに免責の脚注と札)、`styles.css` の `.ds-sheets` / `.ds-sheet-caption` と印刷の改ページ規則 5 行、文言 4 か所。**「4点まとめて」は 4 点を 1 枚の紙に流していた** —— 画面では 1 枚の長い紙、印刷では書面の途中で改ページ。renderer は両ビルドが読むので LITE も同じだけ増える。jsdom +4・e2e kessanTax +7 は出荷物に入らない)・**2026-09-19 パス 322 後の計測: 11,924,660 B / 3,337,181 B (両方 +12,491 B** —— 内訳: 本体で +12,343 B、撮って直した続き (ブラウザ組み込みの検索の ✕ を隠す規則 1 つと、スマホの hero の media 規則を基本の規則より**後ろ**へ —— 前に置くと同じ特異性で負けて 1 行も効かない) で +148 B。可愛い UI の 2 段目 (見た目に加えて操作性): `styles.css` の UI 側を書き直し (トークン 15 を足して部品の規則の直書き色 10 → 0・`.primary` / `.soft` / `.ghost` / `.chip` / `kbd.kbd`・浮いたカードのサイドバーと本文・`.page-enter`・`.scroll-top`・`.upgrade-card`・ホームの `.home-*`)、`App.tsx` のシェル (検索の ✕ と件数と札・分類の見出し・トップバーの記号と分類の札と ♡・先頭へ戻る・画面切替で先頭から・ドロワーの ✕ と Esc)、`shellContext.ts` (お気に入り / 最近使ったの並びを App 1 つからホームへ渡す —— 保存の読み手は増やさない)。`HomePage.tsx` は inline style を class へ移したので**その分は減る**。renderer は両ビルドが読むので LITE も同じだけ増える。jsdom 15 件・e2e `shell` suite 27 件は出荷物に入らない)・**2026-09-19 パス 321 後の計測: 11,912,169 B / 3,324,690 B (両方 +2,645 B** —— 外部サービスへの書き込み 13 経路を `shared/api/*.ts` の 1 つずつ (`checkX` → `xInit` → `parseCreatedX`) へ寄せ、両ビルドが同じ関数を通るようにした分。写し (main と `saasWriteWeb.ts` に 1 つずつ在った URL・ヘッダ・本文・応答の読み) を消した分より、共有の関数 (型を付けた `Checked*`・封筒の読み手・`readCloudflareEnvelope` / `basicAuthorization` / `summarizeVtReport`) の方が大きい。RFC 2822 と base64 と `parseSecurityKeys` の写し (5 + 2 + 2) も 1 つずつに。**オントロジー (`src/shared/ontology/`) は出荷物に入らない** —— 読むのは検査と生成 script だけなので tree-shaking で丸ごと落ちる。shared は両ビルドが読むので LITE も同じだけ増える)・**2026-09-18 パス 320 後の計測: 11,909,524 B / 3,322,045 B (両方 +16 B** —— チームレーダーの保存値が壊れていたときの理由を `redactForMessage` (梯子の 6 段目 `MAX_STORED_STATE_REASON_CHARS` 200) に通す呼び出し 1 つ。**理由には生の保存値 (member id / axis label) が補間されていて、同じ関数の 20 行上が「JSON.parse の文は定数に固定する」と書いていたのに、その下の枝には天井が無かった** —— パス 314 の census は renderer しか見ておらず、母集団を shared へ広げて出た。shared は両ビルドが読むので LITE も同じだけ増える。検査は出荷物に入らない)・**2026-09-18 パス 318 後の計測: 11,909,508 B / 3,322,029 B (両方 +509 B** —— 配色を適用するたびに stylesheet の `--bg` の実値を読んで PWA の `theme-color` と デスクトップの窓の下地 (`app:setColorScheme` → `BrowserWindow.setBackgroundColor` と userData の `service-hub-window.json`) へ伝える `syncHostChrome` と、ブラウザ版 shim の no-op の口 1 つ。main 側 (`windowPrefs.ts`・起動前の読み) はブラウザ版が読まないので出荷物には入らない。renderer は両ビルドが読むので LITE も同じだけ増える)・**2026-09-18 パス 317 後の計測: 11,908,999 B / 3,321,520 B (両方 +5,868 B** —— 配色の設定 (ライト / ダーク / OS に合わせる) を足した分: `theme.ts` (入口を通す読み書き・`matchMedia` での解決・`<html data-theme>` への適用・追随の停止)・設定画面の 3 択・`styles.css` の部品のトークン 33 と `:root[data-theme="dark"]` の表 53 (ライトの色トークンを全部上書き。CSS に `prefers-color-scheme` は書かず、JS が解いた値だけを属性に置く)。**既定はライトのまま**なので何も選んでいない利用者の見た目は変わらない。renderer は両ビルドが読むので LITE も同じだけ増える。検査 27 と e2e の `theme` suite (31 suite 目) は出荷物に入らない)・**2026-09-18 パス 315 後の計測: 11,903,131 B / 3,315,652 B (両方 +1,911 B** —— 意味色の直書き 360 か所 (裸 332 + 退避値の中 28) を `var(--success)` / `var(--danger)` / `var(--warning)` へ寄せ、退避値 38 か所を剥がし、黒い字を載せる札の地 `--warning-bg` を 1 つ足した分。トークンの綴りは hex より 6 字長いので、剥がした退避値の分を差し引いても増える。**画面が読む変数名で定義の無い物が 3 つ (`--mute` / `--ng` / `--ok`) 残っていた** —— 再設計の走査は「使われている名前 vs 定義」を数えておらず、`inlineColorCensus.test.ts` がその照合と直書き色の分母 (275 件 / 40 ファイル・双方向) を持つ。renderer は両ビルドが読むので LITE も同じだけ増える。検査は出荷物に入らない)・**2026-09-17 UI 再設計後の計測: 11,901,220 B / 3,313,741 B (FULL +4,785 B・LITE +4,785 B** —— `styles.css` の書き換え (淡いピンク × ラベンダー × ミントの明るい配色・ピル型ボタン・すりガラス・丸ゴシック系フォント。外部フォントは同梱しない) と、inline の直書き色 29 ファイルを意味のトークンへ寄せた分。**画面が読んでいた `var(--text-mute)` 624 か所ほか 4 つの変数名は、それまで 1 つも定義されておらず素通りしていた** (定義は `--text-muted` / `--bg-elevated` だけ)。renderer は両ビルドが読むので LITE も同じだけ動く。検査・文書は出荷物に入らない)・**2026-09-17 パス 312 後の計測: 11,896,435 B / 3,308,956 B (両方 +211 B** —— ブラウザ版の `invoke` / `fetchSnapshot` の外側に main の IPC ハンドラと同じ床 `withFloor` (→ `err()` → `safeErrorMessage`) を 1 か所置き、公開する `shim` を `{ ...unguarded, fetchSnapshot, invoke }` で組む分。**枝の中の 19 の `try` (同じ規則の写し) だけが「reject しない」を守っており、Web Storage が拒む環境・null の payload・形の違う payload で 1 + 11 + 2 組が reject して画面の busy を戻さなくしていた** (既存の検査は 4 条件の列挙で「何があっても」と名乗っていた)。web-shim は両ビルドが読むので LITE も同じだけ増える。検査と台帳は出荷物に入らない)・**2026-09-17 パス 311 後の計測: 11,896,224 B / 3,308,745 B (両方 +435 B** —— 第三者の本文を JSON として読む助け `parseJsonBody` / `parseJsonText` / `notJsonMessage` を `shared/apiResponse.ts` に置き、`await res.json()` のままだった 16 か所 (ブラウザ版の書き込み 13 経路・liveRead の transport・main の Ollama 2 経路) を通した分。**2xx で JSON でない本文が返ると、V8 の SyntaxError が本文の先頭 10 字 (`"ghp_abcdef"...`) を引用したまま画面へ出ていた** (パス 260 の `tokenResponse.ts` は「文言は定数」にしていたのに、パス 261 で足した隣の 13 経路が持っていなかった)。shared は両ビルドが読むので LITE も同じだけ増える。census `jsonBodyCensus.test.ts` は検査なので出荷物には入らない)・**2026-09-17 パス 310 後の計測: 11,895,789 B / 3,308,310 B (両方 -37 B** —— Google の接続カードの読みを入口 `readLocalString` に寄せ (自前の try/catch の写しと `describeStorageError` の import をやめた) 分で減った。読めない端末の注記は入口の案内文になる (文は既に束に在るので増えない)。**端末からの読み取りに「読めなかった時をどう扱うか」の台帳が無かった** —— 読みの 22 か所を方針 4 通りと理由で `storageReadLedger.test.ts` に載せた (検査なので出荷物には入らない)。renderer だけの変更なので main は不変)・**2026-09-17 パス 309 後の計測: 11,895,826 B / 3,308,347 B (両方 +1,454 B** —— 銘柄のウォッチリストの保存値を読む規則を `shared/watchlistState.ts` の 1 つ (3 状態・落とした件数・注記) に置き、main と renderer に 1 つずつ在った `isSafeSymbol` の写しを re-export にし、両ビルドのスナップショットに `stored` / `storedNote` を足して画面が ⚠ で言う分。**壊れた保存値を「まだ無い」に畳み、次の登録が元の一覧を 1 銘柄で上書きしていた** (チームレーダーのパス 120・人材育成のパス 121 が直した形の 4 つ目・両ビルド)。shared は両ビルドが読むので LITE も同じだけ増える)・**2026-09-17 パス 308 後も FULL は 11,894,372 B で byte 単位で不変** (直したのは `src/main/clients/skills.ts` だけ —— スキル本文を system として有料 API へ送る経路に天井が無く、ファイルを大きさを見ずに読んでいた。ブラウザ版はこのモジュールを読まないので出荷物は変わらない: FULL を組んで実測した。LITE は組んでいない —— 差は学術コーパスだけなので FULL が不変なら LITE も不変)・**2026-09-17 パス 307 後の計測: 11,894,372 B / 3,306,893 B (両方 +9 B** —— 例外の message を画面へ出す経路 2 本 (`PageErrorBoundary` の `describeRenderError` / `localWrite` の `describeStorageError`) が天井だけ掛けて伏字を持っていなかったのを `redactForMessage` に通した分。`redact.ts` は両ビルドに既に在るので呼び出し 2 つぶんしか増えない。パス 305・306 はゲート・workflow・harness だけなので出荷物には入らない)・**2026-09-17 パス 304 後の計測: 11,894,363 B / 3,306,884 B (両方 +45 B** —— `egressInit` の no-cors の枝 1 行ぶん。`httpLimits.ts` は両ビルドが読むので LITE も同じだけ増える。パス 301 の「転送に追随しない」が `mode: 'no-cors'` の到達確認にも重なり、ブラウザでは Fetch 標準どおり network error (`TypeError: Failed to fetch`・chromium 実測) になって「起動しているが OLLAMA_ORIGINS 未設定」を「未起動」と診断していた —— **undici は CORS を実装しない**ので同じ呼び出しが 200 で通り、単体検査 17,233 件は全件緑のまま、CI の外だった `e2e:ollama` だけが捕まえた (同日から e2e.yml で走る)。no-cors の要求は資格情報を載せられず応答も読めないので、追随しても台帳の外へ何も運ばない —— その 1 形だけ規則の中で 'follow' を明示した。**測っている間に 2 つ目**: `e2e:ollama` と `smoke:app` は成果物の鮮度を見ておらず、直した直後に回すと直す前の HTML の診断を返した (パス 302 の道具の台帳が 3 本の手書きだった) —— 母集団を package.json から導く形にした。これらはゲートと harness なので出荷物には入らない)・**2026-09-17 刑名の裁定 (残作業 8) の後の計測: 11,894,318 B / 3,306,839 B (FULL +225 B・LITE 不変** —— 変わったのは学術コーパスの本文 6 行だけで、LITE は学術コーパスを積まないので 1 バイトも動かない。**両方が同じだけ増えるのは共有モジュール、FULL だけが増えるのはコーパス**、という切り分けが計測から読める。パス 302・303 はゲートと検査だけなので出荷物には入らない)・**2026-09-17 パス 301 後の計測: 11,894,093 B / 3,306,839 B (両方 +1,032 B** —— 「転送 (3xx) に追随しない」規則を `shared/httpLimits.ts` に 1 つ (`REDIRECT_STATUSES` / `egressInit` / `isRedirectResponse` / `redirectRefusal`) 置き、網の fetch **12 か所**すべてが通るようにした分。送り先の関門 (`lint:network-targets` / §3.3 の表 / 各 endpoint の検証) は**最初の 1 ホップ**しか見ておらず、`fetch` の既定 `redirect: 'follow'` だと表のホストが返す `302 Location:` 1 つで表に無い先 (LAN・loopback) へ取りに行っていた。同じ規則は利用者が配る Worker (`PROXY_EXAMPLE` §(c)) と窓の遷移 (`will-redirect`) に既に在り、**アプリ自身の fetch だけが持っていなかった** (`redirect` を指定する物 0)。Worker への POST は封筒の本文に上流の `Authorization` を載せており、307 / 308 ならブラウザがそれを Location 先へそのまま再送する形だった —— `proxyEndpoint` が通した送り先と実際に送る送り先が別になる (パス 291 / 298 / 299 の「調べた物と使われる物が別」の家系)。両ビルドが同じ shared を読むので LITE も同じだけ増える)・**2026-09-17 パス 300 後の計測: 11,893,061 B / 3,305,807 B (両方 +114 B** —— SSRF の送り先判定 `isPrivateOrReservedTarget` を `renderer/network/proxy.ts` から `shared/privateTarget.ts` へ**そのまま**移し (中身は不変・`proxy.ts` は re-export)、`imageUrlGate` に 2 段目 `safeRemoteImageSrc` (= `safeImageSrc` + private/reserved 拒否) を足して `DataList` / `StatusBar` が読むようにした分。遮断表そのものは 1 バイトも増えない (同じコードが場所を変えただけで、最小化でコメントは落ちる) ので、増分は新しい関数 1 つと呼び出し 2 つと re-export の分だけ。**第三者 API の応答 (GitHub `avatar_url` / Canva `thumbnail.url`) の画像 URL が `127.0.0.1` やプライベート帯を指していても取りに行っていた** —— `<img>` は読めないが GET は利用者の網の内側へ飛び、load / error のタイミングで在否が漏れる。利用者自身が打つ背景画像 (`safeCssUrl`) は別の段に残す (NAS の LAN URL は正当)。パス 299 が「測ったが決めていない」と書いた項で、**呼び出し側の値の出所を測ったら決まった** (fetcher 2 本とも送り先がリテラル固定なので「LAN のアバター」は起きえない))・**2026-09-17 パス 299 後の計測: 11,892,947 B / 3,305,693 B (両方 +1,596 B** —— パス 293〜299 の 7 パス分。検査と文書だけのパス (293 / 297) は入らず、入ったのは両ビルドが読む物だけ: プロキシ封筒の `Headers` 検証 (294–295)・資格情報の入口の `Headers` 受理判定を `shared/headerValue.ts` の 1 つへ (296)・台帳由来の `<a href>` 2 本を `externalUrlOrNull` の返り値へ (298)・`imageUrlGate` を字面の前置き一致から**解析してから判定**へ (299)。**両方が同じだけ増えるのは共有モジュールだから**で、LITE と FULL の差は学術コーパスだけである。実機は同じ HEAD (`2eccf082`) で `smoke:app` OK・`e2e` 395 件 ❌ 0・`e2e:lite` 395 件 ❌ 0・`perf` OK (LITE DCL 246 ms / heap 10.1 MB・FULL DCL 706 ms / heap 36.9 MB。**`perf` は 1 度断った** —— 連鎖の途中で私が `src/` を編集したため「成果物が src/ より古い」と exit 2。成果物は編集前の HEAD の物なので `SERVICE_HUB_PERF_ALLOW_STALE=1` で意図して通した。断りは正しく働いた))・**2026-09-15 パス 292 後も FULL / LITE ともに byte 単位で不変** (直したのは `scripts/verify-architecture.cjs` と `docs/` だけ —— ゲートは出荷 HTML に入らない。**図の参照 29 件のうち 2 件がどの網にも映っていなかった** —— 図の走査は `(...)` を必須にしていたので、関数でない成員 (定数・型) は括弧が無く映らず、バッククォートも無いので散文の走査にも映らない。`OAUTH_CONFIGS : oauth.ts:54` はブロックコメントを閉じる行を指し、**パス 291 で手で直すまで誰も鳴らなかった**。残る 27 件も `includes` で照合されていて**言及と宣言を見分けず**、`setToken : secrets.ts:73` は docblock の使用例 (宣言は 263・**190 行の隔たり**)、`authorize : oauth.ts:258` は `authorizeUrl:` の**URL リテラルの末尾**(宣言は 775・**517 行**) で満たされていた。可視性の印を括弧の代わりに認め、帯の出現に「コメント行でない・引用符の外」を要求した。**散文 ref には同じ規則を掛けない** —— 実測で 125 組のうち **51 組**が落ち、action 名とヘッダ名は文字列としてしか存在し得ないので偽陽性だった。★ **旧い self-test の 1 行が穴を「意図」として留めていた** (`+justAName : x.ts:1` は実在しない名前なので、散文を拾わないことと実在する成員を飛ばすことを見分けられない) —— パス 289・291 と**3 パス連続の家系**)・**2026-09-15 パス 291 後も 11,891,351 B / 3,304,097 B で byte 単位で不変** (直したのは `src/main/oauth.ts` の端点の関門を**字面から解析へ**移した分だけで、**ブラウザ版はこのモジュールを 1 行も読み込まない** —— `web-shim.ts` の `authorize` は `not_supported` を返すだけで、貼り付け式 PKCE は `renderer/oauth/pkce.ts` が別に組む。`startsWith('https://')` は `HTTPS://` を**弾き**、`https://accounts.google.com@evil.example/o/oauth2/auth` を**通していた** (解析した origin は `https://evil.example`。6 形のうち **5 形**で答えが割れた実測)。**`oauth.test.ts` の拒否表の題名が「URL 解析ではなく前置き一致なので弾く側」と、弱さを仕様として書き留めていた** —— パス 289 の「標本が母集団を見分けられない」と同じ家系だが、こちらは**題名が弱さに名前を与えて正当化していた**ので落ちる検査が無く、読んで気付くしかない。`shell` へ渡す文字列も関門の**返り値**に替えた (調べた物と開く物を一致させる)。実害は今日 0 —— 9 つの config はすべてソース中の `https://` リテラル —— だが、守りの強さが「設定は動かない」という**別の前提**に依っていた)・**2026-09-15 パス 290 後の計測: 11,891,351 B / 3,304,097 B (両方 −6 B** —— **相手の本文を画面の文へ入れる経路のうち 1 つだけが伏字を呼んでいなかった**。`shared/ollama.ts` は `clampToCeiling(x, MAX_ERROR_DETAIL=300)` で**天井だけ**を掛け、つまり `redactForMessage` の後半 (切る) を手で書いて前半 (伏せる) を持っていなかった (実測: 兄弟は 6 / 3 / 2 / 3 件、ここ **0 件**)。3 か所を `redactForMessage` へ通し、300 を梯子へ `MAX_LOCAL_MODEL_ERROR_CHARS` として移した。**減ったのは私有定数とその注記を落とした分が、足した呼び出し 1 つを上回ったため** —— `redactSecrets` は両ビルドに既に入っているので、通す費用は呼び出し 1 つぶんしかない。**実害は今日 0** (Ollama への要求に資格情報は乗らない・`SERVICE_CREDENTIAL_USE.ollama === 'none'`) だが、本文の出どころは利用者が設定したホストなので「送っていないから反射されない」は設定次第で崩れる前提だった。**`redact.ts` の「全経路の最後の関門」も実物 (6 件) に直した** —— 5 件の列挙 +「ほか」で、その「ほか」に穴が 1 つ在った。パス 273 の census が見なかったのは、`redactForMessage` の**第 2 引数**を数える網には**`redactForMessage` を呼ばない経路が映らない**ため (パス 289 が隣の census で見つけた死角と同じ形)。向きを変えて「梯子の天井は伏字を通してのみ掛かる」を留めた**)・2026-09-15 パス 289 後の計測: 11,891,357 B / 3,304,103 B (両方 +22 B** —— 伏字の **3 本目の運び手の残り半分**。パス 271 は「URL のクエリ引数」を塞いだつもりで `([?&])` を錨にしており、**対が 1 つ目のときは当たらなかった** —— それは `application/x-www-form-urlencoded` の本文、つまり **RFC 6749 §4.1.3 がトークン端点に指定している形**で、`main/oauth.ts` と `renderer/oauth/pkce.ts` が実際に組み立てている(走査で 2 件)。実測: `?client_secret=…` は伏せるのに `client_secret=…&grant_type=…` は素通りで、伏字の有効範囲が**秘密の運び手ではない 1 文字**に依っていた。錨を `(^|[?&\n])` にし `code[_-]?verifier` を足した (両ビルドが実際に送る。`assertion` は実測 0 件なので足さない)。**パス 271 の過剰の対照が、この穴を「散文」という理由で意図として留めていた** —— 区切りが無いという条件が指す母集団は 2 つ在り、標本が片方しか見ていなかった。`\s` まで広げると散文を巻き込むので広げない (実測して narrow に戻した)**)・2026-09-15 パス 280〜284 をまとめて計測: 11,891,501 B / 3,304,247 B (両方 +151 B)** —— 5 パス分でこれだけなのは、内訳が「出荷物に入らない所」に偏っていたため: 281 は検査だけ・282 は `src/main/` の締切と `shared/scanTarget.ts` へ寄せた 4 文 (ビルドごとに 1 つずつ在った写しが 1 つになるので相殺)・283 の `SHOPIFY_ORDER_FIELDS` は shared に置いたがブラウザ版から誰も import しないので tree-shaking で落ちる・284 は `shared/atlassianSite.ts` に関数 1 つと 3 文を足した代わりに両ビルドの写し (3 文 + 3 段の検査) を落とした。**両方が同じだけ増えるのは共有モジュールだからで、LITE と FULL の差は学術コーパスだけである。**・2026-09-15 パス 278 後も 11,891,350 B / 3,304,096 B で **byte 単位で不変** (直したのは `tsconfig.*.json` の include と `CLAUDE.md` / `docs/` / `scripts/generate-dashboard.ts` の注記だけ —— **4 つの TypeScript が型検査の外に居た**。include を広げても出荷物の中身は 1 バイトも変わらない: vite は esbuild で型を剥がすだけで `tsc` の範囲を見ないし、`src/__tests__` も `vitest.config.ts` も `scripts/` も出荷 HTML に入らない)・2026-09-15 パス 275 後の計測: 11,891,350 B / 3,304,096 B (**両方 +918 B** —— 断りの台帳 `DESKTOP_ONLY` の**理由**を誰も検算しておらず、残る 4 行を測ると **2 行が偽・1 行は生きた欠陥**だった (`microsoft-365/create-event` は画面にボタンが在るのに `action_not_found`・`stocks/backtest` の「デスクトップ側の計算」はブラウザ版が同じ計算を戦略ごとに走らせており偽・`docstudio/list-collections` の「ローカルを読む」は 3 要素のリテラル定数で偽)。create-event を共有へ寄せて繋ぎ、理由を**種類**にして種類ごとに検査を付けた。`dead-action` の行は画面から呼ばれていてはならない)・2026-09-15 パス 274 後の計測: 11,890,432 B / 3,303,178 B (**両方 +890 B** —— `microsoft-365/send-mail` がデスクトップ版にしか無く、ブラウザ版では `action_not_found` だった (隣の `gmail/create-draft` は同じ CORS → Worker の形で動いていた)。画面は穴を「デスクトップ版の機能です」と説明し、検査も「プロキシ経路も用意していない」と台帳に書いて**穴を仕様として固定していた**。ホスト・欄の判定・要求の組み立てを `shared/api/microsoft365.ts` に寄せ、両ビルドが同じ関数を通す)・2026-09-15 パス 273 後の計測: 11,889,542 B / 3,302,288 B (「相手の本文をどれだけ画面へ載せてよいか」の天井が **5 値・19 か所の裸のリテラル**で、最も多い 200 (15 か所) にだけ名前も理由も無かったのを `shared/redact.ts` の 3 段の梯子へ寄せた分で**両方 +10 B** —— 80 の 2 か所は **main ↔ ブラウザ版の双子**で、一致していたが一致を留めている物が何も無かった (パス 269 が 300 で塞いだ穴と同じ形)。天井そのものは 1 字も変えていない)・パス 271 後の計測: 11,889,532 B / 3,302,278 B (伏字の**3 本目の運び手** —— URL のクエリ引数 —— を `redact.ts` に足した分で**両方 +196 B**。それまでの規則は**ヘッダ名**と**JSON 項目名**の 2 本しか見ておらず、`?api_key=` / `?apikey=` / `?access_token=` / `?token=` / `?auth=` / `?key=` の **6 形すべてが素通り**していた。`redact.ts` は両ビルドが読むので LITE も同じだけ増える)・2026-09-15 パス 269 後の計測: 11,889,336 B / 3,302,082 B (`assistant/chatAll` の**提供者ごと**のエラー文の天井が `redactForMessage(msg, 300)` という**字面でビルドごとに 1 つずつ**在ったのを `shared/assistantLimits.ts` の `MAX_ENSEMBLE_ERROR_CHARS` 1 つに寄せた分で**両方 +8 B** —— 応答そのものの天井 (2,000) より狭い理由 (最大 5 提供者ぶんが 1 つの文に積まれる) がどこにも書かれておらず、数字だけが 2 か所に在った。**本体の直しは出荷物に入らない** —— 「無いこと」を主張する検査が変異検査の中で空になる穴 (網が `readFileSync` しか見ていなかった) を塞いだのはゲート側である)・2026-09-15 支払明細書 4 種 (給与 / 賞与 / 役員報酬 / 役員賞与) を書類スタジオに足した後の計測: 11,889,328 B / 3,302,074 B (**両方 +29,582 B** —— 書式 52 → 56 と、交付前チェック 4 本・法的位置づけ・事業仕分けの台帳 4 行ずつ。賃金台帳の注記が 2026-08 から「給与明細は労働者へ交付する通知 (所得税法231条等)・台帳とは別物」と述べていたのに、**交付する側の明細書が 1 つも無かった**)・パス 268 後の計測: 11,859,746 B / 3,272,492 B (チームレーダーの SVG の組み立てを `shared/teamRadarSvg.ts` へ移し、**ブラウザ版が画面の `<svg>` を DOM から掻き取るのをやめた**分で**両方 +2,723 B** —— 掻き取れるのは `<svg>` 要素だけで、標題・部署・評価時点・凡例・⚠ の断りはその外側に在ったので、書き出した SVG は 244 バイトの裸の図だった)・2026-09-15 パス 267 後も 11,857,023 B / 3,269,769 B で **byte 単位で不変** (直したのは `src/main/` の `action:invoke` だけで、ブラウザ版はこのハンドラを 1 行も読み込まない —— **資格情報の要らない 15 サービスの action がデスクトップ版で 1 度も呼ばれておらず**、同じボタンがブラウザ版では動いていた)・2026-09-15 パス 266 後の計測: 11,857,023 B / 3,269,769 B (`cursor` の日次利用の 5 欄が鍵の不在を 0 に倒しており、**「採択率 0%」と「4 つのうち 1 つだけを数えたリクエスト数」**を刷っていた —— `readNum` / `sumOrNull` と画面の `qty` で**両方 +124 B**。`shared/api/cursor.ts` は両ビルドが読むので LITE も同じだけ増える)・2026-09-15 パス 265 後の計測: 11,856,899 B / 3,269,645 B (`as const` が画面の型を実物より狭くしていた真偽値 12 件に `as boolean` を足し、**その死んだ枝が「✅ 連携中」だった** —— デスクトップの funding の fetcher は Phase 6 まで見本の Map を必ず渡すので、何も繋いでいない利用者に連携を名乗っていた。出どころ (`FundingLinkSource`) と文言 2 つを共有へ置いた分で**両方 +373 B** —— `shared/funding.ts` は両ビルドが読むので LITE も同じだけ増える)・2026-09-14 パス 264 後の計測: 11,856,526 B / 3,269,272 B (鍵が無い応答から**件数の文**を組み立てていた 3 件 (`notion` の「共有されたページなし」= 利用者の設定の診断・`microsoft-365` の「直近 0 件 / 未読 0 件」= サマリーの 2 カード・`ollama` の「既知 CVE」= 版が読めないだけ) を`shared/apiResponse.ts` の `readArrayField` (空の配列は read: true) へ通した分で**両方 +283 B**)・2026-09-14 パス 263 後の計測: 11,856,243 B / 3,268,989 B (`cursor` が「相手が 0 件と答えた」と「応答を読めなかった」を分けるようにした分で**両方 +1,829 B** —— `rowsOf` は 5 つの違う状況を `[]` に畳んでおり、`{teamMembers:[]}` (0 名と答えた) も `null` も `{}` もスカラーも、見出しに `Cursor · 0 名 / 稼働 0 日 / $0.00` を緑のライブ表示で刷っていた (両方向に嘘)。shared と renderer の両方に掛かるので LITE も同じだけ増える)・2026-09-14 パス 262 後も 11,854,414 B / 3,267,160 B で **byte 単位で不変** (`jsonFetch<T>` に封筒の要求を置き、`github` の 6 欄と `freee` の事業所を要求したが、直したのは `src/main/` だけ —— ブラウザ版はこの 13 クライアントを 1 つも読み込まない (読み取りは `liveRead.ts` の `cursor` だけ・書き込みはパス 261 で直した `saasWriteWeb.ts`)。本文 `null` で 12 クライアントが `Cannot read properties of null` を画面へ漏らしていた)・2026-09-14 パス 261 後の計測: 11,854,414 B / 3,267,160 B (外部サービスの「成功した」応答を**読むところで**検証する共有規則 2 つ (`shared/apiResponse.ts` / `shared/securityResponse.ts`) と、`saasWriteWeb.ts` の 12 経路・`main/clients/security.ts` の 2 経路の配線で**両方 +2,625 B** —— 200 の本文が `{}` でも**6 経路が成功として返し**、2 経路は `undefined` を埋め込んだ URL を押せるリンクとして渡し、`security` は空の「漏洩」を 1 件でっち上げていた。安全の判定を作る 2 つは両ビルドが同じ実装を読むのでLITE も同じだけ増える)・2026-09-14 パス 260 後は 11,851,789 B / 3,264,535 B (認可サーバのトークン端点の応答を**読むところで**検証する共有規則 `shared/tokenResponse.ts` と、`oauth.ts` の裸のキャスト 2 か所の置き換えで**両方 +618 B** —— 規則はブラウザ版 `pkce.ts` に既に在り、main には 1 つも無かった。`{"refresh_token":{"a":1}}` の応答 1 つで**働いていた更新トークンが置き換わり**、以後そのサービスは 401 のまま画面は「設定済み」と出していた。`pkce.ts` も同じ関数を読むので両ビルドが同じだけ増える)・2026-09-14 パス 259 後は 11,851,171 B / 3,263,917 B で **byte 単位で不変** (`checkTokenSetForStorage` を呼ぶのは `main/secrets.ts` だけなので、ブラウザ版からは tree-shaking で丸こと落ちる —— 出荷 HTML に 0 件。認可サーバの応答 1 つで全サービスの資格情報が読めなくなる穴を塞いだ)・2026-09-14 パス 258 後の計測: 11,851,171 B / 3,263,917 B (落とした理由を「上限 200 件」から**実際に切った仕組み**へ分けた分と、欄の長さの天井をコード単位から**文字**へ揃えた分で**両方 +434 B** —— 1 件しか送っていない利用者に「上限 200 件」と刷っていた (上限は 200/200/500 なので `sent <= cap` が成り立ち、理由は証明可能に偽だった)。絵文字 33 個の部署名は 33 文字 / 66 コード単位で、旧い天井だと 33 文字で断られていた)・2026-09-14 パス 254 後の計測: 11,850,737 B / 3,263,483 B (一覧から AI へ送る本文の予算を `row.length` (コード単位) から `countChars` (文字) へ移した分で**両方 −3 B** —— 門は両ビルドとも文字で測るのに予算だけがコード単位で、絵文字 10 個の件名 600 行で 2,617 字送った時点で 362 行を落とし、画面は「5000 字までのため」と**成り立たない理由**を述べていた。`lint:charset` に制御・不可視文字の 4 群 (Trojan Source を含む) を述したがゲートなので出荷物には入らない)・2026-09-14 パス 252 後の計測: 11,850,740 B / 3,263,486 B (床と天井の**単位**を揃えた分で**両方 +216 B** —— 「12 文字以上」と 9 か所で述べるマスターパスワードの関門が `password.length` (コード単位) を数えており、`'😀'.repeat(6)` (**実文字数 6**) で満たせていた。`atLeastChars` / `moreThanChars` は **n 文字目で切り上げる** (上限は*拒むために*在るので 100 MB を辿ってはいけない)。下限の規則の写し 2 つは式ごと `meetsPasswordPolicy` へ寄せたので規則は 1 つになった。走査 `ceilingUnitCensus` と対照は出荷物に入らない)・2026-09-14 パス 248 後の計測: 11,850,524 B / 3,263,270 B (パス 249 は検査と文書だけなので **byte 単位で不変**。main の Ollama 許可表を共有台帳 `OLLAMA_READ_PATHS` から**組み立てる**ようにし (手写しの 3 経路をやめた)、Atlassian の欄の天井 3 つを `shared/atlassianSite.ts` へ移して**両ビルドが読む**ようにした分で**両方 +56 B** —— ブラウザ版は token と site に天井が無く、main 側にはその理由 (`btoa` の多バイト文字列) まで書かれていた。ゲート `lint:shared-judgement` と検査・対照は出荷物に入らない。パス 247 は文書だけなので byte 単位で不変だった)・2026-09-14 パス 246 後の計測: 11,850,468 B / 3,263,214 B (デスクトップ版の `getValidToken` が壊れた TokenSet を**生の JSON のまま Bearer として返していた**のを断るようにし (`reason: 'broken-token-set'`)、断りの文面を `brokenStoredCredentialMessage` 1 つに寄せた分で**両方 +29 B** —— `Authorization: Bearer {"refreshToken":"…"}` が相手先 API へ出ていた。呼び出し側の変更は 0 行 (断る器は最初から在った)。実測と対照は検査なので出荷物に入らない)・2026-09-14 パス 245 後の計測: 11,850,439 B / 3,263,185 B (制御文字の規則を `shared/tokenInput.ts` の `hasControlChars` 1 つに切り出し、**両ビルドの保管層** (`vault.setToken` / `secrets.setToken`) に床として置いた分で**両方 +72 B** —— 入口の関門を通らない書き込みが 2 本残っていた (`setOAuthTokens` は IPC ハンドラを経由せず、Google トークン 4 本は保管庫を直接叩く)。**床は JSON の包みの中を見られない**ので、包む側の断りは別に要る)・2026-09-14 パス 244 後の計測: 11,850,367 B / 3,263,113 B (資格情報の入口 2 本を共有の `checkTokenInput` へ通し、`redact.ts` に「ヘッダ名を持たない引用」の規則を 1 本足した分で**両方 +337 B** —— プラットフォームの例外文面 (`Headers.append: "<値>" is an invalid header value.`) は ヘッダ名を含まないので、接頭辞を持たない鍵 (HIBP / VirusTotal の 64 桁 16 進) が丸ごと画面へ出ていた。実測の 10 経路と `<input>` の CR/LF 消毒の境目は検査なので出荷物に入らない)・2026-09-14 パス 240 後の計測: 11,850,030 B / 3,262,776 B (保存済みソルトの床を凍結値 `MIN_STORED_SALT_BYTES` へ分け、生成の `SALT_BYTES = MIN_SALT_BYTES` は残した分で**両方 +8 B** —— 直したのは主に注記の置き場所(危険は使う側に書かれていて、上げる編集をする宣言行には書かれていなかった)。原文の検査は出荷物に入らない)・パス 239 後の計測: 11,850,022 B / 3,262,768 B (封緘した物が自分を作った PBKDF2 の反復回数を覚える —— 凍結値 `LEGACY_KDF_ITERATIONS`・`VaultMeta.recoveryIterations`・`EncryptionMeta.iterations` と `deriveKeyFromMnemonic` / `createPassphraseRecordCipher` の引数化で**両方 +176 B**。`recoverWithMnemonic` が導出に使った回数を書き残していなかった 1 行がこの中で最も重い)・パス 236〜237 後も 11,849,846 B / 3,262,592 B で **byte 単位で不変** (236 は文書だけ。237 の `deriveAesKey` の床 2 行は**出荷物に入らない関数の中**に在る —— レコード封緘の書き込み・解錠の経路はまるごと tree-shaking で落ちており、出荷 HTML に `暗号化は既に有効です` / `レコードは平文に戻しましたが` は 0 件)・2026-09-14 パス 235 後の計測: 11,849,846 B / 3,262,592 B (`shared/lookup.ts` の `lookup` / `has` と 6 つの引き手の配線・`requiredPermissionFor` の `| null` 化と `UNKNOWN_CAPABILITY_PERMISSION` で**両方 +141 B** —— prototype の鍵を `Object.hasOwn` で落とす床。総当たりのゲートは検査なので出荷物に入らない)・パス 232〜234 後は 11,849,705 B / 3,262,451 B で byte 単位で不変 (検査・文書・コメントだけ。最小化でコメントは落ちる)・2026-09-14 パス 231 後の計測: 11,849,705 B / 3,262,451 B (`redact.ts` に発行元の分かる接頭辞を 11 形足した分で**両方 +432 B** —— `github_pat_` (GitHub 細粒度 PAT) / `ntn_` (Notion) / `1//` (Google 更新トークン) / JWT (microsoft-365) の 4 家系は**今日預かっているサービス**の鍵で、裸で本文に現れると素通りしていた。台帳の母集団を `SERVICE_CREDENTIAL_USE` へ移した census は検査なので出荷物に入らない)・パス 229 後は 11,849,273 B / 3,262,019 B (率の非有限の床を `shared/formatters.ts` の `pct` / `pctOrDash` に 1 つ置き、4 つの写し —— `num.ts` の `ratioPctOrDash`・経営サマリー 2 つ・不動産 1 つ —— を通した分で**両方 +26 B**。`digits` を省くと丸めないので**刷る字は 1 文字も変わらない**。走査の絶対の主張と印の標本は検査なので出荷物に入らない)・パス 228 後は 11,849,247 B / 3,261,993 B (要件を外れた食事補助を給与課税の現物給与として**計算に入れ直す** `taxableInKind` と比較表の行・断りの書き換えで**両方 +325 B** —— 要件を満たしていれば 0 なので、そのときの数字はパス 228 より前と完全に一致する)・パス 227 後は 11,848,922 B / 3,261,668 B (既定の帯へ倒した軸を名指しする `defaultBandAxes` / `defaultBandNote` と診断カードの ⚠️ で**両方 +1,046 B** —— 倒し込み自体は残す)・パス 226 後は 11,847,876 B / 3,260,622 B (年初来リターンの下限 `RETURN_FLOOR_PCT` = 事実 と、集約・改善提案・一覧の 3 面の断りで**両方 +1,675 B** —— 上端 (書き手の 1000%) は打ち間違いの門なので読む側では落とさない)・パス 225 後は 11,846,201 B / 3,258,947 B (期が読める行だけを通す漏斗 `readablePeriodRows` と 2 つの断り文・3 面の配線で**両方 +1,074 B**)・パス 224 後は 11,845,127 B / 3,257,873 B (書き手が断る「欄と欄」7 件 —— 貸借対照表の内数 ≦ 親項目 5 件・人件費 ≦ 販管費・連続下落 危険 ≧ 警告 —— を `RECORD_RELATIONS` へ移し、書き手 3 つが台帳を読む分で**両方 +989 B**。走査を綴りから振る舞い (借用) へ移した検査は出荷物に入らない)・パス 223 後は 11,844,138 B / 3,256,884 B (記録の欄と欄の関係を 1 か所に置く `recordRelations.ts` を、画面の入口と復元の入口の両方が読む分で**両方 +873 B**)・パス 222 後は 11,843,265 B / 3,256,011 B (等しくてはならない組 `PARAMETER_DISTINCT` と画面の断りで**両方 +696 B** —— 軸の一覧は `RADAR_AXIS_KEYS` から導くので 15 軸ぶんの写しは出荷物に入らない)・パス 221 後は 11,842,569 B / 3,255,315 B (台帳の欄と欄の順序を見る `parameterOrder.ts`・画面の断り・法人事業税の段を使う前に昇順へ畳む `orderedBusinessTaxLimits` で**両方 +2,623 B**。パス 220 は検査と文書だけなので byte 単位で不変だった)・パス 219 後は 11,839,946 B / 3,252,692 B (食事補助の非課税要件の判定 `mealSubsidyVerdict` と画面の ⛔ で両方 +1,296 B)・パス 218 後は 11,838,650 B / 3,251,396 B (`maxEmployeeSocialInsurance` と社会保険料の ⚠️ の基準で両方 +214 B)・パス 217 後は 11,838,436 B / 3,251,182 B (iDeCo の法定上限 `IDECO_ANNUAL_CAP_MAX` と関門の `max` 2 件・選択肢の断りで両方 +114 B)・パス 216 後は 11,838,322 B / 3,251,068 B (工場プランの 2 欄を素の `<input>` から `GuardedNumber` に替えた分で**両方 -106 B** —— 宣言を表に寄せたので JSX の重複が減った)・パス 215 後は 11,838,428 B / 3,251,174 B (物件フォームの宣言を書き手の隣へ移した分で両方 +133 B —— 一致の検査は出荷物に入らない)・パス 214 後は 11,838,295 B / 3,251,041 B (⛔ の欄が在れば保存しない `saveRefusalNote` と水耕栽培の設備・費用の門で両方 +310 B)・パス 213 後は 11,837,985 B / 3,250,731 B (人材の給与計算 `PAYROLL_READS` 3 段と `data-live-clock` の印で両方 +466 B —— 走査の一般化 `readings()` は検査なので出荷物には入らない)・パス 212 後は 11,837,519 B / 3,250,265 B (貿易の金額 7 欄の `TRADE_SPECS` / `TRADE_READS` と段ごとの断り・輸出の「日本の事実」を別の段に切り出した分で両方 +762 B)・パス 211 後は 11,836,757 B / 3,249,503 B (投資信託の `MF_REFUSAL_SPECS` を 3→12 欄・`MF_READS` を 2→6 段に広げ、予備資金を独立の段に切り出した分で両方 +889 B)・パス 210 後は 11,835,868 B / 3,248,614 B (水循環プランナーの `WC_SPECS` 10 欄 + `WC_READS` 5 段と段ごとの断りで両方 +1,308 B —— 常設ゲート `guardedJudgements.test.ts` は検査なので出荷物には入らない)・パス 209 後は 11,834,560 B / 3,247,306 B (⛔ の「マイナスの値」を段ごとに断る共有の `refusedFields` / `refusalLabels` / `refusalNote` と `RefusedFieldsNote` で両方 +1,484 B —— パス 206 の断りを部品に畳んだので、不動産 4 段 + 投資信託 2 段を足しても増分はこれだけ)・パス 208 後は 11,833,076 B / 3,245,822 B (貿易の率の天井 `MAX_TRADE_RATE` と段ごとの `null` で両方 +816 B)・パス 207 後は 11,832,260 B / 3,245,006 B (率の天井 `MAX_PLAN_RATE_PCT` / `MAX_COST_RATE_PCT` と断り 5 本で両方 +2,419 B)・パス 206 後は 11,829,841 B / 3,242,587 B (都市計画の判定を段ごとに断る `ZONING_READS` / `ZoningRefusal` で両方 +1,722 B)・パス 205 後は 11,828,119 B / 3,240,865 B (財務分析の漏斗 `saneMonthlyKpi` ほか 6 件で両方 +193 B)・パス 204 後は 11,827,926 B / 3,240,672 B (非有限の入口 43 件の消毒・年分の漏斗 `resolveTaxYear`・符号を残す `finiteOr0` で両方 +784 B)・パス 203 後は 11,827,142 B / 3,239,888 B (非有限の入口 14 件を契約どおりに倒した分)・パス 202 後は 11,826,879 B / 3,239,625 B (比較だけの関門 1 件を `nonNeg` に通した分で両方 +20 B)・パス 201 後は 11,826,859 B / 3,239,605 B (消毒の綴り 5 通りを共有の `nonNeg` 1 つに畳んだ分で**両方 -799 B**)・パス 200 後は 11,827,658 B / 3,240,404 B (日付の組み立ての漏斗 `utcMsFromParts` で両方 +102 B)・パス 199 後は 11,827,556 B / 3,240,302 B (課税期間の範囲の関門と画面の断りで両方 +849 B)・パス 198 後は 11,826,707 B / 3,239,453 B (年数の天井 2 つと `jpy` の床・画面の断りで両方 +1,530 B)・パス 197 後は 11,825,177 B / 3,237,923 B (`maxLength` を 16 欄から外し関門を 4 つ足した分で両方 +1,797 B)・パス 196 後は 11,823,380 B / 3,236,126 B (両方 +72 B)・パス 195 後は 11,823,308 B / 3,236,054 B (両方 -29 B)・パス 194 後は 11,823,337 B / 3,236,083 B (**水耕栽培の運転管理 1 サービス分で 両方 +42,223 B** —— 共有の判定・調製・日程と画面 1 枚ぶん。学術コーパスに依らないので LITE も同じだけ増える)・パス 193 後は 11,781,114 B / 3,193,860 B・パス 192 後は 11,780,315 B / 3,193,061 B・パス 191 後は 11,780,034 B / 3,192,780 B・パス 190 後は 11,779,996 B / 3,192,742 B)。天井は CI が両方に掛けている: 16 MB / 4 MB、85% で警告。パス 189 後は 11,778,832 B / 3,191,576 B・パス 188 後は 11,776,126 B / 3,188,874 B・パス 187 後は 11,774,564 B / 3,187,312 B・パス 186 後は 11,771,487 B / 3,184,235 B・パス 185 後は 11,771,393 B / 3,184,141 B・パス 184 後は 11,770,727 B / 3,183,475 B (パス 183 から**両方が 5,168 B 減った** —— テンプレートの SVG の組み立てが 3 写しから 1 つになった分)・パス 183 後は 11,775,895 B / 3,188,643 B・パス 182 後は 11,774,254 B / 3,187,002 B・パス 181 後は 11,765,766 B / 3,178,512 B・前日 2026-09-11 は 11,752,227 B / 3,164,973 B。LITE の余裕は **2026-09-20 (パス 336 後) 実測で警告線まで 56,756 B・ハード上限まで 656,756 B** (パス 335 後は 56,774 B) (2026-09-15 パス 290 後は 95,903 B / 695,903 B —— 4 日で 34,526 B 使った。**次に renderer / shared を 63 KB 足すと CI が警告を出す**) —— CI は **4,000,000 B 超で落とし**、3,400,000 B 超は**警告だけ出して落とさない** (ci.yml にその理由が書いてある: 天井に当たってから気付くと無関係な PR が落ちたように見えるため)。**この 1 文は 2026-09-15 まで「残り約 160 KB」と書いたまま日付を持っていなかった** —— 同じ段落の他の数字はすべて「パス N 後の計測」と測った時を持つのに、**導出値のここだけが無日付で 66 KB 過大**だった。ビルドしないと測れないので verify:arch の live metric にはできない: だから**測った日を書く**) that runs in any browser with no Node/Electron. See `docs/BROWSER_REDESIGN.md`.

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
                         #   32 suite に**suite ごとの床** (実測の 85%) と全 suite 時の合計の床 377 (パス 303。
                         #   パス 322 で shell suite 27 件を足し 350 → 370、パス 323 で kessanTax +7 → 376、
                         #   パス 328 で kessanTax +1 (まとめてに決算公告の要旨が入らない) → 377、
                         #   パス 329 で kessanTax +5 (参考の別紙・法定は 4 枚のまま) → 381 = 実測 449 の 85%)。
                         #   `SERVICE_HUB_E2E_ONLY=desktop,tablet` で一部だけ回せる (知らない名前は落ちる)
npm run perf             # 起動性能ゲート (実 chromium)。起動時の巨大 JSON.parse を検出。
                         #   **成果物が材料より古ければ exit 2** (e2e / e2e:ollama / smoke / smoke:app も同じ判定
                         #   `scripts/lib/artifact-freshness.cjs`。母集団 8 本は `artifactFreshness.test.ts` が
                         #   package.json の e2e* / perf* / smoke* / exp* から導く —— パス 304 まで 3 本を手で並べており、
                         #   e2e:ollama と smoke:app は古い成果物を黙って相手にしていた。exp:* 3 本はパス 305 で)。
                         #   材料 = src/ の ts/tsx/css/html/json + vite.config.ts + scripts/inline-html.cjs +
                         #   tsconfig*.json + package(-lock).json + src/ が import する外の JSON (orchestration/registry.json)。
                         #   2026-09-17 (パス 302) まで src/ しか見ておらず、inline-html.cjs (CSP を組む側) を
                         #   直しても古い standalone.html で緑だった。docs/ と __tests__/ は材料ではない
                         #   フル版と LITE 版の**両方**が要る。vite の emptyOutDir が dist/ を掃除するので
                         #   `build:web && build:web:lite` と続けると**フル版が消えて perf が落ちる** ——
                         #   フル版を退避してから lite を作ること (e2e.yml がその順序を持っている)。
                         #   `build:renderer` も vite なので、走らせるならブラウザ版より**前に**
npm run e2e:ollama       # Ollama 連携 E2E (スタブ Ollama + 実 chromium)。未起動/CORS未許可/接続成功の3状態
                         #   ほか計 7 状態。**undici は CORS を実装しない**ので、no-cors の到達確認が壊れる形は
                         #   単体検査に映らない —— 実ブラウザでしか見えない退行はここだけが捕まえる (パス 304)
npm run ollama           # Ollama CLI (ブラウザ不要・CORS 無縁)。`-- chat <model> "..."` で対話
npm run ollama:setup     # 導入→モデル取得→起動→1往復して確認。足りない段だけ埋める
                         #   `-- --check` で現状確認のみ / `-- --origin <URL>` でブラウザ許可も案内
npm run build:renderer   # tsc -b + vite build only (no packaging)
npm run build            # full desktop build: tsc -b, vite build, electron-builder installers
npm run typecheck        # tsc -b --noEmit --force (uses tsconfig project references)。
                         #   **eslint は型を見ない** (`parserOptions.project` も
                         #   `projectService` も無いので typescript-eslint は型情報なしで走る) ——
                         #   eslint.config.js の冒頭が自分で「Strict TypeScript is the primary
                         #   correctness gate (npm run typecheck)」と宣言しているとおり、
                         #   型の誤りを捕まえる網はこれ 1 つである。覆う範囲は
                         #   tsconfig.json の references から辿る 2 project の include だけ:
                         #   app = src/renderer・src/shared・src/__tests__、
                         #   node = src/main・src/preload・vite.config.ts・vitest.config.ts・
                         #   scripts/generate-dashboard.ts・electron-builder.json。
                         #   最後の 1 つは TypeScript ではなく梱包設定だが、この写しは実物と
                         #   1 項ずつ照合されるので省かずに並べる。
                         #   **include の外の .ts は
                         #   1 行も検査されない** —— 2026-09-15 まで 4 ファイル
                         #   (src/__tests__ の検査 2 本 18 件・vitest.config.ts・
                         #   scripts/generate-dashboard.ts) が外に在り、型の誤りを植えても
                         #   tsc は 0 件だった (パス 278。vitest は esbuild で型を剥がすだけなので、
                         #   走っている検査の中で `undefined` を読んでも通る)。
                         #   母集団は `shared/__tests__/typecheckCoverage.test.ts` が
                         #   両方向に留める (覆われていない .ts が出れば落ち、exclude が
                         #   生えれば「教えろ」と落ちる)
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
                           #   種別の偽装 (雑誌・ブログ・百科事典・目録/書店/検索結果の URL に
                           #   'academic' が付いていないか)、同じ URL は同じ種別 (項目ごとに
                           #   'academic' / 'media' が揺れていないか)。**加えて URL のスキーム** ——
                           #   `http:` / `https:` 以外 (`javascript:` `data:` `file:` ほか) は
                           #   **例外なく落とす**。平文 http は台帳制で、載っていない新しい物は
                           #   落ち、消えた物が台帳に残っても落ちる (双方向)。
                           #   2026-09-15 まで、この行はスキームの規則に触れておらず
                           #   **ゲートより狭く書かれていた** (パス 277。過小申告は
                           #   偽の主張より軽いが、守られている物を守られていないと読ませる)
npm run lint:doi-prefix    # DOI プレフィックス(=登録機関=出版社) とラベルの出版社の矛盾。
                           #   ISSN を埋め込む DOI (APA / Elsevier PII / Wiley j. / SAGE) は台帳 164 誌で、誌の略号を
                           #   持つ DOI (INFORMS / Oxford / Wiley / Springer / Annual Reviews / MIT / Emerald) は
                           #   台帳 153 誌で誌名も照合し、ISSN の検査数字も検算する (1 回しか引かれない誤 DOI を拾う)
npm run lint:charset       # 他文字種 6 ブロック (キリル / ハングル / アラビア / タイ /
                           #   デーヴァナーガリー / ヘブライ) と簡体字の混入
                           #   (CJK は共有ブロックなので字を列挙するしかない)。
                           #   **加えて制御・不可視文字の 4 群** —— C0/DEL・C1・
                           #   **双方向制御 (Trojan Source · CVE-2021-42574)**・不可視文字
                           #   (SHY / ZWSP / U+2060-2064 / BOM)。双方向制御は
                           #   **読める物と走る物が違うソース**を作れるので攻撃手法であり、
                           #   レビューでは見えない。ZWJ / ZWNJ は絵文字の連結に要るので
                           #   **意図して外す**。正当な出現 (NUL の標本・不可視文字を剥がす
                           #   検査の標本・CSV の BOM) は ALLOWLIST に件数と理由つきで載る。
                           #   2026-09-15 まで、この行は制御・不可視の 4 群に 1 字も触れて
                           #   おらず、**ゲートより狭く書かれていた** (パス 279。同じ CLAUDE.md
                           #   の出荷物の節には 2026-09-14 から書かれていたので、
                           #   1 つの文書が同じ事実を一方で述べ他方で落としていた)
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
                           #   (CI では走らせない。定期点検の道具)。
                           #   規則は全部で 7 本 —— 上に書いた 5 本のほかに
                           #   ① **lockfile が読めてパッケージ数が床以上** (実測 647 / 床 400。
                           #   走査が死んで「0 件だから健全」にならないため) と
                           #   ⑥ **台帳の理由が空でないこと** が在る
npm run lint:storage       # ブラウザに残す物の台帳 (IndexedDB 4 / Cache Storage 1 /
                           #   localStorage 22 / sessionStorage 4。cookie と OPFS は 0 件だが走査はする)。
                           #   新しい保存先が黙って増えないこと・バックアップが覆うのは 1 つだけ・
                           #   **媒体そのものが `docs/DATA_PROTECTION.md` の在庫に載っていること**・
                           #   **ハードリセット (すべてのデータを削除) が台帳の全行を覆うこと** (規則 11、パス 136)
                           #   **入口 (`data/localWrite.ts`) へ流れる鍵は、入口の登録が名乗る鍵と一致すること**
                           #   (規則 12・双方向、パス 310 —— 登録は「新しい呼び出し元を足したら鍵をここへ書く」と
                           #   散文で言い、4 つのうち 2 つが書かれないまま鳴らなかった。直接の getItem が同じ鍵を
                           #   名乗って規則 3 を満たしていたため。呼び出しから鍵を解いて突き合わせる)
npm run lint:shell         # **追跡されている `.sh` すべて** (git ls-files。`scripts/` 直下だけを
                           #   読んでいた頃は `tools/deploy.sh` や `scripts/ci/foo.sh` が死角だった ——
                           #   git が使えない環境では `scripts/` 直下に落とすが、黙って 0 件にはしない)。
                           #   規則 6 本: ① bash shebang が 1 行目 ② `set -euo pipefail` が行頭
                           #   (関数の中だけでは「このスクリプトは strict」と言えないので行頭アンカー)
                           #   ③ `bash -n` 構文 ④ **遠隔コードの実行 (`curl | sh`) は台帳のみ** ——
                           #   取得元が入れ替われば任意コードが利用者の権限で走るので、
                           #   「何を・どれくらい固定して・なぜ」を書く (今 2 本: nvm と ollama の install.sh)
                           #   ⑤ **後戻りできない書き込みと秘密の扱いは台帳のみ** (双方向 —— 危ない操作が
                           #   無くなったのに台帳に残っていても落ちる。古い登録は次に足された 1 本を隠す)
                           #   ⑥ **台帳に載った本の `--self-test` を実際に走らせる** (自己テストを書いても
                           #   誰も走らせなければ「在るのに何も守っていない検査」になる ——
                           #   ci.yml に無いゲート・主プロセスを通さない smoke と同じ形)。
                           #   2026-09-15 まで、この行は「scripts/*.sh: bash -n + strict mode」だけで、
                           #   **母集団も規則 ④⑤⑥ も落としていた** (パス 279。落ちていた 3 本が
                           #   供給網・破壊的操作・秘密という一番重い側である)
npm run lint:mutation-scope # 変異検査の「測っていない範囲」の台帳 (広い Stryker disable と、
                           #   **理由が書かれていない pragma** —— 無言の pragma はその行の変異体を
                           #   消すので、測っていない範囲が「100%」として報告される)
npm run lint:regex         # 正規表現の破滅的バックトラック (ReDoS) を実測。worker + 番犬つき
                           #   (モデル応答を解析する assistantMarkdown.ts が主眼。指数のみ)。
                           #   **多項式 (O(n²)) を外した理由は「入力が短いから」ではない** ——
                           #   2026-09-20 (パス 337) まで門の説明文は
                           #   「上限は MAX_ANALYZE_TEXT_CHARS 5000 等なので O(n²) でも 30ms」
                           #   と書いていたが、実物の最大は **MAX_TEXT_PREVIEW_CHARS 200,000**
                           #   (取り込んだファイルの本文) で、そこでは **1 呼び出し 31 秒**だった。
                           #   結論が生きているのは**到達可能性**のため —— 出荷 src の式 588 本で
                           #   250ms を超えるのは 4 本だけで、どれも長い文字列が届かない所に在る
                           #   (ホスト名 / 利用者が打つ基底 URL / base64 のパディング / 同梱の静的データ)。
                           #   **4 本の台帳と実測は `npm run audit:regex-poly`** (CI では走らせない。
                           #   判定が壁時計時間なので —— `audit:floors` と同じ定期点検の道具)、
                           #   台帳の形と「引いている上限が実物の最大か」は
                           #   `regexPolynomialLedger.test.ts` が毎回の npm test で見る
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
                           #   生成ブロックと突き合わせる (shared 156 / 両ビルドが
                           #   import 79 / うち否定で答えられる 37。**この 3 つは
                           #   live metric なので散文だけが古びることはもう無い** ——
                           #   2026-09-15 まで 138 / 44 / 21 と書いたままだった。
                           #   44 / 21 はパス 247 が初めて数えた値で、
                           #   **census 自身の docblock が「その数を散文にだけ書いた」と
                           #   その誤りを名指ししている** (だからパス 248 で生成物にした)。
                           #   パス 268 が走査を直して 61 / 31 になったときも
                           #   床 (113 / 48 / 24) だけが引き直され、散文は据え置かれた)。判定の台帳は
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
npm run ontology:md        # docs/ONTOLOGY.md を src/shared/ontology/ (語彙・facet の公理・法則と執行者) と
                           #   実物 (台帳・ゲート・両ビルドの action の面) から再生成 (生成物 — 手で編集しない。
                           #   `--check` で committed と一致するか。`ontologyDoc.test.ts` が npm test で同じ事を留める)
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
`vitest.config.ts`, `src/main/clients/**` or `src/main/oauth.ts`). `smoke` (Electron の全ページ撮影) is **not** in CI at all.
`e2e` / `e2e:lite` / `e2e:ollama` / `perf` / `smoke:app` **are** wired into `.github/workflows/e2e.yml`, but it does **not run by
default** (Actions 分の節約): trigger it from the Actions tab (`workflow_dispatch`) or by putting the
**`run-e2e` label** on a PR. `e2e:ollama` は 2026-09-17 (パス 304) まで CI の外だった —— Node (undici) は
CORS を実装しないので、no-cors の到達確認が壊れても単体検査は緑のままで、**実ブラウザでしか見えない**退行を
この harness だけが捕まえた (その日の実例: 転送に追随しない規則が no-cors にも重なり、「起動しているが
OLLAMA_ORIGINS 未設定」が「未起動」と診断された)。
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
  error stays inside that page's frame; the sidebar keeps working). The renderer never sees raw tokens —
  **the bridge exposes 15 methods and none of them returns a secret** (`storageProtection` returns counts and
  a mechanism name only). 全 15 件:
  `serviceHub.getVersion / checkUpdate / openExternal / revealInFolder / openPath / setColorScheme / setToken / clearToken / listConfigured / storageProtection / eraseAll / fetchSnapshot / invoke / oauthSupported / authorize`.
  **2026-09-20 (パス 338) まで、この文は 6 件だけを挙げて「it only calls」と書いていた** ——
  落ちていた 9 件には **`eraseAll` (すべてのデータを削除して再起動)**・`revealInFolder` / `openPath`
  (OS のファイル面)・`authorize` (ブラウザを開いて loopback サーバを立てる) が含まれる。
  「renderer から main へ何ができるか」を読む人が**実際より小さい面**を見ることになっていた
  (過小申告は偽の主張より軽いが、攻撃面の側では読み手を油断させる)。列挙と実物は
  `src/preload/__tests__/bridgeStatic.test.ts` が**両方向**に留める。

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
  **2026-09-15 (パス 293) からこの規約には機械が付いている** ——
  `shared/__tests__/absenceSampleCensus.test.ts` が母集団を数え、
  **正規表現の針**で綴りを肯定形で確かめていない物を台帳制にする (両方向)。
  実測: 不在の主張 **1,125 件 / 306 ファイル**。うち針が**日本語の散文**
  (= 他のモジュールが書いた文) である物 **496 件**、その綴りがどこかで
  肯定形でも主張されている物 **240 件**、**されていない物 256 件**
  (うち正規表現 **14 件** = 台帳の全量)。
  **文字列の針 (242 件) は台帳に載せない** —— `toContain` は完全一致なので
  綴りが外れれば**その検査が必ず落ちる**。「当たったつもり」で黙れるのは
  正規表現の側だけで、**この非対称が台帳の範囲を決めている**。
  規約が 2026-08-25 から在ったのに機械が無かったのは、
  このリポジトリが繰り返し直してきた「散文で述べた規則は落ちない」形である。
- **規則は散文ではなく `src/shared/ontology/` に置く** (2026-09-19 · パス 321)。新しい法則を学んだら
  `laws.ts` に「何を守るか・出典・執行者」を足す (執行者が prose だけなら文書の「機械の無い法則」に集まる)。
  サービスの facet に新しい関係が見えたら `serviceFacets.ts` の公理に (成り立たないサービスは理由つきの
  `exceptions` へ —— 双方向)。外部サービスへの書き込みを足すときは `shared/api/<service>.ts` に
  `checkX` → `xInit` → `parseCreatedX` を置き、main と `saasWriteWeb.ts` はそれを通す
  (`writeFieldLimits.test.ts` の LEDGERS に `via` 行)。**両ビルドに同じ判定を 2 度書かない。**
- **対照を回すまで、検査は信用しない。** 守っている物を実際に壊し、狙った項目が
  落ちることを見る。**鳴らない対照は「合格」ではなく「その検査についての報せ」である。**

## Branching

Active development for Claude Code sessions happens on the branch designated in the task prompt
(e.g. `claude/claude-md-docs-qqUAT`). The default branch is `main`.
