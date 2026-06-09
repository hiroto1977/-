import { describe, expect, it } from 'vitest';
import {
  GithubClient,
  WordPressClient,
  AtlassianClient,
  NotionClient,
  DriveClient,
  CalendarClient,
  GmailClient,
  SlackClient,
  CanvaClient,
  NotConfiguredError,
} from '../index';

/**
 * 認証ガードを検証する: 資格情報なしで呼ぶと NotConfiguredError が投げられ、メッセージに
 * サービス ID を含むことを確認する。`readonly id` の StringLiteral と `!isConfigured()` ガードの
 * true 方向 (常に throw) を撃墜する。
 */
async function expectGuard(promise: Promise<unknown>, id: string): Promise<void> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(NotConfiguredError);
  expect((err as Error).message).toContain(id);
}

describe('ServiceClient stubs — isConfigured', () => {
  it('returns false when no credentials and true with a token (Boolean coercion)', () => {
    // toBe(true/false) で Boolean() 除去 (MethodExpression) も撃墜 (token 文字列は !== true)。
    for (const Client of [GithubClient, WordPressClient, NotionClient, DriveClient, CalendarClient, GmailClient, SlackClient, CanvaClient]) {
      expect(new Client().isConfigured()).toBe(false);
      expect(new Client({ token: 'x' }).isConfigured()).toBe(true);
    }
  });

  it('Atlassian requires BOTH token and baseUrl (&& logical operator)', () => {
    expect(new AtlassianClient().isConfigured()).toBe(false);
    expect(new AtlassianClient({ token: 't' }).isConfigured()).toBe(false);
    expect(new AtlassianClient({ baseUrl: 'u' }).isConfigured()).toBe(false);
    expect(new AtlassianClient({ token: 't', baseUrl: 'u' }).isConfigured()).toBe(true);
  });
});

describe('ServiceClient stubs — guards reject without credentials (carrying the service id)', () => {
  it('GithubClient', async () => {
    await expectGuard(new GithubClient().listRepos(), 'github');
    await expectGuard(new GithubClient().listPullRequests(), 'github');
    await expectGuard(new GithubClient().listIssues(), 'github');
  });
  it('WordPressClient', async () => {
    await expectGuard(new WordPressClient().listSites(), 'wordpress');
    await expectGuard(new WordPressClient().createPostDraft('s', {}), 'wordpress');
    await expectGuard(new WordPressClient().checkDomainAvailability('d.com'), 'wordpress');
  });
  it('AtlassianClient', async () => {
    await expectGuard(new AtlassianClient().searchJira('jql'), 'atlassian');
    await expectGuard(new AtlassianClient().getConfluencePage('p'), 'atlassian');
    await expectGuard(new AtlassianClient().listCompassComponents(), 'atlassian');
  });
  it('NotionClient', async () => {
    await expectGuard(new NotionClient().search('q'), 'notion');
    await expectGuard(new NotionClient().createPage({}), 'notion');
  });
  it('Google clients (drive / calendar / gmail)', async () => {
    await expectGuard(new DriveClient().listRecent(), 'drive');
    await expectGuard(new DriveClient().search('q'), 'drive');
    await expectGuard(new CalendarClient().listEvents(), 'calendar');
    await expectGuard(new CalendarClient().createEvent({}), 'calendar');
    await expectGuard(new GmailClient().searchThreads('q'), 'gmail');
    await expectGuard(new GmailClient().listLabels(), 'gmail');
  });
  it('SlackClient', async () => {
    await expectGuard(new SlackClient().searchChannels('q'), 'slack');
    await expectGuard(new SlackClient().sendMessage('c', 'm'), 'slack');
    await expectGuard(new SlackClient().readThread('c', 'ts'), 'slack');
  });
  it('CanvaClient', async () => {
    await expectGuard(new CanvaClient().searchDesigns('q'), 'canva');
    await expectGuard(new CanvaClient().generateDesign('p'), 'canva');
    await expectGuard(new CanvaClient().exportDesign('id', 'pdf'), 'canva');
  });
});

describe('ServiceClient stubs — return the stub payload when configured (guard false branch + return value)', () => {
  it('GithubClient resolves empty lists', async () => {
    const c = new GithubClient({ token: 'x' });
    await expect(c.listRepos()).resolves.toEqual([]);
    await expect(c.listPullRequests()).resolves.toEqual([]);
    await expect(c.listIssues()).resolves.toEqual([]);
  });
  it('WordPressClient resolves list/draft/availability stubs', async () => {
    const c = new WordPressClient({ token: 'x' });
    await expect(c.listSites()).resolves.toEqual([]);
    await expect(c.createPostDraft('s', { title: 't' })).resolves.toEqual({ ok: true });
    await expect(c.checkDomainAvailability('d.com')).resolves.toEqual({ available: false });
  });
  it('AtlassianClient resolves search/page/components stubs', async () => {
    const c = new AtlassianClient({ token: 't', baseUrl: 'u' });
    await expect(c.searchJira('jql')).resolves.toEqual([]);
    await expect(c.getConfluencePage('p')).resolves.toBeNull();
    await expect(c.listCompassComponents()).resolves.toEqual([]);
  });
  it('NotionClient resolves search/create stubs', async () => {
    const c = new NotionClient({ token: 'x' });
    await expect(c.search('q')).resolves.toEqual([]);
    await expect(c.createPage({})).resolves.toEqual({ ok: true });
  });
  it('Google clients resolve their stubs', async () => {
    await expect(new DriveClient({ token: 'x' }).listRecent()).resolves.toEqual([]);
    await expect(new DriveClient({ token: 'x' }).search('q')).resolves.toEqual([]);
    await expect(new CalendarClient({ token: 'x' }).listEvents('a', 'b')).resolves.toEqual([]);
    await expect(new CalendarClient({ token: 'x' }).createEvent({})).resolves.toEqual({ ok: true });
    await expect(new GmailClient({ token: 'x' }).searchThreads('q')).resolves.toEqual([]);
    await expect(new GmailClient({ token: 'x' }).listLabels()).resolves.toEqual([]);
  });
  it('SlackClient resolves channels/message/thread stubs', async () => {
    const c = new SlackClient({ token: 'x' });
    await expect(c.searchChannels('q')).resolves.toEqual([]);
    await expect(c.sendMessage('c', 'm')).resolves.toEqual({ ok: true });
    await expect(c.readThread('c', 'ts')).resolves.toBeNull();
  });
  it('CanvaClient resolves search/generate/export stubs', async () => {
    const c = new CanvaClient({ token: 'x' });
    await expect(c.searchDesigns('q')).resolves.toEqual([]);
    await expect(c.generateDesign('p')).resolves.toEqual({ ok: true });
    await expect(c.exportDesign('id', 'pdf')).resolves.toEqual({ ok: true });
  });
});

describe('NotConfiguredError', () => {
  it('names itself and embeds the service id in the message', () => {
    const err = new NotConfiguredError('github');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NotConfiguredError');
    expect(err.message).toContain('github');
    expect(err.message).toContain('not configured');
  });
});
