/**
 * **Notion / WordPress / Atlassian / Canva / Slack への書き込みの入口が返す形と、
 * 応答を断る文面を、値ごとに留める。** (2026-09-30 · パス 502)
 *
 * 変異検査の全掃引 (#179) が `shared/api/{notion,wordpress,atlassian,canva,slack}.ts` に
 * 生存を 39 件残した。`google.ts` (`googleWriteCheckedShapes.test.ts`) と同じ 3 種類で、
 * どれも「検査が値を主張していない」報せだった:
 *
 * 1. **省略・空・`null` の倒し先** —— Notion の `body`・WordPress の `status`・
 *    Atlassian の `description` は、文字列でない (空を含む) ときの返し方が決まっている
 *    (`undefined` / `'draft'`) のに、その形を留める検査が無かった。
 * 2. **`.trim()`** —— Notion の親ページ ID と題名・Atlassian のプロジェクトキーと題名は
 *    前後の空白を落としてから外へ送る。**空白つきの入力**でしか観測できない。
 * 3. **応答を断る文の相手の名前** —— `'Notion API'` などの綴りが `''` になっても、
 *    断片の検査は通る。**文を値ごと (繋ぎ目まで) 留める。**
 *
 * ★ 必須の欄の `typeof x === 'string' ? x.trim() : ''` は `String(x).trim()` へ形ごと消した
 *   (必須の欄は `checkWriteFields` が文字列と保証済みなので、`''` の枝は届かなかった)。
 *   消した後も答えが同じであること —— 空白を落とす欄と落とさない欄 —— と、**文字列でない必須の欄は
 *   形を揃える前に台帳が断る**ことは、ここが留める。
 *
 * ★ 任意の欄の倒し先は**要求の本文**でも観測できる: Atlassian の説明が空文字 / `null` のまま
 *   `jiraIssueInit` へ渡ると `text` が空 (または null) の ADF の説明を外へ送り、WordPress の状態が
 *   空文字のまま渡ると `"status":""` を送る。返り値だけでなく要求の本文でも留める (下の 2 件)。
 *
 * ★ **断りの文は `toThrow('文面')` で照合しない** —— 投げた値が偽だと chai は照合そのものを
 *   飛ばして合格にする (CLAUDE.md の規約)。投げた文面を**値として**受け取って `toBe` で比べる。
 */
import { describe, expect, it } from 'vitest';
import { checkJiraIssue, jiraIssueInit, parseCreatedJiraIssue } from '../atlassian';
import { checkFolder, parseCreatedFolder } from '../canva';
import { checkPage, parseCreatedPage } from '../notion';
import { checkMessage, readSlackPost } from '../slack';
import { checkPost, parseCreatedPost, wordpressPostInit } from '../wordpress';

/** 投げた文面を返す。投げなければ印を返す (偽の値が投げられても照合を飛ばさない)。 */
function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    return e instanceof Error ? e.message : `Error ではない物が投げられた: ${String(e)}`;
  }
  return '(投げなかった)';
}

describe('notion/create-page の入口 checkPage (パス 502)', () => {
  it('★ 親ページ ID と題名の前後の空白を落とす。本文は落とさず、省くと undefined', () => {
    expect(checkPage({ parentPageId: '  abc123  ', title: '  議事録  ' })).toStrictEqual({
      parentPageId: 'abc123',
      title: '議事録',
      body: undefined,
    });
  });

  it('★ 本文は文字列ならそのまま (改行も前後の空白も落とさない)。null は undefined', () => {
    expect(checkPage({ parentPageId: 'p', title: 't', body: ' 1 行目\n2 行目 ' }).body).toBe(' 1 行目\n2 行目 ');
    expect(checkPage({ parentPageId: 'p', title: 't', body: null }).body).toBeUndefined();
  });
});

describe('notion/create-page: 必須の欄は形を揃える前に断られる (パス 502)', () => {
  it('★ 欠ける・空白だけ・数は台帳の文で断る (親ページ ID と題名)', () => {
    expect(thrownMessage(() => checkPage({ title: 't' }))).toBe('parentPageId は必須です');
    expect(thrownMessage(() => checkPage({ parentPageId: '  ', title: 't' }))).toBe('parentPageId は必須です');
    expect(thrownMessage(() => checkPage({ parentPageId: 7, title: 't' }))).toBe(
      'parentPageId は文字列で指定してください',
    );
    expect(thrownMessage(() => checkPage({ parentPageId: 'p' }))).toBe('title は必須です');
    expect(thrownMessage(() => checkPage({ parentPageId: 'p', title: '  ' }))).toBe('title は必須です');
    expect(thrownMessage(() => checkPage({ parentPageId: 'p', title: 7 }))).toBe('title は文字列で指定してください');
  });
});

describe('notion/create-page の応答 parseCreatedPage (パス 502)', () => {
  const OBJECT = 'Notion API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_ID = 'Notion API の応答に id (非空の文字列) がありません (処理したことを確認できません)';
  const NO_URL = 'Notion API の応答に url (非空の文字列) がありません (処理したことを確認できません)';

  const cases: readonly (readonly [string, unknown, string])[] = [
    ['本文が null', null, OBJECT],
    ['本文が配列', [], OBJECT],
    ['id が無い', {}, NO_ID],
    ['id が空文字', { id: '', url: 'https://www.notion.so/x' }, NO_ID],
    ['url が無い', { id: 'p1' }, NO_URL],
    ['url が空文字', { id: 'p1', url: '' }, NO_URL],
  ];

  it.each(cases)('★ 断りの文は相手の名前まで値ごと: %s', (_title, body, message) => {
    expect(thrownMessage(() => parseCreatedPage(body))).toBe(message);
  });

  it('★ 読めた応答は id と url を返す', () => {
    expect(parseCreatedPage({ id: 'p1', url: 'https://www.notion.so/p1' })).toStrictEqual({
      id: 'p1',
      url: 'https://www.notion.so/p1',
    });
  });
});

describe('wordpress/create-post-draft の入口 checkPost (パス 502)', () => {
  it('★ サイトと題名の前後の空白を落とし、本文を省くと空文字、状態を省くと draft', () => {
    expect(checkPost({ siteId: '  12345  ', title: '  題名  ' })).toStrictEqual({
      siteId: '12345',
      title: '題名',
      content: '',
      status: 'draft',
    });
  });

  it('★ 状態は空文字・null でも draft。一覧の中の値 (publish など) はそのまま', () => {
    for (const status of [undefined, null, '']) {
      expect(checkPost({ siteId: '1', title: 't', status }).status, `status=${String(status)}`).toBe('draft');
    }
    for (const status of ['draft', 'publish', 'pending', 'private']) {
      expect(checkPost({ siteId: '1', title: 't', status }).status, status).toBe(status);
    }
  });

  it('★ 本文は文字列ならそのまま (前後の空白も落とさない)', () => {
    expect(checkPost({ siteId: '1', title: 't', content: ' <p>本文</p>\n' }).content).toBe(' <p>本文</p>\n');
  });

  it('★ 状態が空文字のまま外へ出ない: 要求の本文は draft を名乗る (空の status を送らない)', () => {
    const init = wordpressPostInit(checkPost({ siteId: '1', title: 't', status: '' }), 'tok');
    expect(JSON.parse(String(init.body))).toEqual({ title: 't', content: '', status: 'draft' });
  });

  it('★ 必須の欄 (サイトと題名) は、欠ける・空白だけ・数のとき台帳の文で断る', () => {
    expect(thrownMessage(() => checkPost({ title: 't' }))).toBe('siteId は必須です');
    expect(thrownMessage(() => checkPost({ siteId: '  ', title: 't' }))).toBe('siteId は必須です');
    expect(thrownMessage(() => checkPost({ siteId: 1, title: 't' }))).toBe('siteId は文字列で指定してください');
    expect(thrownMessage(() => checkPost({ siteId: '1' }))).toBe('title は必須です');
    expect(thrownMessage(() => checkPost({ siteId: '1', title: '  ' }))).toBe('title は必須です');
    expect(thrownMessage(() => checkPost({ siteId: '1', title: 1 }))).toBe('title は文字列で指定してください');
  });
});

describe('wordpress/create-post-draft の応答 parseCreatedPost (パス 502)', () => {
  const OBJECT = 'WordPress.com API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_ID = 'WordPress.com API の応答に ID (有限の数値) がありません (処理したことを確認できません)';
  const NO_URL = 'WordPress.com API の応答に URL (非空の文字列) がありません (処理したことを確認できません)';
  const NO_TITLE = 'WordPress.com API の応答に title (非空の文字列) がありません (処理したことを確認できません)';

  const cases: readonly (readonly [string, unknown, string])[] = [
    ['本文が null', null, OBJECT],
    ['本文が配列', [], OBJECT],
    ['ID が無い', {}, NO_ID],
    ['ID が文字列', { ID: '7', URL: 'https://x.example/p', title: 't' }, NO_ID],
    ['ID が非有限', { ID: Number.POSITIVE_INFINITY, URL: 'https://x.example/p', title: 't' }, NO_ID],
    ['URL が無い', { ID: 7 }, NO_URL],
    ['URL が空文字', { ID: 7, URL: '' }, NO_URL],
    ['title が無い', { ID: 7, URL: 'https://x.example/p' }, NO_TITLE],
    ['title が空文字', { ID: 7, URL: 'https://x.example/p', title: '' }, NO_TITLE],
  ];

  it.each(cases)('★ 断りの文は相手の名前まで値ごと: %s', (_title, body, message) => {
    expect(thrownMessage(() => parseCreatedPost(body))).toBe(message);
  });

  it('★ 読めた応答は ID / URL / title を返す', () => {
    expect(parseCreatedPost({ ID: 7, URL: 'https://x.example/p', title: '題名' })).toStrictEqual({
      id: 7,
      url: 'https://x.example/p',
      title: '題名',
    });
  });
});

describe('atlassian/create-issue の入口 checkJiraIssue (パス 502)', () => {
  it('★ プロジェクトキーと題名の前後の空白を落とす。説明は省くと「キーごと無い」、種別は Task', () => {
    // `toStrictEqual` は `description: undefined` のキーが在ることも別物として断る
    // (説明が無いのに空のキーを作ると、要求の組み立てが「在る」側へ倒れうる)。
    expect(checkJiraIssue({ projectKey: '  KAN  ', summary: '  不具合  ' })).toStrictEqual({
      projectKey: 'KAN',
      summary: '不具合',
      issueType: 'Task',
    });
  });

  it('★ 説明は空文字・null でも「キーごと無い」。文字列ならそのまま (前後の空白も落とさない)', () => {
    for (const description of [undefined, null, '']) {
      const got = checkJiraIssue({ projectKey: 'KAN', summary: 's', description });
      expect(Object.keys(got), `description=${String(description)}`).toEqual(['projectKey', 'summary', 'issueType']);
    }
    expect(checkJiraIssue({ projectKey: 'KAN', summary: 's', description: ' 再現手順\n1. 押す ' })).toStrictEqual({
      projectKey: 'KAN',
      summary: 's',
      description: ' 再現手順\n1. 押す ',
      issueType: 'Task',
    });
  });

  it('★ 説明が空文字・null・省略のとき、要求の本文に description を載せない (空の ADF を外へ送らない)', () => {
    const creds = { email: 'me@example.com', token: 'apitok' };
    for (const description of [undefined, null, '']) {
      const init = jiraIssueInit(checkJiraIssue({ projectKey: 'KAN', summary: 's', description }), creds);
      const fields = (JSON.parse(String(init.body)) as { fields: Record<string, unknown> }).fields;
      expect(Object.keys(fields).sort(), `description=${String(description)}`).toEqual([
        'issuetype',
        'project',
        'summary',
      ]);
    }
    // 対照: 文字列なら載る
    const withText = jiraIssueInit(checkJiraIssue({ projectKey: 'KAN', summary: 's', description: '手順' }), creds);
    expect(Object.keys((JSON.parse(String(withText.body)) as { fields: Record<string, unknown> }).fields).sort()).toEqual([
      'description',
      'issuetype',
      'project',
      'summary',
    ]);
  });

  it('★ 必須の欄 (プロジェクトキーと題名) は、欠ける・空白だけ・数のとき台帳の文で断る', () => {
    expect(thrownMessage(() => checkJiraIssue({ summary: 's' }))).toBe('projectKey は必須です');
    expect(thrownMessage(() => checkJiraIssue({ projectKey: '  ', summary: 's' }))).toBe('projectKey は必須です');
    expect(thrownMessage(() => checkJiraIssue({ projectKey: 5, summary: 's' }))).toBe(
      'projectKey は文字列で指定してください',
    );
    expect(thrownMessage(() => checkJiraIssue({ projectKey: 'KAN' }))).toBe('summary は必須です');
    expect(thrownMessage(() => checkJiraIssue({ projectKey: 'KAN', summary: '  ' }))).toBe('summary は必須です');
    expect(thrownMessage(() => checkJiraIssue({ projectKey: 'KAN', summary: 5 }))).toBe(
      'summary は文字列で指定してください',
    );
  });

  it('★ 種別は空文字・null・省略で Task。指定があればそのまま', () => {
    for (const issueType of [undefined, null, '']) {
      expect(checkJiraIssue({ projectKey: 'KAN', summary: 's', issueType }).issueType, `issueType=${String(issueType)}`).toBe(
        'Task',
      );
    }
    expect(checkJiraIssue({ projectKey: 'KAN', summary: 's', issueType: 'Bug' }).issueType).toBe('Bug');
  });
});

describe('atlassian/create-issue の応答 parseCreatedJiraIssue (パス 502)', () => {
  const SITE = 'https://acme.atlassian.net';
  const OBJECT = 'Atlassian API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_KEY = 'Atlassian API の応答に key (非空の文字列) がありません (処理したことを確認できません)';

  const cases: readonly (readonly [string, unknown, string])[] = [
    ['本文が null', null, OBJECT],
    ['本文が配列', [], OBJECT],
    ['key が無い', {}, NO_KEY],
    ['key が空文字', { key: '' }, NO_KEY],
    ['key が数', { key: 12 }, NO_KEY],
  ];

  it.each(cases)('★ 断りの文は相手の名前まで値ごと: %s', (_title, body, message) => {
    expect(thrownMessage(() => parseCreatedJiraIssue(body, SITE))).toBe(message);
  });

  it('★ 読めた応答は key と /browse/<key> の URL を返す', () => {
    expect(parseCreatedJiraIssue({ key: 'KAN-12' }, SITE)).toStrictEqual({
      key: 'KAN-12',
      url: 'https://acme.atlassian.net/browse/KAN-12',
    });
  });
});

describe('canva/create-folder の入口 checkFolder (パス 502)', () => {
  it('★ 名前の前後の空白を落とし、親を省くと root', () => {
    expect(checkFolder({ name: '  ブランド素材  ' })).toStrictEqual({ name: 'ブランド素材', parentFolderId: 'root' });
  });

  it('★ 親は空文字・null でも root。指定があればそのまま', () => {
    for (const parentFolderId of [undefined, null, '']) {
      expect(checkFolder({ name: 'n', parentFolderId }).parentFolderId, `parentFolderId=${String(parentFolderId)}`).toBe(
        'root',
      );
    }
    expect(checkFolder({ name: 'n', parentFolderId: 'FAF123' }).parentFolderId).toBe('FAF123');
  });
});

describe('canva/create-folder: 必須の欄は形を揃える前に断られる (パス 502)', () => {
  it('★ 名前が欠ける・空白だけ・数は台帳の文で断る', () => {
    expect(thrownMessage(() => checkFolder({}))).toBe('name は必須です');
    expect(thrownMessage(() => checkFolder({ name: '  ' }))).toBe('name は必須です');
    expect(thrownMessage(() => checkFolder({ name: 3 }))).toBe('name は文字列で指定してください');
  });
});

describe('canva/create-folder の応答 parseCreatedFolder (パス 502)', () => {
  const OBJECT = 'Canva API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_FOLDER = 'Canva API の応答に folder (オブジェクト) がありません (処理したことを確認できません)';
  const NO_ID = 'Canva API の応答に id (非空の文字列) がありません (処理したことを確認できません)';
  const NO_NAME = 'Canva API の応答に name (非空の文字列) がありません (処理したことを確認できません)';

  const cases: readonly (readonly [string, unknown, string])[] = [
    ['本文が null', null, OBJECT],
    ['本文が配列', [], OBJECT],
    ['folder が無い', {}, NO_FOLDER],
    ['folder が null', { folder: null }, NO_FOLDER],
    ['folder が配列', { folder: [] }, NO_FOLDER],
    ['folder.id が無い', { folder: { name: 'n' } }, NO_ID],
    ['folder.id が空文字', { folder: { id: '', name: 'n' } }, NO_ID],
    ['folder.name が無い', { folder: { id: 'F1' } }, NO_NAME],
    ['folder.name が空文字', { folder: { id: 'F1', name: '' } }, NO_NAME],
  ];

  it.each(cases)('★ 断りの文は相手の名前まで値ごと: %s', (_title, body, message) => {
    expect(thrownMessage(() => parseCreatedFolder(body))).toBe(message);
  });

  it('★ 読めた応答は folder.id と folder.name を返す', () => {
    expect(parseCreatedFolder({ folder: { id: 'F1', name: 'ブランド素材' } })).toStrictEqual({
      id: 'F1',
      name: 'ブランド素材',
    });
  });
});

describe('slack/send-message の入口 checkMessage (パス 502)', () => {
  it('★ チャンネルの前後の空白を落とす。本文は落とさない (字下げや末尾の改行も投稿の一部)', () => {
    expect(checkMessage({ channel: '  C0123456  ', text: '  1 行目\n    字下げ\n' })).toStrictEqual({
      channel: 'C0123456',
      text: '  1 行目\n    字下げ\n',
    });
  });
});

describe('slack/send-message: 必須の欄は形を揃える前に断られる (パス 502)', () => {
  it('★ チャンネルと本文が、欠ける・空白だけ・数のとき台帳の文で断る', () => {
    expect(thrownMessage(() => checkMessage({ text: 'hi' }))).toBe('channel は必須です');
    expect(thrownMessage(() => checkMessage({ channel: '  ', text: 'hi' }))).toBe('channel は必須です');
    expect(thrownMessage(() => checkMessage({ channel: 9, text: 'hi' }))).toBe('channel は文字列で指定してください');
    expect(thrownMessage(() => checkMessage({ channel: 'C1' }))).toBe('text は必須です');
    expect(thrownMessage(() => checkMessage({ channel: 'C1', text: '  ' }))).toBe('text は必須です');
    expect(thrownMessage(() => checkMessage({ channel: 'C1', text: 9 }))).toBe('text は文字列で指定してください');
  });
});

describe('slack/send-message の応答 readSlackPost (パス 502)', () => {
  const requested = { channel: 'C0123456', text: 'hello' } as const;
  const OBJECT = 'Slack API の応答が JSON のオブジェクトではありません (処理したことを確認できません)';
  const NO_TS = 'Slack API の応答に ts (非空の文字列) がありません (処理したことを確認できません)';

  it('★ 本文がオブジェクトでなければ相手の名前つきの文で断る (null・配列・文字列)', () => {
    for (const body of [null, [], 'ok']) {
      expect(thrownMessage(() => readSlackPost(body, requested)), JSON.stringify(body)).toBe(OBJECT);
    }
  });

  it('★ ok: true なのに ts が無ければ断る (どこへ送れたか言えない報告は作らない)', () => {
    expect(thrownMessage(() => readSlackPost({ ok: true }, requested))).toBe(NO_TS);
    expect(thrownMessage(() => readSlackPost({ ok: true, ts: '' }, requested))).toBe(NO_TS);
  });

  it('★ 読めた応答: ok: true は ts と channel (無ければ送った先)・ok: false は error (無ければ unknown_error)', () => {
    expect(readSlackPost({ ok: true, ts: '1700000000.000100', channel: 'C999' }, requested)).toStrictEqual({
      ok: true,
      ts: '1700000000.000100',
      channel: 'C999',
    });
    expect(readSlackPost({ ok: true, ts: '1700000000.000100' }, requested)).toStrictEqual({
      ok: true,
      ts: '1700000000.000100',
      channel: 'C0123456',
    });
    expect(readSlackPost({ ok: false, error: 'channel_not_found' }, requested)).toStrictEqual({
      ok: false,
      error: 'channel_not_found',
    });
    expect(readSlackPost({ ok: false }, requested)).toStrictEqual({ ok: false, error: 'unknown_error' });
  });
});
