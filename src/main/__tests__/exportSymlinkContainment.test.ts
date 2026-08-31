import { chmodSync, existsSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

/**
 * **どちらの門が効いたのかを見分ける。**
 *
 * 上の 3 本は `rejects.toThrow()` を素で使っている。断ること自体は見えるが、
 * **封じ込めの門で断ったのか symlink の門で断ったのかは区別していない**。
 * つまり片方の門が壊れてももう片方が拾えば通ってしまうし、文言を空文字に
 * 潰しても鳴らない (変異検査で 2 件生存、2026-08-30 実測)。
 *
 * 本 PR の `vault.ts` で踏んだ「奥の文言と接頭辞を共有する `toThrow`」と
 * 同じ形である。**「投げること」ではなく「どこで投げたか」を当てる。**
 */
describe('書き出しの封じ込め — 断った理由を見分ける', () => {
  it('★ 根の外は「領域の外」で断る', async () => {
    await expect(assertExportTargetContained(join(outside, 'x.svg'), home)).rejects.toThrow(
      /許可された領域の外を指しています/,
    );
  });

  it('★ 先が symlink なら「symlink です」で断る (別の門)', async () => {
    const victim = join(outside, 'v.svg');
    writeFileSync(victim, 'original');
    symlinkSync(victim, join(exportRoot(home), 'alias2.svg'));
    await expect(
      assertExportTargetContained(join(exportRoot(home), 'alias2.svg'), home),
    ).rejects.toThrow(/書き出し先が symlink です/);
  });

  /**
   * **根がまだ無いときに断らない。**
   *
   * `realpath` は存在しない道で失敗するので、両方の呼び出しに
   * `.catch(() => 字面の値)` が付いている。この退避が `undefined` を返すよう
   * 変異しても**誰も気付かなかった** (2 件生存)。気付かないと、初回起動
   * (根がまだ無い) で書き出しが常に「領域の外」と言って失敗する。
   */
  it('★ 根がまだ無くても、封じ込めの判定は通す (realpath の退避)', async () => {
    rmSync(exportRoot(home), { recursive: true, force: true });
    await expect(
      assertExportTargetContained(join(exportRoot(home), 'first.svg'), home),
    ).resolves.toBeUndefined();
  });
});

/**
 * **書き出したファイルは持ち主しか読めない。**
 *
 * `writeExportFile` は `{ mode: 0o600 }` で作り、直後に `chmod(0o600)` を
 * 当てる。`writeModeGate.test.ts` は**ソースを走査して** chmod が続いて
 * いることを見ているが、**実際の権限を見る検査は無かった**。
 * 書き出す中身は事業データなので、同じ機械の他利用者から読めてはいけない。
 */
describe('書き出しの権限', () => {
  it('★ 書き出したファイルは 0600 (他人から読めない)', async () => {
    const target = join(exportRoot(home), 'perm.svg');
    await writeExportFile(target, '<svg/>', home);
    const mode = statSync(target).mode & 0o777;
    expect(mode.toString(8)).toBe('600');
  });

  it('★ 既に緩い権限で存在していても 0600 へ戻す', async () => {
    const target = join(exportRoot(home), 'loose.svg');
    writeFileSync(target, 'old', { mode: 0o644 });
    chmodSync(target, 0o644); // umask に依らず確実に緩めておく
    await writeExportFile(target, '<svg/>', home);
    expect((statSync(target).mode & 0o777).toString(8)).toBe('600');
  });
});
