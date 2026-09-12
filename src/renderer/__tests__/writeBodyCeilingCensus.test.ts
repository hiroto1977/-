/**
 * **外へ書く欄の母集団を、台帳から導いて数える** (2026-09-12 · パス 172 → パス 183)。
 *
 * ## 数える物
 *
 * `writeFieldLimits.ts` が `id(` / `title(` / `line(` / `text(` から作る**文字列の欄
 * すべて**が母集団である。手で並べないのは、送り先が増えたときに**足した人が
 * 気付かない**ため —— パス 107 で母集団を手書きして 3 画面落とした形。
 *
 * パス 172 はここを `text(` (改行を許す 20,000 字) だけに絞っていた。
 * **絞った理由はどこにも書かれておらず**、外に置かれた 24 欄のうち
 * `line(` 4,096 の 3 欄 (Gmail / Microsoft 365 の宛先・Cloudflare の DNS `content`) は
 * **人が貼る欄**だった —— 貼った宛先の後ろが黙って落ちても画面は「作成しました」と言う。
 * 経緯と実測は `shared/__tests__/writeBodyFields.ts` の冒頭。
 *
 * ## 各欄に求める形 (パス 168 の判断を全欄へ当てる)
 *
 * | | 求める | なぜ |
 * | --- | --- | --- |
 * | `maxLength` | **持たない** | ブラウザが貼り付けを黙って切り、断りに永久に届かない |
 * | `charsOverCeiling(` | 台帳の天井で読む | 超過を数える所は 1 つ (`shared/inputCeiling.ts`) |
 * | `<CeilingNotice` | 欄ごとに描く | 文面を画面ごとに書き写さない (パス 101) |
 * | `disabled` | 超過で止まる | 断ってから押せるなら断っていない |
 *
 * **`maxLength` を持たないことと断ることは、両方要る** —— 片方だけでは
 * 「切られる」か「黙って長い物を送る」のどちらかになる。台帳は双方向に見る。
 *
 * ## 画面に欄が無い行も数える
 *
 * `CALENDAR_EVENT_FIELDS.description` は台帳に在るが、**画面に欄が無い**
 * (音声・チャット経由でしか入らない)。無い物に `maxLength` を求めても
 * `CeilingNotice` を求めても意味が無いので、**理由つきで台帳に載せ、
 * 「本当に欄が無い」ことを確かめる** (載せたまま欄が増えたら鳴る)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { ledgerFieldsIn } from '../../shared/__tests__/writeBodyFields';

const SRC = path.resolve(__dirname, '../..');
const LEDGER = path.join(SRC, 'shared/writeFieldLimits.ts');

/*
 * 走査は `shared/__tests__/writeBodyFields.ts` が 1 つ持つ ——
 * `writeFieldLimits.test.ts` (欄ごとにどの形を求めるか) も同じ物を読む。
 * 写すと片方だけ直って食い違う。
 */
const ledgerFields = ledgerFieldsIn;

/** 台帳の欄 → それを描く画面 (`src/renderer` からの相対)。 */
const SCREEN_OF: Readonly<Record<string, string>> = {
  'SLACK_MESSAGE_FIELDS.channel': 'pages/SlackPage.tsx',
  'SLACK_MESSAGE_FIELDS.text': 'pages/SlackPage.tsx',
  'GITHUB_ISSUE_FIELDS.owner': 'pages/GithubPage.tsx',
  'GITHUB_ISSUE_FIELDS.repo': 'pages/GithubPage.tsx',
  'GITHUB_ISSUE_FIELDS.title': 'pages/GithubPage.tsx',
  'GITHUB_ISSUE_FIELDS.body': 'pages/GithubPage.tsx',
  'CALENDAR_EVENT_FIELDS.summary': 'pages/CalendarPage.tsx',
  'GMAIL_DRAFT_FIELDS.to': 'pages/GmailPage.tsx',
  'GMAIL_DRAFT_FIELDS.subject': 'pages/GmailPage.tsx',
  'GMAIL_DRAFT_FIELDS.body': 'pages/GmailPage.tsx',
  'DRIVE_FOLDER_FIELDS.name': 'pages/DrivePage.tsx',
  'DRIVE_FOLDER_FIELDS.parentId': 'pages/DrivePage.tsx',
  'CANVA_FOLDER_FIELDS.name': 'pages/CanvaPage.tsx',
  'CANVA_FOLDER_FIELDS.parentFolderId': 'pages/CanvaPage.tsx',
  'NOTION_PAGE_FIELDS.parentPageId': 'pages/NotionPage.tsx',
  'NOTION_PAGE_FIELDS.title': 'pages/NotionPage.tsx',
  'NOTION_PAGE_FIELDS.body': 'pages/NotionPage.tsx',
  'ATLASSIAN_ISSUE_FIELDS.projectKey': 'pages/AtlassianPage.tsx',
  'ATLASSIAN_ISSUE_FIELDS.issueType': 'pages/AtlassianPage.tsx',
  'ATLASSIAN_ISSUE_FIELDS.summary': 'pages/AtlassianPage.tsx',
  'ATLASSIAN_ISSUE_FIELDS.description': 'pages/AtlassianPage.tsx',
  'WORDPRESS_POST_FIELDS.siteId': 'pages/WordPressPage.tsx',
  'WORDPRESS_POST_FIELDS.title': 'pages/WordPressPage.tsx',
  'WORDPRESS_POST_FIELDS.content': 'pages/WordPressPage.tsx',
  'MS365_MAIL_FIELDS.to': 'pages/Microsoft365Page.tsx',
  'MS365_MAIL_FIELDS.subject': 'pages/Microsoft365Page.tsx',
  'MS365_MAIL_FIELDS.body': 'pages/Microsoft365Page.tsx',
  'MS365_EVENT_FIELDS.subject': 'pages/Microsoft365Page.tsx',
  'MS365_EVENT_FIELDS.location': 'pages/Microsoft365Page.tsx',
  'CLOUDFLARE_DNS_FIELDS.name': 'pages/CloudflarePage.tsx',
  'CLOUDFLARE_DNS_FIELDS.content': 'pages/CloudflarePage.tsx',
};

/** 画面に欄が無い台帳の欄と、その理由 + 欄が無いことの確かめ方。 */
const NO_FIELD_ON_SCREEN: Readonly<Record<string, { readonly why: string; readonly page: string; readonly absent: string }>> = {
  'CALENDAR_EVENT_FIELDS.description': {
    why: 'カレンダーの画面は 件名 / 開始 / 終了 だけを持ち、説明の欄を出していない (説明は音声・チャット経由の payload でしか入らない)。無い欄に maxLength も断りも求められない',
    page: 'pages/CalendarPage.tsx',
    absent: 'value={description}',
  },
  'CALENDAR_EVENT_FIELDS.location': {
    why: '同じ画面に場所の欄も無い (Microsoft 365 の予定には在るので、台帳の欄そのものは死んでいない)',
    page: 'pages/CalendarPage.tsx',
    absent: 'value={location}',
  },
  'CALENDAR_EVENT_FIELDS.timeZone': {
    why: 'タイムゾーンは利用者が打つのではなく、画面が端末の設定から決めて payload に載せる (欄を出していない)',
    page: 'pages/CalendarPage.tsx',
    absent: 'value={timeZone}',
  },
};

/**
 * **打てる文字が制御そのもので決まっている欄** (2026-09-12 · パス 183)。
 *
 * `datetime-local` と `<select>` は、`maxLength` が効かない代わりに
 * **天井へ届く値を作れない** —— 前者はブラウザが `YYYY-MM-DDTHH:mm` (16 字) か
 * 空文字しか返さず、後者は取得済みの選択肢の中からしか選べない。
 * 貼り付けで切られる形が原理的に無いので、断りも要らない。
 *
 * ただし**理由なしで母集団から外さない** —— 行には「その制御で描いている」ことの
 * 確かめ方 (`control`) を持たせ、`<input type="text">` に変わったら鳴らす。
 */
const CONSTRAINED_CONTROL: Readonly<Record<string, { readonly why: string; readonly page: string; readonly control: string }>> = {
  'CALENDAR_EVENT_FIELDS.start': {
    why: 'datetime-local。ブラウザは YYYY-MM-DDTHH:mm か空文字しか返さないので天井 (200) に届かない',
    page: 'pages/CalendarPage.tsx',
    control: 'type="datetime-local"',
  },
  'CALENDAR_EVENT_FIELDS.end': {
    why: 'datetime-local (開始と同じ)',
    page: 'pages/CalendarPage.tsx',
    control: 'type="datetime-local"',
  },
  'MS365_EVENT_FIELDS.start': {
    why: 'datetime-local (Graph へ送る前に toGraphIso が整える)',
    page: 'pages/Microsoft365Page.tsx',
    control: 'type="datetime-local"',
  },
  'MS365_EVENT_FIELDS.end': {
    why: 'datetime-local (開始と同じ)',
    page: 'pages/Microsoft365Page.tsx',
    control: 'type="datetime-local"',
  },
  'CLOUDFLARE_DNS_FIELDS.zoneId': {
    why: '取得済みゾーンの <select>。利用者は API が返した id の中からしか選べない (打てない・貼れない)',
    page: 'pages/CloudflarePage.tsx',
    control: 'value={dnsZone}',
  },
  'CLOUDFLARE_PURGE_FIELDS.zoneId': {
    why: '同じ <select> (パージ側)',
    page: 'pages/CloudflarePage.tsx',
    control: 'value={purgeZone}',
  },
};

const read = (rel: string): string => readOriginalSource(path.join(SRC, 'renderer', rel));

describe('外へ書く欄は、切らずに断る (母集団は台帳から導く · パス 172 → 183)', () => {
  const fields = ledgerFields(readOriginalSource(LEDGER));
  const keys = fields.map((f) => `${f.group}.${f.field}`);

  it('★ 走査が実物に当たる (台帳の欄が導けている)', () => {
    // 実測 (2026-09-12): 32 欄 (画面に在る 31 + カレンダーの説明)。
    expect(fields.length, '台帳の欄が見つからない (走査が死んでいる)').toBeGreaterThanOrEqual(32);
    // 4 つの作り手すべてが母集団に居る —— `text(` だけに戻っていない印。
    expect(new Set(fields.map((f) => f.kind))).toEqual(new Set(['id', 'title', 'line', 'text']));
    expect(keys).toContain('NOTION_PAGE_FIELDS.body');
    expect(keys).toContain('GMAIL_DRAFT_FIELDS.to'); // line( 4096 = 貼る欄
    expect(keys).toContain('DRIVE_FOLDER_FIELDS.parentId'); // id( 200
    expect(keys).toContain('CALENDAR_EVENT_FIELDS.description');
  });

  it('★ どの欄も 3 つの台帳のどれかに在る (黙って母集団から落ちない)', () => {
    const orphans = keys.filter(
      (k) => !(k in SCREEN_OF) && !(k in NO_FIELD_ON_SCREEN) && !(k in CONSTRAINED_CONTROL),
    );
    expect(orphans, '台帳に無い欄 — 画面を配線するか、外す理由を書く').toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (消えた欄が残っていない)', () => {
    const stale = [
      ...Object.keys(SCREEN_OF),
      ...Object.keys(NO_FIELD_ON_SCREEN),
      ...Object.keys(CONSTRAINED_CONTROL),
    ].filter((k) => !keys.includes(k));
    expect(stale, '台帳の古い行').toEqual([]);
  });

  it('★ 「制御で決まる」台帳の行は、本当にその制御で描いている', () => {
    for (const [key, row] of Object.entries(CONSTRAINED_CONTROL)) {
      expect(read(row.page), `${key}: ${row.page} が ${row.control} で描いていない`).toContain(row.control);
      expect(row.why.length, `${key}: 理由が無い`).toBeGreaterThan(10);
    }
  });

  it('★ どの欄も `maxLength` を持たない (ブラウザが黙って切る形を残さない)', () => {
    const cut: string[] = [];
    for (const [key, rel] of Object.entries(SCREEN_OF)) {
      const src = read(rel);
      // `maxLength={<この欄>.max}` が在れば、貼り付けはブラウザが切る。
      const re = new RegExp(`maxLength=\\{\\s*${key.replace('.', '(?:!)?\\.')}(?:!)?\\.max`);
      if (re.test(src)) cut.push(`${rel} (${key})`);
    }
    expect(cut, '欄が maxLength を持っている — 貼り付けが黙って切られる').toEqual([]);
  });

  it('★ どの欄も超過を数え、共有の断りを欄ごとに描く', () => {
    const missing: string[] = [];
    for (const [key, rel] of Object.entries(SCREEN_OF)) {
      const src = read(rel);
      if (!/\bcharsOverCeiling\s*\(/.test(src)) missing.push(`${rel}: charsOverCeiling を読んでいない`);
      if (!/<CeilingNotice\b/.test(src)) missing.push(`${rel}: CeilingNotice を描いていない`);
      // 天井は台帳から読む (数を写さない) —— この欄の `.max` が画面に在ること。
      const re = new RegExp(`${key.replace('.', '(?:!)?\\.')}(?:!)?\\.max`);
      if (!re.test(src)) missing.push(`${rel}: ${key} の天井を台帳から読んでいない`);
    }
    expect(missing, '断る形になっていない画面').toEqual([]);
  });

  it('★ 画面ごとの断りの数が、その画面の欄の数と合う', () => {
    // 「1 欄だけ断って残りは黙る」を許さない —— 欄の数だけ `<CeilingNotice` が在ること。
    const perPage = new Map<string, number>();
    for (const rel of Object.values(SCREEN_OF)) perPage.set(rel, (perPage.get(rel) ?? 0) + 1);
    const short: string[] = [];
    for (const [rel, n] of perPage) {
      const drawn = [...read(rel).matchAll(/<CeilingNotice\b/g)].length;
      if (drawn < n) short.push(`${rel}: 欄 ${n} 件に対し断り ${drawn} 件`);
    }
    expect(short, '断りが欄の数に足りない画面').toEqual([]);
  });

  it('★ 送るボタンは超過で止まる (over を disabled に入れている)', () => {
    const open: string[] = [];
    for (const rel of new Set(Object.values(SCREEN_OF))) {
      const src = read(rel);
      // `const xOver = charsOverCeiling(…)` の変数名を拾い、disabled に在ることを見る。
      const names = [...src.matchAll(/const (\w+Over)\s*=\s*charsOverCeiling\s*\(/g)].map((m) => m[1]!);
      if (names.length === 0) { open.push(`${rel}: 超過の変数が無い`); continue; }
      for (const n of names) {
        if (!new RegExp(`disabled=\\{[^}]*\\b${n}\\s*>\\s*0`).test(src)) {
          open.push(`${rel}: ${n} が disabled に入っていない`);
        }
      }
    }
    expect(open, '超えていても押せる画面').toEqual([]);
  });

  it('★ 「欄が無い」台帳の行は、本当に欄が無い', () => {
    for (const [key, row] of Object.entries(NO_FIELD_ON_SCREEN)) {
      const src = read(row.page);
      expect(src, `${key}: ${row.page} に欄が在る — 台帳から外して断りを配線する`).not.toContain(row.absent);
      expect(row.why.length, `${key}: 理由が無い`).toBeGreaterThan(20);
    }
  });

  it('★ 対照: 走査と規則が標本を取り違えない', () => {
    const sample = [
      'export const X_FIELDS = {',
      '  id: id(true),',
      '  subject: title(true),',
      '  to: line(true),',
      '  note: text(false),',
      '  status: choice(false, STATUSES),',
      '} satisfies Readonly<Record<string, WriteRule>>;',
    ].join('\n');
    // 4 つの作り手だけを拾い、`choice(` は拾わない。
    expect(ledgerFields(sample)).toEqual([
      { group: 'X_FIELDS', field: 'id', kind: 'id' },
      { group: 'X_FIELDS', field: 'subject', kind: 'title' },
      { group: 'X_FIELDS', field: 'to', kind: 'line' },
      { group: 'X_FIELDS', field: 'note', kind: 'text' },
    ]);
    // 整数・真偽・一覧は文字列の欄ではない。
    expect(ledgerFields('export const Y = {\n  n: integer(true, 0),\n  f: flag(false),\n  l: list(false, 3, line(true)),\n};')).toEqual([]);
  });
});
