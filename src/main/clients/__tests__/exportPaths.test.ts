import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { exportRoot, isSafeExportPath, writeExportFile } from '../exportPaths';

// 2026-07 security audit: every renderer-supplied export path must land inside
// ~/.local/business-hub. Before this module the four per-service copies of the
// guard accepted anything under $HOME, giving a compromised renderer an
// arbitrary-write primitive across the home tree (and a file to plant for
// app:openPath to launch).
//
// パスは POSIX リテラルではなく path.resolve/join で組み立てる。Windows では
// path.resolve('/home/user') がドライブレター付き (D:\home\user) になるため、
// リテラル比較はリリースビルド (windows-latest) でだけ落ちる。
const HOME = path.resolve('/home/user');
const ROOT = path.join(HOME, '.local', 'business-hub');
const inRoot = (rel: string): string => path.join(ROOT, rel);

describe('exportRoot', () => {
  it('is ~/.local/business-hub for the given home', () => {
    expect(exportRoot(HOME)).toBe(ROOT);
  });

  it('resolves a non-normalized home', () => {
    // path.join は連結時に正規化してしまうため、未正規化入力は文字列連結で作る。
    expect(exportRoot(`${HOME}${path.sep}..${path.sep}user`)).toBe(ROOT);
  });
});

describe('isSafeExportPath', () => {
  it('accepts files inside the export root at any depth', () => {
    expect(isSafeExportPath(inRoot('data/dashboard.html'), HOME, '.html')).toBe(true);
    expect(isSafeExportPath(inRoot('data/templates/card.svg'), HOME, '.svg')).toBe(true);
    expect(isSafeExportPath(inRoot('a/b/c/deep.md'), HOME, '.md')).toBe(true);
  });

  it('rejects paths elsewhere under $HOME (the capability this closes)', () => {
    expect(isSafeExportPath(path.join(HOME, 'x.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(path.join(HOME, '.config/autostart/evil.html'), HOME, '.html')).toBe(
      false,
    );
    expect(isSafeExportPath(path.join(HOME, '.local/other/x.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(path.join(HOME, 'Documents/notes.md'), HOME, '.md')).toBe(false);
  });

  it('rejects paths outside $HOME, including traversal out of the root', () => {
    expect(isSafeExportPath('/etc/passwd.html', HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('../../../etc/x.html'), HOME, '.html')).toBe(false);
    const otherHome = path.join(path.dirname(HOME), 'other');
    expect(
      isSafeExportPath(path.join(otherHome, '.local/business-hub/x.html'), HOME, '.html'),
    ).toBe(false);
  });

  it('rejects the export root itself (it is a directory, never a target)', () => {
    expect(isSafeExportPath(ROOT, HOME, '')).toBe(false);
  });

  it('requires the exact extension', () => {
    expect(isSafeExportPath(inRoot('x.html'), HOME, '.md')).toBe(false);
    expect(isSafeExportPath(inRoot('x.svg'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('x.html.exe'), HOME, '.html')).toBe(false);
  });

  it('rejects control characters, empties, non-strings and oversize paths', () => {
    expect(isSafeExportPath(inRoot('a\0b.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('a\nb.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('a\rb.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath('', HOME, '.html')).toBe(false);
    expect(isSafeExportPath(undefined as unknown as string, HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('a'.repeat(1100) + '.html'), HOME, '.html')).toBe(false);
  });

  it('長さの上限はちょうど 1024 文字まで', () => {
    // 上限がどちら側に付いているか (1024 を含むのか外すのか) を固定する。
    // 実装は `> 1024` で弾くので、1024 ちょうどは通る。
    const prefix = `${ROOT}${path.sep}`;
    const ext = '.html';
    const fill = 1024 - prefix.length - ext.length;
    const exact = `${prefix}${'a'.repeat(fill)}${ext}`;
    expect(exact).toHaveLength(1024);
    expect(isSafeExportPath(exact, HOME, ext)).toBe(true);

    const oneOver = `${prefix}${'a'.repeat(fill + 1)}${ext}`;
    expect(oneOver).toHaveLength(1025);
    expect(isSafeExportPath(oneOver, HOME, ext)).toBe(false);
  });

  it('is not fooled by a sibling directory sharing the root prefix', () => {
    // `…/.local/business-hub-evil/x.html` starts with the root string
    // but is a different directory — the separator check must catch it.
    expect(isSafeExportPath(`${ROOT}-evil${path.sep}x.html`, HOME, '.html')).toBe(false);
  });
});

/*
 * **書き出しも 0600。** 状態ファイルは 4 つとも 0600 で保存しており、
 * `teamradar` はその理由まで書いている ——「同じ機械の他の利用者が
 * 同僚の評価を読める状態だった」。
 *
 * ところが**書き出しには mode が 1 つも付いていなかった** (2026-08-25 実測:
 * 状態 0600 / 書き出し 0644)。しかも `teamradar` は 0600 で守っている当の
 * 評価データを SVG にして 0644 で書き出していた。**中身は同じで、守りだけが
 * 片側に付いていた。**
 */
describe('writeExportFile — 書き出しの権限', () => {
  const mkDir = async (): Promise<string> =>
    fs.mkdtemp(path.join(os.tmpdir(), 'export-mode-'));
  const modeOf = async (p: string): Promise<string> =>
    ((await fs.stat(p)).mode & 0o777).toString(8);

  it('★ 新しく書き出したファイルは 0600', async () => {
    const dir = await mkDir();
    const f = path.join(dir, 'dash.html');
    await writeExportFile(f, '<html>売上 1,234,567 円</html>');
    expect(await modeOf(f)).toBe('600');
  });

  /*
   * **`mode` は新規作成でしか効かない。** 一度 644 で作られた書き出しは、
   * `{ mode: 0o600 }` を付けて上書きしても 644 のまま (実測)。
   * `emotions.ts` が 2026-08-23 に記録している罠と同じなので、
   * `chmod` で明示的に直していることをここで留める。
   */
  it('★ 既に 0644 で在るファイルも、書き直すと 0600 になる', async () => {
    const dir = await mkDir();
    const f = path.join(dir, 'dash.html');
    await fs.writeFile(f, 'old', 'utf8');
    await fs.chmod(f, 0o644);
    expect(await modeOf(f)).toBe('644');

    await writeExportFile(f, 'new');
    expect(await modeOf(f)).toBe('600');
  });

  it('中身は書けている (権限だけ直して書き損ねない)', async () => {
    const dir = await mkDir();
    const f = path.join(dir, 'dash.md');
    await writeExportFile(f, '# 売上\n1,234,567 円\n');
    expect(await fs.readFile(f, 'utf8')).toBe('# 売上\n1,234,567 円\n');
  });
});
