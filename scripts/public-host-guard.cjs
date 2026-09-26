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
 * loopback を指す名前。**解決を待たずに落とす**唯一の組。
 *
 * `resolvesToPublicHost` は DNS に頼るが、loopback を指す名前は hosts の
 * 書き換えと検索ドメインの補完で揺れる —— 揺れる物を唯一の守りにしない。
 *
 * `ip6-localhost` / `ip6-loopback` は Debian / Ubuntu の `/etc/hosts` が
 * **既定で持っている** ::1 の別名で、GitHub の runner にも在る。
 */
const LOOPBACK_NAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

/**
 * 先頭・末尾のドットを落とす。**同じ相手を指す別表記**だから。
 *
 * `URL` は名前の末尾ドットを残す (`new URL('http://localhost./').hostname`
 * は `'localhost.'`)。2026-07 の監査が client 側 (`proxy.ts`) で見つけた
 * 迂回路で、そちらでは直っているが**こちらには適用されていなかった**
 * (2026-09-12 実測)。IP リテラルは `URL` が正規化するので影響しない。
 */
function trimDots(name) {
  return name.replace(/^\.+/, '').replace(/\.+$/, '');
}

/**
 * 私設 / 予約なら true。**解析できない入力も true (deny)** —— パーサ差異を
 * 攻撃側に有利へ働かせない。角括弧つきの IPv6 リテラルも受ける。
 */
function isPrivateOrReservedHost(host) {
  if (typeof host !== 'string' || host.length === 0) return true;
  const bare0 = trimDots(host.trim().toLowerCase());
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
    // loopback を指す名前だけは解決を待たずに落とす (LOOPBACK_NAMES の注記)。
    // `*.localhost` も loopback である (RFC 6761 §6.3)。
    return LOOPBACK_NAMES.has(bare) || bare.endsWith('.localhost');
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

/**
 * 自分の規則ごとの対照実験。
 *
 * ## なぜ 2026-09-12 まで無かったか
 *
 * **このファイルの冒頭は `node scripts/public-host-guard.cjs --self-test` と
 * 書いていたが、`selfTest` は存在しなかった。** 引数を何にしても黙って
 * exit 0 を返す —— 書いてあるとおりに叩いた人は「関門は無事」と読む。
 * 姉妹の 37 本はすべて実装しており、2026-08-25 に「self-test を持つ 28 本を
 * 1 本ずつ壊して終了コードを測った」census は**実装している物**を数えたので、
 * 実装していない物を名乗るだけのこのファイルは census の外に在った。
 *
 * 実測の結果: 走査対象 126 文のうち **18 文が一度も実行されていなかった**。
 * 中身は関門の要そのもの —— 資格情報つき URL の拒否、NAT64 / 6to4 /
 * IPv4-compatible に埋め込んだ IPv4 (IMDS への迂回路 3 種)、
 * `resolvesToPublicHost` の早期 return 全部 (解決できない → deny を含む)。
 * **振る舞いはどれも正しかった** (34 形を手で当てて確かめた)。
 * 無かったのは、それを留めておく物である。
 *
 * ## 標本は両側を持つ
 *
 * 「全部 deny を期待する一覧」は、実装が常に true へ落ちても通る。
 * 通す側も同じ数だけ並べる。
 */
async function selfTest() {
  const cases = [
    // ---- 名前 (解決を待たずに落とす唯一の組) ----
    ['localhost は落とす', 'localhost', true],
    ['末尾ドットの localhost も落とす (URL は名前の末尾ドットを残す)', 'localhost.', true],
    ['大文字 + 末尾ドットも落とす', 'LOCALHOST.', true],
    ['先頭ドットも落とす', '.localhost', true],
    ['ip6-localhost (Debian/Ubuntu の既定の別名) を落とす', 'ip6-localhost', true],
    ['ip6-loopback も落とす', 'ip6-loopback', true],
    ['*.localhost も loopback (RFC 6761 §6.3)', 'foo.localhost', true],
    ['公開名は通す', 'www.nta.go.jp', false],
    ['localhost を含むだけの公開名は通す', 'notlocalhost.example', false],
    // ---- IPv4 リテラル ----
    ['loopback', '127.0.0.1', true],
    ['IMDS (link-local)', '169.254.169.254', true],
    ['CGNAT', '100.64.0.1', true],
    ['octet が範囲外 → 解析不能なので deny', '999.1.1.1', true],
    ['末尾ドットつきの IMDS も落とす', '169.254.169.254.', true],
    ['公開 IPv4 は通す', '93.184.216.34', false],
    ['172.16/12 の 1 つ手前は通す', '172.15.0.1', false],
    // ---- IPv6 に埋め込んだ IPv4 (IMDS への迂回路) ----
    ['IPv4-mapped で IMDS', '::ffff:169.254.169.254', true],
    ['IPv4-compatible で IMDS', '::169.254.169.254', true],
    ['NAT64 (RFC 6052 の well-known prefix) で IMDS', '64:ff9b::a9fe:a9fe', true],
    ['6to4 (RFC 3056) で IMDS', '2002:a9fe:a9fe::1', true],
    ['NAT64 に公開 IPv4 を載せたものは通す', '64:ff9b::93.184.216.34', false],
    ['6to4 に公開 IPv4 を載せたものは通す', '2002:5db8:d822::1', false],
    // ---- IPv6 リテラル ----
    ['::1', '::1', true],
    ['未指定アドレス', '::', true],
    ['ULA', 'fd12:3456::1', true],
    ['link-local', 'fe80::1', true],
    ['ゾーン ID つき link-local', 'fe80::1%eth0', true],
    // ゾーン ID を落とす効果が**観測できる**のは通す側だけ ——
    // 落とさないと解析不能になり、安全側 (deny) へ倒れて差が出ない。
    ['ゾーン ID つきの公開 IPv6 は、住所で判定して通す', '2001:4860:4860::8888%eth0', false],
    ['文書用 (8 群の完全形)', '2001:0db8:0:0:0:0:0:1', true],
    ['角括弧つきでも同じ', '[::ffff:127.0.0.1]', true],
    ['公開 IPv6 は通す', '2001:4860:4860::8888', false],
    ['db8 の隣は通す', '2001:db9::1', false],
    // ---- 解析できない入力は deny (パーサ差異を攻撃側に渡さない) ----
    ['空文字', '', true],
    ['文字列でない', null, true],
    [':: が 2 つ', 'a::b::c', true],
    ['hex でない群', 'gggg::1', true],
    ['群が 9 つ (fill < 1)', '2001:0db8:1:2:3:4:5:6:7', true],
    ['群が 7 つ・:: 無し', '1:2:3:4:5:6:7', true],
    ['`::` の両側で 8 群に達している (埋める余地が無い)', '1:2:3:4::5:6:7:8', true],
    ['埋め込み dotted-quad が範囲外', '::ffff:999.1.1.1', true],
  ];

  const urls = [
    ['https は通す', 'https://www.nta.go.jp/x', true],
    ['http も通す (コーパスに 22 件ある)', 'http://example.jp/x', true],
    ['資格情報を載せた URL は通さない', 'https://u:pw@example.com/x', false],
    ['利用者名だけでも通さない', 'https://u@example.com/x', false],
    ['合言葉だけでも通さない', 'https://:pw@example.com/x', false],
    ['ホストを userinfo に偽装した形も通さない', 'https://example.com@169.254.169.254/x', false],
    ['http でないものは通さない', 'file:///etc/passwd', false],
    ['URL として読めないものは通さない', 'not a url', false],
    ['文字列でないものは通さない', 42, false],
    ['10 進整数形の loopback (URL が正規化する)', 'http://2130706433/x', false],
    ['短縮形の loopback', 'http://127.1/x', false],
    ['16 進形の loopback', 'http://0x7f.0.0.1/x', false],
    ['NAT64 で IMDS を指す URL', 'http://[64:ff9b::169.254.169.254]/x', false],
  ];

  /**
   * 解決の対照。実 DNS は使わない (差し替え口から渡す)。
   *
   * 下の `解決してはいけない` を投げる lookup は**仕掛け線**である ——
   * 呼ばれないことが期待値なので、行カバレッジでは「未実行」に見える。
   * 実行されたらその場で落ちる。**未実行が正しい数少ない行。**
   */
  const answer = (...addrs) => async () => addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  const resolves = [
    ['名前が公開 IP へ解決すれば通す', 'example.com', answer('93.184.216.34'), true],
    ['1 つでも私設へ解決するなら落とす', 'mixed.example', answer('93.184.216.34', '169.254.169.254'), false],
    ['すべて私設なら落とす', 'internal.example', answer('10.1.2.3'), false],
    ['解決できなければ落とす (deny)', 'nx.example', async () => { throw new Error('ENOTFOUND'); }, false],
    ['答えが空なら落とす', 'empty.example', answer(), false],
    ['答えが配列でなければ落とす', 'weird.example', async () => ({ address: '93.184.216.34' }), false],
    ['公開 IPv4 リテラルは解決を要らない', '93.184.216.34', () => { throw new Error('解決してはいけない'); }, true],
    ['公開 IPv6 リテラルも解決を要らない', '2001:4860:4860::8888', () => { throw new Error('解決してはいけない'); }, true],
    ['私設リテラルは解決の前に落とす', '127.0.0.1', () => { throw new Error('解決してはいけない'); }, false],
    ['名前が loopback 名なら解決の前に落とす', 'localhost.', () => { throw new Error('解決してはいけない'); }, false],
    ['空の名前は落とす', '', () => { throw new Error('解決してはいけない'); }, false],
    ['文字列でない名前は落とす', null, () => { throw new Error('解決してはいけない'); }, false],
  ];

  let bad = 0;
  const say = (ok, label, got, want) => {
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(got)} (期待 ${JSON.stringify(want)})`);
  };

  console.log('self-test:');
  console.log(' isPrivateOrReservedHost (true = 塞ぐ)');
  for (const [label, host, want] of cases) {
    const got = isPrivateOrReservedHost(host);
    say(got === want, label, got, want);
  }
  console.log(' isFetchableUrl (true = 通す)');
  for (const [label, url, want] of urls) {
    const got = isFetchableUrl(url);
    say(got === want, label, got, want);
  }
  console.log(' resolvesToPublicHost (true = 通す)');
  for (const [label, host, lookup, want] of resolves) {
    let got;
    try {
      got = await resolvesToPublicHost(host, lookup);
    } catch (e) {
      got = `throw: ${e.message}`;
    }
    say(got === want, label, got, want);
  }

  // **標本が片側に寄っていないこと。** 全部 deny を期待する一覧は、実装が
  // 常に true へ落ちても通る。両側が在ることを数で留める。
  const blocked = cases.filter(([, , w]) => w === true).length;
  const allowed = cases.length - blocked;
  if (blocked < 10 || allowed < 5) {
    bad++;
    console.log(`  ✗ 標本が片側に寄っている (塞ぐ ${blocked} / 通す ${allowed})`);
  } else {
    console.log(`  ✓ 標本は両側を持つ (塞ぐ ${blocked} / 通す ${allowed})`);
  }

  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log(`✅ self-test 全件一致 (${cases.length + urls.length + resolves.length} 件)`);
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  console.error('使い方: node scripts/public-host-guard.cjs --self-test');
  return Promise.resolve(2);
}

module.exports = { isPrivateOrReservedHost, isFetchableUrl, resolvesToPublicHost, expandV6, selfTest };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
