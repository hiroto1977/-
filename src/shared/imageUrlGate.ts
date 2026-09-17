/*
 * 第三者由来の画像 URL の関門 — スキーム検証と、沈み先ごとの正しい包み方。
 *
 * **なぜ `src/shared/` に居るか**: 2026-08-24 に数えたら、この関門だけが
 * 変異検査の対象から外れていた。`externalUrlGate` / `httpLimits` /
 * `safeFilename` といった同種の壁はすべて単一目的のモジュールとして
 * `src/shared/` に在り `mutate` に載っているのに、これは
 * `components/DataList.tsx` の中に置かれていたため
 *
 *   - `mutate` に `.tsx` が 1 件も無い → **変異体が 1 つも作られない**
 *   - `MUST_MEASURE` (必ず測る壁の名簿) にも載りようがない
 *
 * という状態だった。**関門がコンポーネントの中に隠れていたことが、
 * 見落とされた原因そのもの**なので、壁の在る場所へ移した。
 *
 * (同じ形は `exportPaths.ts` と `frameGuard.ts` で既に踏んでいる ——
 *  どちらも「壁なのに測られていなかった」。名簿はそのために在る。)
 */
import { isPrivateOrReservedTarget } from './privateTarget';

/**
 * 第三者 API 由来の画像 URL を `https:` / `http:` / `data:image/*` に限定する。
 * 許可スキーム以外は `undefined` を返し、呼び出し側は `<img>` を描画しない。
 *
 * 2026-07 セキュリティ監査（多層防御 / 予防的）: 現在の呼び出し元は `<img src>` だけで、
 * `<img src="javascript:…">` からスクリプトは実行されないため既存の実害はない。
 * ただし同じ値が将来 `<a href>` / CSS `url()` / SVG `<use href>` / `openExternal` に
 * 流れた瞬間に `javascript:` や `data:text/html` が実行プリミティブになる。検証は
 * 描画箇所ごとではなく値の入口（このヘルパー）に置き、リファクタで守りが消えないようにする。
 *
 * 実装メモ:
 *  - 空文字ではなく `undefined` を返す。`src=""` はページ自身を再取得してしまうため、
 *    「属性を付けない」ことが正しい失敗形。
 *  - HTML の URL 属性はパース前に tab/LF/CR を除去するので、検証側でも同じ正規化を
 *    しないと `java\tscript:` 型でスキーム判定を回避できる。検証した文字列をそのまま返す。
 *  - `data:image/svg+xml` は `<img>` 内ではスクリプト無効だが、`<use>` / `<object>` では
 *    有効になる。本ヘルパーは `<img>` 用であり、他要素へ流用する免罪符ではない。
 *  - 許可スキームは main / web-shim の `openExternal`（http(s) allowlist）と同じ方針。
 *
 * ## 「同じ方針」は 5 形で偽だった (2026-09-16 · パス 299)
 *
 * 上の行は自分を `openExternal` の関門と**同じ方針**と名乗っていた。
 * 両方に同じ 15 形を当てて実測すると **9 形で答えが割れ**、うち
 * **5 形はこちらが緩い側**だった:
 *
 * ```
 *   入力                                          ここ    externalUrlOrNull  実際に取りに行く host
 *   https://accounts.google.com@evil.example/x.png 通す    落とす             evil.example
 *   https://user:pass@evil.example/x.png           通す    落とす             evil.example
 *   https://cdn.example.com@127.0.0.1/x.png        通す    落とす             127.0.0.1
 *   https://<LF>javascript:alert(1)                通す    落とす             (解析不能)
 *   http://<NUL>evil/x.png                         通す    落とす             (解析不能)
 * ```
 *
 * 原因は**字面の前置き一致** (`/^https?:\/\//i`) で、`externalUrlGate` が
 * 自分の冒頭で名指ししている弱さそのもの ——「字面は `https://` で始まるので
 * 通るが、実際に取りに行くのは**解析後の URL** で、検査した文字列とは
 * 別物になりうる」。パス 291 が `oauth.ts` の端点で、パス 298 が `<a href>` で
 * 直したのと同じ家系である。
 *
 * **ここへ来る値は第三者 API の応答そのもの** (`DataList` の `item.thumbnailUrl`・
 * `StatusBar` の `avatarUrl` ——後者の注記が「第三者 API（GitHub / Slack /
 * Google …）由来」と書いており、`main/clients/github.ts` は応答の `avatar_url`
 * をそのまま読む)。`<img>` からスクリプトは走らないが、**取得そのものが起きる**:
 * 攻撃者の選んだホストへ利用者の IP で GET が飛び (追跡画素)、
 * `127.0.0.1` やプライベート帯も対象になる (読めないが load / error の
 * タイミングは観測できるので在否の判定になる)。
 *
 * **直し**: http(s) の枝を**解析してから**判定し、`externalUrlGate` と同じ
 * 「認証情報つき authority は拒否」を掛け、**解析後の文字列を返す**
 * (調べた物と取りに行く物を一致させる)。`data:image/*` の枝は 1 字も変えない
 * —— そこは**問いが違う**ので割れていて正しい (`<img>` は data: を要り、
 * OS のブラウザへ渡す関門は data: を拒む)。
 *
 * ## 閉じていない物を、閉じたと書かない → パス 300 で閉じた (2026-09-17)
 *
 * パス 299 の時点で**プライベート帯・ループバックのホストはまだ落としていなかった。**
 * 足さない理由を 2 つ書いた (最初は 1 つしか書いておらず、同日中に追記):
 *
 *   1. **方針** —— LAN の自ホスト (社内 GitLab のアバター等) を黙って
 *      映さなくする機能変更になる。**測ったが決めていない**という状態
 *   2. **構造** —— 規準は在るが、**ここからは import できない**。
 *      `renderer/network/proxy.ts` が `isPrivateOrReservedTarget` を
 *      export していたが、`lint:imports` は `shared: ['shared']` ——
 *      `shared → renderer` は禁止で、その禁止は走査の self-test に
 *      `['shared', 'renderer', false]` として固定されている
 *
 * 1 だけを書くと、次の読み手は「では import すればよい」と考えて
 * 境界の違反に当たる。**流用できない理由は、流用したくない理由とは別に書く。**
 *
 * パス 300 で両方を解いた:
 *
 *   1. **方針は、測ったら決まった。** この関門へ第三者の URL を渡す呼び出し側は
 *      2 つ (`DataList` の `thumbnailUrl`・`StatusBar` の `avatarUrl`) で、
 *      それを埋める fetcher は `main/clients/github.ts` (`avatar_url`) と
 *      `main/clients/canva.ts` (`thumbnail.url`) の 2 本。どちらも**送り先が
 *      ソース中のリテラルで固定** (`https://api.github.com/…` /
 *      `https://api.canva.com/…`) なので、応答の画像 URL は GitHub / Canva が
 *      発行した公開 CDN の物しか正当には来ない —— GitHub Enterprise Server も
 *      自前の Canva も繋げないので、「LAN のアバター」は**起きえない**。
 *      一方 `AssistantPage` の背景画像 (`safeCssUrl`) は**利用者自身が欄に打つ**
 *      値で、NAS の `http://192.168.1.10/bg.png` は正当である。
 *      つまり**問いが 2 つ在った**: 「第三者が指した先を取りに行ってよいか」と
 *      「自分が指した先を取りに行ってよいか」。前者だけがプライベート帯を落とす。
 *   2. **判定を `shared/privateTarget.ts` へ移した** (中身は不変・`proxy.ts` は
 *      re-export)。写しを作らず、BYO プロキシとここが同じ 1 つを読む。
 *
 * 従って関門は 2 段になった:
 *
 *   - `safeImageSrc`        スキーム + 認証情報 —— 自分の値・第三者の値、両方の床
 *   - `safeRemoteImageSrc`  その上に**送り先がプライベート帯 / 予約帯なら落とす**
 *                           —— 第三者の応答から来る値はこちらを通す
 *
 * 「割れていて正しい」の対 (`data:image/*` と `externalUrlGate`) と同じく、
 * 2 段が違う答えを返す標本は `imageUrlGate.test.ts` が名前をつけて留める。
 * 「では `safeImageSrc` にも掛ければ簡単だ」は、利用者の背景画像を黙って
 * 消す変更である —— 揃えた瞬間にそこが落ちる。
 *
 * 認証情報の側は迷う余地が無い (authority に資格情報を持つ正当な画像 URL は無い)。
 */
export function safeImageSrc(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const normalized = url.replace(/[\t\n\r]/g, '').trim();
  if (/^https?:\/\//i.test(normalized)) {
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return undefined;
    }
    // `externalUrlGate` と同じ判断: 本当の送り先を見せかけで隠す形を落とす。
    if (parsed.username !== '' || parsed.password !== '') return undefined;
    // 解析後の形を返す —— これで「調べた文字列」と「取りに行く文字列」が一致する。
    return parsed.toString();
  }
  // `data:image/<subtype>` のみ。`;base64,` でも `,` 直結でも可。
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(normalized)) return normalized;
  return undefined;
}

/**
 * **第三者の応答から来た**画像 URL の関門。`safeImageSrc` の上に、
 * **送り先がプライベート帯 / 予約帯 (loopback・RFC 1918・link-local・
 * クラウドメタデータ・内部 TLD …) なら落とす**を重ねる。
 *
 * `<img>` からスクリプトは走らないが**取得は起きる** —— 利用者のブラウザが
 * 利用者の網の内側へ GET を飛ばし、load / error のタイミングで在否が漏れる
 * (追跡画素と内部探索の踏み台)。第三者 API の応答が指してよい先ではない。
 * 判定は `privateTarget.ts` の `isPrivateOrReservedTarget` —— BYO プロキシの
 * SSRF 関門と**同じ 1 つ**で、写しではない。
 *
 * `data:image/*` はホストを持たないのでそのまま通す (取得が起きない)。
 * 自分で打った値 (アシスタントの背景画像) には掛けない —— `safeCssUrl` は
 * `safeImageSrc` を読む。理由は上の docblock「パス 300 で閉じた」。
 */
export function safeRemoteImageSrc(url: string | undefined | null): string | undefined {
  const src = safeImageSrc(url);
  if (src === undefined) return undefined;
  // `safeImageSrc` が http(s) を通すのは解析後の形だけなので、ここで再解析は失敗しない。
  if (!/^https?:/i.test(src)) return src;
  if (isPrivateOrReservedTarget(new URL(src))) return undefined;
  return src;
}

/**
 * CSS の `url()` に入れてよい形にして返す。許可外なら `undefined`。
 *
 * `safeImageSrc` の冒頭が「同じ値が CSS `url()` へ流れた瞬間に危険」と
 * 書いているのに、**その CSS `url()` がこの関門を通っていなかった**
 * (`pages/AssistantPage.tsx` の背景画像。2026-08-24 に発見)。値は
 * localStorage の `assistant-theme` から来るので、同一オリジンの別ページや
 * 拡張から書き換えられる。検証を描画箇所ごとに書くと同じことが繰り返される。
 *
 * 引用が要る理由はスキームとは別にある —— URL に `)` や空白や引用符が
 * 入ると宣言そのものが壊れて背景が黙って出なくなる
 * (`https://example.com/a(b).png` は実在しうる形)。
 */
export function safeCssUrl(url: string | undefined | null): string | undefined {
  const src = safeImageSrc(url);
  if (src === undefined) return undefined;
  // 置換は関数形にする。文字列形だと `$&` が特別扱いされる
  // (R2-13 で同じ足元を掬われている)。
  return `url("${src.replace(/["\\]/g, (c) => `\\${c}`)}")`;
}
