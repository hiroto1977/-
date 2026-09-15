import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readOriginalDir, readOriginalSource } from './originalSource';
import { redactSecrets } from '../redact';
import { SERVICE_CREDENTIAL_USE, collectsCredential } from '../credentialUse';
import type { ServiceId } from '../serviceId';

// scripts/scan-credential-headers.cjs は CJS (Node 走査スクリプト) 設計のため、
// テストだけが createRequire で読み込む (inline-html.cjs と同じ扱い)。
const req = createRequire(import.meta.url);
const { credentialHeaderNames, scanSources, sourceFiles, selfTest } = req(
  '../../../scripts/scan-credential-headers.cjs',
) as {
  credentialHeaderNames: (files?: { rel: string; text: string }[]) => string[];
  scanSources: (files: { rel: string; text: string }[]) => { name: string; rel: string; line: number }[];
  sourceFiles: () => { rel: string; text: string }[];
  selfTest: () => number;
};

/**
 * 「伏せる側の列挙」ではなく「**送っている側**」から数える。
 *
 * `redact.ts` はヘッダ名の列挙で秘密を見つける。列挙は守りの中心にあるが、
 * 新しいヘッダを足す側には何の強制も無い。実測 (2026-08-23) で 6 種のうち
 * **3 種が抜けていた**: `x-apikey` (VirusTotal) と `x-proxy-auth`
 * (BYO プロキシの共有秘密) はどの形でも漏れ、`hibp-api-key` は JSON の形だけ
 * 漏れていた。本文を返してくるのは相手のサーバと**利用者が用意したプロキシ**
 * なので、`x-proxy-auth` はその応答経由で画面と不具合報告に出る。
 *
 * 正規表現の字面を比べない。**実物の `redactSecrets` を呼んで**、秘密が
 * 消えることだけを見る。字面を比べると、比べているのは自分の写しになる。
 */
const SECRET = 'Zk9dQ2vX7pL4mN1sT8rW6yB3hJ0uA5cE';

/** repo の根 (この検査は `src/shared/__tests__/` に在る)。 */
const REPO = resolve(__dirname, '../../..');

/** 行コメントを落とす —— 注記の中の `?key=${…}` を走査が掴まないため。 */
function stripLineComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/** 失敗応答が資格情報ヘッダを映して返すときの、実際に見かける 3 つの形。 */
function renderings(name: string): { form: string; body: string }[] {
  return [
    { form: 'HTTP の線上', body: `401 Unauthorized\n${name}: ${SECRET}\n` },
    { form: 'JSON (プロキシがヘッダを映す)', body: `{"error":"denied","headers":{"${name}":"${SECRET}"}}` },
    { form: 'JSON・名前が大文字', body: `{"headers":{"${name.toUpperCase()}":"${SECRET}"}}` },
  ];
}

const HEADERS = credentialHeaderNames();

describe('伏字の網 — 送っているヘッダ名を、送っている側から数える', () => {
  it('走査が的を外していない (実物から複数種を拾えている)', () => {
    // ここが 0 になると、下の it.each が 1 件も回らず「常に緑」になる。
    expect(HEADERS.length).toBeGreaterThanOrEqual(4);
    expect(HEADERS).toContain('authorization');
  });

  it.each(HEADERS)('%s を載せた本文はどの形でも伏せられる', (name) => {
    for (const { form, body } of renderings(name)) {
      expect(redactSecrets(body), `${name} / ${form}`).not.toContain(SECRET);
    }
  });

  it('走査は実在するファイルと行を指す (台帳が腐っていない)', () => {
    const sites = scanSources(sourceFiles());
    expect(sites.length).toBeGreaterThanOrEqual(HEADERS.length);
    for (const s of sites) {
      expect(s.rel.startsWith('src/'), s.rel).toBe(true);
      expect(s.line).toBeGreaterThan(0);
    }
  });

  // 対照実験 — この検査が本当に鳴るか。伏字が知らない名前を「送っている」形で
  // 合成し、走査がそれを拾い、かつ伏字が取り逃すことを両方確かめる。
  it('伏字が知らないヘッダを足したら鳴る (対照)', () => {
    const fake = [{ rel: 'src/fake.ts', text: "headers: { 'x-unknown-credential-header': ctx.token }" }];
    const found = credentialHeaderNames(fake);
    expect(found).toEqual(['x-unknown-credential-header']);
    // 走査は拾う。しかし伏字は知らないので秘密が残る = この検査は落ちる。
    const leaked = renderings(found[0] as string).filter(({ body }) => redactSecrets(body).includes(SECRET));
    expect(leaked.length).toBeGreaterThan(0);
  });

  // 逆向きの対照 — 規則が広すぎると「何でも伏せる」ので検査が常に緑になる。
  it('資格情報でないヘッダまで伏せていない (過剰の対照)', () => {
    for (const body of [
      '{"headers":{"content-type":"application/json"}}',
      '{"headers":{"x-github-api-version":"2022-11-28"}}',
      '{"headers":{"idempotency-key":"abc123"}}',
      '{"author":"Alice"}',
      '{"authorization_endpoint":"https://example.com/oauth/authorize"}',
      '{"error_description":"Basic authentication failed"}',
    ]) {
      expect(redactSecrets(body), body).toBe(body);
    }
  });
});

/**
 * 本文に現れる JSON の項目名。ヘッダと違って「送っている側」を機械で数える形が
 * 無い (本文は相手が組む) ので、**このアプリが実際に扱う名前**を並べて留める。
 * `client_secret` は `src/main/oauth.ts` がトークン交換の本文に載せている。
 */
describe('伏字の網 — 本文の項目名', () => {
  it.each([
    'access_token',
    'refresh_token',
    'token',
    'api_key',
    'apikey',
    'apiKey',
    'client_secret',
    'clientSecret',
    'sharedSecret',
    'password',
  ])('"%s" の値は伏せられる', (field) => {
    expect(redactSecrets(`{"${field}":"${SECRET}"}`)).not.toContain(SECRET);
  });

  // 値の中でエスケープした引用符を先出しして、規則の終わりを早めに閉じさせる細工。
  // 値の下位パターンが `\\"` を跨ぐので、値は最後まで飲み込まれる。
  it('値の中に \\" を挟んで規則を早じまいさせられない', () => {
    const body = `{"client_secret":"pre\\"${SECRET}\\"post"}`;
    expect(redactSecrets(body)).not.toContain(SECRET);
    expect(redactSecrets(body)).toBe('{"client_secret":"[REDACTED]"}');
  });

  // 逆に、**名前の手がかりが無い自由文**に混ざった秘密は伏せられない。
  // 模様で見つける以上これは避けようがなく、だからこそ「送っているヘッダ名を
  // 全部知っていること」が効く。実際の応答は名前つきで返る。
  it('名前の手がかりが無い自由文の中までは伏せない (設計上の限界を明示)', () => {
    const body = `{"error_description":"Token ${SECRET} rejected"}`;
    expect(redactSecrets(body)).toBe(body);
  });
});

/*
 * **走査そのものの対照を、CI の中で回す。**
 *
 * `scan-credential-headers.cjs` は自前の `--self-test` を持っており、
 * 書き方の 12 形 (引用符つき / 素の識別子 / ブラケット代入 / 入れ子 /
 * 閉じられていないブロック / 大文字小文字 / btoa 組み立て / 既知の限界 ほか)
 * と、実物の `src/` から 6 種を拾えることを見ている。
 *
 * ところが 2026-08-25 に数えると、**この self-test はどこからも呼ばれていなかった**
 * —— `package.json` にも `.github/workflows/` にも無く、走らせる者がいない。
 * このテストが読んでいるのは走査の**出力**だけなので、走査の**解析**が
 * 壊れても (たとえばブラケット代入を取り逃がしても)、種数の下限さえ満たせば
 * 気付けない。
 *
 * **誰も回さない対照は、対照が無いのと同じである。** ここから呼ぶ。
 * 走査は既にこのファイルが読み込んでいるので、費用はほぼ 0。
 */
describe('走査そのものの対照 (scan-credential-headers.cjs の self-test)', () => {
  it('★ 走査の self-test が全件一致する', () => {
    // self-test は経過を console.log へ書く。落ちたときだけ読みたいので溜める。
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    let code: number;
    try {
      code = selfTest();
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
    expect(code, `走査の self-test が落ちた:\n${lines.join('\n')}`).toBe(0);
    // 走査が死んで 0 件になったのを「違反なし」と読まない —— 実際に回ったこと。
    expect(lines.filter((l) => l.includes('✓')).length).toBeGreaterThanOrEqual(10);
  });
});

/**
 * **接頭辞の網羅。** 上のヘッダ側の検査と対になる。
 *
 * ## なぜ別に要るのか (2026-08-29 実測)
 *
 * 上の検査は「**送っている側**のヘッダ名」から数えるので、
 * `x-api-key: sk-proj-…` の形はきちんと捕まる。ところが秘密は
 * **ヘッダ名を伴わずに現れることがある** —— 相手の API が本文へ
 * 「Incorrect API key provided: sk-proj-…」と書き返す形である。
 * そこを拾うのは `redact.ts` の接頭辞の列挙で、**そちらは誰も数えて
 * いなかった**。
 *
 * 数えたら 5 形が抜けていた:
 *
 * ```
 *   sk-proj- / sk-   OpenAI     ← 5 社の 1 つ。このアプリが預かる
 *   sk_live_ / rk_live_  Stripe ← サービス一覧に在る
 *   shpat_           Shopify    ← 同上
 * ```
 *
 * `sk-ant-` は在った。2026-08-23 に「`sk-ant-…` を含む例外がそのまま
 * renderer へ届いていた」のを直したときに、**その事故の接頭辞だけを足して
 * 一般化しなかった**跡である。同じ事故が OpenAI の鍵で起きれば、
 * 今日でもそのまま漏れていた。
 *
 * ## この台帳は手で保つ (ヘッダ側と違う)
 *
 * ヘッダ名は送信側の実装から機械的に採れるが、**接頭辞はソースのどこにも
 * 書かれていない** (鍵の形は発行元が決めるので、こちらのコードには現れない)。
 * だから列挙するしかない。列挙である以上ずれるので、**ずれたときに鳴る**
 * よう検査の側に置く —— プロバイダを足す人はここも足すことになる。
 */
describe('伏字の網羅 — 発行元が分かる接頭辞', () => {
  /** 実在する形。値は伏せられれば何でもよいので固定の埋め草を使う。 */
  const FILLER = 'A'.repeat(28);
  const PREFIXED: readonly [string, string][] = [
    ['Anthropic', `sk-ant-api03-${FILLER}`],
    ['OpenAI (プロジェクト鍵)', `sk-proj-${FILLER}`],
    ['OpenAI (旧形式)', `sk-${FILLER}${FILLER}`],
    ['Stripe (秘密鍵)', `sk_live_${FILLER}`],
    ['Stripe (制限鍵)', `rk_live_${FILLER}`],
    ['Stripe (試験鍵)', `sk_test_${FILLER}`],
    ['Shopify (管理 API)', `shpat_${FILLER}`],
    ['Shopify (共有秘密)', `shpss_${FILLER}`],
    ['GitHub (PAT)', `ghp_${FILLER}`],
    ['Slack (bot)', `xoxb-1111-2222-${FILLER}`],
    ['Google (API キー)', `AIzaSy${FILLER}`],
    ['Google (OAuth)', `ya29.${FILLER}`],
    ['Atlassian', `ATATT3xFfGF0${FILLER}`],
    ['Notion', `secret_${FILLER}`],
  ];

  it.each(PREFIXED)('★ %s の鍵は、ヘッダ名が無くても伏せられる', (_label, secret) => {
    const out = redactSecrets(`API error: ${secret} is invalid`);
    expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED]');
  });

  /*
   * **誤って伏せないこと。** 伏字が広すぎると 401 の説明が消え、
   * 読めば分かるはずの不具合が読めなくなる (`Bearer|Basic` の 16 字下限が
   * 同じ理由で在る)。裸の `sk-` は 20 字を要求してあるので、散文には
   * 当たらない。**`\b` は日本語の直後でも立つ** (CJK は `\w` ではない) ので、
   * 和文の標本も混ぜて確かめる。
   */
  it.each([
    'risk-management-framework を見直す',
    'task-oriented-architecture の話',
    'disk-usage-monitor が落ちた',
    'Basic authentication failed',
    'the sk- prefix is documented',
    'ask-me-anything-session-notes',
    'あsk-short',
  ])('★ 散文は伏せない: %s', (prose) => {
    expect(redactSecrets(prose)).toBe(prose);
  });

  /*
   * **覆えない形を名前で残す。**
   *
   * LINE のチャネルアクセストークンは接頭辞の無い base64 風の文字列で、
   * **形だけでは秘密と散文を区別できない**。ここを拾おうとすると
   * 「長い英数字」を全部伏せることになり、ID・ハッシュ・スタックトレースまで
   * 消えて不具合報告が読めなくなる。
   *
   * 覆えないので、この形はヘッダ側の検査 (`x-line-…` / `Authorization`) と
   * **送る前に値を組まない**設計で守る。ここに書いておくのは、次に読む人が
   * 「網羅している」と誤解しないためである。
   */
  it('LINE 形式 (接頭辞なし) は接頭辞では覆えない — 覆えないことを記録する', () => {
    const bare = `${'A'.repeat(43)}=`;
    expect(redactSecrets(`error: ${bare}`)).toContain(bare);
    // ただしヘッダ名が付いていれば、ヘッダ側の規則が拾う。
    expect(redactSecrets(`authorization: Bearer ${bare}`)).not.toContain(bare);
  });
});


/**
 * **接頭辞の台帳の母集団を、伏字の規則から「預かっているサービス」へ移す**
 * (2026-09-14 · パス 231)。
 *
 * ## 上の「網羅」は、自分の写しを数えていた
 *
 * 直前の `describe` は 14 形を並べて「ヘッダ名が無くても伏せられる」ことを
 * 見ており、**全件緑**である。しかしその 14 形は、`redact.ts` が**既に知って
 * いる接頭辞**を書き写したものだった。規則を足してから台帳に足すのだから、
 * **台帳には通る形しか入らない** —— 知らない形については構造的に何も言えず、
 * 「網羅」という名前だけが残る。
 *
 * 母集団を外から取って数え直した。このアプリが預かる資格情報の形を 25 並べ、
 * **ヘッダ名も JSON の項目名も付けずに**実物の `redactSecrets` へ通した結果:
 *
 * ```
 *   伏せた 11 / 素通り 14
 * ```
 *
 * 素通りの中に **`github_pat_…`** が在った。GitHub の細粒度 PAT ——
 * 今の GitHub が既定で発行する形で、`redact.ts` が例に使い、画面の
 * placeholder が `ghp_…` と書いている当のサービスの、**今日もっとも普通に
 * 使われる鍵**である。ほかに `ntn_` (Notion の新形式)・Google の更新
 * トークン (`1//`)・JWT (microsoft-365) が、いずれも**今日預かっている**
 * サービスの形として抜けていた。
 *
 * ## だから母集団は `SERVICE_CREDENTIAL_USE` から取る
 *
 * 鍵の形は発行元が決めるのでソースには現れない。**現れるのは「誰の鍵を
 * 預かるか」**で、それは `credentialUse.ts` が宣言している (`fetch` /
 * `action` = 預かる、`none` = 預からない)。そこを母集団にすれば、
 * 資格情報を預かるサービスを足す人は**ここも埋めることになる**。
 *
 * 分類は 2 つだけで、**それぞれ検査が別のことを証明する**:
 *
 * - `prefix`      — 裸で現れても伏せる (発行元が分かる接頭辞を持つ)
 * - `header-only` — 裸では伏せない。ヘッダ名 / JSON 項目名の規則が受け持つ
 *
 * `header-only` は「接頭辞を**主張しない**」という宣言であって、
 * 「接頭辞が存在しない」の証明ではない。控えめな側なので、形を調べきれて
 * いないサービスはこちらに置く —— どのトークンも `Authorization` か
 * `x-api-key` に載って出るので、この宣言が偽になることはない。
 * そして**そのことも下で測る** (宣言して終わりにしない)。
 */
describe('伏字の網羅 — 母集団は「預かっているサービス」(パス 231)', () => {
  const FILL = 'A'.repeat(28);

  type Carrier = 'prefix' | 'header-only';
  interface Held {
    readonly service: ServiceId;
    /** 発行元と形。人が読むためのもの。 */
    readonly issuer: string;
    readonly carrier: Carrier;
    /** `prefix` のときの標本。`header-only` は接頭辞を持たない標本を置く。 */
    readonly sample: string;
  }

  // 預かる 23 サービスすべてに 1 行。**足りなければ下の突き合わせが鳴る。**
  const HELD_FORMATS: readonly Held[] = [
    { service: 'github', issuer: 'GitHub 細粒度 PAT', carrier: 'prefix', sample: `github_pat_${FILL}_${FILL}${FILL}` },
    { service: 'notion', issuer: 'Notion 内部連携 (新)', carrier: 'prefix', sample: `ntn_${FILL}${FILL}` },
    { service: 'drive', issuer: 'Google 更新トークン', carrier: 'prefix', sample: `1//0g${FILL}${FILL}` },
    { service: 'calendar', issuer: 'Google アクセストークン', carrier: 'prefix', sample: `ya29.${FILL}${FILL}` },
    { service: 'gmail', issuer: 'Google 更新トークン', carrier: 'prefix', sample: `1//0e${FILL}${FILL}` },
    { service: 'youtube', issuer: 'Google API キー', carrier: 'prefix', sample: `AIzaSy${FILL}` },
    {
      service: 'microsoft-365',
      issuer: 'Microsoft Graph (JWT)',
      carrier: 'prefix',
      sample: `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${FILL}${FILL}.${FILL}${FILL}`,
    },
    { service: 'slack', issuer: 'Slack bot トークン', carrier: 'prefix', sample: `xoxb-1111-2222-${FILL}` },
    { service: 'atlassian', issuer: 'Atlassian API トークン', carrier: 'prefix', sample: `ATATT3xFfGF0${FILL}` },
    { service: 'shopify', issuer: 'Shopify 管理 API', carrier: 'prefix', sample: `shpat_${FILL}` },
    { service: 'assistant', issuer: 'Anthropic API キー', carrier: 'prefix', sample: `sk-ant-api03-${FILL}` },
    { service: 'emotions', issuer: 'Anthropic API キー', carrier: 'prefix', sample: `sk-ant-api03-${FILL}` },
    { service: 'skills', issuer: 'Anthropic API キー', carrier: 'prefix', sample: `sk-ant-api03-${FILL}` },
    { service: 'business', issuer: 'Anthropic API キー', carrier: 'prefix', sample: `sk-ant-api03-${FILL}` },
    { service: 'teamradar', issuer: 'Anthropic API キー', carrier: 'prefix', sample: `sk-ant-api03-${FILL}` },
    // ここから下は接頭辞を主張しない (控えめな側)。標本は「長い英数字」で、
    // 裸では伏せられないこと・名前が付けば伏せられることの両方を測る。
    { service: 'cloudflare', issuer: 'Cloudflare API トークン (40 字)', carrier: 'header-only', sample: 'B'.repeat(40) },
    { service: 'security', issuer: 'HIBP / VirusTotal (16 進)', carrier: 'header-only', sample: 'c'.repeat(64) },
    { service: 'wordpress', issuer: 'WordPress.com OAuth', carrier: 'header-only', sample: 'D'.repeat(44) },
    { service: 'canva', issuer: 'Canva OAuth', carrier: 'header-only', sample: 'E'.repeat(48) },
    { service: 'base', issuer: 'BASE OAuth', carrier: 'header-only', sample: 'F'.repeat(43) },
    { service: 'freee', issuer: 'freee OAuth', carrier: 'header-only', sample: 'G'.repeat(50) },
    { service: 'cursor', issuer: 'Cursor API キー', carrier: 'header-only', sample: 'H'.repeat(40) },
    { service: 'stocks', issuer: '市場データ API キー', carrier: 'header-only', sample: 'J'.repeat(32) },
  ];

  const HELD_SERVICES = (Object.keys(SERVICE_CREDENTIAL_USE) as ServiceId[]).filter((id) =>
    collectsCredential(SERVICE_CREDENTIAL_USE[id]),
  );

  it('★ 母集団が空でない (台帳が死んだら下の総当たりが黙る)', () => {
    expect(HELD_SERVICES.length).toBeGreaterThanOrEqual(20);
    expect(HELD_SERVICES).toContain('github');
  });

  /**
   * **双方向。** 預かるサービスは必ず 1 行持ち、行は必ず預かるサービスを指す。
   * 片方向だと「台帳に在る分だけ見る」= 抜けを構造的に見られない検査になる。
   */
  it('★ 預かる 23 サービスすべてに行が在り、余計な行が無い', () => {
    const listed = HELD_FORMATS.map((f) => f.service);
    expect([...listed].sort()).toEqual([...HELD_SERVICES].sort());
  });

  it.each(HELD_FORMATS.filter((f) => f.carrier === 'prefix').map((f) => [f.service, f.issuer, f.sample] as const))(
    '★ %s (%s) は、ヘッダ名が無くても伏せられる',
    (_service, _issuer, sample) => {
      const out = redactSecrets(`upstream said: invalid credential ${sample} please retry`);
      expect(out).not.toContain(sample);
      expect(out).toContain('[REDACTED]');
    },
  );

  it.each(HELD_FORMATS.filter((f) => f.carrier === 'header-only').map((f) => [f.service, f.issuer, f.sample] as const))(
    '★ %s (%s) は裸では伏せられないが、名前が付けば伏せられる',
    (_service, _issuer, sample) => {
      // 裸では残る —— **限界を主張ではなく測定で残す**。ここが伏せられる
      // ようになったら分類を `prefix` へ動かす合図である。
      expect(redactSecrets(`error: ${sample}`)).toContain(sample);
      // ヘッダ名が付いた形・JSON の項目名が付いた形では消える。
      expect(redactSecrets(`authorization: Bearer ${sample}`)).not.toContain(sample);
      expect(redactSecrets(`{"headers":{"x-api-key":"${sample}"}}`)).not.toContain(sample);
      expect(redactSecrets(`{"access_token":"${sample}"}`)).not.toContain(sample);
    },
  );

  /*
   * 対照 — **この検査が鳴るか。** 預かっているのに伏字が知らない接頭辞を
   * 合成し、`prefix` として主張したら落ちることを確かめる。
   * (2026-09-14 の実測では `github_pat_` がまさにこれだった。)
   */
  it('★ 伏字が知らない接頭辞を prefix として並べたら落ちる (対照)', () => {
    const unknown = `zz_unknown_issuer_${FILL}`;
    const out = redactSecrets(`upstream said: invalid credential ${unknown} please retry`);
    expect(out).toContain(unknown);
  });

  /*
   * 逆向きの対照 — 規則が広すぎると `header-only` の行が「裸でも消える」に
   * なって、上の `toContain` が落ちる。つまりこの組は**両方向に鳴る**。
   * ここでは散文が巻き添えにならないことを、新しく足した 6 形について見る。
   */
  /*
   * **3 本目の運び手 —— URL のクエリ引数。** (パス 271)
   *
   * 上の 2 つの describe は**ヘッダ名**と**JSON 項目名**を数えている。
   * `?key=…` はそのどちらでもなく、2026-09-15 まで**どの規則も当たらなかった**。
   *
   * このアプリがクエリに資格情報を載せるのは 1 か所 (`youtube.ts` の `&key=`) で、
   * それが漏れていなかったのは **Google が鍵に `AIza` を付けているから** ——
   * 運び手を知っていたからではない。走査で「クエリに資格情報を載せている所」を
   * 数え、台帳と**両方向**に突き合わせる: 新しい所が増えたら鳴り、
   * 台帳の行が消えても鳴る。
   */
  describe('伏字の網 — 3 本目の運び手 (URL のクエリ引数・パス 271)', () => {
    const LONG = 'Z'.repeat(40);

    /** 資格情報を名乗るクエリ引数の綴り。規則が当たらなければ落ちる。 */
    const QUERY_NAMES = [
      'api_key',
      'api-key',
      'apikey',
      'apiKey',
      'x-api-key',
      'access_token',
      'accesstoken',
      'refresh_token',
      'client_secret',
      'code_verifier',
      'code-verifier',
      'token',
      'secret',
      'password',
      'auth',
      'key',
    ] as const;

    it.each(QUERY_NAMES)('★ ?%s= の値は伏せられる (名前は残る)', (name) => {
      const out = redactSecrets(`https://h.test/v1/x?id=1&${name}=${LONG}&next=2`);
      expect(out).not.toContain(LONG);
      // 名前と前後の引数はそのまま —— どの引数だったかは原因究明に要る。
      expect(out).toContain(`${name}=[REDACTED]`);
      expect(out).toContain('id=1');
      expect(out).toContain('next=2');
    });

    /*
     * 逆向き —— 規則が広すぎないこと。**巻き添えにすると 401 の理由が読めなくなる。**
     */
    it.each([
      ['短い id は伏せない', 'https://h.test/p?key=1'],
      ['資格情報でない引数は伏せない', 'https://h.test/p?part=snippet&id=UC1'],
      ['語の途中の key は伏せない (monkey)', 'https://h.test/p?monkey=abcdefghij'],
      ['散文の key=value は伏せない', 'the key=value form is common'],
      /*
       * **パス 271 はここに `'token=abcdefghijklmnop in prose'` を置いていた。**
       * 理由は「散文」だったが、区切りが無いという条件が指す母集団は 2 つ在り
       * (散文と **form 本文の 1 つ目**)、標本は散文しか見ていなかった。
       * だから過剰の対照が、`client_secret=…&grant_type=…` が素通りする穴を
       * **意図として留めていた** (パス 289 で実測して直した)。
       *
       * 散文の対照はここに残す —— ただし**対の途中**に置く。文字列の先頭は
       * form 本文の 1 つ目と区別できないので、先頭の標本では過剰を測れない。
       */
      ['散文の途中の token= は伏せない (対が先頭でない)', 'the token=abcdefghijklmnop form is odd'],
      ['JSON の中の散文は別規則の領分', '{"note":"see key=abcdefghij"}'],
      ['エラーコードは伏せない (?code= は規則に入れていない)', 'oauth error: code=access_denied'],
    ])('★ %s', (_label, text) => {
      expect(redactSecrets(text)).toBe(text);
    });

    /*
     * **運び手の残り半分 —— `application/x-www-form-urlencoded` の本文。**
     * (パス 289)
     *
     * RFC 6749 §4.1.3 がトークン端点に指定している形で、`main/oauth.ts` の
     * `serializeTokenBody` と `renderer/oauth/pkce.ts` が実際に組み立てる。
     * 対が 1 つ目のときは `?` も `&` も手前に無い。
     */
    it.each([
      ['client_secret', `client_secret=${LONG}&grant_type=refresh_token`],
      ['refresh_token', `refresh_token=${LONG}&client_id=abc`],
      ['code_verifier (RFC 7636 の秘密)', `code_verifier=${LONG}&grant_type=authorization_code`],
      ['access_token', `access_token=${LONG}`],
      ['api_key', `api_key=${LONG}`],
      ['password', `password=${LONG}`],
      ['token', `token=${LONG}`],
    ])('★ form 本文の 1 つ目でも伏せる: %s', (_label, body) => {
      const out = redactSecrets(body);
      expect(out).not.toContain(LONG);
      expect(out).toContain('[REDACTED]');
    });

    it('★ 改行のあとも対の始まりである (本文をログの体裁で載せた形)', () => {
      const out = redactSecrets(`request body:\nclient_secret=${LONG}&grant_type=x`);
      expect(out).not.toContain(LONG);
      expect(out).toContain('client_secret=[REDACTED]');
      // 手前の行はそのまま (区切りを書き戻している)。
      expect(out).toContain('request body:');
    });

    it('★ 1 つ目を伏せても 2 つ目以降は今までどおり伏せる (両方が要る)', () => {
      const other = 'Y'.repeat(40);
      const out = redactSecrets(`client_secret=${LONG}&refresh_token=${other}`);
      expect(out).not.toContain(LONG);
      expect(out).not.toContain(other);
      expect(out).toBe('client_secret=[REDACTED]&refresh_token=[REDACTED]');
    });

    /*
     * **`assertion` は足していない** —— JWT bearer grant の綴りだが、
     * このアプリは 1 度も出さない (実測 0 件)。使っていない綴りを規則へ
     * 足すと「効いているように読める」だけになる、というのが `?sig=` に
     * ついて `redact.ts` が書いた判断で、同じ規準をここにも当てる。
     * **足していないことを検査で留める** —— 黙って足されたら鳴る。
     */
    it('★ 出していない綴り (assertion) は規則に入っていない', () => {
      const emitted = redactSecrets(`assertion=${LONG}`);
      expect(emitted).toContain(LONG);
      // 走査: このアプリが `assertion=` を組み立てていないことが根拠である。
      const sites = ['src/main/oauth.ts', 'src/renderer/oauth/pkce.ts'];
      for (const rel of sites) {
        expect(readOriginalSource(resolve(REPO, rel)), rel).not.toContain('assertion:');
      }
      // 対照: 同じ走査は実際に出している綴りを拾う。
      expect(readOriginalSource(resolve(REPO, 'src/main/oauth.ts'))).toContain('code_verifier:');
    });

    /*
     * **実物の 1 か所。** `youtube.ts` は `&key=${apiKey}` で Google API キーを
     * クエリに載せる。2 つの規則が重なって当たるが、**重なりに依存しない**ことを
     * 見る —— 接頭辞を持たない鍵でも、クエリの規則だけで消える。
     */
    it('★ youtube の実物の形 (AIza 付き) が消える', () => {
      const key = `AIzaSy${'A'.repeat(33)}`;
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC1&key=${key}`;
      const out = redactSecrets(`fetch failed: ${url}`);
      expect(out).not.toContain(key);
      expect(out).toContain('key=[REDACTED]');
    });

    it('★ 接頭辞を持たない鍵でも、クエリに載れば消える (発行元の親切に依らない)', () => {
      const key = 'q'.repeat(39);
      const out = redactSecrets(`https://h.test/v1/x?key=${key}`);
      expect(out).not.toContain(key);
    });

    /*
     * **走査 —— クエリに資格情報を載せている所の母集団。**
     * 台帳と両方向で突き合わせる (パス 117 / 210 と同じ流儀)。
     */
    const QUERY_CREDENTIAL_SITES: Readonly<Record<string, string>> = {
      'src/main/clients/youtube.ts':
        'Google API キーを `&key=${key}` でクエリに載せる (YouTube Data API v3 の仕様。ヘッダでは受け付けない)',
    };

    function scanQueryCredentialSites(): string[] {
      const roots = ['src/main/clients', 'src/shared/api', 'src/renderer/data'];
      const found = new Set<string>();
      // 資格情報らしい名前のクエリ引数へ、変数を差し込んでいる形。
      const rx = /[?&](?:api[_-]?key|access[_-]?token|token|secret|auth|key)=\$\{/i;
      for (const root of roots) {
        const dir = resolve(REPO, root);
        if (!existsSync(dir)) continue;
        for (const name of readOriginalDir(dir)) {
          if (!name.endsWith('.ts')) continue;
          const rel = `${root}/${name}`;
          const text = stripLineComments(readOriginalSource(resolve(dir, name)));
          if (rx.test(text)) found.add(rel);
        }
      }
      return [...found].sort();
    }

    it('★ 走査が生きている (的を外していない)', () => {
      expect(scanQueryCredentialSites().length).toBeGreaterThanOrEqual(1);
    });

    it('★ クエリに資格情報を載せる所は台帳と一致する (両方向)', () => {
      expect(scanQueryCredentialSites()).toEqual(Object.keys(QUERY_CREDENTIAL_SITES).sort());
    });

    it('台帳の行にはすべて理由がある', () => {
      for (const [file, why] of Object.entries(QUERY_CREDENTIAL_SITES)) {
        expect(why.trim().length, `${file} の理由が短い`).toBeGreaterThan(20);
      }
    });

    /*
     * **走査の 2 本目 —— form 本文に資格情報を載せている所。** (パス 289)
     *
     * 上の走査は `[?&]name=${…}` しか見ていない = **クエリだけ**。
     * `URLSearchParams` に資格情報の欄を置く形はそこに掛からないので、
     * 「運び手を数えた」と言えていなかった。実測 2 件 (どちらも OAuth の
     * トークン端点。`Authorization` ヘッダではなく本文で運ぶのは
     * RFC 6749 §4.1.3 / RFC 7636 §4.5 の指定である)。
     *
     * **`assertion` を規則に入れていない根拠はこの走査である** ——
     * 走査は `assertion` も探しており、0 件だから足していない。
     * 誰かが JWT bearer grant を実装したら台帳と食い違って鳴る。
     */
    const FORM_CREDENTIAL_SITES: Readonly<Record<string, string>> = {
      'src/main/oauth.ts':
        'トークン端点への POST 本文に client_secret / refresh_token / code_verifier を載せる (RFC 6749 §4.1.3 の指定。ヘッダでは運べない欄が在る)',
      'src/renderer/oauth/pkce.ts':
        'ブラウザ版の貼り付け PKCE が同じ本文を組む (code_verifier は RFC 7636 §4.5 で本文の欄)',
    };

    /** 資格情報の欄を持つ form 本文を組んでいるファイル。 */
    function scanFormCredentialSites(): string[] {
      const roots = ['src/main', 'src/main/clients', 'src/shared/api', 'src/renderer/data', 'src/renderer/oauth'];
      const names = 'client_?secret|refresh_?token|access_?token|code_?verifier|api_?key|password|assertion';
      const asKey = new RegExp(`(?:^|[\\s,{(])(?:${names})\\s*:`, 'im');
      const asSet = new RegExp(`\\.set\\(\\s*['"\`](?:${names})['"\`]`, 'i');
      const found = new Set<string>();
      for (const root of roots) {
        const dir = resolve(REPO, root);
        if (!existsSync(dir)) continue;
        for (const name of readOriginalDir(dir)) {
          if (!name.endsWith('.ts')) continue;
          const text = stripLineComments(readOriginalSource(resolve(dir, name)));
          // form 本文を組んでいないファイルは対象外 (JSON の本文は別規則の領分)。
          if (!/URLSearchParams|x-www-form-urlencoded/.test(text)) continue;
          if (asKey.test(text) || asSet.test(text)) found.add(`${root}/${name}`);
        }
      }
      return [...found].sort();
    }

    it('★ 走査が生きている (的を外していない)', () => {
      expect(scanFormCredentialSites().length).toBeGreaterThanOrEqual(2);
    });

    it('★ form 本文に資格情報を載せる所は台帳と一致する (両方向)', () => {
      expect(scanFormCredentialSites()).toEqual(Object.keys(FORM_CREDENTIAL_SITES).sort());
    });

    it('台帳の行にはすべて理由がある (form 本文の側)', () => {
      for (const [file, why] of Object.entries(FORM_CREDENTIAL_SITES)) {
        expect(why.trim().length, `${file} の理由が短い`).toBeGreaterThan(20);
      }
    });

    it('★ 台帳の 2 件が組む欄は、どれも規則に当たる (名前の突き合わせ)', () => {
      // 実物が本文に置いている欄名 (`main/oauth.ts` / `pkce.ts` より)。
      for (const field of ['client_secret', 'refresh_token', 'code_verifier', 'grant_type']) {
        const body = `${field}=${LONG}&x=1`;
        const out = redactSecrets(body);
        // grant_type は秘密ではないので伏せない —— 名前の一覧が広すぎないことの対照。
        if (field === 'grant_type') expect(out, field).toContain(LONG);
        else expect(out, field).not.toContain(LONG);
      }
    });

    it('★ 走査は新しい所を拾う (対照・合成の標本)', () => {
      const rx = /[?&](?:api[_-]?key|access[_-]?token|token|secret|auth|key)=\$\{/i;
      expect(rx.test('const u = `https://h/x?api_key=${k}`;')).toBe(true);
      expect(rx.test('const u = `https://h/x?part=snippet&id=${ch}`;')).toBe(false);
    });
  });

  it.each([
    'sl. の後に空白が在る文',
    'version 1// は区切りではない',
    'eyJ だけで終わる語',
    'sntrys_ の説明文',
    '1/2 の分数と 00D の型番',
    'whsec_ とは何か',
  ])('★ 散文は伏せない (パス 231 で足した 6 形): %s', (prose) => {
    expect(redactSecrets(prose)).toBe(prose);
  });
});

/**
 * **相手の本文をどれだけ画面へ載せてよいかの天井を、裸の数で書かせない。** (パス 273)
 *
 * 実測 (2026-09-15): `redactForMessage(input, maxChars)` の第 2 引数は 5 値に割れ、
 * **19 か所が裸のリテラル**だった —— 200 が 15 か所・100 が 2 か所・80 が 2 か所。
 * 名前が在ったのは 2000 (`ERROR_MESSAGE_MAX_CHARS`) と 300
 * (`MAX_ENSEMBLE_ERROR_CHARS`・パス 269 で付けた) だけで、**最も多い 200 には
 * 名前も理由も無かった**。
 *
 * とくに 80 の 2 か所は **main ↔ ブラウザ版の双子** (`main/clients/emotions.ts` と
 * `web-shim.ts` が、Anthropic が JSON 以外を返した同じ状況を同じ 80 で切る)。
 * 一致していたが、**一致を留めている物が何も無かった** —— パス 269 が 300 で
 * 塞いだ穴とまったく同じ形である。
 *
 * ここで見るのは**綴りではなく母集団**: `redactForMessage` を呼ぶ所すべてを数え、
 * 第 2 引数が識別子であることを要求する。数を足した人は名前を付けるしかない。
 */
describe('伏字の天井 — 呼ぶ側の第 2 引数は名前で書く (パス 273)', () => {
  /** `src/` 以下の .ts を集める (検査自身と redact.ts の説明は除く)。 */
  function productionSources(dir: string, out: string[] = []): string[] {
    for (const name of readOriginalDir(dir)) {
      const p = resolve(dir, name);
      if (name === '__tests__') continue;
      if (existsSync(p) && !name.endsWith('.ts') && !name.includes('.')) {
        productionSources(p, out);
      } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
        out.push(p);
      }
    }
    return out;
  }

  /** 呼び出しの第 2 引数だけを取る (コメントと文字列の中は落とす)。 */
  const CALL = /redactForMessage\s*\([^,()]*,\s*([^)]*)\)/g;
  function secondArgs(src: string): string[] {
    const found: string[] = [];
    for (const m of stripLineComments(src).matchAll(CALL)) found.push((m[1] ?? '').trim());
    return found;
  }

  const sources = productionSources(resolve(REPO, 'src')).filter(
    (p) => !p.endsWith(`${'redact'}.ts`),
  );

  it('★ 母集団が空でない (走査が死んだら「問題なし」にならない)', () => {
    const total = sources.reduce((n, p) => n + secondArgs(readOriginalSource(p)).length, 0);
    expect(sources.length).toBeGreaterThan(200);
    expect(total).toBeGreaterThanOrEqual(19);
  });

  it('★ 裸の数で天井を書いている所は 0 件', () => {
    const naked: string[] = [];
    for (const p of sources) {
      for (const arg of secondArgs(readOriginalSource(p))) {
        if (/^\d+$/.test(arg)) naked.push(`${p.slice(REPO.length + 1)} → ${arg}`);
      }
    }
    expect(naked).toEqual([]);
  });

  it('★ 使っている名前はすべて redact / assistantLimits の輸出である', () => {
    const allowed = new Set([
      'ERROR_MESSAGE_MAX_CHARS',
      'MAX_ENSEMBLE_ERROR_CHARS',
      'MAX_RESPONSE_BODY_IN_MESSAGE',
      'MAX_WARNING_BODY_CHARS',
      'MAX_MALFORMED_JSON_ECHO_CHARS',
    ]);
    const unknown = new Set<string>();
    for (const p of sources) {
      for (const arg of secondArgs(readOriginalSource(p))) {
        if (!allowed.has(arg)) unknown.add(`${p.slice(REPO.length + 1)} → ${arg}`);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  /* 対照 —— 抽出器が本当に裸の数を見つけるか (空の検査にしない)。 */
  it('★ 標本: 裸の数は拾い、名前は拾わない', () => {
    expect(secondArgs('throw new Error(`x: ${redactForMessage(body, 200)}`);')).toEqual(['200']);
    expect(secondArgs('redactForMessage(msg, MAX_WARNING_BODY_CHARS)')).toEqual([
      'MAX_WARNING_BODY_CHARS',
    ]);
    // コメントの中の再発例は数えない (この検査自身の説明文で落ちないこと)
    expect(secondArgs('// かつては redactForMessage(body, 200) と書いていた')).toEqual([]);
  });

  it('★ 双子が同じ天井を読む (main の emotions とブラウザ版・パス 273)', () => {
    const mainSrc = readOriginalSource(resolve(REPO, 'src/main/clients/emotions.ts'));
    const webSrc = readOriginalSource(resolve(REPO, 'src/renderer/web-shim.ts'));
    expect(mainSrc).toContain('MAX_MALFORMED_JSON_ECHO_CHARS');
    expect(webSrc).toContain('MAX_MALFORMED_JSON_ECHO_CHARS');
    // 片方が数へ戻ったら鳴る (綴りではなく引数の形で見る)
    const drift = /redactForMessage\(\s*body\s*,\s*\d/;
    expect(mainSrc).not.toMatch(drift);
    expect(webSrc).not.toMatch(drift);
    expect('redactForMessage(body, 80)').toMatch(drift);
  });
});
