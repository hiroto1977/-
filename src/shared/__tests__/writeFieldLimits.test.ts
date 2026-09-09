/**
 * **外へ書く欄に、型も長さの上限も無かった。** (2026-09-09 · パス 110)
 *
 * 実測 (直す前):
 *
 * | 場所 | 検査 |
 * | --- | --- |
 * | `main/clients/slack.ts` `sendMessage` | `if (!channel \|\| !text)` だけ (object でも通る) |
 * | `main/clients/github.ts` `createIssue` | 同上。`labels` は届いた JSON をそのまま転送 |
 * | `main/clients/calendar.ts` `createEvent` | 同上 |
 * | `renderer/data/saasWriteWeb.ts` の双子 | `typeof === 'string'` は見るが長さは見ない |
 * | 3 画面の入力欄 | `maxLength` 0 件 |
 *
 * 同じ形の欄には上限が在った —— `MAX_RECORD_NOTE_CHARS` (2000)・
 * `MAX_ADVISOR_QUESTION_CHARS` (1000、制御文字も断る)・**同じ `saasWriteWeb.ts` の中**の
 * `MAX_ATLASSIAN_EMAIL` (254)。**規準は同じファイルに在った** (15 か所目)。
 *
 * ## 1 つの台帳を 5 か所が読む
 *
 * main (断る)・ブラウザ版 (断る)・画面の `maxLength` (入れさせない)・音声の台帳 (必須欄を
 * 導く)・この検査 (突き合わせる)。**数を写していない**ことをここで留める。
 *
 * ## 任意の欄が壊れていたら、落として送るのではなく断る
 *
 * ブラウザ版の双子は 2026-09-09 まで、文字列でない `body` を **undefined に落として**
 * issue を立て、文字列でない label を**黙って間引いて**いた。利用者は「本文つきで
 * 立てた」と思うが、本文の無い issue が出来る —— 「黙って捨てる」家系そのもの
 * (パス 74 / 84 / 89 と同じ)。壊れた入力は**送らずに断る**。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CALENDAR_EVENT_FIELDS,
  GITHUB_ISSUE_FIELDS,
  MAX_WRITE_ID_CHARS,
  MAX_WRITE_LABELS,
  MAX_WRITE_LABEL_CHARS,
  MAX_WRITE_TEXT_CHARS,
  MAX_WRITE_TITLE_CHARS,
  SLACK_MESSAGE_FIELDS,
  checkWriteField,
  checkWriteFields,
  checkWriteLabels,
  describeWriteFieldFailure,
  requiredWriteFields,
} from '../writeFieldLimits';
import { VOICE_WRITE_REQUIREMENTS } from '../voiceWriteRequirements';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');
const code = (rel: string): string =>
  read(rel)
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(l))
    .join('\n');

const ID = { required: true, max: MAX_WRITE_ID_CHARS, multiline: false } as const;
const TEXT = { required: true, max: MAX_WRITE_TEXT_CHARS, multiline: true } as const;
const OPTIONAL_TEXT = { required: false, max: MAX_WRITE_TEXT_CHARS, multiline: true } as const;

describe('1 つの欄の判定', () => {
  it('★ 無い・空・空白だけは「必須」で断り、任意の欄なら通す', () => {
    for (const v of [undefined, null, '', '   ']) {
      expect(checkWriteField(v, ID), String(v)).toBe('missing');
      expect(checkWriteField(v, OPTIONAL_TEXT), String(v)).toBeNull();
    }
  });

  it('★ 文字列でない物は任意の欄でも断る (落として送らない)', () => {
    for (const v of [99, {}, [], true]) {
      expect(checkWriteField(v, OPTIONAL_TEXT), JSON.stringify(v)).toBe('not-string');
    }
  });

  it('★ 天井ちょうどは通り、1 文字超で断る (境目の両側)', () => {
    expect(checkWriteField('a'.repeat(MAX_WRITE_ID_CHARS), ID)).toBeNull();
    expect(checkWriteField('a'.repeat(MAX_WRITE_ID_CHARS + 1), ID)).toBe('too-long');
    expect(checkWriteField('a'.repeat(MAX_WRITE_TEXT_CHARS), TEXT)).toBeNull();
    expect(checkWriteField('a'.repeat(MAX_WRITE_TEXT_CHARS + 1), TEXT)).toBe('too-long');
  });

  it('★ 1 行の欄は改行を断り、本文は改行とタブを許す', () => {
    expect(checkWriteField('a\nb', ID)).toBe('control-chars');
    expect(checkWriteField('a\rb', ID)).toBe('control-chars');
    expect(checkWriteField('a\nb\tc\r\n', TEXT)).toBeNull();
  });

  it('★ NUL とその他の C0 制御文字は本文でも断る', () => {
    expect(checkWriteField('a' + String.fromCharCode(0) + 'b', TEXT)).toBe('control-chars');
    expect(checkWriteField('a' + String.fromCharCode(27) + '[31m', TEXT)).toBe('control-chars');
    expect(checkWriteField('a' + String.fromCharCode(0) + 'b', ID)).toBe('control-chars');
  });
});

describe('payload をまとめて判定する', () => {
  it('★ 最初の問題を欄の名前つきで返し、全部通れば null', () => {
    expect(checkWriteFields({ channel: '#g', text: 'やあ' }, SLACK_MESSAGE_FIELDS)).toBeNull();
    const bad = checkWriteFields({ channel: '#g' }, SLACK_MESSAGE_FIELDS);
    expect(bad?.field).toBe('text');
    expect(bad?.problem).toBe('missing');
  });

  it('★ 辞書でない payload は最初の必須欄が missing', () => {
    for (const p of [undefined, null, 'x', 42]) {
      const bad = checkWriteFields(p, GITHUB_ISSUE_FIELDS);
      expect(bad?.field, String(p)).toBe('owner');
      expect(bad?.problem, String(p)).toBe('missing');
    }
  });

  it('★ 台帳の必須欄が導ける (音声の台帳はこれを読む)', () => {
    expect(requiredWriteFields(SLACK_MESSAGE_FIELDS)).toEqual(['channel', 'text']);
    expect(requiredWriteFields(GITHUB_ISSUE_FIELDS)).toEqual(['owner', 'repo', 'title']);
    expect(requiredWriteFields(CALENDAR_EVENT_FIELDS)).toEqual(['summary', 'start', 'end']);
    // 対照: 任意の欄は入らない。
    expect(requiredWriteFields(GITHUB_ISSUE_FIELDS)).not.toContain('body');
  });
});

describe('GitHub のラベル', () => {
  it('★ 無ければ通し、配列でなければ断り、件数と 1 件の長さに天井', () => {
    expect(checkWriteLabels(undefined)).toBeNull();
    expect(checkWriteLabels(['bug', 'ui'])).toBeNull();
    expect(checkWriteLabels('bug')).toBe('not-string');
    expect(checkWriteLabels(['bug', 3])).toBe('not-string');
    expect(checkWriteLabels(Array.from({ length: MAX_WRITE_LABELS }, () => 'x'))).toBeNull();
    expect(checkWriteLabels(Array.from({ length: MAX_WRITE_LABELS + 1 }, () => 'x'))).toBe('too-long');
    expect(checkWriteLabels(['a'.repeat(MAX_WRITE_LABEL_CHARS + 1)])).toBe('too-long');
    expect(checkWriteLabels([''])).toBe('missing');
  });
});

describe('断りの文面', () => {
  it('★ 欄の名前と理由を述べる (record-entry の文面と同じ形)', () => {
    expect(describeWriteFieldFailure({ field: 'text', problem: 'missing', rule: TEXT })).toBe('text は必須です');
    expect(describeWriteFieldFailure({ field: 'text', problem: 'too-long', rule: TEXT })).toBe(
      `text は ${MAX_WRITE_TEXT_CHARS} 文字以内で指定してください`,
    );
    expect(describeWriteFieldFailure({ field: 'body', problem: 'not-string', rule: OPTIONAL_TEXT })).toContain('文字列で');
    expect(describeWriteFieldFailure({ field: 'text', problem: 'control-chars', rule: TEXT })).toContain('制御文字');
  });
});

describe('5 か所が同じ台帳を読む (数を写していない)', () => {
  const LEDGERS = [
    { name: 'SLACK_MESSAGE_FIELDS', main: 'main/clients/slack.ts', page: 'renderer/pages/SlackPage.tsx', fields: ['channel', 'text'] },
    { name: 'GITHUB_ISSUE_FIELDS', main: 'main/clients/github.ts', page: 'renderer/pages/GithubPage.tsx', fields: ['owner', 'repo', 'title', 'body'] },
    { name: 'CALENDAR_EVENT_FIELDS', main: 'main/clients/calendar.ts', page: 'renderer/pages/CalendarPage.tsx', fields: ['summary'] },
  ] as const;

  it('★ main の handler が台帳で断る', () => {
    for (const l of LEDGERS) {
      expect(code(l.main), `${l.main} が台帳で断っていない`).toContain(`checkWriteFields(ctx.payload, ${l.name})`);
    }
    // labels は別の判定。
    expect(code('main/clients/github.ts')).toContain('checkWriteLabels(labels)');
  });

  it('★ ブラウザ版の双子が同じ台帳で断る', () => {
    const web = code('renderer/data/saasWriteWeb.ts');
    for (const l of LEDGERS) {
      expect(web, `双子が ${l.name} で断っていない`).toContain(`checkWriteFields(input, ${l.name})`);
    }
    expect(web).toContain('checkWriteLabels(input.labels)');
  });

  it('★ 画面の maxLength は台帳の値を読む (数を写さない)', () => {
    for (const l of LEDGERS) {
      const page = code(l.page);
      for (const f of l.fields) {
        expect(page, `${l.page} の ${f} に maxLength が無い`).toContain(`maxLength={${l.name}.${f}!.max}`);
      }
      // 数の写しが無い (20000 / 256 / 200 を字面で持たない)。
      expect(page, `${l.page} が数を写している`).not.toMatch(/maxLength=\{\d+\}/);
    }
  });

  it('★ 音声の台帳の必須欄は書く欄の台帳から導かれている', () => {
    const byKey = new Map(VOICE_WRITE_REQUIREMENTS.map((r) => [`${r.serviceId}/${r.action}`, r.required]));
    expect(byKey.get('slack/send-message')).toEqual(requiredWriteFields(SLACK_MESSAGE_FIELDS));
    expect(byKey.get('github/create-issue')).toEqual(requiredWriteFields(GITHUB_ISSUE_FIELDS));
    expect(byKey.get('calendar/create-event')).toEqual(requiredWriteFields(CALENDAR_EVENT_FIELDS));
    // 手書きの写しが残っていない。
    const src = code('shared/voiceWriteRequirements.ts');
    expect(src).not.toContain("required: ['channel', 'text']");
    expect(src).not.toContain("required: ['owner', 'repo', 'title']");
  });

  it('★ 安全上限は parameters.ts の台帳に載っていない (設定ではない)', () => {
    const params = read('shared/parameters.ts');
    for (const name of ['MAX_WRITE_TEXT_CHARS', 'MAX_WRITE_TITLE_CHARS', 'MAX_WRITE_ID_CHARS', 'writeFieldLimits']) {
      expect(params, `${name} が設定の台帳に載っている`).not.toContain(name);
    }
    expect(MAX_WRITE_TITLE_CHARS).toBeLessThan(MAX_WRITE_TEXT_CHARS);
  });
});
