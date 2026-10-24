import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { exportParentDirs, exportRoot, exportWriteRoot, isSafeExportPath, writeExportFile, repairExportPermissions, ensurePrivateExportRoot } from '../exportPaths';

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
  it('accepts files whose parent is data/ or data/templates/ (the two fixed export dirs)', () => {
    expect(isSafeExportPath(inRoot('data/dashboard.html'), HOME, '.html')).toBe(true);
    expect(isSafeExportPath(inRoot('data/templates/card.svg'), HOME, '.svg')).toBe(true);
  });

  /*
   * **書き出し自身の既定名をディレクトリに化けさせられない (2026-10-14 · パス 521 · threat: T-042)。**
   *
   * 2026-10-14 までこの検査は「任意の深さを受ける」を仕様として留めていた
   * (`data/a/b/c/deep.md` → true)。書き出しは書く前に `mkdir -p (親)` を呼ぶので、
   * `data/business-dashboard.html/x.html` を渡すと**既定の書き出し名のディレクトリ**が
   * でき、以後の既定の書き出しが永久に EISDIR で失敗した (実測・AI 監査の再現)。
   * 親は `data/` と `data/templates/` の 2 つだけ。
   */
  it('★ 親が固定の 2 つでない書き出し先は断る —— 既定名をディレクトリに化けさせない (threat: T-042)', () => {
    for (const rel of [
      'data/business-dashboard.html/x.html',
      'data/team-radar.svg/x.svg',
      'data/dashboard.html/x.html',
      'data/templates/business-card.svg/x.svg',
      'data/a/b/c/deep.md',
      'data/templates/deeper/x.svg',
      'data/state.json.tmp/x.svg',
    ]) {
      expect(isSafeExportPath(inRoot(rel), HOME, path.extname(rel)), rel).toBe(false);
    }
    expect(exportParentDirs(HOME)).toEqual([path.join(ROOT, 'data'), path.join(ROOT, 'data', 'templates')]);
  });

  /*
   * **状態ファイルの木へは書き出せない (2026-10-12 · パス 511 · threat: T-002)。**
   *
   * `~/.local/business-hub/` 直下には状態ファイルと、保存の途中に作る固定名の
   * `*.json.tmp` が住む。書き出しがそこを通すと、`mkdir -p` が
   * `state.json.tmp` という名のディレクトリを作り、以後の保存が永久に
   * `EISDIR` で失敗した (AI 監査で再現)。書き出しは `data/` の下だけ。
   */
  it('★ 状態ファイルの木 (data/ の外) へは書き出せない (threat: T-002)', () => {
    for (const rel of [
      'state.json.tmp/x.svg',
      'team-radar.json.tmp/x.svg',
      'talent.json/x.svg',
      'x.html',
      'other/deep.md',
    ]) {
      expect(isSafeExportPath(inRoot(rel), HOME, path.extname(rel)), rel).toBe(false);
    }
    // 標本が的に当たる: 同じ名前でも data/ 直下のファイルなら通る (親の制限は T-042 の検査が持つ)。
    expect(isSafeExportPath(inRoot('data/state.json.tmp.svg'), HOME, '.svg')).toBe(true);
    expect(exportWriteRoot(HOME)).toBe(path.join(ROOT, 'data'));
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
    expect(isSafeExportPath(inRoot('data/x.html'), HOME, '.md')).toBe(false);
    expect(isSafeExportPath(inRoot('data/x.svg'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('data/x.html.exe'), HOME, '.html')).toBe(false);
  });

  it('rejects control characters, empties, non-strings and oversize paths', () => {
    expect(isSafeExportPath(inRoot('data/a\0b.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('data/a\nb.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('data/a\rb.html'), HOME, '.html')).toBe(false);
    expect(isSafeExportPath('', HOME, '.html')).toBe(false);
    expect(isSafeExportPath(undefined as unknown as string, HOME, '.html')).toBe(false);
    expect(isSafeExportPath(inRoot('data/a'.repeat(1100) + '.html'), HOME, '.html')).toBe(false);
  });

  it('長さの上限はちょうど 1024 文字まで', () => {
    // 上限がどちら側に付いているか (1024 を含むのか外すのか) を固定する。
    // 実装は `> 1024` で弾くので、1024 ちょうどは通る。
    // 葉の名前は T-177 から 256 字までなので、長さは**ホームの深さ**で稼ぐ (親は data/ 直下の固定なので、
    // 葉以外に伸ばせるのはホームだけ)。
    const ext = '.html';
    const leaf = `${'a'.repeat(60)}${ext}`;
    const build = (n: number) => {
      const home = path.join(HOME, 'h'.repeat(n));
      return { home, file: path.join(exportWriteRoot(home), leaf) };
    };
    const n = 1 + (1024 - build(1).file.length);
    const exact = build(n);
    expect(exact.file).toHaveLength(1024);
    expect(isSafeExportPath(exact.file, exact.home, ext)).toBe(true);

    const oneOver = build(n + 1);
    expect(oneOver.file).toHaveLength(1025);
    expect(isSafeExportPath(oneOver.file, oneOver.home, ext)).toBe(false);
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
    await fs.mkdir(exportWriteRoot(home), { recursive: true });
    return home;
  };
  const modeOf = async (p: string): Promise<string> =>
    ((await fs.stat(p)).mode & 0o777).toString(8);

  it('★ 新しく書き出したファイルは 0600', async () => {
    const home = await mkHome();
    const f = path.join(exportWriteRoot(home), 'dash.html');
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
    const f = path.join(exportWriteRoot(home), 'dash.html');
    await fs.writeFile(f, 'old', 'utf8');
    await fs.chmod(f, 0o644);
    expect(await modeOf(f)).toBe('644');

    await writeExportFile(f, 'new', home);
    expect(await modeOf(f)).toBe('600');
  });

  it('中身は書けている (権限だけ直して書き損ねない)', async () => {
    const home = await mkHome();
    const f = path.join(exportWriteRoot(home), 'dash.md');
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

/*
 * **調べた物と書く物を同じにする (2026-10-15 · パス 523 · threat: T-060)。**
 *
 * T-042 は「親は固定の 2 つだけ」と述べたが、比べていたのは `path.resolve` した後の親で、
 * 書き出しが `mkdir -p` へ渡すのは生の `filePath` の親だった。`..` を挟んだ綴りは resolve すると
 * `data/y.html` になって通り、mkdir は `state.json` という名のディレクトリを作っていた (実測・
 * AI 監査の再現)。正規化済みの絶対パス以外は断る。
 */
describe('書き出し先は正規化済みの絶対パスだけ (threat: T-060)', () => {
  it('★ `..` / 相対 / 重なった区切り / 末尾の区切りは、resolve すると通る親でも断る (threat: T-060)', () => {
    const viaDotDot = `${inRoot('data/templates')}/../../state.json/../data/y.html`;
    expect(path.dirname(path.resolve(viaDotDot)), '標本が的に当たる: resolve 後の親は許可された親').toBe(inRoot('data'));
    expect(isSafeExportPath(viaDotDot, HOME, '.html')).toBe(false);
    for (const raw of [
      `${inRoot('data')}/../data/y.html`,
      `${inRoot('data')}//y.html`,
      `${inRoot('data')}/./y.html`,
      'data/y.html',
      './data/y.html',
    ]) {
      expect(isSafeExportPath(raw, HOME, '.html'), raw).toBe(false);
    }
  });

  it('対照: 正規化済みの絶対パスは今までどおり通る (threat: T-060)', () => {
    expect(isSafeExportPath(inRoot('data/y.html'), HOME, '.html')).toBe(true);
    expect(isSafeExportPath(inRoot('data/templates/card.svg'), HOME, '.svg')).toBe(true);
  });
});

/**
 * 書き出し根は本人だけ (2026-10-24 · threat: T-176)。直す前は umask 任せで、umask 000 では 777 になり、
 * 別ユーザーが根の中のファイルを unlink / rename (差し替え) できた。
 */
describe('ensurePrivateExportRoot — 根を 0700 にする (threat: T-176)', () => {
  const mk = async () => fs.mkdtemp(path.join(os.tmpdir(), 'export-root-'));
  const modeOf = async (p: string) => (await fs.lstat(p)).mode & 0o777;

  it('★ 緩い根 (0755 / 0777) は 0700 に直す', async () => {
    for (const loose of [0o755, 0o775, 0o777]) {
      const root = await mk();
      await fs.chmod(root, loose);
      expect(await ensurePrivateExportRoot(root)).toBe(1);
      expect(await modeOf(root)).toBe(0o700);
    }
  });

  it('★ 無ければ最初から 0700 で作る (作ってから chmod したのではない = 戻り値 0)', async () => {
    const parent = await mk();
    const root = path.join(parent, 'business-hub');
    expect(await ensurePrivateExportRoot(root)).toBe(0);
    expect(await modeOf(root)).toBe(0o700);
  });

  it('対照: 既に 0700 なら触らない (0)', async () => {
    const root = await mk();
    await fs.chmod(root, 0o700);
    expect(await ensurePrivateExportRoot(root)).toBe(0);
  });

  it('★ 根が symlink なら辿らない (根の外の実体の権限を変えない)', async () => {
    const outside = await mk();
    await fs.chmod(outside, 0o755);
    const holder = await mk();
    const link = path.join(holder, 'root-link');
    await fs.symlink(outside, link);
    expect(await ensurePrivateExportRoot(link)).toBe(0);
    expect(await modeOf(outside)).toBe(0o755);
  });

  it('根がファイルなら何もしない (投げない)', async () => {
    const holder = await mk();
    const file = path.join(holder, 'f');
    await fs.writeFile(file, 'x');
    expect(await ensurePrivateExportRoot(file)).toBe(0);
  });
});

/**
 * 葉の名前が Windows で別物になる形は書き出さない (2026-10-24 · threat: T-177)。直す前は、予約された装置名
 * (`CON.html`)・代替データストリーム (`x.txt:s.html`)・末尾のドットが書き出しの関門を通った。
 */
describe('isSafeExportPath — 葉の名前 (threat: T-177)', () => {
  const dir = path.join(exportWriteRoot(HOME));
  it.each(['CON.html', 'nul.html', 'aux.html', 'COM1.html', 'x.txt:s.html', 'a.html.'])('★ %s は断る', (leaf) => {
    expect(isSafeExportPath(path.join(dir, leaf), HOME, leaf.endsWith('.') ? '.' : '.html')).toBe(false);
  });
  it('対照: ふつうの名前は通る', () => {
    expect(isSafeExportPath(path.join(dir, 'business-dashboard.html'), HOME, '.html')).toBe(true);
    expect(isSafeExportPath(path.join(dir, 'console.html'), HOME, '.html')).toBe(true);
  });
});
