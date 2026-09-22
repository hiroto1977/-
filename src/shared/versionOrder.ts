/**
 * 版の順序のうち、**プレリリースをどう並べるか**だけを持つ。
 *
 * ## なぜ 1 つにするのか (2026-09-22 · パス 402)
 *
 * この規則は semver §11.3 の「プレリリースは対応する正式版より前」であり、
 * アプリの中で **2 か所が別々に答えていた**:
 *
 * - `updateCheck.ts` —— 正しく答えていた (`prereleaseKey` で正式版を U+FFFF に
 *   置き、辞書順 1 本で順序を付ける)。docblock も「必要なのは『x.y.z の大小』と
 *   『プレリリースは正式版より古い』の 2 点だけ」と、この規則を名指ししている。
 * - `ollama.ts` —— **プレリリースを剥がして捨てていた** (`v.split('-')[0]`)。
 *   そちらは第三者 (利用者の Ollama) が名乗る版を**既知の脆弱性の台帳**と
 *   突き合わせる側で、実測 (2026-09-22) では台帳 8 件のうち **7 件**が
 *   `fixedIn + '-rc1'` を名乗るだけで黙った —— CVE-2024-37032 (critical・
 *   Probllama の RCE) を含む。`isVersionSafe('0.31.2-rc1')` も true を返し、
 *   画面の安全の帯が反転していた。
 *
 * **弱い方が security の側に在った。** 同じ問いに 2 通り答えるとき、どちらが
 * 危ない側に立っているかは名前からは分からない。
 *
 * ## 分けて残す物
 *
 * 数の読み方 (`0.1.34` を [0,1,34] にする所) は**共有しない**。
 * `updateCheck` は自分たちのタグを読むので厳格な `x.y.z` を要求して
 * 読めなければ null を返し、`ollama` は第三者が名乗る任意の文字列を読むので
 * 読めない成分を 0 に倒して**必ず答えを出す** (不明な版を「安全」と言わない
 * ための fail-closed)。要求が逆向きなので、揃えると片方が必ず緩む ——
 * `shared/__tests__/loopbackChecks.test.ts` が 3 つのループバック判定について
 * 記録しているのと同じ判断である。共有するのは**順序の規則だけ**。
 */

/**
 * 正式版 (プレリリースなし) の比較キー。
 *
 * 版の識別子に使える字は `[0-9A-Za-z.-]` だけなので、そこに現れない U+FFFF を
 * 正式版のキーにすれば「正式版はどのプレリリースより後」が辞書順 1 本で付く。
 */
export const RELEASE_SORTS_AFTER_PRERELEASE = '￿';

/** プレリリース識別子の比較キー。正式版 (null) は `RELEASE_SORTS_AFTER_PRERELEASE`。 */
export function prereleaseKey(prerelease: string | null): string {
  return prerelease === null ? RELEASE_SORTS_AFTER_PRERELEASE : prerelease;
}

/**
 * 版の文字列を「数の部分」と「プレリリース識別子」に割る。
 *
 * ビルドメタデータ (`+…`) は semver §10 のとおり順序に関与しないので先に落とす。
 * プレリリースは**最初の** `-` から後ろ全部 (`0.1.34-rc-1` の識別子は `rc-1`)。
 * 区切りが無ければ `prerelease` は null。
 */
export function splitVersionPrerelease(raw: string): {
  readonly core: string;
  readonly prerelease: string | null;
} {
  // split は必ず 1 要素以上返すので [0] は常に存在する。?? '' は型の narrowing 用。
  // Stryker disable next-line OptionalChaining,StringLiteral
  const noBuild = raw.split('+')[0] ?? '';
  const dash = noBuild.indexOf('-');
  if (dash === -1) return { core: noBuild, prerelease: null };
  return { core: noBuild.slice(0, dash), prerelease: noBuild.slice(dash + 1) };
}
