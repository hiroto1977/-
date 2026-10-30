/**
 * vetted — **関門を通った値にだけ付く型の印** (2026-10-30 · パス 559 · threat: T-220)。
 *
 * ## 何を守るか
 *
 * 外へ開く URL は `externalUrlOrNull`、OS に開かせるパスは `shellTargetOrNull` を通す
 * —— この規則は censuses (綴りの走査) と検査が守ってきたが、**コンパイラは知らなかった**。
 * electron の `shell` の口 (外部 URL を開く・既定アプリで開く) と `window.open` はどれも素の `string` を受けるので、
 * 関門を飛ばした 1 行は `tsc` を通り、走査の針が綴りを外せば何も鳴らない
 * (このリポジトリが繰り返し直してきた「綴りの針は、綴りでない物に動かされる」形)。
 *
 * ここでは規則を**型**にする。OS の口 (`main/osSinks.ts` / `renderer/vettedSinks.ts`) は
 * 素の `string` ではなく `VettedExternalUrl` / `VettedShellPath` だけを受け、その型は
 * **関門の `return` 1 か所でしか作れない**。関門を飛ばした値を渡すと `tsc` が断る:
 *
 * ```
 *   openExternalVetted('https://example.com')
 *   // error TS2345: Argument of type 'string' is not assignable to parameter of type 'VettedExternalUrl'.
 * ```
 *
 * ## 実行時の費用は 0
 *
 * 印は `unique symbol` を鍵にした**型だけの欄**で、値には何も足さない (`declare` なので
 * 出荷物に 1 byte も入らない)。中身は素の文字列のままなので、`string` を受ける所
 * (ログ・本人確認の要約) へはそのまま渡せる —— 逆向き (素 → 印) だけが閉じている。
 *
 * ## 印を作ってよい所
 *
 * `as Vetted…` のキャストは**鋳造する関数の中だけ**に置く。どこに何個在るかは
 * `src/shared/__tests__/vettedTypes.test.ts` が両方向の台帳で数える (関門の外でキャストを
 * 書けば型の守りは自分で外せるので、それを鳴らすのは型ではなく census の仕事である)。
 *
 * ## 精度を上げ続ける
 *
 * 印で守っている口と、まだ素の `string` を受けている口は同じ検査の台帳
 * (`SINK_LEDGER`) に並ぶ。`pending` の行は理由を持ち、**数は増えてはいけない** ——
 * 新しい口を足すなら印を持たせるか、理由つきで台帳へ書く。減らすのが正しい向きである。
 */

declare const VETTED: unique symbol;

/** 関門の種類。印の種類ごとに別の型になるので、URL の印をパスの口へは渡せない。 */
export type VettedKind = 'external-url' | 'shell-path';

/** 関門 `K` を通った文字列。作れるのは関門の `return` だけ。 */
export type Vetted<K extends VettedKind> = string & { readonly [VETTED]: K };

/** `externalUrlOrNull` を通った URL (http / https・認証情報なし・8,000 オクテット以下・正規化済み)。 */
export type VettedExternalUrl = Vetted<'external-url'>;

/** `shellTargetOrNull` を通った実体パス (書き出し先の中・実行され得ない拡張子・安全な葉の名前)。 */
export type VettedShellPath = Vetted<'shell-path'>;
