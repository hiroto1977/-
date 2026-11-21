import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VettedExternalUrl, VettedShellPath } from '../../shared/vetted';

/*
 * **OS の口の包み** (2026-10-30 · パス 559 · threat: T-220)。
 *
 * 包みは何も足さない —— electron の契約 (reject / 失敗の文 / 戻り値なし) をそのまま運ぶ。
 * 型の守り (素の string・別の種類の印を断る) は下の `compileTimeControls` を `npm run typecheck` が検査する。
 */
const shell = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  openPath: vi.fn<(path: string) => Promise<string>>(),
  showItemInFolder: vi.fn<(path: string) => void>(),
}));
vi.mock('electron', () => ({ shell }));

import { openExternalVetted, openPathVetted, showItemInFolderVetted } from '../osSinks';
import { externalUrlOrNull } from '../../shared/externalUrlGate';
import { shellTargetOrNull } from '../shellOpenGate';

const URL_V = 'https://example.com/a' as VettedExternalUrl;
const PATH_V = '/home/u/.local/business-hub/data/x.svg' as VettedShellPath;

beforeEach(() => {
  shell.openExternal.mockReset();
  shell.openPath.mockReset();
  shell.showItemInFolder.mockReset();
});

describe('osSinks —— 印つきの値をそのまま electron へ渡す', () => {
  it('openExternalVetted は URL を 1 回だけ渡し、electron の結果を返す', async () => {
    shell.openExternal.mockResolvedValue(undefined);
    await expect(openExternalVetted(URL_V)).resolves.toBeUndefined();
    expect(shell.openExternal.mock.calls).toEqual([[URL_V]]);
  });

  it('openExternalVetted は electron の reject をそのまま運ぶ (握り潰さない)', async () => {
    shell.openExternal.mockRejectedValue(new Error('no browser'));
    await expect(openExternalVetted(URL_V)).rejects.toThrow(new Error('no browser'));
  });

  it('openPathVetted は失敗の文をそのまま返す (成功は空文字)', async () => {
    shell.openPath.mockResolvedValueOnce('').mockResolvedValueOnce('関連付けがありません');
    await expect(openPathVetted(PATH_V)).resolves.toBe('');
    await expect(openPathVetted(PATH_V)).resolves.toBe('関連付けがありません');
    expect(shell.openPath.mock.calls).toEqual([[PATH_V], [PATH_V]]);
  });

  it('showItemInFolderVetted はパスを 1 回だけ渡す', () => {
    showItemInFolderVetted(PATH_V);
    expect(shell.showItemInFolder.mock.calls).toEqual([[PATH_V]]);
  });
});

/*
 * **型の陰性対照** —— 呼ばれない。`@ts-expect-error` が「次の行は型の誤り」と宣言するので、
 * 口が素の string を受けるように戻された日に `tsc` が「不要な @ts-expect-error」で落ちる。
 */
async function compileTimeControls(raw: string, input: unknown): Promise<void> {
  // @ts-expect-error 関門を通らない URL は渡せない
  await openExternalVetted(raw);
  // @ts-expect-error 関門を通らないパスは渡せない
  await openPathVetted(raw);
  // @ts-expect-error 関門を通らないパスは渡せない
  showItemInFolderVetted(raw);
  // @ts-expect-error URL の印はパスの口へ渡せない (種類の取り違え)
  await openPathVetted(URL_V);
  // @ts-expect-error パスの印は URL の口へ渡せない
  await openExternalVetted(PATH_V);
  // @ts-expect-error null の門を通る前 (null を含む) は渡せない
  await openExternalVetted(externalUrlOrNull(input));
  const url = externalUrlOrNull(input);
  if (url !== null) await openExternalVetted(url);
  const p = await shellTargetOrNull(input);
  if (p !== null) {
    await openPathVetted(p);
    showItemInFolderVetted(p);
  }
}
void compileTimeControls;
