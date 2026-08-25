import { describe, expect, it } from 'vitest';
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
