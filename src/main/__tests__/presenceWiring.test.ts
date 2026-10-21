import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/*
 * 本人確認の門を Electron に繋ぐ口 (threat: T-147)。ネイティブのダイアログは偽物で、
 * 「何を見せたか」「既定のボタンが断る側か」「窓が無ければ断るか」「呼び出し元を見るか」を測る。
 */
const dialogCalls: { win: unknown; opts: Record<string, unknown> }[] = [];
let dialogAnswer = 1;
let windows: unknown[] = [];
let focused: unknown = null;

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: true },
  BrowserWindow: {
    getFocusedWindow: () => focused,
    getAllWindows: () => windows,
  },
  dialog: {
    showMessageBox: (win: unknown, opts: Record<string, unknown>) => {
      dialogCalls.push({ win, opts });
      return Promise.resolve({ response: dialogAnswer });
    },
  },
}));

import { recentPresenceEvents, requirePresence } from '../presenceWiring';

const GOOD = pathToFileURL(path.join(path.resolve(__dirname, '..'), '..', 'dist', 'index.html')).href;
const ev = (url: string, parent: unknown = null) => ({ senderFrame: { url, parent } }) as never;
let n = 0;
const req = () => ({ channel: 'slack/send-message', tier: 'external-write' as const, summary: `text=「${(n += 1)}」` });

beforeEach(() => {
  dialogCalls.length = 0;
  dialogAnswer = 1;
  windows = [{ id: 1 }];
  focused = null;
});

describe('requirePresence (threat: T-147)', () => {
  it('★ 既定のボタンは「実行しない」・取り消しも同じ側・要約と段階を見せる', async () => {
    const r = await requirePresence(ev(GOOD), req());
    expect(r.ok).toBe(true);
    const o = dialogCalls[0]!.opts;
    expect(o.buttons).toEqual(['実行しない', '実行する']);
    expect(o.defaultId).toBe(0);
    expect(o.cancelId).toBe(0);
    expect(o.type).toBe('warning');
    expect(String(o.detail)).toContain('slack/send-message');
    expect(String(o.detail)).toContain('text=「');
    expect(o.message).toBe('外部のサービスへ書き込みます');
  });

  it('「実行しない」を選べば断る', async () => {
    dialogAnswer = 0;
    expect((await requirePresence(ev(GOOD), req())).ok).toBe(false);
  });

  it('★ 窓が無ければ断る (fail closed)・フォーカス中の窓があればそれを親にする', async () => {
    windows = [];
    expect((await requirePresence(ev(GOOD), req())).ok).toBe(false);
    expect(dialogCalls).toHaveLength(0);
    focused = { id: 'f' };
    windows = [{ id: 'w' }];
    await requirePresence(ev(GOOD), req());
    expect(dialogCalls[0]!.win).toEqual({ id: 'f' });
  });

  it.each([
    ['別オリジンのページ', ev('https://evil.example/')],
    ['dist の外の file:', ev(pathToFileURL('/etc/passwd.html').href)],
    ['子フレーム', ev(GOOD, { url: 'x' })],
    ['送り元の情報が無い', { } as never],
    ['senderFrame が null', { senderFrame: null } as never],
  ])('★ 信頼できない呼び出し元 (%s) はダイアログも出さずに断る', async (_n, e) => {
    const before = dialogCalls.length;
    expect((await requirePresence(e, req())).ok).toBe(false);
    expect(dialogCalls.length).toBe(before);
    expect(recentPresenceEvents().at(-1)?.kind).toBe('untrusted-sender');
  });
});
