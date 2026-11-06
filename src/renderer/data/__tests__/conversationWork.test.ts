import { describe, expect, it, vi } from 'vitest';
import { publishConversationWork, subscribeConversationWork } from '../conversationWork';

describe('conversationWork (会話の作業を景色へ知らせる口)', () => {
  it('購読者へ 3 つの欄だけを渡す (余計な欄は持ち込まない)', () => {
    const got: unknown[] = [];
    const off = subscribeConversationWork((e) => got.push(e));
    publishConversationWork({
      stage: 'running',
      serviceId: 'github',
      action: 'create-issue',
      // @ts-expect-error 余計な欄 (話した文・引数) は型でも断る
      params: { secret: 'x' },
      text: '話した文',
    });
    off();
    expect(got).toEqual([{ stage: 'running', serviceId: 'github', action: 'create-issue' }]);
  });

  it('操作名は 40 字で切る (景色に出す前提の天井)', () => {
    const got: Array<{ action: string }> = [];
    const off = subscribeConversationWork((e) => got.push(e));
    publishConversationWork({ stage: 'done', serviceId: 'github', action: 'a'.repeat(100) });
    off();
    expect(got[0]!.action).toBe('a'.repeat(40));
  });

  it('購読を止めると届かない', () => {
    const h = vi.fn();
    const off = subscribeConversationWork(h);
    off();
    publishConversationWork({ stage: 'done', serviceId: 'github', action: 'x' });
    expect(h).not.toHaveBeenCalled();
  });

  it('購読者が例外を投げても発行側へ戻さず、ほかの購読者へ届ける', () => {
    const bad = vi.fn(() => {
      throw new Error('景色が壊れた');
    });
    const good = vi.fn();
    const off1 = subscribeConversationWork(bad);
    const off2 = subscribeConversationWork(good);
    expect(() => publishConversationWork({ stage: 'failed', serviceId: 'github', action: 'x' })).not.toThrow();
    off1();
    off2();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
