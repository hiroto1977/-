import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellTargetOrNull, SHELL_OPEN_EXTS, MAX_SHELL_PATH_LENGTH } from '../shellOpenGate';
import { exportRoot, exportWriteRoot } from '../clients/exportPaths';
import { rereadModule } from '../../shared/__tests__/rereadModule';

/*
 * 開く側の関門 (`app:openPath` / `app:revealInFolder`)。
 *
 * `shell.openPath` は OS の「開く」動詞をそのまま使うので、Windows では
 * 拡張子の関連付け次第でそのまま実行される。ここが緩むと、乗っ取られた
 * レンダラーがホーム配下の任意のファイルを起動できる。
 *
 * 2026-08-22 の点検時点で、この関門は main.ts の非公開関数で**テストが一本も
 * 無かった**。書き出し側の双子 (`exportPaths.ts`) は変異検査の対象で保護対象
 * にも入っていた — 同じ危険度のものが片方だけ測られていなかった。
 */

let root = '';
let outside = '';

/** 書き出し先の中にファイルを作り、その絶対パスを返す。 */
async function make(rel: string, body = 'x'): Promise<string> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body, 'utf8');
  return p;
}

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-shellgate-'));
  await fs.mkdir(path.join(base, 'business-hub'), { recursive: true });
  // realpath で比べるので、根も実体に直しておく (macOS の /var → /private/var 等)。
  root = await fs.realpath(path.join(base, 'business-hub'));
  outside = await fs.realpath(base);
});
afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

describe('shellTargetOrNull — 通すもの', () => {
  it('書き出し先の中の、許した拡張子は実体パスで返す', async () => {
    const p = await make('report.html');
    expect(await shellTargetOrNull(p, root)).toBe(p);
  });

  it('入れ子のディレクトリでも通す', async () => {
    const p = await make('2026/08/sales.csv');
    expect(await shellTargetOrNull(p, root)).toBe(p);
  });

  it('拡張子の大文字小文字は問わない', async () => {
    const p = await make('chart.PNG');
    expect(await shellTargetOrNull(p, root)).toBe(p);
  });

  it('許した拡張子はすべて通る', async () => {
    for (const ext of SHELL_OPEN_EXTS) {
      const p = await make(`file${ext}`);
      expect(await shellTargetOrNull(p, root)).toBe(p);
    }
  });

  it('まだ作られていないファイルも通す (開く側が失敗を返す)', async () => {
    // realpath は存在しないパスで投げるので字面のまま残る。閉じ込めと拡張子は
    // 字面でも効くので、ここで弾く必要はない。
    const p = path.join(root, 'not-yet.md');
    expect(await shellTargetOrNull(p, root)).toBe(p);
  });
});

describe('shellTargetOrNull — 閉じ込め', () => {
  it('書き出し先の外は弾く', async () => {
    const p = path.join(outside, 'secret.txt');
    await fs.writeFile(p, 'x', 'utf8');
    expect(await shellTargetOrNull(p, root)).toBeNull();
  });

  it('.. で外へ抜ける形は弾く', async () => {
    const p = path.join(root, '..', 'secret.txt');
    await fs.writeFile(path.resolve(p), 'x', 'utf8');
    expect(await shellTargetOrNull(p, root)).toBeNull();
  });

  it('前方一致するだけの兄弟ディレクトリは弾く', async () => {
    // `business-hub-evil` は `business-hub` で始まる。区切りを要求していないと
    // ここが通ってしまう。
    const sibling = `${root}-evil`;
    await fs.mkdir(sibling, { recursive: true });
    const p = path.join(sibling, 'x.html');
    await fs.writeFile(p, 'x', 'utf8');
    expect(await shellTargetOrNull(p, root)).toBeNull();
  });

  it('書き出し先そのもの (ディレクトリ) は弾く', async () => {
    expect(await shellTargetOrNull(root, root)).toBeNull();
  });

  it('中に置かれた symlink が外を指していれば弾く', async () => {
    const target = path.join(outside, 'escape.html');
    await fs.writeFile(target, 'x', 'utf8');
    const link = path.join(root, 'looks-fine.html');
    await fs.symlink(target, link);
    // 字面では書き出し先の中にあるが、実体は外。realpath を先に通さないと
    // ここが素通りする。
    expect(await shellTargetOrNull(link, root)).toBeNull();
  });

  it('中の symlink が中を指しているなら通す (実体を返す)', async () => {
    const real = await make('real.md');
    const link = path.join(root, 'alias.md');
    await fs.symlink(real, link);
    expect(await shellTargetOrNull(link, root)).toBe(real);
  });

  it('symlink のディレクトリ経由で外へ出る形も弾く', async () => {
    const target = path.join(outside, 'elsewhere');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'x.pdf'), 'x', 'utf8');
    await fs.symlink(target, path.join(root, 'dir'));
    expect(await shellTargetOrNull(path.join(root, 'dir', 'x.pdf'), root)).toBeNull();
  });
});

describe('shellTargetOrNull — 拡張子', () => {
  it('実行され得る拡張子は弾く', async () => {
    for (const ext of ['.exe', '.bat', '.cmd', '.com', '.sh', '.command', '.desktop', '.ps1', '.scr']) {
      const p = await make(`payload${ext}`);
      expect(await shellTargetOrNull(p, root)).toBeNull();
    }
  });

  it('拡張子が無ければ弾く', async () => {
    const p = await make('README');
    expect(await shellTargetOrNull(p, root)).toBeNull();
  });

  it('許した拡張子に見せかけた二重拡張子は弾く (最後だけを見る)', async () => {
    const p = await make('invoice.pdf.exe');
    expect(await shellTargetOrNull(p, root)).toBeNull();
  });

  it('許した拡張子で終わっていれば二重拡張子でも通す', async () => {
    const p = await make('invoice.exe.pdf');
    expect(await shellTargetOrNull(p, root)).toBe(p);
  });

  it('許した拡張子の一覧に実行され得るものが入っていない', async () => {
    for (const ext of SHELL_OPEN_EXTS) {
      expect(['.exe', '.bat', '.cmd', '.com', '.sh', '.command', '.desktop', '.ps1']).not.toContain(ext);
    }
  });
});

describe('shellTargetOrNull — 入力の形', () => {
  it('文字列でなければ弾く', async () => {
    for (const v of [undefined, null, 42, {}, [], true, Symbol('x')]) {
      expect(await shellTargetOrNull(v, root)).toBeNull();
    }
  });

  it('空文字は弾く', async () => {
    expect(await shellTargetOrNull('', root)).toBeNull();
  });

  it('上限を超える長さは弾く', async () => {
    const long = path.join(root, `${'a'.repeat(MAX_SHELL_PATH_LENGTH)}.md`);
    expect(long.length).toBeGreaterThan(MAX_SHELL_PATH_LENGTH);
    expect(await shellTargetOrNull(long, root)).toBeNull();
  });

  it('★ 上限を超える長さは、葉が短くても (ディレクトリで伸びていても) 弾く (葉の名前の関門に頼らない)', async () => {
    // 葉の名前は T-177 から 256 字までなので、上の検査の長い葉は長さの門に届く前に葉の関門が落とす。
    // 長さの門そのものは、ディレクトリで 1 つ超える形で確かめる (存在しないパス —— realpath は字面のまま残す)。
    let dir = root;
    const leaf = 'a.md';
    while (path.join(dir, leaf).length <= MAX_SHELL_PATH_LENGTH) dir = path.join(dir, 'd'.repeat(200));
    const p = path.join(dir, leaf);
    expect(p.length).toBeGreaterThan(MAX_SHELL_PATH_LENGTH);
    expect(await shellTargetOrNull(p, root)).toBeNull();
  });

  it('上限ちょうどは長さでは弾かない', async () => {
    // 長さは**ディレクトリ**で稼ぐ (葉の名前は T-177 から 256 字までなので、葉だけ伸ばすと長さの門に届く前に断られる)。
    // 1 要素も 255 字が上限なので、200 字の階層を重ねて最後の 1 つで 1024 ちょうどに合わせる。
    const leaf = 'a.md';
    let dir = root;
    const total = (d: string) => path.join(d, leaf).length;
    while (total(dir) + path.sep.length + 200 <= MAX_SHELL_PATH_LENGTH) dir = path.join(dir, 'd'.repeat(200));
    const rest = MAX_SHELL_PATH_LENGTH - total(dir) - path.sep.length;
    if (rest > 0) dir = path.join(dir, 'e'.repeat(rest));
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, leaf);
    await fs.writeFile(p, 'x');
    expect(p.length).toBe(MAX_SHELL_PATH_LENGTH);
    expect(await shellTargetOrNull(p, root)).toBe(p);
  });

  it('NUL / CR / LF を含むものは弾く', async () => {
    const p = await make('ok.md');
    for (const ch of ['\0', '\r', '\n']) {
      expect(await shellTargetOrNull(`${p}${ch}`, root)).toBeNull();
      expect(await shellTargetOrNull(`${ch}${p}`, root)).toBeNull();
    }
  });

  it('途中に混ざった CR / LF も弾く', async () => {
    // 末尾の改行は拡張子の判定 (`.md\n`) が結果的に落とすが、**途中**に入ると
    // 拡張子は `.md` のままなので、この番人が唯一の防波堤になる。
    // POSIX のファイル名には改行を置けるので、これは作れる形である。
    for (const ch of ['\r', '\n']) {
      expect(await shellTargetOrNull(path.join(root, `ok${ch}evil.md`), root)).toBeNull();
    }
  });

  it('★ ディレクトリの途中の NUL / CR / LF も弾く (葉の関門では見えない場所)', async () => {
    // 葉の名前は T-177 の関門が落とすが、ディレクトリの要素にある制御文字はこの番人だけが落とす
    // (存在しないパス —— realpath は字面のまま残し、拡張子も許可リストの内)。
    for (const ch of ['\0', '\r', '\n']) {
      expect(await shellTargetOrNull(path.join(root, `d${ch}x`, 'ok.md'), root)).toBeNull();
    }
  });
});

/*
 * 既定の根は data/ (2026-10-13 · パス 513)。
 *
 * `exportRoot` 直下には状態ファイル (`state.json` ほか) が住み、拡張子の許可リストは
 * `.json` を通す。既定の根を木全体にしていた頃は、乗っ取られたレンダラーが
 * `openPath('~/.local/business-hub/state.json')` で状態ファイルを OS の既定アプリに
 * 開かせられた。既定を `exportWriteRoot` (`data/`) へ狭めて、状態ファイルを開く側から
 * 外した。ここは実物の home の下に書けないので、根を明示して layout を作って確かめる。
 */
describe('既定の根は exportWriteRoot (状態ファイルを開く側から外す)', () => {
  it('exportRoot 直下の state.json は、根が exportWriteRoot なら弾く (threat: T-012)', async () => {
    const home = outside; // mkdtemp した一時の home
    await fs.mkdir(exportWriteRoot(home), { recursive: true });
    // realpath で比べるので根も実体に直す (symlink された tmpdir への保険)。
    const [erootReal, ewriteReal] = [await fs.realpath(exportRoot(home)), await fs.realpath(exportWriteRoot(home))];
    const stateFile = path.join(erootReal, 'state.json');
    await fs.writeFile(stateFile, '{}', 'utf8');
    const real = await fs.realpath(stateFile);
    // 旧い既定 (exportRoot 木全体) なら通っていた。
    expect(await shellTargetOrNull(real, erootReal)).toBe(real);
    // 新しい既定 (data/) では弾く。
    expect(await shellTargetOrNull(real, ewriteReal)).toBeNull();
  });

  it('data/ の下の .json は引き続き通す (正当な書き出しを失わない)', async () => {
    const home = outside;
    const ewriteReal = await fs.realpath(await fs.mkdir(exportWriteRoot(home), { recursive: true }).then(() => exportWriteRoot(home)));
    const dataFile = path.join(ewriteReal, 'stocks', 'snapshot.json');
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, '{}', 'utf8');
    const real = await fs.realpath(dataFile);
    expect(await shellTargetOrNull(real, ewriteReal)).toBe(real);
  });
});

/*
 * 非空の床 (2026-08-22)。許可拡張子の検査は「全拡張子について〜」の形なので、
 * 集合が空になると通ってしまう —— そのとき `shellTargetOrNull` は
 * **何も開けなくなる**ので機能は壊れるが、検査は緑のままになる。
 */
describe('許可拡張子の集合が空でないこと', () => {
  it('SHELL_OPEN_EXTS は 1 つ以上ある', () => {
    expect(SHELL_OPEN_EXTS.size).toBeGreaterThan(0);
  });
});

/*
 * 許可拡張子を **字面で** 留める。
 *
 * 上の「許した拡張子はすべて通る」は `for (const ext of SHELL_OPEN_EXTS)` と
 * 書いていて、**自分が留めるはずの表を読んで回っている**。表の中身が
 * `'.html'` から `''` に変わっても、変わった側を回るだけなので通り続ける。
 * 実測でこの 9 個 (集合そのもの + 8 個の文字列) が変異検査を生き延びていた。
 *
 * さらに `rereadModule` (対象だけを読み直す —— パス 495) が要る。集合はモジュール定数なので、
 * 静的 import のままだとテストファイル読み込み時に評価が済んでしまう
 * (覆われた static 変異体)。`fsa.ts` の DB 名で踏んだのと同じ形。
 *
 * ここは**実行され得るものを OS に開かせない**ための表なので、
 * 「何が入っているか」と「何が入っていないか」の両方を書く。
 */
describe('許可拡張子の中身 (表を読まずに字面で留める)', () => {
  const ALLOWED = ['.html', '.md', '.svg', '.png', '.pdf', '.json', '.csv', '.txt'] as const;

  async function freshGate(): Promise<typeof import('../shellOpenGate')> {
    return (await rereadModule<typeof import('../shellOpenGate')>(import.meta.url, '../shellOpenGate')) as typeof import('../shellOpenGate');
  }

  it.each(ALLOWED)('%s は開いてよい', async (ext) => {
    const { shellTargetOrNull: fresh } = await freshGate();
    const p = await make(`file${ext}`);
    expect(await fresh(p, root)).toBe(p);
  });

  it('表はこの 8 つちょうど (増えたら気付く)', async () => {
    const { SHELL_OPEN_EXTS: fresh } = await freshGate();
    expect([...fresh].sort()).toEqual([...ALLOWED].sort());
  });

  it('拡張子が無いものは開かない (空文字が表に紛れていないこと)', async () => {
    const { shellTargetOrNull: fresh } = await freshGate();
    const p = await make('README');
    expect(await fresh(p, root)).toBeNull();
  });

  it.each(['.exe', '.bat', '.cmd', '.com', '.scr', '.ps1', '.sh', '.command', '.desktop', '.app'])(
    '実行され得る %s は開かない',
    async (ext) => {
      const { shellTargetOrNull: fresh } = await freshGate();
      const p = await make(`payload${ext}`);
      expect(await fresh(p, root)).toBeNull();
    },
  );
});

/*
 * **根の外の字面は、realpath を呼ぶ前に落とす** (threat: T-138)。
 * UNC (ホスト名つきの共有パス) は Windows では realpath が SMB/WebDAV 接続を起こしうる (NTLM ハッシュの送出)。
 * 実測: 直す前は renderer の文字列がそのまま realpath に渡ってから null になった。
 */
describe('shellTargetOrNull — realpath の前に字面の閉じ込めを見る (threat: T-138)', () => {
  const OUTSIDE = [
    '\\\\attacker.example\\share\\report.html',
    '//attacker.example/share/report.html',
    '\\\\?\\UNC\\attacker.example\\share\\report.html',
    '/etc/passwd.html',
    '../../../../etc/x.html',
  ];

  it.each(OUTSIDE)('★ 根の外 (%s) は realpath を 1 度も呼ばずに断る', async (target) => {
    const spy = vi.spyOn(fs, 'realpath');
    try {
      const fresh = shellTargetOrNull;
      expect(await fresh(target, root)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('対照: 根の中の本物のファイルは、これまでどおり realpath を通って開ける', async () => {
    const spy = vi.spyOn(fs, 'realpath');
    try {
      const fresh = shellTargetOrNull;
      const p = await make('ok.html');
      expect(await fresh(p, root)).not.toBeNull();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * 開く物の葉の名前も、書き出しの関門と同じ規則 (2026-10-24 · threat: T-177)。
 */
describe('shellTargetOrNull — 葉の名前 (threat: T-177)', () => {
  it.each(['CON.md', 'nul.svg', 'x.txt:s.html', 'report.md.'])('★ %s は開かない', async (leaf) => {
    const root2 = await fs.mkdtemp(path.join((await import('node:os')).tmpdir(), 'shell-leaf-'));
    const p = path.join(root2, leaf);
    await fs.writeFile(p, 'x').catch(() => undefined);
    expect(await shellTargetOrNull(p, root2)).toBeNull();
  });
});
