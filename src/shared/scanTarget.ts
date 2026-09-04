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

export type ScanUrlFailure = 'empty' | 'too-long' | 'not-a-url' | 'not-web';

export type ScanUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: ScanUrlFailure };

/** VirusTotal の URL 長の実務上の上限に合わせた保守的な値。 */
export const MAX_SCAN_URL_LENGTH = 2048;

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
  if (url.length > MAX_SCAN_URL_LENGTH) return { ok: false, reason: 'too-long' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'not-web' };
  }
  return { ok: true, url };
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
export function looksInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === '') return false;
  // IPv6 は URL の hostname では角括弧付きで来る。
  if (h.startsWith('[') && h.endsWith(']')) {
    const v6 = h.slice(1, -1);
    if (v6 === '::1' || v6 === '::') return true;
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
