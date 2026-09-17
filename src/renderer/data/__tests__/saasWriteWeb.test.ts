import { describe, expect, it, vi } from 'vitest';
import {
  createGithubIssue,
  createNotionPage,
  sendSlackMessage,
  createAtlassianIssue,
  parseAtlassianToken,
  createCalendarEvent,
  createGmailDraft,
  createDriveFolder,
  createWordPressPostDraft,
  createCanvaFolder,
  createCloudflareDnsRecord,
  purgeCloudflareCache,
  buildRfc2822,
  isSafeHeaderValue,
  scanUrlVirusTotal,
  parseSecurityKeys,
  checkEmailBreach,
  createMicrosoftEvent,
  sendMicrosoftMail,
  type Transport,
} from '../saasWriteWeb';
import {
  MAX_ATLASSIAN_EMAIL,
  MAX_ATLASSIAN_SITE,
  MAX_ATLASSIAN_TOKEN,
} from '../../../shared/atlassianSite';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** init.headers を素の Record として取り出すヘルパ (リクエスト形 golden 照合用)。 */
function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

/** init.body (JSON 文字列) を parse するヘルパ。 */
function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

describe('createGithubIssue', () => {
  it('POSTs to the issues endpoint with the exact headers and body shape', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 7, html_url: 'https://github.com/o/r/issues/7', title: 'Bug' }),
    );
    const res = await createGithubIssue({ owner: 'o', repo: 'r', title: 'Bug', body: 'desc' }, 'ghp_x', fetchFn);
    expect(res).toEqual({ number: 7, url: 'https://github.com/o/r/issues/7', title: 'Bug' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect(init!.method).toBe('POST');
    // 全ヘッダを golden 照合 (StringLiteral 変異を一括 kill)。
    expect(headersOf(init)).toEqual({
      Authorization: 'Bearer ghp_x',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    });
    expect(bodyOf(init)).toEqual({ title: 'Bug', body: 'desc', labels: undefined });
  });

  it('trims inputs and url-encodes owner/repo', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 1, html_url: 'u', title: 't' }),
    );
    await createGithubIssue({ owner: ' a/b ', repo: ' c ', title: ' t ' }, 'tok', fetchFn);
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.github.com/repos/a%2Fb/c/issues');
    // trim が効いている (title は trim 後の 't')。
    expect(bodyOf(fetchFn.mock.calls[0]![1]).title).toBe('t');
  });

  it('rejects missing required fields without calling fetch (exact message)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(createGithubIssue({ owner: 'o', repo: 'r' }, 'tok', fetchFn)).rejects.toThrow(
      'title は必須です',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires every one of owner / repo / title (each alone is insufficient)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    // それぞれ1項目だけ欠けても必ず弾く (|| を && に変えると素通りするケースを検出)。
    await expect(createGithubIssue({ owner: 'o', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // repo 欠落
    await expect(createGithubIssue({ repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // owner 欠落
    await expect(createGithubIssue({ owner: 'o', repo: 'r' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // title 欠落
    await expect(createGithubIssue({ owner: '   ', repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // 空白のみ owner
    await expect(createGithubIssue({ owner: 'o', repo: '   ', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // 空白のみ repo
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: '   ' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // 空白のみ title
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects non-string required fields (typeof guard)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    // 文字列でない物は「必須」ではなく型の問題として断る (共有の台帳 — パス 110)。
    await expect(createGithubIssue({ owner: 123, repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/owner は文字列で/);
    await expect(createGithubIssue({ owner: 'o', repo: {}, title: 't' }, 'tok', fetchFn)).rejects.toThrow(/repo は文字列で/);
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: 5 }, 'tok', fetchFn)).rejects.toThrow(/title は文字列で/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a non-string body instead of dropping it (本文の無い issue を黙って立てない)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    // 2026-09-09 まで `body: 99` は undefined に落とされ、本文の無い issue が立っていた
    // (利用者は本文つきで立てたと思う)。壊れた入力は送らずに断る (パス 110)。
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: 't', body: 99 }, 'tok', fetchFn)).rejects.toThrow(
      /body は文字列で/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('surfaces API errors with status and body excerpt', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(422, { message: 'Validation Failed' }));
    await expect(
      createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn),
    ).rejects.toThrow(/GitHub API 422/);
  });

  it('refuses non-string or non-array labels; absent labels are simply omitted', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { number: 1, html_url: 'u', title: 't' }));
    // 2026-09-09 まで `['bug', 3, 'ui']` は 3 を黙って間引いて送っていた (パス 110 で断る)。
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: 't', labels: ['bug', 3, 'ui'] }, 'tok', fetchFn)).rejects.toThrow(
      /labels は文字列で/,
    );
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: 't', labels: 'notarray' }, 'tok', fetchFn)).rejects.toThrow(
      /labels は文字列で/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
    // 対照: 無ければ送らない欄として省かれ、在れば通る。
    await createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn);
    expect('labels' in bodyOf(fetchFn.mock.calls[0]![1])).toBe(false);
    await createGithubIssue({ owner: 'o', repo: 'r', title: 't', labels: ['bug', 'ui'] }, 'tok', fetchFn);
    expect(bodyOf(fetchFn.mock.calls[1]![1]).labels).toEqual(['bug', 'ui']);
  });
});

describe('2xx で JSON でない本文 (パス 311)', () => {
  // 実物の Response を使う —— `res.json()` が V8 の SyntaxError (本文の先頭 10 字を引用) を投げる形を写す。
  const TOKEN_BODY = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789 が先頭に在る本文';
  const textResponse = (status: number, text: string): Response => new Response(text, { status });

  it('標本: 実物の res.json() は本文の先頭 10 字を引用する', async () => {
    await expect(textResponse(200, TOKEN_BODY).json()).rejects.toThrow(/ghp_abcdef/);
  });

  it('★ Notion: 文面は定数で、本文の 1 字も画面へ運ばない', async () => {
    const transport = vi.fn().mockResolvedValue(textResponse(200, TOKEN_BODY));
    let msg = '';
    try {
      await createNotionPage({ parentPageId: 'par', title: 'T', body: 'hi' }, 'secret', transport);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toBe('Notion API の応答が JSON ではありません (処理したことを確認できません)');
    expect(msg).not.toContain('ghp_');
  });

  it('★ Slack: 同じ 1 文 (規則は shared/apiResponse.ts の 1 つ)', async () => {
    const transport = vi.fn().mockResolvedValue(textResponse(200, '<!DOCTYPE html><html>502</html>'));
    let msg = '';
    try {
      await sendSlackMessage({ channel: 'C1', text: 'hi' }, 'xoxb-1', transport);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toBe('Slack API の応答が JSON ではありません (処理したことを確認できません)');
    expect(msg).not.toContain('DOCTYPE');
  });
});

describe('createNotionPage', () => {
  it('POSTs the exact endpoint/headers/body and maps the result', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p1', url: 'https://notion.so/p1' }));
    const res = await createNotionPage({ parentPageId: 'par', title: 'T', body: 'hi' }, 'secret', transport);
    expect(res).toEqual({ id: 'p1', url: 'https://notion.so/p1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({
      Authorization: 'Bearer secret',
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    });
    // body 全体を golden 照合 (children の入れ子 ObjectLiteral/StringLiteral を一括 kill)。
    expect(bodyOf(init)).toEqual({
      parent: { page_id: 'par' },
      properties: { title: { title: [{ text: { content: 'T' } }] } },
      children: [
        { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'hi' } }] } },
      ],
    });
  });
  it('omits children (empty array) when no body; refuses a non-string body instead of dropping it (パス 111)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p', url: 'u' }));
    await createNotionPage({ parentPageId: 'par', title: 'T' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1]).children).toEqual([]);
    // 2026-09-09 まで `body: 42` は undefined に落とされ、本文の無いページが出来ていた。
    await expect(createNotionPage({ parentPageId: 'par', title: 'T', body: 42 }, 'tok', transport)).rejects.toThrow(/body は文字列で/);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('requires parentPageId and title (each alone is insufficient)', async () => {
    const transport = vi.fn();
    await expect(createNotionPage({ title: 'T' }, 'tok', transport)).rejects.toThrow('parentPageId は必須です');
    await expect(createNotionPage({ parentPageId: 'p' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createNotionPage({ parentPageId: '  ', title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createNotionPage({ parentPageId: 'p', title: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createNotionPage({ parentPageId: 1, title: 'T' }, 'tok', transport)).rejects.toThrow(/parentPageId は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'unauthorized' }));
    await expect(createNotionPage({ parentPageId: 'p', title: 'T' }, 'tok', transport)).rejects.toThrow(/Notion API 401/);
  });
});

describe('sendSlackMessage', () => {
  it('POSTs the exact endpoint/headers/body and returns ts/channel', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, ts: '1.2', channel: 'C1' }));
    const res = await sendSlackMessage({ channel: '#general', text: 'hello' }, 'xoxb', transport);
    expect(res).toEqual({ ts: '1.2', channel: 'C1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({
      Authorization: 'Bearer xoxb',
      'Content-Type': 'application/json; charset=utf-8',
    });
    expect(bodyOf(init)).toEqual({ channel: '#general', text: 'hello' });
  });
  it('throws when Slack returns ok:false even on HTTP 200 (exact error)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: false, error: 'channel_not_found' }));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow('Slack: channel_not_found');
  });
  it('falls back to a generic error string when ok:false without error field', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: false }));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow('Slack: unknown_error');
  });
  it('returns ts and falls back channel to the (trimmed) input when absent; text kept verbatim', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, ts: '1.2' }));
    const r = await sendSlackMessage({ channel: '  C  ', text: '  spaced  ' }, 'tok', transport);
    expect(r).toEqual({ ts: '1.2', channel: 'C' });
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ channel: 'C', text: '  spaced  ' });
  });
  it('★ ts が無ければ断る (パス 261 — 空に倒すと「送れたが、どこへ送れたか言えない」になる)', async () => {
    // 直す前は `ts: ''` を返していた。`ts` は送った本文を指す識別子なので、
    // 空で成功と言うのは `.../browse/undefined` を渡すのと同じ形である。
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, channel: 'C9' }));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow(
      'Slack API の応答に ts (非空の文字列) がありません',
    );
  });
  it('requires channel and text (each alone is insufficient)', async () => {
    const transport = vi.fn();
    await expect(sendSlackMessage({ channel: 'C' }, 'tok', transport)).rejects.toThrow('text は必須です');
    await expect(sendSlackMessage({ text: 't' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(sendSlackMessage({ channel: '  ', text: 't' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(sendSlackMessage({ channel: 'C', text: '' }, 'tok', transport)).rejects.toThrow(/必須/);
    // 文字列でない物は「必須」ではなく型の問題として断る (共有の台帳 — パス 110)。
    await expect(sendSlackMessage({ channel: 5, text: 't' }, 'tok', transport)).rejects.toThrow(/channel は文字列で/);
    await expect(sendSlackMessage({ channel: 'C', text: 5 }, 'tok', transport)).rejects.toThrow(/text は文字列で/);
    await expect(sendSlackMessage({ channel: 'C', text: {} }, 'tok', transport)).rejects.toThrow(/text は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces HTTP errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow(/Slack API 500/);
  });
});

const TOK = JSON.stringify({ email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net/' });

describe('parseAtlassianToken — 送り先ホストの許可 (資格情報の流出経路)', () => {
  // ここは `Authorization: Basic btoa(email:token)` を付けて
  // `${site}/rest/api/3/issue` へ POST する。ホスト名を絞らないと、
  // site を差し替えるだけで Atlassian のメールアドレスと API トークンが
  // 任意の相手へ届く。main の同じ関数は最初からこの検査を持っていて、
  // 理由まで書いてあった — 3 つ目の写しであるここだけが持っていなかった。
  it.each([
    'https://attacker.example',
    'https://atlassian.net.evil.example',
    'https://acme.atlassian.net.evil.example',
    'https://notatlassian.net',
    'https://atlassian.net',
  ])('%s を拒否する', (site) => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site }))).toThrow(
      /atlassian\.net/,
    );
  });

  // ネガティブコントロール: 「全部拒否」ではないこと。
  it.each([
    'https://acme.atlassian.net',
    'https://acme.atlassian.net/',
    'https://a-b-c.atlassian.net',
  ])('%s は通す', (site) => {
    expect(parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site })).site).toBe(
      'https://' + new URL(site).hostname,
    );
  });

  // main / shared と同じ正規化になったことも見る (パス・クエリ・ポート・
  // userinfo を落として hostname から組み直す)。
  it.each([
    ['https://acme.atlassian.net/wiki', 'https://acme.atlassian.net'],
    ['https://acme.atlassian.net?q=1', 'https://acme.atlassian.net'],
    ['https://acme.atlassian.net:8443', 'https://acme.atlassian.net'],
    ['https://evil.com@acme.atlassian.net', 'https://acme.atlassian.net'],
  ])('%s を %s に正規化する', (site, expected) => {
    expect(parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site })).site).toBe(expected);
  });
});

describe('parseAtlassianToken', () => {
  it('parses and trims the site trailing slash', () => {
    expect(parseAtlassianToken(TOK)).toEqual({ email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net' });
  });
  it('rejects non-JSON / missing fields / non-https (exact messages)', () => {
    expect(() => parseAtlassianToken('nope')).toThrow(
      'Atlassian トークンは { "email", "token", "site" } 形式の JSON で保存してください',
    );
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a' }))).toThrow(
      'Atlassian トークンの email / token / site が欠けているか不正です',
    );
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'http://x' }))).toThrow(
      'Atlassian の site は https のみ対応',
    );
  });
  it('rejects an invalid (unparseable) site URL', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'not a url' }))).toThrow(
      'Atlassian の site は https URL で指定してください',
    );
  });
  it('rejects each missing/empty/over-long/non-string field individually', () => {
    const ok = { email: 'a@b', token: 't', site: 'https://x.atlassian.net' };
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, email: '' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, email: 5 }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, token: '' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, token: 9 }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, site: '' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, site: 7 }))).toThrow(/欠けている|不正/);
    // ちょうど上限 (254) は許容、超過 (255) は拒否 (境界)。
    const at254 = 'a'.repeat(252) + '@b'; // length 254
    // 254 は台帳の値。ここに数字を写しているので、台帳と一致することを先に言う。
    expect(MAX_ATLASSIAN_EMAIL).toBe(254);
    expect(at254.length).toBe(MAX_ATLASSIAN_EMAIL);
    expect(parseAtlassianToken(JSON.stringify({ ...ok, email: at254 })).email).toBe(at254);
    const at255 = 'a'.repeat(253) + '@b';
    expect(at255.length).toBe(255);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, email: at255 }))).toThrow(/欠けている|不正/);
  });

  /**
   * ★ この上の検査の名前は「over-long」と言うが、**測っていたのは email だけ**だった
   * (2026-09-14 · パス 248)。token と site には天井が**無かった**ので測る物が無く、
   * main (`clients/atlassian.ts`) はどちらも持っていて理由まで書いていた ——
   * 「Length caps prevent multi-MB strings from OOMing the basicAuth Buffer allocation」。
   * こちらも同じ `btoa(email:token)` を通す。天井は `shared/atlassianSite.ts` に 1 つ。
   */
  it('★ token と site にも天井が在り、境界で切り替わる (main と同じ値)', () => {
    const ok = { email: 'a@b', token: 't', site: 'https://x.atlassian.net' };

    const tokenAtCap = 'k'.repeat(MAX_ATLASSIAN_TOKEN);
    expect(parseAtlassianToken(JSON.stringify({ ...ok, token: tokenAtCap })).token).toBe(tokenAtCap);
    const tokenOver = 'k'.repeat(MAX_ATLASSIAN_TOKEN + 1);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, token: tokenOver }))).toThrow(/欠けている|不正/);

    // site はホスト名から組み直されるので、天井ちょうどでも通ることを実際の綴りで確かめる。
    const host = 'h'.repeat(MAX_ATLASSIAN_SITE - 'https://'.length - '.atlassian.net'.length);
    const siteAtCap = `https://${host}.atlassian.net`;
    expect(siteAtCap.length).toBe(MAX_ATLASSIAN_SITE);
    expect(parseAtlassianToken(JSON.stringify({ ...ok, site: siteAtCap })).site).toBe(siteAtCap);
    const siteOver = `https://${host}x.atlassian.net`;
    expect(siteOver.length).toBe(MAX_ATLASSIAN_SITE + 1);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, site: siteOver }))).toThrow(/欠けている|不正/);
  });
  it('rejects control chars in email or token (exact message)', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b\n', token: 't', site: 'https://x.atlassian.net' }))).toThrow(
      'Atlassian の email / token に制御文字を含めることはできません',
    );
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b\r', token: 't', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b\0', token: 't', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't\r', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't\n', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't\0', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
  });
  it('strips multiple trailing slashes only', () => {
    const c = parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'https://x.atlassian.net///' }));
    expect(c.site).toBe('https://x.atlassian.net');
  });
});

describe('createAtlassianIssue', () => {
  it('POSTs the exact endpoint/headers/body with Basic auth and returns key/url', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(201, { id: '1', key: 'ACME-1', self: 's' }));
    const res = await createAtlassianIssue({ projectKey: 'ACME', summary: 'S', description: 'd' }, TOK, transport);
    expect(res).toEqual({ key: 'ACME-1', url: 'https://acme.atlassian.net/browse/ACME-1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://acme.atlassian.net/rest/api/3/issue');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({
      Authorization: 'Basic ' + btoa('me@x.com:apitok'),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(bodyOf(init)).toEqual({
      fields: {
        project: { key: 'ACME' },
        summary: 'S',
        issuetype: { name: 'Task' },
        description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'd' }] }] },
      },
    });
  });
  it('honors an explicit issueType and omits description when absent (or non-string)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { key: 'P-2' }));
    await createAtlassianIssue({ projectKey: 'P', summary: 'S', issueType: 'Bug' }, TOK, transport);
    let sent = bodyOf(transport.mock.calls[0]![1]) as { fields: Record<string, unknown> & { issuetype: { name: string } } };
    expect(sent.fields.issuetype.name).toBe('Bug');
    expect('description' in sent.fields).toBe(false);
    // 空文字 issueType は Task にフォールバック (任意の欄の空文字は「無い」)。
    await createAtlassianIssue({ projectKey: 'P', summary: 'S', issueType: '' }, TOK, transport);
    sent = bodyOf(transport.mock.calls[1]![1]) as { fields: Record<string, unknown> & { issuetype: { name: string } } };
    expect(sent.fields.issuetype.name).toBe('Task');
    expect('description' in sent.fields).toBe(false);
    // 文字列でない description は落として送らず、断る (パス 111)。
    await expect(createAtlassianIssue({ projectKey: 'P', summary: 'S', description: 5 }, TOK, transport)).rejects.toThrow(/description は文字列で/);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('requires projectKey and summary (each alone insufficient, trimmed)', async () => {
    const transport = vi.fn();
    await expect(createAtlassianIssue({ summary: 'S' }, TOK, transport)).rejects.toThrow('projectKey は必須です');
    await expect(createAtlassianIssue({ projectKey: 'P' }, TOK, transport)).rejects.toThrow(/必須/);
    await expect(createAtlassianIssue({ projectKey: '  ', summary: 'S' }, TOK, transport)).rejects.toThrow(/必須/);
    await expect(createAtlassianIssue({ projectKey: 'P', summary: '  ' }, TOK, transport)).rejects.toThrow(/必須/);
    await expect(createAtlassianIssue({ projectKey: 3, summary: 'S' }, TOK, transport)).rejects.toThrow(/projectKey は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'bad' }));
    await expect(createAtlassianIssue({ projectKey: 'A', summary: 'S' }, TOK, transport)).rejects.toThrow(/Atlassian API 400/);
  });
});

describe('createCalendarEvent', () => {
  it('POSTs the exact endpoint/headers/body with explicit timeZone', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'e1', htmlLink: 'https://cal/e1' }));
    const res = await createCalendarEvent(
      { summary: 'M', start: '2026-01-31T10:00:00', end: '2026-01-31T11:00:00', description: 'D', location: 'L', timeZone: 'Asia/Tokyo' },
      'tok',
      transport,
    );
    expect(res).toEqual({ id: 'e1', htmlLink: 'https://cal/e1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({
      summary: 'M',
      description: 'D',
      location: 'L',
      start: { dateTime: '2026-01-31T10:00:00', timeZone: 'Asia/Tokyo' },
      end: { dateTime: '2026-01-31T11:00:00', timeZone: 'Asia/Tokyo' },
    });
  });
  it('refuses non-string description/location instead of dropping them (パス 110)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'e', htmlLink: 'h' }));
    // 2026-09-09 まで `description: 5` は undefined に落とされ、説明の無い予定が黙って
    // 入っていた。壊れた入力は送らずに断る。
    await expect(
      createCalendarEvent(
        { summary: 'M', start: '2026-01-01T10:00:00', end: '2026-01-01T11:00:00', description: 5 },
        'tok',
        transport,
      ),
    ).rejects.toThrow(/description は文字列で/);
    await expect(
      createCalendarEvent(
        { summary: 'M', start: '2026-01-01T10:00:00', end: '2026-01-01T11:00:00', location: {} },
        'tok',
        transport,
      ),
    ).rejects.toThrow(/location は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });

  it('trims summary and falls back the timeZone to the environment default', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'e', htmlLink: 'h' }));
    await createCalendarEvent(
      { summary: ' M ', start: '2026-01-01T10:00:00', end: '2026-01-01T11:00:00', timeZone: '' },
      'tok',
      transport,
    );
    const sent = bodyOf(transport.mock.calls[0]![1]) as {
      summary: string;
      description?: unknown;
      location?: unknown;
      start: { timeZone: string };
      end: { timeZone: string };
    };
    expect(sent.summary).toBe('M'); // trimmed
    expect('description' in sent).toBe(false);
    expect('location' in sent).toBe(false);
    // 環境既定 TZ (vitest は UTC) にフォールバック。空文字や 'X' ではない。
    expect(sent.start.timeZone).toBe('UTC');
    expect(sent.end.timeZone).toBe('UTC');
  });
  it('requires summary/start/end (each alone insufficient)', async () => {
    const transport = vi.fn();
    await expect(createCalendarEvent({ summary: 'M' }, 'tok', transport)).rejects.toThrow('start は必須です');
    await expect(createCalendarEvent({ start: 's', end: 'e' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: 'M', end: 'e' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: 'M', start: 's' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: '  ', start: 's', end: 'e' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: 'M', start: 5, end: 'e' }, 'tok', transport)).rejects.toThrow(/start は文字列で/);
    await expect(createCalendarEvent({ summary: 'M', start: 's', end: 5 }, 'tok', transport)).rejects.toThrow(/end は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(500, { e: 1 }));
    await expect(
      createCalendarEvent({ summary: 'M', start: 's', end: 'e' }, 'tok', transport),
    ).rejects.toThrow(/Calendar API 500/);
  });
});

describe('gmail helpers + createGmailDraft', () => {
  it('isSafeHeaderValue rejects CRLF/NUL/non-string', () => {
    expect(isSafeHeaderValue('a@b.com')).toBe(true);
    expect(isSafeHeaderValue('a@b\r\nBcc: x')).toBe(false);
    expect(isSafeHeaderValue('a\rb')).toBe(false);
    expect(isSafeHeaderValue('a\nb')).toBe(false);
    expect(isSafeHeaderValue('a\0b')).toBe(false);
    expect(isSafeHeaderValue(42)).toBe(false);
    expect(isSafeHeaderValue(null)).toBe(false);
  });
  it('buildRfc2822 produces the exact MIME message (golden) and guards header injection', () => {
    expect(buildRfc2822('a@b.com', 'やあ', 'hi')).toBe(
      [
        'To: a@b.com',
        'Subject: =?UTF-8?B?44KE44GC?=',
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        '',
        'hi',
      ].join('\r\n'),
    );
    expect(() => buildRfc2822('a@b\r\nBcc: x', 's', 'b')).toThrow('to に CR/LF/NUL は使用できません');
  });
  it('createGmailDraft POSTs the exact endpoint/headers and a padding-free base64url raw', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd1', message: { id: 'm1' } }));
    const res = await createGmailDraft({ to: ' a@b.com ', subject: 'S', body: 'B' }, 'tok', transport);
    expect(res).toEqual({ id: 'd1', messageId: 'm1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    // to は trim される (' a@b.com ' → 'a@b.com')。raw を golden 照合。
    const raw = (bodyOf(init).message as { raw: string }).raw;
    expect(raw).toBe(
      'VG86IGFAYi5jb20NClN1YmplY3Q6ID0_VVRGLTg_Qj9Vdz09Pz0NCkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD0iVVRGLTgiDQpNSU1FLVZlcnNpb246IDEuMA0KDQpC',
    );
  });
  it('encodes a raw that exercises both + and / so base64url replacement matters', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd', message: { id: 'm' } }));
    // body '~~a' は素の base64 に + と / の両方を含む → base64url 変換(+→-, /→_, =除去)を全て検証。
    await createGmailDraft({ to: 'a@b.com', subject: 'S', body: '~~a' }, 'tok', transport);
    const raw = (bodyOf(transport.mock.calls[0]![1]).message as { raw: string }).raw;
    expect(raw).toBe(
      'VG86IGFAYi5jb20NClN1YmplY3Q6ID0_VVRGLTg_Qj9Vdz09Pz0NCkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD0iVVRGLTgiDQpNSU1FLVZlcnNpb246IDEuMA0KDQp-fmE',
    );
    expect(raw).not.toMatch(/[+/=]/); // base64url: + / = は出現しない
  });
  it('strips a full == padding run (so the /=+$/ regex removes all padding, not just one)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd', message: { id: 'm' } }));
    // body 'aa' は素の base64 が '==' (二重パディング) で終わる → /=+$/ が両方除去することを golden で検証。
    await createGmailDraft({ to: 'a@b.com', subject: 'S', body: 'aa' }, 'tok', transport);
    const raw = (bodyOf(transport.mock.calls[0]![1]).message as { raw: string }).raw;
    expect(raw).toBe(
      'VG86IGFAYi5jb20NClN1YmplY3Q6ID0_VVRGLTg_Qj9Vdz09Pz0NCkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD0iVVRGLTgiDQpNSU1FLVZlcnNpb246IDEuMA0KDQphYQ',
    );
    expect(raw.endsWith('=')).toBe(false); // == パディングは完全に除去 (末尾に = が残らない)
  });
  it('refuses a non-string body instead of sending an empty one (パス 111)', async () => {
    const transport = vi.fn();
    // 2026-09-09 まで `body: 123` は空文字にすり替えられ、本文の無い下書きが出来ていた。
    await expect(createGmailDraft({ to: 'a@b.com', subject: 'S', body: 123 }, 'tok', transport)).rejects.toThrow(/body は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('requires to and subject (each alone insufficient)', async () => {
    const transport = vi.fn();
    await expect(createGmailDraft({ to: 'a@b.com' }, 'tok', transport)).rejects.toThrow('subject は必須です');
    await expect(createGmailDraft({ subject: 'S' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createGmailDraft({ to: '  ', subject: 'S' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createGmailDraft({ to: 'a@b.com', subject: '' }, 'tok', transport)).rejects.toThrow(/必須/);
    // 文字列でない物は「必須」ではなく型の問題として断る (共有の台帳 — パス 111)。
    await expect(createGmailDraft({ to: 5, subject: 'S' }, 'tok', transport)).rejects.toThrow(/to は文字列で/);
    await expect(createGmailDraft({ to: 'a@b.com', subject: 5 }, 'tok', transport)).rejects.toThrow(/subject は文字列で/);
    await expect(createGmailDraft({ to: 'a@b.com', subject: {} }, 'tok', transport)).rejects.toThrow(/subject は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(403, {}));
    await expect(createGmailDraft({ to: 'a@b.com', subject: 'S' }, 'tok', transport)).rejects.toThrow(/Gmail API 403/);
  });
});

describe('createDriveFolder', () => {
  it('POSTs the exact endpoint/headers/body and falls back to a folder URL', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'f1', name: 'Docs' }));
    const res = await createDriveFolder({ name: ' Docs ' }, 'tok', transport);
    expect(res).toEqual({ id: 'f1', name: 'Docs', url: 'https://drive.google.com/drive/folders/f1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ name: 'Docs', mimeType: 'application/vnd.google-apps.folder' });
  });
  it('includes parents and uses webViewLink when present', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'f', name: 'N', webViewLink: 'L' }));
    const r = await createDriveFolder({ name: 'N', parentId: 'P' }, 'tok', transport);
    expect(r.url).toBe('L');
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({
      name: 'N',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['P'],
    });
  });
  it('refuses a non-string parentId instead of dropping it (パス 111)', async () => {
    const transport = vi.fn();
    // 2026-09-09 まで `parentId: 5` は落とされ、My Drive 直下にフォルダが出来ていた。
    await expect(createDriveFolder({ name: 'N', parentId: 5 }, 'tok', transport)).rejects.toThrow(/parentId は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('requires name (also trimmed) and surfaces API errors', async () => {
    const transport = vi.fn();
    await expect(createDriveFolder({}, 'tok', transport)).rejects.toThrow('name は必須です');
    await expect(createDriveFolder({ name: '   ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createDriveFolder({ name: 7 }, 'tok', transport)).rejects.toThrow(/name は文字列で/);
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValue(jsonResponse(500, {}));
    await expect(createDriveFolder({ name: 'N' }, 'tok', transport)).rejects.toThrow(/Drive API 500/);
  });
});

describe('createWordPressPostDraft', () => {
  it('POSTs the exact endpoint/headers/body, defaults to draft', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 9, URL: 'u', title: 'T' }));
    const res = await createWordPressPostDraft({ siteId: ' blog.example.com ', title: ' T ', content: 'C' }, 'tok', transport);
    expect(res).toEqual({ id: 9, url: 'u', title: 'T' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://public-api.wordpress.com/rest/v1.1/sites/blog.example.com/posts/new');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ title: 'T', content: 'C', status: 'draft' });
  });
  it('keeps each allowed status (the list lives in the shared ledger)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 1, URL: 'u', title: 'T' }));
    for (const s of ['draft', 'publish', 'pending', 'private']) {
      await createWordPressPostDraft({ siteId: 's', title: 'T', status: s }, 'tok', transport);
    }
    const got = transport.mock.calls.map((c) => bodyOf(c[1]).status);
    expect(got).toEqual(['draft', 'publish', 'pending', 'private']);
  });
  it('refuses an unknown status instead of publishing it as draft (パス 111)', async () => {
    const transport = vi.fn();
    // 2026-09-09 まで `status: 'bogus'` は draft にすり替えられていた。
    await expect(createWordPressPostDraft({ siteId: 's', title: 'T', status: 'bogus' }, 'tok', transport)).rejects.toThrow(
      /status は draft \/ publish \/ pending \/ private のいずれかで/,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('refuses a non-string status / content instead of coercing them; absent content is an empty string', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 1, URL: 'u', title: 'T' }));
    await expect(createWordPressPostDraft({ siteId: 's', title: 'T', status: 5 }, 'tok', transport)).rejects.toThrow(/status は文字列で/);
    await expect(createWordPressPostDraft({ siteId: 's', title: 'T', content: 9 }, 'tok', transport)).rejects.toThrow(/content は文字列で/);
    expect(transport).not.toHaveBeenCalled();
    await createWordPressPostDraft({ siteId: 's', title: 'T' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ title: 'T', content: '', status: 'draft' });
  });
  it('requires siteId and title (each alone insufficient) and surfaces API errors', async () => {
    const transport = vi.fn();
    await expect(createWordPressPostDraft({ title: 'T' }, 'tok', transport)).rejects.toThrow('siteId は必須です');
    await expect(createWordPressPostDraft({ siteId: 's' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createWordPressPostDraft({ siteId: '  ', title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createWordPressPostDraft({ siteId: 's', title: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createWordPressPostDraft({ siteId: 5, title: 'T' }, 'tok', transport)).rejects.toThrow(/siteId は文字列で/);
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValue(jsonResponse(401, {}));
    await expect(createWordPressPostDraft({ siteId: 's', title: 'T' }, 'tok', transport)).rejects.toThrow(/WordPress API 401/);
  });
});

describe('createCanvaFolder', () => {
  it('POSTs the exact endpoint/headers/body, defaults parent to root', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { folder: { id: 'c1', name: 'N' } }));
    const res = await createCanvaFolder({ name: ' N ' }, 'tok', transport);
    expect(res).toEqual({ id: 'c1', name: 'N' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.canva.com/rest/v1/folders');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ name: 'N', parent_folder_id: 'root' });
  });
  it('uses a provided non-empty parentFolderId instead of root; empty falls back to root; non-string is refused (パス 111)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { folder: { id: 'c', name: 'N' } }));
    await createCanvaFolder({ name: 'N', parentFolderId: 'FID' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1]).parent_folder_id).toBe('FID');
    await createCanvaFolder({ name: 'N', parentFolderId: '' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[1]![1]).parent_folder_id).toBe('root');
    // 2026-09-09 まで `parentFolderId: 5` は root にすり替えられていた。
    await expect(createCanvaFolder({ name: 'N', parentFolderId: 5 }, 'tok', transport)).rejects.toThrow(/parentFolderId は文字列で/);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('requires name (also trimmed) and surfaces API errors', async () => {
    const transport = vi.fn();
    await expect(createCanvaFolder({}, 'tok', transport)).rejects.toThrow('name は必須です');
    await expect(createCanvaFolder({ name: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCanvaFolder({ name: 9 }, 'tok', transport)).rejects.toThrow(/name は文字列で/);
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValue(jsonResponse(500, {}));
    await expect(createCanvaFolder({ name: 'N' }, 'tok', transport)).rejects.toThrow(/Canva API 500/);
  });
});

describe('cloudflare', () => {
  it('createCloudflareDnsRecord POSTs the exact endpoint/headers/body and unwraps the CF envelope', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'r1', name: 'a.x', type: 'A' } }));
    const res = await createCloudflareDnsRecord({ zoneId: ' z ', type: 'A', name: ' a.x ', content: ' 1.2.3.4 ' }, 'tok', transport);
    expect(res).toEqual({ id: 'r1', name: 'a.x', type: 'A' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z/dns_records');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', Accept: 'application/json', 'Content-Type': 'application/json' });
    // trim 済み + ttl 既定 1 + proxied 既定 false。
    expect(bodyOf(init)).toEqual({ type: 'A', name: 'a.x', content: '1.2.3.4', ttl: 1, proxied: false });
  });
  it('honors a numeric ttl and proxied=true for A/AAAA/CNAME; omits proxied for other types', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'r', name: 'n', type: 'A' } }));
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'AAAA', name: 'n', content: '::1', ttl: 300, proxied: true }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ type: 'AAAA', name: 'n', content: '::1', ttl: 300, proxied: true });
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'CNAME', name: 'n', content: 'x', proxied: true }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[1]![1]).proxied).toBe(true);
    // 真偽値でない proxied ('true' 文字列) と整数でない ttl は、false / 1 にすり替えずに断る (パス 111)。
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'x', proxied: 'true' }, 'tok', transport)).rejects.toThrow(/proxied は true \/ false で/);
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'TXT', name: 'n', content: 'v', ttl: 'x' }, 'tok', transport)).rejects.toThrow(/ttl は 1 以上の整数で/);
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'TXT', name: 'n', content: 'v', ttl: 0 }, 'tok', transport)).rejects.toThrow(/ttl は 1 以上の整数で/);
    // 非 A/AAAA/CNAME (TXT) は proxied キー自体を持たない。ttl 省略なら 1。
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'TXT', name: 'n', content: 'v' }, 'tok', transport);
    const txt = bodyOf(transport.mock.calls[2]![1]);
    expect('proxied' in txt).toBe(false);
    expect(txt.ttl).toBe(1);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('requires zoneId/type/name/content (each alone insufficient, trimmed)', async () => {
    const transport = vi.fn();
    const base = { zoneId: 'z', type: 'A', name: 'n', content: 'c' };
    await expect(createCloudflareDnsRecord({ ...base, zoneId: '' }, 'tok', transport)).rejects.toThrow('zoneId は必須です');
    await expect(createCloudflareDnsRecord({ ...base, type: '' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, name: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, content: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, zoneId: 5 }, 'tok', transport)).rejects.toThrow(/zoneId は文字列で/);
    await expect(createCloudflareDnsRecord({ ...base, type: 5 }, 'tok', transport)).rejects.toThrow(/type は文字列で/);
    await expect(createCloudflareDnsRecord({ ...base, name: 5 }, 'tok', transport)).rejects.toThrow(/name は文字列で/);
    await expect(createCloudflareDnsRecord({ ...base, content: 5 }, 'tok', transport)).rejects.toThrow(/content は文字列で/);
    // 種別は画面の選択肢と同じ一覧 (台帳) に無ければ断る。
    await expect(createCloudflareDnsRecord({ ...base, type: 'SRV' }, 'tok', transport)).rejects.toThrow(/type は A \/ AAAA \/ CNAME \/ TXT \/ MX のいずれかで/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('throws on CF success:false with the first error message, else a generic one', async () => {
    let transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, errors: [{ message: 'bad zone' }], result: null }));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow('Cloudflare: bad zone');
    transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, result: null }));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow('Cloudflare: unknown error');
    transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, errors: [], result: null }));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow('Cloudflare: unknown error');
  });
  it('surfaces HTTP errors before unwrapping', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(403, {}));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow(/Cloudflare API 403/);
  });
  it('purgeCloudflareCache: purge_everything path posts the exact endpoint/headers/body', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'p1' } }));
    const res = await purgeCloudflareCache({ zoneId: ' z ', purgeEverything: true }, 'tok', transport);
    expect(res).toEqual({ id: 'p1', purged: 'all' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z/purge_cache');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ purge_everything: true });
  });
  it('purges specific files and reports their count; a non-string entry refuses the whole request (パス 111)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'p' } }));
    // 2026-09-09 まで `5` は黙って間引かれ、残り 2 件だけがパージされていた。
    await expect(purgeCloudflareCache({ zoneId: 'z', files: ['https://a/x', 'https://a/y', 5] }, 'tok', transport)).rejects.toThrow(/files は文字列で/);
    expect(transport).not.toHaveBeenCalled();
    const r = await purgeCloudflareCache({ zoneId: 'z', files: ['https://a/x', 'https://a/y'] }, 'tok', transport);
    expect(r).toEqual({ id: 'p', purged: 2 });
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ files: ['https://a/x', 'https://a/y'] });
  });
  it('treats purgeEverything strictly (only a boolean is accepted)', async () => {
    const transport = vi.fn();
    // 真偽値でない purgeEverything は false にすり替えずに断る (パス 111)。
    await expect(purgeCloudflareCache({ zoneId: 'z', purgeEverything: 1 }, 'tok', transport)).rejects.toThrow(/purgeEverything は true \/ false で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('purgeCloudflareCache requires zoneId and (files or purgeEverything)', async () => {
    const transport = vi.fn();
    await expect(purgeCloudflareCache({}, 'tok', transport)).rejects.toThrow('zoneId は必須です');
    await expect(purgeCloudflareCache({ zoneId: '  ' }, 'tok', transport)).rejects.toThrow(/zoneId/);
    await expect(purgeCloudflareCache({ zoneId: 5 }, 'tok', transport)).rejects.toThrow(/zoneId/);
    await expect(purgeCloudflareCache({ zoneId: 'z' }, 'tok', transport)).rejects.toThrow('purgeEverything=true か、空でない files[] のいずれかが必要です');
    await expect(purgeCloudflareCache({ zoneId: 'z', files: [] }, 'tok', transport)).rejects.toThrow(/purgeEverything/);
    await expect(purgeCloudflareCache({ zoneId: 'z', files: [5, 6] }, 'tok', transport)).rejects.toThrow(/files は文字列で/);
    await expect(purgeCloudflareCache({ zoneId: 'z', files: 'notarray' }, 'tok', transport)).rejects.toThrow(/files は文字列で/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('purge surfaces CF success:false and HTTP errors', async () => {
    let transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, errors: [{ message: 'nope' }], result: null }));
    await expect(purgeCloudflareCache({ zoneId: 'z', purgeEverything: true }, 'tok', transport)).rejects.toThrow('Cloudflare: nope');
    transport = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(purgeCloudflareCache({ zoneId: 'z', purgeEverything: true }, 'tok', transport)).rejects.toThrow(/Cloudflare API 500/);
  });
});

describe('parseSecurityKeys', () => {
  it('parses {hibp,vt} JSON', () => {
    expect(parseSecurityKeys(JSON.stringify({ hibp: 'h', vt: 'v' }))).toEqual({ hibp: 'h', vt: 'v' });
  });
  it('keeps only non-empty string keys', () => {
    expect(parseSecurityKeys(JSON.stringify({ hibp: 'h' }))).toEqual({ hibp: 'h' });
    expect(parseSecurityKeys(JSON.stringify({ vt: 'v' }))).toEqual({ vt: 'v' });
    expect(parseSecurityKeys(JSON.stringify({ vt: 123 }))).toEqual({});
    expect(parseSecurityKeys(JSON.stringify({ hibp: 5, vt: 'v' }))).toEqual({ vt: 'v' });
    expect(parseSecurityKeys(JSON.stringify({ hibp: '', vt: '' }))).toEqual({});
  });
  it('treats a raw (non-JSON) string as the HIBP key', () => {
    expect(parseSecurityKeys('rawkey')).toEqual({ hibp: 'rawkey' });
  });
  it('returns {} for empty input', () => {
    expect(parseSecurityKeys('')).toEqual({});
  });
  it('returns {} for non-object JSON (number / null / array)', () => {
    expect(parseSecurityKeys('123')).toEqual({});
    expect(parseSecurityKeys('null')).toEqual({});
    expect(parseSecurityKeys('[1,2]')).toEqual({});
  });
});

describe('scanUrlVirusTotal', () => {
  it('submits then reads the report with exact endpoints/headers/body and computes positives/total', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'x', type: 'analysis' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { attributes: { last_analysis_stats: { harmless: 60, malicious: 2, suspicious: 1, undetected: 7 } } } }));
    const res = await scanUrlVirusTotal({ url: ' https://evil.test/ ' }, 'vtkey', transport);
    expect(res.positives).toBe(3);
    expect(res.total).toBe(70);
    expect(res.url).toBe('https://evil.test/'); // trimmed
    expect(res.reportUrl).toBe('https://www.virustotal.com/gui/url/aHR0cHM6Ly9ldmlsLnRlc3Qv');
    // submit POST: urlencoded body + x-apikey
    const [submitUrl, submitInit] = transport.mock.calls[0]!;
    expect(submitUrl).toBe('https://www.virustotal.com/api/v3/urls');
    expect(submitInit.method).toBe('POST');
    expect(headersOf(submitInit)).toEqual({ 'x-apikey': 'vtkey', 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(submitInit.body).toBe('url=https%3A%2F%2Fevil.test%2F');
    // report GET: by padding-free base64url id
    const [reportUrl, reportInit] = transport.mock.calls[1]!;
    expect(reportUrl).toBe('https://www.virustotal.com/api/v3/urls/aHR0cHM6Ly9ldmlsLnRlc3Qv');
    expect(reportInit.method).toBe('GET');
    expect(headersOf(reportInit)).toEqual({ 'x-apikey': 'vtkey' });
  });
  it('strips base64 padding and converts + / in the VT id (so the report id is base64url)', async () => {
    const ok = jsonResponse(200, { data: { attributes: { last_analysis_stats: { harmless: 1, malicious: 0, suspicious: 0, undetected: 0 } } } });
    // 'https://a/a>a' の base64 は '+' を含む → '-' に置換されること。
    let transport = vi.fn().mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(ok);
    let res = await scanUrlVirusTotal({ url: 'https://a/a>a' }, 'k', transport);
    expect(transport.mock.calls[1]![0]).toBe('https://www.virustotal.com/api/v3/urls/aHR0cHM6Ly9hL2E-YQ');
    expect(res.reportUrl).toBe('https://www.virustotal.com/gui/url/aHR0cHM6Ly9hL2E-YQ');
    // 'https://a/a?a' の base64 は '/' を含む → '_' に置換されること。
    transport = vi.fn().mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(ok);
    res = await scanUrlVirusTotal({ url: 'https://a/a?a' }, 'k', transport);
    expect(transport.mock.calls[1]![0]).toBe('https://www.virustotal.com/api/v3/urls/aHR0cHM6Ly9hL2E_YQ');
  });
  it('requires a url (also trimmed)', async () => {
    const transport = vi.fn();
    await expect(scanUrlVirusTotal({}, 'k', transport)).rejects.toThrow('url は必須です');
    await expect(scanUrlVirusTotal({ url: '   ' }, 'k', transport)).rejects.toThrow(/必須/);
    await expect(scanUrlVirusTotal({ url: 5 }, 'k', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces submit and report HTTP errors', async () => {
    let transport = vi.fn().mockResolvedValueOnce(jsonResponse(429, {}));
    await expect(scanUrlVirusTotal({ url: 'https://x/' }, 'k', transport)).rejects.toThrow(/VirusTotal API 429/);
    transport = vi.fn().mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(jsonResponse(404, {}));
    await expect(scanUrlVirusTotal({ url: 'https://x/' }, 'k', transport)).rejects.toThrow(/VirusTotal API 404/);
  });
});

describe('checkEmailBreach', () => {
  it('GETs the exact endpoint/headers and treats upstream 404 as no breaches', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const res = await checkEmailBreach({ email: ' a@b.com ' }, 'hibpkey', transport);
    expect(res).toEqual({ email: 'a@b.com', breaches: [] }); // trimmed
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://haveibeenpwned.com/api/v3/breachedaccount/a%40b.com?truncateResponse=false');
    expect(init.method).toBe('GET');
    expect(headersOf(init)).toEqual({
      'hibp-api-key': 'hibpkey',
      'User-Agent': 'service-hub',
      Accept: 'application/json',
    });
  });
  it('maps breach rows on 200', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, [
      { Name: 'Acme', Title: 'Acme Co', BreachDate: '2020-01-01', PwnCount: 100, DataClasses: ['Emails'] },
      { Name: 'Beta', Title: 'Beta Inc', BreachDate: '2021-02-02', PwnCount: 5, DataClasses: ['Passwords', 'Emails'] },
    ]));
    const res = await checkEmailBreach({ email: 'a@b.com' }, 'k', transport);
    expect(res.breaches).toEqual([
      { name: 'Acme', title: 'Acme Co', date: '2020-01-01', pwnCount: 100, dataClasses: ['Emails'] },
      { name: 'Beta', title: 'Beta Inc', date: '2021-02-02', pwnCount: 5, dataClasses: ['Passwords', 'Emails'] },
    ]);
  });
  it('throws on other HTTP errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'bad key' }));
    await expect(checkEmailBreach({ email: 'a@b.com' }, 'k', transport)).rejects.toThrow(/HIBP API 401/);
  });
  it('requires an email (also trimmed)', async () => {
    const transport = vi.fn();
    await expect(checkEmailBreach({}, 'k', transport)).rejects.toThrow('email は必須です');
    await expect(checkEmailBreach({ email: '   ' }, 'k', transport)).rejects.toThrow(/必須/);
    await expect(checkEmailBreach({ email: 5 }, 'k', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
});

// --- ensureOk のエラー整形 (status + 本文 200 文字 truncate) -----------------
describe('ensureOk error formatting', () => {
  it('includes the status and truncates the body excerpt to 200 chars', async () => {
    const long = 'x'.repeat(300);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 500, json: async () => ({}), text: async () => long,
    } as unknown as Response);
    let msg = '';
    try {
      await createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe(`GitHub API 500: ${'x'.repeat(200)}`);
    expect(msg).not.toContain('x'.repeat(201)); // slice(0,200)
  });
  it('falls back to an empty body excerpt when res.text() rejects', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 503, json: async () => ({}), text: async () => { throw new Error('boom'); },
    } as unknown as Response);
    let msg = '';
    try {
      await createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('GitHub API 503: ');
  });
});

/*
 * site を弾いたときの文言を字面で留める。
 *
 * この 4 文だけが、利用者に **なぜ Atlassian に繋がらないのか** を伝える。
 * `ATLASSIAN_SITE_MESSAGES` は非公開の表なので、外から見えるのは
 * `parseAtlassianToken` が投げる例外の message だけ —— そこを確かめる。
 *
 * 実測でこの表 (オブジェクトそのもの + 4 文) が変異検査を生き延びていた:
 * 空文字に変えても「throw する」ことしか確かめていなかったので通ってしまう。
 * 文言が消えると、site を貼り間違えた利用者に空のエラーが出る。
 *
 * `vi.resetModules()` + 動的 import なのは表がモジュール定数だから
 * (静的 import のままだと読み込み時に評価が済んで変異体が畳み込まれる)。
 */
describe('Atlassian の site を弾いたときの文言', () => {
  async function freshParse(): Promise<typeof parseAtlassianToken> {
    vi.resetModules();
    const mod = (await import('../saasWriteWeb')) as typeof import('../saasWriteWeb');
    return mod.parseAtlassianToken;
  }

  const CASES: [string, string, RegExp][] = [
    ['control-char', 'https://x.atlassian.net\tfoo', /制御文字/],
    ['not-a-url', 'not-a-url', /https URL/],
    ['not-https', 'http://x.atlassian.net', /https のみ/],
    ['not-atlassian', 'https://evil.example', /\*\.atlassian\.net/],
  ];

  it.each(CASES)('%s は理由の分かる文言で断る', async (_reason, site, want) => {
    const parse = await freshParse();
    expect(() => parse(JSON.stringify({ email: 'a@b.c', token: 't', site }))).toThrow(want);
  });

  it('4 通りとも別の文言 (同じ文言に潰れていない)', async () => {
    const parse = await freshParse();
    const seen = CASES.map(([, site]) => {
      try {
        parse(JSON.stringify({ email: 'a@b.c', token: 't', site }));
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(seen.filter((m) => m.length > 0)).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
  });
});

/*
 * **応答の大きさの上限が、経路によって違っていた。**
 *
 * `network/proxy.ts` の `fetchViaProxy` は上限つきで読んだ本文から
 * `Response` を組み直して返すので、プロキシ経由で来る create-* は既に
 * 10MiB 以下を受け取っている。ところが `api.github.com` は CORS 許可済みで
 * **プロキシを通らない** —— 課題作成だけは素の `Response` を
 * `res.json()` でそのまま読んでいた (2026-08-31 に発見)。
 *
 * ここで見るのは「上限が掛かっていること」だけである。**「読み切らずに
 * 止まる」ことはこの作りでは測れない** —— 最初 `pull` が呼ばれた回数を
 * 数えたが、Node の `Response` は `ReadableStream` を内部へ取り込む際に
 * 元を先に汲み切るので、12/12 が流れて検査が鳴った。実装ではなく替え玉の
 * 性質を測っていたので、その主張は落とした (背圧まで見たいなら
 * `shared/ai/__tests__/chatBodyDeadline.test.ts` のように実サーバが要る)。
 */
describe('createGithubIssue — 応答本文の上限 (プロキシを通らない道)', () => {
  const MIB = 1024 * 1024;

  /**
   * 1MiB ずつ `chunks` 回流す `Response`。
   *
   * **中身は正しい JSON にする。** 詰め物を JSON にしないと、上限を外した
   * ときに `JSON.parse` が別の理由で落ち、検査が「どちらでも鳴る」ものに
   * なってしまう —— 上限を外したら**素通りして成功する**形にしておくと、
   * 対照が上限そのものを指す。
   */
  function streamingResponse(chunks: number, status = 200): Response {
    const head = new TextEncoder().encode(
      '{"number":1,"html_url":"https://x.test/1","title":"',
    );
    const chunk = new TextEncoder().encode('A'.repeat(MIB));
    const tail = new TextEncoder().encode('"}');
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(head);
      },
      pull(c) {
        if (sent >= chunks) {
          c.enqueue(tail);
          c.close();
          return;
        }
        sent += 1;
        c.enqueue(chunk);
      },
    });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  }

  it('★ 上限を超える応答は読み切らずに落とす', async () => {
    const res = streamingResponse(12);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(res);
    await expect(
      createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn),
    ).rejects.toThrow(/GitHub API response too large/);
  });

  /*
   * **肯定の対照。** 上は「投げること」を見る検査なので、実装が何でも
   * 投げるようになっても気付けない。正当な大きさの応答が同じ道を
   * 通り抜けることを、同じ作りの `Response` で確かめる。
   */
  it('★ 正当な大きさの応答はそのまま通る (対照)', async () => {
    const body = JSON.stringify({ number: 7, html_url: 'https://x.test/7', title: 't' });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body, { status: 200 }));
    await expect(
      createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn),
    ).resolves.toEqual({ number: 7, url: 'https://x.test/7', title: 't' });
  });

  it('★ 失敗の本文にも上限が掛かる (落ちている相手ほど大きく返しうる)', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(streamingResponse(12, 500));
    // `ensureOk` は本文が読めなければ空文字に落とすので、status だけが残る。
    // 上限を外すと 12MiB がそのまま `redactForMessage` に渡り、200 字に切られた
    // 詰め物が文言に載る —— そちらは同じ検査が落として気付ける。
    const err: unknown = await createGithubIssue(
      { owner: 'o', repo: 'r', title: 't' },
      'tok',
      fetchFn,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('GitHub API 500: ');
  });
});

describe('★ 壊れた 200 の応答を成功として返さない (パス 261)', () => {
  const reply = (body: string) => async () =>
    new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

  /**
   * 書き込み口を**全部**並べる (母集団は下の census が実装から導く)。
   * 直す前の実測では 6 経路が `{}` / `[]` /
   * `"str"` を成功として返し、うち 2 経路は `undefined` を埋め込んだ URL を
   * 押せるリンクとして画面に渡していた:
   *
   *   atlassian → https://x.atlassian.net/browse/undefined
   *   drive     → https://drive.google.com/drive/folders/undefined
   *
   * 台帳を関数の一覧として持つので、**新しい書き込み口を足して**ここに
   * 載せ忘れると、`writeEntryCensus` (下) が鳴る。
   */
  const ENTRIES: Array<[string, (t: Transport) => Promise<unknown>]> = [
    ['createGithubIssue', (t) => createGithubIssue({ owner: 'o', repo: 'r', title: 'T' }, 'tok', t)],
    ['createNotionPage', (t) => createNotionPage({ parentPageId: 'p'.repeat(32), title: 'T', body: 'B' }, 'tok', t)],
    ['sendSlackMessage', (t) => sendSlackMessage({ channel: '#c', text: 'hi' }, 'tok', t)],
    [
      'createAtlassianIssue',
      (t) =>
        createAtlassianIssue(
          { projectKey: 'AB', summary: 'S', issueType: 'Task' },
          JSON.stringify({ email: 'a@b.co', token: 't', site: 'https://x.atlassian.net' }),
          t,
        ),
    ],
    [
      'createCalendarEvent',
      (t) => createCalendarEvent({ summary: 'S', start: '2026-09-15T10:00:00Z', end: '2026-09-15T11:00:00Z' }, 'tok', t),
    ],
    ['createGmailDraft', (t) => createGmailDraft({ to: 'a@b.co', subject: 'S', body: 'B' }, 'tok', t)],
    ['createDriveFolder', (t) => createDriveFolder({ name: 'N' }, 'tok', t)],
    [
      'createWordPressPostDraft',
      (t) => createWordPressPostDraft({ siteId: 'x.wordpress.com', title: 'T', content: 'C' }, 'tok', t),
    ],
    ['createCanvaFolder', (t) => createCanvaFolder({ name: 'N' }, 'tok', t)],
    [
      'createCloudflareDnsRecord',
      (t) => createCloudflareDnsRecord({ zoneId: 'z'.repeat(32), type: 'A', name: 'a.b.co', content: '1.2.3.4' }, 'tok', t),
    ],
    ['purgeCloudflareCache', (t) => purgeCloudflareCache({ zoneId: 'z'.repeat(32), files: ['https://a.b.co/x'] }, 'tok', t)],
    // ★ この 2 つは**下の台帳の突き合わせが見つけた** —— 私の最初の一覧は
    //   `scanUrlVirusTotal` を落としていた (「安全の判定」を作る側なので最も重い)。
    ['scanUrlVirusTotal', (t) => scanUrlVirusTotal({ url: 'https://a.b.co/' }, 'key', t)],
    ['checkEmailBreach', (t) => checkEmailBreach({ email: 'a@b.co' }, 'key', t)],
    // ★ パス 274 で足した口。**本文を返さない端点**なので下の 5 本からは外れる
    //   (理由は `BODYLESS` の注記)。台帳には載る —— 載せないと census が鳴る。
    ['sendMicrosoftMail', (t) => sendMicrosoftMail({ to: 'a@b.co', subject: 'S', body: 'B' }, 'tok', t)],
    // ★ パス 275。**こちらは 201 Created が資源を返す**ので、下の 5 本に掛かる
    //   (BODYLESS では**ない** —— 送信との違いはそこである)。
    [
      'createMicrosoftEvent',
      (t) =>
        createMicrosoftEvent(
          { subject: 'S', start: '2026-09-15T10:00:00', end: '2026-09-15T11:00:00' },
          'tok',
          t,
        ),
    ],
  ];

  /**
   * **本文が証拠にならない端点。**
   *
   * Graph の `POST /me/sendMail` は **202 Accepted・本文なし**で答える
   * (作った資源を返す端点ではないので、返す物が無い)。したがって
   * 「`{}` を成功として返すな」という下の 5 本は、この口には当てられない ——
   * 空の本文は**この端点の正しい答え**である。
   *
   * `checkEmailBreach` の `[]` と同じ形の例外で、あちらは「検査の側が誤って
   * いた」と書いてある。こちらは最初から外す。
   *
   * ## その代わりに何を見ているか
   *
   * - 2xx でなければ断る (`ensureOk`) —— `microsoft365.test.ts` が 400 で留める
   * - **本文を読まない** —— 同じ検査が `json` / `text` に触ったら落ちる Proxy で留める
   *
   * ## 残る限界 (書いておく)
   *
   * 本文が無いので、**2xx を騙るプロキシはここでは捕まえられない。**
   * 他の 13 口は返ってきた資源の形で嘘を見抜けるが、この口の証拠は status
   * だけである。Graph が 202 と文書化している以上「202 ちょうど」を要求する
   * 道も在るが、相手が 200 に正規化しただけで送信が止まるので採らない。
   */
  const BODYLESS: ReadonlySet<string> = new Set(['sendMicrosoftMail']);
  const WITH_BODY = ENTRIES.filter(([n]) => !BODYLESS.has(n));

  // `{}` / `"str"` / `null` / 非 JSON —— どれも「相手が処理した」証拠にならない。
  for (const [bodyLabel, body] of [
    ['空のオブジェクト', '{}'],
    ['文字列', '"hello"'],
    ['null', 'null'],
    ['JSON ではない', '<html>Worker error</html>'],
  ] as const) {
    it.each(WITH_BODY)(`200 / ${bodyLabel} → %s は断る`, async (_name, call) => {
      await expect(call(reply(body) as never)).rejects.toThrow();
    });
  }

  /**
   * **空の配列は 1 つだけ例外である。** `checkEmailBreach` にとって `[]` は
   * 「どの漏洩にも含まれない」= 形の合った正しい答えで、断る理由が無い
   * (HIBP は 404 で返すが、それを 200 + `[]` に正規化するプロキシは在り得る)。
   * 最初に書いた検査はここを一律に断ると期待していて**検査の側が誤っていた** ——
   * 実装ではなく期待を直した。
   */
  it.each(WITH_BODY.filter(([n]) => n !== 'checkEmailBreach'))('200 / 配列 → %s は断る', async (_n, call) => {
    await expect(call(reply('[]') as never)).rejects.toThrow();
  });
  it('200 / 配列 → checkEmailBreach だけは「漏洩なし」として通す', async () => {
    await expect(checkEmailBreach({ email: 'a@b.co' }, 'key', reply('[]') as never)).resolves.toEqual({
      email: 'a@b.co',
      breaches: [],
    });
  });

  /*
   * 例外が**空虚でない**ことを留める —— `sendMicrosoftMail` が本文の検証を
   * 始めたら (= 202 の実物を断るようになったら) ここが鳴る。
   * 外した口を「外したまま誰も見ない」にしない。
   */
  it('★ 本文なしの端点は 200 / 空の本文を成功として返す (外した理由が生きている)', async () => {
    await expect(
      sendMicrosoftMail({ to: 'a@b.co', subject: 'S', body: 'B' }, 'tok', reply('') as never),
    ).resolves.toEqual({ ok: true, to: 'a@b.co', subject: 'S' });
    expect(BODYLESS.size, '例外の一覧が空 = 上の filter が何もしていない').toBe(1);
  });

  it('★ undefined を埋め込んだ URL を作らない (直す前の 2 経路)', async () => {
    for (const [, call] of ENTRIES) {
      const out = await call(reply('{}') as never).catch((e: Error) => e.message);
      expect(String(out)).not.toContain('undefined');
    }
  });

  it('★ 台帳 (ENTRIES) が実装の書き込み口を全部覆う', async () => {
    // **原文で読む** —— 生の読みでは Stryker の計器が書き換えた写しに当たり、
    // 綴りに当てる検査が空になる (`originalSourcePolicy` がそれをゲートにしている)。
    const { readOriginalSource } = await import('../../../shared/__tests__/originalSource');
    const src = readOriginalSource(new URL('../saasWriteWeb.ts', import.meta.url).pathname);
    // `transport: Transport` を取る export された関数が「書き込み口」である。
    const declared = [...src.matchAll(/export async function (\w+)\([\s\S]{0,400}?transport: Transport,/g)].map(
      (m) => m[1],
    );
    // 標本: 走査が**実際に当たる**ことを見る (0 件なら規則が死んでいる)。
    expect(declared.length).toBeGreaterThan(0);
    expect([...declared].sort()).toEqual(ENTRIES.map(([n]) => n).sort());
  });
});
