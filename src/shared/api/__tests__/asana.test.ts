/**
 * Asana 共有クライアントの検査 (2026-11-18)。
 *
 * ここは main (デスクトップ) と renderer (ブラウザ) の**両方**が呼ぶ。通信手段を差し替えられる形
 * そのものを固定し、応答の正規化は値ごと留める (読めない物を「無い」と混ぜない)。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ASANA_API_BASE,
  ASANA_DUE_UNREADABLE,
  ASANA_ME_URL,
  ASANA_NAME_MISSING,
  ASANA_NO_DUE,
  ASANA_TASK_LIMIT,
  asanaDue,
  asanaDueText,
  asanaGid,
  asanaHeaders,
  asanaIntakeNote,
  asanaScopeNote,
  asanaTaskTitle,
  asanaTasksUrl,
  buildAsanaSnapshot,
  fetchAsanaSnapshotWith,
  normalizeAsanaMe,
  normalizeAsanaTasks,
  type AsanaMe,
} from '../asana';
import { rereadModule } from '../../__tests__/rereadModule';

const ME_URL = 'https://app.asana.com/api/1.0/users/me?opt_fields=name,workspaces.name';
const TASKS_URL_42 =
  'https://app.asana.com/api/1.0/tasks?assignee=me&workspace=42&completed_since=now&limit=20&opt_fields=name,due_on';

describe('定数', () => {
  it('送り先は app.asana.com だけ', () => {
    expect(ASANA_API_BASE).toBe('https://app.asana.com/api/1.0');
    expect(ASANA_TASK_LIMIT).toBe(20);
    expect(ASANA_ME_URL).toBe(ME_URL);
  });

  it('★ 直下の値を読み直しても同じ (文・URL を値ごと留める)', async () => {
    const m = await rereadModule<typeof import('../asana')>(import.meta.url, '../asana');
    expect(m.ASANA_API_BASE).toBe('https://app.asana.com/api/1.0');
    expect(m.ASANA_TASK_LIMIT).toBe(20);
    expect(m.ASANA_ME_URL).toBe(ME_URL);
    expect(m.ASANA_NAME_MISSING).toBe('(名前なし)');
    expect(m.ASANA_NO_DUE).toBe('期限なし');
    expect(m.ASANA_DUE_UNREADABLE).toBe('期限が読めません');
    expect(m.asanaTasksUrl('42')).toBe(TASKS_URL_42);
  });
});

describe('asanaGid', () => {
  it('数字だけの文字列をそのまま返す', () => {
    expect(asanaGid('1')).toBe('1');
    expect(asanaGid('1201234567890123')).toBe('1201234567890123');
    expect(asanaGid('9'.repeat(32))).toBe('9'.repeat(32));
  });

  it.each([
    ['空文字', ''],
    ['33 桁 (長すぎる)', '9'.repeat(33)],
    ['前に英字', 'a123'],
    ['後ろに英字', '123a'],
    ['道の区切りを含む', '12/34'],
    ['上の階層へ出る綴り', '../123'],
    ['問い合わせの区切りを含む', '12&assignee=someone'],
    ['改行を挟む (後ろの行だけが数字)', 'abc\n123'],
    ['改行を挟む (前の行だけが数字)', '123\nabc'],
    ['全角の数字', '１２３'],
  ])('★ %s は読まない', (_label, v) => {
    expect(asanaGid(v)).toBe('');
  });

  it.each([
    ['数', 123],
    ['配列 (文字列にすると数字に見える)', ['123']],
    ['null', null],
    ['undefined', undefined],
    ['物', { gid: '1' }],
  ])('★ 文字列でない値 (%s) は読まない', (_label, v) => {
    expect(asanaGid(v)).toBe('');
  });
});

describe('asanaTasksUrl', () => {
  it('ワークスペースの gid を入れた URL を組む', () => {
    expect(asanaTasksUrl('42')).toBe(TASKS_URL_42);
  });

  it('★ gid は符号化して入れる (区切りの字が URL の構造を変えない)', () => {
    expect(asanaTasksUrl('1&x=2')).toBe(
      'https://app.asana.com/api/1.0/tasks?assignee=me&workspace=1%26x%3D2&completed_since=now&limit=20&opt_fields=name,due_on',
    );
  });
});

describe('normalizeAsanaMe', () => {
  it('名前と 1 つ目のワークスペースを読む', () => {
    expect(
      normalizeAsanaMe({
        data: { gid: '7', name: '山田', workspaces: [{ gid: '42', name: '本社' }, { gid: '43', name: '別会社' }] },
      }),
    ).toEqual({ userName: '山田', workspaceGid: '42', workspaceName: '本社', workspaceCount: 2, read: true });
  });

  it('★ gid の読めないワークスペースは数えず、読める 1 つ目を使う', () => {
    expect(
      normalizeAsanaMe({
        data: { name: '山田', workspaces: [{ gid: 'x/y', name: '壊れた行' }, null, 'str', { gid: '43', name: '読める行' }] },
      }),
    ).toEqual({ userName: '山田', workspaceGid: '43', workspaceName: '読める行', workspaceCount: 1, read: true });
  });

  it('★ ワークスペースが 1 つも無ければ gid は空 (利用者の情報は読めた)', () => {
    expect(normalizeAsanaMe({ data: { name: '山田', workspaces: [] } })).toEqual({
      userName: '山田',
      workspaceGid: '',
      workspaceName: '',
      workspaceCount: 0,
      read: true,
    });
    expect(normalizeAsanaMe({ data: { name: '山田' } })).toEqual({
      userName: '山田',
      workspaceGid: '',
      workspaceName: '',
      workspaceCount: 0,
      read: true,
    });
  });

  it.each([
    ['data が無い', {}],
    ['data が null', { data: null }],
    ['data が配列', { data: [{ name: '山田', workspaces: [{ gid: '42' }] }] }],
    ['data が文字列', { data: 'x' }],
    ['本体が null', null],
    ['本体が文字列', 'x'],
  ])('★ %s なら「読めなかった」', (_label, body) => {
    expect(normalizeAsanaMe(body)).toEqual({
      userName: '',
      workspaceGid: '',
      workspaceName: '',
      workspaceCount: 0,
      read: false,
    });
  });

  it('★ 名前が文字列でなければ空文字・長い名前は天井で切る', () => {
    expect(normalizeAsanaMe({ data: { name: 42, workspaces: [{ gid: '42', name: { a: 1 } }] } })).toMatchObject({
      userName: '',
      workspaceName: '',
      workspaceGid: '42',
    });
    const long = normalizeAsanaMe({ data: { name: 'あ'.repeat(5000), workspaces: [{ gid: '42', name: 'い'.repeat(5000) }] } });
    expect(long.userName).toBe(`${'あ'.repeat(256)}…`);
    expect(long.workspaceName).toBe(`${'い'.repeat(256)}…`);
  });
});

describe('asanaDue', () => {
  it('暦に在る日付はそのまま', () => {
    expect(asanaDue('2026-11-20')).toEqual({ dueOn: '2026-11-20', dueRead: true });
  });

  it('★ null と欄なしは「期限なし」(読めた)', () => {
    expect(asanaDue(null)).toEqual({ dueOn: null, dueRead: true });
    expect(asanaDue(undefined)).toEqual({ dueOn: null, dueRead: true });
  });

  it.each([
    ['暦に無い日', '2026-02-31'],
    ['時刻つき', '2026-11-20T10:00:00Z'],
    ['空文字', ''],
    ['数', 20261120],
    ['偽', false],
    ['0', 0],
  ])('★ 日付として読めない値 (%s) は「読めなかった」(期限なしと混ぜない)', (_label, v) => {
    expect(asanaDue(v)).toEqual({ dueOn: null, dueRead: false });
  });
});

describe('normalizeAsanaTasks', () => {
  it('タスクを行へ (名前・期限)', () => {
    expect(
      normalizeAsanaTasks({
        data: [
          { gid: '100', name: '見積もりを送る', due_on: '2026-11-20' },
          { gid: '101', name: '日程調整', due_on: null },
        ],
        next_page: null,
      }),
    ).toEqual({
      tasks: [
        { id: '100', name: '見積もりを送る', dueOn: '2026-11-20', dueRead: true },
        { id: '101', name: '日程調整', dueOn: null, dueRead: true },
      ],
      read: true,
      more: false,
    });
  });

  it('★ 壊れた欄は理由を持つ値へ (行は落とさない)・物でない要素は飛ばす', () => {
    expect(
      normalizeAsanaTasks({ data: [{ gid: 5, name: 7, due_on: 'soon' }, null, 'x', [1], { gid: '102' }] }),
    ).toEqual({
      tasks: [
        { id: '', name: '', dueOn: null, dueRead: false },
        { id: '102', name: '', dueOn: null, dueRead: true },
      ],
      read: true,
      more: false,
    });
  });

  it('★ 0 件 (空の配列) は「読めた」', () => {
    expect(normalizeAsanaTasks({ data: [] })).toEqual({ tasks: [], read: true, more: false });
  });

  it.each([
    ['data が無い', {}],
    ['data が物', { data: { gid: '1' } }],
    ['本体が null', null],
    ['本体が配列', [{ gid: '1' }]],
  ])('★ %s なら「読めなかった」(0 件と混ぜない)', (_label, body) => {
    expect(normalizeAsanaTasks(body)).toEqual({ tasks: [], read: false, more: false });
  });

  it('★ 次の頁を名乗る応答は「ほかにも在る」', () => {
    expect(normalizeAsanaTasks({ data: [], next_page: { offset: 'abc', path: '/tasks?offset=abc' } }).more).toBe(true);
  });

  it.each([
    ['null', null],
    ['文字列', 'next'],
    ['配列', [{ offset: 'abc' }]],
    ['数', 1],
  ])('★ next_page が物でない (%s) なら「ほかに無い」', (_label, v) => {
    expect(normalizeAsanaTasks({ data: [], next_page: v }).more).toBe(false);
  });

  it('★ 長い名前は天井で切る', () => {
    const t = normalizeAsanaTasks({ data: [{ gid: '1', name: 'う'.repeat(5000) }] }).tasks[0];
    expect(t?.name).toBe(`${'う'.repeat(256)}…`);
  });
});

const ME: AsanaMe = { userName: '山田', workspaceGid: '42', workspaceName: '本社', workspaceCount: 1, read: true };

describe('buildAsanaSnapshot', () => {
  it('タスクを照会したときの形', () => {
    expect(
      buildAsanaSnapshot(ME, { tasks: [{ id: '1', name: 'a', dueOn: null, dueRead: true }], read: true, more: true }),
    ).toEqual({
      userName: '山田',
      workspaceName: '本社',
      workspaceCount: 1,
      tasks: [{ id: '1', name: 'a', dueOn: null, dueRead: true }],
      meRead: true,
      tasksAsked: true,
      tasksRead: true,
      more: true,
    });
  });

  it('★ 照会したが読めなかったときは tasksAsked だけが真', () => {
    expect(buildAsanaSnapshot(ME, { tasks: [], read: false, more: false })).toMatchObject({
      tasks: [],
      tasksAsked: true,
      tasksRead: false,
      more: false,
    });
  });

  it('★ 照会しなかったとき (null) は 3 つとも偽', () => {
    expect(buildAsanaSnapshot({ ...ME, read: false }, null)).toEqual({
      userName: '山田',
      workspaceName: '本社',
      workspaceCount: 1,
      tasks: [],
      meRead: false,
      tasksAsked: false,
      tasksRead: false,
      more: false,
    });
  });
});

describe('画面の文', () => {
  it('タスクの名前: 空なら理由を述べる', () => {
    expect(asanaTaskTitle('見積もり')).toBe('見積もり');
    expect(asanaTaskTitle('')).toBe('(名前なし)');
    expect(ASANA_NAME_MISSING).toBe('(名前なし)');
  });

  it('★ 期限: 日付・期限なし・読めない の 3 つを言い分ける', () => {
    expect(asanaDueText({ dueOn: '2026-11-20', dueRead: true })).toBe('期限 2026-11-20');
    expect(asanaDueText({ dueOn: null, dueRead: true })).toBe('期限なし');
    expect(asanaDueText({ dueOn: null, dueRead: false })).toBe('期限が読めません');
    expect(ASANA_NO_DUE).toBe('期限なし');
    expect(ASANA_DUE_UNREADABLE).toBe('期限が読めません');
  });

  it('★ 読めなかった物は上流から 1 つだけ名指しする', () => {
    expect(asanaIntakeNote({ meRead: true, tasksAsked: true, tasksRead: true })).toBeNull();
    expect(asanaIntakeNote({ meRead: false, tasksAsked: false, tasksRead: false })).toBe(
      'Asana の応答から利用者の情報を読み取れませんでした (タスクは照会していません)。',
    );
    expect(asanaIntakeNote({ meRead: true, tasksAsked: false, tasksRead: false })).toBe(
      'Asana の応答に、読めるワークスペースがありませんでした (タスクは照会していません)。',
    );
    expect(asanaIntakeNote({ meRead: true, tasksAsked: true, tasksRead: false })).toBe(
      'Asana の応答からタスクの一覧を読み取れませんでした (0 件という意味ではありません)。',
    );
  });

  it('★ 範囲の断り: 見ていない物が無ければ何も言わない', () => {
    expect(asanaScopeNote({ workspaceCount: 1, workspaceName: '本社', more: false })).toBeNull();
    expect(asanaScopeNote({ workspaceCount: 0, workspaceName: '', more: false })).toBeNull();
  });

  it('★ 範囲の断り: ワークスペースが 2 つ以上なら 1 つ目だけだと述べる', () => {
    expect(asanaScopeNote({ workspaceCount: 2, workspaceName: '本社', more: false })).toBe(
      'ワークスペースが 2 個あります。表示しているのは 1 つ目 (本社)のタスクだけです。',
    );
    expect(asanaScopeNote({ workspaceCount: 3, workspaceName: '', more: false })).toBe(
      'ワークスペースが 3 個あります。表示しているのは 1 つ目のタスクだけです。',
    );
  });

  it('★ 範囲の断り: ほかにもタスクが在れば上限を述べ、2 つの文は空白 1 つでつなぐ', () => {
    expect(asanaScopeNote({ workspaceCount: 1, workspaceName: '本社', more: true })).toBe(
      '未完了のタスクはほかにもあります (先頭 20 件までを表示しています)。',
    );
    expect(asanaScopeNote({ workspaceCount: 2, workspaceName: '本社', more: true })).toBe(
      'ワークスペースが 2 個あります。表示しているのは 1 つ目 (本社)のタスクだけです。 未完了のタスクはほかにもあります (先頭 20 件までを表示しています)。',
    );
  });
});

describe('fetchAsanaSnapshotWith', () => {
  it('ヘッダは Bearer だけ', () => {
    expect(asanaHeaders('tok')).toEqual({ Authorization: 'Bearer tok' });
  });

  it('★ 利用者 → そのワークスペースのタスク の順に 2 回だけ照会する', async () => {
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ data: { name: '山田', workspaces: [{ gid: '42', name: '本社' }] } })
      .mockResolvedValueOnce({ data: [{ gid: '100', name: '見積もりを送る', due_on: '2026-11-20' }] });
    const snap = await fetchAsanaSnapshotWith(jsonFetch, 'tok');
    expect(snap).toEqual({
      userName: '山田',
      workspaceName: '本社',
      workspaceCount: 1,
      tasks: [{ id: '100', name: '見積もりを送る', dueOn: '2026-11-20', dueRead: true }],
      meRead: true,
      tasksAsked: true,
      tasksRead: true,
      more: false,
    });
    expect(jsonFetch.mock.calls).toEqual([
      [ME_URL, { headers: { Authorization: 'Bearer tok' } }],
      [TASKS_URL_42, { headers: { Authorization: 'Bearer tok' } }],
    ]);
  });

  it('★ 読めるワークスペースが無ければ、タスクは照会しない (1 回で止まる)', async () => {
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ data: { name: '山田', workspaces: [{ gid: '../admin', name: '壊れた行' }] } });
    const snap = await fetchAsanaSnapshotWith(jsonFetch, 'tok');
    expect(jsonFetch).toHaveBeenCalledTimes(1);
    expect(snap).toEqual({
      userName: '山田',
      workspaceName: '',
      workspaceCount: 0,
      tasks: [],
      meRead: true,
      tasksAsked: false,
      tasksRead: false,
      more: false,
    });
  });

  it('★ 通信手段が投げたら、そのまま上へ出す (見本へ黙って戻らない)', async () => {
    const jsonFetch = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>().mockRejectedValueOnce(new Error('401'));
    await expect(fetchAsanaSnapshotWith(jsonFetch, 'bad')).rejects.toThrow(new Error('401'));
  });
});
