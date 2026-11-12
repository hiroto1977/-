/**
 * **安全の判定を作る応答を読む** —— 両ビルドで 1 つ (2026-09-14 ・ パス 261)。
 *
 * HIBP の漏洩一覧と VirusTotal の検出内訳。どちらも「あなたは漏洩に含まれるか」
 * 「この URL は危険か」という判定の材料で、**読めなかった答えを読めたことに
 * すると利用者が自分の状態を誤解する**。だから同じ 1 つの器に置く。
 *
 * ## なぜ共有にしたか
 *
 * 同じ `.map()` が 2 か所に在り、**どちらも検証をしていなかった**:
 *
 * ```
 *   ブラウザ  renderer/data/saasWriteWeb.ts  (await res.json()) as {…}[]  → data.map(…)
 *   main      main/clients/security.ts       JSON.parse(text) as HibpBreach[] → data.map(…)
 * ```
 *
 * 実測 (2026-09-14・ブラウザ側で機械的に呼んだ):
 *
 * | 200 の本文 | 直す前 |
 * |---|---|
 * | `["x"]` / `[{}]` | **`breaches:[{}]`** —— 名前も日付も件数も空の漏洩を 1 件でっち上げる |
 * | `[{"Name":123,"DataClasses":"nope"}]` | 数値やオブジェクトが画面の欄へそのまま入る |
 * | `{}` / `"str"` | `data.map is not a function` (相手先を何も言わない) |
 * | `[null]` | `Cannot read properties of null (reading 'Name')` |
 *
 * **漏洩の有無は安全の判断である。** 読めない答えを「読めた」ことにすると、
 * 画面は欄の空いた漏洩を並べるか、逆に落ちる。どちらも利用者が自分の状態を
 * 誤解する。
 *
 * ## 空の配列は通す
 *
 * HIBP は「どの漏洩にも含まれない」を **404** で返し、呼び出し側はそれを
 * 先に `{ email, breaches: [] }` へ落としている。200 + `[]` は HIBP の
 * 文書に無い形だが、**正しく形の合った空の配列**である —— 404 を 200 + `[]`
 * に正規化するプロキシは在り得るので、断る理由が無い。
 * (最初の見立てでは「空配列 = 答えていない応答から安全と判定している」と
 * 書いたが、それは誤りだった。実際に作られていたのは**逆向き**の、
 * 空の漏洩をでっち上げる側である。)
 */
import { requireArray, requireChild, requireNumber, requireObject, requireString, optionalStringArray } from './apiResponse';
import type { BreachRow } from './actionData';

const LABEL = 'HIBP API';

/**
 * 漏洩一覧を読む。1 件でも形が合わなければ**全体を断る**。
 *
 * 落とした件数を数えて残りを見せる形 (パス 89 / 121) にはしない ——
 * ここで見せる一覧は「あなたはこの漏洩に含まれている」という判断で、
 * **部分的に読めた一覧は「含まれていない漏洩は無い」を意味しない**。
 * 数が信用できないなら一覧も信用できない。
 */
export function hibpBreaches(raw: unknown): BreachRow[] {
  return requireArray(raw, LABEL).map((entry) => {
    const o = requireObject(entry, LABEL);
    return {
      name: requireString(o, 'Name', LABEL),
      title: requireString(o, 'Title', LABEL),
      date: requireString(o, 'BreachDate', LABEL),
      pwnCount: requireNumber(o, 'PwnCount', LABEL),
      dataClasses: [...optionalStringArray(o, 'DataClasses')],
    };
  });
}

const VT = 'VirusTotal API';

/** VirusTotal の検出内訳。 */
export interface VtScanStats {
  readonly harmless: number;
  readonly malicious: number;
  readonly suspicious: number;
  readonly undetected: number;
}

/**
 * URL レポートの `data.attributes.last_analysis_stats` を読む。
 *
 * **4 つの内訳を 1 つずつ要求する。** 直す前は両ビルドとも `as {…}` だったので:
 *
 * - 欄が欠けた応答 → `undefined + undefined` = **NaN** の「検出数 / 総数」
 * - 入れ子が欠けた応答 → `Cannot read properties of undefined`
 *
 * 数えられなかったものを数え上げてはいけない —— 「検出 0 / 総数 0」も
 * 「NaN」も、危険な URL を安全に見せうる。
 */
export function vtScanStats(raw: unknown): VtScanStats {
  const stats = requireChild(
    requireChild(requireChild(requireObject(raw, VT), 'data', VT), 'attributes', VT),
    'last_analysis_stats',
    VT,
  );
  return {
    harmless: requireNumber(stats, 'harmless', VT),
    malicious: requireNumber(stats, 'malicious', VT),
    suspicious: requireNumber(stats, 'suspicious', VT),
    undetected: requireNumber(stats, 'undetected', VT),
  };
}
