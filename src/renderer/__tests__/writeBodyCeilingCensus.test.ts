/**
 * **外へ書く本文の欄の母集団を、台帳から導いて数える** (2026-09-12 · パス 172)。
 *
 * ## 数える物
 *
 * `writeFieldLimits.ts` で `text(` から作られた欄 = **改行を許す 20,000 字の欄**
 * (= 人が本文を貼る欄) が母集団である。手で並べないのは、送り先が増えたときに
 * **足した人が気付かない**ため —— パス 107 で母集団を手書きして 3 画面落とした形。
 *
 * ## 各欄に求める形 (パス 168 の判断をここへ当てる)
 *
 * | | 求める | なぜ |
 * | --- | --- | --- |
 * | `maxLength` | **持たない** | ブラウザが貼り付けを黙って切り、断りに永久に届かない |
 * | `charsOverCeiling(` | 台帳の天井で読む | 超過を数える所は 1 つ (`shared/inputCeiling.ts`) |
 * | `<CeilingNotice` | 描く | 文面を画面ごとに書き写さない (パス 101) |
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
import { bodyFieldsIn } from '../../shared/__tests__/writeBodyFields';

const SRC = path.resolve(__dirname, '../..');
const LEDGER = path.join(SRC, 'shared/writeFieldLimits.ts');

/*
 * 走査は `shared/__tests__/writeBodyFields.ts` が 1 つ持つ ——
 * `writeFieldLimits.test.ts` (欄ごとにどちらの形を求めるか) も同じ物を読む。
 * 写すと片方だけ直って食い違う。
 */
const bodyFields = bodyFieldsIn;

/** 本文の欄 → それを描く画面 (`src/renderer` からの相対)。 */
const SCREEN_OF: Readonly<Record<string, string>> = {
  'SLACK_MESSAGE_FIELDS.text': 'pages/SlackPage.tsx',
  'GITHUB_ISSUE_FIELDS.body': 'pages/GithubPage.tsx',
  'GMAIL_DRAFT_FIELDS.body': 'pages/GmailPage.tsx',
  'NOTION_PAGE_FIELDS.body': 'pages/NotionPage.tsx',
  'ATLASSIAN_ISSUE_FIELDS.description': 'pages/AtlassianPage.tsx',
  'WORDPRESS_POST_FIELDS.content': 'pages/WordPressPage.tsx',
  'MS365_MAIL_FIELDS.body': 'pages/Microsoft365Page.tsx',
};

/** 画面に欄が無い本文の欄と、その理由 + 欄が無いことの確かめ方。 */
const NO_FIELD_ON_SCREEN: Readonly<Record<string, { readonly why: string; readonly page: string; readonly absent: string }>> = {
  'CALENDAR_EVENT_FIELDS.description': {
    why: 'カレンダーの画面は 件名 / 開始 / 終了 だけを持ち、説明の欄を出していない (説明は音声・チャット経由の payload でしか入らない)。無い欄に maxLength も断りも求められない',
    page: 'pages/CalendarPage.tsx',
    absent: 'value={description}',
  },
};

const read = (rel: string): string => readOriginalSource(path.join(SRC, 'renderer', rel));

describe('外へ書く本文の欄は、切らずに断る (母集団は台帳から導く · パス 172)', () => {
  const fields = bodyFields(readOriginalSource(LEDGER));
  const keys = fields.map((f) => `${f.group}.${f.field}`);

  it('★ 走査が実物に当たる (本文の欄が導けている)', () => {
    // 実測 (2026-09-12): 8 欄 (7 画面 + カレンダーの説明)。
    expect(fields.length, '本文の欄が見つからない (走査が死んでいる)').toBeGreaterThanOrEqual(8);
    expect(keys).toContain('NOTION_PAGE_FIELDS.body');
    expect(keys).toContain('CALENDAR_EVENT_FIELDS.description');
  });

  it('★ どの本文の欄も、画面の台帳か「欄が無い」台帳のどちらかに在る', () => {
    const orphans = keys.filter((k) => !(k in SCREEN_OF) && !(k in NO_FIELD_ON_SCREEN));
    expect(orphans, '台帳に無い本文の欄 — 画面を配線するか、欄が無い理由を書く').toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (消えた欄が残っていない)', () => {
    const stale = [...Object.keys(SCREEN_OF), ...Object.keys(NO_FIELD_ON_SCREEN)].filter(
      (k) => !keys.includes(k),
    );
    expect(stale, '台帳の古い行').toEqual([]);
  });

  it('★ 本文の欄に `maxLength` を持たない (ブラウザが黙って切る形を残さない)', () => {
    const cut: string[] = [];
    for (const [key, rel] of Object.entries(SCREEN_OF)) {
      const src = read(rel);
      // `maxLength={<この欄>.max}` が在れば、貼り付けはブラウザが切る。
      const re = new RegExp(`maxLength=\\{\\s*${key.replace('.', '(?:!)?\\.')}(?:!)?\\.max`);
      if (re.test(src)) cut.push(`${rel} (${key})`);
    }
    expect(cut, '本文の欄が maxLength を持っている — 貼り付けが黙って切られる').toEqual([]);
  });

  it('★ 本文の欄は超過を数え、共有の断りを描く', () => {
    const missing: string[] = [];
    for (const [key, rel] of Object.entries(SCREEN_OF)) {
      const src = read(rel);
      if (!/\bcharsOverCeiling\s*\(/.test(src)) missing.push(`${rel}: charsOverCeiling を読んでいない`);
      if (!/<CeilingNotice\b/.test(src)) missing.push(`${rel}: CeilingNotice を描いていない`);
      // 天井は台帳から読む (数を写さない) —— この欄の `.max` が画面に在ること。
      const base = key.split('.')[0]!;
      if (!src.includes(base)) missing.push(`${rel}: 台帳 ${base} を import していない`);
    }
    expect(missing, '断る形になっていない画面').toEqual([]);
  });

  it('★ 送るボタンは超過で止まる (over を disabled に入れている)', () => {
    const open: string[] = [];
    for (const rel of Object.values(SCREEN_OF)) {
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
      '  note: text(false),',
      '} satisfies Readonly<Record<string, WriteRule>>;',
    ].join('\n');
    expect(bodyFields(sample), '本文の欄だけを拾えていない').toEqual([{ group: 'X_FIELDS', field: 'note' }]);
    // 1 行の欄 (`line(`) や題名 (`title(`) は母集団の外。
    expect(bodyFields('export const Y = {\n  to: line(true),\n  t: title(true),\n};')).toEqual([]);
  });
});
