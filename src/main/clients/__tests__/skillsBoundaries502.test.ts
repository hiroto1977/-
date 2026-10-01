/**
 * **スキルの天井の境目・空入力・失敗の枝・断りの文面を、値ごとに留める。** (2026-09-30 · パス 502)
 *
 * `skills.ts` はスキル本文を **system プロンプトとして丸ごと有料 API へ送る**口で、天井が 3 つ在る
 * (読む前の byte・読んだ後の字・発話の字)。全掃引の変異検査 (run 36784826064) が、どれも
 * 「境目ちょうど」と「失敗の枝」と「文面」を誰も主張していないことを残していた:
 *
 * | 変異体 | 何が観測できるか |
 * | --- | --- |
 * | `st.size > MAX_SKILL_FILE_BYTES` → `>=` (2 か所) | UTF-8 は 1 字 4 byte までなので、**天井ちょうどの字数を 4 byte 字だけで書いたファイル**は byte も天井ちょうどになる。それは天井以内なので**通さなければならない** (`>=` だと正当なスキルを断る) |
 * | `countChars(body) > MAX_ASSISTANT_SYSTEM_CHARS` → `>=` | 字が天井ちょうどの本文は送れる |
 * | `countChars(prompt) > MAX_ASSISTANT_CONTENT_CHARS` → `>=` | 発話が天井ちょうどなら送れる |
 * | `prompt.length === 0` → `false` | 空の発話は必須の断りで止める (有料 API へ空を送らない) |
 * | `.catch(() => null)` → `() => undefined` / `st === null` → `false` | 大きさを読む間に消された物は**飛ばす / 次の候補へ進む** (落ちない) |
 * | `description: ''` / `fm.description ?? ''` | 断った行も欄の値は決まっている (byte の門は読まないので空・字の門は frontmatter から) |
 * | `inputTooLongMessage('スキル本文', …)` の `'スキル本文'` | 断りの文面 (一覧の理由と run-skill の例外が同じ 1 文) |
 *
 * 期待値は**原文の式の写しにしない** —— 文面は字面で、境目は「天井ちょうどの標本」で組む
 * (原文と同じ式で期待値を作ると、原文が変わったときに両辺が一緒に動いて素通りする)。
 *
 * ★ **`markRunnable` の形消し (パス 502) が要る検査もここに在る** —— 初期値を「実行できない」から
 *   「実行できる」へ替え、最後の「実行できる」への上書きを消したので、**既に理由が付いた行を
 *   上書きしない**守り (`unrunnableReason !== ''`) は「長すぎる + 鍵が使えない」「長すぎる + 負け側」
 *   の行でだけ観測できる。下の 3 件がその優先順位 (長すぎるが先) を留める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIONS, MAX_SKILL_FILE_BYTES, scanSkills, skillTooLongNote } from '../skills';
import { MAX_ASSISTANT_CONTENT_CHARS, MAX_ASSISTANT_SYSTEM_CHARS } from '../../../shared/assistantLimits';
import { shadowedSkillIdNote, unsafeSkillIdNote } from '../../../shared/skillIdentity';

/** 1 字 4 byte の文字 (BMP の外)。`countChars` は 1 字、UTF-8 では 4 byte。 */
const FOUR_BYTE_CHAR = '😀';

/** スキルの天井の断りの文面 (字面)。天井の数は定数から —— 数を写すと天井を動かした日に古びる。 */
const TOO_LONG_TEXT = `スキル本文が長すぎます (${MAX_ASSISTANT_SYSTEM_CHARS} 字以内)`;

function okResponse(): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** `fs.stat` を、名指しした末尾の物だけ「読む間に消された」ことにする (残りは実物)。 */
function statRacesAwayFor(suffix: string): void {
  const realStat = fs.stat.bind(fs);
  vi.spyOn(fs, 'stat').mockImplementation(((p: Parameters<typeof fs.stat>[0]) =>
    String(p).endsWith(suffix) ? Promise.reject(new Error('ENOENT: 読む間に消えた')) : realStat(p)) as unknown as typeof fs.stat);
}

describe('スキルの断りの文面は字面で固定する', () => {
  it('★ `skillTooLongNote()` は「スキル本文が長すぎます (天井 字以内)」(ラベルと書式を値ごと)', () => {
    expect(skillTooLongNote()).toBe(TOO_LONG_TEXT);
  });
});

describe('scanSkills: 読む前の byte の門と、読んだ後の字の門の境目', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-502-scan-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('★ 4 byte 字だけで天井ちょうどの字数 = byte も天井ちょうどのファイルは、byte の門では止めず実行できる', async () => {
    const body = FOUR_BYTE_CHAR.repeat(MAX_ASSISTANT_SYSTEM_CHARS);
    // 標本が的に当たっている: byte は門の値ちょうど・字は天井ちょうど。
    expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_SKILL_FILE_BYTES);
    expect([...body]).toHaveLength(MAX_ASSISTANT_SYSTEM_CHARS);
    const file = path.join(tmpDir, 'edge.md');
    await fs.writeFile(file, body);
    const readSpy = vi.spyOn(fs, 'readFile');
    const result = await scanSkills(tmpDir, 'user');
    expect(result).toEqual([
      { id: 'edge', label: 'edge', description: '', source: 'user', path: file, runnable: true, unrunnableReason: '' },
    ]);
    // byte の門は「読まずに断る」ための物で、ここでは読まれている (字で数えて通った)。
    expect(readSpy.mock.calls.some((c) => String(c[0]).endsWith('edge.md'))).toBe(true);
  });

  it('★ 4 byte 字が天井より 1 字多い (byte は門の値を超える) ファイルは読まずに断り、欄の値まで決まっている', async () => {
    const body = FOUR_BYTE_CHAR.repeat(MAX_ASSISTANT_SYSTEM_CHARS + 1);
    expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_SKILL_FILE_BYTES + 4);
    const file = path.join(tmpDir, 'over.md');
    await fs.writeFile(file, body);
    const readSpy = vi.spyOn(fs, 'readFile');
    const result = await scanSkills(tmpDir, 'user');
    // byte の門は読まないので、題は名前・説明は空 (読めば frontmatter が在っても使わない)。
    expect(result).toEqual([
      {
        id: 'over',
        label: 'over',
        description: '',
        source: 'user',
        path: file,
        runnable: false,
        unrunnableReason: TOO_LONG_TEXT,
      },
    ]);
    expect(readSpy.mock.calls.some((c) => String(c[0]).endsWith('over.md'))).toBe(false);
  });

  it('★ 字の門で断った行は、題と説明を frontmatter から持つ (無ければ題は名前・説明は空文字)', async () => {
    const head = '---\nname: Long Name\ndescription: Long Desc\n---\n';
    await fs.writeFile(path.join(tmpDir, 'long-full.md'), head + 'a'.repeat(MAX_ASSISTANT_SYSTEM_CHARS));
    await fs.writeFile(path.join(tmpDir, 'long-bare.md'), 'a'.repeat(MAX_ASSISTANT_SYSTEM_CHARS + 1));
    // どちらも byte は門の値より小さい (読んでから字で断る道)。
    expect(head.length + MAX_ASSISTANT_SYSTEM_CHARS).toBeLessThan(MAX_SKILL_FILE_BYTES);
    const result = await scanSkills(tmpDir, 'user');
    // 並びは題の照合順 (環境の照合規則に依る) なので、id で引いて見る。
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.id === 'long-bare')).toEqual({
      id: 'long-bare',
      label: 'long-bare',
      description: '',
      source: 'user',
      path: path.join(tmpDir, 'long-bare.md'),
      runnable: false,
      unrunnableReason: TOO_LONG_TEXT,
    });
    expect(result.find((e) => e.id === 'long-full')).toEqual({
      id: 'long-full',
      label: 'Long Name',
      description: 'Long Desc',
      source: 'user',
      path: path.join(tmpDir, 'long-full.md'),
      runnable: false,
      unrunnableReason: TOO_LONG_TEXT,
    });
  });

  it('★ 大きさを読む間に消されたファイルは飛ばす (走査は止まらず、残りは列挙される)', async () => {
    await fs.writeFile(path.join(tmpDir, 'gone.md'), 'x');
    await fs.writeFile(path.join(tmpDir, 'kept.md'), '---\nname: Kept\n---\nok');
    statRacesAwayFor('gone.md');
    const result = await scanSkills(tmpDir, 'user');
    expect(result.map((e) => e.id)).toEqual(['kept']);
    expect(result[0]).toMatchObject({ label: 'Kept', runnable: true });
  });
});

describe('scanSkills: 理由が既に付いた行は、鍵の問題で上書きしない (長すぎるが先)', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-502-reason-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const tooLong = (): string => 'a'.repeat(MAX_ASSISTANT_SYSTEM_CHARS + 1);

  it('★ 長すぎる + 鍵に使えない字 (日本語の名前) —— 理由は「長すぎる」のまま', async () => {
    await fs.writeFile(path.join(tmpDir, '長い.md'), tooLong());
    const [entry] = await scanSkills(tmpDir, 'user');
    expect(entry).toMatchObject({ id: '長い', runnable: false, unrunnableReason: TOO_LONG_TEXT });
    // 標本が的に当たっている: この名前は鍵の問題でも断られる (降ろす側の文が別に在る)。
    expect(unsafeSkillIdNote('長い')).not.toBe(TOO_LONG_TEXT);
  });

  it('★ 長すぎる + 同じ鍵の負け側 (フォルダ形式が勝つ) —— 理由は「長すぎる」のまま', async () => {
    await fs.mkdir(path.join(tmpDir, 'dup'));
    await fs.writeFile(path.join(tmpDir, 'dup', 'SKILL.md'), 'ok');
    await fs.writeFile(path.join(tmpDir, 'dup.md'), tooLong());
    const items = await scanSkills(tmpDir, 'user');
    const flat = items.find((e) => e.path === path.join(tmpDir, 'dup.md'));
    const dir = items.find((e) => e.path === path.join(tmpDir, 'dup', 'SKILL.md'));
    expect(dir).toMatchObject({ runnable: true, unrunnableReason: '' });
    expect(flat).toMatchObject({ runnable: false, unrunnableReason: TOO_LONG_TEXT });
    expect(shadowedSkillIdNote('dup', dir!.path)).not.toBe(TOO_LONG_TEXT);
  });

  it('★ 勝つ側 (フォルダ形式) が長すぎても勝者は変わらない —— 負け側は勝者の場所を名指しして断る', async () => {
    await fs.mkdir(path.join(tmpDir, 'dup'));
    await fs.writeFile(path.join(tmpDir, 'dup', 'SKILL.md'), tooLong());
    await fs.writeFile(path.join(tmpDir, 'dup.md'), 'ok');
    const items = await scanSkills(tmpDir, 'user');
    const dir = items.find((e) => e.path === path.join(tmpDir, 'dup', 'SKILL.md'));
    const flat = items.find((e) => e.path === path.join(tmpDir, 'dup.md'));
    // `readSkillBody` は先の候補 (フォルダ) が長すぎれば、後の候補へ進まず断る —— 一覧も同じ答え。
    expect(dir).toMatchObject({ runnable: false, unrunnableReason: TOO_LONG_TEXT });
    expect(flat).toMatchObject({ runnable: false, unrunnableReason: shadowedSkillIdNote('dup', dir!.path) });
  });
});

describe('ACTIONS["run-skill"]: 天井の境目・空の発話・失敗の枝', () => {
  let home = '';
  let root = '';
  let prevHome: string | undefined;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-502-run-'));
    root = path.join(home, '.claude', 'skills');
    await fs.mkdir(path.join(root, 'echo'), { recursive: true });
    prevHome = process.env.HOME;
    process.env.HOME = home;
    // skills.ts が読むのは `os.homedir()` (`$HOME` ではない)。
    vi.spyOn(os, 'homedir').mockReturnValue(home);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(home, { recursive: true, force: true });
  });

  const writeEcho = (body: string): Promise<void> => fs.writeFile(path.join(root, 'echo', 'SKILL.md'), body);

  /** 実行して、送った要求の `system` を返す。 */
  async function runAndGetSystem(payload: Record<string, unknown>): Promise<string> {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    await ACTIONS['run-skill']!({ token: 'sk-ant-x', fetch: fetchMock, payload });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return (JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as { system: string }).system;
  }

  it('★ 字が天井ちょうどのスキル本文は送る (天井は「超えたら」断る)', async () => {
    const body = 'x'.repeat(MAX_ASSISTANT_SYSTEM_CHARS);
    await writeEcho(body);
    expect(await runAndGetSystem({ id: 'echo', prompt: 'ping' })).toBe(body);
  });

  it('★ 4 byte 字だけで天井ちょうどの字数 = byte も天井ちょうどの本文は、byte の門で断らず送る', async () => {
    const body = FOUR_BYTE_CHAR.repeat(MAX_ASSISTANT_SYSTEM_CHARS);
    expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_SKILL_FILE_BYTES);
    await writeEcho(body);
    expect(await runAndGetSystem({ id: 'echo', prompt: 'ping' })).toBe(body);
  });

  it('★ 字が天井を 1 字超えた本文は、送らずに一覧と同じ文で断る', async () => {
    await writeEcho('x'.repeat(MAX_ASSISTANT_SYSTEM_CHARS + 1));
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({ token: 'sk-ant-x', fetch: fetchMock, payload: { id: 'echo', prompt: 'ping' } }),
    ).rejects.toThrow(new Error(TOO_LONG_TEXT));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('★ 発話が天井ちょうど (字) なら送る・1 字超えれば断る', async () => {
    await writeEcho('body');
    const atCeiling = 'a'.repeat(MAX_ASSISTANT_CONTENT_CHARS);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    await ACTIONS['run-skill']!({ token: 'sk-ant-x', fetch: fetchMock, payload: { id: 'echo', prompt: atCeiling } });
    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as { messages: { content: string }[] };
    expect(sent.messages[0]!.content).toBe(atCeiling);
    // 1 字超えは断る (文面は「プロンプト」と発話の天井)。
    const over = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({ token: 'sk-ant-x', fetch: over, payload: { id: 'echo', prompt: atCeiling + 'a' } }),
    ).rejects.toThrow(new Error(`プロンプトが長すぎます (${MAX_ASSISTANT_CONTENT_CHARS} 字以内)`));
    expect(over).not.toHaveBeenCalled();
  });

  it('★ 空の発話は必須の断りで止める (有料 API へ空を送らない)', async () => {
    await writeEcho('body');
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({ token: 'sk-ant-x', fetch: fetchMock, payload: { id: 'echo', prompt: '' } }),
    ).rejects.toThrow(new Error('id and prompt are required'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('★ 大きさを読む間に先の候補が消えたら、次の候補 (<id>.md) へ進む', async () => {
    await writeEcho('FOLDER-BODY');
    await fs.writeFile(path.join(root, 'echo.md'), 'FLAT-BODY');
    statRacesAwayFor(`${path.sep}SKILL.md`);
    expect(await runAndGetSystem({ id: 'echo', prompt: 'ping' })).toBe('FLAT-BODY');
  });

  it('★ どの候補も大きさを読めなければ「見つからない」で断る (TypeError を漏らさない)', async () => {
    await writeEcho('FOLDER-BODY');
    statRacesAwayFor(`${path.sep}SKILL.md`);
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['run-skill']!({ token: 'sk-ant-x', fetch: fetchMock, payload: { id: 'echo', prompt: 'ping' } }),
    ).rejects.toThrow(new Error('skill "echo" not found in ~/.claude/skills'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
