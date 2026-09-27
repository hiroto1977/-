/**
 * **デスクトップ版の「すべてのデータを削除」は、ファイルも控えも残骸も消す。** (2026-09-09 · パス 137)
 *
 * 2026-09-09 まで、デスクトップ版の設定画面のハードリセットは renderer の保存領域しか消せず、
 * main のトークン (`service-hub-secrets.json` + `.prev`)・状態ファイル 4 つ・書き込みの残骸 (`*.tmp-*`) は
 * OS のユーザー領域に残っていた。ここは**実物のファイルシステム** (一時ディレクトリ) で消えることを測り、
 * 消えなかった時 (ディレクトリが居座る / 控えが消せない / renderer の消去が拒まれる) に**消えたと言わない**
 * ことを留める。在庫は置き場所の関数から作る (綴りを写さない)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { promises as fs, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let clearCalls = 0;
let clearRejection: Error | null = null;

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/does-not-matter',
  },
  session: {
    defaultSession: {
      clearStorageData: async () => {
        clearCalls += 1;
        if (clearRejection !== null) throw clearRejection;
      },
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { desktopEraseTargets, eraseDesktopData, eraseFileAndLitter } from '../eraseAll';
import {
  ATOMIC_TMP_INFIX,
  BACKUP_SUFFIX,
  atomicTmpPathOf,
  atomicWriteFile,
  backupPathOf,
  isAtomicLitterOf,
} from '../atomicWrite';
import { readOriginalDir } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';
import { describeDesktopEraseReport } from '../../shared/eraseReport';

let dir = '';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  clearCalls = 0;
  clearRejection = null;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'erase-all-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('在庫は置き場所の関数から (綴りを写さない)', () => {
  it('トークン・気分の記録・人材育成・チームレーダー・ウォッチリスト・ダッシュボード・窓の配色の 7 つ', () => {
    const names = desktopEraseTargets().map((p) => path.basename(p));
    expect(names).toEqual([
      'service-hub-secrets.json',
      'service-hub-emotions.json',
      'talent.json',
      'team-radar.json',
      'state.json',
      'dashboard.html',
      'service-hub-window.json',
    ]);
  });

  /*
   * **順序は裁定であって偶然ではない** (2026-09-14 · パス 252)。
   *
   * ブラウザ版 (`renderer/security/eraseAll.ts` の `ERASE_INDEXEDDB`) は保管庫を**最後**に
   * 置き、その理由を注記に持っている。こちらはトークンを**先頭**に置く —— 逆向きである。
   * 前提が違うからで、理由は `desktopEraseTargets` の注記に書いた (両ビルドで封緘の強さが
   * 同じなので「保管庫だけ新しく記録は平文で残る」が起きず、代わりに「process が途中で
   * 死んだときに遠隔から使える残骸を残さない」を採った)。
   *
   * **両方を留めておく** —— どちらかを黙って並べ替えられないように。この検査が落ちたら、
   * 落ちた側の注記を読んでから動かすこと。
   */
  it('★ トークン (secrets) が先頭 — process が途中で死んだとき遠隔から使える残骸を残さない', () => {
    expect(path.basename(desktopEraseTargets()[0]!)).toBe('service-hub-secrets.json');
  });

  it('★ 対照: ブラウザ版は逆向き (保管庫が最後) で、そちらも意図である', () => {
    // 綴りではなく実物の一覧を読む (写すと片方が腐る)。
    const browserOrder = readOriginalSource(
      path.resolve(__dirname, '../../renderer/security/eraseAll.ts'),
    );
    const list = /export const ERASE_INDEXEDDB[^=]*=\s*\[([^\]]*)\]/.exec(browserOrder);
    expect(list, 'ERASE_INDEXEDDB が読めない (走査が死んでいる)').not.toBeNull();
    const names = [...list![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(names.length, '一覧が空 (走査が死んでいる)').toBeGreaterThanOrEqual(4);
    expect(names[names.length - 1]).toBe('business-hub-vault');
  });
});

describe('eraseFileAndLitter — 本体・控え・残骸', () => {
  it('★ 本体と .prev と <名前>.tmp-* を消し、隣のファイルは残す', async () => {
    const target = path.join(dir, 'a.json');
    await fs.writeFile(target, '{}');
    const litter = atomicTmpPathOf(target);
    await fs.writeFile(backupPathOf(target), '{}');
    await fs.writeFile(litter, '{}');
    await fs.writeFile(path.join(dir, 'keep.txt'), 'x');
    expect(await eraseFileAndLitter(target)).toBe('deleted');
    expect(await exists(target)).toBe(false);
    expect(await exists(backupPathOf(target))).toBe(false);
    expect(await exists(litter)).toBe(false);
    expect(await exists(path.join(dir, 'keep.txt'))).toBe(true);
  });

  it('本体が元から無ければ missing (残骸が在れば消す)', async () => {
    const target = path.join(dir, 'gone.json');
    const litter = atomicTmpPathOf(target);
    await fs.writeFile(litter, '{}');
    expect(await eraseFileAndLitter(target)).toBe('missing');
    expect(await exists(litter)).toBe(false);
  });

  it('★ 本体がディレクトリで消せなければ failed', async () => {
    const target = path.join(dir, 'dir.json');
    await fs.mkdir(target);
    expect(await eraseFileAndLitter(target)).toBe('failed');
  });

  it('★ 本体は消えても控えが消せなければ failed (控えは本体と同じ中身 — パス 134)', async () => {
    const target = path.join(dir, 'b.json');
    await fs.writeFile(target, '{}');
    await fs.mkdir(backupPathOf(target));
    expect(await eraseFileAndLitter(target)).toBe('failed');
    expect(await exists(target)).toBe(false);
  });

  it('★ 残骸が消せなくても failed', async () => {
    const target = path.join(dir, 'c.json');
    await fs.writeFile(target, '{}');
    await fs.mkdir(atomicTmpPathOf(target));
    expect(await eraseFileAndLitter(target)).toBe('failed');
  });

  it('置き場所のディレクトリが無ければ missing (残骸の走査も無い)', async () => {
    expect(await eraseFileAndLitter(path.join(dir, 'nope', 'x.json'))).toBe('missing');
  });
});

describe('eraseDesktopData — ファイル + renderer の保存領域', () => {
  it('★ 全部消えたら allDeleted、renderer の消去も 1 回呼ぶ、文面は null', async () => {
    const a = path.join(dir, 'a.json');
    const b = path.join(dir, 'b.json');
    await fs.writeFile(a, '{}');
    await fs.writeFile(backupPathOf(a), '{}');
    await fs.writeFile(b, '{}');
    const report = await eraseDesktopData({ targets: [a, b, path.join(dir, 'missing.json')] });
    expect(report.kind).toBe('desktop');
    expect(report.files).toEqual({ [a]: 'deleted', [b]: 'deleted', [path.join(dir, 'missing.json')]: 'missing' });
    expect(report.renderer).toBe('deleted');
    expect(report.allDeleted).toBe(true);
    expect(clearCalls).toBe(1);
    expect(describeDesktopEraseReport(report)).toBeNull();
  });

  it('★ 消せないファイルが在れば allDeleted は偽で、文面がパスを名指しする (他は消す)', async () => {
    const stuck = path.join(dir, 'stuck.json');
    const fine = path.join(dir, 'fine.json');
    await fs.mkdir(stuck);
    await fs.writeFile(fine, '{}');
    const report = await eraseDesktopData({ targets: [stuck, fine] });
    expect(report.files[stuck]).toBe('failed');
    expect(report.files[fine]).toBe('deleted');
    expect(report.allDeleted).toBe(false);
    const text = describeDesktopEraseReport(report) ?? '';
    expect(text).toContain(stuck);
    expect(text).toContain('データは残っています');
    expect(text).not.toContain('画面側の保存領域');
  });

  it('★ renderer の消去が拒まれたら failed — ファイルが消えていても「消えた」と言わない', async () => {
    clearRejection = new Error('refused');
    const a = path.join(dir, 'a.json');
    await fs.writeFile(a, '{}');
    const report = await eraseDesktopData({ targets: [a] });
    expect(report.files[a]).toBe('deleted');
    expect(report.renderer).toBe('failed');
    expect(report.allDeleted).toBe(false);
    expect(describeDesktopEraseReport(report)).toContain('画面側の保存領域');
  });

  it('手順が途中で投げた報告 (error) は、どこまで消えたか分からないと言う', async () => {
    const text = describeDesktopEraseReport({ kind: 'desktop', files: {}, renderer: 'failed', allDeleted: false, error: 'disk on fire' }) ?? '';
    expect(text).toContain('disk on fire');
    expect(text).toContain('データは残っている可能性');
    expect(text).not.toContain('画面側の保存領域');
  });

  it('差し替え口: clearRenderer を渡せば session を呼ばない', async () => {
    let mine = 0;
    const report = await eraseDesktopData({
      targets: [],
      clearRenderer: async () => {
        mine += 1;
      },
    });
    expect(mine).toBe(1);
    expect(clearCalls).toBe(0);
    expect(report.allDeleted).toBe(true);
  });
});

/*
 * **作る側と消す側は、同じ名前を使う** (2026-09-27 · パス 493d)。
 *
 * それまで `eraseFileAndLitter` は `.tmp-` と `.prev` を**自分で書き写して**探し、この検査も
 * 同じ綴りを手で書いて残骸を作っていた。`atomicWrite.ts` の作業ファイルの綴りを変えた日
 * (例えば `.part-`) は、消す側が 1 件も見つけられないのに**この検査は緑のまま** —— 手で書いた
 * 残骸は消す側の綴りと一致しているので。トークンを含む書きかけの残骸が「すべてのデータを削除」の
 * 後もディスクに残る形である。ここは**作る側が実際に作る名前**で残骸を作り、消す側がそれを
 * 見つけることを見る。
 */
describe('★ 作る側 (atomicWrite) と消す側 (eraseAll) は同じ名前を使う (パス 493d)', () => {
  it('★ atomicWriteFile が実際に開く作業ファイルを、消す側が見つけて消す', async () => {
    const target = path.join(dir, 's.json');
    const opened: string[] = [];
    const realOpen = fs.open.bind(fs);
    const spy = vi.spyOn(fs, 'open').mockImplementation(((p: Parameters<typeof fs.open>[0], ...rest: unknown[]) => {
      opened.push(String(p));
      return (realOpen as (...a: unknown[]) => ReturnType<typeof fs.open>)(p, ...rest);
    }) as typeof fs.open);
    try {
      await atomicWriteFile(target, '{"token":"x"}');
    } finally {
      spy.mockRestore();
    }
    // ディレクトリの fsync で開く dir 自身と、本体は除く —— 残るのは作業ファイル 1 つ。
    const tmps = opened.filter((p) => p !== dir && p !== target && path.dirname(p) === dir);
    expect(tmps, `atomicWriteFile が開いた物: ${JSON.stringify(opened)}`).toHaveLength(1);
    const tmp = tmps[0]!;
    expect(isAtomicLitterOf(target, path.basename(tmp))).toBe(true);
    // 書き込みの途中で落ちた = 作業ファイルが残った状態を、**同じ名前で**作る。
    await fs.writeFile(tmp, '{"token":"x"}');
    await fs.writeFile(path.join(dir, 'keep.txt'), 'x');
    expect(await eraseFileAndLitter(target)).toBe('deleted');
    expect(await exists(tmp)).toBe(false);
    expect(await exists(path.join(dir, 'keep.txt'))).toBe(true);
  });

  it('★ keepBackup が実際に書く控えを、消す側が消す', async () => {
    const target = path.join(dir, 'b.json');
    await atomicWriteFile(target, '{"token":"y"}', { keepBackup: true });
    const before = (await fs.readdir(dir)).sort();
    expect(before, '控えが書かれていない (前提が崩れている)').toEqual(['b.json', path.basename(backupPathOf(target))].sort());
    expect(await eraseFileAndLitter(target)).toBe('deleted');
    expect(await fs.readdir(dir)).toEqual([]);
  });

  /*
   * **綴りは値で留める。** 作る側と消す側を揃えて変えても、**旧い版が書いた残骸は旧い綴りのまま**
   * ディスクに在る。変えるなら消す側は旧い綴りも探す必要が在る —— この値の主張は、その判断を
   * 変える人に「旧い綴りをどうするか」を問わせるために在る。
   */
  it('★ 綴り (旧い版の残骸を見つけるため、黙って変えない)', () => {
    expect(ATOMIC_TMP_INFIX).toBe('.tmp-');
    expect(BACKUP_SUFFIX).toBe('.prev');
    const t = path.join(dir, 'a.json');
    // 旧い版 (2026-08) が実際に作っていた形。
    expect(isAtomicLitterOf(t, 'a.json.tmp-4242-1700000000000-9f3a')).toBe(true);
    expect(isAtomicLitterOf(t, 'a.json.prev')).toBe(false);
    expect(isAtomicLitterOf(t, 'a.json')).toBe(false);
    expect(isAtomicLitterOf(t, 'b.json.tmp-1')).toBe(false);
    expect(isAtomicLitterOf(t, 'aa.json.tmp-1')).toBe(false);
    expect(isAtomicLitterOf(t, 'a.json.tmpx')).toBe(false);
    expect(backupPathOf(t)).toBe(`${t}.prev`);
    expect(atomicTmpPathOf(t).startsWith(`${t}.tmp-${process.pid}-`)).toBe(true);
  });
});

/*
 * **綴りは `atomicWrite.ts` の 1 か所だけ** —— `src/main` の出荷コードを走査して数える。
 * 4 か所目が生えた日 (新しい消す所・読む所が綴りを書き写した日) に落ちる。
 * 注記は落として数える (この説明や docblock が綴りを引用しているので)。
 */
describe('★ 作業ファイルと控えの綴りを書くのは atomicWrite.ts だけ (パス 493d)', () => {
  const MAIN = path.join(__dirname, '..');
  const NEEDLES = {
    tmp: /\.tmp-/g,
    prev: /\.prev[`'"]/g,
  } as const;
  const ALLOWED: Readonly<Record<string, Readonly<Record<keyof typeof NEEDLES, number>>>> = {
    'atomicWrite.ts': { tmp: 1, prev: 1 }, // ATOMIC_TMP_INFIX / BACKUP_SUFFIX の宣言
  };

  function walk(d: string, out: string[]): void {
    for (const name of readOriginalDir(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') walk(full, out);
        continue;
      }
      if (/\.ts$/.test(name)) out.push(full);
    }
  }

  function count(code: string, re: RegExp): number {
    return [...stripComments(code).matchAll(new RegExp(re.source, 'g'))].length;
  }

  it('標本: 直す前の消す側の 2 行に針が当たり、注記の中では当たらない', () => {
    const before = [
      'const prefix = `${path.basename(target)}.tmp-`;',
      'await io.rm(`${target}.prev`);',
      "const prev = await readFileWithBackup(`${secretsPath()}.prev`, MAX_STORE_SIZE);",
    ].join('\n');
    expect(count(before, NEEDLES.tmp)).toBe(1);
    expect(count(before, NEEDLES.prev)).toBe(2);
    const inComment = '// 残骸は `<名前>.tmp-*`、控えは `${target}.prev` に在る\n/* `.prev` */';
    expect(count(inComment, NEEDLES.tmp)).toBe(0);
    expect(count(inComment, NEEDLES.prev)).toBe(0);
  });

  it('★ src/main の出荷コードで綴りを書くのは atomicWrite.ts だけ', () => {
    const files: string[] = [];
    walk(MAIN, files);
    expect(files.length, '走査が死んでいる').toBeGreaterThan(40);
    const found: Record<string, Record<string, number>> = {};
    for (const f of files) {
      const code = readOriginalSource(f);
      const rel = path.relative(MAIN, f).split(path.sep).join('/');
      for (const [k, re] of Object.entries(NEEDLES)) {
        const n = count(code, re);
        if (n > 0) (found[rel] ??= {})[k] = n;
      }
    }
    expect(found).toEqual(ALLOWED);
  });
});
