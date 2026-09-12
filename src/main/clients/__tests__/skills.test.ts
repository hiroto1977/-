import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter, scanSkills, ACTIONS, isSafeSkillName, fetchSkillsSnapshot, SKILLS_MAX_TOKENS } from '../skills';
import type { SkillEntry } from '../skills';
import { shadowedSkillIdNote, unsafeSkillIdNote } from '../../../shared/skillIdentity';
import { SNAPSHOT } from '../../../renderer/data/snapshot';
import { FetchError } from '../types';
import {
  ASSISTANT_REPLY_TRUNCATED_NOTICE,
  MAX_ASSISTANT_CONTENT_CHARS,
  MAX_ASSISTANT_REPLY_CHARS,
  inputTooLongMessage,
} from '../../../shared/assistantLimits';

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

  it('extracts name with NO space after the colon (kills `\\s*` → `\\s` AND `\\s` → `\\S`)', () => {
    // Original /^name:\s*(.+)$/m matches with 0 spaces.
    //   * → drop: /^name:\s(.+)$/m requires EXACTLY 1 space → fails → name undefined.
    //   \s → \S: /^name:\S*(.+)$/m greedily consumes "value" as \S*, then backtracks
    //            so .+ captures the tail char → name = 'e' instead of 'value'.
    const fm = parseFrontmatter('---\nname:value-no-space\n---\n');
    expect(fm.name).toBe('value-no-space');
  });

  it('extracts name with multiple spaces after the colon (kills `\\s*` → `\\s` mutation)', () => {
    // Original regex /^name:\s*(.+)$/m matches zero-or-more spaces.
    // `\s` (exactly one) would fail with double-space or tab+space.
    const fm = parseFrontmatter('---\nname:   triple-space\n---\n');
    expect(fm.name).toBe('triple-space');
  });

  it('extracts name with a tab character (kills `\\s` → `\\S` mutation)', () => {
    // \S would refuse whitespace entirely and the regex would fail to
    // capture the value. Tab is part of \s, so original accepts.
    const fm = parseFrontmatter('---\nname:\tafter-tab\n---\n');
    expect(fm.name).toBe('after-tab');
  });

  it('trims trailing whitespace from extracted name (kills `.trim` MethodExpression drop)', () => {
    // Without .trim, the captured value would include trailing spaces:
    // capture would be "name-with-trail   " instead of "name-with-trail".
    const fm = parseFrontmatter('---\nname: name-with-trail   \ndescription: ok\n---\n');
    expect(fm.name).toBe('name-with-trail');
    expect(fm.name).not.toMatch(/ $/); // no trailing space leak
  });

  it('trims trailing whitespace from extracted description', () => {
    const fm = parseFrontmatter('---\nname: x\ndescription: descr-with-trail   \n---\n');
    expect(fm.description).toBe('descr-with-trail');
    expect(fm.description).not.toMatch(/ $/);
  });

  it('does NOT parse frontmatter from the body of the doc (kills outer `^` anchor drop)', () => {
    // Without the leading `^` anchor on the delimiter regex
    // (`^---\r?\n...---/`), a docs-like body that contains a `---`
    // block in the middle could be mis-parsed. Original requires
    // the doc to START with `---`. Pin that.
    const fm = parseFrontmatter('intro paragraph\n\n---\nname: smuggled\ndescription: hidden\n---\nbody');
    expect(fm.name).toBeUndefined();
    expect(fm.description).toBeUndefined();
  });

  it('rejects "name:" outside frontmatter lines (kills `^` anchor drop)', () => {
    // Without ^ anchor, /name:\s*(.+)$/m could match "x name: smuggled"
    // in body text. With ^ anchor it must start at line start.
    // Build a doc where the only `name:` line lives in the body.
    const fm = parseFrontmatter(
      '---\ndescription: only descr\n---\n\nbody mentions name: smuggled here',
    );
    expect(fm.name).toBeUndefined();
    // Note: we don't assert the inverse (mutation captures "smuggled here")
    // because the body comes AFTER the frontmatter regex's terminating ---,
    // so the mutated regex would still NOT find it in match[1]. Anchor
    // drift here is covered by the `extracts name and description` test.
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

  it('returns [] specifically for ENOENT, not for ANY error (kills `if (true) return []` mutation)', async () => {
    const enoent = new Error('ENOENT: no such file');
    (enoent as NodeJS.ErrnoException).code = 'ENOENT';
    const readDir = vi.fn(async () => {
      throw enoent;
    });
    const result = await scanSkills('/whatever', 'user', readDir);
    expect(result).toEqual([]);
  });

  it('rethrows non-ENOENT errors (e.g. EACCES) — kills `if (err.code === "ENOENT")` → `true`', async () => {
    // Injected readDir throws EACCES. Original code rethrows; mutated
    // `if (true) return []` would return [] instead.
    const eacces = new Error('EACCES: permission denied');
    (eacces as NodeJS.ErrnoException).code = 'EACCES';
    const readDir = vi.fn(async () => {
      throw eacces;
    });
    await expect(scanSkills('/protected', 'user', readDir)).rejects.toThrow(/EACCES/);
  });

  it('rethrows when the error has no code field at all', async () => {
    const readDir = vi.fn(async () => {
      throw new Error('generic boom');
    });
    await expect(scanSkills('/x', 'user', readDir)).rejects.toThrow(/generic boom/);
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
    expect(result.map((s) => s.label)).toEqual(['init', 'security-review']);
    // 鍵と題は別の欄 (パス 179)。この 2 件は frontmatter が実体と同じ名前なので一致する。
    expect(result.map((s) => s.id)).toEqual(['init', 'security-review']);
    expect(result.every((s) => s.runnable)).toBe(true);
    expect(result[1]).toMatchObject({
      source: 'user',
      description: 'Reviews diffs for security issues.',
    });
    // Windows では区切りが \ になるため、期待値も path.join で組み立てる。
    expect(result[1]!.path).toContain(path.join('security-review', 'SKILL.md'));
  });

  it('skips directories that have no SKILL.md', async () => {
    await fs.mkdir(path.join(tmpDir, 'empty-dir'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'empty-dir', 'README.md'), '# nothing here');
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toEqual([]);
  });

  it('sorts results alphabetically even when readdir returns reverse order (kills `results.sort()` drop)', async () => {
    // Inject a readDir stub that GUARANTEES reverse-alpha order
    // regardless of filesystem behavior. Without `.sort()` (mutation),
    // results would come out [zebra, mango, alpha]. With it: [alpha, mango, zebra].
    await fs.writeFile(path.join(tmpDir, 'alpha.md'), '---\nname: alpha\n---\n');
    await fs.writeFile(path.join(tmpDir, 'mango.md'), '---\nname: mango\n---\n');
    await fs.writeFile(path.join(tmpDir, 'zebra.md'), '---\nname: zebra\n---\n');
    const reverseReadDir = async () => {
      const real = await fs.readdir(tmpDir, { withFileTypes: true });
      return real.sort((a, b) => b.name.localeCompare(a.name)); // z → a
    };
    const result = await scanSkills(tmpDir, 'user', reverseReadDir);
    expect(result.map((s) => s.label)).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('still includes .md files without frontmatter, using the filename as name', async () => {
    await fs.writeFile(path.join(tmpDir, 'bare.md'), '# bare skill\n\nno frontmatter');
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'bare', label: 'bare', description: '', source: 'user', runnable: true });
  });

  it('only strips the FINAL .md from the filename (kills `/\\.md$/` → `/\\.md/`)', async () => {
    // A filename like 'legacy.md.notes.md' contains '.md' twice. With
    // the anchored regex, only the trailing one is stripped → 'legacy.md.notes'.
    // Without the $ anchor, the first '.md' goes → 'legacy.notes.md'.
    await fs.writeFile(
      path.join(tmpDir, 'legacy.md.notes.md'),
      '# no frontmatter on this one',
    );
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('legacy.md.notes');
    expect(result[0]!.label).toBe('legacy.md.notes');
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
    // **鍵は実体・題は frontmatter** (パス 179)。ファイルは `s.md` なので鍵は `s`。
    // パス 179 まで両方を 1 つの欄が兼ねており、この項目は押すと
    // `skill "trimme" not found in ~/.claude/skills` で落ちていた。
    expect(result[0]!.id).toBe('s');
    expect(result[0]!.label).toBe('trimme');
    expect(result[0]!.runnable).toBe(true);
    expect(result[0]!.description).toBe('has spaces');
  });

  it('★ `name: ""` は題に使わず鍵を出す (無題の行を作らない・パス 179)', async () => {
    // `stripBalancedQuotes('""')` は `''` を返すので `fm.name` は `''` になる。
    // パス 179 まで `fm.name ?? fallbackName` だったため (`''` は nullish ではない)
    // **題が空の行**が一覧に出ていた —— 選択肢としても空欄で、どれを選んだか読めない。
    // `''` そのものは `parseFrontmatter` の検査が留める (下の describe)。
    await fs.writeFile(
      path.join(tmpDir, 'empty-name.md'),
      '---\nname: ""\ndescription: ok\n---\n',
    );
    expect(parseFrontmatter('---\nname: ""\ndescription: ok\n---\n').name).toBe('');
    const result = await scanSkills(tmpDir, 'user');
    expect(result[0]!.label).toBe('empty-name');
    expect(result[0]!.id).toBe('empty-name');
    expect(result[0]!.description).toBe('ok');
  });
});

describe('fetchSkillsSnapshot', () => {
  let tmpDir = '';
  const originalHome = os.homedir();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-snap-'));
    process.env.HOME = tmpDir;
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.claude', 'skills'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'skills', 'one.md'),
      '---\nname: one\ndescription: first\n---\n',
    );
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scans ~/.claude/skills with source="user" and wraps the result in { items }', async () => {
    // Pins:
    //   - StringLiteral on '.claude' (skills.ts:155 path component)
    //   - StringLiteral on 'skills' (skills.ts:155 path component)
    //   - StringLiteral on 'user' (skills.ts:156 source label)
    //   - ObjectLiteral on `{ items }` (skills.ts:157 return shape)
    const snap = await fetchSkillsSnapshot({ token: '' });
    expect(snap).toHaveProperty('items');
    expect(Array.isArray(snap.items)).toBe(true);
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({
      id: 'one',
      label: 'one',
      description: 'first',
      source: 'user',
      runnable: true,
    });
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

    const result = (await ACTIONS['run-skill']!({
      token: 'sk-ant-xxxxx',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'ping' },
    })) as { text: string; stopReason: string };

    expect(result).toEqual({ text: 'pong', stopReason: 'end_turn' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    // Pin request method + content-type so the StringLiteral mutants on
    // skills.ts:210 (method → "") and :214 (content-type → "") die.
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-xxxxx');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toContain('Always reply with the same text');
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('throws when the requested skill does not exist', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { id: 'nonexistent', prompt: 'hi' },
      }),
    ).rejects.toThrow(/not found/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when id/prompt are missing with the literal "id and prompt are required" message', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({ token: 't', fetch: fetchMock, payload: { id: 'echo' } }),
    ).rejects.toThrow(/^id and prompt are required$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('★ prompt が MAX_ASSISTANT_CONTENT_CHARS を超えていれば送らない (パス 112 まで天井が無かった)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({
        token: 'sk-ant-xxxxx',
        fetch: fetchMock,
        payload: { id: 'echo', prompt: 'a'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1) },
      }),
    ).rejects.toThrow(inputTooLongMessage('プロンプト'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('★ 文字列でない id / prompt は必須の断りで止める (JSON にして送らない)', async () => {
    for (const payload of [{ id: 'echo', prompt: { evil: true } }, { id: 5, prompt: 'x' }, { id: ['echo'], prompt: 'x' }]) {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        ACTIONS['run-skill']!({ token: 'sk-ant-xxxxx', fetch: fetchMock, payload }),
      ).rejects.toThrow(/^id and prompt are required$/);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('★ 応答は MAX_ASSISTANT_REPLY_CHARS で打ち切り、切ったことを本文に残す (パス 113 まで天井なし)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'x'.repeat(MAX_ASSISTANT_REPLY_CHARS + 10) }], stop_reason: 'max_tokens' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = (await ACTIONS['run-skill']!({
      token: 'sk-ant-xxxxx',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'ping' },
    })) as { text: string };
    expect(result.text).toHaveLength(MAX_ASSISTANT_REPLY_CHARS + ASSISTANT_REPLY_TRUNCATED_NOTICE.length);
    expect(result.text.endsWith(ASSISTANT_REPLY_TRUNCATED_NOTICE)).toBe(true);
  });

  it('rejects when the prompt is provided but id is empty (same literal message)', async () => {
    // Kills the StringLiteral mutant on skills.ts:198 — pin the exact
    // error text so it cannot drift silently.
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({
        token: 't',
        fetch: fetchMock,
        payload: { id: '', prompt: 'hi' },
      }),
    ).rejects.toThrow(/^id and prompt are required$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves a flat-file skill at ~/.claude/skills/<id>.md (kills `${id}.md` template literal mutation)', async () => {
    // Tests the SECOND candidate path in readSkillBody. The first
    // candidate (~/.claude/skills/<name>/SKILL.md) doesn't exist for
    // 'flat'; the fallback is exercised here. If the template literal
    // were mutated to an empty backtick, path.join would resolve to the
    // base skills directory (a directory, not a file) and readFile
    // would fail — the test would throw.
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'skills', 'flat.md'),
      `---\nname: flat\ndescription: Flat skill.\n---\n\nflat body.`,
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'flat-ok' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = (await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'flat', prompt: 'hi' },
    })) as { text: string };
    expect(result.text).toBe('flat-ok');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.system).toContain('flat body');
  });

  it('surfaces serviceId="skills" in the FetchError on HTTP failure', async () => {
    // Kills StringLiteral mutant on skills.ts:223 (serviceId → "").
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('overloaded', { status: 529 }),
    );
    const err = await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'p' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('skills');
    // jsonFetch builds the message as `${serviceId} ${status}: ...`.
    expect((err as FetchError).message).toMatch(/^skills 529:/);
  });

  /*
   * **payload は有料 API のパラメータを動かせない。**
   *
   * 2026-08-22 まで `maxTokens ?? 2048` / `model ?? default` で、型検査も
   * 有限性検査も無しに payload の値を送っていた。実測すると UI はこの値を
   * 一度も渡していないので、使われていない受け口がレンダラーに
   * 外部 API のパラメータを握らせているだけだった。`assistant.ts` と同じ
   * 「定数」の形へ寄せてある。
   *
   * この検査は**通そうとして落ちる**ことを確かめる側である。
   */
  it.each([
    ['数値', 512],
    ['巨大な値', 100_000_000],
    ['負値', -1],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['文字列', '999999'],
    ['オブジェクト', { n: 999999 }],
    ['null', null],
  ])('payload の maxTokens (%s) は無視される', async (_label, maxTokens) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'p', maxTokens },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(SKILLS_MAX_TOKENS);
  });

  it('payload の model も無視される (送り先モデルを選ばせない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'p', model: 'claude-opus-4-7' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('returns empty text when the response has no text content (kills `?? \'\'` mutation)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [] /* no text block */ }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = (await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'p' },
    })) as { text: string };
    expect(result.text).toBe('');
  });

  it('returns empty text when the response is missing `content` entirely (kills `res.content?` → `res.content`)', async () => {
    // No `content` field at all. If the optional-chaining was mutated
    // away, this would throw "Cannot read properties of undefined".
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ stop_reason: 'end_turn' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = (await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'p' },
    })) as { text: string; stopReason: string };
    expect(result.text).toBe('');
    expect(result.stopReason).toBe('end_turn');
  });

  it('picks the text block when the response leads with a non-text block (kills `c.type === \'text\'` → `true`)', async () => {
    // If the find predicate is mutated to `true`, find returns the FIRST
    // element regardless of type, so we'd get '' (the leading
    // tool_use block has no .text). The original predicate skips past
    // the non-text leader.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            { type: 'tool_use', text: undefined },
            { type: 'text', text: 'pong' },
          ],
          stop_reason: 'end_turn',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = (await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'p' },
    })) as { text: string };
    expect(result.text).toBe('pong');
  });

  it('returns empty stopReason exactly when the response omits stop_reason (kills `?? "Stryker was here!"`)', async () => {
    // Pins the right-hand side of `res.stop_reason ?? ''` to '' so the
    // StringLiteral mutant on skills.ts:231 (→ "Stryker was here!") dies.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'hi' }] /* no stop_reason */ }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = (await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: 'p' },
    })) as { stopReason: string };
    expect(result.stopReason).toBe('');
  });
});

/*
 * **symlink は `path.resolve` を素通りする。**
 *
 * `isSafeSkillName` は `/` も `\\` も `..` も弾くので**字面では**外へ出られないが、
 * `~/.claude/skills/evil.md` を外へ向けた symlink にすると封じ込めの判定は
 * `true` を返す。実測 (2026-08-23) で任意ファイルの中身が読めた。
 *
 * **ここで読んだ中身は Anthropic API へ system として送られる。** スキルは
 * 利用者が配布物として入れる物なので、細工した symlink の同梱は現実的な経路。
 *
 * 下の 2 本は**向きが逆**で、両方要る —— 実体だけ realpath する直し方は
 * 1 本目を通して 2 本目で落ちる。
 */
describe('readSkillBody と symlink', () => {
  let tmpDir = '';
  const originalHome = os.homedir();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-sym-'));
    process.env.HOME = tmpDir;
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.claude', 'skills'), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('skills の外を指す symlink は読まない (中身が API へ出ていかない)', async () => {
    const secret = path.join(tmpDir, 'secret.txt');
    await fs.writeFile(secret, 'TOP-SECRET-FILE-CONTENTS');
    await fs.symlink(secret, path.join(tmpDir, '.claude', 'skills', 'evil.md'));

    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({
        token: 'sk-ant-x',
        payload: { id: 'evil', prompt: 'hi' },
        fetch: fetchMock,
      } as unknown as Parameters<NonNullable<(typeof ACTIONS)['run-skill']>>[0]),
    ).rejects.toThrow(/not found/);

    // 送信そのものが起きないこと (中身が出ていく前に止まる)。
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ホーム自体が symlink 越しでも、正当なスキルは読める (締めすぎない)', async () => {
    /*
     * **根を実体に直さないと、ここが落ちる。**
     *
     * `~` そのものが symlink のことがある (運用でホームを別ボリュームへ逃がす等)。
     * 候補だけ realpath して根を字面のまま比べると、実体は根の「外」に見えるので
     * **正当なスキルまで弾く**。両側を同じ土俵に乗せる必要がある。
     *
     * この検査は根が**本当に symlink 越し**でないと意味を持たない —— 最初に
     * 書いたときは実体のディレクトリを HOME にしていたので、根を字面のまま
     * にする変異を入れても通ってしまった (空撃ちの対照だった)。
     */
    const realHome = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-realhome-'));
    const linkedHome = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'skills-link-')), 'home');
    await fs.symlink(realHome, linkedHome);
    process.env.HOME = linkedHome;
    vi.spyOn(os, 'homedir').mockReturnValue(linkedHome);
    await fs.mkdir(path.join(realHome, '.claude', 'skills'), { recursive: true });

    const real = path.join(linkedHome, '.claude', 'skills', 'real.md');
    await fs.writeFile(real, 'BODY-FROM-REAL-SKILL');
    await fs.symlink(real, path.join(linkedHome, '.claude', 'skills', 'alias.md'));

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await ACTIONS['run-skill']!({
      token: 'sk-ant-x',
      payload: { id: 'alias', prompt: 'hi' },
      fetch: fetchMock,
    } as unknown as Parameters<NonNullable<(typeof ACTIONS)['run-skill']>>[0]);

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      system: string;
    };
    expect(body.system).toBe('BODY-FROM-REAL-SKILL');
  });
});

describe('parseFrontmatter — stripBalancedQuotes coverage', () => {
  it('keeps fm.name as undefined when only description is present', () => {
    // Forces the `if (s === undefined) return undefined` short-circuit
    // in stripBalancedQuotes (kills its ConditionalExpression `false`
    // mutation — without it, the function would try `undefined.match`
    // and throw).
    const fm = parseFrontmatter(`---\ndescription: only this\n---\n`);
    expect(fm.name).toBeUndefined();
    expect(fm.description).toBe('only this');
  });

  it('keeps fm.description as undefined when only name is present', () => {
    const fm = parseFrontmatter(`---\nname: only-name\n---\n`);
    expect(fm.name).toBe('only-name');
    expect(fm.description).toBeUndefined();
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

  it('accepts a name exactly at the 128-char boundary (kills `> 128` → `>= 128` mutation)', () => {
    // EqualityOperator mutation flips `> 128` to `>= 128`, which would
    // reject exactly-128-char names. Pin the boundary.
    expect(isSafeSkillName('a'.repeat(128))).toBe(true);
    expect(isSafeSkillName('a'.repeat(127))).toBe(true);
  });
});

describe('ACTIONS["run-skill"] — id validation', () => {
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
      ACTIONS['run-skill']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { id: '../../etc/passwd', prompt: 'p' },
      }),
    ).rejects.toThrow(/unsafe name/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('truncates unsafe skill id to 32 chars in error (kills `id.slice(0, 32)` → `id`)', async () => {
    const longUnsafe = 'a'.repeat(40) + ' bad-tail-with-secret-data';
    const fetchMock = vi.fn<typeof fetch>();
    let caught: Error | undefined;
    try {
      await ACTIONS['run-skill']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { id: longUnsafe, prompt: 'hi' },
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/unsafe name/);
    expect(caught!.message).not.toContain('bad-tail-with-secret-data');
    expect(caught!.message).not.toContain('secret-data');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an absolute path even if such a file exists', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { id: '/etc/hostname', prompt: 'p' },
      }),
    ).rejects.toThrow(/unsafe name/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/*
 * **列挙も、根の中かどうかを実体で見る。**
 *
 * `readSkillContent` は 2026-08-23 に symlink 越しの読み出しを塞いだが、
 * **列挙側 (`scanSkills`) には同じ手当てが入っていなかった**。
 * `entry.isDirectory()` は symlink では false になるので、名前しか見ない
 * `.md` 判定へ落ち、`fs.readFile` が symlink を辿って根の外を読む。
 *
 * 実測 (2026-08-25、修正前):
 *
 * ```
 *   skills/evil.md -> <root 外>/OUTSIDE-SECRET.md
 *   → {"name":"LEAKED-NAME","description":"TOP-SECRET-DESCRIPTION", …}
 * ```
 *
 * 出るのは frontmatter の 2 欄だけで `readSkillContent` ほど重くないが、
 * **前提条件は同じ** (細工した symlink を含む配布物) なので同じ扱いにする。
 */
describe('scanSkills — 根の外は列挙しない', () => {
  const mkRoot = async (): Promise<string> => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-containment-'));
    await fs.mkdir(path.join(base, 'skills'));
    return base;
  };

  it('★ 根の外へ向いた symlink は列挙しない (frontmatter も出さない)', async () => {
    const root = await mkRoot();
    const skills = path.join(root, 'skills');
    const outside = path.join(root, 'OUTSIDE-SECRET.md');
    await fs.writeFile(outside, '---\nname: LEAKED-NAME\ndescription: TOP-SECRET\n---\nbody\n');
    await fs.symlink(outside, path.join(skills, 'evil.md'));

    const out = await scanSkills(skills, 'user');
    expect(out.map((s) => s.label)).not.toContain('LEAKED-NAME');
    expect(JSON.stringify(out)).not.toContain('TOP-SECRET');
    expect(out).toEqual([]);
  });

  /*
   * **全部弾く実装でも上は通る。** 正当なスキルが残ることまで見ないと、
   * 「読めなくなっただけ」を修正と呼んでしまう。
   */
  it('★ 根の中の実ファイルはこれまでどおり列挙する', async () => {
    const root = await mkRoot();
    const skills = path.join(root, 'skills');
    await fs.writeFile(path.join(skills, 'good.md'), '---\nname: good\ndescription: fine\n---\n');

    const out = await scanSkills(skills, 'user');
    expect(out.map((s) => s.label)).toEqual(['good']);
  });

  /*
   * **「symlink だから弾く」ではなく「根の外だから弾く」。**
   * 根の中を指す symlink は正当な使い方 (整理のための別名) なので通す。
   * 素朴に `isSymbolicLink()` で弾く実装は、ここで落ちる。
   */
  it('根の中を指す symlink は列挙する (弾くのは行き先であって種類ではない)', async () => {
    const root = await mkRoot();
    const skills = path.join(root, 'skills');
    await fs.writeFile(path.join(skills, 'real.md'), '---\nname: real\ndescription: d\n---\n');
    await fs.symlink(path.join(skills, 'real.md'), path.join(skills, 'alias.md'));

    const out = await scanSkills(skills, 'user');
    expect(out.map((s) => s.label).sort()).toEqual(['real', 'real']);
  });

  /*
   * **根そのものが symlink 越しでも、正当なスキルを弾かない。**
   * 実体だけを根にすると、`~` や `.claude` が symlink の環境で全滅する
   * (`readSkillContent` の注記が挙げているのと同じ罠)。
   */
  it('根が symlink 越しでも、中のスキルは列挙する', async () => {
    const root = await mkRoot();
    const skills = path.join(root, 'skills');
    await fs.writeFile(path.join(skills, 'good.md'), '---\nname: good\ndescription: fine\n---\n');
    const linkToSkills = path.join(root, 'skills-link');
    await fs.symlink(skills, linkToSkills);

    const out = await scanSkills(linkToSkills, 'user');
    expect(out.map((s) => s.label)).toEqual(['good']);
  });

  it('壊れた symlink は静かに飛ばす (走査は止めない)', async () => {
    const root = await mkRoot();
    const skills = path.join(root, 'skills');
    await fs.symlink(path.join(root, 'does-not-exist.md'), path.join(skills, 'broken.md'));
    await fs.writeFile(path.join(skills, 'good.md'), '---\nname: good\ndescription: fine\n---\n');

    const out = await scanSkills(skills, 'user');
    expect(out.map((s) => s.label)).toEqual(['good']);
  });
});

/**
 * **一覧が出した物を押したら、その物が走る** (2026-09-12 · パス 179)。
 *
 * 直す前の実測 (この 4 通りを直接呼んで確かめた):
 *
 * | 置いた物 | 一覧の表示 | 実行を押すと |
 * |---|---|---|
 * | `invoice/SKILL.md` · `name: 請求書作成` | 請求書作成 | `skill "請求書作成" has an unsafe name` |
 * | `my-tool/SKILL.md` · `name: helper` | helper | `skill "helper" not found in ~/.claude/skills` |
 * | `alpha/SKILL.md` · `name: beta` + `beta/SKILL.md` | beta | **`beta/SKILL.md` が Anthropic へ** (成功として表示) |
 * | `plain.md` (frontmatter 無し) | plain | 動く |
 *
 * **動いていたのは 4 通りめだけ** —— frontmatter の名前がファイル名と同じときである。
 */
describe('スキルの鍵と題 (パス 179)', () => {
  let home: string;
  let root: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-identity-'));
    root = path.join(home, '.claude', 'skills');
    await fs.mkdir(root, { recursive: true });
    prevHome = process.env.HOME;
    process.env.HOME = home;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(home, { recursive: true, force: true });
  });

  const write = async (rel: string, body: string) => {
    const f = path.join(root, rel);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body, 'utf8');
  };

  /** 画面の「実行」と同じ道を通す (送るのは鍵)。system に載った本文を返す。 */
  const run = async (id: string) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await ACTIONS['run-skill']!({
      token: 't',
      payload: { id, prompt: 'hi' },
      fetch: fetchMock,
    } as never);
    return (JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}')) as { system: string }).system;
  };

  it('★ ① 日本語の `name:` は題になり、鍵はフォルダ名なので実行できる', async () => {
    await write('invoice/SKILL.md', '---\nname: 請求書作成\n---\nBODY-INVOICE\n');
    const [entry] = await scanSkills(root, 'user');
    expect(entry).toMatchObject({ id: 'invoice', label: '請求書作成', runnable: true });
    await expect(run(entry!.id)).resolves.toContain('BODY-INVOICE');
  });

  it('★ ② `name:` がフォルダ名と違っても実行できる (鍵はフォルダ名)', async () => {
    await write('my-tool/SKILL.md', '---\nname: helper\n---\nBODY-MYTOOL\n');
    const [entry] = await scanSkills(root, 'user');
    expect(entry).toMatchObject({ id: 'my-tool', label: 'helper', runnable: true });
    await expect(run(entry!.id)).resolves.toContain('BODY-MYTOOL');
  });

  it('★ ③ 別のスキルの名前を `name:` に書いても、走るのは選んだ物 (元は別物が送られた)', async () => {
    await write('alpha/SKILL.md', '---\nname: beta\n---\nBODY-OF-ALPHA\n');
    await write('beta/SKILL.md', '---\nname: beta-real\n---\nBODY-OF-BETA\n');
    const items = await scanSkills(root, 'user');
    const chosen = items.find((s) => s.label === 'beta');
    expect(chosen?.id).toBe('alpha');
    const sent = await run(chosen!.id);
    expect(sent, 'よその定義が Anthropic へ行っている').toContain('BODY-OF-ALPHA');
    expect(sent, 'パス 179 まではこちらが送られていた').not.toContain('BODY-OF-BETA');
  });

  it('★ ④ frontmatter 無しは今までどおり (鍵 = 題 = ファイル名)', async () => {
    await write('plain.md', 'JUST-BODY\n');
    const [entry] = await scanSkills(root, 'user');
    expect(entry).toMatchObject({ id: 'plain', label: 'plain', runnable: true });
    await expect(run(entry!.id)).resolves.toContain('JUST-BODY');
  });

  it('★ 鍵に使えない字のフォルダは押させない (理由つき)', async () => {
    await write('請求書/SKILL.md', '---\nname: 請求書\n---\nBODY\n');
    const [entry] = await scanSkills(root, 'user');
    expect(entry).toMatchObject({ id: '請求書', label: '請求書', runnable: false });
    expect(entry!.unrunnableReason).toBe(unsafeSkillIdNote('請求書'));
  });

  it('★ 同じ鍵が 2 つあれば、負ける側を押させない (フォルダ形式が勝つ)', async () => {
    await write('dup/SKILL.md', '---\nname: フォルダ側\n---\nBODY-DIR\n');
    await write('dup.md', '---\nname: ファイル側\n---\nBODY-FLAT\n');
    const items = await scanSkills(root, 'user');
    expect(items).toHaveLength(2);
    const dir = items.find((s) => s.path.endsWith(path.join('dup', 'SKILL.md')));
    const flat = items.find((s) => s.path.endsWith(`dup.md`) && !s.path.includes(path.sep + 'dup' + path.sep));
    expect(dir, 'フォルダ側が勝つ (readSkillBody の候補順)').toMatchObject({ runnable: true });
    expect(flat).toMatchObject({ runnable: false });
    expect(flat!.unrunnableReason).toBe(shadowedSkillIdNote('dup', dir!.path));
    // 勝つ側が実際に読まれる (理由の文が言っていることが本当か).
    await expect(run('dup')).resolves.toContain('BODY-DIR');
  });

  it('★ 勝つのは列挙の順ではなく `readSkillBody` の候補順 (フォルダ形式)', async () => {
    /*
     * **この標本が無いと「先頭を勝ちにする」実装と区別できない** ——
     * `readdir` は `dup` を `dup.md` より先に並べるので、素直に書いた標本では
     * 偶然どちらの規則でも同じ答えになる (対照 C12 が鳴らないことで分かった)。
     * 列挙の順を**逆にして**渡し、候補順が効いていることを見る。
     */
    await write('dup/SKILL.md', '---\nname: フォルダ側\n---\nBODY-DIR\n');
    await write('dup.md', '---\nname: ファイル側\n---\nBODY-FLAT\n');
    const flatFirst = async () => {
      const real = await fs.readdir(root, { withFileTypes: true });
      return real.sort((a, b) => b.name.localeCompare(a.name)); // dup.md → dup
    };
    const items = await scanSkills(root, 'user', flatFirst);
    const dir = items.find((s) => s.label === 'フォルダ側');
    const flat = items.find((s) => s.label === 'ファイル側');
    expect(dir, '列挙が後でもフォルダ形式が勝つ').toMatchObject({ runnable: true });
    expect(flat, '列挙が先でもファイル形式は負ける').toMatchObject({ runnable: false });
    expect(flat!.unrunnableReason).toBe(shadowedSkillIdNote('dup', dir!.path));
    // 実際に読まれるのもフォルダ側 (理由の文が言っていることが本当か)。
    await expect(run('dup')).resolves.toContain('BODY-DIR');
  });

  it('★ 実行できない項目は理由を持ち、実行できる項目は持たない (片方だけ埋まる)', async () => {
    await write('ok/SKILL.md', '---\nname: 通る\n---\nB\n');
    await write('だめ/SKILL.md', '---\nname: 通らない\n---\nB\n');
    const items = await scanSkills(root, 'user');
    // 標本に両方が在ること —— 片方しか無い標本では「片方だけ埋まる」を見ていない。
    expect(items.filter((s) => s.runnable)).toHaveLength(1);
    expect(items.filter((s) => !s.runnable)).toHaveLength(1);
    for (const s of items) {
      if (s.runnable) expect(s.unrunnableReason, `${s.id}: 実行できるのに理由が在る`).toBe('');
      else expect(s.unrunnableReason.length, `${s.id}: 実行できないのに理由が無い`).toBeGreaterThan(20);
    }
  });

  it('★ 題で並ぶ (画面の順と同じ)', async () => {
    await write('z/SKILL.md', '---\nname: あ\n---\nB\n');
    await write('a/SKILL.md', '---\nname: ん\n---\nB\n');
    expect((await scanSkills(root, 'user')).map((s) => s.label)).toEqual(['あ', 'ん']);
  });

  it('★ 同梱の形と取ってきた形の欄が一致する (空配列なので shapeDiff は見ない)', async () => {
    await write('shape/SKILL.md', '---\nname: 形\ndescription: d\n---\nB\n');
    const [entry] = await scanSkills(root, 'user');
    /*
     * この literal は `SkillEntry` と**同梱の要素型の両方**として型検査を通る。
     * 片方に欄が増えれば `npm run typecheck` が落ちる (実行時には拾えない向き)。
     * 実行時は「fetcher が欄を出さなくなった」側を見る。
     */
    const sample: SkillEntry & (typeof SNAPSHOT.skills.items)[number] = {
      id: 'x',
      label: 'X',
      description: '',
      source: 'user',
      path: '/x',
      runnable: true,
      unrunnableReason: '',
    };
    expect(Object.keys(entry!).sort()).toEqual(Object.keys(sample).sort());
  });
});
