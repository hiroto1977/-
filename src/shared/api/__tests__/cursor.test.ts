/**
 * Cursor 共有クライアントの検査。
 *
 * ここは main (デスクトップ) と renderer (ブラウザ) の**両方**が呼ぶ。
 * 片方の経路でしか通らない検査だと、もう片方が壊れても気付けないので、
 * 通信手段を差し替えられる形そのものを固定する。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CURSOR_API_BASE,
  MAX_USAGE_DAYS,
  DEFAULT_USAGE_DAYS,
  toIsoDate,
  acceptRateOf,
  isOverCounted,
  rowsOf,
  usageWindow,
  normalizeMembers,
  normalizeUsage,
  normalizeSpend,
  buildCursorSnapshot,
  cursorHeaders,
  fetchCursorSnapshotWith,
} from '../cursor';

describe('定数', () => {
  it('基底 URL と上限日数', () => {
    expect(CURSOR_API_BASE).toBe('https://api.cursor.com');
    expect(MAX_USAGE_DAYS).toBe(90);
    expect(DEFAULT_USAGE_DAYS).toBe(30);
  });
});

describe('toIsoDate', () => {
  it('epoch ミリ秒を UTC の日付にする', () => {
    expect(toIsoDate(Date.UTC(2026, 7, 4))).toBe('2026-08-04');
  });

  it('読めない値は空文字 (日付欄を詐称しない)', () => {
    expect(toIsoDate(undefined)).toBe('');
    expect(toIsoDate(Number.NaN)).toBe('');
    expect(toIsoDate(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('acceptRateOf', () => {
  it('小数第 1 位まで', () => {
    expect(acceptRateOf(812, 1240)).toBe(65.5);
    expect(acceptRateOf(1, 3)).toBe(33.3);
  });

  it('分母 0 は null (0% ではない)', () => {
    expect(acceptRateOf(0, 0)).toBeNull();
    expect(acceptRateOf(5, 0)).toBeNull();
    expect(acceptRateOf(0, -1)).toBeNull();
  });

  it('全部受け入れなら 100', () => {
    expect(acceptRateOf(10, 10)).toBe(100);
  });
});

describe('isOverCounted', () => {
  it('採用行が総追加行を上回ったときだけ true', () => {
    expect(isOverCounted(11, 10)).toBe(true);
    expect(isOverCounted(10, 10)).toBe(false);
    expect(isOverCounted(9, 10)).toBe(false);
  });

  it('分母 0 では上回りと言わない', () => {
    expect(isOverCounted(5, 0)).toBe(false);
    expect(isOverCounted(0, 0)).toBe(false);
  });
});

describe('rowsOf — 相手の形が変わっても落ちない', () => {
  it('配列そのものと、キーで包まれた配列の両方を読む', () => {
    expect(rowsOf<number>([1, 2], 'x')).toEqual([1, 2]);
    expect(rowsOf<number>({ x: [3] }, 'x')).toEqual([3]);
  });

  it('読めない形は空配列 (画面を真っ白にしない)', () => {
    expect(rowsOf(null, 'x')).toEqual([]);
    expect(rowsOf(undefined, 'x')).toEqual([]);
    expect(rowsOf({}, 'x')).toEqual([]);
    expect(rowsOf({ x: 'not-an-array' }, 'x')).toEqual([]);
    expect(rowsOf(42, 'x')).toEqual([]);
  });
});

describe('usageWindow — 照会期間', () => {
  const DAY = 86_400_000;
  const NOW = Date.UTC(2026, 7, 19);

  it('終了日を含む直近 N 日', () => {
    expect(usageWindow(NOW, 30)).toEqual({ startDate: NOW - 29 * DAY, endDate: NOW });
    expect(usageWindow(NOW, 1)).toEqual({ startDate: NOW, endDate: NOW });
  });

  it('Cursor 側の上限 90 日で頭打ちにする', () => {
    expect(usageWindow(NOW, 90)).toEqual({ startDate: NOW - 89 * DAY, endDate: NOW });
    expect(usageWindow(NOW, 365)).toEqual({ startDate: NOW - 89 * DAY, endDate: NOW });
  });

  it('0 以下は 1 日として扱う', () => {
    expect(usageWindow(NOW, 0)).toEqual({ startDate: NOW, endDate: NOW });
    expect(usageWindow(NOW, -5)).toEqual({ startDate: NOW, endDate: NOW });
  });
});

describe('normalizeMembers', () => {
  it('欠けている項目は空文字で埋める', () => {
    expect(normalizeMembers({ teamMembers: [{ name: 'A', email: 'a@example.com', role: 'owner' }, {}] })).toEqual([
      { name: 'A', email: 'a@example.com', role: 'owner' },
      { name: '', email: '', role: '' },
    ]);
  });

  it('形が読めなければ空', () => {
    expect(normalizeMembers(null)).toEqual([]);
    expect(normalizeMembers({ other: [] })).toEqual([]);
  });
});

describe('normalizeUsage', () => {
  it('行数から率と上回りを出し、要求数は 4 種を足す', () => {
    expect(
      normalizeUsage({
        data: [
          {
            date: Date.UTC(2026, 7, 4),
            isActive: true,
            totalLinesAdded: 1240,
            acceptedLinesAdded: 812,
            totalTabsShown: 430,
            totalTabsAccepted: 190,
            composerRequests: 10,
            chatRequests: 20,
            agentRequests: 30,
            cmdkUsages: 2,
            mostUsedModel: 'claude-4.5-sonnet',
          },
        ],
      }),
    ).toEqual([
      {
        date: '2026-08-04',
        active: true,
        linesAdded: 1240,
        linesAccepted: 812,
        acceptRate: 65.5,
        overCounted: false,
        tabsShown: 430,
        tabsAccepted: 190,
        requests: 62,
        model: 'claude-4.5-sonnet',
      },
    ]);
  });

  it('稼働は true のときだけ true (欠測を稼働あつかいしない)', () => {
    const rows = normalizeUsage({ data: [{ isActive: undefined }, { isActive: 'yes' }, { isActive: true }] });
    expect(rows.map((r) => r.active)).toEqual([false, false, true]);
  });

  it('欠けている数値は 0、率は null、上回りは印を付ける', () => {
    const [empty, over] = normalizeUsage({
      data: [{}, { totalLinesAdded: 10, acceptedLinesAdded: 12 }],
    });
    expect(empty).toMatchObject({ linesAdded: 0, linesAccepted: 0, acceptRate: null, overCounted: false, requests: 0, model: '', date: '' });
    expect(over).toMatchObject({ acceptRate: 120, overCounted: true });
  });
});

describe('normalizeSpend', () => {
  it('セントをドルに直し、上限の個別設定が無ければ null', () => {
    expect(
      normalizeSpend({
        teamMemberSpend: [
          { name: 'A', email: 'a@example.com', role: 'owner', spendCents: 4120, fastPremiumRequests: 412 },
          { spendCents: 1875, hardLimitOverrideDollars: 50 },
        ],
      }),
    ).toEqual([
      { name: 'A', email: 'a@example.com', role: 'owner', spendUsd: 41.2, fastPremiumRequests: 412, hardLimitUsd: null },
      { name: '', email: '', role: '', spendUsd: 18.75, fastPremiumRequests: 0, hardLimitUsd: 50 },
    ]);
  });

  it('上限 0 ドルも設定として扱う (null に潰さない)', () => {
    expect(normalizeSpend({ teamMemberSpend: [{ hardLimitOverrideDollars: 0 }] })[0]!.hardLimitUsd).toBe(0);
  });
});

describe('buildCursorSnapshot — 合計', () => {
  it('人数・稼働日数・支出合計', () => {
    const totals = buildCursorSnapshot(
      [
        { name: 'A', email: 'a@example.com', role: 'owner' },
        { name: 'B', email: 'b@example.com', role: 'member' },
      ],
      [
        { date: '2026-08-04', active: true, linesAdded: 0, linesAccepted: 0, acceptRate: null, overCounted: false, tabsShown: 0, tabsAccepted: 0, requests: 0, model: '' },
        { date: '2026-08-05', active: false, linesAdded: 0, linesAccepted: 0, acceptRate: null, overCounted: false, tabsShown: 0, tabsAccepted: 0, requests: 0, model: '' },
      ],
      [
        { name: 'A', email: 'a@example.com', role: 'owner', spendUsd: 41.2, fastPremiumRequests: 0, hardLimitUsd: null },
        { name: 'B', email: 'b@example.com', role: 'member', spendUsd: 18.75, fastPremiumRequests: 0, hardLimitUsd: null },
      ],
    ).totals;
    expect(totals).toEqual({ members: 2, activeDays: 1, spendUsd: 59.95 });
  });

  it('支出はセントで足してから戻す (小数の誤差を持ち込まない)', () => {
    const rows = Array.from({ length: 3 }, () => ({
      name: '', email: '', role: '', spendUsd: 0.1, fastPremiumRequests: 0, hardLimitUsd: null,
    }));
    expect(buildCursorSnapshot([], [], rows).totals.spendUsd).toBe(0.3);
  });

  it('空でも 0 を返す', () => {
    expect(buildCursorSnapshot([], [], []).totals).toEqual({ members: 0, activeDays: 0, spendUsd: 0 });
  });
});

describe('cursorHeaders', () => {
  it('Bearer とコンテンツ型', () => {
    expect(cursorHeaders('key-123')).toEqual({
      Authorization: 'Bearer key-123',
      'Content-Type': 'application/json',
    });
  });
});

describe('fetchCursorSnapshotWith — 通信手段を差し替えられる', () => {
  const NOW = Date.UTC(2026, 7, 19);

  function stubFetch() {
    return vi.fn(async (url: string, _init: RequestInit): Promise<unknown> => {
      if (url.endsWith('/teams/members')) return { teamMembers: [{ name: 'A', email: 'a@example.com', role: 'owner' }] };
      if (url.endsWith('/teams/daily-usage-data')) return { data: [{ date: NOW, isActive: true }] };
      if (url.endsWith('/teams/spend')) return { teamMemberSpend: [{ spendCents: 1000 }] };
      throw new Error(`unexpected url: ${url}`);
    });
  }

  it('3 つの照会を正しい URL・メソッド・ヘッダで行う', async () => {
    const f = stubFetch();
    await fetchCursorSnapshotWith(f, 'key-123', NOW, 30);

    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://api.cursor.com/teams/members',
      'https://api.cursor.com/teams/daily-usage-data',
      'https://api.cursor.com/teams/spend',
    ]);
    // members は GET (method 未指定)、残り 2 つは POST
    expect(f.mock.calls.map((c) => (c[1] as RequestInit).method)).toEqual([undefined, 'POST', 'POST']);
    for (const call of f.mock.calls) {
      expect((call[1] as RequestInit).headers).toEqual({
        Authorization: 'Bearer key-123',
        'Content-Type': 'application/json',
      });
    }
  });

  it('照会期間を本文に載せる', async () => {
    const f = stubFetch();
    await fetchCursorSnapshotWith(f, 'k', NOW, 7);
    const body = JSON.parse(String((f.mock.calls[1]![1] as RequestInit).body)) as unknown;
    expect(body).toEqual({ startDate: NOW - 6 * 86_400_000, endDate: NOW });
    // spend は本文なし (空オブジェクト)
    expect(JSON.parse(String((f.mock.calls[2]![1] as RequestInit).body))).toEqual({});
  });

  it('既定の照会日数は 30 日', async () => {
    const f = stubFetch();
    await fetchCursorSnapshotWith(f, 'k', NOW);
    const body = JSON.parse(String((f.mock.calls[1]![1] as RequestInit).body)) as { startDate: number };
    expect(body.startDate).toBe(NOW - 29 * 86_400_000);
  });

  it('3 つの応答を 1 つの形にまとめる', async () => {
    const snap = await fetchCursorSnapshotWith(stubFetch(), 'k', NOW, 30);
    expect(snap.members).toHaveLength(1);
    expect(snap.usage).toHaveLength(1);
    expect(snap.spend).toHaveLength(1);
    expect(snap.totals).toEqual({ members: 1, activeDays: 1, spendUsd: 10 });
  });

  it('通信の失敗はそのまま投げる (握り潰して空を返さない)', async () => {
    const boom = vi.fn(async () => {
      throw new Error('HTTP 401');
    });
    await expect(fetchCursorSnapshotWith(boom, 'k', NOW, 30)).rejects.toThrow('HTTP 401');
  });
});

/*
 * **欠けた数値欄を 0 にする `num` が測られていなかった** (実測 2026-08-31)。
 *
 * `() => undefined` へ変えても、上の検査群は「在る値」しか渡していないので
 * 気付かない。欠けている・数でない・NaN の 3 種を通す —— `undefined` が
 * 混ざると `requests` の加算が NaN になり、画面には「NaN」が出る。
 */
describe('num —— 欠けた数値欄は 0 にする', () => {
  /*
   * **`num` はモジュール本体の `const` なので、読み直さないと測れない。**
   * 静的 import では変異が効く前に矢印関数が作られてしまい、
   * `() => undefined` へ変えても気付けない (実測 2026-08-31: 生存)。
   */
  const fresh = async (): Promise<typeof import('../cursor')> => {
    vi.resetModules();
    return import('../cursor');
  };

  it('★ 欄が欠けていても 0 になり、加算が NaN にならない', async () => {
    const { normalizeUsage } = await fresh();
    const [row] = normalizeUsage({ data: [{ date: 0, isActive: true }] });
    expect(row?.linesAdded).toBe(0);
    expect(row?.linesAccepted).toBe(0);
    expect(row?.tabsShown).toBe(0);
    expect(row?.tabsAccepted).toBe(0);
    expect(row?.requests).toBe(0);
    expect(Number.isNaN(row?.requests)).toBe(false);
  });

  it('★ 数でない値・NaN・Infinity も 0 に倒す', async () => {
    const { normalizeUsage } = await fresh();
    const [row] = normalizeUsage({
      data: [
        {
          date: 0,
          totalLinesAdded: '100',
          acceptedLinesAdded: Number.NaN,
          totalTabsShown: Number.POSITIVE_INFINITY,
          composerRequests: null,
          chatRequests: 3,
        },
      ],
    });
    expect(row?.linesAdded).toBe(0);
    expect(row?.linesAccepted).toBe(0);
    expect(row?.tabsShown).toBe(0);
    // 有効な数はそのまま通る (何でも 0 にしているのではない — 対照)。
    expect(row?.requests).toBe(3);
  });
});

/*
 * 送り先の定数は**読み直して**問う —— 静的 import では変異が効く前に
 * 評価が済む (実測 2026-08-31: 生存)。空文字になれば相対 URL になり、
 * ブラウザ版では**自分のオリジンへトークンを送る**ことになる。
 */
describe('送り先 —— 読み直して問う', () => {
  it('★ 送り先は https://api.cursor.com で、要求もそこへ出る', async () => {
    vi.resetModules();
    const m = await import('../cursor');
    expect(m.CURSOR_API_BASE).toBe('https://api.cursor.com');
    const seen: string[] = [];
    await m.fetchCursorSnapshotWith(
      async (url: string) => {
        seen.push(url);
        return {};
      },
      'tok',
      Date.UTC(2026, 0, 10),
      7,
    );
    expect(seen.length).toBeGreaterThan(0);
    for (const u of seen) expect(u.startsWith('https://api.cursor.com/')).toBe(true);
  });
});
