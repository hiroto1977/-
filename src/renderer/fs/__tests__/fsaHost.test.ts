import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostDirectoryPicker } from '../fsaHost';

/*
 * fsa.mamori の薄い壁 (fsaHost.ts) —— フォルダ選択の口を「取り出す」だけの関数を、3 つの環境で直接留める。
 *
 * 元の fsa.ts は `typeof window !== 'undefined' && …` を「jsdom では window が必ず在るので無い側を再現できない」として
 * 変異検査から外していた。`vi.stubGlobal('window', undefined)` で無い側を作れるので、外すのをやめてここで測る。
 * IndexedDB の 5 つの口 (開く・消す・置く・読む・消す) は fsa.test.ts と eraseAll.test.ts が fsa.ts 経由で通す。
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hostDirectoryPicker', () => {
  it('window が無い環境 (Node / main プロセス) では undefined —— 投げない', () => {
    vi.stubGlobal('window', undefined);
    expect(hostDirectoryPicker()).toBeUndefined();
  });

  it('window は在るが showDirectoryPicker が無い環境 (Safari / Firefox) では undefined', () => {
    vi.stubGlobal('window', {});
    expect(hostDirectoryPicker()).toBeUndefined();
  });

  it('在れば、その口そのものを返す (呼ばない)', () => {
    const picker = vi.fn();
    vi.stubGlobal('window', { showDirectoryPicker: picker });
    expect(hostDirectoryPicker()).toBe(picker);
    expect(picker).not.toHaveBeenCalled();
  });
});
