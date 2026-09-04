/**
 * `record-entry` が受け取る入力の上限 —— **両ビルド・4 サービスで 1 つだけ持つ。**
 *
 * ## なぜ要るか (2026-08-23)
 *
 * `record-entry` は uber-eats / demae-can / real-estate / mutual-funds の
 * 4 つが持つ同じ形の action で、同じ上限 (note 1-2000 字) を **5 か所に
 * 別々に書いていた**:
 *
 * ```
 *   main/clients/uber-eats.ts      `p.note.length > 2000`   ← 字面
 *   main/clients/demae-can.ts      `p.note.length > 2000`   ← 字面
 *   main/clients/real-estate.ts    `p.note.length > 2000`   ← 字面
 *   main/clients/mutual-funds.ts   `p.note.length > 2000`   ← 字面
 *   renderer/web-shim.ts           MAX_MOOD_NOTE_CHARS      ← 別機能の定数
 * ```
 *
 * 値は全部 2000 で一致していたので**壊れてはいなかった**。問題は 2 つ:
 *
 *  1. 同じ判断を 5 か所に書くと、必ずどれかが先に古くなる
 *     (`shared/proxyEndpoint.ts` で同じ理由を書いた)。
 *  2. ブラウザ版だけが **`MAX_MOOD_NOTE_CHARS` (気分ログのメモの上限)** を
 *     借りていた。気分ログの都合で上限を動かすと、無関係な**業務記録の
 *     受け入れ幅がブラウザ版でだけ変わる**。名前が違うものを借りると、
 *     こういう見えない繋がりができる。
 *
 * 値は現行のまま (2000)。利用者から見た挙動は変えない。
 */

/** `record-entry` の業務メモの上限。 */
export const MAX_RECORD_NOTE_CHARS = 2000;
