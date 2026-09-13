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
import { promises as fs } from 'node:fs';
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
  it('トークン・気分の記録・人材育成・チームレーダー・ウォッチリスト・ダッシュボードの 6 つ', () => {
    const names = desktopEraseTargets().map((p) => path.basename(p));
    expect(names).toEqual([
      'service-hub-secrets.json',
      'service-hub-emotions.json',
      'talent.json',
      'team-radar.json',
      'state.json',
      'dashboard.html',
    ]);
  });
});

describe('eraseFileAndLitter — 本体・控え・残骸', () => {
  it('★ 本体と .prev と <名前>.tmp-* を消し、隣のファイルは残す', async () => {
    const target = path.join(dir, 'a.json');
    await fs.writeFile(target, '{}');
    await fs.writeFile(`${target}.prev`, '{}');
    await fs.writeFile(`${target}.tmp-1-2-3`, '{}');
    await fs.writeFile(path.join(dir, 'keep.txt'), 'x');
    expect(await eraseFileAndLitter(target)).toBe('deleted');
    expect(await exists(target)).toBe(false);
    expect(await exists(`${target}.prev`)).toBe(false);
    expect(await exists(`${target}.tmp-1-2-3`)).toBe(false);
    expect(await exists(path.join(dir, 'keep.txt'))).toBe(true);
  });

  it('本体が元から無ければ missing (残骸が在れば消す)', async () => {
    const target = path.join(dir, 'gone.json');
    await fs.writeFile(`${target}.tmp-9`, '{}');
    expect(await eraseFileAndLitter(target)).toBe('missing');
    expect(await exists(`${target}.tmp-9`)).toBe(false);
  });

  it('★ 本体がディレクトリで消せなければ failed', async () => {
    const target = path.join(dir, 'dir.json');
    await fs.mkdir(target);
    expect(await eraseFileAndLitter(target)).toBe('failed');
  });

  it('★ 本体は消えても控えが消せなければ failed (控えは本体と同じ中身 — パス 134)', async () => {
    const target = path.join(dir, 'b.json');
    await fs.writeFile(target, '{}');
    await fs.mkdir(`${target}.prev`);
    expect(await eraseFileAndLitter(target)).toBe('failed');
    expect(await exists(target)).toBe(false);
  });

  it('★ 残骸が消せなくても failed', async () => {
    const target = path.join(dir, 'c.json');
    await fs.writeFile(target, '{}');
    await fs.mkdir(`${target}.tmp-77`);
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
    await fs.writeFile(`${a}.prev`, '{}');
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
