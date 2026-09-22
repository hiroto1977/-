/**
 * **外部サービスの「成功した」応答を、読むところで検証する** (2026-09-14 ・ パス 261)。
 *
 * ## 何を直したのか
 *
 * パス 260 は認可サーバのトークン端点について同じことをした。こちらは
 * **書き込みの応答**である —— 課題を作った・下書きを保存した・フォルダを
 * 作った、という報告を相手から受け取る側。`ensureOk` が `!res.ok` を弾いた
 * あと、11 の書き込み口はどれも `(await res.json()) as { … }` だった。
 * `as` は型を名乗るだけで 1 つも確かめない。
 *
 * ## 実測 (2026-09-14・11 経路すべてを機械的に呼んだ)
 *
 * 200 の本文が `{}` / `[]` / `"str"` のとき、**6 経路が成功として返した**:
 *
 * ```
 *   notion/create-page      → {}                  「作成しました」
 *   calendar/create-event   → {}                  「作成しました」
 *   wordpress/create-post   → {}                  「作成しました」
 *   atlassian/create-issue  → {"url":"https://x.atlassian.net/browse/undefined"}
 *   drive/create-folder     → {"url":"https://drive.google.com/drive/folders/undefined"}
 *   security/check-breach   → breaches:[{}]       ← 欄が全部空の「漏洩」を 1 件でっち上げる
 * ```
 *
 * 下 3 つが重い。**`undefined` を埋め込んだ URL** は利用者が押せるリンクとして
 * 画面に出る (どこへも行かない)。`security` は `["x"]` や `[{}]` のような配列でも
 * 要素をそのまま写すので、**名前も日付も件数も空の漏洩**が一覧に並ぶ。
 *
 * 残り 5 経路は投げるが、文面は `Cannot read properties of undefined (reading 'id')`
 * である —— 相手先サービスのことを何も言わない (パス 260 の実測 3 と同じ形)。
 *
 * ## 断る理由は「確認できない」である
 *
 * 外向きの書き込みは**もう起きてしまっている**かもしれない。だから文面は
 * 「失敗しました」ではなく「**処理したことを確認できません**」と述べる ——
 * 相手側に物が出来ている可能性を消さずに伝えるため。
 *
 * ## ここが見ないもの
 *
 * 読み取り (snapshot) 側の `jsonFetch<T>` は今も `JSON.parse(text) as T` で、
 * 74 クライアントぶんの母集団が残っている (`docs/REMAINING_WORK.md` のパス 261)。
 *
 * 応答の**大きさ**もここでは見ない。**この段落は 2026-09-20 (パス 330) まで
 * 「`readBodyWithCap` (10 MiB) と `fetchViaProxy` が先に掛かっている
 * (実測で確認済み)」と書いていたが、それは偽だった** —— 当時の呼び出し 16 本の
 * うち 2 本 (`main/clients/ollama.ts` の `/api/version` と `/api/tags`) は
 * どちらも通っておらず、`withTimeout` が見るのは締切と endpoint の allowlist
 * だけである。**「上流が掛けている」は呼び出し側を数えないと言えない。**
 *
 * 直し方は**上流を数える**ではなく**読む所で切る**にした。`parseJsonBody`
 * (本文を自分で読む口) は消し、`parseJsonText` (読み終えた文字列を受け取る口)
 * だけを残す —— こうすると呼び出し側は上限つきで読む手続きを**通らずには
 * 呼べない**。母集団は `shared/__tests__/responseBodyCapCensus.test.ts` が
 * 両方向に留め、`.json()` が 0 件であることは `jsonBodyCensus.test.ts` が留める。
 */

/**
 * 上限つきで読み終えた本文を JSON として読む。**読めなければ文言は定数** (2026-09-17 · パス 311)。
 *
 * V8 の `SyntaxError` は本文の**先頭 10 字を引用する** (Node 22 実測):
 *
 * ```
 *   JSON.parse('ghp_abcdefghijklmnop…')  →  Unexpected token 'g', "ghp_abcdef"... is not valid JSON
 *   JSON.parse('<!DOCTYPE html>…')        →  Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 * ```
 *
 * `res.json()` も同じ文を投げるので、相手 (または途中のプロキシ) が 2xx で JSON でない本文を返し、
 * その先頭に資格情報が在れば、その 10 字が例外の文面に乗って `action_failed` の文として画面へ出る。
 * `shared/tokenResponse.ts` (パス 260) と `shared/api/http.ts` / `shared/ai/chat.ts` /
 * `main/clients/types.ts` は既に文言を定数にしていたが、パス 261 で足した書き込み 13 経路と
 * liveRead の transport・main の Ollama 2 経路は `await res.json()` のままだった。
 *
 * **`Response` を受け取る双子 (`parseJsonBody`) は 2026-09-20 (パス 330) に消した。**
 * 本文を自分で読む口が在ると、上限は「呼び出し側がどの transport を渡したか」に
 * 依ってしまう —— 実際 16 本のうち 2 本は上限を通っていなかった。
 * 文字列しか受け取らない口だけを残せば、**読む手続きを通らずには呼べない**。
 */
export function parseJsonText(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(notJsonMessage(label));
  }
}

/** 読めなかったときの 1 文。本文は 1 字も引用しない。 */
export function notJsonMessage(label: string): string {
  return `${label} の応答が JSON ではありません (処理したことを確認できません)`;
}

/** 応答が JSON のオブジェクトであることを要求する。配列は通さない。 */
export function requireObject(raw: unknown, label: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label} の応答が JSON のオブジェクトではありません (処理したことを確認できません)`);
  }
  return raw as Record<string, unknown>;
}

/** 応答が JSON の配列であることを要求する。 */
export function requireArray(raw: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${label} の応答が JSON の配列ではありません (処理したことを確認できません)`);
  }
  return raw;
}

/**
 * 非空の文字列の欄を要求する。
 *
 * **空文字も断る。** `id: ''` を通すと `…/browse/` のような欄の抜けた URL が
 * できあがり、`undefined` を埋め込むのと同じ結果になる。
 */
export function requireString(obj: Record<string, unknown>, field: string, label: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v === '') {
    throw new Error(`${label} の応答に ${field} (非空の文字列) がありません (処理したことを確認できません)`);
  }
  return v;
}

/** 数値の欄を要求する。非有限は通さない (パス 98 の規準)。 */
export function requireNumber(obj: Record<string, unknown>, field: string, label: string): number {
  const v = obj[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${label} の応答に ${field} (有限の数値) がありません (処理したことを確認できません)`);
  }
  return v;
}

/** 入れ子のオブジェクトの欄を要求する (`{folder:{id}}` / `{message:{id}}` 用)。 */
export function requireChild(
  obj: Record<string, unknown>,
  field: string,
  label: string,
): Record<string, unknown> {
  const v = obj[field];
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`${label} の応答に ${field} (オブジェクト) がありません (処理したことを確認できません)`);
  }
  return v as Record<string, unknown>;
}

/** 任意の文字列の欄。型が合わなければ**落とす** (既定値を作らない)。 */
export function optionalString(obj: Record<string, unknown>, field: string): string | undefined {
  const v = obj[field];
  return typeof v === 'string' ? v : undefined;
}

/** 任意の文字列の配列。要素は文字列だけ残す。 */
export function optionalStringArray(obj: Record<string, unknown>, field: string): readonly string[] {
  const v = obj[field];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** 鍵の読み取り結果 —— 行と、**鍵がそこに在ったのか**。 */
export interface ArrayFieldRead {
  readonly rows: readonly unknown[];
  /** 鍵が在って配列だったか。`rows` が空でも true なら「0 件」が相手の答えである。 */
  readonly read: boolean;
}

/**
 * オブジェクトの 1 鍵を配列として読み、**読めたのかどうかを一緒に返す**
 * (2026-09-14 · パス 264)。
 *
 * ## なぜ「読めた」を返す必要があるのか
 *
 * `(body.results ?? []).map(…)` は落ちないが、**鍵が無いことと空の配列を
 * 同じ `[]` に畳む**。そこから件数の文や判定を作ると、相手が何も答えて
 * いないのに断定した文が画面へ出る。パス 263 が `cursor` で直した形で、
 * 実測すると同じ形が 2 つ残っていた:
 *
 *   notion         `note: pages.length === 0 ? 'インテグレーションに共有された
 *                  ページなし' : …`
 *                  → 本文が `{}` だと**利用者の Notion の設定を診断する文**が出る。
 *                    共有は正しいのに共有設定を直しに行かせる。
 *   microsoft-365  `📧 Outlook: 直近 0 件 / 未読 0 件` / `📅 予定: 直近 0 件`
 *                  → 「サマリー」の節に 2 件のカードとして出るので、
 *                    **空に見えない。数えた結果のように見える。**
 *
 * **空の配列は `read: true`。** 0 件は答えであって、欠測ではない
 * (この区別が付かないことが、そもそもの欠陥である)。
 */
export function readArrayField(obj: unknown, field: string): ArrayFieldRead {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { rows: [], read: false };
  }
  const v = (obj as Record<string, unknown>)[field];
  return Array.isArray(v) ? { rows: v, read: true } : { rows: [], read: false };
}

/**
 * 第三者の応答の配列から、**物である要素だけ**を取り出す (2026-09-22 · パス 409)。
 *
 * ## なぜ要るか —— 実測 (2026-09-22 · 直す前)
 *
 * `(data.files ?? []).map((f) => ({ id: f.id, … }))` は、**配列でない値**と
 * **物でない要素**のどちらも防がない。`??` は null / undefined しか受けないので、
 * 相手が 1 件でも壊れた行を返すと**その画面が丸ごと使えなくなる**:
 *
 * | client | 壊し方 | 結果 |
 * | --- | --- | --- |
 * | drive | 要素が `null` | `Cannot read properties of null (reading 'id')` |
 * | drive | `files` が文字列 | `(data.files ?? []).map is not a function` |
 * | calendar | 要素が `null` / `start` が無い | 同上 (2 形) |
 * | wordpress / slack / base / canva / gmail | 要素が `null` | 同上 |
 *
 * `library.ts` の「行そのものは落とさない」(パス 136) や
 * `recordShapeAudit.ts` の「壊れた行で画面が投げると、画面から消せなくなる」
 * (パス 360 · 法則 `escape-hatch-stays-open`) と**同じ問い**が、
 * 保管層ではなく**第三者の応答**の側に在った。
 *
 * ## 何を保証し、何を保証しないか
 *
 * 保証するのは **① 配列でなければ空 ② 要素は物 (null・配列・スカラーは落とす)**
 * の 2 つだけである。**欄の型は見ない** —— `row.name` は `unknown` のままで、
 * 呼ぶ側が `optionalString` などで読むか、少なくとも**投げない形**で読む責任を持つ。
 * 欄ごとの型と天井は別の軸で、`docs/REMAINING_WORK.md` に母集団を残してある
 * (パス 408 が `normalizeModels` について閉じたのと同じ話)。
 *
 * 型引数は**呼ぶ側の宣言をそのまま使う**ための物で、`jsonFetch<T>` が既に
 * 置いているのと同じ嘘の大きさである (欄の型は誰も確かめていない) ——
 * **この関数が新しく嘘を増やすわけではない**が、増やしてもいない。
 */
export function objectRows<T = Record<string, unknown>>(v: unknown): readonly T[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is T => x !== null && typeof x === 'object' && !Array.isArray(x),
  );
}

/**
 * **第三者の応答の数値欄**を読む。有限な数でなければ `null`。 (2026-09-22 · パス 410)
 *
 * パス 409 が `objectRows` で「要素は物」までを閉じたあと、**欄の型**を測ったら
 * 画面が落ちる形が残っていた。実測 (2026-09-22 · 直す前・実物の
 * `fetchBaseSnapshot` に `{"items":[{"item_id":1,"title":"商品A","visible":1}]}`
 * を食わせて BASE の画面を描く):
 *
 * | 相手の応答 | 画面 |
 * | --- | --- |
 * | `price` の無い商品が 1 件 | **`Cannot read properties of undefined (reading 'toLocaleString')`** —— 画面が丸ごと落ちる |
 * | `price: '1000'` (文字列) | 落ちないが **`¥1000`** —— 桁区切りの無い値を金額として刷る |
 *
 * ## なぜ `shared/num.ts` の `finiteOrNull` を呼ばないか
 *
 * 中身は同じ判定だが、あちらの引数の型は `number` である。**それは
 * 自分たちが計算した数を受ける関数で、文字列を渡したら型エラーになるのが
 * 正しい**。ここは `jsonFetch<T>` のキャストが作った「型が在るように見える
 * `unknown`」を受けるので、文字列が来るのは**想定内の入力**である。
 * 揃えると片方が必ず緩む —— `loopbackChecks.test.ts` や パス 402 の
 * 「数の読み方は共有しない」と同じ判断で、**受理集合が同じでも母集団が違う**。
 *
 * 呼び手は `numericFieldReaders.test.ts` が両方向で数える。
 */
export function finiteNumberOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
