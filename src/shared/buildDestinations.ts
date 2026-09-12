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
