import { describe, expect, it, vi } from 'vitest';
import { pathSegment, refuseDotSegment } from '../pathSegment';
import { githubIssuesPath } from '../github';
import { WordPressClient, wordpressPostsPath } from '../wordpress';
import { cloudflareDnsRecordsPath, cloudflarePurgePath } from '../cloudflare';

const BASE = 'https://api.example.test/v1';

describe('パスの部品に . と .. を入れて URL を畳ませない (threat: T-190)', () => {
  it('標本: encodeURIComponent は . と .. を符号化せず、WHATWG URL が 1 段畳む (針が的に当たる)', () => {
    expect(encodeURIComponent('..')).toBe('..');
    expect(new URL(`${BASE}/zones/${encodeURIComponent('..')}/dns_records`).pathname).toBe('/v1/dns_records');
    expect(new URL('https://api.github.com/repos/../user/issues').pathname).toBe('/user/issues');
  });

  it('pathSegment は . と .. を断り、他は符号化する (%2e は畳まれない形になる)', () => {
    expect(() => pathSegment('.')).toThrow(new Error('パスの部品に "." と ".." は使えません。'));
    expect(() => pathSegment('..')).toThrow(new Error('パスの部品に "." と ".." は使えません。'));
    expect(pathSegment('a/b')).toBe('a%2Fb');
    expect(pathSegment('%2e%2e')).toBe('%252e%252e');
    expect(pathSegment('...')).toBe('...');
    expect(pathSegment('owner')).toBe('owner');
    expect(refuseDotSegment('a b')).toBe('a b');
    expect(() => refuseDotSegment('..')).toThrow();
  });

  it('4 つの書き込みの path 組み立てが . と .. を通さない (実物の関数)', () => {
    for (const bad of ['.', '..']) {
      expect(() => githubIssuesPath({ owner: bad, repo: 'r', title: 't' } as never)).toThrow();
      expect(() => githubIssuesPath({ owner: 'o', repo: bad, title: 't' } as never)).toThrow();
      expect(() => wordpressPostsPath({ siteId: bad, title: 't', content: 'c', status: 'draft' } as never)).toThrow();
      expect(() => cloudflareDnsRecordsPath({ zoneId: bad } as never)).toThrow();
      expect(() => cloudflarePurgePath({ zoneId: bad } as never)).toThrow();
    }
    expect(githubIssuesPath({ owner: 'o', repo: 'r', title: 't' } as never)).toBe('/repos/o/r/issues');
    expect(wordpressPostsPath({ siteId: '123', title: 't', content: 'c', status: 'draft' } as never)).toBe('/sites/123/posts/new');
    expect(cloudflareDnsRecordsPath({ zoneId: 'abc' } as never)).toBe('/zones/abc/dns_records');
    expect(cloudflarePurgePath({ zoneId: 'abc' } as never)).toBe('/zones/abc/purge_cache');
  });

  it('WordPressClient.createPostDraft(旧来のクラス経路)も . と .. を送らない (threat: T-190)', async () => {
    const f = vi.fn();
    await expect(new WordPressClient({ token: 'tok' }, f as never).createPostDraft('..', { title: 't' })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});
