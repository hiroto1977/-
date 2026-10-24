/**
 * **Google への書き込み 3 経路 (Drive のフォルダ・Calendar の予定・Gmail の下書き) の入口が返す形と、
 * 応答を断る文面を、値ごとに留める。** (2026-09-30 · パス 502)
 *
 * 変異検査の全掃引 (#179) が `shared/api/google.ts` に 24 件の生存を残した。内訳は 3 種類で、
 * どれも「検査が値を主張していない」報せだった:
 *
 * 1. **省略・空・`null` の倒し先** —— `parentId` / `description` / `location` / `body` を
 *    文字列でなくしたとき、返す形は `undefined` (本文は `''`) と決まっているのに、
 *    その形を留める検査が無かった。観測できる差は 2 種類で、どちらも下で留める:
 *    **返り値の型の約束** (`string | undefined` に `null` や `''` を載せない) と、
 *    **要求の本文** (説明・場所が `null` のままだと JSON に `"description":null` が出る)。
 * 2. **応答を断る文の相手の名前** —— `parseCreated*` は「どの相手の応答が何を欠いていたか」を
 *    文にして断る。`'Google Drive API'` の綴りが `''` になっても、`toThrow(/応答/)` のような
 *    断片の検査は通る。**文を値ごと (繋ぎ目まで) 留める。**
 * 3. **`typeof x === 'string'` の絞り直し** —— 必須の欄は `checkWriteFields` が文字列と保証済みなので
 *    届かない枝だった。`String(x)` へ形ごと消した (`cloudflare.ts` / `checkGmailDraft` の `to` と同じ形)。
 *    消した後も答えが同じであること (前後の空白を落とす・落とさない) はここが留める。
 *
 * ★ **断りの文は `toThrow('文面')` で照合しない** —— Vitest は文字列・正規表現の照合を chai の
 *   `throws` に委ね、chai は投げた値が偽 (`undefined` など) だと照合そのものを飛ばして合格にする
 *   (CLAUDE.md の規約)。投げた文面を**値として**受け取って `toBe` で比べる。
 */
import { describe, expect, it } from 'vitest';
import {
  calendarEventInit,
  checkCalendarEvent,
  checkDriveFolder,
  checkGmailDraft,
  defaultTimeZone,
  parseCreatedDraft,
  parseCreatedDriveFolder,
  parseCreatedEvent,
} from '../google';

/** 投げた文面を返す。投げなければ印を返す (偽の値が投げられても照合を飛ばさない)。 */
function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    return e instanceof Error ? e.message : `Error ではない物が投げられた: ${String(e)}`;
  }
  return '(投げなかった)';
}

describe('drive/create-folder の入口 checkDriveFolder (パス 502)', () => {
  it('★ 名前の前後の空白を落とし、親を省くと undefined (My Drive 直下)', () => {
    expect(checkDriveFolder({ name: '  請求書  ' })).toStrictEqual({ name: '請求書', parentId: undefined });
  });

  it('★ 親は文字列ならそのまま。省く・null・空文字は undefined にする (空の親 ID を外へ送らない)', () => {
    expect(checkDriveFolder({ name: 'n', parentId: '1AbC_dEf' })).toStrictEqual({
      name: 'n',
      parentId: '1AbC_dEf',
    });
    for (const parentId of [undefined, null, '']) {
      expect(checkDriveFolder({ name: 'n', parentId }), `parentId=${String(parentId)}`).toStrictEqual({
        name: 'n',
        parentId: undefined,
      });
    }
  });
});

describe('drive/create-folder: 必須の欄は形を揃える前に断られる (パス 502)', () => {
  // `String(input.name)` へ届くのは「空でない文字列」だけ —— そうでない入力は台帳が先に断る。
  // この 3 つが断られるかぎり、`typeof` で分け直す形 (偽の枝 `''` へは届かなかった) は要らない。
  it('★ 欠ける・空白だけ・数は台帳の文で断る', () => {
    expect(thrownMessage(() => checkDriveFolder({}))).toBe('name は必須です');
    expect(thrownMessage(() => checkDriveFolder({ name: '   ' }))).toBe('name は必須です');
    expect(thrownMessage(() => checkDriveFolder({ name: 42 }))).toBe('name は文字列で指定してください');
  });
});

describe('drive/create-folder の応答 parseCreatedDriveFolder (パス 502)', () => {
  const OBJECT = 'Google Drive API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_ID = 'Google Drive API の応答に id (非空の文字列) がありません (処理したことを確認できません)';
  const NO_NAME = 'Google Drive API の応答に name (非空の文字列) がありません (処理したことを確認できません)';

  const cases: readonly (readonly [string, unknown, string])[] = [
    ['本文が null', null, OBJECT],
    ['本文が文字列', 'ok', OBJECT],
    ['本文が配列', [], OBJECT],
    ['id が無い', {}, NO_ID],
    ['id が空文字', { id: '', name: 'n' }, NO_ID],
    ['id が数', { id: 7, name: 'n' }, NO_ID],
    ['name が無い', { id: 'f1' }, NO_NAME],
    ['name が空文字', { id: 'f1', name: '' }, NO_NAME],
  ];

  it.each(cases)('★ 断りの文は相手の名前まで値ごと: %s', (_title, body, message) => {
    expect(thrownMessage(() => parseCreatedDriveFolder(body))).toBe(message);
  });

  it('★ 読めた応答は id / name / url (webViewLink 優先) を返す', () => {
    expect(parseCreatedDriveFolder({ id: 'f1', name: '請求書', webViewLink: 'https://drive.google.com/x' })).toStrictEqual({
      id: 'f1',
      name: '請求書',
      url: 'https://drive.google.com/x',
    });
  });
});

describe('calendar/create-event の入口 checkCalendarEvent (パス 502)', () => {
  const base = {
    summary: '  定例会議  ',
    start: '2026-10-01T10:00:00+09:00',
    end: '2026-10-01T11:00:00+09:00',
    timeZone: 'Asia/Tokyo',
  };

  it('★ 題名の前後の空白を落とし、説明と場所を省くと undefined', () => {
    expect(checkCalendarEvent(base)).toStrictEqual({
      summary: '定例会議',
      start: '2026-10-01T10:00:00+09:00',
      end: '2026-10-01T11:00:00+09:00',
      description: undefined,
      location: undefined,
      timeZone: 'Asia/Tokyo',
    });
  });

  it('★ 説明と場所は文字列ならそのまま (本文の改行も落とさない)', () => {
    const got = checkCalendarEvent({ ...base, description: '議題:\n1. 予算\n', location: '会議室 A' });
    expect(got.description).toBe('議題:\n1. 予算\n');
    expect(got.location).toBe('会議室 A');
  });

  it('★ 説明・場所が null のときは undefined (null を外へ送る形にしない)', () => {
    const got = checkCalendarEvent({ ...base, description: null, location: null });
    expect(got.description).toBeUndefined();
    expect(got.location).toBeUndefined();
    // 片方ずつも —— 説明だけ null でも場所の答えは動かず、その逆も同じ。
    expect(checkCalendarEvent({ ...base, description: null, location: '会議室' }).location).toBe('会議室');
    expect(checkCalendarEvent({ ...base, description: '議題', location: null }).description).toBe('議題');
  });

  it('★ 説明・場所が省かれた / null の要求は本文にそのキーを出さない (JSON に null を載せない)', () => {
    for (const extra of [{}, { description: null, location: null }]) {
      const init = calendarEventInit(checkCalendarEvent({ ...base, ...extra }), 'tok');
      const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(Object.keys(sent).sort(), JSON.stringify(extra)).toEqual(['end', 'start', 'summary']);
    }
    // 対照: 文字列なら載る (この検査が「何も載せない」形になっていない)
    const withText = calendarEventInit(checkCalendarEvent({ ...base, description: '議題', location: '会議室' }), 'tok');
    expect(JSON.parse(String(withText.body))).toMatchObject({ description: '議題', location: '会議室' });
  });

  it('★ 必須の欄 (題名・開始・終了) は、欠ける・空白だけ・数のとき台帳の文で断る', () => {
    const fields = [
      ['summary', '題名'],
      ['start', '2026-10-01T10:00:00+09:00'],
      ['end', '2026-10-01T11:00:00+09:00'],
    ] as const;
    for (const [field] of fields) {
      const without = Object.fromEntries(fields.filter(([f]) => f !== field));
      expect(thrownMessage(() => checkCalendarEvent(without)), `${field}=欠落`).toBe(`${field} は必須です`);
      expect(thrownMessage(() => checkCalendarEvent({ ...without, [field]: '  ' })), `${field}=空白`).toBe(
        `${field} は必須です`,
      );
      expect(thrownMessage(() => checkCalendarEvent({ ...without, [field]: 42 })), `${field}=数`).toBe(
        `${field} は文字列で指定してください`,
      );
    }
  });

  it('★ 時間帯を省く・空にすると端末の物 (defaultTimeZone)', () => {
    const { timeZone: _omit, ...without } = base;
    expect(checkCalendarEvent(without).timeZone).toBe(defaultTimeZone());
    expect(checkCalendarEvent({ ...without, timeZone: '' }).timeZone).toBe(defaultTimeZone());
    expect(checkCalendarEvent({ ...without, timeZone: 'America/New_York' }).timeZone).toBe('America/New_York');
  });
});

describe('calendar/create-event の応答 parseCreatedEvent (パス 502)', () => {
  const OBJECT = 'Google Calendar API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_ID = 'Google Calendar API の応答に id (非空の文字列) がありません (処理したことを確認できません)';
  const NO_LINK = 'Google Calendar API の応答に htmlLink (非空の文字列) がありません (処理したことを確認できません)';

  const cases: readonly (readonly [string, unknown, string])[] = [
    ['本文が null', null, OBJECT],
    ['本文が配列', [], OBJECT],
    ['id が無い', {}, NO_ID],
    ['id が空文字', { id: '', htmlLink: 'https://x.example' }, NO_ID],
    ['htmlLink が無い', { id: 'e1' }, NO_LINK],
    ['htmlLink が数', { id: 'e1', htmlLink: 1 }, NO_LINK],
  ];

  it.each(cases)('★ 断りの文は相手の名前まで値ごと: %s', (_title, body, message) => {
    expect(thrownMessage(() => parseCreatedEvent(body))).toBe(message);
  });

  it('★ 読めた応答は id / htmlLink を返す', () => {
    expect(parseCreatedEvent({ id: 'e1', htmlLink: 'https://www.google.com/calendar/event?eid=e1' })).toStrictEqual({
      id: 'e1',
      htmlLink: 'https://www.google.com/calendar/event?eid=e1',
    });
  });
});

describe('gmail/create-draft の入口 checkGmailDraft (パス 502)', () => {
  it('★ 宛先の前後の空白を落とし、本文を省くと空文字 (undefined を返さない)', () => {
    expect(checkGmailDraft({ to: '  a@example.com  ', subject: '件名' })).toStrictEqual({
      to: 'a@example.com',
      subject: '件名',
      body: '',
    });
  });

  it('★ 本文が null のときも空文字', () => {
    expect(checkGmailDraft({ to: 'a@example.com', subject: '件名', body: null }).body).toBe('');
  });

  it('★ 本文は文字列ならそのまま (改行も末尾の空白も落とさない)', () => {
    expect(checkGmailDraft({ to: 'a@example.com', subject: '件名', body: '1 行目\n2 行目  ' }).body).toBe(
      '1 行目\n2 行目  ',
    );
  });
});

describe('gmail/create-draft の応答 parseCreatedDraft (パス 502)', () => {
  const OBJECT = 'Gmail API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_ID = 'Gmail API の応答に id (非空の文字列) がありません (処理したことを確認できません)';
  const NO_MESSAGE = 'Gmail API の応答に message (オブジェクト) がありません (処理したことを確認できません)';

  const cases: readonly (readonly [string, unknown, string])[] = [
    ['本文が null', null, OBJECT],
    ['本文が配列', [], OBJECT],
    ['id が無い', {}, NO_ID],
    ['id が空文字', { id: '', message: { id: 'm1' } }, NO_ID],
    ['message が無い', { id: 'd1' }, NO_MESSAGE],
    ['message が null', { id: 'd1', message: null }, NO_MESSAGE],
    ['message が配列', { id: 'd1', message: [] }, NO_MESSAGE],
    ['message.id が無い (外側の id の文と区別できる位置)', { id: 'd1', message: {} }, NO_ID],
    ['message.id が空文字', { id: 'd1', message: { id: '' } }, NO_ID],
  ];

  it.each(cases)('★ 断りの文は相手の名前まで値ごと: %s', (_title, body, message) => {
    expect(thrownMessage(() => parseCreatedDraft(body))).toBe(message);
  });

  it('★ 読めた応答は id と message.id を返す', () => {
    expect(parseCreatedDraft({ id: 'd1', message: { id: 'm1', threadId: 't1' } })).toStrictEqual({
      id: 'd1',
      messageId: 'm1',
    });
  });
});
