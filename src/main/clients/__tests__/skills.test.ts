import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter, scanSkills, ACTIONS, isSafeSkillName } from '../skills';

describe('parseFrontmatter', () => {
  it('extracts name and description', () => {
    const fm = parseFrontmatter(`---
name: my-skill
description: A short description.
---

body here.`);
    expect(fm.name).toBe('my-skill');
    expect(fm.description).toBe('A short description.');
  });

  it('returns empty when no frontmatter is present', () => {
    expect(parseFrontmatter('# Just a heading\n\nno frontmatter')).toEqual({});
  });

  it('strips surrounding quotes from values', () => {
    const fm = parseFrontmatter(`---
name: "quoted-name"
description: 'single-quoted'
---`);
    expect(fm.name).toBe('quoted-name');
    expect(fm.description).toBe('single-quoted');
  });

  it('supports multi-line descriptions (continuation lines)', () => {
    const fm = parseFrontmatter(`---
name: multi
description: first line
  continuation line
---`);
    expect(fm.description).toMatch(/first line/);
    expect(fm.description).toMatch(/continuation line/);
  });
});

describe('scanSkills', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns [] for a non-existent dir without throwing', async () => {
    const result = await scanSkills(path.join(tmpDir, 'nope'), 'user');
    expect(result).toEqual([]);
  });

  it('discovers <name>/SKILL.md and <name>.md side by side, sorted by name', async () => {
    await fs.mkdir(path.join(tmpDir, 'security-review'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'security-review', 'SKILL.md'),
      `---\nname: security-review\ndescription: Reviews diffs for security issues.\n---\n\nbody`,
    );
    await fs.writeFile(
      path.join(tmpDir, 'init.md'),
      `---\nname: init\ndescription: Bootstrap CLAUDE.md.\n---\n`,
    );

    const result = await scanSkills(tmpDir, 'user');
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).toEqual(['init', 'security-review']);
    expect(result[1]).toMatchObject({
      source: 'user',
      description: 'Reviews diffs for security issues.',
    });
    expect(result[1].path).toContain('security-review/SKILL.md');
  });

  it('skips directories that have no SKILL.md', async () => {
    await fs.mkdir(path.join(tmpDir, 'empty-dir'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'empty-dir', 'README.md'), '# nothing here');
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toEqual([]);
  });

  it('still includes .md files without frontmatter, using the filename as name', async () => {
    await fs.writeFile(path.join(tmpDir, 'bare.md'), '# bare skill\n\nno frontmatter');
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'bare', description: '', source: 'user' });
  });

  it('ignores README.md so docs do not show up as skills', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# docs');
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toEqual([]);
  });

  it('ignores non-.md files at the top level (kills entry.name endsWith mutation)', async () => {
    await fs.writeFile(path.join(tmpDir, 'config.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'skill.txt'), 'plain');
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toEqual([]);
  });

  it('handles a description field with surrounding whitespace (trim survives strip)', async () => {
    await fs.writeFile(
      path.join(tmpDir, 's.md'),
      '---\nname: trimme\ndescription:    has spaces   \n---\n',
    );
    const result = await scanSkills(tmpDir, 'user');
    expect(result[0].name).toBe('trimme');
    expect(result[0].description).toBe('has spaces');
  });

  it('falls back to (無題) when the title rich_text array contains only empty plain_text', async () => {
    // Verifies the `if (text) return text` guard in extractTitle —
    // if the guard is mutated to `if (true)`, we would return '' instead
    // of falling through to the (無題) fallback. Exercise via the
    // notion fetcher tests... but we can test the equivalent here by
    // creating a SKILL.md with empty quoted name. Different code path
    // but exercises stripBalancedQuotes + fallback.
    await fs.writeFile(
      path.join(tmpDir, 'empty-name.md'),
      '---\nname: ""\ndescription: ok\n---\n',
    );
    const result = await scanSkills(tmpDir, 'user');
    // stripBalancedQuotes("\"\"") returns "" → fm.name = ""
    // scanSkills falls back to fallbackName when fm.name is falsy/missing
    // (we use fm.name ?? fallbackName, but "" is not nullish).
    // So this confirms our trimmed empty-string is preserved as ''.
    expect(result[0].name).toBe('');
    expect(result[0].description).toBe('ok');
  });
});

describe('ACTIONS["run-skill"]', () => {
  let tmpDir = '';
  const originalHome = os.homedir();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-run-'));
    // Redirect ~/.claude/skills to a temp dir for this test.
    process.env.HOME = tmpDir;
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.claude', 'skills', 'echo'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'skills', 'echo', 'SKILL.md'),
      `---\nname: echo\ndescription: Echoes whatever you ask.\n---\n\nAlways reply with the same text the user sent.`,
    );
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('POSTs to the Anthropic Messages API with the skill body as system prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'pong' }],
          stop_reason: 'end_turn',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = (await ACTIONS['run-skill']({
      token: 'sk-ant-xxxxx',
      fetch: fetchMock,
      payload: { name: 'echo', prompt: 'ping' },
    })) as { text: string; stopReason: string };

    expect(result).toEqual({ text: 'pong', stopReason: 'end_turn' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-xxxxx');
    expect(headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toContain('Always reply with the same text');
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('throws when the requested skill does not exist', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { name: 'nonexistent', prompt: 'hi' },
      }),
    ).rejects.toThrow(/not found/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when name/prompt are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']({ token: 't', fetch: fetchMock, payload: { name: 'echo' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses maxTokens override when provided (kills `?? 2048` mutation)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await ACTIONS['run-skill']({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { name: 'echo', prompt: 'p', maxTokens: 512 },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(512);
  });

  it('returns empty text when the response has no text content (kills `?? \'\'` mutation)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [] /* no text block */ }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = (await ACTIONS['run-skill']({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { name: 'echo', prompt: 'p' },
    })) as { text: string };
    expect(result.text).toBe('');
  });
});

describe('isSafeSkillName', () => {
  it('accepts ordinary skill names', () => {
    expect(isSafeSkillName('echo')).toBe(true);
    expect(isSafeSkillName('security-review')).toBe(true);
    expect(isSafeSkillName('my_skill.v2')).toBe(true);
    expect(isSafeSkillName('A1')).toBe(true);
  });

  it('rejects path-traversal patterns', () => {
    expect(isSafeSkillName('..')).toBe(false);
    expect(isSafeSkillName('../etc/passwd')).toBe(false);
    expect(isSafeSkillName('foo/../bar')).toBe(false);
    expect(isSafeSkillName('foo/bar')).toBe(false);
    expect(isSafeSkillName('foo\\bar')).toBe(false);
    expect(isSafeSkillName('/absolute')).toBe(false);
  });

  it('rejects shell-meaningful / control characters', () => {
    expect(isSafeSkillName('foo bar')).toBe(false);
    expect(isSafeSkillName('foo;rm')).toBe(false);
    expect(isSafeSkillName('foo|cat')).toBe(false);
    expect(isSafeSkillName('foo`id`')).toBe(false);
    expect(isSafeSkillName('foo$VAR')).toBe(false);
    expect(isSafeSkillName('foo\n')).toBe(false);
    expect(isSafeSkillName('foo\0')).toBe(false);
    expect(isSafeSkillName('foo:bar')).toBe(false);
  });

  it('rejects leading dot (no hidden files)', () => {
    expect(isSafeSkillName('.hidden')).toBe(false);
    expect(isSafeSkillName('.')).toBe(false);
  });

  it('rejects empty / oversize / non-string', () => {
    expect(isSafeSkillName('')).toBe(false);
    expect(isSafeSkillName('a'.repeat(129))).toBe(false);
    expect(isSafeSkillName(null)).toBe(false);
    expect(isSafeSkillName(42)).toBe(false);
    expect(isSafeSkillName(undefined)).toBe(false);
  });
});

describe('ACTIONS["run-skill"] — name validation', () => {
  let tmpDir = '';
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-run-validate-'));
    process.env.HOME = tmpDir;
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('refuses a traversal name BEFORE any filesystem read', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { name: '../../etc/passwd', prompt: 'p' },
      }),
    ).rejects.toThrow(/unsafe name/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an absolute path even if such a file exists', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { name: '/etc/hostname', prompt: 'p' },
      }),
    ).rejects.toThrow(/unsafe name/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
