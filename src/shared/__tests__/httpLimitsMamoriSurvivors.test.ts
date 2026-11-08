import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBodyWithCap, withBodyDeadline, withTimeout } from '../httpLimits';
import { hostDeadline, hostIsNoCors } from '../httpLimitsHost';

/*
 * MG-047: `httpLimits.mamori` + host 壁の変異検査で生き残った 7 つを値で留める。
 * 断りの文面を丸ごと・unref の有無・AbortSignal.any が無い環境・no-cors の判定の入力の幅。
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('readBodyWithCap —— body の無い応答 (素朴なモック) の断りの文面', () => {
  it('★ 上限を超えたら「label response too large (N > MAX bytes)」と丸ごと言う', async () => {
    const res = { headers: new Headers(), body: null, text: async () => 'x'.repeat(11) } as unknown as Response;
    await expect(readBodyWithCap(res, 10, 'svc')).rejects.toThrow(new Error('svc response too large (11 > 10 bytes)'));
  });
  it('上限ちょうどは通す', async () => {
    const res = { headers: new Headers(), body: null, text: async () => 'x'.repeat(10) } as unknown as Response;
    await expect(readBodyWithCap(res, 10, 'svc')).resolves.toBe('x'.repeat(10));
  });
});

describe('時計の部品 —— timer を unref するのは withBodyDeadline だけ', () => {
  const spyTimer = () => {
    const unref = vi.fn();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => ({ unref })) as unknown as typeof setTimeout);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation((() => undefined) as unknown as typeof clearTimeout);
    return unref;
  };
  it('★ withBodyDeadline は unref する (締切の timer がプロセスを起こし続けない)', async () => {
    const unref = spyTimer();
    await withBodyDeadline(1000, null, async () => new Response('x'));
    expect(unref).toHaveBeenCalledTimes(1);
  });
  it('★ withTimeout は unref しない (使い終えたら clearTimeout で落とす)', async () => {
    const unref = spyTimer();
    await withTimeout(1000, null, async () => 1);
    expect(unref).not.toHaveBeenCalled();
  });
  it('hostDeadline の unref は引数のとおり', () => {
    const unref = spyTimer();
    hostDeadline(1, null, false);
    expect(unref).not.toHaveBeenCalled();
    hostDeadline(1, null, true);
    expect(unref).toHaveBeenCalledTimes(1);
  });
});

describe('hostDeadline —— AbortSignal.any が無い環境では自前の中断だけ', () => {
  it('★ any が在れば呼び出し側の中断も効く', () => {
    const caller = new AbortController();
    const d = hostDeadline(60_000, caller.signal, true);
    expect(d.signal.aborted).toBe(false);
    caller.abort();
    expect(d.signal.aborted).toBe(true);
  });
  it('★ any が無ければ呼び出し側は合成されない (落ちずに自前の signal を返す)', () => {
    vi.stubGlobal('AbortSignal', { ...AbortSignal, any: undefined });
    try {
      const caller = new AbortController();
      const d = hostDeadline(60_000, caller.signal, true);
      caller.abort();
      expect(d.signal.aborted).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('hostIsNoCors —— どんな入力でも投げずに、no-cors のときだけ true', () => {
  it.each([null, undefined, 0, 'no-cors', {}, { mode: 'cors' }])('%j → false', (v) => {
    expect(hostIsNoCors(v)).toBe(false);
  });
  it('{ mode: "no-cors" } → true', () => {
    expect(hostIsNoCors({ mode: 'no-cors' })).toBe(true);
  });
});
