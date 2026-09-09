/**
 * **AI の応答の天井は 1 経路にしか無かった。** (2026-09-09 · パス 113)
 *
 * 2026-08-29 に `MAX_ASSISTANT_REPLY_CHARS` (10 万字 + 注記) を `runAiChat` に置いた ——
 * 「両ビルドと chat / chatAll が必ず通る唯一の場所」だから。だが AI の本文が画面へ出る経路は
 * それだけではなかった:
 *
 * | 経路 | 天井 (直す前) | 出る先 |
 * | --- | --- | --- |
 * | `assistant/chat` · `chatAll` (`runAiChat`) | 10 万字 + 注記 | アシスタント・村 |
 * | `skills/run-skill` | **byte の天井 (10 MiB) だけ** | `SkillsPage` の `<pre>` |
 * | `ollama/chat` (main / ブラウザ版) | **10 MiB / 2 MiB だけ** | チャットボットの吹き出し |
 * | 村の読み上げ (`speak`) | **無し** (10 万字を声に) | スピーカー |
 *
 * さらにチャットボットは `ollama/chat` の戻り値を `{ response?, message? }` と**手で写した型**で
 * 読んでおり、実物 (`reply`) と食い違っていた —— **Ollama の答えは 1 度も画面に出ていなかった**
 * (パス 62 と同じ形)。
 *
 * ここは判断が 1 つ (`capAssistantReply`) であることと、AI へ出る handler (母集団は実装から)
 * がすべて応答側の天井に届くことを留める。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ASSISTANT_REPLY_TRUNCATED_NOTICE,
  MAX_ASSISTANT_REPLY_CHARS,
  capAssistantReply,
} from '../assistantLimits';
import {
  RENDERER,
  aiActionHandlers,
  invokesAi,
  pageFiles,
  reaches,
} from '../../renderer/pages/__tests__/aiEgressPairs.helpers';

const SRC = path.resolve(__dirname, '../..');
const code = (rel: string): string =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');

describe('capAssistantReply — 判断は 1 つ', () => {
  it('★ 天井ちょうどは 1 文字も変えず、1 文字超で切って注記を足す (境目の両側)', () => {
    const at = 'a'.repeat(MAX_ASSISTANT_REPLY_CHARS);
    expect(capAssistantReply(at)).toBe(at);
    const over = capAssistantReply('a'.repeat(MAX_ASSISTANT_REPLY_CHARS + 1));
    expect(over).toHaveLength(MAX_ASSISTANT_REPLY_CHARS + ASSISTANT_REPLY_TRUNCATED_NOTICE.length);
    expect(over.endsWith(ASSISTANT_REPLY_TRUNCATED_NOTICE)).toBe(true);
  });

  it('★ 対照: 空文字と短い文はそのまま', () => {
    expect(capAssistantReply('')).toBe('');
    expect(capAssistantReply('短い')).toBe('短い');
  });
});

describe('応答側の天井に、AI へ出る handler がすべて届く (母集団は ACTIONS から導く)', () => {
  /** 応答を画面に出す量として縛っている印 (本文の天井 / 構造化応答の欄ごとの天井)。 */
  const REPLY_MARKS: readonly RegExp[] = [
    /\brunAiChat\s*\(/,
    /\bcapAssistantReply\s*\(/,
    /\bnormalizeAnalysis\s*\(/,
    /\bMAX_ADVISOR_RATIONALE_CHARS\b/,
    /\bMAX_STOCK_ADVISOR_RATIONALE_CHARS\b/,
  ];

  it('★ 天井の印に届かない handler が 0 件', () => {
    const handlers = aiActionHandlers();
    expect(handlers.length).toBeGreaterThanOrEqual(6);
    const bare = handlers.filter((h) => !reaches(h.handler, h.bodies, REPLY_MARKS)).map((h) => `${h.service}/${h.action}`);
    expect(bare, '応答の天井を持たずに AI の本文を返す handler がある').toEqual([]);
  });

  it('★ runAiChat・skills・ollama (両ビルド) が同じ関数を読む (字面で写していない)', () => {
    expect(code('shared/ai/chat.ts')).toContain('capAssistantReply(text)');
    expect(code('main/clients/skills.ts')).toContain('capAssistantReply(text)');
    expect(code('main/clients/ollama.ts')).toContain('capAssistantReply(');
    expect(code('renderer/network/ollamaWeb.ts')).toContain('capAssistantReply(');
    // 切る判断の字面 (`slice(0, MAX_ASSISTANT_REPLY_CHARS)`) は assistantLimits.ts の外に無い。
    for (const rel of ['shared/ai/chat.ts', 'main/clients/skills.ts', 'main/clients/ollama.ts', 'renderer/network/ollamaWeb.ts']) {
      expect(code(rel), `${rel} が天井の判断を写している`).not.toContain('slice(0, MAX_ASSISTANT_REPLY_CHARS)');
    }
  });

  it('★ ollama/chat を呼ぶ画面はすべて共有の戻り値の型 (reply) を読む —— 手写しの型を持たない', () => {
    // 母集団は「'ollama', 'chat' を invoke する .tsx」を走査で導く (パス 114: パス 113 は
    // チャットボットだけを見て、同じ形 `invoke<{ reply; durationMs }>` の OllamaPage を落としていた)。
    const callers = pageFiles()
      .filter((f) => invokesAi(fs.readFileSync(f, 'utf8'), [['ollama', 'chat']]))
      .map((f) => path.relative(RENDERER, f));
    expect(callers).toContain('components/ChatbotWidget.tsx');
    expect(callers).toContain('pages/OllamaPage.tsx');
    for (const rel of callers) {
      const src = code(`renderer/${rel}`);
      expect(src, `${rel} が台帳の型を読んでいない`).toContain("invoke<ActionData<'ollama/chat'>>");
      expect(src, `${rel} が戻り値の型を手で写している`).not.toMatch(/invoke<\{\s*reply/);
      expect(src, `${rel} が reply を読んでいない`).toContain('res.data.reply');
      expect(src, `${rel} が手写しの欄を読んでいる`).not.toMatch(/data\.response|data\.message/);
    }
    // 両ビルドの handler が同じ型を返す。
    expect(code('main/clients/ollama.ts')).toContain("Promise<ActionData<'ollama/chat'>>");
    expect(code('renderer/network/ollamaWeb.ts')).toContain('OllamaChatResult');
  });
});
