import { describe, expect, it } from 'vitest';
import {
  MAX_PROXY_SECRET_CHARS,
  MAX_PROXY_URL_CHARS,
  describeProxyEndpointFailure,
  isValidProxySecret,
  normalizeProxyEndpoint,
  reviewStoredProxyConfig,
  type ProxyEndpointFailure,
} from '../proxyEndpoint';

/** 失敗理由だけを取り出す（成功なら null）。 */
function reasonOf(raw: unknown): ProxyEndpointFailure | null {
  const r = normalizeProxyEndpoint(raw);
  return r.ok ? null : r.reason;
}

/** 正規化後の URL だけを取り出す（失敗なら null）。 */
function urlOf(raw: unknown): string | null {
  const r = normalizeProxyEndpoint(raw);
  return r.ok ? r.url : null;
}

describe('normalizeProxyEndpoint — 通すもの', () => {
  it('https の worker URL を通す', () => {
    expect(urlOf('https://my-worker.example.com/proxy')).toBe('https://my-worker.example.com/proxy');
  });

  it('クエリは残す（POST する終点そのものなので route がありうる）', () => {
    expect(urlOf('https://w.example.com/p?v=2')).toBe('https://w.example.com/p?v=2');
  });

  it('前後の空白は落とす', () => {
    expect(urlOf('  https://w.example.com/p  ')).toBe('https://w.example.com/p');
  });

  it('ホストだけの URL には根のスラッシュが付く（WHATWG の正規化）', () => {
    expect(urlOf('https://w.example.com')).toBe('https://w.example.com/');
  });

  it('大文字のスキーム・ホストは小文字に正規化される', () => {
    expect(urlOf('HTTPS://W.EXAMPLE.COM/P')).toBe('https://w.example.com/P');
  });

  it('loopback なら平文 http を通す（wrangler dev がこれを出す）', () => {
    expect(urlOf('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787/');
    expect(urlOf('http://localhost:8787/proxy')).toBe('http://localhost:8787/proxy');
    expect(urlOf('http://[::1]:8787/')).toBe('http://[::1]:8787/');
  });

  it('loopback でも https は当然通す', () => {
    expect(urlOf('https://localhost:8787/proxy')).toBe('https://localhost:8787/proxy');
  });

  it('長さの上限ちょうどは通る', () => {
    const pad = 'a'.repeat(MAX_PROXY_URL_CHARS - 'https://w.example.com/'.length);
    const url = `https://w.example.com/${pad}`;
    expect(url.length).toBe(MAX_PROXY_URL_CHARS);
    expect(reasonOf(url)).toBeNull();
  });
});

describe('normalizeProxyEndpoint — 断るもの', () => {
  it('空・空白のみ', () => {
    expect(reasonOf('')).toBe('empty');
    expect(reasonOf('   ')).toBe('empty');
  });

  it('文字列でない値', () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(reasonOf(v), String(v)).toBe('not-a-url');
    }
  });

  it('上限を 1 文字超えたら断る', () => {
    const pad = 'a'.repeat(MAX_PROXY_URL_CHARS - 'https://w.example.com/'.length + 1);
    const url = `https://w.example.com/${pad}`;
    expect(url.length).toBe(MAX_PROXY_URL_CHARS + 1);
    expect(reasonOf(url)).toBe('too-long');
  });

  /*
   * **天井は「字」で数える** (2026-09-13 · パス 196)。断りの文面が
   * 「1024 **文字**まで」と言う一方で、判定は `.length` (UTF-16 コード単位) だった ——
   * 絵文字や BMP 外の漢字を含む URL は**天井の半分**で断られていた。
   * ASCII の標本では両者が一致するので、この検査だけが単位を留める。
   */
  it('★ 絵文字の URL は字で数える (コード単位なら半分で断られる)', () => {
    const base = 'https://w.example.com/';
    // 絵文字 1 つ = 2 コード単位 / 1 字。天井いっぱいまで絵文字で埋める。
    const emoji = '\u{1F600}'.repeat(MAX_PROXY_URL_CHARS - base.length);
    const url = base + emoji;
    expect([...url].length).toBe(MAX_PROXY_URL_CHARS);
    expect(url.length).toBeGreaterThan(MAX_PROXY_URL_CHARS); // コード単位では超えている
    expect(reasonOf(url)).toBeNull();                        // 字では超えていないので通る
  });

  it('★ 共有秘密も字で数える', () => {
    const atLimit = '\u{1F600}'.repeat(MAX_PROXY_SECRET_CHARS);
    expect([...atLimit].length).toBe(MAX_PROXY_SECRET_CHARS);
    expect(atLimit.length).toBe(MAX_PROXY_SECRET_CHARS * 2);
    expect(isValidProxySecret(atLimit)).toBe(true);
    expect(isValidProxySecret(atLimit + '\u{1F600}')).toBe(false);
  });

  it('制御文字（URL の解析より先に落とす）', () => {
    expect(reasonOf('https://w.example.com/\u0000')).toBe('control-char');
    expect(reasonOf('https://w.example.com/\r\nX-Evil: 1')).toBe('control-char');
    expect(reasonOf('https://w.example.com/\u007f')).toBe('control-char');
  });

  it('URL として解釈できない', () => {
    expect(reasonOf('not a url')).toBe('not-a-url');
    expect(reasonOf('example.com/proxy')).toBe('not-a-url');
  });

  it('http(s) 以外のスキーム', () => {
    expect(reasonOf('ftp://w.example.com/')).toBe('not-http');
    expect(reasonOf('javascript:alert(1)')).toBe('not-http');
    expect(reasonOf('file:///etc/passwd')).toBe('not-http');
    expect(reasonOf('data:text/plain,x')).toBe('not-http');
  });

  it('userinfo（本当の送り先を隠す形）', () => {
    expect(reasonOf('https://user@w.example.com/')).toBe('has-userinfo');
    expect(reasonOf('https://user:pass@w.example.com/')).toBe('has-userinfo');
    expect(reasonOf('https://:pass@w.example.com/')).toBe('has-userinfo');
  });

  it('断片（サーバへ送られないので貼り間違いの印）', () => {
    expect(reasonOf('https://w.example.com/p#frag')).toBe('has-fragment');
  });

  it('loopback 以外への平文 http（トークンが平文で流れる）', () => {
    expect(reasonOf('http://evil.example.com/p')).toBe('insecure-remote');
    expect(reasonOf('http://192.168.1.5:8787/')).toBe('insecure-remote');
    expect(reasonOf('http://169.254.169.254/')).toBe('insecure-remote');
    expect(reasonOf('http://10.0.0.1/')).toBe('insecure-remote');
  });

  // 127.x はすべて loopback だが、それ以外の第 1 オクテットは違う。
  it('127 で始まらないアドレスは loopback 扱いしない', () => {
    expect(reasonOf('http://126.0.0.1/')).toBe('insecure-remote');
    expect(reasonOf('http://128.0.0.1/')).toBe('insecure-remote');
    expect(reasonOf('http://127.1.2.3/')).toBeNull();
  });

  // 判定の順序そのものを固定する。制御文字を後に回すと、解析器が
  // 分断された URL を先に受け入れてしまう可能性がある。
  it('複数の違反があるときは、先に見る規則の理由を返す', () => {
    // 長すぎる + 制御文字 → 長さが先
    const long = `https://w.example.com/${'a'.repeat(MAX_PROXY_URL_CHARS)}\u0000`;
    expect(reasonOf(long)).toBe('too-long');
    // 制御文字 + 解釈不能 → 制御文字が先
    expect(reasonOf('not a url\u0000')).toBe('control-char');
    // userinfo + 断片 → userinfo が先
    expect(reasonOf('https://u:p@w.example.com/#f')).toBe('has-userinfo');
    // 断片 + 平文 remote → 断片が先
    expect(reasonOf('http://evil.example.com/#f')).toBe('has-fragment');
  });
});

describe('describeProxyEndpointFailure', () => {
  const ALL: readonly ProxyEndpointFailure[] = [
    'empty',
    'too-long',
    'control-char',
    'not-a-url',
    'not-http',
    'has-userinfo',
    'has-fragment',
    'insecure-remote',
    'secret-too-long',
  ];

  it('全ての理由に文言がある', () => {
    for (const r of ALL) {
      const s = describeProxyEndpointFailure(r);
      expect(s.length, r).toBeGreaterThan(0);
    }
  });

  it('文言は理由ごとに違う', () => {
    const all = ALL.map(describeProxyEndpointFailure);
    expect(new Set(all).size).toBe(ALL.length);
  });

  it('何を直せばよいかを含む', () => {
    expect(describeProxyEndpointFailure('empty')).toContain('空');
    expect(describeProxyEndpointFailure('too-long')).toContain(String(MAX_PROXY_URL_CHARS));
    expect(describeProxyEndpointFailure('control-char')).toContain('制御文字');
    expect(describeProxyEndpointFailure('not-a-url')).toContain('https://');
    expect(describeProxyEndpointFailure('not-http')).toContain('http(s)');
    expect(describeProxyEndpointFailure('has-userinfo')).toContain('パスワード');
    expect(describeProxyEndpointFailure('has-fragment')).toContain('#');
    // 平文を断る理由は「なぜ駄目か」と「どうすればよいか」の両方を書く。
    expect(describeProxyEndpointFailure('insecure-remote')).toContain('平文');
    expect(describeProxyEndpointFailure('insecure-remote')).toContain('127.0.0.1');
    expect(describeProxyEndpointFailure('secret-too-long')).toContain('共有秘密');
    expect(describeProxyEndpointFailure('secret-too-long')).toContain(String(MAX_PROXY_SECRET_CHARS));
  });

  // 表に載っているのに誰も返さない理由が増えると、文言だけが増えて
  // 実際には出ない。逆に返るのに表に無ければ switch が漏れる。
  it('返る理由と文言表がちょうど一致する', () => {
    const seen = new Set<ProxyEndpointFailure>();
    for (const raw of [
      '',
      `https://w.example.com/${'a'.repeat(MAX_PROXY_URL_CHARS)}`,
      'https://w.example.com/\u0000',
      'not a url',
      'ftp://w.example.com/',
      'https://u:p@w.example.com/',
      'https://w.example.com/#f',
      'http://evil.example.com/',
    ]) {
      const r = reasonOf(raw);
      if (r !== null) seen.add(r);
    }
    // 共有秘密の理由は URL の検証からは出ない。保存済み設定の検証から出る。
    const secret = reviewStoredProxyConfig({
      url: 'https://w.example.com/',
      sharedSecret: 'x'.repeat(MAX_PROXY_SECRET_CHARS + 1),
    }).rejected;
    if (secret !== null) seen.add(secret);
    expect([...seen].sort()).toEqual([...ALL].sort());
  });
});

describe('isValidProxySecret', () => {
  it('未指定は許す（worker 側が認証不要のこともある）', () => {
    expect(isValidProxySecret(undefined)).toBe(true);
  });

  it('空文字も文字列なので許す', () => {
    expect(isValidProxySecret('')).toBe(true);
  });

  it('上限ちょうどは許し、1 文字超えると断る', () => {
    expect(isValidProxySecret('x'.repeat(MAX_PROXY_SECRET_CHARS))).toBe(true);
    expect(isValidProxySecret('x'.repeat(MAX_PROXY_SECRET_CHARS + 1))).toBe(false);
  });

  it('文字列でない値は断る（null は undefined と同じに扱わない）', () => {
    for (const v of [null, 42, {}, [], true]) {
      expect(isValidProxySecret(v), String(v)).toBe(false);
    }
  });
});

describe('上限の値そのもの', () => {
  it('決め打ちの値である（変えると保存済み設定の可否が変わる）', () => {
    expect(MAX_PROXY_URL_CHARS).toBe(1024);
    expect(MAX_PROXY_SECRET_CHARS).toBe(256);
  });
});

describe('reviewStoredProxyConfig — 保存済みの値を読むとき', () => {
  it('未設定 (null / undefined) は理由なしで null', () => {
    for (const v of [null, undefined]) {
      const r = reviewStoredProxyConfig(v);
      expect(r.config, String(v)).toBeNull();
      expect(r.rejected, String(v)).toBeNull();
    }
  });

  it('妥当な設定はそのまま通り、URL は正規化される', () => {
    const r = reviewStoredProxyConfig({ url: '  HTTPS://W.EXAMPLE.COM/P  ' });
    expect(r.config).toEqual({ url: 'https://w.example.com/P' });
    expect(r.rejected).toBeNull();
  });

  it('共有秘密は保持する', () => {
    const r = reviewStoredProxyConfig({ url: 'https://w.example.com/p', sharedSecret: 'shh' });
    expect(r.config).toEqual({ url: 'https://w.example.com/p', sharedSecret: 'shh' });
  });

  it('共有秘密が無いときは持たせない', () => {
    const r = reviewStoredProxyConfig({ url: 'https://w.example.com/p' });
    expect(r.config).toEqual({ url: 'https://w.example.com/p' });
    expect(Object.hasOwn(r.config ?? {}, 'sharedSecret')).toBe(false);
  });

  it('URL が規則に反していれば、その理由を付けて弾く', () => {
    for (const [url, reason] of [
      ['http://evil.example.com/', 'insecure-remote'],
      ['https://u:p@w.example.com/', 'has-userinfo'],
      ['javascript:alert(1)', 'not-http'],
      ['https://w.example.com/#f', 'has-fragment'],
      ['', 'empty'],
    ] as const) {
      const r = reviewStoredProxyConfig({ url });
      expect(r.config, url).toBeNull();
      expect(r.rejected, url).toBe(reason);
    }
  });

  it('URL 以外の形が入っていても落ちない', () => {
    for (const v of [{}, { url: 42 }, { url: null }, 'nonsense', 7, true, []]) {
      const r = reviewStoredProxyConfig(v);
      expect(r.config, JSON.stringify(v)).toBeNull();
      expect(r.rejected, JSON.stringify(v)).toBe('not-a-url');
    }
  });

  it('共有秘密が長すぎるときは、URL ではなく秘密の理由を返す', () => {
    const r = reviewStoredProxyConfig({
      url: 'https://w.example.com/p',
      sharedSecret: 'x'.repeat(MAX_PROXY_SECRET_CHARS + 1),
    });
    expect(r.config).toBeNull();
    expect(r.rejected).toBe('secret-too-long');
  });

  it('共有秘密が文字列でないときも弾く', () => {
    const r = reviewStoredProxyConfig({ url: 'https://w.example.com/p', sharedSecret: 42 });
    expect(r.config).toBeNull();
    expect(r.rejected).toBe('secret-too-long');
  });

  it('上限ちょうどの共有秘密は通す', () => {
    const secret = 'x'.repeat(MAX_PROXY_SECRET_CHARS);
    const r = reviewStoredProxyConfig({ url: 'https://w.example.com/p', sharedSecret: secret });
    expect(r.config).toEqual({ url: 'https://w.example.com/p', sharedSecret: secret });
  });

  // URL が駄目で秘密も駄目なときは URL の理由が先に出る（先に見るため）。
  it('URL と秘密の両方が駄目なら URL の理由が出る', () => {
    const r = reviewStoredProxyConfig({
      url: 'http://evil.example.com/',
      sharedSecret: 'x'.repeat(MAX_PROXY_SECRET_CHARS + 1),
    });
    expect(r.rejected).toBe('insecure-remote');
  });
});
