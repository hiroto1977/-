/**
 * 文字列の鍵で引く表を、**prototype を経由せずに**引く。
 *
 * ## なぜ 1 か所に置くか
 *
 * `Record<string, X>` の素の添字は、表に無い鍵でも `Object.prototype` 側の
 * 値を返す。`'constructor'` は `Object` を、`'toString'` は関数を返し、
 * `'__proto__'` は `Object.prototype` を返す。したがって
 *
 * ```ts
 * TABLE[key] ?? FALLBACK   // ← 表に無ければ FALLBACK … ではない
 * ```
 *
 * は **prototype の鍵に対して発火しない**。返るのは truthy な継承値なので
 * `??` も `||` も素通りし、`?.` は「その値の属性」を見にいく。
 * `noUncheckedIndexedAccess: true` でも型は `X | undefined` になるだけで、
 * `X | Function` にはならない —— **型検査器はこの穴を見ない**。
 *
 * このリポジトリは同じ間違いを 5 回、別々の場所で踏んで直している:
 *
 *   - `renderer/network/liveRead.ts`      — `'constructor'` が「対応済みサービス」に見えた
 *   - `renderer/data/manualData.ts`       — 同じ形をコメントで名指しして直した
 *   - `renderer/data/collectionShapes.ts` — 復元の**形の判定**が prototype 由来の関数として呼ばれる
 *   - `renderer/pages/DocstudioPage.tsx`  — 2 か所
 *   - `main/clients/stocks.ts`            — 戦略の解決 (payload 由来の鍵)
 *
 * 5 回とも「踏んでから」直しており、6 回目を止める物が無かった。判定を
 * 1 か所に置き、`__tests__/prototypeKeyLookup.test.ts` が
 * **公開されている引き手を総当たりで駆動して**留める (綴りではなく振る舞いを見る)。
 *
 * ## 使い方
 *
 * ```ts
 * lookup(TABLE, key) ?? FALLBACK   // 表に無ければ必ず FALLBACK
 * has(TABLE, key)                  // 表に在るか (`Object.hasOwn` そのもの)
 * ```
 */

/**
 * 表に**自分の属性として**在る鍵か。`Object.hasOwn` の別名だが、
 * 呼ぶ側が「なぜ素の `in` や添字でないのか」を辿れる場所を 1 つ持つために置く。
 */
export function has<T>(table: Readonly<Record<string, T>>, key: string): boolean {
  return Object.hasOwn(table, key);
}

/**
 * 表を引く。**自分の属性として在るときだけ値を返す。**
 *
 * 表に無ければ `undefined` を返すので、呼ぶ側は `?? 既定` をそのまま書ける
 * (その `??` が、素の添字と違って**必ず発火する**)。
 */
export function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
