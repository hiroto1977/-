/**
 * **`redactSecrets` の出力を、全文で値ごと固定する** (2026-09-30 · パス 502)。
 *
 * `redactionCoverage.test.ts` / `types.test.ts` は「秘密が出力に**含まれない**」を
 * `not.toContain` で見る。それは**伏せ漏れ**を捕まえるが、次の 2 つは見えない:
 *
 *   - 伏せる範囲が**短くなって尻尾が残る**形 (本体の量指定子を外す変異)。尻尾が
 *     出力に残っても、先頭の一致した所だけを見れば `not.toContain(秘密全体)` は通る。
 *   - 置き換えの文字列 (`sntrys_[REDACTED]` ほか) が**空になる**形。秘密は消えるので
 *     `not.toContain` は通るが、何の鍵だったかが読めなくなる (原因究明に要る手がかり)。
 *
 * 変異検査は全掃引 #179 で、この 2 つを **27 件**生き残らせた (`redact.ts` の
 * L186 / L187 / L252 / L255 / L261 / L264 / L266 / L268 / L378)。ここは**入力 → 出力の全文**を
 * 表で並べて閉じる。**期待値は原文の正規表現から組まず、手で書いた文字列**にする
 * (原文と同じ式で組むと、原文が変わったとき両辺が一緒に動いて素通りする)。
 *
 * 表には「伏せる標本」と「伏せてはいけない標本」の**両方**を置く ——
 * 伏せてはいけない側がなければ、規則を広げる変異 (`[_-]?` → `[^_-]?`) は殺せない。
 */
import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../redact';

/** n 個の同じ字。 */
const rep = (ch: string, n: number): string => ch.repeat(n);

const HEX64 = '0123456789abcdef'.repeat(4);

/**
 * Asana の PAT の形 (`1/<gid>:<32 桁の 16 進>`) は、**ソースに連続した 1 つの文字列として置かない**。
 * GitHub の push 保護は標本を本物の PAT と見分けずに止める (2026-10-01 · パス 502 で push が実際に断られた)。
 * 実行時に組み立てれば、検査が当てる文字列は同じで、ソースには秘密の形が連続して現れない。
 */
const ASANA_GID = '1201234567890123';
const ASANA_SECRET = '0123456789abcdef'.repeat(2);

describe('redactSecrets — プラットフォームの「不正なヘッダ値」文面 (出力全文)', () => {
  it.each([
    ['方式の無い値は、値だけを伏せて引用符は残す', `Headers.append: "${HEX64}" is an invalid header value.`, 'Headers.append: "[REDACTED]" is an invalid header value.'],
    ['別の入口 (Request constructor) の同じ句も同じに伏せる', `Request constructor: "${HEX64}" is an invalid header value.`, 'Request constructor: "[REDACTED]" is an invalid header value.'],
    ['句の前の空白が 2 個でも伏せる (1 個を要求しない)', `Headers.append: "${HEX64}"  is an invalid header value.`, 'Headers.append: "[REDACTED]"  is an invalid header value.'],
    ['句の前がタブでも伏せる', `Headers.append: "${HEX64}"\tis an invalid header value.`, 'Headers.append: "[REDACTED]"\tis an invalid header value.'],
    ['句の前が改行でも伏せる', `Headers.append: "${HEX64}"\nis an invalid header value.`, 'Headers.append: "[REDACTED]"\nis an invalid header value.'],
    ['値が 16 字ちょうどなら伏せる (境目)', `"${rep('a', 16)}" is an invalid header value`, '"[REDACTED]" is an invalid header value'],
  ])('★ 伏せる: %s', (_label, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it.each([
    ['値が 15 字なら伏せない (短い引用まで巻き込まない)', `"${rep('a', 15)}" is an invalid header value`],
    ['ヘッダ名が不正な場合の双子は伏せない (引用は名前で秘密ではない)', 'Headers.append: "x-very-long-header-name-123" is an invalid header name.'],
    ['句が続かない長い引用は伏せない', `"${rep('z', 64)}" is not a valid collection name`],
  ])('★ 伏せない: %s', (_label, text) => {
    expect(redactSecrets(text)).toBe(text);
  });

  it('★ 方式つきで値が改行をまたぐとき、方式は残して値を伏せる (折り返して貼った鍵)', () => {
    const wrapped = `Headers.append: "Bearer ${rep('a', 20)}\n${rep('b', 20)}" is an invalid header value.`;
    expect(redactSecrets(wrapped)).toBe('Headers.append: "Bearer [REDACTED]" is an invalid header value.');
  });
});

describe('redactSecrets — 発行元が分かる接頭辞 (区切り記号を含む形・出力全文)', () => {
  // [ラベル, 入力, 期待する出力]。期待は手で書く。
  it.each([
    [
      'Sentry (sntrys_・base64 なので = + / . を含みうる)',
      'Sentry DSN token sntrys_AbCd+EfGh/IjKl=MnOp.QrSt-uvWx_Yz01 rejected',
      'Sentry DSN token sntrys_[REDACTED] rejected',
    ],
    [
      'Dropbox の短命トークン (sl.)',
      'Dropbox sl.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc failed',
      'Dropbox sl.[REDACTED] failed',
    ],
    [
      'JWT (Microsoft 365 / Salesforce のアクセストークン・ドット 2 つ)',
      'access denied for eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLXZhbHVl (expired)',
      'access denied for eyJ[REDACTED] (expired)',
    ],
    [
      'Google の更新トークン (1//)',
      'refresh failed: 1//0gAbCdEfGhIjKlMnOpQrStUvWxYz-_01234 (revoked)',
      'refresh failed: 1//[REDACTED] (revoked)',
    ],
    [
      'Asana の PAT (1/<gid>:<32 桁の 16 進>)',
      `Asana PAT 1/${ASANA_GID}:${ASANA_SECRET} invalid`,
      'Asana PAT 1/[REDACTED] invalid',
    ],
    [
      'Salesforce のセッション ID (00D…!…)',
      'Salesforce session 00D5j000000AbCdEF!AQEAQ.abcdefghijklmnopqrstu=_-x expired',
      'Salesforce session 00D[REDACTED] expired',
    ],
  ])('★ 伏せる (全文): %s', (_label, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  // 本体の長さの境目。`{n,}` を外す変異も、`[^…]` へ反転する変異も、ここで 1 文字の差として出る。
  it.each([
    ['sntrys_ は本体 16 字から', `x sntrys_${rep('a', 15)} y`, `x sntrys_${rep('a', 15)} y`, `x sntrys_${rep('a', 16)} y`, 'x sntrys_[REDACTED] y'],
    ['sl. は本体 20 字から', `x sl.${rep('a', 19)} y`, `x sl.${rep('a', 19)} y`, `x sl.${rep('a', 20)} y`, 'x sl.[REDACTED] y'],
    ['1// は本体 20 字から', `x 1//${rep('a', 19)} y`, `x 1//${rep('a', 19)} y`, `x 1//${rep('a', 20)} y`, 'x 1//[REDACTED] y'],
    [
      'Asana は gid が 10 桁から',
      `x 1/${rep('1', 9)}:${rep('a', 32)} y`,
      `x 1/${rep('1', 9)}:${rep('a', 32)} y`,
      `x 1/${rep('1', 10)}:${rep('a', 32)} y`,
      'x 1/[REDACTED] y',
    ],
    [
      'Asana は 16 進がちょうど 32 桁 (31 桁でも 33 桁でも伏せない)',
      `x 1/${rep('1', 10)}:${rep('a', 31)} y`,
      `x 1/${rep('1', 10)}:${rep('a', 31)} y`,
      `x 1/${rep('1', 10)}:${rep('a', 32)} y`,
      'x 1/[REDACTED] y',
    ],
    [
      'Salesforce は組織 ID の後ろが 12 字から',
      `x 00D${rep('A', 11)}!${rep('b', 20)} y`,
      `x 00D${rep('A', 11)}!${rep('b', 20)} y`,
      `x 00D${rep('A', 12)}!${rep('b', 20)} y`,
      'x 00D[REDACTED] y',
    ],
    [
      'Salesforce は組織 ID の後ろが 15 字まで',
      `x 00D${rep('A', 16)}!${rep('b', 20)} y`,
      `x 00D${rep('A', 16)}!${rep('b', 20)} y`,
      `x 00D${rep('A', 15)}!${rep('b', 20)} y`,
      'x 00D[REDACTED] y',
    ],
    [
      'Salesforce はセッション本体が 20 字から',
      `x 00D${rep('A', 14)}!${rep('b', 19)} y`,
      `x 00D${rep('A', 14)}!${rep('b', 19)} y`,
      `x 00D${rep('A', 14)}!${rep('b', 20)} y`,
      'x 00D[REDACTED] y',
    ],
  ])('★ 境目: %s', (_label, justBelow, belowExpected, atLeast, atLeastExpected) => {
    expect(redactSecrets(justBelow)).toBe(belowExpected);
    expect(redactSecrets(atLeast)).toBe(atLeastExpected);
  });

  it('★ Asana の 16 進が 33 桁のとき、語の境目が合わないので伏せない (先頭 32 桁だけを切らない)', () => {
    const text = `x 1/${rep('1', 10)}:${rep('a', 33)} y`;
    expect(redactSecrets(text)).toBe(text);
  });

  it.each([
    ['JWT は第 1 区画が 8 字から', `x eyJ${rep('a', 7)}.${rep('b', 8)}.${rep('c', 8)} y`, `x eyJ${rep('a', 8)}.${rep('b', 8)}.${rep('c', 8)} y`],
    ['JWT は第 2 区画が 8 字から', `x eyJ${rep('a', 8)}.${rep('b', 7)}.${rep('c', 8)} y`, `x eyJ${rep('a', 8)}.${rep('b', 8)}.${rep('c', 8)} y`],
    ['JWT は第 3 区画が 8 字から', `x eyJ${rep('a', 8)}.${rep('b', 8)}.${rep('c', 7)} y`, `x eyJ${rep('a', 8)}.${rep('b', 8)}.${rep('c', 8)} y`],
  ])('★ 境目: %s', (_label, below, atLeast) => {
    expect(redactSecrets(below)).toBe(below);
    expect(redactSecrets(atLeast)).toBe('x eyJ[REDACTED] y');
  });

  it('★ JWT は第 3 区画の尻尾まで伏せる (途中で止めて後半を残さない)', () => {
    expect(redactSecrets(`x eyJ${rep('a', 8)}.${rep('b', 8)}.${rep('c', 40)} y`)).toBe('x eyJ[REDACTED] y');
  });

  it('★ JWT はドットを持たない塊 (難読化した JSON) は伏せない', () => {
    const text = `x eyJ${rep('a', 40)} y`;
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('redactSecrets — `name=value` の対 (出力全文・パス 271 / 289 の規則)', () => {
  const V = 'abcdefgh'; // 値の下限 (8 字) ちょうど

  /** 規則の名前の選択肢。区切りは `_` `-` 無しの 3 通りを全部持つ。 */
  const NAMES = [
    'api_key', 'api-key', 'apikey',
    'access_token', 'access-token', 'accesstoken',
    'refresh_token', 'refresh-token', 'refreshtoken',
    'client_secret', 'client-secret', 'clientsecret',
    'code_verifier', 'code-verifier', 'codeverifier',
    'token', 'secret', 'password', 'auth', 'key',
  ] as const;

  it.each(NAMES)('★ ?%s= は値だけを伏せ、名前と区切りは書き戻す', (name) => {
    expect(redactSecrets(`?${name}=${V}`)).toBe(`?${name}=[REDACTED]`);
  });

  it.each(NAMES)('★ 大文字小文字を問わない: ?%s=', (name) => {
    const upper = name.toUpperCase();
    expect(redactSecrets(`?${upper}=${V}`)).toBe(`?${upper}=[REDACTED]`);
  });

  it.each([
    ['接頭辞が 1 語 (ハイフン)', '?hibp-api-key=', '?hibp-api-key='],
    ['接頭辞が 1 語 (アンダースコア)', '&my_secret=', '&my_secret='],
    ['接頭辞が数字を含む', '?x2-token=', '?x2-token='],
    ['接頭辞が 1 字', '&x-api-key=', '&x-api-key='],
  ])('★ 仕入れ先の接頭辞つきでも伏せる: %s', (_label, lead, expectedLead) => {
    expect(redactSecrets(`${lead}${V}`)).toBe(`${expectedLead}[REDACTED]`);
  });

  // 名前の語のあいだに **区切り以外の字** が入る形は、別の語であって秘密の名前ではない。
  // 規則を広げる変異 (`[_-]?` → `[^_-]?`) はここで伏せ過ぎとして出る。
  it.each([
    'api.key', 'access.token', 'refresh.token', 'client.secret', 'code.verifier',
    'apiXkey', 'accessXtoken', 'refreshXtoken', 'clientXsecret', 'codeXverifier',
    'api__key', 'access--token',
  ])('★ 区切りが `_` `-` でない語は伏せない: %s=', (name) => {
    const text = `${name}=${V}`;
    expect(redactSecrets(text)).toBe(text);
  });

  it.each([
    ['値が 7 字なら伏せない (id を巻き込まない)', `?key=${rep('a', 7)}`, `?key=${rep('a', 7)}`],
    ['値が 8 字なら伏せる', `?key=${rep('a', 8)}`, '?key=[REDACTED]'],
    ['値の中の . - _ / + = は値に含める', '?key=ab.cd-ef_gh/ij+kl=mn', '?key=[REDACTED]'],
  ])('★ 値の長さと構成: %s', (_label, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it.each(['&', ' ', '\t', '\n', '"', "'", '`', '#', '<', '>'])(
    '★ 値は %j で止まる (その先は書き戻す)',
    (terminator) => {
      expect(redactSecrets(`?key=${V}${terminator}tail`)).toBe(`?key=[REDACTED]${terminator}tail`);
    },
  );

  it.each([
    ['文字列の先頭 (form 本文の 1 つ目)', `client_secret=${V}`, 'client_secret=[REDACTED]'],
    ['? のあと', `x?client_secret=${V}`, 'x?client_secret=[REDACTED]'],
    ['& のあと', `x&client_secret=${V}`, 'x&client_secret=[REDACTED]'],
    ['改行のあと (本文をログの体裁で載せた形)', `body:\nclient_secret=${V}`, 'body:\nclient_secret=[REDACTED]'],
  ])('★ 対が始まる境目: %s', (_label, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it.each([
    ['空白のあと', `see key=${V}`],
    ['コロンのあと', `x:key=${V}`],
    ['カンマのあと', `x,key=${V}`],
    ['セミコロンのあと', `x;key=${V}`],
    ['語の途中 (monkey)', `?monkey=${V}`],
  ])('★ 対の始まりでない所は伏せない: %s', (_label, text) => {
    expect(redactSecrets(text)).toBe(text);
  });

  it('★ 対が複数在れば、それぞれ値だけを伏せて他の引数は残す', () => {
    expect(redactSecrets('?id=1&key=abcdefgh&token=ijklmnop&next=2')).toBe('?id=1&key=[REDACTED]&token=[REDACTED]&next=2');
  });
});

/**
 * 入れ子の JSON (引用符が `\"` になった形) の規則と、パス 525 の接頭辞つき鍵の規則を、出力全文で固定する
 * (2026-10-16 · パス 526 · threat: T-101)。変異検査が 1 度目に 9 件を生き残らせた —— 名前の接頭辞の量指定子・
 * 名前と値のあいだの空白・値の中の空白・`api-?key` の `-?`・書き戻す名前と区切りの字面・`shared-?secret` の `-?`・
 * 置き換えの `$1`。どれも「秘密が消える」ことだけを見る `not.toContain` では殺せない。
 * **期待値は手で書いた文字列**にする (原文の式から組まない)。
 */
describe('redactSecrets — 入れ子の JSON の引用符つきヘッダ (出力全文 · threat: T-101)', () => {
  const Q = '\\"';
  const wrap = (inner: string): string => `{${inner}}`;
  it.each([
    ['方式つきの値は方式を残して伏せる', wrap(`${Q}authorization${Q}:${Q}Bearer abcdefghijkl${Q}`), wrap(`${Q}authorization${Q}:${Q}Bearer [REDACTED]${Q}`)],
    ['名前の接頭辞が 2 語でも伏せる (1 語に限らない)', wrap(`${Q}x-goog-api-key${Q}:${Q}Bearer secret${Q}`), wrap(`${Q}x-goog-api-key${Q}:${Q}Bearer [REDACTED]${Q}`)],
    ['名前の接頭辞が 0 語でも伏せる (要求しない)', wrap(`${Q}apikey${Q}:${Q}secretvalue${Q}`), wrap(`${Q}apikey${Q}:${Q}[REDACTED]${Q}`)],
    ['ハイフンつきの綴り (api-key) も伏せる', wrap(`${Q}api-key${Q}:${Q}secretvalue${Q}`), wrap(`${Q}api-key${Q}:${Q}[REDACTED]${Q}`)],
    ['コロンの前に空白があっても伏せる', wrap(`${Q}api-key${Q} : ${Q}secretvalue${Q}`), wrap(`${Q}api-key${Q} : ${Q}[REDACTED]${Q}`)],
    ['コロンの後ろに空白があっても伏せる', wrap(`${Q}api-key${Q}: ${Q}secretvalue${Q}`), wrap(`${Q}api-key${Q}: ${Q}[REDACTED]${Q}`)],
    ['値の中に空白があっても丸ごと伏せる', wrap(`${Q}api-key${Q}:${Q}secret value here${Q}`), wrap(`${Q}api-key${Q}:${Q}[REDACTED]${Q}`)],
  ])('%s', (_label, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });
});

describe('redactSecrets — 線上の `名前: 値` と接頭辞つきの鍵 (出力全文 · threat: T-101 / T-095)', () => {
  it('shared-secret の `-` は無くてもよい (sharedsecret: も伏せる)', () => {
    expect(redactSecrets('sharedsecret: topsecretvalue')).toBe('sharedsecret: [REDACTED]');
    expect(redactSecrets('shared-secret: topsecretvalue')).toBe('shared-secret: [REDACTED]');
  });
  it('接頭辞つきの鍵は、接頭辞を残して本体だけを伏せる ($1 を保つ)', () => {
    expect(redactSecrets(`token xai-${'a'.repeat(30)} end`)).toBe('token xai-[REDACTED] end');
    expect(redactSecrets(`k=gsk_${'B'.repeat(30)}`)).toBe('k=gsk_[REDACTED]');
  });
});

/**
 * **伏字の精度 —— 漏れる側と伏せすぎる側を同じ表で留める** (2026-10-28 · threat: T-212)。
 *
 * 実測 (直す前・実物の `redactSecrets` に 28 形): 発行元の分かる接頭辞を持たない鍵が
 * `cookie:` / `set-cookie:` / `client_secret:` の線上・`"private_key"` / `"secret_key"` / `"api_token"` ほかの
 * JSON の鍵・URL の userinfo・2 段の接頭辞を持つ環境変数 (`CSC_KEY_PASSWORD=`) に載ると **15 形が素通り**した。
 * 逆に裸の `Basic ` の規則は本体を `[^\s"'…]{16,}` で取っていたので日本語を飲み、出荷コードの文字列リテラル
 * 95,637 本のうち学術コーパスの散文 2 本 (「（Basic Books、1977年）…」) を伏せていた。
 * 漏れを塞ぐだけだと伏せすぎが増えるので、**伏せてはいけない側**も同じ表に置く。
 */
describe('redactSecrets — 精度: 名前の手がかりだけを持つ秘密と、伏せてはいけない散文 (出力全文 · threat: T-212)', () => {
  const V = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
  it.each([
    ['cookie: は行の残りを丸ごと伏せる (2 つ目以降の対も残さない)', `cookie: session=${V}; other=${V}`, 'cookie: [REDACTED]'],
    ['Set-Cookie: も同じ (大文字小文字を問わない)', `Set-Cookie: sid=${V}; Path=/; HttpOnly`, 'Set-Cookie: [REDACTED]'],
    ['"cookie" の JSON の鍵', `{"cookie":"sid=${V}"}`, '{"cookie":"[REDACTED]"}'],
    ['"private_key" の JSON の鍵', `{"private_key":"${V}"}`, '{"private_key":"[REDACTED]"}'],
    ['"secret_key" の JSON の鍵', `{"secret_key":"${V}"}`, '{"secret_key":"[REDACTED]"}'],
    ['"signing_secret" の JSON の鍵', `{"signing_secret":"${V}"}`, '{"signing_secret":"[REDACTED]"}'],
    ['"api_token" / "session_token" / "bearer_token" の JSON の鍵', `{"api_token":"${V}","session_token":"${V}","bearer_token":"${V}"}`, '{"api_token":"[REDACTED]","session_token":"[REDACTED]","bearer_token":"[REDACTED]"}'],
    ['"passwd" の JSON の鍵', `{"passwd":"${V}"}`, '{"passwd":"[REDACTED]"}'],
    ['camelCase の鍵 (clientSecret / accessToken) は区切りが無くても伏せる', `{"clientSecret":"${V}","accessToken":"${V}"}`, '{"clientSecret":"[REDACTED]","accessToken":"[REDACTED]"}'],
    ['client_secret: の線上の形', `client_secret: ${V}`, 'client_secret: [REDACTED]'],
    ['private_key: / secret_key: の線上の形', `private_key: ${V} secret_key: ${V}`, 'private_key: [REDACTED] secret_key: [REDACTED]'],
    ['accessToken: の線上の形', `accessToken: ${V}`, 'accessToken: [REDACTED]'],
    ['URL の userinfo はパスワードだけ伏せ、利用者名と host は残す', `fetch failed: https://user:${V}@api.example.com/x`, 'fetch failed: https://user:[REDACTED]@api.example.com/x'],
    ['接頭辞が 2 段の環境変数 (CSC_KEY_PASSWORD=) も伏せる', `CSC_KEY_PASSWORD=${V}`, 'CSC_KEY_PASSWORD=[REDACTED]'],
    ['接頭辞が 3 段でも伏せる', `APPLE_APP_SPECIFIC_PASSWORD=${V}`, 'APPLE_APP_SPECIFIC_PASSWORD=[REDACTED]'],
    ['裸の Basic は ASCII の本体を伏せる (狭めても漏れは増えない)', `Basic ${V}`, 'Basic [REDACTED]'],
    ['裸の Bearer は JWT の形 (ドット入り) も丸ごと伏せる', `Bearer abc.def.${V}`, 'Bearer [REDACTED]'],
  ])('★ %s', (_label, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it.each([
    ['"token_type":"Bearer" (方式の名前は秘密ではない)', '{"token_type":"Bearer","expires_in":"3600"}'],
    ['Jira の課題キー "key":"PROJ-123" (資格情報ではない)', '{"key":"PROJ-123","id":"10001"}'],
    ['学術コーパスの散文「（Basic Books、1977年）」(直す前は伏せていた)', '『Men and Women of the Corporation』（Basic Books、1977年）で提唱した'],
    ['英文の説明 "Invalid token: expired" (値ではなく説明)', 'Invalid token: expired at 2026-01-01'],
    ['userinfo の無い URL', 'https://api.example.com/x?a=b'],
    ['メールアドレスの @ は userinfo ではない', 'contact: foo@example.com'],
    ['"cookie_consent":"accepted" (鍵の尻尾が cookie でない)', '{"cookie_consent":"accepted"}'],
    ['"tokenizer":"gpt2" (鍵の尻尾が token でない)', '{"tokenizer":"gpt2"}'],
  ])('★ 伏せない: %s', (_label, input) => {
    expect(redactSecrets(input)).toBe(input);
  });
});

/**
 * **出荷する散文 (確証つき知識コーパス) は、伏字に通しても 1 字も変わらない。**
 * 規則を広げるたびにここが過剰伏字の母集団になる (実測 2026-10-28: 直す前は 2 本が変わっていた)。
 * 文字列リテラルの数に床を置き、走査が死んで「0 本変わった」にならないようにする。
 */
describe('redactSecrets — 過剰伏字の母集団: 知識コーパスの文字列リテラル (threat: T-212)', () => {
  it('★ renderer/data/*Knowledge.ts の文字列リテラルは伏字で 1 本も変わらない', async () => {
    const { readOriginalSource } = await import('./originalSource');
    const { readdirSync } = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../../renderer/data');
    const files = readdirSync(dir).filter((f) => /Knowledge\.ts$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(5);
    const changed: string[] = [];
    let literals = 0;
    for (const f of files) {
      const text = readOriginalSource(path.join(dir, f));
      const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const s = m[1] ?? m[2] ?? '';
        if (s.length < 8) continue;
        literals += 1;
        if (redactSecrets(s) !== s) changed.push(`${f}: ${s.slice(0, 80)}`);
      }
    }
    expect(literals).toBeGreaterThanOrEqual(20_000);
    expect(changed).toEqual([]);
  });
});
