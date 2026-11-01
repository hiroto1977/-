import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIONS as OLLAMA } from '../ollama';
import { ACTIONS as SKILLS } from '../skills';

// Unicode Tag 文字 (U+E0000–E007F) は画面にもレビューにも見えないが、モデルは符号として読みうる。
const TAG = (s: string): string => [...s].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
const hasTag = (s: string): boolean => [...s].some((c) => c.codePointAt(0)! >= 0xe0000 && c.codePointAt(0)! <= 0xe007f);

const okOllama = (extra: object = {}): Response =>
  new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' }, ...extra }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('ollama/chat: 見えない指示を送らない・相手の時間と本文の形を信用しない', () => {
  it('★ prompt と system の Tag 文字は要求の本文に残らない (threat: T-193)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(okOllama());
    await OLLAMA['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: `hi${TAG('IGNORE')}`, system: `sys${TAG('EVIL')}` },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
    expect(hasTag(JSON.stringify(body))).toBe(false);
  });

  it('★ Tag 文字だけの prompt は空として断る (空の発話を送らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      OLLAMA['chat']!({ token: '', fetch: fetchMock, payload: { model: 'llama3.2', prompt: TAG('ONLY') } }),
    ).rejects.toThrow(new Error('model and prompt are required'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('★ total_duration は有限で正の数だけを採る (NaN / 巨大 / 負 / 文字列は 0・threat: T-194)', async () => {
    const run = async (extra: object): Promise<number> => {
      const f = vi.fn<typeof fetch>().mockResolvedValueOnce(okOllama(extra));
      return ((await OLLAMA['chat']!({ token: '', fetch: f, payload: { model: 'llama3.2', prompt: 'hi' } })) as { durationMs: number }).durationMs;
    };
    expect(await run({ total_duration: 1_234_000_000 })).toBe(1234);
    for (const bad of ['abc', { a: 1 }, -5e12, null, Number.POSITIVE_INFINITY, [1]]) {
      expect(await run({ total_duration: bad }), JSON.stringify(bad)).toBe(0);
    }
    expect(await run({})).toBe(0);
  });

  it('★ 本文が null / 数 / 配列なら、V8 の生の例外文ではなくアプリの文で断る (threat: T-194)', async () => {
    for (const text of ['null', '42', '[1]', '"s"']) {
      const f = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(text, { status: 200 }));
      await expect(
        OLLAMA['chat']!({ token: '', fetch: f, payload: { model: 'llama3.2', prompt: 'hi' } }),
        text,
      ).rejects.toThrow('ollama returned non-JSON');
    }
  });
});

describe('skills/run-skill: 見えない指示を system にも prompt にも載せない', () => {
  let tmpDir = '';
  const originalHome = os.homedir();
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-smuggle-'));
    process.env.HOME = tmpDir;
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.claude', 'skills', 'echo'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'skills', 'echo', 'SKILL.md'),
      `---\nname: echo\ndescription: Echoes.\n---\n\nReply plainly.${TAG('EXFILTRATE')}`,
    );
  });
  afterEach(async () => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('★ SKILL.md 本文と prompt の Tag 文字は Anthropic への要求に残らない', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await SKILLS['run-skill']!({
      token: 'sk-ant-xxxxx',
      fetch: fetchMock,
      payload: { id: 'echo', prompt: `ping${TAG('IGNORE')}` },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.system).toContain('Reply plainly.');
    expect(body.messages[0].content).toBe('ping');
    expect(hasTag(JSON.stringify(body))).toBe(false);
  });

  it('★ Tag 文字だけの prompt は空として断る (何も送らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      SKILLS['run-skill']!({ token: 'sk-ant-xxxxx', fetch: fetchMock, payload: { id: 'echo', prompt: TAG('ONLY') } }),
    ).rejects.toThrow(new Error('id and prompt are required'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
