/*
 * privateTarget — 「この送り先はプライベート帯 / 予約帯か」の判定。
 *
 * ## なぜ shared に居るか (2026-09-17 · パス 300 で `renderer/network/proxy.ts` から移した)
 *
 * この判定は BYO プロキシの SSRF 関門として `proxy.ts` の中に生まれ、
 * そこで測られ (Stryker 100%)・守られ (整合性チェーン) てきた。
 * パス 299 が `imageUrlGate` に「第三者 API の応答から来た画像 URL の
 * ホストがプライベート帯でも取りに行く」を見つけたとき、**規準は在るのに
 * import できなかった** —— `lint:imports` は `shared: ['shared']` で、
 * `shared → renderer` は禁止 (self-test に `['shared', 'renderer', false]`
 * として固定)。判定を写せば `proxyWorkerParity.test.ts` が 3 か所目・4 か所目の
 * ずれとして数える形になる (Worker / CI / client の三つ子が既に両方向へ
 * ずれた実績が冒頭に書いてある)。**同じ問い (「内部ホストへ到達させないか」)
 * に答える 2 つ目を書かず、1 つを両方から読める場所へ置く** —— それがここ。
 *
 * 中身は 1 字も変えていない (移動のみ)。`proxy.ts` は re-export するので
 * 既存の呼び出し側と検査 (`security/__tests__/proxy.test.ts` /
 * `network/__tests__/proxyWorkerParity.test.ts`) はそのまま動く。
 * 「proxy.ts の中に写しが残っていない」ことは
 * `shared/__tests__/privateTarget.test.ts` が原文で留める。
 *
 * 読む側は 2 つ:
 *   - `renderer/network/proxy.ts`  `fetchViaProxy` の送り先 (SSRF の関門)
 *   - `shared/imageUrlGate.ts`     `safeRemoteImageSrc` (第三者応答の <img src>)
 *
 * **`aiEndpoint` / `ollama` / `oauth` のループバック判定とは問いが違う**ので
 * 統合しない (`shared/__tests__/loopbackChecks.test.ts`)。あちらは
 * 「平文 http を許してよい**自分の**相手か」で、こちらは「**他人の**指定した
 * 送り先が内側を向いていないか」—— 向きが逆である
 * (`docs/ARCHITECTURE.md` §AI エンドポイントの注記がそう書いている)。
 */

/** Block targets that would let the proxy be weaponized as a SSRF
 *  oracle against the proxy operator's intranet / cloud metadata.
 *
 *  ⚠ LIMITATION — DNS rebinding:
 *  This check operates at the *hostname* level (before any DNS lookup).
 *  An attacker controlling `evil.example.com` can return a public IP
 *  (e.g. 8.8.8.8) on first resolve, then re-resolve to 127.0.0.1 / a
 *  RFC1918 address on a second lookup that happens inside the proxy.
 *  Defeating that requires the *proxy* to re-validate the resolved IP
 *  after `getaddrinfo()` and before its upstream `fetch()` call. The
 *  client-side check here is therefore a *best-effort first line of
 *  defense*; see docs/PROXY_EXAMPLE.md §3 for the proxy-side pattern.
 *
 *  Note: the proxy itself MUST validate too — this is defense-in-depth
 *  on the client side, primarily protecting users of a shared proxy
 *  from a malicious tab tricking the proxy into reaching internal IPs.
 *
 *  Blocked patterns:
 *   - loopback: 127.0.0.0/8, ::1, ::ffff:127.0.0.1, localhost
 *   - link-local + cloud metadata: 169.254.0.0/16 (AWS/GCP/Azure metadata)
 *   - RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   - ULA / link-local IPv6: fc00::/7, fe80::/10
 *   - mDNS / common internal TLDs (see INTERNAL_TLDS below) + .home.arpa
 *   - explicit metadata.* hostnames (GCE / Azure)
 *   - IPv6 ↔ IPv4 transition encodings (Round 3 BLOCKING coverage):
 *       · IPv4-mapped two-group:  ::ffff:HHHH:HHHH
 *       · IPv4-compatible (deprecated): ::HHHH:HHHH
 *           (URL normalizes `[::169.254.169.254]` → `[::a9fe:a9fe]`)
 *       · Single-hex-group mapped: ::ffff:HHHH (covers 0.0.0.x range)
 *       · NAT64 well-known prefix (RFC 6052): 64:ff9b::HHHH:HHHH (best-effort)
 *       · 6to4 (RFC 3056): 2002:HHHH:HHHH:: (best-effort)
 */
/** Single-label internal TLDs that should never be reached through the
 *  proxy. Covers mDNS (RFC 6762), common Microsoft AD defaults, IETF
 *  draft-private-use TLDs, and typical home-router zones. Compared
 *  against the *last DNS label only* so that a public name like
 *  `example.localcom.` (no dot before "local") is not flagged. */
/** loopback を指す名前。`ip6-*` は Debian / Ubuntu の `/etc/hosts` の既定の別名。 */
const LOOPBACK_NAMES: ReadonlySet<string> = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

const INTERNAL_TLDS: ReadonlySet<string> = new Set([
  'local',     // mDNS (RFC 6762)
  'internal',  // common internal zone
  'lan',       // common home / SMB
  'corp',      // Microsoft AD default
  'intranet',  // Microsoft AD default
  'home',      // common ISP CPE
  'private',   // IETF draft-private-use
]);

export function isPrivateOrReservedTarget(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  // Strip IPv6 brackets if any (URL.hostname returns bracketed form).
  // Stryker disable next-line LogicalOperator,StringLiteral: `URL.hostname` は IPv6 のとき
  // 必ず両端に括弧を付ける (片方だけは作れない) ため、`&&`↔`||` も空文字化も観測差が出ない。
  const bracketless = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  // Strip a single trailing dot (fully-qualified form). `URL` PRESERVES it for
  // named hosts — `new URL('http://localhost./').hostname === 'localhost.'` —
  // so without this every name-based rule below was bypassable by appending a
  // dot: `localhost.`, `metadata.google.internal.`, `printer.local.`,
  // `x.internal.` all resolve to the same targets as their dotless forms yet
  // failed the exact-equality and last-label checks (2026-07 security audit).
  // IP literals are unaffected — `URL` already normalizes `169.254.169.254.`
  // to `169.254.169.254` — but trimming is harmless for them.
  // 先頭のドットも同じ理由で落とす (2026-08 変異検査)。`URL` は
  // `http://.local/` を hostname `.local` のまま通す。末尾ドットと同様
  // **同じ相手を指す別表記**であり、しかも `..internal` は最終ラベル判定に
  // 当たって遮断されるのに `.internal` は素通りする、という非対称があった
  // (`lastIndexOf('.')` が 0 になり `lastDot > 0` を満たさないため)。
  // Stryker disable next-line Regex: 先頭側・末尾側それぞれを消す変異は、もう一方の
  // 置換が残るため「片側だけ剥がす」形になる。両方向を剥がすことは
  // proxy.test.ts の先頭ドット / 末尾ドット検査で別々に固定している。
  const bare = bracketless.replace(/^\.+/, '').replace(/\.+$/, '');

  // Loopback / common local hostnames.
  //
  // `*.localhost` も loopback である —— RFC 6761 §6.3 は `localhost.` 直下の
  // **すべての名前**を loopback として解決すべきと定めており、glibc の nss と
  // systemd-resolved、主要ブラウザはそのとおりに振る舞う。2026-09-12 に CI 側の
  // 関門 (`scripts/public-host-guard.cjs`) と名前の標本で突き合わせたところ、
  // **ここだけが `foo.localhost` を通していた** (完全一致しか見ていなかった)。
  // Worker 側は解決後の IP を見るので最終的には塞がれるが、この関数の注記が
  // 挙げている「loopback: … localhost」の網に穴が在る状態だった。
  if (LOOPBACK_NAMES.has(bare) || bare.endsWith('.localhost')) return true;

  // Explicit cloud-metadata hostnames.
  // Stryker disable next-line ConditionalExpression,StringLiteral: この名前は最終ラベルが
  // `internal` なので下の INTERNAL_TLDS 規則でも遮断される。明示は多重防御であり、
  // 外しても結果が変わらない (等価変異)。
  if (bare === 'metadata.google.internal') return true;
  if (bare.endsWith('.metadata.cloud.google.com')) return true;

  // Internal TLDs — 最終 DNS ラベルだけを見る。`example.localcom` のような
  // 公開名は (区切りが無いので) 当たらず、`printer.local` は当たる。
  //
  // ラベルが 1 つだけのホスト (`internal` / `local` 単体) も遮断する。
  // 以前は「裸の TLD は DNS で解決しないから」として通していたが、単一ラベルの
  // ホスト名は**検索ドメインの補完で解決する** (`internal` → `internal.corp.example`)。
  // 通す理由が成り立っていなかったので遮断側へ寄せた。公開 API を単一ラベル名で
  // 呼ぶことは無いので、過遮断の実害も無い。
  const lastDot = bare.lastIndexOf('.');
  // Stryker disable next-line ConditionalExpression,EqualityOperator: 先頭ドットを剥がした後の
  // `bare` は `.` で始まらないので lastDot が 0 になることはなく、`>= 0` と `> 0` は同値。
  // ドットが無い場合は三項の else 側で bare 全体をラベルとして扱う。
  const lastLabel = lastDot >= 0 ? bare.slice(lastDot + 1) : bare;
  if (INTERNAL_TLDS.has(lastLabel)) return true;
  // 2-label IETF reserved zone (RFC 8375): `*.home.arpa`.
  if (bare === 'home.arpa' || bare.endsWith('.home.arpa')) return true;

  // IPv4 literal check.
  //
  // Stryker disable next-line Regex
  // Anchor + character-class mutations on the regexes in this function and
  // the two helpers below are equivalent mutations: `URL.hostname.toLowerCase()`
  // returns the bare hostname (no surrounding whitespace, no prefix/suffix),
  // and only lowercase hex / decimal characters are possible by construction.
  // We Stryker-disable the regex bodies here and explicitly test for the
  // semantic outcomes (proxy.test.ts §"isPrivateOrReservedTarget") rather
  // than the regex shape.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (v4) {
    // オクテットの範囲検査は置かない — **到達しないため**。
    // この関数は `URL` を受け取り、`URL` はドット付き 4 組のうち 1 つでも
    // 255 を超えるとパース時に throw する (実測: `new URL('http://256.1.1.1/')`
    // → ERR_INVALID_URL)。先頭 0 も正規化される (`01.02.03.04` → `1.2.3.4`、
    // `0177.0.0.1` → `127.0.0.1`)。したがって上の正規表現に合致した時点で
    // 各オクテットは 0-255 の整数であることが保証されている。
    // 以前はここに `oct.some((n) => n < 0 || n > 255 || !Number.isInteger(n))`
    // があったが、どのテストでも到達せず変異体 10 個が測れないまま残っていた。
    // 「等価だから黙らせる」のではなく、到達しないコードなので消す。
    const [a, b] = v4.slice(1).map(Number) as [number, number, number, number];
    if (a === 127) return true;                         // 127.0.0.0/8 loopback
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 169 && b === 254) return true;            // 169.254/16 link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16/12
    if (a === 192 && b === 168) return true;            // 192.168/16
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64/10 CGNAT (RFC 6598)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark (RFC 2544)
    /*
     * **予約されているが「私的」ではない範囲** —— この関数の名は
     * `isPrivateOrReservedTarget` であり、既に CGNAT (100.64/10) や
     * ベンチマーク用 (198.18/15) のような**公開されていない予約**を
     * 遮断している。同じ意図が掛かっていなかった範囲を揃える
     * (2026-08-25 実測: 下の 5 つはどれも素通りしていた)。
     *
     * 公開経路には出ないので、ここへ向ける要求が届くのは
     * **その番号を内部で流用している網の中だけ**である。だからこそ、
     * 利用者の Worker を経由して外から触らせる先ではない。
     */
    const [, , c] = v4.slice(1).map(Number) as [number, number, number, number];
    // 192.0.0.0/24 IETF プロトコル割当 (RFC 6890)。DS-Lite の 192.0.0.0/29 を
    // 含み、CPE 上で**実際に応答する**ことがある。NAT64 の 192.0.0.170/171 も同じ枠。
    if (a === 192 && b === 0 && c === 0) return true;
    // 文書用 TEST-NET-1/2/3 (RFC 5737)。公開経路には出ない。
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    // 6to4 リレー anycast (RFC 3068)。RFC 7526 で廃止された番号で、
    // 生きているとすれば内部の流用である。
    if (a === 192 && b === 88 && c === 99) return true;
    if (a >= 224) return true;                          // multicast + reserved
    return false;
  }

  // IPv6 literal (without brackets here). Cover the common forms.
  // Stryker disable next-line ConditionalExpression,StringLiteral: コロンを含まないホストが
  // この分岐へ入っても、中の規則 (v6 表記) にはどれも当たらず末尾で false を返すため観測差が無い。
  if (bare.includes(':')) {
    // Stryker disable next-line ConditionalExpression,StringLiteral: 長形式は `URL` が短縮形へ
    // 正規化するため到達しない (前提は proxy.test.ts「IPv6 の長形式はパーサが短縮形へ正規化する」で固定)。
    // 末尾ドットの件でパーサの読み違いから穴が開いた経緯があるので、防御自体は消さずに残す。
    if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true; // loopback
    // Stryker disable next-line ConditionalExpression,StringLiteral: 同上 (長形式は正規化される)。
    if (bare === '::' || bare === '0:0:0:0:0:0:0:0') return true;  // unspecified
    // IPv4-mapped IPv6 (and IPv4-compatible / single-group variants) —
    // extract the embedded v4 and recurse through the v4 check. See
    // `extractMappedV4` below for the full enumeration of accepted forms
    // and Round-3 BLOCKING rationale.
    const embeddedV4 = extractMappedV4(bare);
    // extractMappedV4 は 16 進から 0-255 のオクテットしか組み立てないため
    // `new URL` は throw せず、この catch には到達しない。別のパーサから
    // 呼ばれた場合に備えた安全側の既定 (deny) として残す。
    /* Stryker disable BlockStatement,BooleanLiteral */
    if (embeddedV4 !== null) {
      try {
        return isPrivateOrReservedTarget(new URL(`http://${embeddedV4}/`));
      } catch {
        return true; // unparseable mapped form → safe default deny
      }
    }
    /* Stryker restore BlockStatement,BooleanLiteral */
    // NAT64 (RFC 6052 well-known prefix `64:ff9b::/96`) and 6to4 (RFC 3056
    // `2002::/16`) can also encode an IPv4 address in the trailing bits.
    // Full validation requires parsing the entire 128-bit address; we
    // implement a best-effort extraction for the most common case where
    // the v4 octets appear as the last two hex groups
    // (`64:ff9b::HHHH:HHHH` / `2002:HHHH:HHHH::`). Attackers using
    // arbitrary 6to4 encodings should still be caught by the proxy-side
    // DNS-resolved-IP check (docs/PROXY_EXAMPLE.md §3).
    const nat64Or6to4 = extractEmbeddedV4FromTransitionPrefix(bare);
    // 同上 (NAT64 / 6to4 側も同じ組み立てなので catch には到達しない)。
    /* Stryker disable BlockStatement,BooleanLiteral */
    if (nat64Or6to4 !== null) {
      try {
        return isPrivateOrReservedTarget(new URL(`http://${nat64Or6to4}/`));
      } catch {
        return true;
      }
    }
    /* Stryker restore BlockStatement,BooleanLiteral */
    // ULA fc00::/7 → first byte 0xfc or 0xfd.
    // Stryker disable next-line Regex
    if (/^f[cd][0-9a-f]{0,2}:/i.test(bare)) return true;
    // Link-local fe80::/10.
    // Stryker disable next-line Regex
    if (/^fe[89ab][0-9a-f]?:/i.test(bare)) return true;
    /*
     * 文書用 2001:db8::/32 (RFC 3849)。IPv4 側の TEST-NET と同じ理由で塞ぐ。
     * `2001:db8:...` と、第 2 群が 0 埋めされた `2001:0db8:...` の両方を見る
     * (`URL` は前者へ正規化するが、別のパーサから渡る場合に備える)。
     * **`2001:` で始まるだけでは当てない** —— 2001::/16 は正当な公開空間で、
     * `2001:4860::` (Google) などが居る。第 2 群まで見るのが要点である。
     */
    // Stryker disable next-line Regex
    if (/^2001:0*db8:/i.test(bare)) return true;
    /*
     * **site-local fec0::/10 と multicast ff00::/8。**
     *
     * この 2 つは利用者が配る Worker (docs/PROXY_EXAMPLE.md) 側には
     * 最初から在り、こちらだけ無かった —— 同じ判断を 2 か所に書いて
     * いたので、**両方向にずれていた** (2026-08-25 実測)。
     * fec0::/10 は RFC 3879 で廃止されたが実装が残っており、
     * ff00::/8 へ向ける要求に正当な用途は無い。
     * 綴りは上の fe80 と同じ流儀 (先頭群の上位ビットで見る)。
     */
    // Stryker disable next-line Regex
    if (/^fe[c-f][0-9a-f]?:/i.test(bare)) return true;
    // Stryker disable next-line Regex
    if (/^ff[0-9a-f]{0,2}:/i.test(bare)) return true;
    return false;
  }

  return false;
}

/** Extract an IPv4 dotted-quad from an IPv6 string that encodes a v4
 *  address in its low 32 bits. Returns null if `bare` doesn't match any
 *  recognised mapped form.
 *
 *  Forms accepted (Round 3 BLOCKING fixes):
 *   - `::ffff:HHHH:HHHH`  — canonical IPv4-mapped (RFC 4291 §2.5.5.2);
 *                           URL normalizes `::ffff:127.0.0.1` to this form.
 *   - `::HHHH:HHHH`       — deprecated IPv4-compatible (RFC 4291 §2.5.5.1);
 *                           URL normalizes `[::169.254.169.254]` to
 *                           `[::a9fe:a9fe]`, which the canonical regex above
 *                           does NOT match, leaving an AWS-IMDS bypass.
 *   - `::ffff:HHHH`       — single-group mapped (e.g. `::ffff:0` for 0.0.0.0,
 *                           `::ffff:1` for 0.0.0.1). URL keeps these as-is
 *                           rather than zero-padding, so a two-group regex
 *                           rejects them and a "this host" (RFC 1122) /
 *                           low-address bypass appears.
 *
 *  NOTE on the dotted-quad form (`::ffff:127.0.0.1`): URL.hostname ALWAYS
 *  re-encodes the embedded v4 to hex (`::ffff:7f00:1`) on construction in
 *  Node ≥ v18 and Chromium, so the dotted form is effectively unreachable
 *  via `new URL(...)`. We still accept it here as a belt-and-suspenders
 *  safeguard for callers that invoke `isPrivateOrReservedTarget` with a
 *  URL built from a non-Web source (e.g. a custom parser); the branch is
 *  intentionally defensive rather than load-bearing in normal flow.
 */
function extractMappedV4(bare: string): string | null {
  // Order matters: a unified regex with `(?:::ffff:|::)` would mis-match
  // `::ffff:0` as `::` + (`ffff`, `0`) = 255.255.0.0 instead of the
  // intended single-group form 0.0.0.0. We therefore try the more
  // specific (longer-prefix) shapes first.

  // (1) Canonical IPv4-mapped two-group: ::ffff:HHHH:HHHH
  //     URL normalizes `::ffff:127.0.0.1` to this form.
  // Stryker disable next-line Regex
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
  if (mapped) {
    const hi = parseInt(mapped[1]!, 16);
    const lo = parseInt(mapped[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // (2) Single hex group: ::ffff:HHHH → interpreted as 0.0.HH.HH (the
  //     high 16 bits are implicitly zero). Covers `::ffff:0` = 0.0.0.0
  //     and `::ffff:1` = 0.0.0.1, both of which RFC 1122 §3.2.1.3
  //     reserves as "this host on this network".
  // Stryker disable next-line Regex
  const single = /^::ffff:([0-9a-f]{1,4})$/i.exec(bare);
  // Stryker disable next-line ConditionalExpression,BlockStatement: この分岐を外すと下の 2 グループ用
  // 正規表現に当たるが、そちらは hi=0xffff から 255.255.x.x を返し a >= 224 で必ず遮断される。
  // 1 グループ側も a = 0 で必ず遮断されるため、遮断/通過の別が付かない (等価変異)。
  if (single) {
    const lo = parseInt(single[1]!, 16);
    // Stryker disable next-line StringLiteral: この分岐は上の注記のとおり、通っても
    // 通らなくても必ず遮断側に落ちるため、組み立てた文字列を変えても観測差が出ない。
    return `0.0.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // (3) Deprecated IPv4-compatible two-group: ::HHHH:HHHH (no `ffff`).
  //     This is the form URL.hostname normalizes `[::169.254.169.254]`
  //     to (`[::a9fe:a9fe]`), so it is the critical Round-3 BLOCKING-A
  //     gap. We intentionally exclude `::1`, `::0`, and `::HHHH` (single
  //     group) here — those are handled either by the explicit loopback
  //     equality check upstream or by being public single-group v6
  //     addresses (no v4 embedding possible in only 16 bits worth of
  //     low-order data).
  // Stryker disable next-line Regex
  const compat = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
  if (compat) {
    const hi = parseInt(compat[1]!, 16);
    const lo = parseInt(compat[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // (4) Dotted-quad mapped form. See JSDoc above for why this is
  //     defensive rather than load-bearing — Node v18+/Chromium always
  //     re-encode this to hex on URL construction.
  // Stryker disable next-line Regex
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(bare);
  // Stryker disable next-line ConditionalExpression,BlockStatement: Node v18+ / Chromium は
  // ドット付き mapped 形式を必ず 16 進へ再符号化するため (`[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`)、
  // `URL` 経由では到達しない。別のパーサから呼ばれた場合に備えた防御として残す。
  if (mappedDotted) {
    return mappedDotted[1]!;
  }
  return null;
}

/** Best-effort extraction of the embedded IPv4 from NAT64 (RFC 6052
 *  well-known prefix `64:ff9b::/96`) and 6to4 (RFC 3056 `2002::/16`)
 *  addresses. Returns the dotted-quad string or null if the input does
 *  not match the supported subset. See `isPrivateOrReservedTarget`
 *  caller for scope rationale. */
function extractEmbeddedV4FromTransitionPrefix(bare: string): string | null {
  // NAT64: `64:ff9b::HHHH:HHHH` (v4 in low 32 bits after `::`). The
  // canonical RFC 6052 form embeds the v4 as the final two hex groups.
  // Stryker disable next-line Regex
  const nat64 = /^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
  if (nat64) {
    const hi = parseInt(nat64[1]!, 16);
    const lo = parseInt(nat64[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // 6to4: `2002:HHHH:HHHH::...`. The v4 address sits in the 2nd-3rd
  // hex groups (16 bits each, big-endian). We only catch the common
  // `2002:HHHH:HHHH::` shape; longer forms with arbitrary subnet/iface
  // suffixes need the proxy-side resolved-IP check for full coverage.
  // Stryker disable next-line Regex
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})::?/i.exec(bare);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1]!, 16);
    const lo = parseInt(sixToFour[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}
