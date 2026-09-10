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
import { readOriginalDir, readOriginalSource } from './originalSource';
import path from 'node:path';
import {
  ATLASSIAN_ISSUE_FIELDS,
  CALENDAR_EVENT_FIELDS,
  CANVA_FOLDER_FIELDS,
  CLOUDFLARE_DNS_FIELDS,
  CLOUDFLARE_DNS_TYPES,
  CLOUDFLARE_PURGE_FIELDS,
  DRIVE_FOLDER_FIELDS,
  GITHUB_ISSUE_FIELDS,
  GITHUB_LABELS,
  GMAIL_DRAFT_FIELDS,
  MAX_WRITE_ID_CHARS,
  MAX_WRITE_LABELS,
  MAX_WRITE_LABEL_CHARS,
  MAX_WRITE_LINE_CHARS,
  MAX_WRITE_TEXT_CHARS,
  MAX_WRITE_TITLE_CHARS,
  MAX_WRITE_URLS,
  MS365_EVENT_FIELDS,
  MS365_MAIL_FIELDS,
  NOTION_PAGE_FIELDS,
  SLACK_MESSAGE_FIELDS,
  WORDPRESS_POST_FIELDS,
  WORDPRESS_POST_STATUSES,
  checkWriteField,
  checkWriteFields,
  checkWriteFlag,
  checkWriteInteger,
  checkWriteLabels,
  checkWriteList,
  checkWriteRule,
  describeWriteFieldFailure,
  requiredWriteFields,
  type WriteRule,
} from '../writeFieldLimits';
import { VOICE_WRITE_REQUIREMENTS } from '../voiceWriteRequirements';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => readOriginalSource(path.join(SRC, rel));
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
    expect(checkWriteLabels(Array.from({ length: MAX_WRITE_LABELS + 1 }, () => 'x'))).toBe('too-many');
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

describe('文字列でない欄と一覧のある欄 (パス 111)', () => {
  const INT = { kind: 'integer', required: false, min: 1 } as const;
  const FLAG = { kind: 'flag', required: false } as const;
  const LIST = { kind: 'list', required: false, maxItems: 2, item: { required: true, max: 5, multiline: false } } as const;
  const CHOICE = { required: false, max: MAX_WRITE_ID_CHARS, multiline: false, choices: ['a', 'b'] } as const;

  it('★ 一覧のある欄は、一覧に無い値を断る (既定値にすり替えない)', () => {
    expect(checkWriteField('a', CHOICE)).toBeNull();
    expect(checkWriteField('bogus', CHOICE)).toBe('not-allowed');
    expect(checkWriteField('', CHOICE)).toBeNull(); // 任意の欄の空文字は「無い」
    expect(checkWriteField(undefined, { ...CHOICE, required: true })).toBe('missing');
    // 実物: 投稿の status と DNS の type は画面の選択肢と同じ一覧を持つ。
    expect(WORDPRESS_POST_FIELDS.status.choices).toEqual(WORDPRESS_POST_STATUSES);
    expect(CLOUDFLARE_DNS_FIELDS.type.choices).toEqual(CLOUDFLARE_DNS_TYPES);
    expect(checkWriteField('publish', WORDPRESS_POST_FIELDS.status)).toBeNull();
    expect(checkWriteField('deleted', WORDPRESS_POST_FIELDS.status)).toBe('not-allowed');
    expect(checkWriteField('SRV', CLOUDFLARE_DNS_FIELDS.type)).toBe('not-allowed');
  });

  it('★ 整数の欄: 無くてよければ通し、整数でない・下限未満は断る (1 にすり替えない)', () => {
    expect(checkWriteInteger(undefined, INT)).toBeNull();
    expect(checkWriteInteger(1, INT)).toBeNull();
    expect(checkWriteInteger(300, INT)).toBeNull();
    for (const v of ['x', '300', 1.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, true]) {
      expect(checkWriteInteger(v, INT), String(v)).toBe('not-integer');
    }
    expect(checkWriteInteger(undefined, { ...INT, required: true })).toBe('missing');
  });

  it('★ 真偽値の欄: true / false だけを通す (1 や \'true\' を false にすり替えない)', () => {
    expect(checkWriteFlag(undefined, FLAG)).toBeNull();
    expect(checkWriteFlag(true, FLAG)).toBeNull();
    expect(checkWriteFlag(false, FLAG)).toBeNull();
    for (const v of [1, 0, 'true', 'false', {}]) {
      expect(checkWriteFlag(v, FLAG), JSON.stringify(v)).toBe('not-boolean');
    }
    expect(checkWriteFlag(null, { ...FLAG, required: true })).toBe('missing');
  });

  it('★ 配列の欄: 配列でなければ断り、件数に天井、1 件でも壊れていれば全体を断る (間引かない)', () => {
    expect(checkWriteList(undefined, LIST)).toBeNull();
    expect(checkWriteList(['ab', 'cd'], LIST)).toBeNull();
    expect(checkWriteList('ab', LIST)).toBe('not-string');
    expect(checkWriteList(['a', 'b', 'c'], LIST)).toBe('too-many');
    expect(checkWriteList(['ab', 5], LIST)).toBe('not-string');
    expect(checkWriteList(['ab', 'toolong'], LIST)).toBe('too-long');
    expect(checkWriteList(['ab', ''], LIST)).toBe('missing');
    expect(checkWriteList(['a\nb'], LIST)).toBe('control-chars');
    // 実物: パージする URL は 1 行の長い欄 × 件数の天井。
    expect(checkWriteList(Array.from({ length: MAX_WRITE_URLS }, () => 'https://x/y'), CLOUDFLARE_PURGE_FIELDS.files)).toBeNull();
    expect(checkWriteList(Array.from({ length: MAX_WRITE_URLS + 1 }, () => 'https://x/y'), CLOUDFLARE_PURGE_FIELDS.files)).toBe('too-many');
    expect(checkWriteList(['a'.repeat(MAX_WRITE_LINE_CHARS + 1)], CLOUDFLARE_PURGE_FIELDS.files)).toBe('too-long');
  });

  it('★ 振り分け: 種類ごとの判定に届く (文字列の規則には kind が無い)', () => {
    expect(checkWriteRule('x', INT)).toBe('not-integer');
    expect(checkWriteRule('x', FLAG)).toBe('not-boolean');
    expect(checkWriteRule('x', LIST)).toBe('not-string');
    expect(checkWriteRule(5, { required: true, max: 3, multiline: false })).toBe('not-string');
    // まとめて判定すると、最初の問題が欄の名前と規則つきで返る。
    const bad = checkWriteFields({ zoneId: 'z', type: 'A', name: 'n', content: 'c', ttl: 'x' }, CLOUDFLARE_DNS_FIELDS);
    expect(bad).toEqual({ field: 'ttl', problem: 'not-integer', rule: CLOUDFLARE_DNS_FIELDS.ttl });
    expect(checkWriteFields({ zoneId: 'z', type: 'A', name: 'n', content: 'c', ttl: 300, proxied: true }, CLOUDFLARE_DNS_FIELDS)).toBeNull();
    expect(checkWriteFields({ zoneId: 'z', files: ['https://x/y'] }, CLOUDFLARE_PURGE_FIELDS)).toBeNull();
    expect(checkWriteFields({ zoneId: 'z', purgeEverything: 1 }, CLOUDFLARE_PURGE_FIELDS)?.problem).toBe('not-boolean');
  });

  it('★ 断りの文面: 一覧・整数・真偽値・件数も欄の名前と理由を述べる', () => {
    expect(describeWriteFieldFailure({ field: 'status', problem: 'not-allowed', rule: WORDPRESS_POST_FIELDS.status })).toBe(
      'status は draft / publish / pending / private のいずれかで指定してください',
    );
    expect(describeWriteFieldFailure({ field: 'ttl', problem: 'not-integer', rule: INT })).toBe('ttl は 1 以上の整数で指定してください');
    expect(describeWriteFieldFailure({ field: 'proxied', problem: 'not-boolean', rule: FLAG })).toBe('proxied は true / false で指定してください');
    expect(describeWriteFieldFailure({ field: 'files', problem: 'too-many', rule: LIST })).toBe('files は 2 件以内で指定してください');
    // 配列の 1 件が長すぎるときは 1 件の天井を言う (件数の天井ではない)。
    expect(describeWriteFieldFailure({ field: 'files', problem: 'too-long', rule: LIST })).toBe('files は 5 文字以内で指定してください');
    expect(describeWriteFieldFailure({ field: 'labels', problem: 'too-many', rule: GITHUB_LABELS })).toBe(`labels は ${MAX_WRITE_LABELS} 件以内で指定してください`);
    // 規則の種類が合わないときは数を作らない (嘘の数より、数の無い文)。
    expect(describeWriteFieldFailure({ field: 'x', problem: 'too-long', rule: INT })).toBe('x が長すぎます');
    expect(describeWriteFieldFailure({ field: 'x', problem: 'too-many', rule: INT })).toBe('x が多すぎます');
    expect(describeWriteFieldFailure({ field: 'x', problem: 'not-integer', rule: FLAG })).toBe('x は整数で指定してください');
    expect(describeWriteFieldFailure({ field: 'x', problem: 'not-allowed', rule: INT })).toBe('x は  のいずれかで指定してください');
  });

  it('★ 新しい台帳の必須欄が導ける (音声の台帳が読む形と同じ)', () => {
    expect(requiredWriteFields(GMAIL_DRAFT_FIELDS)).toEqual(['to', 'subject']);
    expect(requiredWriteFields(DRIVE_FOLDER_FIELDS)).toEqual(['name']);
    expect(requiredWriteFields(CANVA_FOLDER_FIELDS)).toEqual(['name']);
    expect(requiredWriteFields(NOTION_PAGE_FIELDS)).toEqual(['parentPageId', 'title']);
    expect(requiredWriteFields(ATLASSIAN_ISSUE_FIELDS)).toEqual(['projectKey', 'summary']);
    expect(requiredWriteFields(WORDPRESS_POST_FIELDS)).toEqual(['siteId', 'title']);
    expect(requiredWriteFields(MS365_MAIL_FIELDS)).toEqual(['to', 'subject']);
    expect(requiredWriteFields(MS365_EVENT_FIELDS)).toEqual(['subject', 'start', 'end']);
    expect(requiredWriteFields(CLOUDFLARE_DNS_FIELDS)).toEqual(['zoneId', 'type', 'name', 'content']);
    expect(requiredWriteFields(CLOUDFLARE_PURGE_FIELDS)).toEqual(['zoneId']);
    // 1 行の長い欄 (宛先・DNS の content) は改行を断り、本文は許す。
    const LINE: WriteRule = GMAIL_DRAFT_FIELDS.to;
    expect(checkWriteRule('a@b.example\r\nBcc: x@y.example', LINE)).toBe('control-chars');
    expect(checkWriteRule('a'.repeat(MAX_WRITE_LINE_CHARS), LINE)).toBeNull();
    expect(checkWriteRule('a'.repeat(MAX_WRITE_LINE_CHARS + 1), LINE)).toBe('too-long');
    expect(MAX_WRITE_TITLE_CHARS).toBeLessThan(MAX_WRITE_LINE_CHARS);
    expect(MAX_WRITE_LINE_CHARS).toBeLessThan(MAX_WRITE_TEXT_CHARS);
  });
});

describe('5 か所が同じ台帳を読む (数を写していない)', () => {
  // `web: false` はブラウザ版の双子が無い操作 (Microsoft 365 は Electron 版だけ)。
  const LEDGERS = [
    { name: 'SLACK_MESSAGE_FIELDS', main: 'main/clients/slack.ts', page: 'renderer/pages/SlackPage.tsx', fields: ['channel', 'text'], web: true },
    { name: 'GITHUB_ISSUE_FIELDS', main: 'main/clients/github.ts', page: 'renderer/pages/GithubPage.tsx', fields: ['owner', 'repo', 'title', 'body'], web: true },
    { name: 'CALENDAR_EVENT_FIELDS', main: 'main/clients/calendar.ts', page: 'renderer/pages/CalendarPage.tsx', fields: ['summary'], web: true },
    // パス 111 で載せた 9 家系。
    { name: 'GMAIL_DRAFT_FIELDS', main: 'main/clients/gmail.ts', page: 'renderer/pages/GmailPage.tsx', fields: ['to', 'subject', 'body'], web: true },
    { name: 'DRIVE_FOLDER_FIELDS', main: 'main/clients/drive.ts', page: 'renderer/pages/DrivePage.tsx', fields: ['name', 'parentId'], web: true },
    { name: 'CANVA_FOLDER_FIELDS', main: 'main/clients/canva.ts', page: 'renderer/pages/CanvaPage.tsx', fields: ['name', 'parentFolderId'], web: true },
    { name: 'NOTION_PAGE_FIELDS', main: 'main/clients/notion.ts', page: 'renderer/pages/NotionPage.tsx', fields: ['parentPageId', 'title', 'body'], web: true },
    { name: 'ATLASSIAN_ISSUE_FIELDS', main: 'main/clients/atlassian.ts', page: 'renderer/pages/AtlassianPage.tsx', fields: ['projectKey', 'summary', 'description', 'issueType'], web: true },
    { name: 'WORDPRESS_POST_FIELDS', main: 'main/clients/wordpress.ts', page: 'renderer/pages/WordPressPage.tsx', fields: ['siteId', 'title', 'content'], web: true },
    { name: 'MS365_MAIL_FIELDS', main: 'main/clients/microsoft-365.ts', page: 'renderer/pages/Microsoft365Page.tsx', fields: ['to', 'subject', 'body'], web: false },
    { name: 'MS365_EVENT_FIELDS', main: 'main/clients/microsoft-365.ts', page: 'renderer/pages/Microsoft365Page.tsx', fields: ['subject', 'location'], web: false },
    { name: 'CLOUDFLARE_DNS_FIELDS', main: 'main/clients/cloudflare.ts', page: 'renderer/pages/CloudflarePage.tsx', fields: ['name', 'content'], web: true },
    { name: 'CLOUDFLARE_PURGE_FIELDS', main: 'main/clients/cloudflare.ts', page: 'renderer/pages/CloudflarePage.tsx', fields: [], web: true },
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
      if (!l.web) {
        // 双子が無いことも留める —— 出来たら台帳を読む側へ回す。
        expect(web, `${l.name} の双子が出来ている (web: true にして台帳を読ませる)`).not.toContain(l.name);
        continue;
      }
      expect(web, `双子が ${l.name} で断っていない`).toContain(`checkWriteFields(input, ${l.name})`);
    }
    expect(web).toContain('checkWriteLabels(input.labels)');
  });

  it('★ 画面の maxLength は台帳の値を読む (数を写さない)', () => {
    for (const l of LEDGERS) {
      const page = code(l.page);
      for (const f of l.fields) {
        // 古い台帳は `Record<string, …>` 型なので `!` が要り、新しい台帳は欄ごとに型が付くので要らない。
        const forms = [`maxLength={${l.name}.${f}!.max}`, `maxLength={${l.name}.${f}.max}`];
        expect(forms.some((s) => page.includes(s)), `${l.page} の ${f} に maxLength が無い`).toBe(true);
      }
      // 数の写しが無い (20000 / 256 / 200 を字面で持たない)。
      expect(page, `${l.page} が数を写している`).not.toMatch(/maxLength=\{\d+\}/);
    }
  });

  /**
   * **母集団は実装から導く。** `main/clients/*.ts` の `ACTIONS` に載る handler のうち、
   * `method: 'POST'` で外へ投げる物はすべて台帳を読む —— 読まない物は理由つきで
   * ここに載る (AI への送信は自前の入口を持つ)。手で書いた一覧は手で書いた分しか
   * 見つけない (パス 107 / 110 で 3 → 12 に動いた)。
   */
  it('★ POST する handler はすべて台帳を読む (母集団は ACTIONS から導く)', () => {
    const OWN_ENTRANCE: Record<string, string> = {
      'emotions/analyze-text': 'AI への入力。MAX_ANALYZE_TEXT_CHARS が天井',
      'skills/run-skill': 'AI への入力。name は isSafeSkillName、prompt の天井は未収載 (残作業)',
      'security/scan-url': 'URL 1 つ。validateScanUrl (scanTarget.ts) が形と長さを見る',
    };
    const dir = path.join(SRC, 'main/clients');
    const posting: string[] = [];
    const reading: string[] = [];
    for (const f of readOriginalDir(dir).filter((n) => n.endsWith('.ts') && n !== 'index.ts' && n !== 'types.ts')) {
      const src = read(`main/clients/${f}`);
      const m = /export const ACTIONS: ActionMap = \{([\s\S]*?)\n\};/.exec(src);
      if (m === null) continue;
      for (const [, action, fn] of m[1]!.matchAll(/'([\w-]+)':\s*(\w+)/g)) {
        const at = src.search(new RegExp(`(async )?function ${fn}\\(`));
        expect(at, `${f}: ${fn} が見つからない`).toBeGreaterThan(-1);
        const open = src.indexOf('{\n', at);
        let depth = 0;
        let end = open;
        for (; end < src.length; end++) {
          if (src[end] === '{') depth++;
          else if (src[end] === '}' && --depth === 0) break;
        }
        const body = src.slice(open, end);
        const key = `${f.replace(/\.ts$/, '')}/${action}`;
        if (/method:\s*'POST'/.test(body)) posting.push(key);
        if (/checkWriteFields\(ctx\.payload/.test(body)) reading.push(key);
      }
    }
    // 規則が実物に当たる (空の走査になっていない)。
    expect(posting.length).toBeGreaterThanOrEqual(16);
    expect(reading).toContain('slack/send-message');
    const unguarded = posting.filter((k) => !reading.includes(k) && !(k in OWN_ENTRANCE));
    expect(unguarded, '台帳を読まずに POST する handler がある').toEqual([]);
    // 対照: 理由つきの除外が古くなっていない (台帳を読み始めたら除外を消す・POST を止めたら消す)。
    for (const k of Object.keys(OWN_ENTRANCE)) {
      expect(posting, `${k} は POST していない (除外が古い)`).toContain(k);
      expect(reading, `${k} は台帳を読んでいる (除外が古い)`).not.toContain(k);
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
