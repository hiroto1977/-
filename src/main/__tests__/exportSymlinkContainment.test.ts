import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertExportTargetContained, exportRoot, isSafeExportPath, writeExportFile } from '../clients/exportPaths';

/*
 * 書き出しの封じ込めを、**symlink まで含めて**留める。
 *
 * 2026-08-26 の実測: `isSafeExportPath` は `path.resolve` しか通さない ——
 * `..` は畳むが **symlink は辿らない**。根の中に外を指す symlink があると、
 * 字面の検査は通り、`writeExportFile` が根の外へ書いた。
 *
 * 兄弟の `shellOpenGate.shellTargetOrNull` は最初から `fs.realpath` を通して
 * いた。**同じ根に対する 2 つの門で、開く側は辿り、書く側は辿っていなかった。**
 */
let base: string;
let home: string;
let outside: string;

beforeEach(() => {
  base = join(tmpdir(), `export-containment-${process.pid}-${Math.floor(performance.now() * 1000)}`);
  home = join(base, 'home');
  outside = join(base, 'outside');
  mkdirSync(exportRoot(home), { recursive: true });
  mkdirSync(outside, { recursive: true });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('書き出しの封じ込め — symlink', () => {
  it('★ 根の中の symlink を経由して外へ書けない', async () => {
    symlinkSync(outside, join(exportRoot(home), 'link'));
    const target = join(exportRoot(home), 'link', 'pwned.svg');

    // 字面の検査は通ってしまう —— これがこの検査の存在理由。
    expect(isSafeExportPath(target, home, '.svg')).toBe(true);

    await expect(writeExportFile(target, '<svg/>', home)).rejects.toThrow();
    expect(existsSync(join(outside, 'pwned.svg'))).toBe(false);
  });

  it('★ 書き出し先そのものが symlink なら拒否する (指す先へ書かない)', async () => {
    const victim = join(outside, 'victim.svg');
    writeFileSync(victim, 'original');
    symlinkSync(victim, join(exportRoot(home), 'alias.svg'));

    await expect(writeExportFile(join(exportRoot(home), 'alias.svg'), '<svg/>', home)).rejects.toThrow();
    expect(require('node:fs').readFileSync(victim, 'utf8')).toBe('original');
  });

  it('★ 根の外を直接指すパスは拒否する', async () => {
    await expect(assertExportTargetContained(join(outside, 'x.svg'), home)).rejects.toThrow();
  });

  it('陰性: 根の直下へは書ける (この検査が全部を拒否していないこと)', async () => {
    const target = join(exportRoot(home), 'ok.svg');
    await writeExportFile(target, '<svg/>', home);
    expect(existsSync(target)).toBe(true);
  });

  it('陰性: 根の中の実ディレクトリへも書ける', async () => {
    mkdirSync(join(exportRoot(home), 'sub'), { recursive: true });
    const target = join(exportRoot(home), 'sub', 'ok.svg');
    await writeExportFile(target, '<svg/>', home);
    expect(existsSync(target)).toBe(true);
  });

  it('陰性: 根と紛らわしい兄弟ディレクトリは拒否する', async () => {
    const sibling = `${exportRoot(home)}-evil`;
    mkdirSync(sibling, { recursive: true });
    await expect(assertExportTargetContained(join(sibling, 'x.svg'), home)).rejects.toThrow();
  });
});
