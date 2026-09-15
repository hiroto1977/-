/** @vitest-environment jsdom */
/**
 * **画面が「0」と「分からない」を書き分ける。** (2026-09-14 · パス 263)
 *
 * `rowsOf` は読めない応答を `[]` に畳むだけだった。実測すると、**5 つの違う
 * 状況が byte 単位で同じ画面**になっていた:
 *
 *   `{teamMembers: []}`   相手が「0 名」と答えた
 *   `null` / `{}` / `{teamMembers:'x'}` / `42`   読めない
 *
 * どれも見出しに `Cursor · 0 名 / 稼働 0 日 / $0.00` を**緑のライブ表示で**刷り、
 * 節は「メンバーを取得できていません。」と出す。**両方向に嘘になる** ——
 * 本当に 0 名のチームには「取得できていません」と言い、読めなかったときは
 * 0 名・$0.00 を事実として刷る。
 *
 * ここは**画面の文字**で留める。判定 (`readRows` / `buildCursorSnapshot` /
 * `cursorIntakeNote`) は `shared/api/__tests__/cursor.test.ts` が持つが、
 * **画面がそれを読んでいるか**は別の事実である (パス 119 / 122 で「shared に
 * 規則は在るのに画面へ届いていない」を 2 度踏んでいる)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { settleUntil } from './jsdomWait';
import { CursorPage } from '../pages/CursorPage';
import type { CursorSnapshot } from '../../shared/api/cursor';

/** 相手が「0 件」と答えた応答 (3 つとも読めた)。 */
const ANSWERED_EMPTY: CursorSnapshot = {
  members: [], usage: [], spend: [],
  totals: { members: 0, activeDays: 0, spendUsd: 0 },
  intake: { members: 'read', usage: 'read', spend: 'read', spendAmountsUnreadable: 0 },
};

/** 読めなかった応答 (件数は 0 ではなく「分からない」)。 */
const UNREADABLE: CursorSnapshot = {
  members: [], usage: [], spend: [],
  totals: { members: null, activeDays: null, spendUsd: null },
  intake: {
    members: 'unreadable', usage: 'unreadable', spend: 'unreadable', spendAmountsUnreadable: 0,
  },
};

let snapshot: CursorSnapshot = ANSWERED_EMPTY;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve(['cursor']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: snapshot }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  host.remove();
});

/** 画面を描いて、出た文字をぜんぶ返す。 */
async function render(snap: CursorSnapshot): Promise<string> {
  snapshot = snap;
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(CursorPage));
  });
  // **固定回数の settle は待っていない、当てているだけ** —— jsdomWait.ts の
  // docblock が 2 度の実測つきでそう書いている (パス 169)。実際、この検査を
  // 固定 8 周で書いた直後の全件実行で 1 本落ちた (単独では 3/3 通る)。
  await settleUntil(() => (host.textContent ?? '').length > 0, 'Cursor の節が描かれた');
  return host.textContent ?? '';
}

describe('Cursor の画面 — 読めなかった節', () => {
  it('★ 相手が「0 件」と答えたら 0 を刷り、注記は出さない', async () => {
    const text = await render(ANSWERED_EMPTY);
    expect(text).toContain('0 名');
    expect(text).toContain('$0.00');
    expect(text).toContain('Admin API が 0 名と答えました');
    // 読めなかったときの文面は出さない (対照)。
    expect(text).not.toContain('応答を読めませんでした');
  });

  it('★ 読めなかったら数字を「—」にし、何が読めなかったかを言う', async () => {
    const text = await render(UNREADABLE);
    expect(text).toContain('— 名');
    expect(text).toContain('稼働 — 日');
    expect(text).toContain('0 ではなく');
    expect(text).toContain('メンバー・日次の利用状況・今月の支出');
    // **0 を事実として刷らない。**
    expect(text).not.toContain('0 名');
    expect(text).not.toContain('$0.00');
    // 「0 件と答えました」も出さない (答えていないので)。
    expect(text).not.toContain('と答えました');
  });

  it('★ 1 つだけ読めないなら、読めた節は数字を出す', async () => {
    const text = await render({
      members: [{ name: 'A', email: 'a@example.invalid', role: 'owner' }],
      usage: [],
      spend: [],
      totals: { members: 1, activeDays: 0, spendUsd: null },
      intake: {
        members: 'read', usage: 'read', spend: 'unreadable', spendAmountsUnreadable: 0,
      },
    });
    expect(text).toContain('1 名');
    expect(text).toContain('稼働 0 日');
    expect(text).toContain('今月の支出の応答を読めませんでした');
    // 読めた節は名指ししない。
    expect(text).not.toContain('メンバー・');
  });

  it('★ 金額の読めない行は $0.00 と並べず、理由を行に書く', async () => {
    const text = await render({
      members: [], usage: [],
      spend: [
        { name: 'A', email: 'a@example.invalid', role: 'owner', spendUsd: 41.2, fastPremiumRequests: 0, hardLimitUsd: null },
        { name: 'B', email: 'b@example.invalid', role: 'member', spendUsd: null, fastPremiumRequests: 0, hardLimitUsd: null },
      ],
      totals: { members: 0, activeDays: 0, spendUsd: null },
      intake: { members: 'read', usage: 'read', spend: 'read', spendAmountsUnreadable: 1 },
    });
    expect(text).toContain('$41.20');
    expect(text).toContain('金額を読めませんでした');
    expect(text).toContain('支出 1 行');
    expect(text).toContain('合計は出せません');
    expect(text).not.toContain('$0.00');
  });

  /*
   * **日次利用の 5 欄** (2026-09-15 · パス 266)。パス 263 は封筒と支出の金額を
   * 直したが、行の中の数値は `num()` で 0 に倒したままだった。だから
   * `acceptedLinesAdded` が欠けた日に画面は「採用 0 行」と刷り、
   * `acceptRateOf(0, 5000)` が 0 を返して**バッジが「0%」**になる ——
   * 「提案の 0% しか採用しなかった」は測った結果に見えるが、鍵が無いだけである。
   */
  it('★ 行の中の読めない数値を 0 として刷らず、率も作らない', async () => {
    const text = await render({
      members: [], spend: [],
      usage: [
        {
          date: '2026-09-01', active: true,
          // 総追加行は読めたが、採用行・Tab・リクエストは読めなかった日。
          linesAdded: 5000, linesAccepted: null, acceptRate: null, overCounted: false,
          tabsShown: null, tabsAccepted: null, requests: null, model: 'example-model',
        },
      ],
      totals: { members: 0, activeDays: 1, spendUsd: 0 },
      intake: { members: 'read', usage: 'read', spend: 'read', spendAmountsUnreadable: 0 },
    });
    // 読めた欄はそのまま出る (何でも「—」にしているのではない)。
    expect(text).toContain('追加 5,000 行');
    expect(text).toContain('採用 — 行');
    expect(text).toContain('Tab —/—');
    expect(text).toContain('リクエスト —');
    // **「0%」を刷らない。** これが「提案の 0% しか採用しなかった」に見える文面。
    expect(text).not.toContain('0%');
    expect(text).not.toContain('採用 0 行');
  });

  it('★ 対照: 4 項目すべて読めた日は合計と率を刷る', async () => {
    const text = await render({
      members: [], spend: [],
      usage: [
        {
          date: '2026-09-02', active: true,
          linesAdded: 1000, linesAccepted: 400, acceptRate: 40, overCounted: false,
          tabsShown: 7, tabsAccepted: 3, requests: 15, model: '',
        },
      ],
      totals: { members: 0, activeDays: 1, spendUsd: 0 },
      intake: { members: 'read', usage: 'read', spend: 'read', spendAmountsUnreadable: 0 },
    });
    expect(text).toContain('追加 1,000 行 / 採用 400 行');
    expect(text).toContain('Tab 3/7');
    expect(text).toContain('リクエスト 15');
    expect(text).toContain('40%');
  });
});
