/**
 * **1 本のモジュールだけを読み直す** —— 依存先はキャッシュのまま (2026-09-27 · パス 495)。
 *
 * ## なぜ要るか —— 変異検査の「偽の生存」の出どころ
 *
 * モジュール直下の値 (定数・表・既定の文) の変異体は、Stryker では **static** と呼ばれる。
 * `stryker.config.json` は `ignoreStatic: true` なので、static な変異体は本来
 * **測らない (Ignored)** 側に落ちる。ところが Stryker の vitest の足場は `beforeEach` で
 * 「いまどの検査か」を立て、`afterEach` で下ろす —— だから**検査の中で**モジュールを
 * 評価し直すと、その直下の値は「この検査が覆った」と数えられる。そうなった変異体
 * (static かつ検査ごとの被覆つき = hybrid) を、Stryker は**覆った検査だけ**で走らせる
 * (`mutant-test-planner.js` の `ignoreStatic && coveredBy.length` の枝)。
 *
 * 覆った検査がその値を**主張していなければ**、変異体は生き残る。これが
 * 2026-09-27 の全掃引で出た 1,150 件の static な生存の正体だった
 * (`docs/REMAINING_WORK.md` パス 494 / 495)。たとえば `main/clients/funding.ts` の
 * 110 件は、名前を数えるためだけに `main/clients/index` を**検査の中で**読んでいた
 * 1 本の検査が覆っており、その 1 行を file の先頭の import へ移すと
 * **21.43% (生存 110) → 100.00% (Ignored 110)** になった (対照 2 回・実測)。
 *
 * ## `vi.resetModules()` は依存先まで読み直す
 *
 * 「読み直して static な変異体を測る」はこのリポジトリの確立した手である
 * (`vi.resetModules()` + 動的 `import()` —— 変異体が有効な状態で値が評価される)。
 * ところが `vi.resetModules()` は**モジュールの台帳を丸ごと**空にするので、
 * 読み直した対象の**依存先まで**検査の中で評価し直される。依存先の値はその検査が
 * 主張していないので、そこに hybrid の生存が生まれる (実測: 貸借対照表を読み直す
 * 検査 13 本が、互いの依存先の定数 47 件を覆っていた)。
 *
 * ## この関数がすること
 *
 * `import('<絶対パス>?reread=N')` —— クエリが違えば vitest は**別のモジュール**として
 * 評価するが、その中の `import` は**普通の道**で解決されるので、依存先は台帳に在る物が
 * そのまま使われる。実測 (2026-09-27 · vitest 4.1.11): 呼ぶたびに対象は +1 回評価され、
 * 依存先は 1 回のまま・同じインスタンスで、`vi.mock` / `vi.doMock` も依存先に効く。
 *
 * ★ **対象は検査ファイルが先頭で静的に import しておくこと。** そうしないと、最初の
 * 読み直しのときに依存先が**検査の中で**初めて評価され、同じ汚れが戻る。これは
 * `shared/__tests__/inTestModuleLoadCensus.test.ts` が機械で見る。
 *
 * ★ **読み直すなら、対象の直下の値を全部主張すること。** 読み直した検査は、対象の
 * 直下の値を (主張した物だけでなく) **全部**覆う。主張していない値の変異体は、その検査
 * だけで走って生き残る —— 同じ値を主張する普通の検査は読み込みの時点で評価した値を
 * 見るので、変異体に届かない。実測 (2026-09-27 · パス 495): `balanceSheet.test.ts` の
 * 読み直す検査 2 件は collection 名と比率だけを主張しており、同じモジュールの表
 * (`BS_NUMERIC_FIELDS` ほか) の変異体 45 件がその 2 件だけで走って生き残っていた。
 *
 * @param importerUrl 呼ぶ検査ファイルの `import.meta.url` (相対の道をそこから解く)
 * @param spec 読み直すモジュールの道 (検査ファイルからの相対・拡張子なし)
 */
import { fileURLToPath } from 'node:url';

let seq = 0;

export async function rereadModule<T>(importerUrl: string, spec: string): Promise<T> {
  if (!spec.startsWith('.')) {
    // パッケージは計器が入らないので読み直す意味が無く、道の解き方も違う。
    throw new Error(`rereadModule は相対の道だけを受け取る (受け取った値: ${spec})`);
  }
  const path = fileURLToPath(new URL(spec, importerUrl));
  seq += 1;
  return (await import(/* @vite-ignore */ `${path}?reread=${seq}`)) as T;
}
