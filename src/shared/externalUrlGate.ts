/**
 * externalUrlGate — 外へ開く URL を判定する**唯一の関門**。
 * デスクトップ版は electron の `shell` へ、ブラウザ版は `window.open` へ渡す。
 *
 * ## なぜ shared に居るか (2026-08-23 に main から移した)
 *
 * ブラウザ版 (`web-shim.ts` の `openExternal`) が**別の実装**を持っていた ——
 * `/^https?:\/\//i` という字面検査である。攻撃入力 29 種で突き合わせると
 * **6 種で答えが割れた**:
 *
 * ```
 *   "https://\njavascript:alert(1)"   main=false  browser=true
 *   "http://\u0000evil"               main=false  browser=true
 *   "https:/\\evil.com"               main=true   browser=false
 *   "https:example.com"               main=true   browser=false
 *   "https:/example.com"              main=true   browser=false
 *   "https\t://example.com"           main=true   browser=false
 * ```
 *
 * **前 2 つが効く構図である。** 字面は `https://` で始まるので通るが、
 * `window.open` が実際に開くのは**解析後の URL** で、検査した文字列とは
 * 別物になりうる。ブラウザは URL 中の改行や NUL を落として解釈するので、
 * 「調べたもの」と「開くもの」がずれる。今日のブラウザではどちらも
 * 無害化されるが、**検査が別物を見ている**という形そのものが穴である。
 * 後ろ 4 つは逆向きの害で、正当なリンクを黙って開かない。
 *
 * この関数は**解析してから判定し、正規化した形を返す**ので、
 * 「調べたもの」と「開くもの」が一致する。実装を 1 つにして差を消した。
 *
 * `shellOpenGate.ts` が「OS にファイルを開かせてよいか」の関門なら、こちらは
 * 「OS に URL を開かせてよいか」の関門である。`javascript:` / `data:` は
 * コード実行、`file:` はローカル読み出し、OS 独自スキーム (`ssh:` /
 * `ms-windows-store:` / `vbscript:` 等) はハンドラ起動に繋がる。
 *
 * ## なぜ main.ts から出したか
 *
 * 2026-08-22 の点検で、**同じ判断が main.ts の中に 2 つ**あることに気付いた:
 *
 * ```
 *   setWindowOpenHandler   u.protocol === 'http:' || u.protocol === 'https:'   ← 手書き
 *   ipcMain 'app:openExternal'   EXTERNAL_URL_SCHEMES.has(parsed.protocol)     ← 定数
 * ```
 *
 * 答えは今日たまたま同じだが、**片方しか固定されていなかった。**
 * `docs/ARCHITECTURE.md` の不変条件 #5 は `EXTERNAL_URL_SCHEMES` を目印にして
 * いるので、この定数を締めれば不変条件も締まったように見える。対照実験で
 * `new Set(['https:'])` に変えたところ:
 *
 *   - `mainIpc.test.ts`    → 落ちた (IPC の扉は定数を見ている)
 *   - `mainWindow.test.ts` → **22 件すべて緑のまま** (窓の扉は手書きなので動かない)
 *
 * つまり「外部 URL は http(s) 限定」を**締める**変更を入れても、`window.open`
 * 経由の扉は古い規則のまま開き続け、しかも検査は全部緑だった。
 * `shellOpenGate.ts` を main.ts から出したときと同じ理由 —— 危険度の高い関門が
 * main.ts の中の手書きで、単体で測れない —— なのでここへ出す。
 *
 * ## 揃えてよい理由
 *
 * `shared/*` のループバック判定は 3 つあるが、あれは**問いが違う**ので
 * 統合してはいけない (`shared/__tests__/loopbackChecks.test.ts`)。
 * ここは逆で、2 つの扉は**同じ問い**に答えている ——
 * 「この URL を OS のブラウザで開かせてよいか」。
 * 同じ問いなら、答えが違うのはただの欠陥である。
 */

/**
 * OS へ渡すことを許すスキーム。**不変条件 #5 の本体。**
 *
 * 名前を付けてあるのは、docs/ARCHITECTURE.md §8.1 の参照が**この定数を
 * 目印にして固定される**ため。以前この行は `openExternal` という語で
 * 参照していたが、同じ語が main.ts に 3 回出るので `verify:arch` の
 * 記号局所性検査 (±15 行) が効かず、参照が別の場所を指したまま緑だった
 * (2026-08-22 の対照実験で判明)。
 */
export const EXTERNAL_URL_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * 開いてよいなら**正規化した URL 文字列**、駄目なら `null`。
 *
 * `shellTargetOrNull` と同じ形にしてある —— 「駄目」を例外ではなく値で返す。
 * 呼び出し側が `catch` を書き忘れて素通しになる形にはしない。
 *
 * 返すのは `parsed.toString()` (生の入力ではない)。`new URL` が通した時点で
 * 前後の空白や制御文字は落ちているので、**解析に使った文字列そのもの**を
 * 渡すことになり、「検査した文字列」と「開く文字列」がずれない。
 */
export function externalUrlOrNull(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // `URL.protocol` は小文字へ正規化済みなので `JavaScript:` もここで落ちる。
  if (!EXTERNAL_URL_SCHEMES.has(parsed.protocol)) return null;
  /*
   * **本当の送り先を、見せかけで隠す形を落とす。**
   *
   * `https://accounts.google.com@evil.example/` の送り先は `evil.example`
   * だが、頭から読むと信用できる名前で始まる。この関門を通った文字列は
   *
   *   1. 画面のカードにそのまま出ることがあり
   *   2. `app:openExternal` を通って OS のブラウザへ渡る
   *
   * ので、**読んだ人が思う送り先と、実際に開く先が食い違う**。
   *
   * この判断はリポジトリの中で既に 3 か所が下していた ——
   * `proxyEndpoint.ts` / `aiEndpoint.ts` / `ollama.ts` はどれも
   * 「認証情報付き URL は拒否」と書いて `username` / `password` を見る。
   * **外へ開く唯一の関門だけが、それを見ていなかった** (2026-08-25 に実測。
   * URL を検証する 17 関数のうち、落としていたのは 3 つだけだった)。
   *
   * ここへ来る URL には**遠隔の応答から来たもの**がある ——
   * `DataList` は `item.href` を押されたら開くが、その値は
   * ライブ取得した相手先の応答である。名前を出せる立場の相手なら誰でも
   * 仕込める形なので、字面の信用と送り先を割らせない。
   *
   * パスやクエリの `@` は巻き添えにしない (`https://github.com/@handle` は
   * `username` が空)。落とすのは**ホストの手前**に認証情報がある形だけ。
   */
  if (parsed.username !== '' || parsed.password !== '') return null;
  return parsed.toString();
}
