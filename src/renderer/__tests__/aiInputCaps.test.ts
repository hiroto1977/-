/**
 * **AI への入力の天井 —— handler は持ち、画面は共有の定数を読む。母集団は実装から導く。**
 * (2026-09-09 · パス 112)
 *
 * 実測 (直す前) は 4 通りに割れていた: `assistant/chat` は最新の発話まで**黙って切り**
 * (8000)、`skills/run-skill` は**天井なし**、`business` / `stocks` の `advise` は断る (1000) が
 * 画面は `maxLength={1000}` と**数を写し**、`emotions/analyze-text` は断る (5000) が画面は
 * 何も持たなかった。数を写した画面は、定数を動かしても古い数で入力を止める
 * (パス 110 の `writeFieldLimits` と同じ規則: **画面の maxLength は台帳の値を読む**)。
 *
 * ここは 2 つを留める:
 *   1. AI へ出る handler (母集団は `ACTIONS` から到達可能性で導く) はすべて天井の印に届く。
 *   2. AI へ送る画面 (同じ母集団を invoke する .tsx) はすべて台帳に在り、`maxLength` に
 *      字面の数を持たず、AI へ行く入力欄は共有の定数を読む。
 * 母集団を手で書かないのは、パス 106 → 107 で 5 → 8 に動いたのと同じ理由。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  RENDERER,
  aiActionHandlers,
  code,
  invokesAi,
  pageFiles,
  reaches,
} from '../pages/__tests__/aiEgressPairs.helpers';

/** handler が入力の天井を持つ印 (呼び出し先で持っていてもよい)。 */
const CAP_MARKS: readonly RegExp[] = [
  /\blatestTurnTooLong\s*\(/,
  /\bcheckAdvisorQuestion\s*\(/,
  /\bMAX_ANALYZE_TEXT_CHARS\b/,
  /\bMAX_ASSISTANT_CONTENT_CHARS\b/,
];

type PageCap =
  | { readonly constant: string; readonly count: number }
  | { readonly constant: null; readonly why: string };

/** 画面 → AI へ行く入力欄が読む定数 (`null` = 利用者の入力欄は AI へ行かない。理由を書く)。 */
const PAGE_CAPS: Readonly<Record<string, PageCap>> = {
  'pages/AssistantPage.tsx': { constant: 'MAX_ASSISTANT_CONTENT_CHARS', count: 1 },
  'pages/VillagePage.tsx': { constant: 'MAX_ASSISTANT_CONTENT_CHARS', count: 1 },
  'pages/SkillsPage.tsx': { constant: 'MAX_ASSISTANT_CONTENT_CHARS', count: 1 },
  'pages/BusinessPage.tsx': { constant: 'MAX_ADVISOR_QUESTION_CHARS', count: 1 },
  'pages/StocksPage.tsx': { constant: 'MAX_ADVISOR_QUESTION_CHARS', count: 1 },
  'pages/EmotionsPage.tsx': { constant: 'MAX_ANALYZE_TEXT_CHARS', count: 1 },
  'pages/GmailPage.tsx': {
    constant: null,
    why: '受信スレッドの件名と送信者 (取得済みデータ) を送る。利用者の入力欄 (下書き) は AI へ行かない',
  },
  'pages/SlackPage.tsx': {
    constant: null,
    why: 'チャンネル名と目的 (取得済みデータ) を送る。利用者の入力欄 (送信) は AI へ行かない',
  },
};

describe('AI へ出る handler はすべて入力の天井を持つ (母集団は ACTIONS から導く)', () => {
  const handlers = aiActionHandlers();

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    const keys = handlers.map((h) => `${h.service}/${h.action}`);
    expect(keys).toContain('assistant/chat');
    expect(keys).toContain('assistant/chatAll');
    expect(keys).toContain('skills/run-skill');
    expect(keys.length).toBeGreaterThanOrEqual(6);
  });

  it('★ 天井の印に届かない handler が 0 件', () => {
    const bare = handlers
      .filter((h) => !reaches(h.handler, h.bodies, CAP_MARKS))
      .map((h) => `${h.service}/${h.action}`);
    expect(bare, '入力の天井を持たずに AI へ送る handler がある').toEqual([]);
  });

  it('★ 対照: 印を外せば handler が落ちる (規則が空でない)', () => {
    const bodies = new Map<string, string>([['h', "const p = checkAdvisorQuestion(q);\nawait fetch('https://api.anthropic.com/v1/messages');\n"]]);
    expect(reaches('h', bodies, CAP_MARKS)).toBe(true);
    expect(reaches('h', bodies, [/\bnever_present_mark\b/])).toBe(false);
  });
});

describe('AI へ送る画面は台帳に在り、入力欄は共有の定数を読む (数を写さない)', () => {
  const pairs = aiActionHandlers().map((h) => [h.service, h.action] as const);
  const aiPages = pageFiles()
    .filter((f) => invokesAi(fs.readFileSync(f, 'utf8'), pairs))
    .map((f) => path.relative(RENDERER, f));

  it('★ 走査が実物に当たる', () => {
    expect(aiPages).toContain('pages/AssistantPage.tsx');
    expect(aiPages.length).toBeGreaterThanOrEqual(8);
  });

  it('★ AI へ送る画面はすべて台帳に在る (9 つ目が黙って増えない)', () => {
    expect(aiPages.filter((p) => !(p in PAGE_CAPS)), '台帳に無い AI の画面').toEqual([]);
  });

  it('★ 台帳の画面はすべて AI へ送っている (古い行が残っていない)', () => {
    expect(Object.keys(PAGE_CAPS).filter((p) => !aiPages.includes(p)), '台帳の古い行').toEqual([]);
  });

  it('★ 入力欄の maxLength は定数で、字面の数を持たない。AI へ行く欄はその天井の定数を読む', () => {
    for (const p of aiPages) {
      const src = code(fs.readFileSync(path.join(RENDERER, p), 'utf8'));
      expect(src, `${p} が maxLength に数を写している`).not.toMatch(/maxLength=\{\s*\d/);
      const cap = PAGE_CAPS[p]!;
      if (cap.constant === null) {
        expect(cap.why.length, `${p}: 理由が無い`).toBeGreaterThan(10);
        continue;
      }
      const n = src.split(`maxLength={${cap.constant}}`).length - 1;
      expect(n, `${p} の AI 入力欄が ${cap.constant} を読んでいない`).toBeGreaterThanOrEqual(cap.count);
      expect(src, `${p} が ${cap.constant} を import していない`).toMatch(
        new RegExp(`import[^;]*\\b${cap.constant}\\b[^;]*from`),
      );
    }
  });
});
