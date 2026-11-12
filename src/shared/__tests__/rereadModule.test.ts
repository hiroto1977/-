/**
 * **`rereadModule` は対象だけを評価し直す** —— 依存先はキャッシュのまま (2026-09-27 · パス 495)。
 *
 * 何のために在るかは `rereadModule.ts` の docblock に書いた (変異検査の「偽の生存」の出どころ)。
 * ここでは約束を 1 つずつ振る舞いで留める —— 対象は呼ぶたびに新しく評価される /
 * 依存先は静的に読んだ物と同じ物 / `vi.doMock` した依存先は読み直した対象に効く /
 * 相対でない道は断る。最後の対照は、この関数が避けている形 (`vi.resetModules()` は
 * 依存先まで評価し直す) が**実際にそうなる**ことを見せる。
 *
 * 標本は `rereadFixture/` の 2 本で、製品のコードを 1 行も読まない —— だからこのファイルの
 * `vi.resetModules()` は、変異検査の被覆を 1 つも動かさない
 * (`inTestModuleLoadCensus.test.ts` の台帳に理由つきで載っている)。
 */
import { describe, expect, it, vi } from 'vitest';
import { rereadModule } from './rereadModule';
import * as dep from './rereadFixture/dep';
import * as target from './rereadFixture/target';

type Target = typeof import('./rereadFixture/target');

describe('rereadModule — 対象だけを評価し直す', () => {
  it('★ 対象は呼ぶたびに新しく評価される', async () => {
    const a = await rereadModule<Target>(import.meta.url, './rereadFixture/target');
    const b = await rereadModule<Target>(import.meta.url, './rereadFixture/target');
    expect(a.targetInstance).toEqual({ label: 'target' });
    expect(a.targetInstance).not.toBe(target.targetInstance);
    expect(b.targetInstance).not.toBe(a.targetInstance);
  });

  it('★ 依存先は評価し直さない (静的に読んだ物と同じ物を見る)', async () => {
    const a = await rereadModule<Target>(import.meta.url, './rereadFixture/target');
    expect(target.seenDep).toBe(dep.depInstance);
    expect(a.seenDep).toBe(dep.depInstance);
    expect(a.answerFromDep()).toBe('real');
  });

  it('★ vi.doMock した依存先は、読み直した対象に効く (外せば本物へ戻る)', async () => {
    vi.doMock('./rereadFixture/dep', () => ({
      depInstance: { label: 'mocked' },
      depAnswer: () => 'mocked',
    }));
    try {
      const a = await rereadModule<Target>(import.meta.url, './rereadFixture/target');
      expect(a.answerFromDep()).toBe('mocked');
      expect(a.seenDep).toEqual({ label: 'mocked' });
    } finally {
      vi.doUnmock('./rereadFixture/dep');
    }
    const b = await rereadModule<Target>(import.meta.url, './rereadFixture/target');
    expect(b.answerFromDep()).toBe('real');
    expect(b.seenDep).toBe(dep.depInstance);
  });

  it('★ 相対でない道は断る (パッケージは計器が入らないので読み直す意味が無い)', async () => {
    await expect(rereadModule(import.meta.url, 'node:path')).rejects.toThrow(/相対の道だけ/);
    await expect(rereadModule(import.meta.url, 'vitest')).rejects.toThrow(/相対の道だけ/);
  });

  it('対照: vi.resetModules() + 動的 import は、依存先まで評価し直す (この関数が避けている形)', async () => {
    // このファイルの最後に置く —— 台帳を丸ごと空にするので、後ろの検査の前提を変える。
    vi.resetModules();
    const a = (await import('./rereadFixture/target')) as Target;
    expect(a.seenDep).toEqual(dep.depInstance);
    expect(a.seenDep).not.toBe(dep.depInstance);
  });
});
