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
  return null;
}
