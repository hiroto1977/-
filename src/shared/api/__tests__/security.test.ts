import { describe, expect, it, vi } from 'vitest';
import {
  HIBP_API,
  HIBP_NO_BREACH_STATUS,
  VIRUSTOTAL_API,
  checkBreachEmail,
  checkEmailBreachRequest,
  checkScanUrl,
  fetchVtReportRequest,
  hibpBreachedAccountPath,
  parseSecurityKeys,
  submitVtUrlRequest,
  summarizeVtReport,
  vtReportPath,
  vtUrlId,
} from '../security';
import { BREACH_EMAIL_MESSAGES, SCAN_URL_MESSAGES } from '../../scanTarget';

/*
 * **Security の書き込み 2 経路の共有部分** (2026-09-19 · パス 321)。
 *
 * `parseSecurityKeys` の標本は `dualBuildParity.test.ts` が両ビルドの写しに当てていた物
 * (写しは 1 つになったので、ここで実装そのものに当てる)。
 */

describe('parseSecurityKeys', () => {
  it.each([
    ['', {}],
    ['raw-key', { hibp: 'raw-key' }],
    ['{"hibp":"h","vt":"v"}', { hibp: 'h', vt: 'v' }],
    ['{"hibp":"h"}', { hibp: 'h' }],
    ['{"vt":"v"}', { vt: 'v' }],
    ['{}', {}],
    ['{"hibp":""}', {}],
    ['{"hibp":42,"vt":true}', {}],
    ['null', {}],
    ['[]', {}],
    ['"str"', {}],
    ['{bad json', { hibp: '{bad json' }],
  ] as const)('%s → %j', (raw, expected) => {
    expect(parseSecurityKeys(raw)).toEqual(expected);
  });
});

describe('HIBP', () => {
  it('email は shared の述語で断る (空白だけ / 文字列でない)', () => {
    expect(() => checkBreachEmail({ email: '   ' })).toThrow(BREACH_EMAIL_MESSAGES.empty);
    expect(() => checkBreachEmail({})).toThrow(BREACH_EMAIL_MESSAGES.empty);
    expect(checkBreachEmail({ email: ' a+b@c.example ' })).toBe('a+b@c.example');
  });

  it('URL は符号化した email と truncateResponse=false を持つ', () => {
    expect(hibpBreachedAccountPath('a+b@c.example')).toBe('/breachedaccount/a%2Bb%40c.example?truncateResponse=false');
  });

  it('要求: GET・hibp-api-key・呼び手の User-Agent・Accept', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('', { status: HIBP_NO_BREACH_STATUS }));
    const res = await checkEmailBreachRequest('a@b.example', 'k', 'ua-x', transport);
    expect(res.status).toBe(404);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe(`${HIBP_API}/breachedaccount/a%40b.example?truncateResponse=false`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ 'hibp-api-key': 'k', 'User-Agent': 'ua-x', Accept: 'application/json' });
  });
});

describe('VirusTotal', () => {
  it('URL は shared の述語で断る (http/https のみ・必須)', () => {
    expect(() => checkScanUrl({})).toThrow(SCAN_URL_MESSAGES.empty);
    expect(() => checkScanUrl({ url: 'ftp://x/' })).toThrow(SCAN_URL_MESSAGES['not-web']);
    expect(checkScanUrl({ url: ' https://evil.test/ ' })).toBe('https://evil.test/');
  });

  it('id は base64url(url) でパディング無し (Buffer を証人に)', () => {
    for (const url of ['https://example.com/', 'https://a/a>a', 'https://a/a?a']) {
      expect(vtUrlId(url)).toBe(Buffer.from(url, 'utf8').toString('base64url'));
      expect(vtUrlId(url)).not.toMatch(/[+/=]/);
    }
    expect(vtReportPath('https://example.com/')).toBe('/urls/aHR0cHM6Ly9leGFtcGxlLmNvbS8');
  });

  it('要求: 投入は POST form-urlencoded、レポートは GET。どちらも x-apikey', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await submitVtUrlRequest('https://example.com/', 'vt', transport);
    await fetchVtReportRequest('https://example.com/', 'vt', transport);
    const [submitUrl, submitInit] = transport.mock.calls[0]!;
    const [reportUrl, reportInit] = transport.mock.calls[1]!;
    expect(submitUrl).toBe(`${VIRUSTOTAL_API}/urls`);
    expect(submitInit.method).toBe('POST');
    expect(submitInit.headers).toEqual({ 'x-apikey': 'vt', 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(submitInit.body).toBe('url=https%3A%2F%2Fexample.com%2F');
    expect(reportUrl).toBe(`${VIRUSTOTAL_API}/urls/aHR0cHM6Ly9leGFtcGxlLmNvbS8`);
    expect(reportInit.method).toBe('GET');
    expect(reportInit.headers).toEqual({ 'x-apikey': 'vt' });
  });

  it('集計: positives = malicious + suspicious、total は 4 つの和、reportUrl は GUI + id', () => {
    const report = { data: { attributes: { last_analysis_stats: { harmless: 60, malicious: 2, suspicious: 1, undetected: 7 } } } };
    expect(summarizeVtReport('https://example.com/', report)).toEqual({
      url: 'https://example.com/',
      positives: 3,
      total: 70,
      reportUrl: 'https://www.virustotal.com/gui/url/aHR0cHM6Ly9leGFtcGxlLmNvbS8',
    });
  });

  it('★ 欄の欠けたレポートは数えない (NaN の検出数を作らない)', () => {
    expect(() => summarizeVtReport('https://example.com/', { data: { attributes: {} } })).toThrow();
  });
});
