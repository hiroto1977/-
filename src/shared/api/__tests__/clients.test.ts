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

describe('ServiceClient stubs', () => {
  it('returns isConfigured=false when no credentials', () => {
    expect(new GithubClient().isConfigured()).toBe(false);
    expect(new WordPressClient().isConfigured()).toBe(false);
    expect(new NotionClient().isConfigured()).toBe(false);
    expect(new DriveClient().isConfigured()).toBe(false);
    expect(new CalendarClient().isConfigured()).toBe(false);
    expect(new GmailClient().isConfigured()).toBe(false);
    expect(new SlackClient().isConfigured()).toBe(false);
    expect(new CanvaClient().isConfigured()).toBe(false);
  });

  it('Atlassian requires both token and baseUrl', () => {
    expect(new AtlassianClient({ token: 't' }).isConfigured()).toBe(false);
    expect(new AtlassianClient({ baseUrl: 'u' }).isConfigured()).toBe(false);
    expect(new AtlassianClient({ token: 't', baseUrl: 'u' }).isConfigured()).toBe(true);
  });

  it('returns isConfigured=true with a token', () => {
    expect(new GithubClient({ token: 'x' }).isConfigured()).toBe(true);
    expect(new NotionClient({ token: 'x' }).isConfigured()).toBe(true);
    expect(new SlackClient({ token: 'x' }).isConfigured()).toBe(true);
  });

  it('throws NotConfiguredError when methods are called without credentials', async () => {
    await expect(new GithubClient().listRepos()).rejects.toBeInstanceOf(NotConfiguredError);
    await expect(new NotionClient().search('q')).rejects.toBeInstanceOf(NotConfiguredError);
    await expect(new SlackClient().sendMessage('c', 'm')).rejects.toBeInstanceOf(
      NotConfiguredError,
    );
    await expect(new CanvaClient().exportDesign('id', 'pdf')).rejects.toBeInstanceOf(
      NotConfiguredError,
    );
  });

  it('NotConfiguredError includes the service id in the message', () => {
    const err = new NotConfiguredError('github');
    expect(err.name).toBe('NotConfiguredError');
    expect(err.message).toContain('github');
  });
});
