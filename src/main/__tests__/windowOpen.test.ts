/**
 * `window.open()` も `app:openExternal` と同じ本人確認の門を通る (2026-10-24 · threat: T-173)。
 * 直す前は `setWindowOpenHandler` が URL の関門だけを通して OS へ渡したので、200 回呼ぶと 200 回が届いた
 * (IPC の `app:openExternal` は 20 回で止まる・実機の Electron で測定)。
 */
import { describe, expect, it, vi } from 'vitest';
import { createPresenceGate } from '../userPresence';
import { openFromWindow } from '../windowOpen';

function harness(trusted = true) {
  const gate = createPresenceGate({ confirm: async () => false });
  const open = vi.fn<(u: string) => Promise<void>>().mockResolvedValue();
  const deps = {
    senderUrl: () => (trusted ? 'file:///app/dist/index.html' : 'https://evil.example/'),
    guard: (_senderUrl: string, req: Parameters<typeof gate.guard>[0]) => gate.guard(req, trusted),
    open,
  };
  return { open, deps };
}

describe('openFromWindow — 速度制限を迂回しない (threat: T-173)', () => {
  it('★ 200 回呼んでも OS に届くのは egress の枠 (20 回) まで', async () => {
    const { open, deps } = harness();
    for (let i = 0; i < 200; i++) await openFromWindow(`https://example.com/p${i}`, deps);
    expect(open.mock.calls.length).toBe(20);
  });

  it('対照: 枠の内側なら普通に開く', async () => {
    const { open, deps } = harness();
    await openFromWindow('https://example.com/a', deps);
    expect(open).toHaveBeenCalledWith('https://example.com/a');
  });

  it('★ 信用できない送り手 (同梱の画面でない窓) からは開かない', async () => {
    const { open, deps } = harness(false);
    await openFromWindow('https://example.com/a', deps);
    expect(open).not.toHaveBeenCalled();
  });

  it('URL の関門は今までどおり: javascript: / file: は門へ届く前に断る', async () => {
    const { open, deps } = harness();
    const guard = vi.spyOn(deps, 'guard');
    await openFromWindow('javascript:alert(1)', deps);
    await openFromWindow('file:///etc/passwd', deps);
    expect(open).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });

  it('門や OS が投げても reject にならず、記録に残す', async () => {
    const log = vi.fn();
    await expect(
      openFromWindow('https://example.com/a', {
        senderUrl: () => 'file:///app/dist/index.html',
        guard: async () => {
          throw new Error('boom');
        },
        open: async () => {},
        log,
      }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
