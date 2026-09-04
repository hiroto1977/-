import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { exportRoot, isSafeExportPath, writeExportFile, repairExportPermissions } from '../exportPaths';

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
  /*
   * **書き出し根の中に作る。** 2026-08-26 に `writeExportFile` が実体での
   * 封じ込め (`assertExportTargetContained`) を通すようになったので、
   * 素の一時ディレクトリへは書けない。`home` を渡して「その一時ディレクトリが
   * 書き出し根になる」形にする —— 検査の対象は権限のままで、
   * **書く場所がアプリの実際の書き先と揃う**という副産物がつく。
   */
  const mkHome = async (): Promise<string> => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'export-mode-'));
    await fs.mkdir(exportRoot(home), { recursive: true });
    return home;
  };
  const modeOf = async (p: string): Promise<string> =>
    ((await fs.stat(p)).mode & 0o777).toString(8);

  it('★ 新しく書き出したファイルは 0600', async () => {
    const home = await mkHome();
    const f = path.join(exportRoot(home), 'dash.html');
    await writeExportFile(f, '<html>売上 1,234,567 円</html>', home);
    expect(await modeOf(f)).toBe('600');
  });

  /*
   * **`mode` は新規作成でしか効かない。** 一度 644 で作られた書き出しは、
   * `{ mode: 0o600 }` を付けて上書きしても 644 のまま (実測)。
   * `emotions.ts` が 2026-08-23 に記録している罠と同じなので、
   * `chmod` で明示的に直していることをここで留める。
   */
  it('★ 既に 0644 で在るファイルも、書き直すと 0600 になる', async () => {
    const home = await mkHome();
    const f = path.join(exportRoot(home), 'dash.html');
    await fs.writeFile(f, 'old', 'utf8');
    await fs.chmod(f, 0o644);
    expect(await modeOf(f)).toBe('644');

    await writeExportFile(f, 'new', home);
    expect(await modeOf(f)).toBe('600');
  });

  it('中身は書けている (権限だけ直して書き損ねない)', async () => {
    const home = await mkHome();
    const f = path.join(exportRoot(home), 'dash.md');
    await writeExportFile(f, '# 売上\n1,234,567 円\n', home);
    expect(await fs.readFile(f, 'utf8')).toBe('# 売上\n1,234,567 円\n');
  });
});

/*
 * **「次の書き込みで直る」では、書き出しには足りない。**
 *
 * 状態ファイルは保存のたびに書き換わるので次の書き込みで権限も直るが、
 * 書き出しは**一度作ってそれきり**になりうる。1 月に作った経営ダッシュボードを
 * 二度と作り直さなければ、0644 のまま残る。起動時に一度均す。
 */
describe('repairExportPermissions — 既存の書き出しを均す', () => {
  const mkDir = async (): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), 'export-repair-'));
  const modeOf = async (p: string): Promise<string> => ((await fs.lstat(p)).mode & 0o777).toString(8);

  it('★ 0644 の書き出しを 0600 へ直す', async () => {
    const root = await mkDir();
    const f = path.join(root, 'business-dashboard.html');
    await fs.writeFile(f, '<html>売上</html>', 'utf8');
    await fs.chmod(f, 0o644);

    expect(await repairExportPermissions(root)).toBe(1);
    expect(await modeOf(f)).toBe('600');
  });

  /**
   * **symlink は辿らない。**
   *
   * `fs.chmod` は symlink を**辿って指す先の権限を変える**。根の中に外を
   * 指す symlink があれば、権限を直すつもりで**根の外のファイルを書き換える**
   * ことになる。走査は `isSymbolicLink()` と `!isFile()` の 2 段で弾いていて、
   * どちらか一方だけでも弾ける (だから変異検査では互いに隠し合って 2 件とも
   * 生存する)。ここで留めるのは**行ではなく振る舞い**である。
   */
  it('★ symlink は辿らない (指す先の権限を変えない)', async () => {
    const root = await mkDir();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'export-outside-'));
    const victim = path.join(outside, 'victim.html');
    await fs.writeFile(victim, 'secret', 'utf8');
    await fs.chmod(victim, 0o644);
    await fs.symlink(victim, path.join(root, 'alias.html'));

    expect(await repairExportPermissions(root), '数えない').toBe(0);
    expect(await modeOf(victim), '指す先は 0644 のまま').toBe('644');
  });

  it('既に 0600 のものは触らない (直した数に数えない)', async () => {
    const root = await mkDir();
    const f = path.join(root, 'ok.html');
    await fs.writeFile(f, 'x', { mode: 0o600 });
    await fs.chmod(f, 0o600);

    expect(await repairExportPermissions(root)).toBe(0);
    expect(await modeOf(f)).toBe('600');
  });

  it('入れ子のディレクトリも辿る', async () => {
    const root = await mkDir();
    const sub = path.join(root, 'data');
    await fs.mkdir(sub);
    const f = path.join(sub, 'dash.md');
    await fs.writeFile(f, '# x', 'utf8');
    await fs.chmod(f, 0o644);

    expect(await repairExportPermissions(root)).toBe(1);
    expect(await modeOf(f)).toBe('600');
  });

  /*
   * **この修正が持ち込みうる危険そのもの。**
   *
   * `chmod` は symlink を辿るので、書き出し根に `dash.html -> /etc/crontab` を
   * 置かれると、**こちらが根の外の実体の権限を書き換えてしまう**。
   * 同日 `scanSkills` で「辿ってしまった」側を直したばかりなので、
   * 直す側で同じ穴を開けない。
   *
   * **対照の当て方に注意。** 実装には番人が 2 つあり (`isSymbolicLink()` と
   * `!isFile()`)、実際に落としているのは後者である —— `Dirent` は symlink に
   * 対して `isFile() === false` を返す (実測)。`isSymbolicLink()` だけを外しても
   * **この検査は鳴らない**ので、それを見て「空の検査だ」と読まないこと。
   * 穴を再現するには**両方**外す (そうすると実際に鳴る = この検査は生きている)。
   */
  it('★ symlink は辿らない (根の外の実体の権限を変えない)', async () => {
    const root = await mkDir();
    const outsideDir = await mkDir();
    const outside = path.join(outsideDir, 'OUTSIDE.conf');
    await fs.writeFile(outside, 'secret', 'utf8');
    await fs.chmod(outside, 0o644);
    await fs.symlink(outside, path.join(root, 'dash.html'));

    expect(await repairExportPermissions(root)).toBe(0);
    expect(await modeOf(outside), '根の外の実体の権限を変えてしまった').toBe('644');
  });

  it('根がまだ無くても投げない', async () => {
    const root = path.join(os.tmpdir(), 'export-repair-does-not-exist-' + String(process.pid));
    await expect(repairExportPermissions(root)).resolves.toBe(0);
  });
});
