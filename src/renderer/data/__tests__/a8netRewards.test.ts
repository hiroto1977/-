import { describe, expect, it } from 'vitest';
import {
  A8NET_EMPTY_NOTE,
  A8NET_REWARDS_COLLECTION,
  A8NET_REWARD_STATUSES,
  A8NET_REWARD_STATUS_LABEL,
  MAX_A8NET_PROGRAM_CHARS,
  MAX_A8NET_REWARD_YEN,
  a8netRewardAmountOf,
  isA8netRewardStatus,
  parseA8netReward,
  summarizeA8netRewards,
  unreadableA8netRewardsNote,
  type A8netRewardEntry,
} from '../a8netRewards';
import { hasCollectionShape } from '../collectionShapes';

const GOOD = { month: '2026-11', program: '動画配信サービス 登録', amount: '1200', status: 'pending' } as const;

const row = (over: Partial<Record<keyof A8netRewardEntry, unknown>> = {}): A8netRewardEntry =>
  ({ month: '2026-11', program: 'P', amount: 1000, status: 'confirmed', ...over }) as A8netRewardEntry;

describe('A8.net の成果の記録 —— 定数', () => {
  it('collection 名・状態・ラベル・上限を値ごと留める', () => {
    expect(A8NET_REWARDS_COLLECTION).toBe('a8net-rewards');
    expect([...A8NET_REWARD_STATUSES]).toEqual(['pending', 'confirmed', 'rejected']);
    expect(A8NET_REWARD_STATUS_LABEL).toEqual({ pending: '未確定', confirmed: '確定', rejected: '否認' });
    expect(MAX_A8NET_PROGRAM_CHARS).toBe(60);
    expect(MAX_A8NET_REWARD_YEN).toBe(100_000_000);
  });

  it('記録が無いときの案内は、送らないことと保存先を言う', () => {
    expect(A8NET_EMPTY_NOTE).toBe(
      'A8.net の管理画面で確認した成果を、上の欄から 1 件ずつ記録してください。確定・未確定の合計と月ごとの推移を出します。記録はこの端末の中だけに保存され、A8.net へは何も送りません。',
    );
  });

  it('状態の判定は 3 つだけを受ける (prototype の鍵・非文字列は受けない)', () => {
    for (const s of A8NET_REWARD_STATUSES) expect(isA8netRewardStatus(s)).toBe(true);
    for (const v of ['', '確定', 'CONFIRMED', 'constructor', '__proto__', 0, null, undefined, {}, ['confirmed']]) {
      expect(isA8netRewardStatus(v), JSON.stringify(v)).toBe(false);
    }
  });
});

describe('parseA8netReward —— 画面の入力を 1 件にする', () => {
  it('正しい入力はそのまま 1 件になる (プログラム名は前後の空白を落とす)', () => {
    expect(parseA8netReward({ ...GOOD, program: '  動画配信サービス 登録  ' })).toEqual({
      month: '2026-11',
      program: '動画配信サービス 登録',
      amount: 1200,
      status: 'pending',
    });
  });

  it('報酬額は画面の他の欄と同じ読み方 (全角・桁区切り・¥ を読む)', () => {
    expect(parseA8netReward({ ...GOOD, amount: '1,200' }).amount).toBe(1200);
    expect(parseA8netReward({ ...GOOD, amount: '１２００' }).amount).toBe(1200);
    expect(parseA8netReward({ ...GOOD, amount: '¥3,000' }).amount).toBe(3000);
    expect(parseA8netReward({ ...GOOD, amount: 500 }).amount).toBe(500);
  });

  it('境界: 0 円と上限ちょうどは通る', () => {
    expect(parseA8netReward({ ...GOOD, amount: '0' }).amount).toBe(0);
    expect(parseA8netReward({ ...GOOD, amount: String(MAX_A8NET_REWARD_YEN) }).amount).toBe(MAX_A8NET_REWARD_YEN);
  });

  it('発生月が YYYY-MM でなければ断る', () => {
    const refusal = new Error('発生月は YYYY-MM 形式で入力してください（例: 2026-11）');
    for (const month of ['', '2026-13', '2026-1', '2026-11-01', '2026/11', 202611, null, undefined]) {
      expect(() => parseA8netReward({ ...GOOD, month }), JSON.stringify(month)).toThrow(refusal);
    }
  });

  it('プログラム名が空・空白だけ・文字列でなければ断る', () => {
    const refusal = new Error('プログラム名が未入力です');
    for (const program of ['', '   ', '　', 42, null, undefined, {}]) {
      expect(() => parseA8netReward({ ...GOOD, program }), JSON.stringify(program)).toThrow(refusal);
    }
  });

  it('プログラム名は文字で数えて 60 文字まで (絵文字 60 個は通り、61 個は断る)', () => {
    expect(parseA8netReward({ ...GOOD, program: '😀'.repeat(60) }).program).toBe('😀'.repeat(60));
    expect(parseA8netReward({ ...GOOD, program: 'あ'.repeat(60) }).program).toBe('あ'.repeat(60));
    expect(() => parseA8netReward({ ...GOOD, program: '😀'.repeat(61) })).toThrow(
      new Error('プログラム名は 60 文字以内で入力してください'),
    );
  });

  it('報酬額の空欄は 0 円にせず断る (直す手を言う)', () => {
    const refusal = new Error('報酬額が未入力です（0 円なら 0 と入力してください）');
    for (const amount of ['', '   ', null, undefined]) {
      expect(() => parseA8netReward({ ...GOOD, amount }), JSON.stringify(amount)).toThrow(refusal);
    }
  });

  it('報酬額が読めない・負・小数・上限超えは、範囲を言って断る', () => {
    const refusal = new Error('報酬額は 0 以上 100,000,000 円以下の整数で入力してください');
    for (const amount of ['abc', '1e3', '0x10', '12万', '-1', '1.5', String(MAX_A8NET_REWARD_YEN + 1), Number.NaN, {}]) {
      expect(() => parseA8netReward({ ...GOOD, amount }), JSON.stringify(amount)).toThrow(refusal);
    }
  });

  it('状態が 3 つのどれでもなければ断る', () => {
    const refusal = new Error('状態を選んでください');
    for (const status of ['', '確定', 'done', null, undefined]) {
      expect(() => parseA8netReward({ ...GOOD, status }), JSON.stringify(status)).toThrow(refusal);
    }
  });

  it('断る順序: 発生月 → プログラム名 → 報酬額 → 状態', () => {
    expect(() => parseA8netReward({})).toThrow(new Error('発生月は YYYY-MM 形式で入力してください（例: 2026-11）'));
    expect(() => parseA8netReward({ month: '2026-11' })).toThrow(new Error('プログラム名が未入力です'));
    expect(() => parseA8netReward({ month: '2026-11', program: 'P' })).toThrow(
      new Error('報酬額が未入力です（0 円なら 0 と入力してください）'),
    );
    expect(() => parseA8netReward({ month: '2026-11', program: 'P', amount: '1' })).toThrow(new Error('状態を選んでください'));
  });

  it('書き手が作った行は、復元の形の検査を通る', () => {
    expect(hasCollectionShape(A8NET_REWARDS_COLLECTION, parseA8netReward(GOOD))).toBe(true);
  });
});

describe('a8netRewardAmountOf —— 保管した報酬額の読み', () => {
  it('0 以上の有限の数だけを読む', () => {
    expect(a8netRewardAmountOf(0)).toBe(0);
    expect(a8netRewardAmountOf(1200)).toBe(1200);
    for (const v of [-1, Number.NaN, Number.POSITIVE_INFINITY, '1200', null, undefined, {}, [1], true]) {
      expect(a8netRewardAmountOf(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe('summarizeA8netRewards —— 集計', () => {
  it('記録が無ければ全部 0 で、月の表は空', () => {
    expect(summarizeA8netRewards([])).toEqual({
      totals: { pending: 0, confirmed: 0, rejected: 0 },
      counts: { pending: 0, confirmed: 0, rejected: 0 },
      readable: 0,
      unreadable: 0,
      byMonth: [],
    });
  });

  it('状態ごとに金額と件数を分け、月は新しい順に並べる', () => {
    const s = summarizeA8netRewards([
      row({ month: '2026-09', amount: 1000, status: 'confirmed' }),
      row({ month: '2026-11', amount: 3000, status: 'pending' }),
      row({ month: '2026-10', amount: 500, status: 'rejected' }),
      row({ month: '2026-11', amount: 1200, status: 'confirmed' }),
      row({ month: '2026-11', amount: 300, status: 'confirmed' }),
    ]);
    expect(s).toEqual({
      totals: { pending: 3000, confirmed: 2500, rejected: 500 },
      counts: { pending: 1, confirmed: 3, rejected: 1 },
      readable: 5,
      unreadable: 0,
      byMonth: [
        { month: '2026-11', pending: 3000, confirmed: 1500, rejected: 0 },
        { month: '2026-10', pending: 0, confirmed: 0, rejected: 500 },
        { month: '2026-09', pending: 0, confirmed: 1000, rejected: 0 },
      ],
    });
  });

  it('★ 読めない行は合計・件数・月の表のどれにも入れず、外した件数を返す', () => {
    const good = row({ month: '2026-11', amount: 1000, status: 'confirmed' });
    const bad: A8netRewardEntry[] = [
      row({ month: 'bad' }),
      row({ month: 202611 }),
      row({ amount: '9999999' }),
      row({ amount: -5 }),
      row({ amount: Number.NaN }),
      row({ status: '確定' }),
      row({ status: null }),
    ];
    const s = summarizeA8netRewards([good, ...bad]);
    expect(s).toEqual({
      totals: { pending: 0, confirmed: 1000, rejected: 0 },
      counts: { pending: 0, confirmed: 1, rejected: 0 },
      readable: 1,
      unreadable: 7,
      byMonth: [{ month: '2026-11', pending: 0, confirmed: 1000, rejected: 0 }],
    });
    // 1 件ずつでも外れる (どれか 1 つの条件だけが効いているのではない)。
    for (const b of bad) {
      const one = summarizeA8netRewards([b]);
      expect(one.unreadable, JSON.stringify(b)).toBe(1);
      expect(one.readable).toBe(0);
      expect(one.byMonth).toEqual([]);
    }
  });

  it('対照: 読めない行の形は、復元の形の検査は通る (だから一覧に出ていて × で消せる)', () => {
    expect(hasCollectionShape(A8NET_REWARDS_COLLECTION, row({ month: 'bad' }))).toBe(true);
    expect(hasCollectionShape(A8NET_REWARDS_COLLECTION, row({ status: '確定' }))).toBe(true);
    expect(hasCollectionShape(A8NET_REWARDS_COLLECTION, row({ amount: -5 }))).toBe(true);
  });
});

describe('unreadableA8netRewardsNote —— 合計から外した行の断り', () => {
  it('外した行が無ければ何も言わない', () => {
    expect(unreadableA8netRewardsNote(0)).toBeNull();
    expect(unreadableA8netRewardsNote(Number.NaN)).toBeNull();
  });

  it('件数と、消せる場所 (同じ画面の一覧の ×) を言う', () => {
    expect(unreadableA8netRewardsNote(2)).toBe(
      '発生月・報酬額・状態のいずれかが読めない記録が 2 件あります。合計には入れていません。その行も下の一覧に出ています —— 一覧の × で消して、入れ直してください。',
    );
  });
});
