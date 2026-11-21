/** @vitest-environment jsdom */
/**
 * **待つ側の 1 組を留める** (2026-09-12 · パス 169)。
 *
 * `jsdomWait.ts` は検査の足回りなので、**壊れても本体の検査が「通る」側に倒れない**
 * ことが要る —— 待ちが空振りして即座に返るようになったら、それを使っている検査は
 * 「未だ描かれていない画面」を見て落ちる…のではなく、**運が良ければ通ってしまう**。
 * だから時間切れの文面と、返す物の有無をここで固定する。
 */
import { describe, expect, it } from 'vitest';
import { settleUntil, waitForElement, waitForText } from './jsdomWait';

describe('settleUntil', () => {
  it('★ 条件が満たされたら返る (時間切れを待たない)', async () => {
    let n = 0;
    const started = Date.now();
    await settleUntil(() => (n += 1) >= 2, '2 回目', { timeoutMs: 2000, stepMs: 1 });
    expect(n).toBeGreaterThanOrEqual(2);
    expect(Date.now() - started, '時間切れまで待ってしまっている').toBeLessThan(1500);
  });

  it('★ 後から真になる条件を待てる (固定回数では届かない位置)', async () => {
    let ready = false;
    setTimeout(() => { ready = true; }, 120);
    await settleUntil(() => ready, '120ms 後の合図', { timeoutMs: 2000, stepMs: 5 });
    expect(ready).toBe(true);
  });

  it('★ 時間切れは「何を待っていたか」を言って投げる', async () => {
    await expect(
      settleUntil(() => false, '貼り付け欄', { timeoutMs: 30, stepMs: 5 }),
    ).rejects.toThrow(/貼り付け欄/);
  });

  it('★ 時間切れの文は上限と、待っている物の種類も言う', async () => {
    const err = await settleUntil(() => false, 'x', { timeoutMs: 30, stepMs: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain('30ms');
    expect(msg).toContain('crypto.subtle');
  });
});

describe('waitForElement', () => {
  it('★ もう在る要素はそのまま返る', async () => {
    const el = document.createElement('span');
    el.id = 'here';
    document.body.appendChild(el);
    const got = await waitForElement(() => document.querySelector('#here'), 'span#here');
    expect(got).toBe(el);
    el.remove();
  });

  it('★ 後から現れる要素を待って返す', async () => {
    setTimeout(() => {
      const el = document.createElement('b');
      el.id = 'later';
      document.body.appendChild(el);
    }, 80);
    const got = await waitForElement(() => document.querySelector('#later'), 'b#later', {
      timeoutMs: 2000,
      stepMs: 5,
    });
    expect(got.id).toBe('later');
    got.remove();
  });

  it('★ 無ければ名前を言って投げる (undefined を返さない)', async () => {
    await expect(
      waitForElement(() => document.querySelector('#never'), '在るはずの欄', {
        timeoutMs: 30,
        stepMs: 5,
      }),
    ).rejects.toThrow(/在るはずの欄/);
  });

  it('対照: null を返す find と、要素を返す find を取り違えない', async () => {
    const el = document.createElement('i');
    document.body.appendChild(el);
    await expect(waitForElement(() => el, 'ある')).resolves.toBe(el);
    await expect(
      waitForElement(() => null, 'ない', { timeoutMs: 20, stepMs: 5 }),
    ).rejects.toThrow();
    el.remove();
  });
});

describe('waitForText', () => {
  it('★ もう出ている文はそのまま通る', async () => {
    await waitForText(() => 'すでに出ている', 'すでに');
  });

  it('★ 出なければ、待っていた文と**いま出ている文**の両方を言う', async () => {
    const err = await waitForText(() => 'いま出ている文', '出ないはずの文', {
      timeoutMs: 30,
      stepMs: 5,
    }).catch((e: unknown) => e);
    const msg = (err as Error).message;
    expect(msg, '待っていた文が出ていない').toContain('出ないはずの文');
    expect(msg, 'いま出ている文が出ていない (綴り違いか未描画かが読めない)').toContain('いま出ている文');
  });
});
