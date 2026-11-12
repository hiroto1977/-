import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { VettedExportPath, VettedShellPath } from '../../../shared/vetted';

/*
 * **書き出しの行き先の関門と口の組** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * 関門 `exportTargetOrNull` は `isSafeExportPath` と**同じ判定**を返し、通った物にだけ印を付ける。
 * 口 `writeExportFileVetted` は何も足さずに `writeExportFile` へ渡す (実行時の閉じ込めと 0600 はそちら)。
 * 型の守り (素の string・別の種類の印を断る) は下の `compileTimeControls` を `npm run typecheck` が検査する。
 */
const write = vi.hoisted(() => vi.fn<(p: string, c: string) => Promise<void>>());
vi.mock('../exportPaths', async (orig) => ({
  ...(await orig<typeof import('../exportPaths')>()),
  writeExportFile: write,
}));

import { exportTargetOrNull, writeExportFileVetted } from '../exportSink';
import { isSafeExportPath } from '../exportPaths';

const HOME = path.resolve('/home/user');
const DATA = path.join(HOME, '.local', 'business-hub', 'data');

describe('exportTargetOrNull —— isSafeExportPath と同じ判定に印を付ける', () => {
  const cases: readonly [unknown, string][] = [
    [path.join(DATA, 'dashboard.html'), '.html'],
    [path.join(DATA, 'templates', 'card.svg'), '.svg'],
    [path.join(DATA, 'dashboard.md'), '.md'],
    [path.join(DATA, 'dashboard.md'), '.html'],
    [path.join(DATA, 'business-dashboard.html', 'x.html'), '.html'],
    [path.join(HOME, '.ssh', 'authorized_keys.svg'), '.svg'],
    [path.join(DATA, '..', 'state.json.tmp', 'x.svg'), '.svg'],
    ['', '.svg'],
  ];

  it('★ 通る物は同じ文字列をそのまま返し、断る物は null —— 判定は isSafeExportPath と 1 つずつ一致する', () => {
    let passed = 0;
    for (const [p, ext] of cases) {
      const got = exportTargetOrNull(p, HOME, ext);
      const want = isSafeExportPath(p as string, HOME, ext);
      expect(got === null ? false : true, String(p)).toBe(want);
      if (got !== null) {
        expect(got).toBe(p);
        passed++;
      }
    }
    // 走査が空虚でない (通る物と断る物の両方を見た)。
    expect(passed).toBe(3);
  });

  it('文字列でない値は断る (呼ばれる前に型の門で落ちる)', () => {
    for (const v of [undefined, null, 42, {}, ['x.svg'], true]) {
      expect(exportTargetOrNull(v, HOME, '.svg')).toBeNull();
    }
  });
});

describe('writeExportFileVetted —— 印つきの行き先を何も足さずに渡す', () => {
  it('行き先と本文を 1 回だけ渡し、writeExportFile の結果をそのまま返す', async () => {
    write.mockReset().mockResolvedValue(undefined);
    const target = exportTargetOrNull(path.join(DATA, 'dashboard.html'), HOME, '.html');
    expect(target).not.toBeNull();
    if (target === null) return;
    await expect(writeExportFileVetted(target, '<html></html>')).resolves.toBeUndefined();
    expect(write.mock.calls).toEqual([[target, '<html></html>']]);
  });

  it('writeExportFile の reject をそのまま運ぶ (閉じ込めの断りを握り潰さない)', async () => {
    write.mockReset().mockRejectedValue(new Error('書き出し先が symlink です'));
    const target = path.join(DATA, 'x.svg') as VettedExportPath;
    await expect(writeExportFileVetted(target, 'x')).rejects.toThrow(new Error('書き出し先が symlink です'));
  });
});

/*
 * **型の陰性対照** —— 呼ばれない。`@ts-expect-error` が「次の行は型の誤り」と宣言するので、
 * 口が素の string を受けるように戻された日に `tsc` が「不要な @ts-expect-error」で落ちる。
 */
async function compileTimeControls(raw: string, shellPath: VettedShellPath, input: unknown): Promise<void> {
  // @ts-expect-error 関門を通らない行き先は渡せない
  await writeExportFileVetted(raw, 'x');
  // @ts-expect-error 開く口の印は書く口へ渡せない (種類の取り違え)
  await writeExportFileVetted(shellPath, 'x');
  // @ts-expect-error null の門を通る前 (null を含む) は渡せない
  await writeExportFileVetted(exportTargetOrNull(input, '/h', '.svg'), 'x');
  const t = exportTargetOrNull(input, '/h', '.svg');
  if (t !== null) await writeExportFileVetted(t, 'x');
}
void compileTimeControls;
