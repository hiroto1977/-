/**
 * **`web-shim.ts` を走査する道具** (2026-09-25 · パス 459 で検査ファイルから出した)。
 *
 * 中身は 2026-09-14 (パス 249) に `webShimTimeouts.test.ts` が置いた物を
 * **1 字も変えずに**移しただけである。
 *
 * ★ **出した理由** —— 2 本目の消費者 (`proxyRequiredNoticeCensus.test.ts`) が要った。
 * **検査ファイルを import すると中の `describe` がもう一度走る**ので
 * (`shared/__tests__/stripNonCode.ts` が 2026-09-14 に同じ理由で切り出された)、
 * 走査の道具は検査ではないファイルへ置く。実測: 移す前に import したら
 * **24 件が二重に走って落ちた** (jsdom の設定を持たない側で走るため)。
 */
/** `web-shim.ts` の分岐から「プロキシを通る action」を集める。 */
export function proxyRoutedActions(source: string): string[] {
  const keys: string[] = [];
  const re = /serviceId === '([a-z0-9-]+)' && action === '([a-z-]+)'/g;
  const starts: { key: string; at: number }[] = [];
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    starts.push({ key: `${m[1]}/${m[2]}`, at: m.index });
  }
  /*
   * **1 つの条件が複数の action を受けることが在る** ——
   * `if ((serviceId === 'notion' && …) || (serviceId === 'slack' && …)) { … }`
   * の形で、本体は 1 つ。鍵の次の鍵までを本体とみなすと、**前の鍵が本体を
   * 持たない**ことになって落ちる (2026-09-14 に実測: notion が消えた)。
   * 鍵と鍵の間に `{` が無ければ同じ条件の続きとみなして束ねる。
   */
  const groups: { keys: string[]; at: number }[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const prev = groups[groups.length - 1];
    const between = i === 0 ? '{' : source.slice(starts[i - 1]!.at, starts[i]!.at);
    if (prev !== undefined && !between.includes('{')) prev.keys.push(starts[i]!.key);
    else groups.push({ keys: [starts[i]!.key], at: starts[i]!.at });
  }
  for (let g = 0; g < groups.length; g += 1) {
    const body = source.slice(groups[g]!.at, groups[g + 1]?.at ?? source.length);
    // `runProxyBearer<unknown>(` のように**型引数が挟まる**呼び方が在る。
    // 最初は `runProxyBearer\(` だけを見ていて notion / slack を落とした
    // (2026-09-14 に実測。名前で引く走査が綴りの変種で黙る、この日 2 度目の形)。
    if (/runProxyBearer[<(]|getProxyTransport\(\)/.test(body)) keys.push(...groups[g]!.keys);
  }
  return keys.sort();
}
