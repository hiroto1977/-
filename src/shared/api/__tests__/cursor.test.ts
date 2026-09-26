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
  readRows,
  cursorIntakeNote,
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

describe('readRows — 相手の形が変わっても落ちない', () => {
  it('配列そのものと、キーで包まれた配列の両方を読む', () => {
    expect(readRows<number>([1, 2], 'x')).toEqual({ rows: [1, 2], read: true });
    expect(readRows<number>({ x: [3] }, 'x')).toEqual({ rows: [3], read: true });
  });

  it('★ 空の配列は「答え」なので read: true (0 件と読めなかったを分ける · パス 263)', () => {
    expect(readRows<number>([], 'x')).toEqual({ rows: [], read: true });
    expect(readRows<number>({ x: [] }, 'x')).toEqual({ rows: [], read: true });
  });

  it('★ 読めない形は空配列 + read: false (画面を真っ白にしないが、0 とは言わない)', () => {
    for (const body of [null, undefined, {}, { x: 'not-an-array' }, 42, 'nope', true] as unknown[]) {
      expect(readRows(body, 'x'), JSON.stringify(body) ?? 'undefined').toEqual({
        rows: [],
        read: false,
      });
    }
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
    expect(
      normalizeMembers({ teamMembers: [{ name: 'A', email: 'a@example.com', role: 'owner' }, {}] }),
    ).toEqual({
      state: 'read',
      rows: [
        { name: 'A', email: 'a@example.com', role: 'owner' },
        { name: '', email: '', role: '' },
      ],
    });
  });

  it("★ 形が読めなければ空 + state: 'unreadable' (0 名と言わない · パス 263)", () => {
    expect(normalizeMembers(null)).toEqual({ rows: [], state: 'unreadable' });
    expect(normalizeMembers({ other: [] })).toEqual({ rows: [], state: 'unreadable' });
  });

  it("★ 対照: 相手が空の配列を答えたら state: 'read' (0 名は答えである)", () => {
    expect(normalizeMembers({ teamMembers: [] })).toEqual({ rows: [], state: 'read' });
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
      }).rows,
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
    const { rows } = normalizeUsage({ data: [{ isActive: undefined }, { isActive: 'yes' }, { isActive: true }] });
    expect(rows.map((r) => r.active)).toEqual([false, false, true]);
  });

  /*
   * **期待を 0 から null へ書き換えた** (2026-09-15 · パス 266)。
   *
   * 以前の期待は `linesAdded: 0, linesAccepted: 0, requests: 0` だった。
   * 落ちないことは正しく留めていたが、「**0 と言うこと**」まで仕様として
   * 固定していた —— このモジュールの冒頭の規則は逆で、欠けている数値は
   * 0 ではなく「取れなかった」として扱う。画面は「追加 — 行」と刷る。
   */
  it('欠けている数値は null、率は null、上回りは印を付ける', () => {
    const [empty, over] = normalizeUsage({
      data: [{}, { totalLinesAdded: 10, acceptedLinesAdded: 12 }],
    }).rows;
    expect(empty).toMatchObject({ linesAdded: null, linesAccepted: null, acceptRate: null, overCounted: false, requests: null, model: '', date: '' });
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
    ).toEqual({
      state: 'read',
      amountsUnreadable: 0,
      rows: [
        { name: 'A', email: 'a@example.com', role: 'owner', spendUsd: 41.2, fastPremiumRequests: 412, hardLimitUsd: null },
        // `fastPremiumRequests` が無い行は **null** (0 回と区別する · パス 266)。
        { name: '', email: '', role: '', spendUsd: 18.75, fastPremiumRequests: null, hardLimitUsd: 50 },
      ],
    });
  });

  it('上限 0 ドルも設定として扱う (null に潰さない)', () => {
    expect(
      normalizeSpend({ teamMemberSpend: [{ hardLimitOverrideDollars: 0 }] }).rows[0]!.hardLimitUsd,
    ).toBe(0);
  });
});

/** 「読めた」節を組む helper (パス 263 で引数が `{rows, state}` になった)。 */
function read<T>(rows: T[]): { rows: T[]; state: 'read' } {
  return { rows, state: 'read' };
}
function readSpend<T>(rows: T[]): { rows: T[]; state: 'read'; amountsUnreadable: number } {
  return { rows, state: 'read', amountsUnreadable: 0 };
}

describe('buildCursorSnapshot — 合計', () => {
  it('人数・稼働日数・支出合計', () => {
    const totals = buildCursorSnapshot(
      read([
        { name: 'A', email: 'a@example.com', role: 'owner' },
        { name: 'B', email: 'b@example.com', role: 'member' },
      ]),
      read([
        { date: '2026-08-04', active: true, linesAdded: 0, linesAccepted: 0, acceptRate: null, overCounted: false, tabsShown: 0, tabsAccepted: 0, requests: 0, model: '' },
        { date: '2026-08-05', active: false, linesAdded: 0, linesAccepted: 0, acceptRate: null, overCounted: false, tabsShown: 0, tabsAccepted: 0, requests: 0, model: '' },
      ]),
      readSpend([
        { name: 'A', email: 'a@example.com', role: 'owner', spendUsd: 41.2, fastPremiumRequests: 0, hardLimitUsd: null },
        { name: 'B', email: 'b@example.com', role: 'member', spendUsd: 18.75, fastPremiumRequests: 0, hardLimitUsd: null },
      ]),
    ).totals;
    expect(totals).toEqual({ members: 2, activeDays: 1, spendUsd: 59.95 });
  });

  it('支出はセントで足してから戻す (小数の誤差を持ち込まない)', () => {
    const rows = Array.from({ length: 3 }, () => ({
      name: '', email: '', role: '', spendUsd: 0.1, fastPremiumRequests: 0, hardLimitUsd: null,
    }));
    expect(buildCursorSnapshot(read([]), read([]), readSpend(rows)).totals.spendUsd).toBe(0.3);
  });

  it('読めたうえで空なら 0 を返す (0 件は答えである)', () => {
    expect(buildCursorSnapshot(read([]), read([]), readSpend([])).totals).toEqual({
      members: 0, activeDays: 0, spendUsd: 0,
    });
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
describe('readNum —— 欠けた数値欄は null にする (0 と混ぜない)', () => {
  /*
   * **`readNum` はモジュール本体の `const` なので、読み直さないと測れない。**
   * 静的 import では変異が効く前に矢印関数が作られてしまい、
   * `() => undefined` へ変えても気付けない (実測 2026-08-31: 生存)。
   */
  const fresh = async (): Promise<typeof import('../cursor')> => {
    vi.resetModules();
    return import('../cursor');
  };

  it('★ 欄が欠けていたら null になり、加算は NaN にならない', async () => {
    const { normalizeUsage } = await fresh();
    const [row] = normalizeUsage({ data: [{ date: 0, isActive: true }] }).rows;
    expect(row?.linesAdded).toBeNull();
    expect(row?.linesAccepted).toBeNull();
    expect(row?.tabsShown).toBeNull();
    expect(row?.tabsAccepted).toBeNull();
    expect(row?.requests).toBeNull();
    // NaN を出さないことは変わらず留める (0 倒しをやめた理由は NaN ではない)。
    expect(Number.isNaN(row?.requests)).toBe(false);
  });

  it('★ 数でない値・NaN・Infinity も null にする', async () => {
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
    }).rows;
    expect(row?.linesAdded).toBeNull();
    expect(row?.linesAccepted).toBeNull();
    expect(row?.tabsShown).toBeNull();
    /*
     * **合計は 3 ではなく null** (パス 266)。以前は `composerRequests: null` を
     * 0 に倒して `chatRequests: 3` だけを足し、画面は「リクエスト 3」を
     * **その日の総数として**刷っていた —— 4 つのうち 1 つだけを数えた値である。
     * 足りない合計は合計ではない (パス 54 / 226 / 263 と同じ規準)。
     */
    expect(row?.requests).toBeNull();
  });

  it('★ 対照: 4 項目すべて読めれば合計になる (何でも null にしているのではない)', async () => {
    const { normalizeUsage } = await fresh();
    const [row] = normalizeUsage({
      data: [
        {
          date: 0,
          totalLinesAdded: 100,
          acceptedLinesAdded: 40,
          totalTabsShown: 7,
          totalTabsAccepted: 3,
          composerRequests: 1,
          chatRequests: 2,
          agentRequests: 4,
          cmdkUsages: 8,
        },
      ],
    }).rows;
    expect(row?.requests).toBe(15);
    expect(row?.linesAdded).toBe(100);
    expect(row?.acceptRate).toBe(40);
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

describe('cursorIntakeNote — 読めなかった物を述べる 1 文 (パス 263)', () => {
  const ok = { members: 'read', usage: 'read', spend: 'read', spendAmountsUnreadable: 0 } as const;

  it('★ 全部読めていれば null (何も足さない)', () => {
    expect(cursorIntakeNote(ok)).toBeNull();
  });

  it('★ 読めなかった節を名指しし、「0 ではない」と述べる', () => {
    const note = cursorIntakeNote({ ...ok, members: 'unreadable' });
    expect(note).not.toBeNull();
    expect(note).toContain('メンバー');
    expect(note).toContain('0 ではなく');
    // 読めた節は名指ししない (対照)。
    expect(note).not.toContain('今月の支出');
  });

  it('★ 複数なら並べる', () => {
    const note = cursorIntakeNote({ ...ok, usage: 'unreadable', spend: 'unreadable' });
    expect(note).toContain('日次の利用状況・今月の支出');
    expect(note).not.toContain('メンバー・');
  });

  it('★ 金額の読めない行数も述べ、合計を出せないと言う', () => {
    const note = cursorIntakeNote({ ...ok, spendAmountsUnreadable: 3 });
    expect(note).toContain('支出 3 行');
    expect(note).toContain('合計は出せません');
  });

  it('★ 節が読めない + 金額も読めない は両方述べる', () => {
    const note = cursorIntakeNote({ ...ok, members: 'unreadable', spendAmountsUnreadable: 1 });
    expect(note).toContain('メンバー');
    expect(note).toContain('支出 1 行');
  });

  it('標本: 文面は「件数が 0」とは言わない (言えないことを言わないための文)', () => {
    for (const bad of [
      { ...ok, members: 'unreadable' } as const,
      { ...ok, spendAmountsUnreadable: 2 } as const,
    ]) {
      const note = cursorIntakeNote(bad)!;
      expect(note, note).not.toMatch(/0 (名|日|件)(?!ではなく)/);
    }
    // 対照: この正規表現は実際に「0 名」に当たる (綴り違いで黙る検査にしない)。
    expect('Cursor · 0 名 / 稼働 0 日').toMatch(/0 (名|日|件)(?!ではなく)/);
  });
});
