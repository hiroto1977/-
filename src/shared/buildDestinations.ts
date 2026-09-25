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
 * | 画面が何と言うか | **「Google 連携を有効化しました (Drive / Calendar / Gmail)」** |
 *
 * **生きた Google の access token が、誰も読まず誰も消せない場所へ入り、
 * 画面は成功したと言う。** 法則 `escape-hatch-stays-open` の、逃げ口が
 * *最初から無い*形である (パス 453 は「保存した直後に出ない」だった)。
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
