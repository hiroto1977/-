import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile, readFileWithBackup } from '../atomicWrite';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomicwrite-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('atomicWriteFile', () => {
  it('writes the file and creates missing parent directories', async () => {
    const target = path.join(dir, 'nested', 'deep', 'secrets.json');
    await atomicWriteFile(target, '{"a":1}');
    expect(await fs.readFile(target, 'utf8')).toBe('{"a":1}');
  });

  /*
   * 作業ファイルは `O_EXCL` で開く —— **既に在るなら開かない**。
   *
   * tmp 名は `pid + Date.now() + Math.random()` なので、普通は同じ名前が
   * 先に在ることは無い。だから**両方を固定して、在る状態を作って**確かめる。
   * `'w'` のままだと先客を黙って切り詰めて成功してしまう (= 片方の書き込みが
   * 消える・シンボリックリンクなら辿る)。
   */
  it('作業ファイルが既に在るなら開かず失敗する (O_EXCL)', async () => {
    const target = path.join(dir, 'excl.json');
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await fs.writeFile(tmp, 'せんきゃく');
      await expect(atomicWriteFile(target, 'あたらしい')).rejects.toThrow();
      // 先客はそのまま (切り詰められていない)。
      expect(await fs.readFile(tmp, 'utf8')).toBe('せんきゃく');
      // 本体は作られていない。
      await expect(fs.stat(target)).rejects.toThrow();
    } finally {
      randomSpy.mockRestore();
      nowSpy.mockRestore();
    }
  });

  it('overwrites an existing file atomically', async () => {
    const target = path.join(dir, 'f.json');
    await atomicWriteFile(target, 'first');
    await atomicWriteFile(target, 'second');
    expect(await fs.readFile(target, 'utf8')).toBe('second');
  });

  it('leaves no leftover .tmp- files after success', async () => {
    const target = path.join(dir, 'f.json');
    await atomicWriteFile(target, 'x');
    const entries = await fs.readdir(dir);
    expect(entries.filter((e) => e.includes('.tmp-'))).toEqual([]);
  });

  it('keeps a .prev backup of the previous content when requested', async () => {
    const target = path.join(dir, 'f.json');
    await atomicWriteFile(target, 'v1', { keepBackup: true });
    await atomicWriteFile(target, 'v2', { keepBackup: true });
    expect(await fs.readFile(target, 'utf8')).toBe('v2');
    expect(await fs.readFile(`${target}.prev`, 'utf8')).toBe('v1');
  });

  it('does not fail keepBackup when there is no existing file', async () => {
    const target = path.join(dir, 'fresh.json');
    await expect(atomicWriteFile(target, 'v1', { keepBackup: true })).resolves.toBeUndefined();
    await expect(fs.access(`${target}.prev`)).rejects.toBeTruthy();
  });

  it('applies the requested file mode (POSIX)', async () => {
    if (process.platform === 'win32') return; // mode bits are a no-op on Windows
    const target = path.join(dir, 'm.json');
    await atomicWriteFile(target, 'x', { mode: 0o600 });
    const st = await fs.stat(target);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('defaults the file mode to 0o600 when none is given (POSIX)', async () => {
    if (process.platform === 'win32') return;
    // `opts.mode ?? 0o600` の既定値。?? を && にする mutant は undefined を渡し既定 umask
    // モード (≠0o600) になるため、既定 0o600 を確認して撃墜。
    const target = path.join(dir, 'd.json');
    await atomicWriteFile(target, 'x');
    expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
  });

  it('does not create a .prev backup when keepBackup is not set', async () => {
    // `if (opts.keepBackup)` を true 固定する mutant は常に .prev を作るため、未指定時に
    // .prev が無いことを確認して撃墜。
    const target = path.join(dir, 'nb.json');
    await atomicWriteFile(target, 'v1');
    await atomicWriteFile(target, 'v2'); // 既存ありで上書き (keepBackup 無し)
    await expect(fs.access(`${target}.prev`)).rejects.toBeTruthy();
  });

  it('rejects and cleans up the temp file when the rename fails', async () => {
    // target が既存ディレクトリだと rename(tmp, dir) が失敗 → catch で tmp 削除 + 再 throw。
    // catch ブロックを空にする mutant は throw を消して resolve してしまうため、reject を
    // 確認して撃墜。後始末で .tmp- が残らないことも確認。
    const target = path.join(dir, 'collide');
    await fs.mkdir(target); // target を既存ディレクトリにする
    await expect(atomicWriteFile(target, 'x')).rejects.toBeTruthy();
    const leftovers = (await fs.readdir(dir)).filter((e) => e.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
});

describe('readFileWithBackup', () => {
  it('reads the primary file when present', async () => {
    const target = path.join(dir, 'f.json');
    await atomicWriteFile(target, 'primary');
    expect(await readFileWithBackup(target)).toBe('primary');
  });

  it('falls back to .prev when the primary is missing', async () => {
    const target = path.join(dir, 'f.json');
    await fs.writeFile(`${target}.prev`, 'backup');
    expect(await readFileWithBackup(target)).toBe('backup');
  });

  it('returns null when neither exists', async () => {
    expect(await readFileWithBackup(path.join(dir, 'nope.json'))).toBeNull();
  });
});

/*
 * **権限は「作るとき」だけの話ではない。**
 *
 * `fs.writeFile(..., { mode })` は**新規作成のときしか効かない** ——
 * 既にあるファイルの権限は変わらない。実際 `main/clients/emotions.ts` は
 * 2026-08-13 に `{ mode: 0o600 }` を足したが、それ以前に作られたファイルは
 * 644 のまま残り、以後どれだけ書いても直らなかった (実測)。
 *
 * `atomicWriteFile` は 0600 で作った一時ファイルを `rename` で被せるので、
 * **次の書き込みで既存の緩い権限も直る**。控えを取るときは控えも揃える ——
 * 本体だけ直して控えを緩いまま残すのは、鍵を掛けた扉の横に窓を開けておくのと同じ。
 */
describe('atomicWriteFile と権限', () => {
  const modeOf = async (p: string) => ((await fs.stat(p)).mode & 0o777).toString(8);

  it('新しいファイルは指定した権限で作られる', async () => {
    const target = path.join(dir, 'new.json');
    await atomicWriteFile(target, '{}', { mode: 0o600 });
    expect(await modeOf(target)).toBe('600');
  });

  it('既にある緩いファイルも、次の書き込みで締まる', async () => {
    const target = path.join(dir, 'legacy.json');
    // mode を付ける前のバージョンが作った状態
    await fs.writeFile(target, '{"old":1}');
    await fs.chmod(target, 0o644);
    expect(await modeOf(target)).toBe('644');

    await atomicWriteFile(target, '{"new":1}', { mode: 0o600 });

    // ★ ここが本体。writeFile では直らない。
    expect(await modeOf(target)).toBe('600');
    expect(await fs.readFile(target, 'utf8')).toBe('{"new":1}');
  });

  it('控えを本体より緩いまま残さない', async () => {
    const target = path.join(dir, 'withprev.json');
    await fs.writeFile(target, '{"old":1}');
    await fs.chmod(target, 0o644);

    await atomicWriteFile(target, '{"new":1}', { mode: 0o600, keepBackup: true });

    // 控えは複製元 (緩い本体) の権限を引き継ぐので、明示的に揃える必要がある。
    expect(await modeOf(`${target}.prev`)).toBe('600');
    expect(await fs.readFile(`${target}.prev`, 'utf8')).toBe('{"old":1}');
  });

  /*
   * mode **無指定**のときも同じ窓が開いていた (2026-08-31)。
   *
   * 一時ファイルは `opts.mode ?? 0o600` で作られるので、mode を渡さなくても
   * 本体は rename 後に 600 になる。ところが控えを揃える側だけが
   * `if (opts.mode !== undefined)` で守られていて、**まさにその無指定の場合に**
   * 本体 600 / 控え 644 が残った。控えも同じ既定値へ揃える。
   */
  it('mode 無指定でも、控えは本体と同じ 600 に揃う', async () => {
    const target = path.join(dir, 'withprev-nomode.json');
    await fs.writeFile(target, '{"old":1}');
    await fs.chmod(target, 0o644);

    await atomicWriteFile(target, '{"new":1}', { keepBackup: true });

    expect(await modeOf(target)).toBe('600');
    // ★ ここが本体 —— 以前はここが 644 のまま残っていた。
    expect(await modeOf(`${target}.prev`)).toBe('600');
    expect(await fs.readFile(`${target}.prev`, 'utf8')).toBe('{"old":1}');
  });
});
