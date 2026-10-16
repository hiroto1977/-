/**
 * VirusTotal へ送る URL の検証と、送る前に利用者へ伝えるべき危険の判定。
 *
 * **VirusTotal に URL を投入するのは「調べる」ではなく「公開する」に近い。**
 * 投入された URL は VT の有料利用者が検索できる。つまり、貼り付けた URL に
 * 署名付きリンク・招待リンク・セッション識別子・社内ホスト名が入っていれば、
 * それはこちらの手を離れて第三者の目に触れる。取り消せない。
 *
 * 画面にはその説明が無く、入力欄の例示が `https://example.com/suspicious` と
 * あるだけだった。`main/clients/security.ts` も `renderer/data/saasWriteWeb.ts`
 * も**任意の文字列をそのまま投入**していた (どちらも同じ書き方で、同じように
 * 検証が無かった)。
 *
 * ここは 1 か所だけ持つ。判定を両側に書き写すと片方だけ直る、というのが
 * この監査で繰り返し出た形なので。
 */

import { countChars } from './inputCeiling';
import { isPrivateOrReservedTarget } from './privateTarget';
export type ScanUrlFailure = 'empty' | 'too-long' | 'not-a-url' | 'not-web';

export type ScanUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: ScanUrlFailure };

/** VirusTotal の URL 長の実務上の上限に合わせた保守的な値。 */
/**
 * **断りの文面も 1 つ。** (2026-09-15 · パス 282)
 *
 * `validateScanUrl` の 4 つの理由に対する文面は、2026-09-15 まで
 * **ビルドごとに 1 つずつ**在った (`main/clients/security.ts` と
 * `renderer/data/saasWriteWeb.ts` に同じ 4 行)。今日は字も一致していたが、
 * **一致を留めている物が何も無かった** —— パス 167 / 250 / 252 / 269 / 273 が
 * それぞれ 1 件ずつ閉じてきた「字面がビルドごとに 1 つずつ」の家系である。
 *
 * ここは URL を第三者 (VirusTotal) へ渡す前の関門なので、断られた理由が
 * ビルドによって違う言い方になってはいけない —— 利用者は同じ入力を
 * 別の端末で試し、同じ説明を期待する。
 */
export const SCAN_URL_MESSAGES: Readonly<Record<ScanUrlFailure, string>> = {
  empty: 'url は必須です',
  'too-long': 'url が長すぎます',
  'not-a-url': 'url を URL として解釈できません',
  'not-web': 'url は http:// または https:// で始まる必要があります',
};

export const MAX_SCAN_URL_CHARS = 2048;

/**
 * **HIBP へ渡すメールアドレスを読む —— 1 か所だけ持つ** (2026-09-15 · パス 285)。
 *
 * この関数が在る前、同じ 2 行が main (`clients/security.ts`) とブラウザ版
 * (`data/saasWriteWeb.ts`) に 1 つずつ在った:
 *
 *     const email = typeof raw === 'string' ? raw.trim() : '';
 *     if (!email) throw new Error(…);   // main は英語・ブラウザ版は日本語
 *
 * ★ **この双子は 1 度ずれて、実害を出している。** main の元の注記が記録している ——
 * 2026-08-22 まで **main だけ `.trim()` を持っておらず**、貼り付けで空白が付いた
 * 住所をそのまま問い合わせると HIBP は 404 を返し、それを「どの漏洩にも
 * 含まれない」として表示していた。**誤った安心**を返す側のずれである。
 *
 * そのときの直しは `.trim()` を main へ**写した** —— つまり写しは 2 つのまま
 * 残り、同じずれがもう一度起きうる。しかも起きたときの症状は
 * 「漏洩しているのに安全と言う」で、この本が塞いできた中でも重い側である。
 * だから**文面ではなく述語ごと**ここへ寄せる。
 *
 * 天井は置かない —— 今日の両ビルドが空文字だけを断っているので、
 * ここで増やすと**振る舞いが変わる**。境界を動かすのは別の判断であり、
 * 文面と写しを畳む今回の仕事に混ぜない (パス 284 で site の文面へ
 * 手を伸ばして検査に止められたのと同じ種類の線引き)。
 */
export type BreachEmailFailure = 'empty';

export type BreachEmailResult =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly reason: BreachEmailFailure };

/** 断りの文面 —— **両ビルドがここを読む** (文を写さない)。 */
export const BREACH_EMAIL_MESSAGES: Readonly<Record<BreachEmailFailure, string>> = {
  empty: 'email は必須です',
};

export function validateBreachEmail(raw: unknown): BreachEmailResult {
  // 前後の空白を落とすのは**安全の判断に効く** (上の docblock の 2026-08-22)。
  const email = typeof raw === 'string' ? raw.trim() : '';
  if (!email) return { ok: false, reason: 'empty' };
  return { ok: true, email };
}


/**
 * 投入してよい形か検証する。
 *
 * `http` / `https` に絞るのは、VT が調べるのが web の URL だからというだけで
 * なく、`file:` や `javascript:` のような「送っても意味が無いのに手元の情報を
 * 明かすだけ」の文字列を投入させないため。
 */
export function validateScanUrl(raw: unknown): ScanUrlResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const url = raw.trim();
  if (url === '') return { ok: false, reason: 'empty' };
  if (countChars(url) > MAX_SCAN_URL_CHARS) return { ok: false, reason: 'too-long' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'not-web' };
  }
  // **返すのは解析後の href** (パス 325)。`url` (生の文字列) を返すと、調べた物
  // (`parsed`) と第三者へ送る物 (raw) が別になる —— 実測で 8 形のうち 5 形が食い違った
  // (`https:/\evil.example/p` / `HTTPS://Example.COM/X` / `https://example.com` /
  // `https://example.com/a b` / IDN)。隣の `normalizeProxyEndpoint` は最初から
  // `parsed.href` を返しており、**同じ形の関門 7 つのうちここだけが生を返していた**。
  return { ok: true, url: parsed.href };
}

/**
 * 資格情報らしき名前のパラメータ。
 *
 * クエリが付いているだけで警告すると、ほとんどの URL で出て読み飛ばされる。
 * 警告は出す回数を絞るほど効くので、**名前が資格情報を示唆するものだけ**に
 * 限る。
 */
export const SECRET_PARAM_NAMES = [
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'key',
  'api_key',
  'apikey',
  'secret',
  'password',
  'passwd',
  'pwd',
  'auth',
  'authorization',
  'session',
  'sessionid',
  'sig',
  'signature',
  'code',
  'credential',
];

function looksSecretName(name: string): boolean {
  const lower = name.toLowerCase();
  return SECRET_PARAM_NAMES.includes(lower);
}

/**
 * **公開されないと分かるホスト**か (社内・手元・リンクローカル)。
 *
 * このファイルの冒頭は、VirusTotal へ送ると第三者の目に触れるものとして
 * 「署名付きリンク・招待リンク・セッション識別子・**社内ホスト名**」の
 * 4 つを挙げている。ところが実装が見ていたのは前 3 つ (userinfo と、
 * 資格情報らしき名前のクエリ/フラグメント) **だけ**で、
 * **4 つ目だけが実装されていなかった** (2026-08-25 の実測で判明)。
 *
 * 社内ホスト名の投入は「調べる」ではなく**社内基盤の名前と経路を公開する**
 * ことになる。`https://jenkins.internal/job/deploy-prod` を送れば、
 * その CI の存在とジョブ名が VT の有料利用者に検索可能な形で残る。
 * `169.254.169.254/latest/meta-data/…` なら、クラウドの資格情報エンドポイントを
 * 触っていること自体が残る。**取り消せない。**
 *
 * ## ループバック判定を借りない理由
 *
 * `shared/__tests__/loopbackChecks.test.ts` が言うとおり、既存の 3 つは
 * **問いが違うので答えも違う**。ここはさらに別の問い ——
 * 「**送ると社内の情報が出るか**」であって「平文 http を許すか」でも
 * 「待受の Host を受けるか」でもない。だから private 範囲も予約 TLD も
 * 単一ラベルも含む、いちばん広い網になる。
 *
 * **広げても危険が増えないのはここだけ**である —— これは**警告**であって
 * 関門ではない (冒頭の「止めない」方針)。外したときの害は「余計な警告」で、
 * 許可の拡大ではない。だから統合してはいけない側ではなく、
 * 広く取ってよい側に居る。
 */
/**
 * IPv6 に埋め込まれた IPv4 を点記法で返す (無ければ null)。
 *
 * `new URL()` は `::ffff:169.254.169.254` を `::ffff:a9fe:a9fe` へ正規化する (実測) ので、
 * 点記法ではなく **16 進の 2 組**で来る。3 つの形を見る:
 *   - IPv4-mapped (`::ffff:…`) と NAT64 の既知接頭辞 (`64:ff9b::…`) —— 末尾 32 bit が v4
 *   - 6to4 (`2002:WWXX:YYZZ::/16`) —— 2002 の直後の 2 組が v4
 * どれも v4 を取り出して `looksInternalHostname` の v4 判定へ渡す (2026-10-13 · パス 513)。
 */
function embeddedIpv4FromV6(v6: string): string | null {
  const toV4 = (hiHex: string, loHex: string): string => {
    const hi = Number.parseInt(hiHex, 16);
    const lo = Number.parseInt(loHex, 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  };
  const mapped = /^(?:::ffff:|64:ff9b::)(.+)$/.exec(v6);
  if (mapped !== null) {
    const tail = mapped[1]!;
    const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(tail);
    if (dotted !== null) return `${dotted[1]}.${dotted[2]}.${dotted[3]}.${dotted[4]}`;
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
    if (hex !== null) return toV4(hex[1]!, hex[2]!);
    return null;
  }
  // 6to4: 2002::/16 の全域が v4 を bits 16-48 に埋め込む。
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(v6);
  if (sixToFour !== null) return toV4(sixToFour[1]!, sixToFour[2]!);
  return null;
}

export function looksInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === '') return false;
  // SSRF 用の分類器 (privateTarget) が内部と見る宛先は、ここでも内部と見る (パス 524 ·
  // T-076)。ここの手書きの判定は IPv4 互換 `::a.b.c.d`・SIIT・fec0::/10・ff00::/8・
  // 64:ff9b:1::/48・192.0.0.0/24・198.18.0.0/15・224.0.0.0/3 を知らず、メタデータ用
  // アドレスを `[::a9fe:a9fe]` と書くだけで「社内のホスト」の警告をすり抜けた。
  // 警告は広い方に倒してよい (止めない・余計な警告が出るだけ) ので OR で足す。
  // ただし文書用の範囲 (RFC 5737 の TEST-NET-1/2/3 と RFC 3849 の 2001:db8::/32) は警告しない ——
  // 説明用に貼られる偽の例で、利用者の社内情報ではない (既存の方針・検査が留めている)。
  const documentation =
    /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/.test(h) || /^\[2001:0?db8:/.test(h);
  try {
    if (!documentation && isPrivateOrReservedTarget(new URL(`http://${h}/`))) return true;
  } catch {
    // 解析できない名前は URL としても送れない (validateScanUrl が先に断る)。下の判定へ。
  }
  // IPv6 は URL の hostname では角括弧付きで来る。
  if (h.startsWith('[') && h.endsWith(']')) {
    const v6 = h.slice(1, -1);
    if (v6 === '::1' || v6 === '::') return true;
    // IPv4-mapped / NAT64 / 6to4 に埋め込まれた内部の v4 (クラウドのメタデータを含む)。
    const inner = embeddedIpv4FromV6(v6);
    if (inner !== null && looksInternalHostname(inner)) return true;
    // fc00::/7 (ULA) と fe80::/10 (リンクローカル)。
    return /^f[cd][0-9a-f]{0,2}:/.test(v6) || /^fe[89ab][0-9a-f]?:/.test(v6);
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4 !== null) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // リンクローカル (クラウドのメタデータを含む)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // 単一ラベル (`buildserver` など) は公開名になりえない。
  if (!h.includes('.')) return true;
  // 公開に解決されない TLD。RFC 2606 / 6762 / 8375 と、委任されない予約語。
  return /\.(local|internal|localhost|intranet|private|corp|lan|home|test|example|invalid|home\.arpa)$/.test(h);
}

/**
 * 送る前に伝えるべき危険を日本語で返す。無ければ null。
 *
 * **止めない。** 利用者が本当にその URL を調べたい場合はあるので、
 * 判断材料を先に出すところまでにする。送ってしまってからでは遅いので、
 * 画面では入力中に出す。
 */
export function describeScanUrlRisk(raw: string): string | null {
  const checked = validateScanUrl(raw);
  if (!checked.ok) return null;
  const parsed = new URL(checked.url);
  if (parsed.username !== '' || parsed.password !== '') {
    return 'この URL には利用者名/パスワードが埋め込まれています。VirusTotal に送るとそのまま第三者に見える形で残ります。';
  }
  const names: string[] = [];
  for (const [name] of parsed.searchParams) {
    if (looksSecretName(name)) names.push(name);
  }
  // フラグメントは `#access_token=...` の形 (OAuth の暗黙フロー) を拾う。
  // `URL.hash` は空文字か `#` 始まりのどちらかしか無いので、`slice(1)` だけで
  // 足りる (`''.slice(1)` も `''`)。`startsWith('#')` の分岐と空判定を置くと、
  // 到達しない枝と、空文字で回っても 0 周する空ループの判定が増えるだけで、
  // どちらもテストで殺せない変異体になる。
  for (const [name] of new URLSearchParams(parsed.hash.slice(1))) {
    if (looksSecretName(name)) names.push(name);
  }
  if (names.length > 0) {
    const unique = [...new Set(names)].join(' / ');
    return `この URL には資格情報らしき値 (${unique}) が含まれています。VirusTotal に送るとそのまま第三者に見える形で残ります。`;
  }
  // 冒頭が挙げている 4 つ目の危険。資格情報より後に見るのは、両方当たる URL で
  // 資格情報の警告のほうが差し迫っているため (既存の文言も変えない)。
  if (looksInternalHostname(parsed.hostname)) {
    return `この URL の宛先 (${parsed.hostname}) は社内・手元のホストです。VirusTotal に送ると、そのホスト名と経路が第三者に検索できる形で残ります。調べたい相手が外部のサイトか確認してください。`;
  }
  return null;
}
