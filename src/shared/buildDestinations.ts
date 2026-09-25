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

/** どの実行形態か。判定は `renderer/runtimeMode.ts` (橋の version)。 */
export type BuildKind = 'desktop' | 'browser';

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
