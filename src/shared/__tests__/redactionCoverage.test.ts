import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { redactSecrets } from '../redact';

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
