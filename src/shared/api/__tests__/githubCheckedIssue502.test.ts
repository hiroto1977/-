/**
 * **`github/create-issue` の「通した後の値」と「応答の読み」を、値ごとに留める。** (2026-09-30 · パス 502)
 *
 * 全掃引の変異検査 (run 36784826064) が `shared/api/github.ts` に残した 13 件のうち、
 * 検査で主張していなかった物:
 *
 * | 変異体 | 観測できる差 |
 * | --- | --- |
 * | `typeof input.body === 'string'` → `true` | 任意の `body` が **`null`** で来たとき、`undefined` に揃えず `null` のまま持つ —— 要求の JSON へ `"body":null` が出る (`undefined` なら欄ごと出ない) |
 * | `requireObject` / `requireNumber` / `requireString` の `'GitHub API'` (4 か所) | 壊れた 201 の応答を断る文に**相手の名前が載る** —— 利用者が「どのサービスの応答か」を読む唯一の手がかり (`''` だと「 の応答に number…」になる) |
 *
 * 残る 7 件 (owner / repo / title の `typeof`・その `''` の枝・`labels.filter`) は**等価** —— 必須の欄と
 * ラベルの 1 件ずつは、`checkWriteFields` / `checkWriteLabels` が「空でない文字列」として通した物だけがそこへ
 * 来るので、偽の枝へは入れず `filter` は何も落とさない。形ごと消した (`String(…).trim()` / `[...input.labels]`)。
 * 消した後も答えが変わらないことは、下の「通した後の値」の表と既存の検査 (`saasWriteWeb.test.ts` /
 * `clients/__tests__/github.test.ts`) が見る。
 *
 * 文は**字面**で書く (原文の式で期待値を組むと、原文が変わったときに両辺が一緒に動く)。
 * `toThrow('文面')` は投げた値が偽だと照合を飛ばすので、`toThrow(new Error('文面'))` で見る。
 */
import { describe, expect, it } from 'vitest';
import { checkIssue, githubIssueInit, parseCreatedIssue } from '../github';

describe('checkIssue: 通した後の値', () => {
  it('★ owner / repo / title は前後の空白を落とし、body は触らず、labels は同じ中身の写し', () => {
    const labels = ['bug', 'ui'];
    const checked = checkIssue({ owner: '  octo  ', repo: '\trepo ', title: '  題名  ', body: '  本文\n  ', labels });
    expect(checked).toEqual({ owner: 'octo', repo: 'repo', title: '題名', body: '  本文\n  ', labels: ['bug', 'ui'] });
    // 呼び出し側の配列とは別の物 (後から呼び出し側が書き換えても、通した値は動かない)。
    expect(checked.labels).not.toBe(labels);
  });

  it('★ 任意の欄は「無い」に揃える: body が null / 無い・labels が null / 無い は undefined', () => {
    const base = { owner: 'o', repo: 'r', title: 't' };
    for (const input of [base, { ...base, body: null, labels: null }]) {
      const checked = checkIssue(input);
      expect(checked.body).toBeUndefined();
      expect(checked.labels).toBeUndefined();
    }
  });

  it('★ body が null でも、要求の JSON へ null を出さない (欄ごと省く)', () => {
    const checked = checkIssue({ owner: 'o', repo: 'r', title: 't', body: null });
    const sent = JSON.parse(String(githubIssueInit(checked, 'tok').body)) as Record<string, unknown>;
    expect(sent).toEqual({ title: 't' });
    expect('body' in sent).toBe(false);
  });
});

describe('parseCreatedIssue: 壊れた 201 の応答を断る文には相手の名前が載る', () => {
  const GH = 'GitHub API';

  it.each([null, undefined, 'text', 42, [], [{ number: 1 }]])('★ 応答が JSON の物でない (%j) は「物ではありません」', (raw) => {
    expect(() => parseCreatedIssue(raw)).toThrow(
      new Error(`${GH} の応答が JSON のオブジェクトではありません (処理したことを確認できません)`),
    );
  });

  it.each([{}, { number: '1' }, { number: Number.NaN }, { number: Number.POSITIVE_INFINITY }])(
    '★ number が無い / 有限の数でない (%j) は number を名指しして断る',
    (raw) => {
      expect(() => parseCreatedIssue({ ...raw, html_url: 'https://github.com/o/r/issues/1', title: 'T' })).toThrow(
        new Error(`${GH} の応答に number (有限の数値) がありません (処理したことを確認できません)`),
      );
    },
  );

  it.each([{}, { html_url: '' }, { html_url: 5 }])('★ html_url が無い / 空 / 文字列でない (%j) は html_url を名指しして断る', (raw) => {
    expect(() => parseCreatedIssue({ number: 1, title: 'T', ...raw })).toThrow(
      new Error(`${GH} の応答に html_url (非空の文字列) がありません (処理したことを確認できません)`),
    );
  });

  it.each([{}, { title: '' }, { title: {} }])('★ title が無い / 空 / 文字列でない (%j) は title を名指しして断る', (raw) => {
    expect(() => parseCreatedIssue({ number: 1, html_url: 'https://github.com/o/r/issues/1', ...raw })).toThrow(
      new Error(`${GH} の応答に title (非空の文字列) がありません (処理したことを確認できません)`),
    );
  });

  it('対照: 正しい応答は画面が使う 3 欄だけを取る (余分な欄は持ち込まない)', () => {
    expect(
      parseCreatedIssue({ number: 7, html_url: 'https://github.com/o/r/issues/7', title: 'Bug', state: 'open', id: 99 }),
    ).toEqual({ number: 7, url: 'https://github.com/o/r/issues/7', title: 'Bug' });
  });
});
