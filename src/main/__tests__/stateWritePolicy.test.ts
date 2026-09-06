/**
 * **デスクトップ版が userData に残す状態ファイルは、原子的に書く。**
 *
 * `fs.writeFile` は**本体を切り詰めてから**書くので、その間に電源が落ちる・
 * `SIGKILL` される・容量が尽きると、中途半端な内容が本体として残る。読み側は
 * どのモジュールも「壊れていたら空で続ける」ので、利用者に起きるのは
 * 「**保存したはずの物が全部消えている**」で、しかも何も表示されない。
 *
 * 実測 (2026-09-06): 状態ファイル 4 つのうち **`talent.json` だけが本体を直接
 * 書いていた** (`secrets.json` と感情ログは `atomicWriteFile`、`team-radar.json`
 * と `state.json` は tmp+rename)。権限 (`chmod` の追い打ち) は 3 つとも閉じて
 * いたのに、原子性は 1 つだけ開いていた —— **同じ意図が片側にしか掛かっていない**形。
 *
 * ここは 2 つを留める:
 *
 *   1. `fs.writeFile` を直接呼ぶ場所は台帳のとおりであること (双方向)
 *   2. `saveTalentState` の**既定の経路**が、実物のディスクに原子的に書くこと
 *      (tmp を残さない・0600 になる・既に 644 で在っても 0600 に直る)
 */
import { chmod, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import { saveTalentState, type TalentState } from '../clients/talent';

const REPO = join(__dirname, '..', '..', '..');

/** `fs.writeFile` を直接呼んでよい場所と、その理由。 */
const DIRECT_WRITE_LEDGER: Record<string, string> = {
  'src/main/clients/exportPaths.ts':
    '書き出した成果物 (HTML / MD / SVG) を作る唯一の口。成果物は利用者に見える物で作り直せるうえ、'
    + '途中で落ちれば次の書き出しで上書きされる。symlink と拡張子の門はこのファイルが持つ。',
  'src/main/clients/stocks.ts':
    '`writeTight` が **tmp に**書く (`p + \'.tmp\'`)。本体へは `rename` で被せるので、落ちても本体は前の内容のまま。',
  'src/main/clients/teamradar.ts':
    '`writeTight` が **tmp に**書く (`p + \'.tmp\'`)。stocks と同じ形で、本体は `rename` で置き換える。',
};

interface Site {
  readonly file: string;
  readonly line: number;
}

function findDirectWrites(files: readonly string[]): Site[] {
  const found: Site[] = [];
  for (const abs of files) {
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // コメント行は数えない (説明の中で名前を挙げている箇所がある)。
        const code = line.trim();
        if (code.startsWith('*') || code.startsWith('//')) return;
        if (/\bfs\.writeFile\(|\bwriteFileSync\(/.test(line)) {
          found.push({ file: relative(REPO, abs).split('\\').join('/'), line: i + 1 });
        }
      });
  }
  return found;
}

const SITES = findDirectWrites(
  globSync(['src/main/**/*.ts'], { cwd: REPO, absolute: true, ignore: ['**/__tests__/**'] }),
);

describe('main: 状態ファイルの書き込み方の台帳', () => {
  it('走査が生きている (床: 3 か所以上)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(3);
  });

  it('★ 台帳に無い場所が `fs.writeFile` を直接呼んでいない', () => {
    const undeclared = SITES.filter((s) => !(s.file in DIRECT_WRITE_LEDGER)).map(
      (s) => `${s.file}:${s.line}`,
    );
    expect(
      undeclared,
      '状態ファイルは atomicWriteFile か tmp+rename を通すこと。成果物なら台帳に理由を書く',
    ).toEqual([]);
  });

  it('★ 台帳に載っているのに現物が無い項目は無い', () => {
    const withSites = new Set(SITES.map((s) => s.file));
    const stale = Object.keys(DIRECT_WRITE_LEDGER).filter((f) => !withSites.has(f));
    expect(stale).toEqual([]);
  });

  it('理由は 20 字以上', () => {
    const thin = Object.entries(DIRECT_WRITE_LEDGER)
      .filter(([, why]) => why.length < 20)
      .map(([f]) => f);
    expect(thin).toEqual([]);
  });

  it('標本: 走査は clients/ の中も見ている', () => {
    expect(SITES.some((s) => s.file.startsWith('src/main/clients/'))).toBe(true);
  });

  it('★ talent.json は本体を直接書かない (この行が戻ったら台帳の検査が鳴る)', () => {
    const src = readFileSync(join(REPO, 'src/main/clients/talent.ts'), 'utf8');
    expect(src).toContain('atomicWriteFile(q, c, { mode: 0o600 })');
    // 「無い」の主張には標本を添える —— この綴りが本当にこのファイルの書き込み経路に
    // 当たっていることを、上の toContain と対で確かめる。
    expect(src).toMatch(/deps\.writeFile \?\? \(\(q: string, c: string\) => atomicWriteFile/);
  });
});

describe('saveTalentState の既定の経路 (実物のディスク)', () => {
  const state: TalentState = {
    reports: [{ department: '営業', diseases: ['imprint'] }],
    initiatives: [{ name: '週次の棚卸し', probability: 40 }],
    members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 2 }],
    updatedAt: '2026-09-06',
  };

  it('書いた後にディレクトリに残るのは本体だけ (tmp を残さない)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'talent-atomic-'));
    const target = join(dir, 'talent.json');
    await saveTalentState(state, { statePath: () => target });
    const entries = await readdir(dir);
    expect(entries).toEqual(['talent.json']);
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(state);
  });

  it('★ 保存のたびに本体が置き換わる (inode が変わる = rename で被せている)', async () => {
    /*
     * **原子性そのものを観測する検査。**
     *
     * 上の 3 件 (tmp を残さない・0600・644 から 0600) は、本体を直接書く旧実装でも
     * 通ってしまう (旧実装は tmp を作らず、`chmod` で権限を締めていた)。
     * 区別できるのはここ —— `rename` で置き換える実装では保存のたびに本体の inode が
     * 変わり、本体を切り詰めて書く実装では**同じ inode のまま**中身が入れ替わる。
     * 「途中で落ちても本体は前の内容のまま」という性質は、この置き換えから来る。
     */
    const dir = await mkdtemp(join(tmpdir(), 'talent-atomic-'));
    const target = join(dir, 'talent.json');
    await saveTalentState(state, { statePath: () => target });
    const first = (await stat(target)).ino;
    await saveTalentState({ ...state, updatedAt: '2026-09-07' }, { statePath: () => target });
    const second = (await stat(target)).ino;
    expect(second).not.toBe(first);
    expect(JSON.parse(await readFile(target, 'utf8')).updatedAt).toBe('2026-09-07');
  });

  // この 2 件は権限の性質で、旧実装 (chmod つき) でも通る —— 原子性の検査は上の inode。
  it('0600 で作られる', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'talent-atomic-'));
    const target = join(dir, 'talent.json');
    await saveTalentState(state, { statePath: () => target });
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it('既に 644 で在っても、保存後は 0600 になる (mode は新規作成しか効かない罠)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'talent-atomic-'));
    const target = join(dir, 'talent.json');
    await writeFile(target, '{}');
    await chmod(target, 0o644);
    await saveTalentState(state, { statePath: () => target });
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it('対照: 書けない場所なら投げる (黙って成功にしない)', async () => {
    // 存在しないドライブではなく、**ファイルをディレクトリとして使う**ことで確実に失敗させる。
    const dir = await mkdtemp(join(tmpdir(), 'talent-atomic-'));
    const asFile = join(dir, 'occupied');
    await writeFile(asFile, 'x');
    await expect(saveTalentState(state, { statePath: () => join(asFile, 'talent.json') })).rejects.toThrow();
  });
});
