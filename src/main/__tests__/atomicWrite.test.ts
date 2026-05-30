import { describe, expect, it, beforeEach, afterEach } from 'vitest';
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
