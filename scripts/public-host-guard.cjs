/**
 * public-host-guard — 外部から来た URL を CI が取りに行く前の関門。
 *
 * ## なぜ要るか (2026-08-25 実測)
 *
 * `knowledge-auto.yml` は毎週 `--links=400` で出典 URL の生死を確かめる。
 * 対象は知識データセットの `sources[].url` —— **実測 11,004 本 / 1,500 ホスト**
 * (うち 22 本は平文 `http://`)。呼び出しはこうだった:
 *
 * ```
 *   isCheckableUrl(url)   // scheme が http(s) か **だけ**
 *   fetch(url, { method: 'HEAD', redirect: 'follow' })
 * ```
 *
 * ホストは一切見ていない。GitHub の runner から、第三者の 1,500 ホストへ
 * **リダイレクトを追って**繋ぎに行く。このリポジトリは同じ攻撃を
 * `docs/PROXY_EXAMPLE.md` の頭で名指ししている:
 *
 *   「ホストが `302 Location: http://169.254.169.254/` を返す経路を塞ぐ」
 *
 * 利用者が配るプロキシでは塞いであるのに、**自分の CI では素通り**だった。
 * 資格情報は載らないが、runner の網の中の位置そのものが資産である
 * (メタデータ endpoint / 同一 runner 上の別サービス)。
 *
 * 実測では現在のデータに私設・予約ホストは 0 件。**無いことと見えないことは
 * 違う** —— 危ないのはデータではなく、第三者が返す `Location` のほうである。
 *
 * ## 同じ判断を 4 つ目に増やさない
 *
 * 私設・予約レンジの表は既に 2 つある (`src/renderer/network/proxy.ts` と
 * `docs/PROXY_EXAMPLE.md`)。この 2 つは今日ずれているのが見つかったばかりで、
 * 3 つ目を書き写せば同じことが起きる。だから
 * `src/renderer/network/__tests__/proxyWorkerParity.test.ts` が
 * **3 実装を同じ標本へ当てて**突き合わせる。
 *
 * 使い方:
 *   node scripts/public-host-guard.cjs --self-test
 */
'use strict';

const dns = require('node:dns').promises;

/** IPv6 文字列を 16bit × 8 群へ展開する。解析不能なら null。 */
function expandV6(input) {
  let s = String(input);
  const pct = s.indexOf('%');
  if (pct !== -1) s = s.slice(0, pct); // ゾーン ID は判定に不要

  // 末尾 dotted-quad (`::ffff:127.0.0.1`) を 2 群の hex へ (RFC 4291 §2.2-3)。
  const tail = /^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(s);
  if (tail) {
    const oct = tail[2].split('.').map(Number);
    if (oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = `${tail[1]}${((oct[0] << 8) | oct[1]).toString(16)}:${((oct[2] << 8) | oct[3]).toString(16)}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part) => (part === '' ? [] : part.split(':').map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN)));
  const head = parse(halves[0]);
  const tailGroups = halves.length === 2 ? parse(halves[1]) : [];
  if ([...head, ...tailGroups].some((n) => !Number.isInteger(n))) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tailGroups.length;
  if (fill < 1) return null;
  return [...head, ...Array(fill).fill(0), ...tailGroups];
}

/**
 * 私設 / 予約なら true。**解析できない入力も true (deny)** —— パーサ差異を
 * 攻撃側に有利へ働かせない。角括弧つきの IPv6 リテラルも受ける。
 */
function isPrivateOrReservedHost(host) {
  if (typeof host !== 'string' || host.length === 0) return true;
  const bare0 = host.trim().toLowerCase();
  const bare = bare0.startsWith('[') && bare0.endsWith(']') ? bare0.slice(1, -1) : bare0;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (v4) {
    const oct = v4.slice(1).map(Number);
    if (oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = oct;
    if (a === 0) return true;                             // 0.0.0.0/8 "this host"
    if (a === 10) return true;                            // 10.0.0.0/8
    if (a === 127) return true;                           // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;              // 169.254/16 link-local = IMDS
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16/12
    if (a === 192 && b === 168) return true;              // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true;    // 100.64/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;  // 198.18/15 benchmark
    if (a === 192 && b === 0 && c === 0) return true;      // 192.0.0/24 IETF 割当
    if (a === 192 && b === 0 && c === 2) return true;      // 192.0.2/24 TEST-NET-1
    if (a === 198 && b === 51 && c === 100) return true;   // 198.51.100/24 TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true;    // 203.0.113/24 TEST-NET-3
    if (a === 192 && b === 88 && c === 99) return true;    // 192.88.99/24 6to4 リレー
    if (a >= 224) return true;                            // multicast + reserved
    return false;
  }

  if (!bare.includes(':')) {
    // 名前。**ここでは通す** —— 解決後の IP を見るのは resolvesToPublicHost の役目。
    // localhost だけは解決を待たずに落とす (hosts の書き換えで揺れるため)。
    return bare === 'localhost' || bare.endsWith('.localhost');
  }

  const g = expandV6(bare);
  if (g === null) return true;
  const embedded = (hi, lo) => `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  const allZero = (from, to) => g.slice(from, to).every((x) => x === 0);

  if (allZero(0, 8)) return true;                              // :: unspecified
  if (allZero(0, 7) && g[7] === 1) return true;                // ::1 loopback
  if (allZero(0, 5) && g[5] === 0xffff) return isPrivateOrReservedHost(embedded(g[6], g[7])); // ::ffff:0:0/96
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) return isPrivateOrReservedHost(embedded(g[6], g[7])); // 64:ff9b::/96
  if (g[0] === 0x2002) return isPrivateOrReservedHost(embedded(g[1], g[2])); // 2002::/16 6to4
  if (allZero(0, 6)) return isPrivateOrReservedHost(embedded(g[6], g[7]));   // ::a.b.c.d

  if ((g[0] & 0xfe00) === 0xfc00) return true;                 // fc00::/7 ULA
  if ((g[0] & 0xffc0) === 0xfe80) return true;                 // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;                 // fec0::/10 site-local
  if ((g[0] & 0xff00) === 0xff00) return true;                 // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;         // 2001:db8::/32 文書用
  return false;
}

/** http(s) で、ホストがリテラルとして私設・予約でないこと。 */
function isFetchableUrl(url) {
  if (typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  // 資格情報を URL に載せた形は、そもそも出典として不正。
  if (parsed.username !== '' || parsed.password !== '') return false;
  return !isPrivateOrReservedHost(parsed.hostname);
}

/**
 * 名前を解決して、返ってきた **すべての** アドレスが公開空間かを見る。
 * 1 つでも私設・予約なら false。解決できなければ false (deny)。
 *
 * DNS rebinding は塞げない (解決と接続の間に差し替えられる)。ここの狙いは
 * 「第三者が返す `Location` で内部へ向けられる」ほうで、そちらには効く。
 */
async function resolvesToPublicHost(hostname, lookup = dns.lookup) {
  if (typeof hostname !== 'string' || hostname === '') return false;
  if (isPrivateOrReservedHost(hostname)) return false;
  // リテラルなら解決は不要 (上で既に見ている)。
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) return true;
  let addrs;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    return false;
  }
  if (!Array.isArray(addrs) || addrs.length === 0) return false;
  return addrs.every((a) => !isPrivateOrReservedHost(a.address));
}

module.exports = { isPrivateOrReservedHost, isFetchableUrl, resolvesToPublicHost, expandV6 };
