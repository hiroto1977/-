import { describe, expect, it, vi } from 'vitest';
import {
  MAX_USAGE_DAYS,
  acceptRateOf,
  fetchCursorSnapshot,
  isOverCounted,
  toIsoDate,
  usageWindow,
} from '../cursor';

const MEMBERS = {
  teamMembers: [
    { name: 'Alex', email: 'alex@example.com', role: 'owner' },
    { name: 'Sam', email: 'sam@example.com', role: 'member' },
  ],
};
const USAGE = {
  data: [
    {
      date: 1_754_265_600_000, // 2025-08-04T00:00:00Z
      isActive: true,
      totalLinesAdded: 200,
      acceptedLinesAdded: 50,
      totalTabsShown: 30,
      totalTabsAccepted: 12,
      composerRequests: 1,
      chatRequests: 2,
      agentRequests: 3,
      cmdkUsages: 4,
      mostUsedModel: 'claude-4.5-sonnet',
    },
    { date: 1_754_352_000_000, isActive: false },
  ],
};
const SPEND = {
  teamMemberSpend: [
    { name: 'Alex', email: 'alex@example.com', role: 'owner', spendCents: 4120, fastPremiumRequests: 412, hardLimitOverrideDollars: 50 },
    { name: 'Sam', email: 'sam@example.com', role: 'member', spendCents: 1875, fastPremiumRequests: 187 },
  ],
};

// 本物の `Response` は必ず `text()` を持つ。モックが持っていないと、
// 応答サイズの上限判定 (jsonFetch → readBodyWithCap) が通れない。
const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) ?? '' }) as Response;

/** 3 本の呼び出しを URL で振り分けるスタブ。呼ばれた順序に依存しない。 */
function stub(bodies: { members?: unknown; usage?: unknown; spend?: unknown } = {}) {
  // ?? ではなく in で判定する。null を渡した場合に既定へ落ちてしまい、
  // 「null が返ってきたら」のテストが実際には既定値を検査してしまうため。
  return vi.fn<typeof fetch>(async (url) => {
    const u = String(url);
    if (u.endsWith('/teams/members')) return ok('members' in bodies ? bodies.members : MEMBERS);
    if (u.endsWith('/teams/daily-usage-data')) return ok('usage' in bodies ? bodies.usage : USAGE);
    if (u.endsWith('/teams/spend')) return ok('spend' in bodies ? bodies.spend : SPEND);
    throw new Error(`unexpected url: ${u}`);
  });
}

describe('日付とレート', () => {
  it('epoch ミリ秒を UTC の YYYY-MM-DD にする', () => {
    expect(toIsoDate(1_754_265_600_000)).toBe('2025-08-04');
    expect(toIsoDate(0)).toBe('1970-01-01');
    expect(toIsoDate(-86_400_000)).toBe('1969-12-31');
  });

  it('読めない日付は空文字にする（それらしい日付を作らない）', () => {
    expect(toIsoDate(undefined)).toBe('');
    expect(toIsoDate(NaN)).toBe('');
    expect(toIsoDate(Infinity)).toBe('');
  });

  it('受入率は小数第1位まで', () => {
    expect(acceptRateOf(50, 200)).toBe(25);
    expect(acceptRateOf(1, 3)).toBe(33.3);
    expect(acceptRateOf(2, 3)).toBe(66.7);
  });

  it('分母が 0 なら null（0% とは違う）', () => {
    expect(acceptRateOf(0, 0)).toBeNull();
    expect(acceptRateOf(5, 0)).toBeNull();
    expect(acceptRateOf(0, -1)).toBeNull();
    expect(acceptRateOf(0, 1)).toBe(0);
  });

  it('Cursor 側の集計が噛み合わないと 100% を超えることがある', () => {
    expect(acceptRateOf(300, 200)).toBe(150);
  });

  it('上回りは率ではなく行数そのもので判定する', () => {
    expect(isOverCounted(300, 200)).toBe(true);
    // ちょうど一致は上回りではない
    expect(isOverCounted(200, 200)).toBe(false);
    expect(isOverCounted(199, 200)).toBe(false);
    // 分母が 0 なら率が出ない以上、上回りようがない（採用行があっても false）
    expect(isOverCounted(5, 0)).toBe(false);
    expect(isOverCounted(0, 0)).toBe(false);
    expect(isOverCounted(5, -1)).toBe(false);
  });
});

describe('照会期間', () => {
  it('終了日を含む直近 N 日', () => {
    const now = 1_754_352_000_000;
    expect(usageWindow(now, 1)).toEqual({ startDate: now, endDate: now });
    expect(usageWindow(now, 30)).toEqual({ startDate: now - 29 * 86_400_000, endDate: now });
  });

  it('Cursor の上限 90 日を超えない', () => {
    const now = 1_754_352_000_000;
    expect(MAX_USAGE_DAYS).toBe(90);
    expect(usageWindow(now, 90).startDate).toBe(now - 89 * 86_400_000);
    expect(usageWindow(now, 365)).toEqual(usageWindow(now, 90));
  });

  it('0 日や負の日数は 1 日に丸める', () => {
    const now = 1_754_352_000_000;
    expect(usageWindow(now, 0)).toEqual({ startDate: now, endDate: now });
    expect(usageWindow(now, -5)).toEqual({ startDate: now, endDate: now });
  });
});

describe('スナップショットの取得', () => {
  it('メンバー・利用状況・支出をまとめて返す', async () => {
    const f = stub();
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });

    expect(snap.members).toEqual([
      { name: 'Alex', email: 'alex@example.com', role: 'owner' },
      { name: 'Sam', email: 'sam@example.com', role: 'member' },
    ]);
    expect(snap.usage[0]).toMatchObject({
      date: '2025-08-04',
      active: true,
      linesAdded: 200,
      linesAccepted: 50,
      acceptRate: 25,
      overCounted: false,
      tabsShown: 30,
      tabsAccepted: 12,
      requests: 10, // 1 + 2 + 3 + 4
      model: 'claude-4.5-sonnet',
    });
    expect(snap.spend[0]).toEqual({
      name: 'Alex', email: 'alex@example.com', role: 'owner',
      spendUsd: 41.2, fastPremiumRequests: 412, hardLimitUsd: 50,
    });
    expect(snap.totals).toEqual({ members: 2, activeDays: 1, spendUsd: 59.95 });
  });

  it('Bearer で認証し、日次利用と支出は POST で引く', async () => {
    const f = stub();
    await fetchCursorSnapshot({ token: 'secret-key', fetch: f });
    const calls = f.mock.calls;
    expect(calls).toHaveLength(3);
    // 接続先そのものを固定する。endsWith だけで見ると、ベース URL が空文字に
    // なっても素通りしてしまう（相対 URL で叩きに行く）。
    expect(calls.map(([u]) => String(u))).toEqual([
      'https://api.cursor.com/teams/members',
      'https://api.cursor.com/teams/daily-usage-data',
      'https://api.cursor.com/teams/spend',
    ]);
    for (const [, init] of calls) {
      const h = init?.headers as Record<string, string>;
      expect(h.Authorization).toBe('Bearer secret-key');
      // POST でボディを JSON にするので Content-Type は必須
      expect(h['Content-Type']).toBe('application/json');
    }
    expect(calls[0]![1]?.method).toBeUndefined(); // members は GET
    expect(calls[1]![1]?.method).toBe('POST');
    expect(calls[2]![1]?.method).toBe('POST');
    const body = JSON.parse(String(calls[1]![1]?.body));
    expect(body.endDate - body.startDate).toBe(29 * 86_400_000);
  });

  it('配列を直接返す形でも読める（包み方に依存しない）', async () => {
    const f = stub({ usage: USAGE.data, spend: SPEND.teamMemberSpend });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage).toHaveLength(2);
    expect(snap.spend).toHaveLength(2);
  });

  it('未知の形が返っても落ちない（空として扱う）', async () => {
    const f = stub({ members: {}, usage: { unexpected: 1 }, spend: null });
    // spend に null を返させるのが肝。Array.isArray(null) は false なので、
    // オブジェクト前提でキーを引くと TypeError になる（実際に一度なった）。
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.members).toEqual([]);
    expect(snap.usage).toEqual([]);
    expect(snap.spend).toEqual([]);
    expect(snap.totals).toEqual({ members: 0, activeDays: 0, spendUsd: 0 });
  });

  it('欠けている数値は 0、欠けている文字列は空にする', async () => {
    const f = stub({ usage: { data: [{ date: 1_754_265_600_000, isActive: true }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage[0]).toMatchObject({
      linesAdded: 0, linesAccepted: 0, acceptRate: null, overCounted: false,
      tabsShown: 0, tabsAccepted: 0, requests: 0, model: '',
    });
  });

  it('メンバーの欄が欠けていても空文字で埋める（"undefined" と出さない）', async () => {
    const f = stub({ members: { teamMembers: [{}, { name: 'Only' }, { email: 'only@example.com' }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.members).toEqual([
      { name: '', email: '', role: '' },
      { name: 'Only', email: '', role: '' },
      { name: '', email: 'only@example.com', role: '' },
    ]);
  });

  it('支出の欄が欠けていても空文字と 0 で埋める', async () => {
    const f = stub({ spend: { teamMemberSpend: [{}] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.spend).toEqual([
      { name: '', email: '', role: '', spendUsd: 0, fastPremiumRequests: 0, hardLimitUsd: null },
    ]);
  });

  /*
   * **この検査は 2026-08-22 に期待ごと変わった。**
   *
   * 以前は「本文が undefined でも空配列を返す」ことを確かめていたが、
   * それが通っていたのは**モックの `json()` が undefined を返していた**
   * からで、本物の `Response` は本文が空だと `.json()` が
   * `SyntaxError: Unexpected end of JSON input` で reject する
   * (実測済み)。つまり production には一度も無い挙動を仕様として
   * 固定していた —— 検査がコードではなくモックを見ていた形である。
   *
   * いまは `jsonFetch` が本文を読んでから `JSON.parse` するので、
   * 同じ状況で**サービス名つきの読める失敗**になる。生の SyntaxError が
   * 上まで飛んでいた頃より扱いやすい。
   *
   * なお本文の**中の項目**が欠けている場合 (`{}` が返る等) に空配列へ
   * 倒すことは、下の「欠けている数値は 0 …」以降の検査が見ている。
   */
  it('本文が空なら、サービス名つきの読める失敗になる', async () => {
    const f = stub({ members: undefined, usage: undefined, spend: undefined });
    await expect(fetchCursorSnapshot({ token: 'key', fetch: f })).rejects.toThrow(
      /応答が JSON ではありません/,
    );
  });

  it('本文が空オブジェクトなら空配列に倒れる (項目の欠けは許す)', async () => {
    const f = stub({ members: {}, usage: {}, spend: {} });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage).toEqual([]);
    expect(snap.spend).toEqual([]);
    expect(snap.members).toEqual([]);
  });

  it('数値や文字列が返ってきても空として扱う（オブジェクト以外）', async () => {
    const f = stub({ usage: 42, spend: 'nope' });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage).toEqual([]);
    expect(snap.spend).toEqual([]);
  });

  it('受入行が総追加行を上回ったら印を付ける（率は隠さない）', async () => {
    const f = stub({ usage: { data: [{ date: 1, isActive: true, totalLinesAdded: 100, acceptedLinesAdded: 300 }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage[0]!.acceptRate).toBe(300);
    expect(snap.usage[0]!.overCounted).toBe(true);
  });

  it('支出はセントから米ドルへ（円に換算しない）', async () => {
    const f = stub({ spend: { teamMemberSpend: [{ spendCents: 1 }, { spendCents: 99 }, { spendCents: 100 }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.spend.map((r) => r.spendUsd)).toEqual([0.01, 0.99, 1]);
    expect(snap.totals.spendUsd).toBe(2);
  });

  it('上限の個別設定が無ければ null', async () => {
    const f = stub({ spend: { teamMemberSpend: [{ spendCents: 0 }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.spend[0]!.hardLimitUsd).toBeNull();
  });

  it('HTTP エラーはサービス名つきで投げる', async () => {
    const f = vi.fn<typeof fetch>(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }) as Response);
    await expect(fetchCursorSnapshot({ token: 'bad', fetch: f })).rejects.toThrow(/cursor 401/);
  });
});
