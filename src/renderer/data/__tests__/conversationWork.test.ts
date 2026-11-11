import { describe, expect, it, vi } from 'vitest';
import { newConversationWorkRunId, publishConversationWork, subscribeConversationWork } from '../conversationWork';

describe('conversationWork (会話の作業を景色へ知らせる口)', () => {
  it('購読者へ 4 つの欄だけを渡す (余計な欄は持ち込まない)', () => {
    const got: unknown[] = [];
    const off = subscribeConversationWork((e) => got.push(e));
    publishConversationWork({
      stage: 'running',
      serviceId: 'github',
      action: 'create-issue',
      runId: 'w9',
      // @ts-expect-error 余計な欄 (話した文・引数) は型でも断る
      params: { secret: 'x' },
      text: '話した文',
    });
    off();
    expect(got).toEqual([{ stage: 'running', serviceId: 'github', action: 'create-issue', runId: 'w9' }]);
  });

  it('操作名は 40 字で切る (景色に出す前提の天井)', () => {
    const got: Array<{ action: string }> = [];
    const off = subscribeConversationWork((e) => got.push(e));
    publishConversationWork({ stage: 'done', serviceId: 'github', action: 'a'.repeat(100), runId: 'w1' });
    off();
    expect(got[0]!.action).toBe('a'.repeat(40));
  });

  it('操作名の天井は文字で数える (絵文字 1 つを 2 つに割って切らない)', () => {
    const got: Array<{ action: string }> = [];
    const off = subscribeConversationWork((e) => got.push(e));
    publishConversationWork({ stage: 'done', serviceId: 'github', action: '😀'.repeat(41), runId: 'w1' });
    off();
    expect(got[0]!.action).toBe('😀'.repeat(40));
  });

  it('購読を止めると届かない', () => {
    const h = vi.fn();
    const off = subscribeConversationWork(h);
    off();
    publishConversationWork({ stage: 'done', serviceId: 'github', action: 'x', runId: 'w1' });
    expect(h).not.toHaveBeenCalled();
  });

  it('購読者が例外を投げても発行側へ戻さず、ほかの購読者へ届ける', () => {
    const bad = vi.fn(() => {
      throw new Error('景色が壊れた');
    });
    const good = vi.fn();
    const off1 = subscribeConversationWork(bad);
    const off2 = subscribeConversationWork(good);
    expect(() => publishConversationWork({ stage: 'failed', serviceId: 'github', action: 'x', runId: 'w1' })).not.toThrow();
    off1();
    off2();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('実行の印は実行ごとに違い、長すぎる印は切る', () => {
    expect(newConversationWorkRunId()).not.toBe(newConversationWorkRunId());
    const got: Array<{ runId: string }> = [];
    const off = subscribeConversationWork((e) => got.push(e));
    publishConversationWork({ stage: 'done', serviceId: 'github', action: 'x', runId: 'r'.repeat(100) });
    off();
    expect(got[0]!.runId).toBe('r'.repeat(40));
  });
});
