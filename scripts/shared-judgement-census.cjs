#!/usr/bin/env node
/**
 * 「**述語は共有したが、no と言われたあとの動作が両ビルドで違う**」の**母集団を数える**。
 *
 * この本が作るのは**分母**であって、欠陥の一覧ではない。共有モジュールが否定で
 * 答えられるとき、デスクトップ版とブラウザ版が同じように断っているかは
 * **読まないと決まらない** —— 対称な物 (`scanTarget`)・意図して非対称な物
 * (`ollama` の endpoint は main が固定・ブラウザ版が可変)・本物の欠陥
 * (`vaultToken`・パス 246) の 3 つが混ざる。だから本は「何件在るか」だけを
 * 決定的に出し、「どちらか」は下の `VERDICTS` と `docs/REMAINING_WORK.md` の
 * 散文が受け持つ。**数は機械が、判断は人が。**
 *
 * ## なぜ生成物にしたか (2026-09-14 · パス 248)
 *
 * パス 247 がこの母集団を初めて数え (44 / 21)、**その数を散文にだけ書いた**。
 * 同じことをパス 85 と パス 95 で 2 度やって 2 度腐らせている ——
 * 手で書いた表は誰も検算せず、パス 85 の台帳は母集団が 4 倍ずれていた。
 * だから件数と顔ぶれを機械に持たせ、**両方向**に鳴らす:
 *
 *   - 母集団に入ったのに `VERDICTS` に無い  → 鳴る (黙って増えない)
 *   - `VERDICTS` に在るのに母集団から消えた → 鳴る (死んだ判断を残さない)
 *
 * 判断そのものは機械化できない。**母集団が変わったことは機械が言える。**
 *
 * ## 走査の規則
 *
 * 1. `src/shared/` の .ts / .tsx (`__tests__` と `.d.ts` を除く) を数え上げる。
 * 2. そのうち `src/main/` と `src/renderer/` の**両方**から import されている物
 *    (どちらも `__tests__` を除く)。**モジュール単位**で見る —— シンボル単位に
 *    すると パス 246 の欠陥 (main が `hasUsableAccessToken`、renderer が
 *    `bearerFromStoredToken`) が母集団から落ちる。パス 247 でそれを実測している。
 * 3. そのうち export が**否定で答えられる**物 (`return null` / `return false` /
 *    `ok: false`。コメントと文字列は落として見る)。
 *
 *   node scripts/shared-judgement-census.cjs              表を再生成して書き戻す
 *   node scripts/shared-judgement-census.cjs --check      再生成が committed と一致するか
 *   node scripts/shared-judgement-census.cjs --self-test  検査そのものの対照 (陽性・陰性)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOC = path.join(REPO_ROOT, 'docs', 'REMAINING_WORK.md');
const SRC = path.join(REPO_ROOT, 'src');

const BEGIN =
  '<!-- shared-judgement-census:begin — scripts/shared-judgement-census.cjs が生成する。手で編集しない (再生成は引数なしの node scripts/shared-judgement-census.cjs。npm run lint:shared-judgement は check だけ) -->';
const END = '<!-- shared-judgement-census:end -->';
const BEGIN_TAG = '<!-- shared-judgement-census:begin';
const HEADER = '| shared モジュール | main | renderer | 判定 |';
const RULE = '| --- | ---: | ---: | --- |';

/**
 * 走査の生死の床。**0 件を「問題なし」と読まない** —— 走査が壊れた
 * (import の綴り・src の場所替え) ときに静かに通らせないため。
 * 実測 (2026-09-15 · 到達を閉包で見るようにした後) は 142 / 61 / 31 なので、
 * その 8 割弱を床にする (パス 268 まで 1 ホップで 138 / 44 / 21 と数えていた)。
 */
const MIN_SHARED = 113;
const MIN_BOTH = 48;
const MIN_JUDGEMENT = 24;

/** 否定で答えられる形。**過剰に拾う** (分母は多い側に外す)。 */
const NEGATIVE = /return\s+null\b|return\s+false\b|ok:\s*false/;

/**
 * 判定の台帳。**鍵は母集団と一致しなければならない (両方向)。**
 * 値は「読んだ結果」か `未読`。読んでいない物に「対称だろう」と書かない ——
 * それは判断ではなく願望である (パス 247 の方針)。
 */
const VERDICTS = {
  buildDestinations:
    '対称 —— というより **main はこのモジュールの問いを 1 度も発しない** (実測・2026-09-25 パス 455 / 457 で数え直した)。'
    + '母集団に入ったのは `credentialSlotUnreadNote` (`string | null`) を足したためだが、'
    + '**`src/main` / `src/preload` からの直の import は 0 件**で、走査に映ったのは*閉包*の 1 辺だけ —— '
    + '`shared/paperAccount.ts:69` の `import type { BuildKind }` である。**型だけの辺**なので'
    + 'ビルドの時点で消え、`paperAccount` はこのモジュールの値を 1 つも読まない '
    + '(export を 1 つずつ走査して 0 件)。しかも `paperAccount` を読む main 側の物は'
    + '**検査 1 本だけ** (`main/clients/__tests__/paperAccountReality.test.ts`) で出荷コードではない。'
    + 'したがって「否定で答えたあとの動作」が両ビルドで割れる道は**原理的に無い** —— '
    + 'このモジュールは逆に、**実行形態ごとに別の答えを出すために在る** '
    + '(読み手の数は左の列が数える。`null` は「ブラウザ版には言うことが無い」という答えである)。'
    + 'その答えの正しさは `pages/__tests__/{googleOAuthPasteBuildGate,credentialSlotBuildGate,proxySectionBuildGate}.test.ts` と'
    + ' `components/__tests__/{googleConnectCardBuildGate,exportActionsBuildGate}.test.ts` が両方の実行形態を実際に描いて留める'
    + ' (パス 457 で足した `googleLiveScopeNote` / `googleSignInUnsupportedNote` はブラウザ版が'
    + '**実際に外へ送る**ことを述べる側なので、逆向きの証拠も `renderer/__tests__/browserSendClaimCensus.test.ts` が持つ。パス 458 の `exportCopyLabel` も同じ形 —— ブラウザ版の書き出しが返す `path` はファイル名だけなので、「保存場所」と名乗る札を実行形態ごとに分ける。パス 459 の `proxyRequiredNote` は**ブラウザ版でだけ言う**側で (main は各サービスへ直接つなぐので、そこで「Worker を建てろ」と言うと偽の前提になる)、実際に描くのは `components/ProxyRequiredNote.tsx` 1 つ・振る舞いは `pages/__tests__/proxyRequiredOnScreen.test.ts` が 3 つの実行形態で見る)。',
  apiResponse:
    '対称 (実測・2026-09-23 パス 419 で数え直した) —— このモジュールが母集団に入ったのは、'
    + '`apiNumberOf` (第三者が文字列で返す数の読み手) を足して「否定で答えられる」'
    + '述語が増えたため (パス 416)。**しかし両ビルドの食い違いは無い**: renderer が'
    + 'このモジュールから直接読むのは **2 種類だけ** —— `parseJsonText` '
    + '(`null` を返さず**投げる**側) と `displayField` である。'
    + '★ **読み手の一覧はここに書かない** —— `displayField` の呼び手は '
    + 'パス 417 の 2 つからパス 419 で 7 つへ増えた (保管した自由文の天井を 5 画面に通した)。'
    + '数は左の列が数え、この欄は**なぜ対称なのか**だけを述べる '
    + '(名前を並べると、増えた日に散文だけが古びる)。'
    + '**`displayField` は `null` を返さない** —— 非文字列は空文字・長すぎる値は天井 + `…` で、'
    + '「no」と言う枝そのものを持たないので両ビルドで割れる余地が無い。'
    + '`null` を返す読み手 (`finiteNumberOf` / `apiNumberOf` / `optionalString` / '
    + '`objectRows`) に両ビルドが届く道は `shared/api/*.ts` '
    + '(cursor ほか) **ただ 1 つ**で、そこは実装が 1 つなので「no のあとの動作」も 1 つしかない。'
    + '残りは `src/main/clients/` の 15 本が読む main 専用の経路で、'
    + '**ブラウザ版はそれらのクライアントを 1 行も読み込まない** (パス 262 / 412 で実測)。'
    + 'つまり非対称になりうる組が今日 0 件である',
  constantTimeEquals:
    '対称 (実測・2026-09-20 パス 331) —— OAuth の `state` を比べる定時間比較を shared の 1 つに畳み、'
    + '両ビルドは同じ関数を別名 (`safeStateEquals`) で export する '
    + '(`stateEqualsParity` が `===` で同一性を留める —— 写しが再び生えれば落ちる)。'
    + '**畳む前は等価ですらなかった**: main は `Buffer.from(s,\'utf8\')` → `timingSafeEqual` で、'
    + 'UTF-8 への変換が**孤立サロゲートをすべて U+FFFD へ潰す**ため、実測 4,330,561 組のうち '
    + '4,192,256 組 (96.8%) で答えが割れた (base64url の字だけなら 0 組なので、今日の実害は 0)。'
    + '**false の後の動作は両ビルドで違うが、どちらも流れを止める** —— main は '
    + "`classifyCallback` が `{ kind: 'state-mismatch' }` を返してコールバックを捨て、"
    + 'ブラウザ版は `exchangeGoogleCode` が `state が一致しません — CSRF 攻撃の可能性があります` を '
    + 'throw してトークン端点へ**行かせない**。運び方 (戻り値 / 例外) はそれぞれの流儀で、'
    + '**「交換しない」という結論は同じ**なので非対称ではない',
  advisorQuestionLimits:
    '対称 (実測・パス 251 / パス 285 で文も閉じた) —— checkAdvisorQuestion の 3 つの理由 '
    + "(empty / too-long / control-chars) を呼ぶ所 3 つすべてが 1 つずつ扱う "
    + '(main の stocks / business、ブラウザ版の web-shim)。'
    + ' ★ パス 285 まで**同じ条件に文が 2 通り在った** —— main の 2 か所が英語 '
    + '(`question is required` / `question exceeds 1000 chars`)、ブラウザ版の 2 か所が'
    + '日本語。main の文は safeErrorMessage を通って**そのまま画面へ出る** '
    + '(redact.ts は伏字にするだけで翻訳はしない) ので、**日本語の画面にだけ英語が'
    + '出て**、同じ操作がブラウザ版では日本語で断られていた。'
    + '`ADVISOR_QUESTION_MESSAGES` (shared/advisorQuestionLimits.ts) に 3 文を置き、'
    + '4 か所すべてが台帳を読む —— **運び方は変えていない** (main は今も throw、'
    + "ブラウザ版は今も err('action_failed', …))。docblock が「呼び出し側がそれぞれの"
    + '**流儀**で伝えられるように」と述べた決定はそこに在るので、それは守った。'
    + ' ★ 重さ: この組は `scanTarget` より**軽い** —— 判定は 2026-08-25 から 1 つで、'
    + '写しだったのは文だけなので安全の主張は乗っていない (HIBP は述語が写しで、'
    + '片側の trim が落ちて偽の安心を返した)。同じ家系でも重さは分けて書く。'
    + '母集団はパス 251 で 118 件と測った ★ パス 451 で main 側が 2 → 3 になった —— `emotions` が入った。「鍵が未設定」の断り (`MISSING_ANTHROPIC_KEY_MESSAGE`) も**同じ家系の 5 組目**で、main の `emotions` だけが英語 (`Anthropic API key required for analyze-text`)・ブラウザ版の 3 つが日本語だった。**パス 284 / 285 の census がこれを見なかったのは「両ビルドに双子が在る断り」を数えたから** —— `stocks` / `business` は main 側に断りが 1 つも無かったので、対を数える走査の母集団に入らない (パス 450 と同じ死角)',
  rfc2822:
    '対称 (実測・2026-09-19 パス 321) —— `buildRfc2822` / `isSafeHeaderValue` を shared の 1 つに畳み、'
    + '両ビルドは同じ関数を re-export する (`refusalTwins` が `===` で留める —— 写しが再び生えれば落ちる)。'
    + '断り (`RFC2822_HEADER_UNSAFE` の throw) の後の動作は両ビルドとも「上がった Error をそのまま'
    + '呼び出し側へ」: main は `createDraft` / shopify の `syncToGmail` が投げて IPC の `err()` へ、'
    + 'ブラウザ版は `createGmailDraft` が投げて `invoke` の `withFloor` へ。到達は '
    + 'shared/api/google.ts の `gmailDraftInit` 経由 (両ビルド + shopify) と re-export の 2 本',
  'api/cloudflare':
    '対称 (実測・2026-09-19 パス 321) —— 欄の判定 (`checkDnsRecord` / `checkPurge`)・本文・URL・'
    + '封筒 (`readCloudflareEnvelope`: `success !== true` を断る) を両ビルドが同じ関数で通る。'
    + 'それまで封筒の条件は main が falsy・ブラウザ版が `!== true` と違い、文も '
    + '「unknown Cloudflare error」/「unknown error」で割れていた (`CLOUDFLARE_UNKNOWN_ERROR` の 1 つへ)。'
    + '断りの後は両ビルドとも投げる: main は serviceId つきの FetchError `cloudflare <message>`、'
    + 'ブラウザ版は Error `Cloudflare: <message>` —— 運び方 (例外の型) だけが流儀。'
    + 'main の読み (user / zones) も同じ封筒の判定と `CLOUDFLARE_API` を通る',
  'api/slack':
    '対称 (実測・2026-09-18 オントロジーの組み直し) —— `readSlackPost` の `ok: false` '
    + '(Slack は HTTP 200 でも失敗を返す) を両ビルドが**投げて**断る: main は '
    + "FetchError `slack <error>`、ブラウザ版は Error `Slack: <error>`。運び方 (例外の型) "
    + 'だけが流儀で、条件と error の綴りは 1 つ。`ts` の無い ok:true は `requireString` が'
    + '両ビルドで同じ文で投げる (main はそれまで \'\' に倒していた —— 揃えたときに要求する側へ)。'
    + '消費者は main の sendMessage と saasWriteWeb の sendSlackMessage の 2 つだけ',
  'api/cursor':
    '対称 (実測・パス 250 / パス 263 で 1 → 3 に増えた) —— 両ビルドが同じ '
    + '`fetchCursorSnapshotWith` を呼び (main は clients/cursor.ts、ブラウザ版は '
    + 'network/liveRead.ts)、否定を返す 3 つ (`acceptRateOf` → null / '
    + '`buildCursorSnapshot` の totals 3 欄 → null / `cursorIntakeNote` → null) の'
    + '**消費者はどれも CursorPage 1 つだけ**で、その画面は両ビルドで同じ 1 本の '
    + 'ソースである (renderer は 1 つ)。パス 263 で足した `readRows` の `read: false` は'
    + '**このモジュールの外へ出ない** (`normalizeMembers` / `normalizeUsage` / '
    + '`normalizeSpend` が `state` に畳んでから返す)。応答の上限も '
    + 'MAX_PROXY_RESPONSE_BYTES = MAX_HTTP_RESPONSE_BYTES で 1 つ',
  assistantLimits:
    '対称 (実測・パス 252) —— latestTurnTooLong の 4 つの消費者 (main の chat / chatAll、'
    + 'ブラウザ版の callAssistantChat / callAssistantChatAll) がすべて 1 つずつ断り、文面も '
    + 'inputTooLongMessage 1 つ。**ただし system の天井の単位が割れていた** —— main は '
    + '`.slice(0, MAX_SYSTEM)` (コード単位)・ブラウザ版は `clampToCeiling` (文字)。'
    + '絵文字 50,000 字の system で main 30,000 字 / ブラウザ版 50,000 字。パス 252 で直した',
  inputCeiling:
    '対称 (実測・パス 281 で測り直した) —— 天井と床の判定そのもの (countChars / '
    + 'clampToCeiling / atLeastChars / moreThanChars)。否定 (false) はどのビルドでも'
    + '「天井を超えていない」「床を満たさない」の 1 つの意味しか持たず、'
    + '**動作を決めるのは呼ぶ側**である。'
    + ' ★ **パス 281 の訂正**: ここには「呼ぶ側の対称性は ceilingUnitCensus.test.ts が'
    + '母集団で見る (両方向の台帳)」と書いてあった —— **その検査は呼ぶ側の対称性を'
    + '見ていない**。あちらが数えるのは「文字で数えると宣言した定数が `.length` の比較か'
    + '`.slice(` の引数に現れる」箇所、つまり**単位**であって、ビルド間の非対称ではない'
    + '(あちらの冒頭が自分で「数えていなかったのは単位である」と述べている)。'
    + '`controlChars` (パス 280) と同じ「別の物へ預けた」形。'
    + ' ★ 実測 (パス 281): 4 つの述語のうち**ビルドの境を越えるのは 2 つだけ** —— '
    + '`countChars` と `clampToCeiling` は main (assistant / skills / emotions / ollama / '
    + 'templates) と web-shim の両側から呼ばれる。'
    + '`atLeastChars` / `moreThanChars` は**main からも web-shim からも 1 度も呼ばれない** '
    + '(2026-09-23 · パス 422 に再実測して 0 件)。'
    + ' ★ **パス 422 の訂正**: ここには「呼び手は `renderer/security/vault.ts` **1 ファイルだけ**」'
    + 'と書いてあった —— **今日の実測は 9 ファイル**である (入口の天井が `.length` から '
    + '`moreThanChars` へ移った分)。**判定は変わらない**が、散文が名前を並べていたので'
    + '数が動いた日に偽になった (パス 419 / 421 と同じ家系)。**左の数は importer 全体を数える** —— '
    + '名前を並べるのをやめ、非対称かどうかを決める事実 (main 側の呼び出しが 0 件であること) だけを書く。'
    + 'デスクトップ版にマスターパスワードは無く、記録の入口は renderer 側にしか無いので、'
    + '**この 2 つに main 側の双子が存在しない**。'
    + '越える 2 つについては天井の定数が `shared/` に 1 つずつ在り、'
    + '**同じ定数を両側が読む** (ollama の prompt/system は `shared/ollama.ts`・'
    + 'assistant は `shared/assistantLimits.ts`・emotions は `shared/emotionsLimits.ts`)。'
    + '数の一致は `ceilingLiteralCensus` が、単位の一致は `ceilingUnitCensus` が見る',
  atlassianSite: '**非対称だった → パス 248 で直した** (述語は共有・欄の天井は main だけ)',
  emotionsLimits:
    '対称 (実測・パス 254) —— analyze-text の門は両ビルドとも '
    + '`countChars(text) > MAX_ANALYZE_TEXT_CHARS` (main/clients/emotions.ts:313 / web-shim.ts:733)、'
    + 'log-mood の note も同じ形 (emotions.ts:220 / emotionsWeb.ts:172)。'
    + 'packAnalyzeText の否定 (included === 0) の消費者も GmailPage / SlackPage の両方が '
    + '押せなくする。**ただし予算を積む単位が割れていた** —— 門は文字で測るのに '
    + 'packAnalyzeText は `row.length` (コード単位)。絵文字 10 個の件名 600 行で '
    + '2,617 字送った時点で 362 行を落とし、画面は「5000 字までのため」と '
    + '**成り立たない理由**を述べていた。パス 254 で countChars へ直した',
  eraseReport:
    '意図した非対称 (実測・パス 252) —— 報告の型と文面は共有で、否定 (allDeleted が偽) の扱いも '
    + '両ビルドで同じ (残った物を名指し・「データは残っています」・再読込/再起動をしない)。'
    + '**消す順序だけが逆向き**: ブラウザ版は保管庫を最後 (記録が平文の IndexedDB なので「保管庫'
    + 'だけ新しく記録は前の人の物」を避ける)、デスクトップ版はトークンを先頭。デスクトップ版は '
    + 'atRest.ts の封筒 1 組でトークンも状態ファイルも同じ強さなのでその非対称が起きず、'
    + 'process が途中で死んだときに残るのは「遠隔から使えるトークン」か「局所で読める記録」か'
    + 'の選択になる。前者のほうが重いのでトークンを先に消す。理由を desktopEraseTargets へ書いた',
  externalUrlGate:
    '閉じている (実測・パス 241 で 3 経路 → パス 291 で 4 経路) —— 否定 (`null`) の扱いは '
    + '4 経路すべてで「開かない」の 1 つ: main.ts の `app:openExternal` と '
    + 'setWindowOpenHandler、ブラウザ版 web-shim の同名の polyfill、そしてパス 291 で足した '
    + '`oauth.ts` の authorize URL (投げて中断する)。 ★ **その 4 本目に twin は無い** —— '
    + 'ブラウザ版の `authorize` は `not_supported` を返すだけで、貼り付け式 PKCE '
    + '(`renderer/oauth/pkce.ts`) は URL を画面に出し**利用者が自分で開く**ので、'
    + '「この authorize URL を外部ブラウザへ渡してよいか」という問いを発するのは main だけ。'
    + 'だから非対称になりようがない (`depreciation` の「問いを発しない」と同じ形だが、'
    + 'あちらは辺が定数だけ・こちらは片側の実装が存在しない)。'
    + '★ **パス 298 で 4 → 6 経路。** 足した 2 つは画面の `<a>` で、'
    + 'プラットフォームが自分で辿る属性 (`EligibilityChecker` / `WelfareSchemeCard`)。'
    + 'それまで台帳の生の値を属性に置いており、React のクリック handler で打ち消しても'
    + '中クリックや右クリックの「新しいタブで開く」は関門の外だった '
    + '(「調べた物と使われる物が別」—— パス 291 / 295 / 296 と同じ家系)。'
    + '否定の扱いは**両方とも同じ 1 つ** —— link を描かずに ⚠ の文を出す。'
    + 'この 2 つは renderer だけの経路だが、main 側に双子は在りようがない '
    + '(デスクトップ版も同じ renderer を描く) ので非対称ではない。'
    + '母集団は `shared/__tests__/followableUrlCensus.test.ts` が両方向に留める',
  freeeIntake:
    '意図した非対称 (実測・パス 268) —— 否定で答える 3 つ (`dealIntakeNote` / '
    + '`dealIntakeSheetNote` / `dealIntakeImportNote`) の**消費者は renderer だけ** '
    + '(FreeePage / bankSubmission / docImports)。main が import するのは '
    + '`NO_DEAL_INTAKE` と型だけで、**負で答える 3 関数の呼び出しは src/main・'
    + 'src/preload で実測 0 件**。ただし非対称は 1 段上に在る —— '
    + '落ちた件数を数える `FreeeDealIntake` を**作れるのは main の freee.ts だけ**で、'
    + 'ブラウザ版に freee の live 読みは無い (読むのは cursor だけ)。だから'
    + 'ブラウザ版の 3 つの消費者は常に `NO_DEAL_INTAKE` を見て `null` を返す '
    + '(注記が出ない)。**原因は「判定の非対称」ではなく「クライアントの不在」**で、'
    + 'funding (パス 265) と同じ形である',
  funding:
    '一部読んだ (パス 265) —— 否定で答える 2 つのうち、`fundingLinkSource` は '
    + '**両ビルドが同じ実装を読む** (画面が 1 つしか無いので、文言も判定も共有)。'
    + 'ただし `sample` を作れるのは**デスクトップ版だけ**である —— ブラウザ版の '
    + 'web-shim は funding に枝を持たず `not_implemented` を返すので、画面は同梱の '
    + "控え (`accountingSource: 'none'`) を見続ける。**意図した非対称**で、"
    + 'その原因はデスクトップの fetcher が見本の Map を渡すこと (Phase 6 の '
    + '実 API 差込みまで) のほうに在る。もう 1 つ (`isSpecifiedIncome` 系の判定) は未読',
  httpLimits:
    '対称 (実測・パス 282 で総当たりにした) —— 呼び出し側の網は両ビルドに在る '
    + '(パス 249 で訂正。ブラウザ版は webShimTimeouts.test.ts)。'
    + ' ★ パス 248 は「手で選んだ 3 経路だけで母集団の総当たりではない」と'
    + '**自分で認めていた**。パス 282 でその総当たりをやったら、'
    + '**認めていた穴の中に生きた欠陥が 1 件**在った —— `main/main.ts` の '
    + '`app:checkUpdate` が `AbortSignal.timeout(10_000)` という**裸の数**で、'
    + 'ブラウザ版の同じ口 (`web-shim.ts` の `checkUpdate` → `timedFetch`) は '
    + '`DEFAULT_HTTP_TIMEOUT_MS` (30 秒) を読んでいた。**同じ問いに 3 倍違う締切**で、'
    + '遅い回線で先に諦めるのは「新しい版が出た」を受けて実際に更新できる'
    + '**デスクトップ版**の側だった。しかも同じ関数の 3 行下の注記が '
    + '2026-08-31 に**本文の上限**の同じ食い違いを直したときのもので、'
    + 'そこに「同じ問いに答えが 2 つある状態を残さない —— 実行対象が違うだけで'
    + '判断が変わる理由が無い」と書いてある —— **その直しは 1 行手前で止まっていた**。'
    + ' 直しと同時に `shared/__tests__/deadlineCensus.test.ts` が母集団を走査する: '
    + '締切を作る 4 形 (`AbortSignal.timeout` / `withBodyDeadline` / `withTimeout` / '
    + '`timeoutMs`) の時間の引数が**名前**であること (値の一致は要求しない —— '
    + '`AI_CHAT_TIMEOUT_MS` の 2 分のように意図して違う締切は在る。'
    + '名前が付いていれば理由が定義の隣に書ける)。'
    + '実測 24 呼び出し・裸の数 0 件・例外の台帳 0 件',
  hydroponicsControl:
    '非対称は起きない (実測・パス 268) —— 否定で答える 7 つ (`readingFromStored` / '
    + '`batchFromStored` / `batchSchedule` / `nextSolutionChange` / '
    + '`lowPotassiumSwitchDate` / `latestReading` / `isBatchState`) の**消費者は '
    + 'renderer だけ** (hydroponicsLog.ts / HydroponicsPage.tsx —— **左の数は importer 全体を数えるので、'
    + 'この 2 本より多い**。2026-09-23 (パス 421) に 5 → 6 になったのは `OverviewPage.tsx` が '
    + '`cropIdText` を読んだためで、それは `null` を返さないので 7 つには入らない)。main が import するのは '
    + '`buildHydroponicsSnapshot` と型 2 つだけで、その関数は '
    + 'READING_FIELD_SPECS / DEFAULT_* / DEFAULT_CROP_LIST を**射影する純関数**'
    + ' (否定で答える関数を 1 つも呼ばない —— 実測)。測定記録とロットは業務レコード '
    + '(IndexedDB) に在り main は触らないので、**main 側がこの問いを 1 度も発しない**',
  isoDate:
    '対称 (実測・パス 256) —— 負で答える関数は 8 つだが、**両ビルドが呼んでいるのは 2 つだけ** (main/preload 側の消費者を機械的に数えた):'
    + ' (1) `isCalendarDate` + `calendarDateMessage` —— main/clients/emotions.ts:212 と renderer/data/emotionsWeb.ts:177 が**同一の行**で投げる (`throw new Error(calendarDateMessage(\'date\'))`)。'
    + ' (2) `isoDateFromTimestamp` —— main/clients/stocks.ts:776 と renderer/data/stocksWatchlistWeb.ts:194 がともに `?? \'\'` で空文字に倒す。いずれも**見本のローソク生成の中**で、入力は `Date.now()` ± 日数なので `null` の枠は実質到達しない。'
    + ' 残り 6 つ (`parseIsoDate` / `isCalendarMonth` / `isCalendarDateOrMonth` / `parseTimestamp` / `addIsoDays` / `isoDaysBetween`) は **main/preload 側の消費者が 0 件** なので、ビルド間の非対称は**原理的に起きない**。 ★ **2026-09-22 (パス 394) に 9 つ目 `isoMonthOf` が増えた** —— 消費者は `main/clients/freee.ts` **だけ** (renderer は 0 件) なので、こちらも非対称は起きない (**片方のビルドしか呼ばない**)。ブラウザ版の bundle からは tree-shaking で落ちることを 両方組んで実測した (+0 B)。上の「負で答える関数は 8 つ」はこの行が足された時点の数で、**今は 9 つ**である。'
    + ' ★ 台帳の粒度について: この台帳は**モジュール**単位で「両ビルドがimport」を数えるが、非対称が宿るのは**両ビルドが呼ぶ関数**だけである。isoDate はその差が最も大きい例 (33 のimport元・負で答える 8 関数・境界を越えるのは 2 つ)。 ★ **2026-09-22 (パス 410) に 10 個目 `displayDateOf` が増え、main 側の import 元が 3 → 8 になった** (`drive` / `github` / `microsoft-365` / `notion` / `wordpress` の 5 client を日付の読みへ寄せた)。**これは非対称ではなく、設計した対である** —— 境界 (main の client) が `string | null` へ正規化し、画面 (renderer) が同じ module の `dateText` でその `null` に**理由を与える** (「日付が読めません」)。`displayDateOf` を呼ぶのは main 側と `shared/ollama.ts` だけ、`dateText` を呼ぶのは画面だけで、**同じ関数が両側で違う扱いを受ける形は 1 つも無い** (実測)。`dateText` は `string | null` を受けて必ず文字列を返すので、そもそも否定で答えない。',
  ollama: '**非対称だった → パス 248 で直した** (許可経路の台帳を読むのは renderer だけ)',
  aiEndpoint:
    '対称 (実測・パス 269) —— 直接の import は **両ビルドとも 0 件** (表の 0 / 0)。'
    + '越境するのは shared を 2 段たどった先だけで、辿ると否定は 1 つに絞れる: '
    + '`normalizeAiBaseUrl` の `{ok:false, reason}` を読むのは `ai/providers.ts` の '
    + '`resolveBase` **だけ**で、そこは `buildRequest` の中に在り、両ビルドは `runAiChat` '
    + '(main/clients/assistant.ts:44 / web-shim.ts:188) からそこへ入る。'
    + '**投げたあとの動作が一致する**: main は `action:invoke` の catch が '
    + '`{code:\'action_failed\', message: safeErrorMessage(err)}`、ブラウザ版は '
    + '`err(\'action_failed\', e.message)` で、その `err()` 自身が '
    + '`redactForMessage(message, ERROR_MESSAGE_MAX_CHARS)` を掛ける —— '
    + '**同じ関数・同じ天井**なので code も伏字も文面の長さも同じ (serviceAdvisor と同じ形)。'
    + ' ★ ただし `chatAll` の**提供者ごと**の伏字だけは、2026-09-15 まで '
    + '`redactForMessage(msg, 300)` という**字面がビルドごとに 1 つずつ**在った '
    + '(パス 167/250/252 と同じ家系)。パス 269 で `MAX_ENSEMBLE_ERROR_CHARS` を '
    + '`shared/assistantLimits.ts` に置き、両ビルドがその名を読むようにして '
    + '`assistantTurnsParity.test.ts` に字面の再登場を禁じる門を足した。'
    + ' もう 1 つの輸出 `isLoopbackHostname` は越境しない —— 唯一の読み手 '
    + '`shared/proxyEndpoint.ts` の消費者が renderer だけ (network/proxy.ts / SettingsPage.tsx) である',
  controlChars:
    '対称 (設計・パス 269 で実測) —— 輸出は `hasControlChar` **1 つだけ**で、'
    + '`false` の意味はどのビルドでも「制御文字を含まない」の 1 つしか持たない。'
    + '**`true` のあと何をするかは呼ぶ側の持ち物**なので、判定はここでは閉じている '
    + '(`inputCeiling` と同じ形)。'
    + ' 呼び手は実測 6 件で、そのうち**越境するのは 2 件だけ**: '
    + '`atlassianSite` (パス 248 で非対称を直した) と `aiEndpoint` (この pass で対称と実測)。'
    + '残り 4 件は renderer 側にしか読み手が居ない —— `proxyEndpoint` '
    + '(network/proxy.ts / SettingsPage.tsx)・`renderer/data/businessUnits.ts`・'
    + '`renderer/data/bankSubmission.ts` は場所からして renderer、`hydroponicCrops` は '
    + '`hydroponicsControl` 経由だが**それ自身が別の行として未読**なのでここでは断じない。'
    + ' ★ **パス 280 の訂正**: ここには「`shared/tokenInput.ts` の `hasControlChars` '
    + '(複数形) は別のモジュールで、名前が似ているだけである」と書いてあった —— '
    + '**それは読み足りなかった**。名前が似ているだけでなく、**同じ判定の 2 つ目の実装**'
    + 'だった (片方は正規表現の文字クラス・もう片方は文字ごとの走査で、どちらも '
    + 'C0 と DEL を見る)。しかも読む側は資格情報の入口と保管層の床である。'
    + ' ★ 範囲そのものをここに書かない —— `lint:forbidden` が「共有モジュールの外で'
    + '制御文字の判定を書き直した」として落とす (パス 280 で実際に落ちた。'
    + '**判定について書いた散文が、判定の写しと見分けられなくなる**)。'
    + ' 2 つは**ほんとうに一致していた** —— BMP のスカラー値すべて + astral + '
    + 'lone surrogate + 貼り付けで混ざる形、計 63,504 標本で食い違い 0 件 (実測)。'
    + 'だから欠陥ではなかったが、`controlChars.ts` 自身の docblock が'
    + '「同じ判定が 2 つ目を作りかけたので独立させた・片方だけ緩んでも気付けない」と'
    + '書いている当の形だったので、`hasControlChars` は `hasControlChar` へ委譲する'
    + '**1 つの実装**にした。`__tests__/controlCharSingleRule.test.ts` が'
    + '振る舞いの一致と「2 つ目が戻らないこと」を両方留める。'
    + 'JSON の包みの中を見られないという限界 (パス 245) はそのまま残る',
  depreciation:
    '非対称は起きない (実測・パス 281 で理由を書き直した) —— 結論は変わらないが、'
    + '**パス 272 が書いた理由は偽だった**。'
    + ' ★ 旧い行はこう述べていた: 「到達の鎖は `taxCalc.ts` 1 本だけで、'
    + '`taxCalc.ts` を import する main / preload のファイルは 0 件 (実測)。'
    + '税の計算は画面 (renderer) だけが読む。main 側がこのモジュールの問いを'
    + '1 度も発しない」。前半 (`src/main` / `src/preload` の中に直の import が 0 件) は'
    + '**真**だが、後半は**偽** —— 実測した鎖は '
    + '`main/clients/funding.ts` → `shared/funding.ts` → `taxCalc.ts` → ここ で、'
    + '**`shared/funding.ts` を 1 枚はさんで main へ繋がっている**。'
    + '**1 ホップで測って閉包について述べていた** —— この本は到達を閉包で見る'
    + '(パス 268 でそう直した) ので、この行が母集団に在ること自体が反証である'
    + '(到達していなければ行は存在しない)。'
    + ' ★ 正しい理由は**辺の中身**である: 鎖の 2 つの辺はどちらも**定数だけ**を'
    + '持ち出す —— `funding.ts` が `taxCalc` から取るのは `CONSUMPTION_TAX_STANDARD` 1 つ、'
    + '`taxCalc` が ここ から取るのは `SME_*` の 5 定数で、`taxCalc` は'
    + 'このモジュールの**関数を 1 つも呼ばない** (`isSchedulableLife` / '
    + '`straightLineAnnual` の呼び手は `RealEstatePage.tsx` = renderer だけ)。'
    + 'だから main 側は否定で答える問いを発しない。'
    + '`controlChars` (パス 280) と同じ形 —— **読まれてはいたが、足りなかった**。'
    + ' 到達の鎖と辺の名前は `shared/__tests__/judgementReachEdges.test.ts` が'
    + '両方向に留める (経路が変わる・名前が増える・定数が関数に化ける、のどれでも鳴る)',
  hydroponicCrops:
    '非対称は起きない (実測・パス 272) —— **到達の鎖を端まで辿った**: main → `clients/hydroponics.ts` → `hydroponicsControl` → `hydroponicCrops` → {`hydroponics`, `readNumeric`}。main が import するのは **`buildHydroponicsSnapshot` 1 つだけ**で (`clients/hydroponics.ts:1` — 残りは再輸出と型)、その関数の本体は `READING_FIELDS.map(...)` と `DEFAULT_CROP_LIST.map(...)` の **2 つの射影しか無い** (実測。否定で答える関数を 1 つも呼ばない)。つまり **main 側はこのモジュールの問いを 1 度も発しない** —— `hydroponicsControl` (パス 268) と同じ形。2026-09-23 (パス 420) に renderer 側の読み手が 3 → 4 になった (`data/hydroponicsLog.ts` が `CROP_ID_RE` を読み、ロットの `cropId` が**参照先と同じ形**であることを要求する) が、**main の側は 1 つも増えていない** —— 実測で `cropIdText` / `MAX_CROP_ID_CHARS` の `src/main/` からの参照は **0 件**である。',
  hydroponics:
    '非対称は起きない (実測・パス 272) —— `hydroponicCrops` と同じ鎖の先に在る '
    + '(main → clients/hydroponics.ts → hydroponicsControl → hydroponicCrops → ここ)。'
    + 'main が import する `buildHydroponicsSnapshot` は 2 つの定数表を射影するだけで、'
    + 'この鎖の否定で答える関数を 1 つも呼ばない (実測)',
  mutualFundsMetrics:
    '対称 (実測・パス 272) —— main の到達は `serviceAdvisor` 経由 (4 クライアント: real-estate / mutual-funds / uber-eats / demae-can)。`serviceAdvisor` がこのモジュールから取るのは**2 つだけ** (`serviceAdvisor.ts:37`): 定数 `RETURN_FLOOR_PCT` と述語 `isImpossibleReturnPct` (`pct < RETURN_FLOOR_PCT` の 1 行)。**その述語は確かに越境する** —— `adviseService` の中で真の枝 (:586 警告を組む) と偽の枝 (:596 測れる集合から外す) の両方が使われる。だが**否定のあとの動作は両ビルドで同じ 1 つの実装の中に在る** —— `adviseService` が返す助言の*中身*を形づくるだけで `ok: false` を作らず、同じオブジェクトが両ビルドへ返る (`serviceAdvisor` の判定はパス 268 で対称と実測済み)。★ この行は **module 単位の到達と call 単位の到達が違う**ことの例である (`isoDate` の ★ と同じ話)。',
  readNumeric:
    '非対称は起きない (実測・パス 272) —— パス 80 で規則を 1 つにした所だが、'
    + '**閉包で main へ繋がる道は `hydroponicCrops` 経由の 1 本だけ** (実測)。'
    + 'その鎖の main 側の入口 `buildHydroponicsSnapshot` は 2 つの定数表を射影するだけで、'
    + 'この数の読み取りを 1 度も呼ばない。★ renderer 側では 25 以上の呼び手が在るが、'
    + '**片側しか呼ばない判定に非対称は宿らない**',
  savingsPlanning:
    '非対称は起きない (実測・パス 272) —— 到達の鎖は main → 4 クライアント → `serviceAdvisor` → `mutualFundsMetrics` → ここ。ところが `serviceAdvisor` が `mutualFundsMetrics` から取るのは `RETURN_FLOOR_PCT` と `isImpossibleReturnPct` の 2 つだけで、**`isPlannableRate` / `isPlannableYears` はどちらの中からも呼ばれない** (`isImpossibleReturnPct` は 1 行の比較)。この 2 つを呼ぶのは `mutualFundsMetrics` 自身の将来評価額の計算で、そこは `serviceAdvisor` が import していない。**module の import の辺は在るが、call の辺が無い** —— main はこの問いを発しない。',
  radarPlot:
    '**欠陥だった → パス 268 で直した** (実測) —— 否定で答える 2 つのうち '
    + '`isPlottableScore` は renderer だけ (memberCare.ts)、`omittedRadarNote` は'
    + '**両ビルドが呼ぶ**。`null` / 文字列の扱いは**関数の側では対称**だった '
    + '(main の SVG は ⚠ の `<text>` を図の中へ書き、画面は ⚠ の `<div>` を図の下に出す)。'
    + '**非対称は 1 段上に在った** —— 同じ `export-svg` action の実装が 2 つ在り、'
    + 'ブラウザ版は画面の `<svg>` を DOM から掻き取っていた。掻き取れるのは `<svg>` '
    + '要素だけで、⚠ の断り・標題・部署・評価時点・凡例はその**外側**に在る。'
    + '実測 (jsdom・旧経路): `{ ok: true, bytes: 244, hasTitle: false, hasDept: false, '
    + 'hasDate: false, hasWarn: false, hasName: false }` —— しかも未評価の軸を持つ人が'
    + '居る入力で**成功**していた (デスクトップ版は `score must be integer 1-5: 0` で断る)。'
    + '組み立てを `shared/teamRadarSvg.ts` へ移し、両ビルドが同じ関数を通す。'
    + '★ なお `omittedRadarNote` が非 `null` を返す枝は **`export-svg` の口からは'
    + '到達しない** —— 上流の `validateTeamRadarState` が 5 軸すべて整数 1-5 を要求するので、'
    + '未評価の形は図に届く前に断られる (両ビルドで同じ)。画面の ⚠ は下書きを直接読むので今日も出る',
  scanTarget:
    '対称 (実測・パス 282 で辿り直した) —— パス 247 は「対称 (実測)」の 4 文字だけで、'
    + '**根拠が書かれていなかった**。パス 247 は母集団を初めて数えた回で、'
    + 'しかも到達は 1 ホップで測っていた (閉包へ直したのはパス 268) ので、'
    + 'その「実測」が何を見たのかは今から確かめられない。'
    + ' ★ 実測 (パス 282): 越境するのは `validateScanUrl` **1 つだけ** '
    + '(`main/clients/security.ts` と `renderer/data/saasWriteWeb.ts` の両方が呼ぶ)。'
    + '否定のあとの動作は**字まで同じ 1 行** —— '
    + '`if (!checked.ok) throw new Error(SCAN_URL_MESSAGES[checked.reason]);`。'
    + '`describeScanUrlRisk` (内部・社内ホストの警告) の読み手は `SecurityPage.tsx` だけ、'
    + '`looksInternalHostname` の呼び手は `describeScanUrlRisk` の中だけなので越境しない。'
    + ' ★ ただし `SCAN_URL_MESSAGES` (4 行) は**ビルドごとに 1 つずつ**在った —— '
    + '字は一致していたが一致を留めている物が何も無く、パス 167 / 250 / 252 / 269 / 273 が'
    + '1 件ずつ閉じてきた家系。URL を第三者 (VirusTotal) へ渡す前の関門の断り文なので、'
    + '`shared/scanTarget.ts` へ寄せて `scanTarget.test.ts` が'
    + '「読む側は共有の表を読み、自分の写しを持たない」を両方向に留める。'
    + ' ★ 設計として残る非対称ではない点: 内部ホスト・秘密らしきクエリ引数は'
    + '**関門ではなく警告**である (`validateScanUrl` の失敗は empty / too-long / '
    + 'not-a-url / not-web の 4 つだけ)。警告を出す画面は両ビルドで同じ 1 本なので対称。'
    + ' ★ パス 321: `validateScanUrl` / `validateBreachEmail` を呼ぶのは `shared/api/security.ts` の'
    + ' `checkScanUrl` / `checkBreachEmail` の 1 つずつになり、main と saasWriteWeb はそれを通る'
    + ' (直に import しない)。「字まで同じ 1 行」は 1 行になった',
  serviceAdvisor:
    '対称 (実測・パス 268) —— 否定で答えるのは `adviseService` (`ok: false`) と、'
    + 'その中でだけ呼ばれる 4 つの `parse*AdviceInput` (**外部の消費者は 0 件**)。'
    + '`adviseService` は main の 4 クライアント (real-estate / mutual-funds / '
    + 'uber-eats / demae-can) とブラウザ版の web-shim が呼び、**否定のあとの動作は'
    + '同じ 1 行に畳まれる**: main は `throw new Error(r.message)` → '
    + "action:invoke の catch が `{code:'action_failed', message: safeErrorMessage(err)}`、"
    + "ブラウザ版は `err('action_failed', r.message)`。`safeErrorMessage` の中身は "
    + '`redactForMessage(msg, ERROR_MESSAGE_MAX_CHARS)` で、`err()` が掛けるものと'
    + '**同じ関数・同じ天井**なので、code も文面も一致する。'
    + '★ ただし**到達性**は 2026-09-15 まで非対称だった —— この 4 サービスは '
    + '`LOCAL_SERVICES` なのに `action:invoke` が全サービスにトークンを要求しており、'
    + 'デスクトップ版では 4 つの advise が 1 度も呼ばれなかった (パス 267 で直した)',
  talent:
    '対称 (実測・パス 260) —— 否定の枝を両側で読んだ: main は `loadTalentState` が '
    + "`{ kind: 'unreadable', reason }` を返し (talent.ts:85 / :90)、ブラウザ版は "
    + '`localStorage` が拒んでも同じ形を作る (web-shim.ts:1271)。そこから先は**両方が同じ '
    + '2 段**を通る —— `talentProvenance(stored)` → `buildTalentSnapshot(state, provenance)` '
    + '(main/clients/talent.ts:143-144 / web-shim.ts:1273-1274)。画面は `snap.storedNote` を '
    + '⚠ つきで刷る (TalentPage.tsx:219-221)。`reviewLadder` は境界を越えない '
    + '(唯一の呼び出しは shared/talent.ts:709 の `buildTalentSnapshot` の中)',
  watchlistState:
    '対称 (パス 309 で**そう作った**) —— 銘柄のウォッチリストの保存値を読む 1 つの規則で、否定は '
    + "`readStoredWatchlist` の `{ kind: 'unreadable', reason }` と `isSafeSymbol` の false。"
    + 'main は `loadStoredWatchlist` (clients/stocks.ts) が ENOENT だけを none にして残りを unreadable に載せ、'
    + 'ブラウザ版は `readWatchlist` (data/stocksWatchlistWeb.ts) が Web Storage の例外を同じ形にする。'
    + 'そこから先は**両方が同じ 2 つ**を通る —— `symbolsOrEmpty(stored)` (読めなかった物を空として扱う唯一の場所) と '
    + '`watchlistStoredNote(stored, shown)` (画面の 1 行)。意図した非対称は `shown` の 1 引数だけ: '
    + '空のときデスクトップは見本の銘柄・ブラウザ版は空 (パス 161 の決定) で、注記の文もそこだけ違う。'
    + '`isSafeSymbol` はパス 309 まで main と renderer に写しが 1 つずつ在った (docblock が「同じ規則」と言うだけ) —— '
    + '両方が re-export になったので規則は 1 つ。画面は `data.storedNote` を ⚠ つきで刷る (StocksPage.tsx の '
    + 'data-watchlist-stored-note)。★ 直す前は main が `catch { return DEFAULT_STATE }`、ブラウザ版が '
    + '`catch { return [] }` で、否定そのものが無かった (ENOENT も EACCES も壊れた JSON も空)。',
  headerValue:
    '対称 (パス 296 で**そう作った**) —— 「`Headers` がこの値を受理するか」の規則で、'
    + '境界を越えるのは `shared/tokenInput.ts` 経由の 1 本だけ。そこは実測で**同一の 1 行**: '
    + 'main が `return { ok: false, code: \'invalid_token\', message: checked.message }` '
    + '(main/main.ts:348-350)、ブラウザ版も同じ code と同じ message '
    + '(web-shim.ts:1154-1155)。残る 2 つの読み手は越境しない —— '
    + '`shared/proxyEndpoint.ts` の消費者は renderer だけ (network/proxy.ts / SettingsPage.tsx。'
    + 'aiEndpoint の行が同じ事実を既に述べている)、`parseProxyEnvelope` は renderer にしか無い。'
    + 'この pass の前は**規則が 3 通りに割れていた** —— 応答側は Latin1 を見て (パス 295)、'
    + '資格情報の入口は C0/DEL だけ、共有秘密は型と長さだけ。1 つに寄せた',
  tokenInput: '閉じている (パス 245 で両ビルドの保管層に床)',
  tokenResponse:
    '対称 (パス 260 で**そう作った**) —— 認可サーバのトークン端点の応答を見る規則で、'
    + '否定のあとの動作は両ビルドで同じ 2 行: `if (!parsed.ok) throw new Error(parsed.message)` '
    + '(main/oauth.ts の交換・更新の 2 か所と renderer/oauth/pkce.ts)。文面も共有の 1 組。'
    + 'この pass の前は main 側に検査そのものが無く (`JSON.parse(…) as TokenResponse`)、'
    + 'ブラウザ版だけが見ていた —— 非対称の極として在った',
  updateCheck:
    '対称 (実測・パス 250) —— 両ビルドが `evaluateUpdate(current, parseLatestRelease(...))` と '
    + '3 つの失敗経路 (!res.ok / catch / 形が違う) を同じ形で `evaluateUpdate(current, null)` へ寄せ、'
    + '画面は共有の describeUpdate を読む。'
    + ' ★ **パス 282 で閉じた**: この行はパス 250 から「**ただし締切の値だけ割れている** '
    + '(main は素の 10_000・ブラウザ版は DEFAULT_HTTP_TIMEOUT_MS = 30_000。'
    + '理由はどこにも無い)」と**生きた食い違いを記録したまま置いて**いた。'
    + 'main を `DEFAULT_HTTP_TIMEOUT_MS` へ寄せ、'
    + '`shared/__tests__/deadlineCensus.test.ts` が両ビルドの締切を留める。'
    + '★ 教訓: 「理由はどこにも無い」と書けたなら、それは**書いた時点で欠陥**である ——'
    + '記録しただけで 32 パス残った',
  vaultToken: '**欠陥だった → パス 246 で直した** (main が生の JSON を Bearer に載せていた)',
  writeFieldLimits:
    '対称 (実測・パス 282 で辿り直した) —— `scanTarget` と同じく、パス 247 は'
    + '「対称 (実測)」の 4 文字だけで根拠が書かれていなかった。'
    + '**外部サービスへ利用者の資格情報で書き込む前の関門**なので、'
    + '4 文字では足りない。'
    + ' ★ 実測 (パス 282): 双子は **10 組** (slack / github / calendar / gmail / drive / '
    + 'canva / notion / atlassian / wordpress / cloudflare ×2 の欄)。'
    + '**10 組すべてが同じ形**で、main は `checkWriteFields(ctx.payload, TABLE)`・'
    + 'ブラウザ版は `checkWriteFields(input, 同じ TABLE)` を呼び、'
    + '否定 (`!== null`) のあとは両側とも `throw new Error(describeWriteFieldFailure(bad))`。'
    + '欄の台帳は `shared/writeFieldLimits.ts` に 1 つずつで、'
    + 'ラベルも天井も**両ビルドが同じ定数を読む**。'
    + 'GitHub の labels だけ 2 段目 (`checkWriteLabels`) が在り、それも両側に在る。'
    + 'MS365 の 2 表はパス 274/275 で `shared/api/microsoft365.ts` へ移したので'
    + '**両ビルドが同じ実装**を通る (表の上では「片側だけ」に見えるが、'
    + 'それは共有へ寄せた結果である)。'
    + ' ★ 11 番目 (パス 283): `shopify` の注文 —— **ブラウザ版に相手が居ない**。'
    + '7 つの同期 action (slack / discord / line / gmail / notion / salesforce / stripe) は '
    + 'main にしか無く、`webShimCredentials.test.ts` の `BROWSER_SURFACE` が'
    + 'その不在を既に台帳で留めている (増減したら鳴る)。'
    + 'だからこの 1 組は**非対称ではなく片側しか存在しない** —— '
    + '断りの動作が両ビルドで違う、という家系の外に在る。'
    + 'main 側の欄は `SHOPIFY_ORDER_FIELDS` + `checkShopifyLineItems` で、'
    + '他の 10 組と同じ `describeWriteFieldFailure` の文を投げる。'
    + 'パス 283 まで `assertOrder` は `id` と `name` の真偽値しか見ておらず、'
    + '`lineItems` が配列でないと `items.map is not a function`・'
    + '`total` がオブジェクトだと `[object Object]` が 7 つの第三者へ出ていた。'
    + ' ★ パス 285 で閉じた —— 残っていた非対称は「**同じ条件に文が 2 つ**」で '
    + '(パス 283 はこれを「文面の言語」と書いたが、**軸は言語ではない** —— '
    + '言語が同じでも 2 つ在れば片方だけ動く)。2 件とも main が英語・ブラウザ版が'
    + '日本語だった: Cloudflare のパージの「どちらかが要る」と Gmail の to の CR/LF。'
    + '`CLOUDFLARE_PURGE_NEEDS_TARGET` / `RFC2822_HEADER_UNSAFE` を '
    + '`shared/writeFieldLimits.ts` の台帳の隣に置き、main の 2 経路と '
    + 'saasWriteWeb の 2 経路が同じ定数を読む。留めるのは '
    + '`shared/__tests__/refusalTwins.test.ts` (両ビルドを実際に呼んで同じ文が'
    + '返ることを見る —— 綴りを写した検査は無言で古びるので、'
    + 'main 側の検査 11 か所も台帳を読むように直した)。'
    + ' ★ パス 321 (2026-09-19・オントロジーの組み直し): **双子そのものを畳んだ**。12 表すべてで'
    + ' main と saasWriteWeb は共有の中継 (`shared/api/*.ts` の `checkX` → `xInit` → `parseCreatedX`) を'
    + ' 通り、`checkWriteFields(…, 表)` を呼ぶのは shared の 1 か所ずつ。`writeFieldLimits.test.ts` の'
    + ' LEDGERS は全行が `via` になり、直呼びの枝は母集団 0 (型を明示して分岐は残す)。'
    + ' 上の「10 組すべてが同じ形」は 2026-09-19 より前の記述である',
};

/**
 * 正規表現リテラルの直前に来られる文字。**`/` が除算か正規表現かを決める**唯一の手掛かり。
 *
 * 除算の左側は式の終わり (識別子・数字・`)`・`]`) なので、それ以外なら正規表現である。
 * キーワードの直後 (`return /…/`) は別に見る。
 */
const REGEX_CAN_FOLLOW = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_AFTER_KEYWORD = /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;

/**
 * コメントと文字列リテラルを落とす (改行は保つ)。
 * 落とす理由: 「`return null` と書いていた」という散文を実装として数えないため ——
 * このファイル自身の doc コメントがまさにそれである。
 *
 * **正規表現リテラルも落とす** (2026-09-16 · パス 297)。それまでこの走査器は
 * 正規表現を知らず、**文字クラスの中の `'` や `` ` `` を文字列の開始として読んで
 * いた** —— つまりそこからファイルの末尾までが「文字列の中」になり、実装が
 * 丸ごと消えていた。
 *
 * 実測で当たったのは `src/shared` の **1 ファイル**、`shared/headerValue.ts`
 * (パス 296 で新設。RFC 9110 token の文字クラスが `'` と `` ` `` を含む) ——
 * **共有へ移した途端に母集団から静かに落ちた。**
 *
 * ★ **候補は 3 つ在ったが、2 つは走査器が正しかった。** `shared/redact.ts` と
 * `shared/api/http.ts` も「生の原文には `NEGATIVE` が当たるのに strip 後には
 * 当たらない」ので同じ穴に見えたが、読むと一致はどちらも **docblock の散文**
 * (`{ok:false, reason}` に畳まれる / `{ ok: false, error }` で失敗を返す API) で、
 * コードには `return null` も `return false` も 1 つも無い ——
 * **この関数が落とすべき物を落としていただけ**である。
 * 数だけ見て「最も安全に関わるモジュールが見えていなかった」と書きかけたので、
 * ここに残す: **走査の食い違いは、まず読んでから名前を付ける。**
 *
 * 回避 (引用符を持たない綴りに書き換える) ではなく走査器を直したのは、
 * 次に誰かが正規表現を書いた瞬間に同じ穴が開くため。
 */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  /** 直前に出した意味のある文字 (空白を除く)。正規表現かどうかの判定に使う。 */
  let prev = '';
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      out += '""';
      prev = '"';
      continue;
    }
    // `out` の末尾の空白を落としてからキーワードを見る (`return /x/` は
    // `out` が `"… return "` で終わっているので、落とさないと当たらない)。
    if (c === '/' && (REGEX_CAN_FOLLOW.has(prev) || REGEX_AFTER_KEYWORD.test(out.trimEnd()))) {
      // 文字クラス `[…]` の中では `/` は区切りにならない (`/[/]/` は正しい正規表現)。
      let inClass = false;
      let j = i + 1;
      while (j < n) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') break; // 閉じない = 正規表現ではなかった (除算と読む)
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j += 1;
      }
      if (j < n && src[j] === '/') {
        j += 1;
        while (j < n && /[a-z]/.test(src[j])) j += 1; // フラグ
        // 中身は `@` に潰す —— 引用符も `return null` も残さないが、
        // 「正規表現が在った」ことは token として残す。
        out += '/@/';
        prev = '/';
        i = j;
        continue;
      }
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  return out;
}

/**
 * **コメントだけ**落とす (文字列リテラルは残す)。
 *
 * `stripCommentsAndStrings` と分けてあるのは import の走査のため —— module
 * specifier は文字列リテラルそのもので、文字列を潰すと綴りが消える。
 * 文字列の中に入った `//` を誤ってコメント開始と読まないよう、文字列は
 * 「読み飛ばして原文のまま出す」。
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i];
          i += 1;
        }
        out += src[i] ?? '';
        i += 1;
      }
      out += src[i] ?? '';
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** `root` 配下の .ts / .tsx (`__tests__` / `.d.ts` を除く) をパス順で。 */
function sourceFiles(root) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
      } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
        found.push(p);
      }
    }
  };
  walk(root);
  return found;
}

/** モジュール鍵: `src/shared/` からの相対パス (拡張子なし・区切りは `/`)。 */
function moduleKey(abs, sharedRoot) {
  return path.relative(sharedRoot, abs).replace(/\.tsx?$/, '').split(path.sep).join('/');
}

/** `file` が import している shared モジュールの鍵の集合 (相対指定のみ)。 */
function sharedImportsOf(file, sharedRoot) {
  // **コメントだけ落としてから読む。** 落とさないとコメントアウトした import
  // (`// import { x } from '../shared/foo';`) が「両ビルドが使っている」証拠として
  // 数えられる。文字列は落とせない —— module specifier は文字列リテラルそのもので、
  // `stripCommentsAndStrings` に通すと `""` に潰れて綴りが消える。
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const keys = new Set();
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const abs = path.resolve(path.dirname(file), spec);
    const rel = path.relative(sharedRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    keys.add(rel.split(path.sep).join('/'));
  }
  return keys;
}

/**
 * shared → shared の到達 (閉包)。**1 ホップでは足りない** (2026-09-15 · パス 268)。
 *
 * パス 268 で SVG の組み立てを `main/clients/teamradar.ts` から
 * `shared/teamRadarSvg.ts` へ移したところ、`radarPlot` が母集団から**消えた** ——
 * main は同じ判断 (`omittedRadarNote`) を今も通すのに、経路が
 * `main → teamRadarSvg → radarPlot` の 2 ホップになったからである。
 *
 * **共有モジュールの後ろへ回った判断が見えなくなる**のは、走査が黙る形そのもの
 * (パス 85 / 95 / 107 / 220 の家系)。実測では 1 ホップ 47 / 22 に対し
 * 閉包は 61 / 31 —— **8 件は私の refactor と無関係に、ずっと外に在った。**
 * 母集団は「両ビルドが到達する共有モジュール」であって「直接 import する」ではない。
 */
function sharedClosure(seed, byKey, sharedRoot) {
  // **種を先に配列へ落とす。** `seed` は iterator で来ることがあり、`new Set(seed)` が
  // 先に食い尽くすと `[...seed]` が空になって閉包が種のまま返る (実測でここを踏んだ)。
  const start = [...seed];
  const out = new Set(start);
  const queue = [...start];
  while (queue.length > 0) {
    const key = queue.pop();
    const abs = byKey.get(key);
    if (abs === undefined) continue;
    for (const next of sharedImportsOf(abs, sharedRoot)) {
      if (byKey.has(next) && !out.has(next)) {
        out.add(next);
        queue.push(next);
      }
    }
  }
  return out;
}

/** 母集団を数える。`{ rows, shared, both, judgement }`。 */
function census(srcRoot = SRC) {
  const sharedRoot = path.join(srcRoot, 'shared');
  const sharedFiles = sourceFiles(sharedRoot);
  const byKey = new Map();
  for (const abs of sharedFiles) byKey.set(moduleKey(abs, sharedRoot), abs);

  const count = (buildRoot) => {
    const per = new Map();
    for (const f of sourceFiles(path.join(srcRoot, buildRoot))) {
      for (const k of sharedImportsOf(f, sharedRoot)) per.set(k, (per.get(k) ?? 0) + 1);
    }
    return per;
  };
  const mainPer = count('main');
  const rendPer = count('renderer');
  // 到達は閉包で見る。表の数は**直接 import した件数**のまま —— `0` は
  // 「別の共有モジュールを通ってしか届かない」を意味する (欄の意味を変えない)。
  const mainReach = sharedClosure(mainPer.keys(), byKey, sharedRoot);
  const rendReach = sharedClosure(rendPer.keys(), byKey, sharedRoot);

  const rows = [];
  let both = 0;
  for (const key of [...byKey.keys()].sort()) {
    if (!mainReach.has(key) || !rendReach.has(key)) continue;
    both += 1;
    const body = stripCommentsAndStrings(fs.readFileSync(byKey.get(key), 'utf8'));
    if (!NEGATIVE.test(body)) continue;
    rows.push({ module: key, main: mainPer.get(key) ?? 0, renderer: rendPer.get(key) ?? 0 });
  }
  return { rows, shared: byKey.size, both, judgement: rows.length };
}

function renderTable(result, verdicts = VERDICTS) {
  const body = result.rows.map(
    (r) => `| \`${r.module}\` | ${r.main} | ${r.renderer} | ${verdicts[r.module] ?? '（台帳に無し）'} |`,
  );
  const unread = result.rows.filter((r) => (verdicts[r.module] ?? '').startsWith('未読')).length;
  return [
    BEGIN,
    `shared **${result.shared}** モジュール / 両ビルドが import **${result.both}** / うち否定で答えられる **${result.judgement}**` +
      `（うち未読 **${unread}**）。これは分母であって欠陥の一覧ではない。`,
    '',
    HEADER,
    RULE,
    ...body,
    END,
  ].join('\n');
}

/** 台帳と母集団の食い違い (両方向)。一致なら空配列。 */
function ledgerMismatch(result, verdicts = VERDICTS) {
  const inPop = new Set(result.rows.map((r) => r.module));
  const lines = [];
  for (const m of [...inPop].sort()) {
    if (!Object.hasOwn(verdicts, m)) {
      lines.push(`母集団に入ったが台帳に無い: ${m} —— 読んで判定を書く (読んでいなければ '未読 (…)' と書く)`);
    }
  }
  for (const m of Object.keys(verdicts).sort()) {
    if (!inPop.has(m)) {
      lines.push(`台帳に在るが母集団から消えた: ${m} —— 死んだ判断なので台帳から外す`);
    }
  }
  return lines;
}

function findTable(doc) {
  // **マーカーは 1 組だけ。** 綴りを縮めた別形が在ると `indexOf` がそちらを先に
  // 拾い、生成物が別の場所へ書かれて**本物が黙って腐る** (パス 95 で実際に起きた)。
  let n = 0;
  for (let i = doc.indexOf(BEGIN_TAG); i >= 0; i = doc.indexOf(BEGIN_TAG, i + 1)) n += 1;
  if (n > 1) {
    throw new Error(`開始マーカー "${BEGIN_TAG}…" が ${n} 組あります。生成物の行き先が定まらないので 1 組にしてください`);
  }
  const begin = doc.indexOf(BEGIN);
  if (begin < 0) {
    if (n === 1) throw new Error(`開始マーカーの綴りが違います。次の 1 行にしてください:\n${BEGIN}`);
    return null;
  }
  const end = doc.indexOf(END, begin);
  if (end < 0) throw new Error(`終端マーカー "${END}" がありません`);
  return { begin, end: end + END.length };
}

function applyTable(doc, table) {
  const found = findTable(doc);
  if (found) return doc.slice(0, found.begin) + table + doc.slice(found.end);
  return `${doc.replace(/\n+$/, '')}\n\n${table}\n`;
}

/** committed と再生成が食い違う理由 (一致なら null)。 */
function staleReason(doc, table) {
  const found = findTable(doc);
  if (!found) return 'census の生成ブロックが docs/REMAINING_WORK.md にありません';
  const committed = doc.slice(found.begin, found.end);
  if (committed === table) return null;
  const a = committed.split('\n');
  const b = table.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return `${i + 1} 行目が違います:\n  committed: ${a[i] ?? '(無し)'}\n  再生成:    ${b[i] ?? '(無し)'}`;
    }
  }
  return '内容が違います';
}

function selfTest() {
  const fails = [];
  const check = (name, ok) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) fails.push(name);
  };

  // --- 否定の形 (陽性・陰性) ---
  check('★ `return null` を否定とみなす', NEGATIVE.test('function f() { return null; }'));
  check('★ `return false` を否定とみなす', NEGATIVE.test('function f() { return false; }'));
  check('★ `ok: false` を否定とみなす', NEGATIVE.test('return { ok: false, reason: 1 };'));
  check('肯定だけなら否定でない', NEGATIVE.test('return { ok: true };') === false);
  /*
   * 正規表現リテラル (パス 297)。★ の 2 本が守っているのは
   * 「文字クラスの中の引用符でファイルの残りを失わない」という 1 点である。
   */
  check(
    '★ 正規表現の中の引用符でコードを失わない',
    NEGATIVE.test(stripCommentsAndStrings("const RE = /^[a-z'`|~-]+$/;\nif (x) return false;")),
  );
  check(
    '★ 正規表現の中の `return null` は数えない (中身は潰す)',
    NEGATIVE.test(stripCommentsAndStrings('const RE = /return null/;')) === false,
  );
  check(
    '除算は正規表現と読まない (`/` の左が式の終わり)',
    stripCommentsAndStrings('const r = a / b / c;').includes('a / b / c'),
  );
  check(
    'キーワードの直後は正規表現 (`return /x/`)',
    stripCommentsAndStrings('function f(){ return /x/.test(y); }').includes('/@/'),
  );
  check(
    '文字クラスの中の `/` は区切りにしない',
    NEGATIVE.test(stripCommentsAndStrings('const RE = /[/]/;\nreturn false;')),
  );
  check(
    '閉じない `/` は除算のまま (行をまたがない)',
    stripCommentsAndStrings('const a = x / 2;\nreturn false;').includes('x / 2'),
  );
  check(
    'コメントの中の「return null」は数えない',
    NEGATIVE.test(stripCommentsAndStrings('// かつては return null だった\nexport const x = 1;')) === false,
  );
  check(
    '文字列の中の「ok: false」は数えない',
    NEGATIVE.test(stripCommentsAndStrings("const s = 'ok: false';")) === false,
  );
  /*
   * **この本自身を材料にする 2 本** (パス 297 で書き直した)。
   *
   * ここには 2026-09-16 まで「この本の prefix に否定は 1 件も無い」という
   * `=== false` の主張が在り、**通っていた**。ところが `findTable` は実際に
   * `return null` を返す —— 通っていたのは、走査器が正規表現の中の `'` で
   * 偽の文字列を開き、**151 行を丸ごと飲み込んでいた**からである
   * (実測: prefix 681 行 → strip 後 530 行・原文の `return null` 4 件のうち
   * strip 後に見えるのは **0 件**)。
   * つまり **「落とし忘れの対照」は、走査が死んでいたから合格していた** ——
   * このリポジトリが繰り返し記録している形そのものである。
   *
   * だから主張を 2 つに分けて、どちらも**肯定形**で書く:
   *
   * ① **行数は変わらない。** 落とすのはコメント・文字列・正規表現の**中身**
   *    だけなので、行の数は原文と一致しなければならない。旧走査器はここで
   *    151 行を失っていた —— この 1 行が在れば当日に鳴っていた。
   * ② **コードの否定は見え、散文の否定は見えない。** 実測でコード上の
   *    `return null` は 2 件 (`findTable` の 2 つの早期 return) で、
   *    `VERDICTS` の文字列に入っている 2 件は落ちる。
   *    合計 4 件のうち 2 件だけが残るのが正しい答えである。
   */
  const ownSrc = fs.readFileSync(__filename, 'utf8');
  check(
    '★ 走査器は行数を変えない (中身だけ落とす)',
    stripCommentsAndStrings(ownSrc).split('\n').length === ownSrc.split('\n').length,
  );
  const ownPrefix = ownSrc.split('function selfTest')[0];
  const seen = (stripCommentsAndStrings(ownPrefix).match(/return null/g) ?? []).length;
  const raw = (ownPrefix.match(/return null/g) ?? []).length;
  check(
    `★ コードの否定は見え、散文の否定は落ちる (原文 ${raw} 件 → ${seen} 件)`,
    seen === 2 && raw > seen,
  );

  // --- import の走査: コメントは落とす・綴りは残す ---
  check(
    '★ コメントアウトした import は数えない',
    !stripComments("// import { x } from '../shared/ghost';\nexport const y = 1;").includes('ghost'),
  );
  check(
    '★ 生きている import の綴りは残る (文字列を潰していない)',
    stripComments("import { x } from '../shared/real';").includes("'../shared/real'"),
  );
  check(
    '文字列の中の // をコメント開始と読まない',
    stripComments("const u = 'https://x/y';").includes('https://x/y'),
  );

  // --- ★ 到達は閉包で見る (パス 268 —— 共有モジュールの後ろへ回った判断) ---
  {
    const byKey = new Map([
      ['front', '/x/front.ts'],
      ['deep', '/x/deep.ts'],
      ['lonely', '/x/lonely.ts'],
    ]);
    const fake = (abs) => (abs === '/x/front.ts' ? new Set(['deep']) : new Set());
    const saved = module.exports.sharedImportsOf;
    // 閉包は `sharedImportsOf` を通すので、ここだけ差し替える代わりに同じ形の
    // 小さな実装で確かめる (本体は純粋な幅優先なので、隣接だけ与えれば足りる)。
    const closure = (seed) => {
      const start = [...seed];
      const out = new Set(start);
      const q = [...start];
      while (q.length > 0) {
        const k = q.pop();
        for (const n of fake(byKey.get(k) ?? '')) {
          if (byKey.has(n) && !out.has(n)) { out.add(n); q.push(n); }
        }
      }
      return out;
    };
    void saved;
    check('★ 2 ホップ先も到達に入る (front → deep)', closure(['front']).has('deep'));
    check('対照: 誰も import しない物は入らない', closure(['front']).has('lonely') === false);
    /*
     * ★ 種が iterator でも閉包が動く。
     *
     * 最初の実装は `new Set(seed)` の後に `[...seed]` を取っており、**iterator を
     * 先に食い尽くしていた** —— 閉包が種のまま返り、実測が 1 ホップと同じ 47 / 22 に
     * 見えた (2026-09-15 に踏んだ)。本物の shared を種にして 2 ホップ先を要求する。
     */
    const realShared = path.join(SRC, 'shared');
    const realKeys = new Map();
    for (const abs of sourceFiles(realShared)) realKeys.set(moduleKey(abs, realShared), abs);
    const reach = sharedClosure(new Map([['teamRadarSvg', 1]]).keys(), realKeys, realShared);
    check('★ 種が iterator でも閉包が動く (teamRadarSvg → radarPlot)', reach.has('radarPlot'));
  }

  // --- 実測と床 ---
  const real = census();
  check(`実測が shared の床を超えている (${real.shared} >= ${MIN_SHARED})`, real.shared >= MIN_SHARED);
  check(`実測が両ビルドの床を超えている (${real.both} >= ${MIN_BOTH})`, real.both >= MIN_BOTH);
  check(`実測が判定の床を超えている (${real.judgement} >= ${MIN_JUDGEMENT})`, real.judgement >= MIN_JUDGEMENT);
  check(
    '★ 空の木を走査したら床に掛かる (走査の死が「問題なし」にならない)',
    census(path.join(REPO_ROOT, 'scripts')).shared < MIN_SHARED,
  );

  // --- ★ 走査は パス 246 の欠陥を拾えるか (モジュール単位であることの対照) ---
  check(
    '★ vaultToken が母集団に在る (シンボル単位に戻したら落ちる形・パス 247)',
    real.rows.some((r) => r.module === 'vaultToken'),
  );
  check(
    '★ radarPlot が母集団に在る (main は teamRadarSvg 経由の 2 ホップ・パス 268)',
    real.rows.some((r) => r.module === 'radarPlot'),
  );

  // --- 台帳の双方向 ---
  check('実測と台帳が一致している (どちらの向きにもずれが無い)', ledgerMismatch(real).length === 0);
  {
    const sample = { rows: [{ module: 'a', main: 1, renderer: 1 }], shared: 1, both: 1, judgement: 1 };
    check(
      '★ 母集団に入ったのに台帳に無ければ鳴る',
      ledgerMismatch(sample, {}).join('|').includes('母集団に入ったが台帳に無い: a'),
    );
    check(
      '★ 台帳に在るのに母集団から消えたら鳴る',
      ledgerMismatch(sample, { a: 'x', gone: 'y' }).join('|').includes('台帳に在るが母集団から消えた: gone'),
    );
    check('対照: 一致していれば鳴らない', ledgerMismatch(sample, { a: 'x' }).length === 0);
  }

  // --- 表の生成と突き合わせ ---
  const sample = {
    rows: [{ module: 'a', main: 2, renderer: 3 }, { module: 'b', main: 1, renderer: 1 }],
    shared: 9,
    both: 4,
    judgement: 2,
  };
  const table = renderTable(sample, { a: '対称 (実測)', b: '未読 (見本)' });
  check('合計を載せる', table.includes('shared **9** モジュール / 両ビルドが import **4** / うち否定で答えられる **2**'));
  check('未読の数も載せる', table.includes('（うち未読 **1**）'));
  check('呼ぶ所の数を両ビルド分載せる', table.includes('| `a` | 2 | 3 | 対称 (実測) |'));
  check('台帳に無い行はそう書く', renderTable(sample, {}).includes('（台帳に無し）'));

  const doc = applyTable('# 見出し\n\n本文\n', table);
  check('マーカーが無ければ末尾へ足す', findTable(doc) !== null);
  check('一致していれば鳴らない', staleReason(doc, table) === null);
  check(
    '★ 呼ぶ所の数が 1 つ違えば鳴る',
    typeof staleReason(doc, renderTable({ ...sample, rows: [{ module: 'a', main: 2, renderer: 4 }, sample.rows[1]] }, { a: '対称 (実測)', b: '未読 (見本)' })) === 'string',
  );
  check(
    '★ 行が 1 つ増えても鳴る',
    typeof staleReason(doc, renderTable({ ...sample, rows: [...sample.rows, { module: 'c', main: 1, renderer: 1 }], judgement: 3 }, { a: '対称 (実測)', b: '未読 (見本)', c: '未読' })) === 'string',
  );
  check('★ ブロックが無ければ鳴る', typeof staleReason('# 見出しだけ\n', table) === 'string');
  check('2 度当てても増えない', applyTable(doc, table) === doc);

  let threwOnDup = false;
  try {
    findTable(`${doc}\n${BEGIN_TAG} -->\n${END}\n`);
  } catch {
    threwOnDup = true;
  }
  check('★ 開始マーカーが 2 組あれば鳴る', threwOnDup);
  let threwOnTypo = false;
  try {
    findTable(`# 見出し\n\n${BEGIN_TAG} -->\n${END}\n`);
  } catch {
    threwOnTypo = true;
  }
  check('★ 綴りの違う開始マーカーだけなら鳴る', threwOnTypo);
  check('対照: マーカーが 1 つも無ければ null (初回の足し込みは通す)', findTable('# 見出しだけ\n') === null);

  if (fails.length > 0) {
    console.error(`\n❌ self-test ${fails.length} 件不一致`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }

  const result = census();
  if (result.shared < MIN_SHARED || result.both < MIN_BOTH || result.judgement < MIN_JUDGEMENT) {
    console.error(
      `❌ 走査が死んでいます: shared ${result.shared} / 両ビルド ${result.both} / 否定 ${result.judgement} ` +
        `(床は ${MIN_SHARED} / ${MIN_BOTH} / ${MIN_JUDGEMENT})。0 件を「問題なし」と読まないための床です。`,
    );
    process.exit(1);
  }

  const mismatch = ledgerMismatch(result);
  if (mismatch.length > 0) {
    console.error('❌ 母集団と判定の台帳 (VERDICTS) が食い違っています:');
    for (const line of mismatch) console.error(`   ${line}`);
    console.error('   台帳: scripts/shared-judgement-census.cjs の VERDICTS');
    process.exit(1);
  }

  const table = renderTable(result);
  const doc = fs.readFileSync(DOC, 'utf8');

  if (args.includes('--check')) {
    const reason = staleReason(doc, table);
    if (reason !== null) {
      console.error(
        `❌ census が古くなっています。\`node scripts/shared-judgement-census.cjs\` (引数なし) で再生成してください —— \`npm run lint:shared-judgement\` は --check だけで書き戻さない (パス 307 で実際に案内どおり叩いて空振りした)。\n${reason}`,
      );
      process.exit(1);
    }
    console.log(
      `✅ census は最新 (shared ${result.shared} / 両ビルド ${result.both} / 否定 ${result.judgement})`,
    );
    return;
  }

  fs.writeFileSync(DOC, applyTable(doc, table));
  console.log(
    `✅ census を再生成しました (shared ${result.shared} / 両ビルド ${result.both} / 否定 ${result.judgement})`,
  );
}

if (require.main === module) main();

module.exports = {
  NEGATIVE,
  VERDICTS,
  stripComments,
  stripCommentsAndStrings,
  sourceFiles,
  moduleKey,
  sharedImportsOf,
  sharedClosure,
  census,
  renderTable,
  ledgerMismatch,
  findTable,
  applyTable,
  staleReason,
  MIN_SHARED,
  MIN_BOTH,
  MIN_JUDGEMENT,
};
