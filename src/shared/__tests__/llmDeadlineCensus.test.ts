/**
 * **LLM の補完には、LLM の予算を渡す。** (2026-09-23 · パス 424)
 *
 * ## なぜ機械が要るか —— 同じ欠陥が 3 か所に在り、どれも名前を持っていた
 *
 * 補完の締切を決めるのは**呼び出し側が渡すか渡さないか**で、渡さなければ
 * `DEFAULT_HTTP_TIMEOUT_MS` (通常の HTTP の 30 秒) が既定として掛かる。
 * 渡し忘れは**綴りに現れない** —— 在るべき引数が無いだけなので、読んでも
 * 目に入らない。実測 (2026-09-23 · 直す前):
 *
 * | 口 | 送る物 | 締切 | 実測 |
 * | --- | --- | ---: | --- |
 * | `ollama/chat` (デスクトップ) | 端末内のモデルへ生成 | **30 秒** | @31s で abort |
 * | `skills/run-skill` | Anthropic `max_tokens: 2048` + スキル本文を system へ | **30 秒** | @31s で「skills が時間内に応答しませんでした」 |
 * | `emotions/analyze-text` | Anthropic `max_tokens: 512` | **30 秒** | (綴りで検出・`skills` ほど際どくはない) |
 * | `assistant/chat` ほか 4 件 | —— | 120 秒 | `runAiChat` / 明示の `AI_CHAT_TIMEOUT_MS` |
 *
 * ★ **どれも「裸の数」ではない** ので `deadlineCensus` (パス 282) は鳴らない ——
 *   あの census は「締切に名前の無い数を書かない」しか要求せず、その docblock 自身が
 *   「値が両ビルドで同じかは要求しない…**読めば分かる**」と書いている。
 *   **読めば分かる、は誰も読まなければ分からない。** ここが読む側である。
 *
 * ★ `lint:parameter-prose` も構造的に届かない —— CLAUDE.md が
 *   「安全上限 (timeout / 応答サイズ / …) は台帳に載せない」と決めているので、
 *   締切はあの門の母集団の外に在る。
 *
 * ## 母集団は実装から導く (手で並べない)
 *
 * `aiActionHandlers(ANY_AI_MARKS)` が `src/main/clients/*.ts` の `ACTIONS` を読み、
 * **handler から辿って** LLM の口 (`api.anthropic.com` / `runAiChat(` /
 * Ollama の `/api/chat`) に届く物だけを返す (パス 106 / 114 が断りと入力の天井の
 * ために作った走査と**同じ 1 つ**)。だから新しい AI の action を足した日に、
 * 予算を渡し忘れればこの検査が名指しで落ちる。
 *
 * ## 何を「LLM の予算」と認めるか
 *
 * - `runAiChat(` へ届く —— あの関数が `AI_CHAT_TIMEOUT_MS` を既定として持つ漏斗。
 * - `AI_CHAT_TIMEOUT_MS` / `OLLAMA_CHAT_TIMEOUT_MS` を名指しする。
 *
 * **値が同じことは要求しない** —— クラウドと端末内で理由が分かれうる
 * (`OLLAMA_CHAT_TIMEOUT_MS` の docblock に測った理由が在る)。要求するのは
 * **通常の HTTP の予算に黙って落ちていないこと**である。
 */
import { describe, expect, it } from 'vitest';
import {
  ANY_AI_MARKS,
  aiActionHandlers,
  reaches,
} from '../../renderer/pages/__tests__/aiEgressPairs.helpers';

/** 「LLM の予算を持っている」と認める印。 */
const LLM_DEADLINE_MARKS: readonly RegExp[] = [
  /\brunAiChat\s*\(/,
  /\bAI_CHAT_TIMEOUT_MS\b/,
  /\bOLLAMA_CHAT_TIMEOUT_MS\b/,
];

/**
 * 理由つきの免除。`<service>/<action>` → 理由。
 *
 * **実測 0 件** (2026-09-23 · パス 424)。空のままにしておくのは、次に足す人が
 * 「載せる場所が在る」と分かるため —— 台帳が無いと、例外を作りたい人は
 * 走査そのものを緩める (`deadlineCensus` が同じ理由で空の台帳を持っている)。
 */
const EXEMPT: Readonly<Record<string, string>> = {};

const key = (h: { service: string; action: string }): string => `${h.service}/${h.action}`;

describe('LLM の補完の締切 (パス 424)', () => {
  it('★ 走査が死んでいない (LLM へ出る handler が実際に引けている)', () => {
    const hs = aiActionHandlers(ANY_AI_MARKS);
    // 床 —— 母集団が空になったら「全部が予算を持っている」が自明に真になる。
    expect(hs.length, 'LLM へ出る handler が引けていない —— 走査が死んでいる').toBeGreaterThanOrEqual(7);
    // クラウドと端末内の**両方**が母集団に居る (片方だけを見ていない)。
    const names = hs.map(key);
    expect(names, 'クラウドの口が母集団に居ない').toContain('assistant/chat');
    expect(names, '端末内の口が母集団に居ない').toContain('ollama/chat');
  });

  it('★ LLM へ出る handler は、すべて LLM の予算へ届く', () => {
    const bare = aiActionHandlers(ANY_AI_MARKS)
      .filter((h) => !Object.hasOwn(EXEMPT, key(h)))
      .filter((h) => !reaches(h.handler, h.bodies, LLM_DEADLINE_MARKS))
      .map(key);
    expect(
      bare,
      `通常の HTTP の予算 (30 秒) で LLM の補完を切っています: ${bare.join(' / ')}`
        + ' —— `timeoutMs: AI_CHAT_TIMEOUT_MS` を渡すか、理由つきで EXEMPT に載せること',
    ).toEqual([]);
  });

  it('★ 免除の台帳は両方向 (母集団から消えた行が残らない)', () => {
    const names = new Set(aiActionHandlers(ANY_AI_MARKS).map(key));
    for (const [k, why] of Object.entries(EXEMPT)) {
      expect(names.has(k), `${k} は LLM へ出る handler ではない —— 台帳から消すこと`).toBe(true);
      expect(why.length, `${k} の理由が空`).toBeGreaterThan(20);
    }
  });

  it('★ 標本 — この針は「予算を渡していない形」に実際に当たる', () => {
    const bodies = new Map<string, string>([
      // 渡していない形 (パス 424 まで 3 か所がこれだった)。
      ['bare', "await jsonFetch(url, init, { fetch: ctx.fetch, serviceId: 'x' });"],
      // 渡している形 3 通り。
      ['viaConst', "await jsonFetch(url, init, { fetch, serviceId: 'x', timeoutMs: AI_CHAT_TIMEOUT_MS });"],
      ['viaOllama', 'return withTimeout(f, url, init, consume, OLLAMA_CHAT_TIMEOUT_MS);'],
      ['viaFunnel', 'return runAiChat({ provider, cfg, request });'],
      // 呼び出し先を辿って届く形 (handler が直接は書いていない)。
      ['indirect', 'return viaConst();'],
    ]);
    expect(reaches('bare', bodies, LLM_DEADLINE_MARKS)).toBe(false);
    expect(reaches('viaConst', bodies, LLM_DEADLINE_MARKS)).toBe(true);
    expect(reaches('viaOllama', bodies, LLM_DEADLINE_MARKS)).toBe(true);
    expect(reaches('viaFunnel', bodies, LLM_DEADLINE_MARKS)).toBe(true);
    expect(reaches('indirect', bodies, LLM_DEADLINE_MARKS)).toBe(true);
  });
});
