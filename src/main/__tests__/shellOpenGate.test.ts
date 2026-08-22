import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellTargetOrNull, SHELL_OPEN_EXTS, MAX_SHELL_PATH_LENGTH } from '../shellOpenGate';

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

  it('上限ちょうどは長さでは弾かない', async () => {
    const pad = MAX_SHELL_PATH_LENGTH - path.join(root, '.md').length;
    const p = path.join(root, `${'a'.repeat(pad)}.md`);
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
