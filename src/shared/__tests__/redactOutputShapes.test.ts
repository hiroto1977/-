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
