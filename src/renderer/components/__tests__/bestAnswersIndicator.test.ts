/** @vitest-environment jsdom */
/**
 * **上部バーの印** —— ベスト3 の「バックグラウンド」の目に見える半分 (2026-09-26)。
 *
 * 仕事場 (`data/bestAnswersJob.ts`) はどの画面に居ても走り続けるが、終わったことが
 * 見えなければ利用者は戻る理由を知らない。この印はどの画面でも上部バーに出る唯一の合図で、
 * それまで**検査が 1 本も無かった** (画面を離れて戻る検査は `bestAnswersOnScreen` が
 * 画面の単位で持つが、上部バーは描いていない)。
 *
 * **実物の仕事場を実物のエンジンで走らせる** —— 送り手だけを手で解く。
 * 待ちは条件で取る (法則 wait-for-condition-not-ticks)。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BestAnswersIndicator } from '../BestAnswersIndicator';
import {
  _resetBestJobForTests,
  cancelBestJob,
  getBestJob,
  markBestJobDelivered,
  startBestJob,
} from '../../data/bestAnswersJob';
import { MAX_BEST_ANSWER_CALLS, planCalls, type SendChat } from '../../data/bestAnswers';
import { onNavigate } from '../../navigate';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

const REQ = {
  question: '就業規則の作成を頼みたい',
  ragQuery: '就業規則の作成を頼みたい',
  turns: [{ role: 'user' as const, content: '就業規則の作成を頼みたい' }],
  catalog: [],
  providerIds: [],
};

/**
 * 手で解く送り手。`releaseOne` は待っている 1 つを解き、`drain` は待っている全部を解いて
 * **以後の送信もすぐ返す**。
 *
 * ★ **回答者は並列で 3 本まで**なので、ある時点で待っているのは 3 つだけである。
 * 「5 回 releaseOne」と書くと残り 2 つが永久に待ち、`act` の中で `finished` を待つ検査は
 * 閉じない (1 度目にそう書いて、30 秒の時間切れが**後続の検査まで**巻き込んだ)。
 */
function held(): { send: SendChat; releaseOne: () => void; drain: () => void } {
  const waiting: (() => void)[] = [];
  let auto = false;
  const answer = (n: number) => ({ ok: true as const, text: `回答 ${n}\n- 要点` });
  let n = 0;
  const send: SendChat = () =>
    new Promise((resolve) => {
      n += 1;
      const k = n;
      if (auto) resolve(answer(k));
      else waiting.push(() => resolve(answer(k)));
    });
  return {
    send,
    releaseOne: () => waiting.shift()?.(),
    drain: () => {
      auto = true;
      waiting.splice(0).forEach((f) => f());
    },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(BestAnswersIndicator));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  _resetBestJobForTests();
});

const chip = () => container.querySelector<HTMLButtonElement>('[data-best3-indicator]');

function start(send: SendChat, req = REQ) {
  const r = startBestJob(req, send, planCalls(req.providerIds).length);
  if (!r.ok) throw new Error(`始まらなかった: ${r.reason}`);
  return r;
}

describe('上部バーの印 (ベスト3)', () => {
  it('仕事が無ければ何も出さない', () => {
    expect(getBestJob()).toBeNull();
    expect(chip()).toBeNull();
  });

  it('★ 走っている間は進み具合を名乗り、答えが届くたびに進む', async () => {
    const h = held();
    start(h.send);
    const c = await waitForElement(chip, '走っている間の印');
    expect(c.getAttribute('data-best3-indicator')).toBe('running');
    expect(c.textContent).toBe(`🏆 0/${MAX_BEST_ANSWER_CALLS}`);
    h.releaseOne();
    await settleUntil(() => chip()?.textContent === `🏆 1/${MAX_BEST_ANSWER_CALLS}`, '1 件目が届いた印');
  });

  it('★ 終わったら「完了」を名乗り、押すと AI アシスタントへ移る', async () => {
    const h = held();
    const r = start(h.send);
    h.drain();
    await act(async () => {
      await r.finished;
    });
    await settleUntil(() => chip()?.getAttribute('data-best3-indicator') === 'done', '完了の印');
    expect(chip()!.textContent).toBe('🏆 ベスト3 完了');

    const went: string[] = [];
    const off = onNavigate((id) => went.push(id));
    try {
      await act(async () => chip()!.click());
    } finally {
      off();
    }
    expect(went).toEqual(['assistant']);
  });

  it('★ 結果を渡し終えたら消える (1 度だけ知らせる)', async () => {
    const h = held();
    const r = start(h.send);
    h.drain();
    await act(async () => {
      await r.finished;
    });
    await waitForElement(chip, '完了の印');
    await act(async () => markBestJobDelivered(r.id));
    await settleUntil(() => chip() === null, '渡し終えた後に印が消える');
  });

  it('★ 取り消したら消える (取り消した仕事を「完了」と言わない)', async () => {
    const h = held();
    start(h.send);
    await waitForElement(chip, '走っている間の印');
    await act(async () => {
      expect(cancelBestJob()).toBe(true);
    });
    await settleUntil(() => chip() === null, '取り消した後に印が消える');
  });

  /**
   * **エンジンが投げても、仕事は「走っている」のまま残らない。** 残ると印が永久に回り、
   * しかも仕事場は「作成中です」と言って**以後のベスト3 を全部断る**。
   *
   * エンジンは送り手の失敗を候補ごとに畳むので、投げるのはそれより前の段である。
   * ここでは検索語の読みで投げさせる (秘密に見える綴りを載せ、伏字を通ることも見る)。
   */
  it('★ エンジンが投げたら「失敗」を名乗り、仕事場は次の仕事を受け付ける', async () => {
    const secret = `sk-ant-api03-${'A'.repeat(40)}`;
    const broken = {
      ...REQ,
      get ragQuery(): string {
        throw new Error(`検索に失敗 ${secret}`);
      },
    };
    const r = start(held().send, broken);
    await act(async () => {
      await r.finished;
    });
    await settleUntil(() => chip()?.getAttribute('data-best3-indicator') === 'failed', '失敗の印');
    expect(chip()!.textContent).toBe('🏆 ベスト3 失敗');
    const job = getBestJob()!;
    expect(job.status).toBe('failed');
    expect(job.error).toContain('検索に失敗');
    expect(job.error, '失敗の文面に秘密の綴りが素で残っている').not.toContain(secret);
    // 標本: 針は伏せる前の文面には当たる (当たらなければ上の not は空の検査)。
    expect(`検索に失敗 ${secret}`).toContain(secret);
    // 仕事場は詰まっていない —— 次の仕事を始められる。
    expect(startBestJob(REQ, held().send, MAX_BEST_ANSWER_CALLS).ok).toBe(true);
  });
});
