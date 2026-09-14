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
 * 応答の**大きさ**もここでは見ない —— `readBodyWithCap` (10 MiB) と
 * `fetchViaProxy` が先に掛かっている (実測で確認済み)。
 */

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
