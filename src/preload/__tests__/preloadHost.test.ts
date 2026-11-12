import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rereadModule } from '../../shared/__tests__/rereadModule';
// 静的な import を 1 つ持つ: 変異検査の vitest は import の連なりで関連する検査を選ぶので、動的な読み直しだけだとこの検査が走らない。
import { IPC_CHANNELS as STATIC_CHANNELS } from '../preloadHost';

/*
 * preloadHost.ts の閉じたチャンネル表 (MG-046)。
 *
 * - 表の 15 本は preload が呼ぶチャンネルと過不足なく一致する (名前を足した・消したが片方だけなら鳴る)。
 * - 表に無い名前は **main へ送らず**拒む (呼び出し側が名前を取り違えても合鍵にならない)。
 * - 引数は順序も数もそのまま main へ届く。
 */

const calls: { channel: string; args: unknown[] }[] = [];
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => undefined },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      calls.push({ channel, args });
      return Promise.resolve(`reply:${channel}`);
    },
  },
}));

const EXPECTED = [
  'app:getVersion', 'app:checkUpdate', 'app:openExternal', 'app:revealInFolder', 'app:openPath',
  'app:setColorScheme', 'secrets:set', 'secrets:clear', 'secrets:list', 'secrets:protection',
  'app:eraseAll', 'fetch:snapshot', 'action:invoke', 'oauth:isSupported', 'oauth:authorize',
];

describe('preloadHost の閉じたチャンネル表', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('静的に読んだ表も同じ 15 本', () => {
    expect([...STATIC_CHANNELS].sort()).toEqual([...EXPECTED].sort());
  });

  it('表は preload が呼ぶ 15 本と過不足なく一致する', async () => {
    const { IPC_CHANNELS } = await rereadModule<typeof import('../preloadHost')>(import.meta.url, '../preloadHost');
    expect([...IPC_CHANNELS].sort()).toEqual([...EXPECTED].sort());
  });

  it.each(EXPECTED)('★ %s は同じチャンネルへ引数をそのまま渡す', async (channel) => {
    const { invokeIpc } = await rereadModule<typeof import('../preloadHost')>(import.meta.url, '../preloadHost');
    await expect(invokeIpc(channel, 'a', 2, { k: 1 })).resolves.toBe(`reply:${channel}`);
    expect(calls).toEqual([{ channel, args: ['a', 2, { k: 1 }] }]);
  });

  it.each(['', 'app:other', 'toString', '__proto__', 'constructor', 'hasOwnProperty'])(
    '★ 表に無い名前 %j は main へ送らず拒む',
    async (channel) => {
      const { invokeIpc } = await rereadModule<typeof import('../preloadHost')>(import.meta.url, '../preloadHost');
      await expect(invokeIpc(channel, 'x')).rejects.toThrow(new Error('unknown ipc channel'));
      expect(calls).toEqual([]);
    },
  );
});
