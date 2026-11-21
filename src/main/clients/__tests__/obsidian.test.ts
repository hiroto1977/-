import { describe, expect, it, vi } from 'vitest';
import {
  buildObsidianSnapshot,
  chooseVault,
  countWikiLinks,
  countWords,
  extractInlineTags,
  fetchObsidianSnapshot,
  parseFrontmatterTags,
  parseGitRemote,
  parseObsidianConfig,
  redactRemoteUrl,
  summarizeNote,
  type RawNoteReading,
  type RawObsidianReadings,
} from '../obsidian';

const note = (over: Partial<RawNoteReading>): RawNoteReading => ({
  relPath: 'a.md',
  title: 'a',
  folder: '',
  tags: [],
  updatedIso: '2026-01-01T00:00:00.000Z',
  words: 0,
  links: 0,
  ...over,
});

const found: RawObsidianReadings = {
  found: true,
  vaultName: 'myvault',
  vaultPath: '/home/u/myvault',
  notes: [],
  truncated: false,
  hasGit: true,
  gitRemote: 'https://github.com/u/myvault.git',
  lastSyncIso: '2026-11-01T00:00:00.000Z',
  gitCrypt: false,
  hasDotObsidian: true,
  dailyNotesEnabled: true,
  templatesEnabled: false,
  gitPluginEnabled: true,
};

describe('parseObsidianConfig', () => {
  it('extracts vault candidates, skipping malformed entries', () => {
    const text = JSON.stringify({
      vaults: {
        a: { path: '/v/one', ts: 100, open: true },
        b: { path: '/v/two', ts: 200 },
        c: { ts: 300 },
        d: 'junk',
      },
    });
    expect(parseObsidianConfig(text)).toEqual([
      { path: '/v/one', ts: 100, open: true },
      { path: '/v/two', ts: 200, open: false },
    ]);
  });

  it('falls back to 0 for a non-finite ts (JSON の 1e999 は Infinity になる)', () => {
    const text = '{"vaults":{"a":{"path":"/v/one","ts":1e999}}}';
    expect(parseObsidianConfig(text)).toEqual([{ path: '/v/one', ts: 0, open: false }]);
  });

  it('returns [] for broken JSON or missing vaults', () => {
    expect(parseObsidianConfig('{oops')).toEqual([]);
    expect(parseObsidianConfig('{}')).toEqual([]);
    expect(parseObsidianConfig('{"vaults":null}')).toEqual([]);
  });
});

describe('chooseVault', () => {
  it('prefers the open vault, then the most recent, then null when empty', () => {
    const c = [
      { path: '/v/old', ts: 100, open: false },
      { path: '/v/open', ts: 50, open: true },
      { path: '/v/new', ts: 300, open: false },
    ];
    expect(chooseVault(c)?.path).toBe('/v/open');
    expect(chooseVault(c.filter((x) => !x.open))?.path).toBe('/v/new');
    expect(chooseVault([])).toBeNull();
  });
});

describe('parseGitRemote / redactRemoteUrl', () => {
  it('reads the origin url only', () => {
    const cfg = [
      '[core]',
      '\trepositoryformatversion = 0',
      '[remote "upstream"]',
      '\turl = https://example.com/up.git',
      '[remote "origin"]',
      '\turl = git@github.com:u/repo.git',
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
    ].join('\n');
    expect(parseGitRemote(cfg)).toBe('git@github.com:u/repo.git');
    expect(parseGitRemote('[core]\n')).toBe('');
  });

  it('strips userinfo from https remotes', () => {
    expect(redactRemoteUrl('https://user:secret@github.com/u/r.git')).toBe(
      'https://github.com/u/r.git',
    );
    expect(redactRemoteUrl('git@github.com:u/r.git')).toBe('git@github.com:u/r.git');
  });
});

describe('note text analysis', () => {
  it('parses frontmatter tags in array / csv / list forms', () => {
    expect(parseFrontmatterTags('---\ntags: [仕事, "読書"]\n---\nbody')).toEqual(['仕事', '読書']);
    expect(parseFrontmatterTags('---\ntags: a, b\n---\n')).toEqual(['a', 'b']);
    expect(parseFrontmatterTags('---\ntags:\n  - x\n  - y\ntitle: t\n---\n')).toEqual(['x', 'y']);
    expect(parseFrontmatterTags('no frontmatter #tag')).toEqual([]);
    expect(parseFrontmatterTags('---\ntitle: t\n---\n')).toEqual([]);
  });

  it('extracts inline tags but not headings or code', () => {
    const text = '# 見出し\n本文 #仕事 と #読書メモ。\n```\n#code\n```\n末尾 #end';
    expect(extractInlineTags(text)).toEqual(['仕事', '読書メモ', 'end']);
  });

  it('counts wikilinks and words, ignoring code fences', () => {
    const text = 'hello world [[リンク]] and [[b|c]]\n```\n[[not-a-link]] many words here\n```';
    expect(countWikiLinks(text)).toBe(2);
    expect(countWords('a b  c\n\nd')).toBe(4);
    expect(countWords('')).toBe(0);
  });

  it('summarizes a note: title/folder from path, tags merged and deduped', () => {
    const n = summarizeNote(
      '仕事/会議メモ.md',
      '---\ntags: [仕事]\n---\n# 会議\n本文 #仕事 #議事録 [[次回]]',
      '2026-11-20T00:00:00.000Z',
    );
    expect(n.title).toBe('会議メモ');
    expect(n.folder).toBe('仕事');
    expect(n.tags).toEqual(['仕事', '議事録']);
    expect(n.links).toBe(1);
    expect(n.words).toBeGreaterThan(0);
  });
});

describe('buildObsidianSnapshot', () => {
  it('returns an honest not-found snapshot when no vault is detected', () => {
    const snap = buildObsidianSnapshot({ ...found, found: false });
    expect(snap.vault.name).toBe('未検出');
    expect(snap.vault.path).toBe('');
    expect(snap.notes).toEqual([]);
    expect(snap.workflows).toEqual([]);
    expect(snap.security).toEqual([
      {
        id: 'vault-missing',
        item: 'Vault が見つかりません',
        status: 'action',
        detail:
          'Obsidian の設定 (obsidian.json) が無いか、登録された Vault のフォルダが存在しません。Obsidian で Vault を開くと検出できます',
      },
    ]);
  });

  it('aggregates counts and lists recent notes newest-first, capped at 10', () => {
    const notes = Array.from({ length: 12 }, (_, i) =>
      note({
        relPath: `n${i}.md`,
        title: `n${i}`,
        words: 10,
        links: 1,
        updatedIso: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    const snap = buildObsidianSnapshot({ ...found, notes });
    expect(snap.vault.noteCount).toBe(12);
    expect(snap.vault.totalWords).toBe(120);
    expect(snap.notes).toHaveLength(10);
    expect(snap.notes[0]?.title).toBe('n11');
    expect(snap.vault.gitRemote).toBe('https://github.com/u/myvault.git');
    expect(snap.vault.encrypted).toBe(false);
  });

  it('grades git state: remote ok / git-only warn / no-git action', () => {
    const ok = buildObsidianSnapshot(found);
    expect(ok.security.find((s) => s.id === 'git-remote')?.status).toBe('ok');
    const warn = buildObsidianSnapshot({ ...found, gitRemote: '' });
    expect(warn.security.find((s) => s.id === 'git-remote')?.status).toBe('warn');
    const action = buildObsidianSnapshot({ ...found, gitRemote: '', hasGit: false });
    expect(action.security.find((s) => s.id === 'git-remote')?.status).toBe('action');
  });

  it('reports git-crypt as encrypted, and link totals in the config check', () => {
    const snap = buildObsidianSnapshot({
      ...found,
      gitCrypt: true,
      notes: [note({ links: 3 }), note({ relPath: 'b.md', links: 4 })],
    });
    expect(snap.vault.encrypted).toBe(true);
    expect(snap.security.find((s) => s.id === 'encryption')?.status).toBe('ok');
    expect(snap.security.find((s) => s.id === 'vault-config')?.detail).toContain('内部リンク 7 件');
  });

  it('adds a scan-cap warning when truncated, and reflects plugin states', () => {
    const snap = buildObsidianSnapshot({ ...found, truncated: true, gitPluginEnabled: false });
    expect(snap.security.some((s) => s.id === 'scan-cap')).toBe(true);
    expect(snap.workflows.find((w) => w.id === 'git-sync')).toMatchObject({ automated: false });
    expect(snap.workflows.find((w) => w.id === 'daily-notes')).toMatchObject({ automated: true });
    expect(snap.workflows.find((w) => w.id === 'templates')).toMatchObject({ automated: false });
  });
});

describe('fetchObsidianSnapshot (live)', () => {
  it('reads the local machine without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchObsidianSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    // この VM には Obsidian が無いので「未検出」が正直な結果。
    expect(typeof snap.vault.noteCount).toBe('number');
    expect(Array.isArray(snap.notes)).toBe(true);
  });
});
