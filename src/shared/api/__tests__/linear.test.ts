/**
 * Linear 共有クライアントの検査 (2026-11-18)。
 *
 * ここは main (デスクトップ) と renderer (ブラウザ) の**両方**が呼ぶ。通信手段を差し替えられる形
 * そのものを固定し、応答の正規化は値ごと留める (読めない物を「無い」と混ぜない)。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  LINEAR_API_BASE,
  LINEAR_DUE_UNREADABLE,
  LINEAR_GRAPHQL_PATH,
  LINEAR_ISSUE_LIMIT,
  LINEAR_ISSUES_QUERY,
  LINEAR_NO_DUE,
  LINEAR_PERSONAL_KEY_PREFIX,
  LINEAR_PRIORITY_LABELS,
  LINEAR_PRIORITY_UNREADABLE,
  LINEAR_TITLE_MISSING,
  fetchLinearSnapshotWith,
  linearAuthorization,
  linearDue,
  linearDueText,
  linearIntakeNote,
  linearIssueMeta,
  linearIssueTitle,
  linearPriority,
  linearPriorityText,
  linearRequestInit,
  linearScopeNote,
  normalizeLinearResponse,
  type LinearIssue,
} from '../linear';
import { rereadModule } from '../../__tests__/rereadModule';

const URL = 'https://api.linear.app/graphql';
const QUERY =
  'query { viewer { name assignedIssues(first: 20, filter: { state: { type: { nin: ["completed", "canceled"] } } })'
  + ' { nodes { identifier title priority dueDate state { name } team { name } } pageInfo { hasNextPage } } } }';

/** 応答の標本。`nodes` と `hasNextPage` を差し替えられる。 */
const body = (nodes: unknown, hasNextPage: unknown = false, name: unknown = '山田'): unknown => ({
  data: { viewer: { name, assignedIssues: { nodes, pageInfo: { hasNextPage } } } },
});

const NODE = {
  identifier: 'ENG-12',
  title: '見積もりの画面を直す',
  priority: 2,
  dueDate: '2026-11-20',
  state: { name: '進行中' },
  team: { name: '開発' },
};

const ISSUE: LinearIssue = {
  identifier: 'ENG-12',
  title: '見積もりの画面を直す',
  priority: 2,
  dueDate: '2026-11-20',
  dueRead: true,
  stateName: '進行中',
  teamName: '開発',
};

describe('定数', () => {
  it('送り先は api.linear.app の /graphql だけ', () => {
    expect(LINEAR_API_BASE).toBe('https://api.linear.app');
    expect(LINEAR_GRAPHQL_PATH).toBe('/graphql');
    expect(LINEAR_ISSUE_LIMIT).toBe(20);
  });

  it('★ 送る照会は固定の 1 つ (値ごと留める)', () => {
    expect(LINEAR_ISSUES_QUERY).toBe(QUERY);
  });

  it('★ 照会は読むだけ —— mutation を書かず、メールアドレスも本文も求めない', () => {
    expect(LINEAR_ISSUES_QUERY.startsWith('query ')).toBe(true);
    for (const word of ['mutation', 'email', 'description', 'comments', 'url']) {
      expect(LINEAR_ISSUES_QUERY.includes(word), word).toBe(false);
    }
    // 針が的に当たる標本 (不在の主張には標本を添える)。
    expect('mutation { issueCreate(input: {}) { success } }'.includes('mutation')).toBe(true);
    expect('query { viewer { email } }'.includes('email')).toBe(true);
  });

  it('★ 直下の値を読み直しても同じ (文・URL を値ごと留める)', async () => {
    const m = await rereadModule<typeof import('../linear')>(import.meta.url, '../linear');
    expect(m.LINEAR_API_BASE).toBe('https://api.linear.app');
    expect(m.LINEAR_GRAPHQL_PATH).toBe('/graphql');
    expect(m.LINEAR_ISSUE_LIMIT).toBe(20);
    expect(m.LINEAR_ISSUES_QUERY).toBe(QUERY);
    expect(m.LINEAR_TITLE_MISSING).toBe('(題名なし)');
    expect(m.LINEAR_NO_DUE).toBe('期限なし');
    expect(m.LINEAR_DUE_UNREADABLE).toBe('期限が読めません');
    expect(m.LINEAR_PRIORITY_UNREADABLE).toBe('優先度が読めません');
    expect(m.LINEAR_PRIORITY_LABELS).toEqual({ 0: '優先度なし', 1: '緊急', 2: '高', 3: '中', 4: '低' });
    expect(m.LINEAR_PERSONAL_KEY_PREFIX).toBe('lin_api_');
  });
});

describe('linearPriority', () => {
  it('0〜4 の整数をそのまま返す', () => {
    for (const p of [0, 1, 2, 3, 4]) expect(linearPriority(p)).toBe(p);
  });

  it('★ それ以外は null (0 = 優先度なし と混ぜない)', () => {
    for (const v of [-1, 5, 1.5, NaN, Infinity, '2', null, undefined, true, {}, [1]]) {
      expect(linearPriority(v), String(v)).toBeNull();
    }
  });
});

describe('linearDue', () => {
  it('暦に在る日付はそのまま', () => {
    expect(linearDue('2026-11-20')).toEqual({ dueDate: '2026-11-20', dueRead: true });
  });

  it('★ null と欄なしは「期限なし」(読めた)', () => {
    expect(linearDue(null)).toEqual({ dueDate: null, dueRead: true });
    expect(linearDue(undefined)).toEqual({ dueDate: null, dueRead: true });
  });

  it('★ 日付として読めない値は「読めなかった」(期限なしと混ぜない)', () => {
    for (const v of ['2026-02-31', '2026/11/20', '', 'tomorrow', 20261120, {}, ['2026-11-20'], true]) {
      expect(linearDue(v), JSON.stringify(v)).toEqual({ dueDate: null, dueRead: false });
    }
  });
});

describe('normalizeLinearResponse', () => {
  it('利用者の名前と課題を行へ', () => {
    expect(normalizeLinearResponse(body([NODE]))).toEqual({
      userName: '山田',
      issues: [ISSUE],
      viewerRead: true,
      issuesRead: true,
      more: false,
      refused: false,
    });
  });

  it('★ 壊れた欄は理由を持つ値へ (行は落とさない)・物でない要素は飛ばす', () => {
    const snap = normalizeLinearResponse(
      body([
        { identifier: 42, title: { x: 1 }, priority: '2', dueDate: '2026-02-31', state: 'x', team: null },
        null,
        'x',
        [NODE],
        {},
      ]),
    );
    const broken: LinearIssue = {
      identifier: '', title: '', priority: null, dueDate: null, dueRead: false, stateName: '', teamName: '',
    };
    expect(snap.issues).toEqual([broken, { ...broken, dueRead: true }]);
    expect(snap.issuesRead).toBe(true);
  });

  it('★ 0 件 (空の配列) は「読めた」', () => {
    const snap = normalizeLinearResponse(body([]));
    expect(snap.issues).toEqual([]);
    expect(snap.issuesRead).toBe(true);
    expect(snap.viewerRead).toBe(true);
  });

  it('★ nodes が配列でなければ「読めなかった」(0 件と混ぜない)', () => {
    for (const nodes of [null, undefined, 'x', 3, { length: 1 }]) {
      const snap = normalizeLinearResponse(body(nodes));
      expect(snap.issues, JSON.stringify(nodes)).toEqual([]);
      expect(snap.issuesRead, JSON.stringify(nodes)).toBe(false);
      expect(snap.viewerRead).toBe(true);
    }
  });

  it('★ assignedIssues が無い・物でないときも「読めなかった」', () => {
    for (const assigned of [undefined, null, 'x', [], 3]) {
      const snap = normalizeLinearResponse({ data: { viewer: { name: '山田', assignedIssues: assigned } } });
      expect(snap.issuesRead, JSON.stringify(assigned)).toBe(false);
      expect(snap.more).toBe(false);
      expect(snap.userName).toBe('山田');
    }
  });

  it('★ viewer が無い・物でないときは利用者も課題も「読めなかった」', () => {
    for (const b of [{}, { data: null }, { data: {} }, { data: { viewer: null } }, { data: { viewer: 'x' } }, { data: { viewer: [] } }, { data: [] }, null, 'x', 3]) {
      const snap = normalizeLinearResponse(b);
      expect(snap, JSON.stringify(b)).toEqual({
        userName: '', issues: [], viewerRead: false, issuesRead: false, more: false, refused: false,
      });
    }
  });

  it('★ 次の頁は true のときだけ「ほかにも在る」', () => {
    expect(normalizeLinearResponse(body([NODE], true)).more).toBe(true);
    for (const v of [false, 'true', 1, null, undefined, {}]) {
      expect(normalizeLinearResponse(body([NODE], v)).more, JSON.stringify(v)).toBe(false);
    }
    // pageInfo そのものが物でなくても投げない。
    expect(normalizeLinearResponse({ data: { viewer: { assignedIssues: { nodes: [], pageInfo: null } } } }).more).toBe(false);
    expect(normalizeLinearResponse({ data: { viewer: { assignedIssues: { nodes: [], pageInfo: 'x' } } } }).more).toBe(false);
  });

  it('★ errors が 1 件でも在れば「断られた」・空の配列や配列でない値は断りではない', () => {
    expect(normalizeLinearResponse({ errors: [{ message: 'Authentication required' }] }).refused).toBe(true);
    expect(normalizeLinearResponse({ ...(body([NODE]) as object), errors: [{}] }).refused).toBe(true);
    for (const errors of [[], null, undefined, 'x', { length: 1 }]) {
      expect(normalizeLinearResponse({ ...(body([NODE]) as object), errors }).refused, JSON.stringify(errors)).toBe(false);
    }
  });

  it('★ 名前が文字列でなければ空文字・長い名前と題名は天井で切る', () => {
    expect(normalizeLinearResponse(body([], false, 42)).userName).toBe('');
    const big = 'x'.repeat(5000);
    const snap = normalizeLinearResponse(
      body([{ identifier: big, title: big, priority: 1, dueDate: null, state: { name: big }, team: { name: big } }], false, big),
    );
    const cut = `${'x'.repeat(256)}…`;
    expect(snap.userName).toBe(cut);
    expect(snap.issues[0]).toEqual({
      identifier: cut, title: cut, priority: 1, dueDate: null, dueRead: true, stateName: cut, teamName: cut,
    });
  });
});

describe('画面の文', () => {
  it('題名: 番号つき・題名が空なら理由を述べる・番号が空なら題名だけ', () => {
    expect(linearIssueTitle({ identifier: 'ENG-12', title: '直す' })).toBe('ENG-12 直す');
    expect(linearIssueTitle({ identifier: 'ENG-12', title: '' })).toBe(`ENG-12 ${LINEAR_TITLE_MISSING}`);
    expect(linearIssueTitle({ identifier: '', title: '直す' })).toBe('直す');
    expect(linearIssueTitle({ identifier: '', title: '' })).toBe('(題名なし)');
  });

  it('★ 優先度: 5 つの呼び名と「読めません」を言い分ける', () => {
    expect([0, 1, 2, 3, 4].map((p) => linearPriorityText(linearPriority(p)))).toEqual(['優先度なし', '緊急', '高', '中', '低']);
    expect(linearPriorityText(null)).toBe('優先度が読めません');
    expect(LINEAR_PRIORITY_LABELS[0]).toBe('優先度なし');
    expect(LINEAR_PRIORITY_UNREADABLE).toBe('優先度が読めません');
  });

  it('★ 期限: 日付・期限なし・読めない の 3 つを言い分ける', () => {
    expect(linearDueText({ dueDate: '2026-11-20', dueRead: true })).toBe('期限 2026-11-20');
    expect(linearDueText({ dueDate: null, dueRead: true })).toBe(LINEAR_NO_DUE);
    expect(linearDueText({ dueDate: null, dueRead: false })).toBe(LINEAR_DUE_UNREADABLE);
    // 読めなかった側が先に決まる (dueDate が何であれ)。
    expect(linearDueText({ dueDate: '2026-11-20', dueRead: false })).toBe('期限が読めません');
  });

  it('★ 補足の行: 状態 · チーム · 優先度 · 期限 を「 · 」でつなぎ、読めなかった名前は並べない', () => {
    expect(linearIssueMeta(ISSUE)).toBe('進行中 · 開発 · 優先度: 高 · 期限 2026-11-20');
    expect(linearIssueMeta({ ...ISSUE, stateName: '' })).toBe('開発 · 優先度: 高 · 期限 2026-11-20');
    expect(linearIssueMeta({ ...ISSUE, teamName: '' })).toBe('進行中 · 優先度: 高 · 期限 2026-11-20');
    expect(linearIssueMeta({ ...ISSUE, stateName: '', teamName: '', priority: null, dueDate: null, dueRead: false })).toBe(
      '優先度: 優先度が読めません · 期限が読めません',
    );
  });

  it('★ 読めなかった物は上流から 1 つだけ名指しする (断り → 利用者 → 課題)', () => {
    expect(linearIntakeNote({ refused: false, viewerRead: true, issuesRead: true })).toBeNull();
    expect(linearIntakeNote({ refused: true, viewerRead: true, issuesRead: true })).toBe(
      'Linear が照会を断りました。鍵の有効期限と権限を確かめてください。',
    );
    expect(linearIntakeNote({ refused: true, viewerRead: false, issuesRead: false })).toBe(
      'Linear が照会を断りました。鍵の有効期限と権限を確かめてください。',
    );
    expect(linearIntakeNote({ refused: false, viewerRead: false, issuesRead: false })).toBe(
      'Linear の応答から利用者の情報を読み取れませんでした。',
    );
    expect(linearIntakeNote({ refused: false, viewerRead: false, issuesRead: true })).toBe(
      'Linear の応答から利用者の情報を読み取れませんでした。',
    );
    expect(linearIntakeNote({ refused: false, viewerRead: true, issuesRead: false })).toBe(
      'Linear の応答から課題の一覧を読み取れませんでした (0 件という意味ではありません)。',
    );
  });

  it('★ 範囲の断り: ほかにも在るときだけ、上限を名乗って述べる', () => {
    expect(linearScopeNote({ more: false })).toBeNull();
    expect(linearScopeNote({ more: true })).toBe('未完了の課題はほかにもあります (先頭 20 件までを表示しています)。');
  });
});

describe('fetchLinearSnapshotWith', () => {
  it('★ 個人の API キーはそのまま、それ以外は Bearer を付ける', () => {
    expect(LINEAR_PERSONAL_KEY_PREFIX).toBe('lin_api_');
    expect(linearAuthorization('lin_api_example')).toBe('lin_api_example');
    expect(linearAuthorization('lin_oauth_example')).toBe('Bearer lin_oauth_example');
    expect(linearAuthorization('other')).toBe('Bearer other');
    // 接頭辞は先頭に在るときだけ (途中に含むだけの値は Bearer)。
    expect(linearAuthorization('x-lin_api_example')).toBe('Bearer x-lin_api_example');
  });

  it('★ 要求は POST・JSON・本文は固定の照会だけ (鍵も利用者の入力も本文に入らない)', () => {
    expect(linearRequestInit('lin_api_example')).toEqual({
      method: 'POST',
      headers: { Authorization: 'lin_api_example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
    });
    expect(String(linearRequestInit('lin_api_example').body).includes('lin_api_example')).toBe(false);
  });

  it('★ 照会は 1 回だけで、送り先は api.linear.app/graphql', async () => {
    const jsonFetch = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>().mockResolvedValueOnce(body([NODE], true));
    const snap = await fetchLinearSnapshotWith(jsonFetch, 'lin_api_example');
    expect(snap).toEqual({
      userName: '山田', issues: [ISSUE], viewerRead: true, issuesRead: true, more: true, refused: false,
    });
    expect(jsonFetch.mock.calls).toEqual([[URL, linearRequestInit('lin_api_example')]]);
  });

  it('★ 通信手段が投げたら、そのまま上へ出す (見本へ黙って戻らない)', async () => {
    const jsonFetch = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>().mockRejectedValueOnce(new Error('401'));
    await expect(fetchLinearSnapshotWith(jsonFetch, 't')).rejects.toThrow(new Error('401'));
    expect(jsonFetch).toHaveBeenCalledTimes(1);
  });
});
