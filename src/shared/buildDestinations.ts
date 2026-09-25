/**
 * **この実行形態では、どこに置かれ・どこから読むのか** (2026-09-12 · パス 161)。
 *
 * ## 実測した欠陥
 *
 * 画面の 5 つが、デスクトップ (Electron) のパスを**無条件に**刷っていた
 * —— ブラウザ版 (単一 HTML) でも同じ文字列が出る:
 *
 * | 画面 | 刷っていた文 |
 * | --- | --- |
 * | Business | 保存先: `~/.local/business-hub/data/business-dashboard.{html,md}` |
 * | Stocks | 銘柄を登録すると `~/.local/business-hub/state.json` に永続化されます |
 * | Stocks | 出力先は `~/.local/business-hub/data/dashboard.html` |
 * | Team Radar | 「SVG を保存」で `~/.local/business-hub/data/team-radar.svg` に書き出されます |
 * | Templates | 「SVG を保存」で `~/.local/business-hub/data/templates/<id>.svg` に出力します |
 * | Skills | `~/.claude/skills` / 「ディレクトリを作って SKILL.md を置いてください」 |
 *
 * **ブラウザ版はそこへ 1 バイトも書かない。** `data/exportOutcome.ts` の冒頭が
 * 実装を述べている —— 書き出しは「端末のダウンロード / アプリ内のライブラリ
 * (IndexedDB) / 設定で選んだ PC のフォルダ」の 3 か所である。銘柄の登録先も
 * `state.json` ではなく localStorage (`data/stocksWatchlistWeb.ts`)。
 * `~/.claude/skills` は**読めない** (shim に枝が無く `not_implemented`)。
 *
 * さらに Stocks の同じ段落は「初期状態 (登録なし) では mock 5 銘柄が表示されます」と
 * 書いているが、これもデスクトップだけの話である —— main の fetcher は
 * 空なら `MOCK_TICKERS` (5 件) に倒すが、ブラウザ版の `buildStocksSnapshot` は
 * 登録記号をそのまま写すだけで**空は空のまま**。
 *
 * パス 157 (できない指示) / パス 158 (効かない操作) と同じ家系で、こちらは
 * **在りもしない場所を案内する**形である。
 *
 * ## 置き方
 *
 * デスクトップのパスは**この 1 か所だけ**が持つ (`DESKTOP_PATHS`)。
 * `src/renderer/__tests__/desktopPathClaims.test.ts` が renderer の画面に
 * 生のパス文字列が再び現れないことを走査する —— 次に画面を書く人が
 * 何も知らずに `~/.local/...` と書いても、そこで鳴る。
 */

/** どの実行形態か。判定は `renderer/runtimeMode.ts` (橋の version の**接尾辞**)。 */
export type BuildKind = 'desktop' | 'browser';

/**
 * ブラウザ版が名乗る版に付く接尾辞 (2026-09-25 · パス 460)。
 *
 * ## なぜ接尾辞で見るのか (実測して決めた)
 *
 * どの実行形態かは**身元**で、版は**変わることが仕事の数**である。
 * 2026-09-25 まで判定は「橋が名乗った版が `0.1.0-web` と**完全に一致するか**」で、綴りは 2 か所に分かれていた ——
 * `web-shim.ts` が作り、`runtimeMode.ts` が比べる。
 *
 * 実測 (2026-09-25 · 直す前 · `web-shim.ts` の作る側だけを `0.2.0-web` へ):
 *
 * | 測った物 | 実測 |
 * | --- | --- |
 * | `npm test` | **896 ファイル / 19,048 件すべて緑** |
 * | `isBrowserBuild()` | **`false`** (ブラウザ版がデスクトップ版を名乗る) |
 * | 実物の App のロック画面 | **出ない** (接尾辞が一致していたときは出る) |
 * | `ProxyRequiredNote` の DOM | **0 字** (パス 459 の断りが消える) |
 *
 * ★ **いちばん重いのはロック画面である** —— ブラウザ版はそこが保管庫を解錠する
 * 唯一の入口で、素通りすると `App` の `setVaultUnlocked(true)` は通るが
 * **保管庫の鍵は作られない**。以後どの資格情報も
 * 「Vault がロックされています」で断られ、**解錠の操作子はどこにも無い**
 * (パス 455 がデスクトップ版について実測した当の状態)。
 * 版を 1 つ上げる編集が、ブラウザ版の利用者を自分の金庫から締め出す。
 *
 * ★ **綴りは 2 か所ではなく 136 か所だった** —— 出荷コード 2 つに加え、
 * 検査の代役が **134 か所**でその版を手書きしている。完全一致のままだと、
 * 版を上げた日にその 134 本が**黙って別の実行形態を試し始める**
 * (パス 457 が「標本が母集団を名乗らない」として直した形)。
 *
 * ★ **接尾辞なら版は自由に動ける** —— 身元は `-web` が持ち、版は数が持つ。
 * デスクトップ版の `getVersion` は `app.getVersion()` = `package.json` の版なので、
 * そこが `-web` で終わらないことを検査が床として見る
 * (`buildSentinelStability.test.ts`)。
 */
export const WEB_BUILD_SUFFIX = '-web';

/**
 * 橋が名乗った版が**ブラウザ版の物か**。
 *
 * 版の数の部分は見ない —— 見ると、版を上げた日に実行形態が動く (上の実測)。
 */
export function isWebBuildVersion(version: string): boolean {
  return version.endsWith(WEB_BUILD_SUFFIX);
}

/**
 * デスクトップ版が書く先。**ここだけが生のパスを持つ。**
 * 実装は `src/main/clients/*.ts` の書き出し handler と `main/paths.ts`。
 */
export const DESKTOP_PATHS = {
  businessDashboard: '~/.local/business-hub/data/business-dashboard.{html,md}',
  stocksState: '~/.local/business-hub/state.json',
  stocksDashboard: '~/.local/business-hub/data/dashboard.html',
  teamRadarSvg: '~/.local/business-hub/data/team-radar.svg',
  templateSvg: '~/.local/business-hub/data/templates/<id>.svg',
  claudeSkills: '~/.claude/skills',
} as const;

/** ブラウザ版の書き出し先 3 か所 (`data/exportOutcome.ts` の実装と同じ順)。 */
const BROWSER_EXPORT_SINKS =
  'この端末へのダウンロードと、アプリ内の「ライブラリ」'
  + '（設定で PC のフォルダを選んでいれば、そこにも自動保存）';

/**
 * 「書き出したものはどこへ行くか」。
 *
 * デスクトップは OS のパス 1 つ。ブラウザは 3 か所なので、**パスを名乗らない** ——
 * 名乗ると、同じ文が「そこを開けば在る」と読める。
 */
export function exportDestinationNote(kind: BuildKind, desktopPath: string): string {
  return kind === 'desktop' ? `保存先: ${desktopPath}` : `保存先: ${BROWSER_EXPORT_SINKS}。`;
}

/**
 * 「入力したものはどこに残るか」。ブラウザ版は**端末とブラウザに閉じる**ので、
 * それも言う (控えの取り方まで書く —— `DATA_PROTECTION.md` の立ち退きの節と同じ姿勢)。
 */
export function persistDestinationNote(kind: BuildKind, desktopPath: string): string {
  return kind === 'desktop'
    ? `登録した内容は ${desktopPath} に永続化されます。`
    : '登録した内容はこのブラウザの保存領域に残ります'
      + '（この端末・このブラウザだけ。設定の「バックアップ」で控えを取れます）。';
}

/**
 * 「この実行形態では読めない」ことを言う。**できない指示を出さない**ため、
 * デスクトップ版でやってほしいことまで書く (パス 157 と同じ判断)。
 */
export function localReadUnavailableNote(kind: BuildKind, what: string): string | null {
  return kind === 'browser'
    ? `ブラウザ版では ${what} を読み取れません（単一 HTML で動くため、端末のファイルには触れません）。`
      + 'デスクトップ版で開くと一覧に出ます。'
    : null;
}

/**
 * 「登録が無いときに何が出るか」。デスクトップは見本の銘柄に倒すが、
 * ブラウザ版は**空のまま**。同じ文で両方を語れない (パス 161 で実測)。
 *
 * **件数は書かない。** 見本の数 (`MOCK_TICKERS`) は `src/main/clients/stocks.ts` に
 * 在り、renderer は main を import できない (`lint:imports`)。写せば必ず古くなるので、
 * 数を名乗らずに済む文にした —— 実際の件数は一覧を見れば分かる。
 */
export function emptyWatchlistNote(kind: BuildKind): string {
  return kind === 'desktop'
    ? '初期状態（登録なし）では見本の銘柄が表示されます。'
    : '初期状態（登録なし）では一覧は空です。銘柄を登録すると表示されます。';
}

/**
 * 「この実行形態は、ブラウザ版の保管庫を読まない」(2026-09-25 · パス 454)。
 *
 * ## 実測した欠陥
 *
 * 設定画面の Google OAuth (貼り付け式 PKCE) の節は、取得した access token を
 * `getVault().setToken(...)` で **4 本** (`drive` / `calendar` / `gmail` /
 * `google-access`) 書く。ところが保管庫のトークンを**読む**出荷コードは
 * `renderer/web-shim.ts` の 11 か所だけで、その shim は
 * `if (typeof window !== 'undefined' && !window.serviceHub)` —— つまり
 * **ブラウザ版だけ**据え付く。デスクトップ版は preload の橋が先に在るので、
 * 保管庫を読む物が **1 つも無い**。
 *
 * デスクトップ版でこの 4 本に起きること (2026-09-25 実測):
 *
 * | 問い | 実測 |
 * | --- | --- |
 * | 読む物が在るか | **0 件** |
 * | 「API キーとトークン」の 9 スロットに出るか | **出ない** (固定鍵に無い) |
 * | 「使われていない資格情報」に出るか | **出ない** (橋 = main の保管ファイルを読む) |
 * | `StatusBar` の「削除」で消えるか | **消えない** (橋を叩くので保管庫に届かない) |
 *
 * ★ **2026-09-25 (パス 455) の訂正 —— パス 454 の私はこの表にもう 1 行
 * 「画面が何と言うか → 『Google 連携を有効化しました』」と書き、
 * 「生きた access token が誰も読まず誰も消せない場所へ *入り*、画面は成功したと言う」
 * と述べた。両方とも偽である。** 測り直すと、デスクトップ版の保管庫は
 * **施錠されたまま解錠できない**: `initialize()` / `unlock()` を呼ぶ出荷コードは
 * `security/LockScreen.tsx` の 2 行だけで、その `LockScreen` は
 * `App.tsx` の `if (browserMode && !vaultUnlocked)` の下にしか描かれない
 * (デスクトップ版は `setVaultUnlocked(true)` で**素通りする** —— それは
 * App の state であって、保管庫の鍵ではない)。したがって `setToken` の
 * 入口 `requireKey()` が必ず投げ、実測は次のとおり:
 *
 * | 問い | パス 454 の記述 | **2026-09-25 の実測** |
 * | --- | --- | --- |
 * | トークンは保管庫へ入るか | 「入る」 | **入らない** (`Vault がロックされています`) |
 * | 画面は何と言うか | 「有効化しました」 | **`Vault がロックされています`** |
 *
 * **直しの向きは変わらない —— むしろ強くなる。** 断りが無ければ利用者は
 * 認可ページを開き、Google の同意を済ませ、callback を貼り、
 * **単回使用の code を実際の交換で使い切ってから**「Vault がロックされています」
 * を受け取る。しかもデスクトップ版には**解錠する操作子がどこにも無い**
 * (`VaultControls` はパスワード変更と施錠をデスクトップ版では出さない) ので、
 * その断りは**利用者が動かせない状態を名指しする**。だから
 * 「認可ページを開く前に断り、働く道を名指しする」が正しい。
 *
 * 法則 `escape-hatch-stays-open` の、逃げ口が *最初から無い*形である
 * (パス 453 は「保存した直後に出ない」だった)。
 *
 * ## なぜ「保管庫へ書くのをやめる」ではなく「断る」なのか
 *
 * デスクトップ版には**働く道が在る** —— Drive / カレンダー / Gmail の 3 画面が
 * `GoogleConnectCard` を載せており、そこは `window.serviceHub.authorize()` →
 * main の `setOAuthTokens` で**更新トークンつきの TokenSet** を書く。
 * 一方この節が持っているのは `accessToken` だけなので、橋へ流し込むと
 * **同じスロットを裸の access token で上書きして更新トークンを落とす** ——
 * 1 時間後に黙って切れ、繋ぎ直す手も消える。**だから書かずに、働く道を名指しする。**
 *
 * ブラウザ版の答えは 1 文字も変えない (`null` を返す)。
 */
export function pasteOAuthUnreadNote(kind: BuildKind): string | null {
  return kind === 'desktop'
    ? 'デスクトップ版はここで保存した資格情報を読みません'
      + '（保存先はブラウザ版の保管庫で、デスクトップ版のトークンは別のファイルに在ります）。'
      + 'しかもこの保管庫を読む画面がデスクトップ版には無いため、保存した値を画面から消すこともできません。'
      + 'Drive・カレンダー・Gmail の各画面にある「Google でサインイン」ボタンから認証してください'
      + '（そちらは更新トークンも保存するので、期限が切れたあとも自動で繋ぎ直します）。'
    : null;
}

/**
 * 設定画面の「API キーとトークン」9 スロットが、この実行形態で働くか。
 *
 * ## 実測した欠陥 (2026-09-25 · パス 455)
 *
 * `CredentialRow` は読み・書き・削除のすべてを `getVault()` で行う。
 * ところが**デスクトップ版の保管庫は施錠されたまま解錠できない** ——
 * `unlock()` / `initialize()` を呼ぶ出荷コードは `security/LockScreen.tsx` の
 * 2 行だけで、その画面は `App.tsx` の `browserMode` の下にしか描かれない。
 * `setToken` の入口 `requireKey()` は鍵が無ければ投げるので、
 * **デスクトップ版のこの 9 枚は 1 枚も保存できない**。
 *
 * 実測 (jsdom で実物の行を描き、実際に打って押す):
 *
 * | 段 | 実測 |
 * | --- | --- |
 * | 札 | **「未設定」** (`listConfigured()` は投げずに `[]` を返す) |
 * | 「設定する」 | **出る** |
 * | 伏せ字の欄 | **出る** |
 * | 「保存」 | **押せる** (`disabled === false`) |
 * | 押した結果 | **「Vault がロックされています」** |
 * | 保管層 | **`[]`** (何も入らない) |
 *
 * ★ **重いのは「保存できない」ことではなく、断りが名指しする状態を
 * 利用者が動かせないことである。** デスクトップ版に解錠の操作子は
 * 1 つも無い (`VaultControls` はパスワード変更と施錠をデスクトップ版では
 * 出さない)。読んだ人は在りもしない「解錠」を探しに行く ——
 * パス 388 の「原因を取り違えた断りは、直す手ごと誤らせる」の、
 * **直す手が存在しない**形で、しかも**本物の API キーを貼り付けた後**に出る。
 *
 * ★ **働く道は 8 枚について在る。** デスクトップ版はサービスごとに
 * main の保管ファイルを読む (`getValidToken(serviceId)`) ので、
 * そのサービスの画面の `StatusBar` が持つ資格情報欄が効く道である。
 * だから断りは**その画面を名指しする** (`screen`)。
 *
 * ★ **`anthropic` だけは名指しできない (測って決めた)。** これは
 * `ServiceId` ではなく、デスクトップ版の AI 鍵は
 * `skills` / `emotions` / `business` / `stocks` / `assistant` の
 * **サービスごとのスロット**に分かれて入る (どれも `ctx.token` を
 * `x-api-key` に載せる)。1 つの操作子では名乗れないので、
 * 「使う画面それぞれに欄が在る」と述べる。
 *
 * ★ **断りは「保存」を名指ししない (門が捕まえた)。** 最初に書いた文は
 * 「ここで『保存』を押しても保存されません」だったが、**この断りが出る実行形態では
 * その『保存』が描かれない** (下の画面がボタンごと出さない) —— つまり
 * **画面に無い操作子を名指ししていた**。`namedControlExists` (パス 426) が
 * その場で鳴らした (設計どおり)。
 *
 * ブラウザ版の答えは 1 文字も変えない (`null` を返す)。
 */
export function credentialSlotUnreadNote(kind: BuildKind, screen?: string): string | null {
  if (kind !== 'desktop') return null;
  const head =
    'デスクトップ版はここで保存した資格情報を読みません'
    + '（保存先はブラウザ版の保管庫で、デスクトップ版のトークンは別のファイルに在ります）。'
    + 'しかもデスクトップ版の保管庫は施錠されたままで解錠する操作子がないため、'
    + 'この欄からは保存できません。';
  return screen === undefined
    ? head + 'この鍵を使う画面（Skills・感情ログ・事業ダッシュボード・株式・AI コンシェルジュ）'
      + 'それぞれの「Anthropic API キー」欄から設定してください。'
    : head + `「${screen}」の画面を開き、上部の資格情報欄から設定してください。`;
}

/**
 * **デスクトップ版は BYO プロキシの設定を読まない** (2026-09-25 · パス 456)。
 *
 * ## 実測 (2026-09-25 · 直す前 · jsdom で実物の `ProxySection` を描き、実際に打って押す)
 *
 * | 問い | 実測 (デスクトップ版) |
 * | --- | --- |
 * | 札 (開く前) | 未設定 |
 * | 設定する | 出る |
 * | URL 欄・共有秘密の欄 | 出る |
 * | 保存 | 押せる (`disabled === false`) |
 * | 押した結果 | **プロキシ設定を保存しました** (札も「設定済み」へ) |
 * | 保管層 | **`{"url":"…","sharedSecret":"SUPER-SECRET-…"}`** —— 実際に入る |
 * | デスクトップ版の読み手 | **0 件** |
 *
 * ★ **パス 454 / 455 と同じ家系だが、こちらは静かに成功する。** あちらは保管庫が
 * 施錠されていて断られた (騒がしいが、動かせない状態を名指しした)。ここは
 * **平文の IndexedDB** (`business-hub-preferences` / key `proxy`) なので書き込みは
 * 本当に成功し、画面は成功したと言い、札まで変わる。**利用者が誤りに気付く手がかりが
 * 1 つも無い。**
 *
 * ★ **読み手は全部ブラウザ版に居る** (実測) —— `getProxyConfig` / `fetchViaProxy` を
 * 呼ぶ出荷コードは `web-shim.ts` と、それだけが import する `data/saasWriteWeb.ts` で、
 * `web-shim.ts:1966` は `if (typeof window !== 'undefined' && !window.serviceHub)`。
 * つまり shim はブラウザ版だけ据え付く。**main 側にプロキシの仕組みは 1 つも無い**
 * (`setProxy` / `proxy-server` / `ProxyConfig` / `HTTPS_PROXY` の出現は `src/main` と
 * `src/preload` で **0 件**)。
 *
 * ★ **向きが利用者の損である。** プロキシを設定する人は*経路を自分の側で押さえる*ために
 * そうする (社内の出口統制・SaaS 側の IP 許可・自宅 IP を晒さない)。デスクトップ版は
 * 各サービスへ**直接**つなぐので、その人が求めた統制はまるごと効かず、画面は効いていると
 * 言う。節が名乗る理由 (CORS でブラウザ直接呼び出し不可) も**デスクトップ版では偽**である
 * (CORS はブラウザの制約で、main の fetch には掛からない)。
 *
 * ★ **名指しできる働く道は「実行形態」しかない** —— デスクトップ版に経路を変える設定は
 * 1 つも無いので、別の画面を指すことができない。だから指すのは**ブラウザ版そのもの**で、
 * それは利用者が実際に取れる手である (同じ単一 HTML を開けばこの Worker が使われる)。
 *
 * 断りは `null` を返す = 断らない。**分からないあいだ (`null`) は呼ばない**のは
 * 呼び手の側の約束で、理由は `pasteOAuthUnreadNote` と同じ。
 */
export function proxyUnusedNote(kind: BuildKind): string | null {
  if (kind !== 'desktop') return null;
  return 'デスクトップ版はこのプロキシ設定を読みません'
    + '（中継するのはブラウザ版だけで、デスクトップ版は各サービスへ直接つなぎます）。'
    + '保存しても通信の経路は変わらないので、この欄からは保存できません。'
    + '経路を自分の Worker に通したいときは、ブラウザ版（単一 HTML）で開いて設定してください。';
}

/**
 * Google 3 サービス (Drive / Calendar / Gmail) が**この実行形態で実際に送る物**
 * (2026-09-25 · パス 457)。
 *
 * ## 何が偽だったか
 *
 * `GoogleConnectCard` (Drive / Calendar / Gmail の 3 画面が共有) の末尾は
 * 2026-08 から「ライブ接続（実データ取得・送信）はデスクトップ版の機能で、
 * ブラウザ版は同梱スナップショットを表示します。」と述べていた。
 * **取得については真で、送信については偽である。** 実測 (2026-09-25 · 直す前):
 *
 * | 向き | ブラウザ版の実測 |
 * | --- | --- |
 * | 取得 | **同梱スナップショット** —— `LIVE_READERS` は `cursor` **1 件だけ**なので、 |
 * |      | drive / calendar / gmail は `not_implemented` へ落ちる |
 * | 送信 | **本当に送る** —— `web-shim.ts` の invoke が 3 つの action を |
 * |      | `runProxyBearer` → `saasWriteWeb` の writer へ振り分ける |
 *
 * 偽の fetch で要求を読むと (実測・保管庫のトークンを Bearer に載せて):
 *
 * ```
 *   POST https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink
 *   POST https://www.googleapis.com/calendar/v3/calendars/primary/events
 *   POST https://gmail.googleapis.com/gmail/v1/users/me/drafts
 *   網を叩いた回数: 3
 * ```
 *
 * ★ **向きが利用者の損である。** この 1 文は「この実行形態では何も外へ出ない」と
 * 読める唯一の文で、それを読んだ人が同じ 3 画面に在るフォームを押すと、
 * **本人の Google Drive に実際のフォルダが、Gmail に実際の下書きが作られる**。
 * 法則 `egress-notice-before-send` は「外へ送る画面は何を送るかを言う」と述べるが、
 * ここは**逆を言っていた**。
 *
 * ★ **同じアプリが別の場所で正しく書いていた** —— `Microsoft365Page.tsx:209` は
 * 「実データの取得はデスクトップ版の機能です（…）。メール送信と予定作成は
 * ブラウザ版でも動きます —— プロキシ設定が要ります（設定ページ）。」と述べる
 * (あちらは JSX の素のテキストに `**` を書いているので画面には星印が出る —— 文意は正しいが、
 * その形は写さない)。
 * ms365 の書き込みは**同じ形** (`runProxyBearer` → `saasWriteWeb`) で、同じ 2 action。
 * つまり直す向きはアプリ自身が既に持っており、Google のカードだけがその前提を
 * 持っていなかった (パス 398 / 408 と同じ非対称)。
 *
 * ★ **送る物の名前は表から引く。** 「書き込み」と曖昧に言うと、読んだ人は
 * *何が*作られるのか分からない。3 サービスで 1 action ずつなので表に書き、
 * `renderer/__tests__/browserSendClaimCensus.test.ts` が **`web-shim.ts` の
 * 振り分けと両方向で**突き合わせる (4 つ目の action が生えた日に鳴る)。
 */
export const GOOGLE_BROWSER_SEND: Readonly<Record<'drive' | 'calendar' | 'gmail', {
  /** `web-shim.ts` の invoke がこの綴りで振り分ける action。 */
  readonly action: string;
  /** 利用者に見せる「何が作られるか」。 */
  readonly label: string;
}>> = {
  drive: { action: 'create-folder', label: 'フォルダの作成' },
  calendar: { action: 'create-event', label: '予定の登録' },
  gmail: { action: 'create-draft', label: '下書きの作成' },
} as const;

/** `GOOGLE_BROWSER_SEND` の鍵。 */
export type GoogleServiceId = keyof typeof GOOGLE_BROWSER_SEND;

/**
 * 「この実行形態で、取得と送信はそれぞれどうなるか」。
 *
 * **向きごとに別に言う** —— 1 つの文で「ライブ接続は」とまとめると、
 * 取得が真でも送信が偽になる (それが直した欠陥そのものである)。
 * 文の形は `Microsoft365Page` の正しい 1 文に揃える (同じ事実を同じ言い方で)。
 */
export function googleLiveScopeNote(kind: BuildKind, serviceId: GoogleServiceId): string {
  if (kind === 'desktop') {
    return `実データの取得と${GOOGLE_BROWSER_SEND[serviceId].label}は、どちらもこの実行形態で動きます。`;
  }
  return '実データの取得はデスクトップ版の機能です（ブラウザ版は同梱スナップショットを表示します）。'
    + `いっぽう${GOOGLE_BROWSER_SEND[serviceId].label}はブラウザ版でも実際に Google へ送信します`
    + '（サインイン済みのアカウントに本当に作られます）—— プロキシ設定が要ります（設定ページ）。';
}

/**
 * 方法 A (Google Cloud のクライアント ID + サインイン) が**この実行形態で走るか**。
 *
 * ## 何が起きていたか (実測 2026-09-25 · 直す前 · jsdom で実物のカードを描き、打って押す)
 *
 * | 段 | 実測 (ブラウザ版) |
 * | --- | --- |
 * | 方法 A（推奨・恒久） | 出る |
 * | Google Cloud Console への手順 3 段 | 出る |
 * | クライアント ID の欄 | 出る |
 * | Google でサインイン | 出る・打てば押せる |
 * | 押した結果 | **ブラウザ版では OAuth フローを実行しません** |
 * | localStorage | クライアント ID は**実際に保存される** |
 *
 * ★ **断りが押した後に来る。** そこへ辿り着くまでに利用者は Google Cloud Console で
 * OAuth クライアントを作り、Drive / Calendar / Gmail の 3 つの API を有効化している
 * (カードの手順 1-2 がそう指示する)。**数分の実作業を終えてから、その道が
 * この実行形態に無いと知る。** パス 454 / 455 / 456 で 3 度下したのと同じ判断で、
 * **断りは押す前に言う。**
 *
 * ★ **しかも順位が逆だった** —— 方法 A は「推奨・恒久」、方法 B (OAuth Playground の
 * トークンを貼る) は「即時・お試し」と札が付く。ブラウザ版では**推奨が不可能で、
 * お試しだけが働く**。さらに「恒久」はブラウザ版には存在しない: 設定ページの
 * 貼り付け式 PKCE も `accessToken` だけを持つので (パス 454 の実測)、
 * ブラウザ版で取れる Google の資格情報はどちらも約 1 時間である。
 *
 * ★ **働く道は 2 つあり、どちらも名指しできる** —— 同じカードの方法 B
 * (トークン設定へ貼る) と、設定ページの貼り付け式。断りはその両方を言う。
 *
 * `null` = 断らない。**分からないあいだ (`null`) は呼ばない**のは呼び手の側の約束で、
 * 理由は `pasteOAuthUnreadNote` と同じ (間違って断るほうが、1 フレーム遅れて
 * 断るより害が大きい)。
 */
export function googleSignInUnsupportedNote(kind: BuildKind): string | null {
  if (kind !== 'browser') return null;
  return 'ブラウザ版はこのサインイン（Google Cloud のクライアント ID + 認可）を実行できません'
    + '（loopback で受け取る仕組みがデスクトップ版にしか無いため）。'
    + 'Google Cloud Console でクライアント ID を作る前にお伝えします —— 作っても、この実行形態では使えません。'
    + 'ブラウザ版で Google につなぐ道は 2 つあります: 下の方法 B（OAuth Playground のトークンを貼る）と、'
    + '設定ページの Google OAuth の節（貼り付け式）。どちらも約 1 時間有効です。';
}

/**
 * 書き出しの後に出る 3 つの操作子のうち、**値が「場所」でない実行形態のための札**
 * (2026-09-25 · パス 458)。
 *
 * ## 実測 (2026-09-25 · 直す前 · jsdom で実物の `ExportActions` を描いて押す)
 *
 * ブラウザ版の書き出し action が返す `path` は**ファイル名だけ**
 * (`web-shim.ts` の 4 か所が `path: filename`)。デスクトップ版は
 * `path: filePath` で**絶対パス**である。3 つの操作子の実測:
 *
 * | 操作子 | ブラウザ版 |
 * | --- | --- |
 * | ファイルを開く | **騒がしく断る** (`data-os-op-error` + alert) |
 * | 保存先フォルダを開く | **騒がしく断る** |
 * | **保存場所をコピー** | **静かに `team-radar-….svg` を置き「✓ コピー済み」と言う** |
 *
 * ★ **同じ並びの 3 つのうち 1 つだけが静かに名前と違う事をする。** 押した人は
 * 「場所」を手に入れたつもりでファイル管理ソフトの場所欄へ貼り、当たらない。
 *
 * ★ **アプリ自身が正しい語を別の場所で持っていた** —— `HomePage.tsx:204` は
 * 同じ値を「ファイル名: …」と名乗る (パス 398 / 408 / 451 / 457 と同じ非対称で、
 * 直す向きはアプリ自身が持っている)。
 *
 * ★ **消さずに直す** —— ファイル名は「ライブラリ」でも端末のダウンロードでも
 * その行を探す鍵なので、ブラウザ版から操作子ごと消すのは
 * 法則 `escape-hatch-stays-open` を破る。**札を実物に合わせる**だけにする。
 *
 * **分からないあいだ (`null`) はこの関数を呼ばない**のは呼び手の約束で、
 * そのときはデスクトップ版の札 (= 今までの札) のままにする ——
 * 間違って「ファイル名」と名乗るより、1 フレーム遅れて直すほうが害が小さい。
 */
export function exportCopyLabel(kind: BuildKind): string {
  return kind === 'browser' ? 'ファイル名をコピー' : '保存場所をコピー';
}

/**
 * **その書き込みが、この実行形態で「前提つき」かどうか** (2026-09-25 · パス 459)。
 *
 * ## 実測した欠陥 (2026-09-25 · 直す前 · 実物の shim を読み込んで 15 の書き込みを叩く)
 *
 * ブラウザ版の書き込みは `web-shim.ts` の `runProxyBearer` を通り、その中の
 * `getProxyTransport()` は**プロキシが未登録なら必ず投げる**。保管庫に本物の
 * トークンを入れ、プロキシだけ未登録にして 15 の action を叩いた結果:
 *
 * | 道 | 件数 | 実測 |
 * | --- | ---: | --- |
 * | プロキシが要る | **13** | 「この連携はブラウザの制約 (CORS) でプロキシが必要です…」 |
 * | 直接つながる | **1** | `github/create-issue` は api.github.com へ**実際に届いた** (CORS 許可) |
 * | 別の理由で先に断る | **1** | `security/scan-url` は VirusTotal の鍵が未設定 |
 *
 * ★ **断りは正しいが、来るのが遅い。** そこへ辿り着くまでに利用者は
 * **本物の API トークンを保管庫へ貼り付け**、フォームを埋めている。
 * パス 454 / 455 / 456 / 457 で 4 度下したのと同じ判断で、**断りは押す前に言う。**
 *
 * ★ **アプリ自身が正しい文を別の場所で持っていた** —— `Microsoft365Page.tsx` と
 * (パス 457 が直した) `googleLiveScopeNote` は「プロキシ設定が要ります（設定ページ）」と
 * **前提として**述べる。実測すると、プロキシを要する 11 サービスのうちその前提を
 * 名乗るのは **ms365 と Google の 3 画面だけ**で、notion / slack / atlassian /
 * canva / wordpress / cloudflare / security の **7 画面は 1 文も述べていなかった**
 * (パス 398 / 408 / 451 / 457 / 458 と同じ非対称 —— 直す向きはアプリ自身が持っている)。
 *
 * ★ **`SecurityPage` は「経由する」とは述べるが「要る」とは述べない** ——
 * 「設定した**プロキシ (Cloudflare Worker) を経由**するため、その運用者からも
 * 見えます」は*経路の開示*であって前提ではない。未登録の利用者はそこから
 * 「登録が要る」を読み取れない。
 *
 * ## 決めた形
 *
 * - 文は `shared/` が持つ (`.tsx` は変異検査の母集団の外 —— パス 386 / 445 以降の判断)。
 * - **デスクトップ版では何も言わない** —— main は各サービスへ直接つなぐので、
 *   そこで「Worker を建てろ」と言うのは**偽の前提**を渡すことになる。
 * - **分からないあいだ (`null`) も言わない** —— 橋の `getVersion` が一瞬遅れただけで
 *   デスクトップ版の利用者に要らない作業を案内するほうが害が大きい
 *   (`useBuildKind` の docblock と同じ天秤)。
 * - **フォームは隠さない** —— 既にプロキシを登録している人から送る口を奪うことになり、
 *   法則 `escape-hatch-stays-open` を破る。述べるだけにする。
 * - 断りの綴り (「プロキシが必要です」) を**引用する** —— 押した後に出る文と
 *   同じ語を先に見せておけば、読んだ人は 2 つを結べる。
 */
export function proxyRequiredNote(kind: BuildKind | null, what: string): string | null {
  if (kind !== 'browser') return null;
  return `${what}は、ブラウザ版ではプロキシ (Cloudflare Worker) の登録が要ります`
    + '（ブラウザの制約 (CORS) で、この端末から直接つなげないため）。'
    + '未登録のまま実行すると「プロキシが必要です」と断られます —— '
    + '設定ページの「BYO プロキシ」で登録してください。';
}
