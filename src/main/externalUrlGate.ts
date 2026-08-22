/**
 * externalUrlGate — レンダラー由来の URL を electron の `shell` へ渡してよいか
 * 判定する**唯一の関門**。
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
  return parsed.toString();
}
