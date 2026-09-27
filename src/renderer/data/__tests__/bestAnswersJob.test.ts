/**
 * **ベストアンサー 3 のバックグラウンドの仕事場** —— 画面を離れても走り続け、
 * 戻った画面が 1 度だけ結果を受け取ることを振る舞いで見る。
 *
 * 待ちは**固定回数で取らない** —— `startBestJob` が返す `finished` (仕事場を書き終えたら
 * 解ける) を待つ (法則 wait-for-condition-not-ticks)。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetBestJobForTests,
  cancelBestJob,
  getBestJob,
  markBestJobDelivered,
  startBestJob,
  subscribeBestJob,
} from '../bestAnswersJob';
import { ANSWER_STRATEGIES, MAX_BEST_ANSWER_CALLS, type SendChat } from '../bestAnswers';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../../shared/redact';

const REQ = {
  question: '就業規則の作成を頼みたい',
  ragQuery: '就業規則の作成を頼みたい',
  turns: [{ role: 'user' as const, content: '就業規則の作成を頼みたい' }],
  catalog: [],
  providerIds: [],
};

/** 観点ごとに違う回答をすぐ返す送り手。 */
const echo: SendChat = (req) => {
  const s = ANSWER_STRATEGIES.find((x) => req.system.includes(`「${x.label}」を担当`))!;
  return Promise.resolve({ ok: true, text: `${s.label}の回答 ${s.id.repeat(30)}\n- 要点` });
};

/** 手で解く送り手 (取り消しの後に届く結果を作るため)。 */
function held(): { send: SendChat; release: () => void; calls: () => number } {
  const waiting: (() => void)[] = [];
  let calls = 0;
  const send: SendChat = (req) => {
    calls += 1;
    return new Promise((resolve) => {
      waiting.push(() => resolve({ ok: true, text: `遅れて届いた回答 ${req.provider}` }));
    });
  };
  return { send, release: () => waiting.splice(0).forEach((f) => f()), calls: () => calls };
}

function started(r: ReturnType<typeof startBestJob>) {
  if (!r.ok) throw new Error(`始まらなかった: ${r.reason}`);
  return r;
}

afterEach(() => _resetBestJobForTests());

describe('バックグラウンドの仕事場', () => {
  it('★ 画面の購読を全部外しても走り続け、結果を持って待つ (= バックグラウンド)', async () => {
    const unsub = subscribeBestJob(() => {});
    const r = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    unsub(); // 画面を離れた
    await r.finished;
    const job = getBestJob()!;
    expect(job.status).toBe('done');
    expect(job.result?.best.ranked).toHaveLength(3);
    expect(job.delivered, '誰も受け取っていないのに届けたことになっている').toBe(false);
  });

  it('★ 届けたら 2 度渡さない (delivered)', async () => {
    const r = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    await r.finished;
    expect(markBestJobDelivered(r.id), '1 度目は渡す権利を取れる').toBe(true);
    expect(getBestJob()!.delivered).toBe(true);
    // **2 度目は取れない** —— StrictMode の 2 度目の effect がここに来る (描いた時点の
    // `delivered` は古いので、渡すかどうかは戻り値で決める)。
    expect(markBestJobDelivered(r.id), '2 度目も渡す権利を取れた (2 度渡る)').toBe(false);
    // 別の id を渡しても今の仕事の印は動かない。
    expect(markBestJobDelivered(r.id + 1)).toBe(false);
    expect(getBestJob()!.id).toBe(r.id);
  });

  it('★ 走っている間に 2 つ目は断り、「取り消す」を名指す', () => {
    const h = held();
    started(startBestJob(REQ, h.send, MAX_BEST_ANSWER_CALLS));
    const second = startBestJob(REQ, h.send, MAX_BEST_ANSWER_CALLS);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toContain('「取り消す」');
  });

  it('★ 取り消すと cancelled になり、あとから届いた結果を採らない', async () => {
    const h = held();
    const r = started(startBestJob(REQ, h.send, MAX_BEST_ANSWER_CALLS));
    expect(h.calls(), '最初の送信が始まっていない').toBeGreaterThan(0);
    expect(cancelBestJob()).toBe(true);
    const callsAtCancel = h.calls();
    h.release();
    await r.finished;
    const job = getBestJob()!;
    expect(job.status).toBe('cancelled');
    expect(job.result).toBeNull();
    expect(h.calls(), '取り消した後に新しい送信を始めた').toBe(callsAtCancel);
    expect(cancelBestJob(), '終わった仕事は取り消せない').toBe(false);
  });

  it('★ 終わった後なら次の仕事を始められる (1 つずつ)', async () => {
    const a = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    await a.finished;
    const b = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    expect(b.id).toBeGreaterThan(a.id);
    await b.finished;
    expect(getBestJob()!.id).toBe(b.id);
  });

  it('★ 進み具合が変わるたびに購読者へ知らせる', async () => {
    let n = 0;
    subscribeBestJob(() => {
      n += 1;
    });
    const r = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    await r.finished;
    // 開始 1 + lens ごとの進み + 回答者ごとの進み + 完了 1 —— 少なくとも回答者の数より多い。
    expect(n).toBeGreaterThan(MAX_BEST_ANSWER_CALLS);
  });
});

/**
 * **値と境目を留める** (2026-09-26 · パス 482)。上の検査は「働くか」を見る。こちらは
 * 変異検査の生存を読み直して足した —— 最初の姿・断りの文面・購読の解除・取り消せない時・
 * 遅れて届いた報せ (取り消した仕事の / 片付けた後の / 失敗の) を値ごとに見る。
 */
describe('仕事場の値と境目', () => {
  it('★ 始めた瞬間の姿: 走っている・lens は全部待ち・0 件・結果も失敗も無い・未配達', async () => {
    const snaps: (ReturnType<typeof getBestJob>)[] = [];
    subscribeBestJob(() => snaps.push(getBestJob()));
    const r = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    expect(snaps[0]).toEqual({
      id: r.id,
      question: REQ.question,
      status: 'running',
      progress: {
        lenses: {
          ontology: 'waiting',
          context: 'waiting',
          skill: 'waiting',
          prompt: 'waiting',
          subagent: 'waiting',
          harness: 'waiting',
          conductor: 'waiting',
        },
        answered: 0,
        total: MAX_BEST_ANSWER_CALLS,
      },
      result: null,
      error: null,
      delivered: false,
    });
    await r.finished;
  });

  it('★ 2 つ目の断りは文面ごと (入力欄の上の「取り消す」を名指す)', () => {
    const h = held();
    started(startBestJob(REQ, h.send, MAX_BEST_ANSWER_CALLS));
    expect(startBestJob(REQ, h.send, MAX_BEST_ANSWER_CALLS)).toEqual({
      ok: false,
      reason: 'ベスト3 を作成中です。終わるのを待つか、入力欄の上の「取り消す」を押してから質問してください。',
    });
  });

  it('★ 購読を外した後は知らせない', async () => {
    let n = 0;
    const unsub = subscribeBestJob(() => {
      n += 1;
    });
    unsub();
    const r = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    await r.finished;
    expect(n).toBe(0);
  });

  it('★ 仕事が無い・終わった仕事は取り消せない (状態も変えない)', async () => {
    expect(cancelBestJob()).toBe(false);
    expect(getBestJob()).toBeNull();
    const r = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    await r.finished;
    expect(cancelBestJob()).toBe(false);
    expect(getBestJob()!.status).toBe('done');
  });

  it('★ 配達の印: 仕事が無ければ取れない・違う id では取れず印も立たない', async () => {
    expect(markBestJobDelivered(1)).toBe(false);
    const r = started(startBestJob(REQ, echo, MAX_BEST_ANSWER_CALLS));
    await r.finished;
    expect(markBestJobDelivered(r.id + 1)).toBe(false);
    expect(getBestJob()!.delivered).toBe(false);
    expect(markBestJobDelivered(r.id)).toBe(true);
  });

  it('★ 取り消した仕事の遅れた報せ (進み具合・結果) は、次の仕事に触れない', async () => {
    const hA = held();
    const a = started(startBestJob({ ...REQ, question: 'A の質問' }, hA.send, MAX_BEST_ANSWER_CALLS));
    expect(cancelBestJob()).toBe(true);
    const hB = held();
    const b = started(startBestJob({ ...REQ, question: 'B の質問' }, hB.send, MAX_BEST_ANSWER_CALLS));
    const before = getBestJob();
    expect(before?.id).toBe(b.id);
    hA.release(); // A の送信が今ごろ返る → A の進み具合と結果が届く
    await a.finished;
    expect(getBestJob(), 'A の遅れた報せが B を書き換えた').toBe(before);
    expect(cancelBestJob()).toBe(true);
    hB.release();
    await b.finished;
  });

  it('★ 片付けた後に届いた報せは何もしない (投げない)', async () => {
    const h = held();
    const r = started(startBestJob(REQ, h.send, MAX_BEST_ANSWER_CALLS));
    _resetBestJobForTests();
    h.release();
    await expect(r.finished).resolves.toBeUndefined();
    expect(getBestJob()).toBeNull();
  });

  it('★ 失敗は理由を伏字に通して残す (例外なら message・例外でない値なら文字列)', async () => {
    const key = 'sk-ant-api03-' + 'A'.repeat(40);
    const boom = { normalize: () => { throw new Error(`boom ${key}`); } } as unknown as string;
    const a = started(startBestJob({ ...REQ, ragQuery: boom }, echo, MAX_BEST_ANSWER_CALLS));
    await a.finished;
    expect(getBestJob()).toMatchObject({ status: 'failed', result: null, error: redactForMessage(`boom ${key}`, ERROR_MESSAGE_MAX_CHARS) });
    expect(getBestJob()!.error).not.toContain(key);
    // 標本: 伏字を通さなければ鍵が残る (針が当たる)。
    expect(`boom ${key}`).toContain(key);

    const raw = { normalize: () => { throw '生の理由'; } } as unknown as string;
    const b = started(startBestJob({ ...REQ, ragQuery: raw }, echo, MAX_BEST_ANSWER_CALLS));
    await b.finished;
    expect(getBestJob()).toMatchObject({ id: b.id, status: 'failed', error: '生の理由' });
  });

  it('★ 取り消した後に届いた失敗は採らない (取り消しのまま)', async () => {
    const raw = { normalize: () => { throw '生の理由'; } } as unknown as string;
    const r = started(startBestJob({ ...REQ, ragQuery: raw }, echo, MAX_BEST_ANSWER_CALLS));
    expect(cancelBestJob()).toBe(true); // 失敗の報せは次のマイクロタスクで届く
    await r.finished;
    expect(getBestJob()).toMatchObject({ status: 'cancelled', error: null });
  });
});
