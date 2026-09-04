import { describe, expect, it, vi } from 'vitest';
import { MAX_SCAN_URL_LENGTH, SECRET_PARAM_NAMES, describeScanUrlRisk, validateScanUrl, looksInternalHostname } from '../scanTarget';

describe('validateScanUrl', () => {
  it('http / https を通す', () => {
    expect(validateScanUrl('https://example.com/a')).toEqual({ ok: true, url: 'https://example.com/a' });
    expect(validateScanUrl('http://example.com')).toEqual({ ok: true, url: 'http://example.com' });
  });

  it('前後の空白を落として通す', () => {
    expect(validateScanUrl('  https://example.com  ')).toEqual({ ok: true, url: 'https://example.com' });
  });

  it('空 / 非文字列を断る', () => {
    expect(validateScanUrl('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateScanUrl('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateScanUrl(undefined)).toEqual({ ok: false, reason: 'empty' });
    expect(validateScanUrl(42)).toEqual({ ok: false, reason: 'empty' });
  });

  it('URL として読めないものを断る', () => {
    expect(validateScanUrl('not a url')).toEqual({ ok: false, reason: 'not-a-url' });
  });

  // 送っても意味が無いのに手元の情報を明かすだけの形。
  it('http/https 以外のスキームを断る', () => {
    expect(validateScanUrl('file:///etc/passwd')).toEqual({ ok: false, reason: 'not-web' });
    expect(validateScanUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'not-web' });
    expect(validateScanUrl('ftp://example.com')).toEqual({ ok: false, reason: 'not-web' });
  });

  it('長さの上限で断る (境界も見る)', () => {
    const base = 'https://example.com/';
    const atLimit = base + 'a'.repeat(MAX_SCAN_URL_LENGTH - base.length);
    expect(atLimit).toHaveLength(MAX_SCAN_URL_LENGTH);
    expect(validateScanUrl(atLimit).ok).toBe(true);
    expect(validateScanUrl(atLimit + 'a')).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('describeScanUrlRisk', () => {
  // 警告は出す回数を絞るほど効く。普通の URL では出さない。
  it('普通の URL では何も言わない', () => {
    expect(describeScanUrlRisk('https://example.com/page')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/search?q=cat&page=2')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/#section')).toBeNull();
  });

  it('URL に埋め込まれた利用者名/パスワードを指摘する', () => {
    const msg = describeScanUrlRisk('https://user:pw@example.com/');
    expect(msg).toContain('パスワード');
  });

  // 片方だけでも指摘する。`||` を `&&` にする変異体は、両方揃った例しか
  // 無いと生き残る。
  it('利用者名だけ・パスワードだけでも指摘する', () => {
    expect(describeScanUrlRisk('https://user@example.com/')).toContain('パスワード');
    expect(describeScanUrlRisk('https://:pw@example.com/')).toContain('パスワード');
  });

  it('資格情報らしき名前のクエリを名指しで指摘する', () => {
    const msg = describeScanUrlRisk('https://example.com/d?access_token=abc&page=2');
    expect(msg).toContain('access_token');
    expect(msg).not.toContain('page');
  });

  // OAuth の暗黙フローはフラグメントに載る。クエリだけ見ていると見逃す。
  it('フラグメントに載った資格情報も拾う', () => {
    const msg = describeScanUrlRisk('https://example.com/cb#access_token=abc&state=x');
    expect(msg).toContain('access_token');
  });

  it('署名付きリンクの sig / signature を拾う', () => {
    expect(describeScanUrlRisk('https://cdn.example.com/f.zip?sig=abc')).toContain('sig');
    expect(describeScanUrlRisk('https://cdn.example.com/f.zip?Signature=abc')).toContain('Signature');
  });

  it('複数見つかったら区切って並べる', () => {
    const msg = describeScanUrlRisk('https://example.com/?access_token=a&signature=b') ?? '';
    expect(msg).toContain('access_token / signature');
  });

  it('同じ名前を重ねて挙げない', () => {
    const msg = describeScanUrlRisk('https://example.com/?token=a&token=b') ?? '';
    expect(msg.match(/token/g)).toHaveLength(1);
  });

  it('検証を通らない入力では何も言わない (先に検証側が断る)', () => {
    expect(describeScanUrlRisk('not a url')).toBeNull();
    expect(describeScanUrlRisk('')).toBeNull();
  });
});

describe('資格情報らしき名前の一覧', () => {
  // 一覧そのものが挙動なので、1 件ずつ固定する。**名前は実装から読まず
  // 直書きする** — 実装の配列を回して確かめると、名前を書き換える変異と
  // 期待値が一緒に動いてしまい、何も確かめていないことになる。
  const NAMES = [
    'token', 'access_token', 'id_token', 'refresh_token',
    'key', 'api_key', 'apikey',
    'secret', 'password', 'passwd', 'pwd',
    'auth', 'authorization',
    'session', 'sessionid',
    'sig', 'signature', 'code', 'credential',
  ];

  it.each(NAMES)('%s を資格情報として拾う', (name) => {
    expect(describeScanUrlRisk(`https://example.com/?${name}=x`)).toContain(name);
  });

  it.each(NAMES)('%s は大文字小文字を問わず拾う', (name) => {
    expect(describeScanUrlRisk(`https://example.com/?${name.toUpperCase()}=x`)).not.toBeNull();
  });

  // 名前を足したらテストも足す。数が合わなくなった時点で気付けるようにする。
  it('一覧に載っている名前をすべて検査している', () => {
    expect([...SECRET_PARAM_NAMES].sort()).toEqual([...NAMES].sort());
  });

  it('似ているが別物の名前は拾わない (警告を薄めない)', () => {
    expect(describeScanUrlRisk('https://example.com/?tokens=x')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/?keyword=x')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/?author=x')).toBeNull();
  });
});

/*
 * **冒頭が挙げる 4 つ目の危険 —— 社内ホスト名。**
 *
 * このファイルの注記は、VT へ送ると第三者の目に触れるものとして
 * 「署名付きリンク・招待リンク・セッション識別子・社内ホスト名」を挙げている。
 * ところが実装が見ていたのは前 3 つだけで、**4 つ目だけが無かった**
 * (2026-08-25 の実測で判明。9 形すべてが無警告だった)。
 *
 * 境界を必ず両側から留める —— 172.16/12 と 100.64/10 は「範囲の外は
 * 公開アドレス」なので、片側だけ書くと網が広がりすぎたことに気付けない。
 */
describe('社内・手元のホストは、送る前に伝える', () => {
  it.each([
    ['予約 TLD (.corp)', 'https://intranet.acme.corp/finance'],
    ['予約 TLD (.internal)', 'https://jenkins.internal/job/deploy-prod'],
    ['予約 TLD (.local)', 'https://wiki.corp.local/hr'],
    ['単一ラベル', 'https://buildserver/artifacts'],
    ['localhost', 'https://localhost/x'],
    ['10/8', 'https://10.0.0.7/wiki/salaries'],
    ['192.168/16', 'https://192.168.10.5/admin'],
    ['172.16/12 の下端', 'https://172.16.0.1/'],
    ['172.16/12 の上端', 'https://172.31.255.254/'],
    ['127/8', 'https://127.0.0.1:8080/debug'],
    ['CGNAT の下端', 'https://100.64.0.1/'],
    ['CGNAT の上端', 'https://100.127.255.254/'],
    ['IPv6 ループバック', 'https://[::1]/x'],
    ['IPv6 リンクローカル', 'https://[fe80::1]/x'],
    ['IPv6 ULA', 'https://[fd00::5]/x'],
    // **クラウドのメタデータ。** 送ると「資格情報の口を触っている」こと自体が残る。
    ['リンクローカル (クラウドのメタデータ)', 'https://169.254.169.254/latest/meta-data/iam/security-credentials/'],
  ])('%s は警告が出る (%j)', (_label, url) => {
    expect(describeScanUrlRisk(url)).toMatch(/社内・手元のホスト/);
  });

  /** 網が広がりすぎていないこと。**範囲のすぐ外**を必ず置く。 */
  it.each([
    ['普通の公開サイト', 'https://example.com/normal'],
    ['公開サイト (日本語ドメイン)', 'https://xn--eckwd4c7c.jp/'],
    ['172.16/12 の 1 つ下', 'https://172.15.255.254/'],
    ['172.16/12 の 1 つ上', 'https://172.32.0.1/'],
    ['10/8 の 1 つ上', 'https://11.0.0.1/'],
    ['CGNAT の 1 つ下', 'https://100.63.255.254/'],
    ['CGNAT の 1 つ上', 'https://100.128.0.1/'],
    ['文書用アドレス (TEST-NET-3)', 'https://198.51.100.7/'],
    // 169.254/16 だけがリンクローカル。169/8 全体を社内扱いすると、ここが鳴る。
    ['169/8 のリンクローカル外', 'https://169.1.2.3/'],
    ['169.254 の 1 つ下', 'https://169.253.255.254/'],
    ['169.254 の 1 つ上', 'https://169.255.0.1/'],
    // 192.168/16 だけが私用。192/8 全体を社内扱いすると、ここが鳴る。
    ['192.168 の 1 つ外', 'https://192.169.0.1/'],
    ['192.167 側', 'https://192.167.255.254/'],
  ])('%s は警告を出さない (%j)', (_label, url) => {
    expect(describeScanUrlRisk(url)).toBeNull();
  });

  /*
   * 資格情報の警告のほうが差し迫っているので、両方当たる URL では
   * そちらを出す。**順序そのものを留める** —— 入れ替えると、
   * 社内ホストの文言に隠れて資格情報の警告が消える。
   */
  it('資格情報と社内ホストが両方当たるなら、資格情報のほうを出す', () => {
    const both = 'https://jenkins.internal/job?token=abc';
    expect(describeScanUrlRisk(both)).toMatch(/資格情報らしき値/);
  });

  it('末尾ドットでも社内と分かる (FQDN 形)', () => {
    expect(looksInternalHostname('buildserver.')).toBe(true);
    expect(looksInternalHostname('wiki.corp.local.')).toBe(true);
  });

  it('大文字でも判定できる', () => {
    expect(looksInternalHostname('JENKINS.INTERNAL')).toBe(true);
    expect(looksInternalHostname('EXAMPLE.COM')).toBe(false);
  });

  it('空のホスト名は社内扱いしない (判定の空撃ちを避ける)', () => {
    expect(looksInternalHostname('')).toBe(false);
  });
});

/**
 * **VirusTotal は「調べる」ではなく「公開する」に近い。** だからここの
 * 判定が緩むと、署名付きリンクや社内ホスト名が警告なしで第三者の目に触れる。
 * 取り消せない。
 *
 * 変異検査で 43 件が生存していた (80.28%、2026-08-30 実測)。内訳は
 * **`SECRET_PARAM_NAMES` の static 変異 20 件**と、**IPv6 判定の
 * 部分式 17 件**が中心だった。
 */
describe('scanTarget — 生存していた変異を塞ぐ', () => {
  /**
   * `SECRET_PARAM_NAMES` はモジュール直下の配列なので、**読み込み時に
   * 1 度だけ評価される**。上の「一覧に載っている名前をすべて検査している」は
   * 字面で突き合わせているのに、**静的 import では変異が届いていなかった**
   * (20 件すべて生存)。読み直す。
   *
   * 1 語でも空文字に潰れれば、その名前を持つ URL は**警告なしで投入される**。
   */
  it('★ 秘密のパラメータ名を、読み直して字面で留める', async () => {
    vi.resetModules();
    const m = await import('../scanTarget');
    expect([...m.SECRET_PARAM_NAMES]).toEqual([
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
    ]);
  });

  /*
   * **IPv6 の中身。** 既存は `[::1]` と `[fe80::1]` を見ていたが、
   * 未指定アドレス `[::]` と ULA (fc00::/7) が抜けていた。
   */
  it.each([
    ['未指定アドレス', '[::]'],
    ['ループバック', '[::1]'],
    ['ULA (fc00::/7) の fc 側', '[fc00::1]'],
    ['ULA (fc00::/7) の fd 側', '[fd12::1]'],
    ['リンクローカル fe80', '[fe80::1]'],
    ['リンクローカル feb0', '[feb0::1]'],
  ])('★ IPv6 の内部アドレスは社内扱い: %s', (_label, host) => {
    expect(looksInternalHostname(host)).toBe(true);
  });

  /*
   * **対照。** 上は「社内と判定すること」しか見ないので、実装が何でも
   * 社内にしても気付けない。公開の IPv6 が通ることを見る。
   */
  it.each([
    ['文書用 2001:db8::/32', '[2001:db8::1]'],
    ['Cloudflare DNS', '[2606:4700::1111]'],
    ['Google DNS', '[2001:4860:4860::8888]'],
  ])('★ 公開の IPv6 は社内扱いしない (対照): %s', (_label, host) => {
    expect(looksInternalHostname(host)).toBe(false);
  });

  /*
   * **角括弧は両方揃って初めて IPv6 とみなす。**
   *
   * `startsWith('[')` / `endsWith(']')` / それを繋ぐ `&&` への変異が
   * 7 件生き残っていた。片方だけの括弧を持つ入力でしか差が出ないため、
   * 標本もその形になる —— `looksInternalHostname` は URL を経由しない
   * 純粋な述語で、任意の文字列を受ける。
   *
   * 片括弧の文字列は IPv6 ではないので、**単一ラベル**として社内扱いに
   * 落ちるのが正しい (社内のホスト名は単一ラベルであることが多い)。
   * 括弧の判定が緩むと、これが IPv6 として解釈されて**警告が消える**。
   */
  it('★ 片方だけの角括弧は IPv6 として扱わない', () => {
    expect(looksInternalHostname('foo]'), '閉じだけ').toBe(true);
    expect(looksInternalHostname('[foo'), '開きだけ').toBe(true);
  });

  /*
   * **範囲判定は第 1 オクテットも見ている。**
   *
   * 既存の検査は範囲の中 (`10.0.0.7` / `192.168.10.5` …) を見ているので
   * 「第 2 オクテットが効いている」ことは言えるが、**「第 1 も要る」ことは
   * 言えなかった** —— `a === 192` を `true` に潰す変異が 5 件生き残っていた。
   * 第 2 だけを合わせ、**第 1 を変えた**標本を置く (`proxy.ts` で同じ形を
   * 直したのと同じ)。
   *
   * 効き方は**警告が広がる**側で、この関数の方針 (冒頭: 止めない・広げても
   * 危険は増えない) からすれば安全側ではある。ただし「余計な警告」は
   * 警告そのものを薄めるので、精度は測っておく。
   */
  it.each([
    ['192.168 の第 1 を変える', '1.168.0.1'],
    ['172.16-31 の第 1 を変える', '1.20.0.1'],
    ['169.254 の第 1 を変える', '1.254.0.1'],
    ['100.64-127 の第 1 を変える', '1.100.0.1'],
  ])('★ 第 1 オクテットが違えば社内扱いしない: %s', (_label, host) => {
    expect(looksInternalHostname(host)).toBe(false);
  });

  it('★ 0.0.0.0/8 は社内扱いする', () => {
    expect(looksInternalHostname('0.1.2.3')).toBe(true);
  });

  /*
   * **IPv4 の字面は両端が錨で留まっている。** 錨が外れると、ホスト名の
   * 一部にたまたま 4 組が含まれるだけで IPv4 と解釈され、その範囲判定に
   * 落ちる。どちらも実在しうる形である。
   */
  it('★ ホスト名の一部が 4 組でも IPv4 とは見なさない (前後の錨)', () => {
    expect(looksInternalHostname('evil10.0.0.7'), '前が余っている').toBe(false);
    // 末尾は**予約 TLD でない**ものを選ぶ。`.example` は予約側なので、
    // そちらの規則で社内扱いになり、錨の検査にならない (最初それで外した)。
    expect(looksInternalHostname('10.0.0.7.evil.com'), '後ろが余っている').toBe(false);
    // 対照: 正しい 4 組は従来どおり
    expect(looksInternalHostname('10.0.0.7')).toBe(true);
    expect(looksInternalHostname('8.8.8.8')).toBe(false);
  });

  /*
   * IPv6 側の錨も同じ。`fc00:` / `fe80:` は**先頭に在るときだけ**内部である。
   * 公開アドレスがたまたまその並びを含むことはある。
   */
  it('★ IPv6 は先頭の錨が効いている', () => {
    expect(looksInternalHostname('[2001:fc00::1]'), 'fc00 が途中').toBe(false);
    expect(looksInternalHostname('[2001:fe80::1]'), 'fe80 が途中').toBe(false);
  });

  /*
   * リンクローカルの 4 文字目は**省略できる** (`fe8:` の形)。
   * `?` が消えると `fe8::1` を取りこぼす。
   */
  it('★ fe8: のように 4 文字目が無い形も拾う', () => {
    expect(looksInternalHostname('[fe8::1]')).toBe(true);
  });

  /*
   * **予約 TLD は末尾でだけ効く。** 錨が外れると、途中に `.local` を含む
   * 公開ホスト名まで社内扱いになる。
   */
  it('★ 予約 TLD は末尾の錨が効いている', () => {
    expect(looksInternalHostname('wiki.corp.local'), '末尾なら社内').toBe(true);
    expect(looksInternalHostname('local.example.com'), '先頭は別物').toBe(false);
    expect(looksInternalHostname('a.internal.example.com'), '途中は別物').toBe(false);
  });
});
