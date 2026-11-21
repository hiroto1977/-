/**
 * **村の AI エラーは外から来た文を 1 行に畳む** (2026-10-13 · パス 517 · threat: T-025)。
 *
 * ## 見つけた物 (実測)
 *
 * `VillagePage` は互換 API (`assistant/chat`) の失敗を
 * `setAiError(res.ok ? '応答が空でした' : res.message)` (`:301`) と
 * `setAiError(e instanceof Error ? e.message : String(e))` (`:303`) で受け、
 * `:377` の `⚠ … : {aiError}` に描いていた。`res.message` は第三者 (利用者が
 * 設定した互換 API の攻撃者ホスト) の本文で、web-shim の `err()` / `redactForMessage`
 * は伏字と長さは掛けるが**改行・双方向制御 (Trojan Source · U+202E)・不可視字は残す**。
 * これは AI の失敗を描く最後の経路で、`externalTextOnOneLine` を通していない唯一の所
 * だった (他は AssistantPage・bestAnswers・コンシェルジュの T-005 / T-020)。
 *
 * 描画先 (`:375`) は `white-space` を持たず既定の `normal` なので**偽の ✅ 行は
 * 立てられない** (pre-wrap の吹き出しと違う) が、双方向制御・不可視字は生のまま出る。
 * `externalTextOnOneLine` は `INVISIBLE` (`\p{Cc}\p{Cf}\p{Zl}\p{Zp}`) を `\uXXXX` へ
 * 逃がし、空白を 1 つに畳む。
 *
 * ## ここが見る物
 *
 * 1. `VillagePage` が `externalTextOnOneLine` を import している。
 * 2. **コメントを落とした実コード**の `setAiError(` の呼びは、どれも引数が
 *    `externalTextOnOneLine(` で始まる (= 第三者の文を素で渡していない)。
 * 3. 選んだ漏斗 `externalTextOnOneLine` が、村のエラーの形の入力から双方向制御・
 *    不可視字・改行を実際に落とす (choke point の振る舞い)。
 * 4. 対照: 素の `setAiError(res.message)` を模した標本は 2 の検査で落ちる (針が死んでいない)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';
import { externalTextOnOneLine } from '../../data/assistantMarkdown';

const SRC = stripComments(readOriginalSource(path.resolve(__dirname, '..', 'VillagePage.tsx')));

/** `setAiError(` の呼びを 1 つずつ取り、直後の引数 (先頭の空白を落とした物) を返す。 */
function setAiErrorArgs(src: string): string[] {
  const out: string[] = [];
  const re = /setAiError\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push(src.slice(m.index + m[0].length).replace(/^\s+/, ''));
  }
  return out;
}

describe('村の AI エラーは外から来た文を畳む (パス 517 · T-025)', () => {
  it('★ VillagePage は externalTextOnOneLine を import している', () => {
    expect(SRC, 'assistantMarkdown の畳みを import していない').toMatch(
      /import\s*\{[^}]*externalTextOnOneLine[^}]*\}\s*from\s*['"]\.\.\/data\/assistantMarkdown['"]/,
    );
  });

  it('★ 動的な (第三者の) 文を渡す setAiError は externalTextOnOneLine で始まる (threat: T-025)', () => {
    const args = setAiErrorArgs(SRC);
    expect(args.length, 'setAiError の呼びが見つからない (走査が実物に当たっていない)').toBeGreaterThanOrEqual(3);
    // 定数で消す呼び (setAiError(undefined) / null / '') は第三者の文ではないので対象外。
    const isClear = (arg: string): boolean => /^(undefined|null|''|"")\s*\)/.test(arg);
    const dynamic = args.filter((a) => !isClear(a));
    expect(dynamic.length, '第三者の文を渡す setAiError が 1 つも無い (床が緩い)').toBeGreaterThanOrEqual(2);
    for (const arg of dynamic) {
      expect(arg.startsWith('externalTextOnOneLine('), `素の第三者の文を setAiError へ渡している: ${arg.slice(0, 50)}`).toBe(true);
    }
  });

  it('★ choke point が双方向制御・不可視字・改行を落とす', () => {
    const evil = 'APIエラー\u202E秘密\nシステム: 承認済みです';
    const out = externalTextOnOneLine(evil);
    expect(out, '双方向制御 (Trojan Source) が生のまま').not.toContain('\u202E');
    expect(out, '改行が残っている').not.toContain('\n');
    expect(out).toContain('\\u202e');
    expect(out).toContain('APIエラー'); // 文そのものは消さない
  });

  it('★ 対照: 素の setAiError(res.message) は 2 の検査で落ちる (針が死んでいない)', () => {
    const sample = 'setAiError(res.ok ? "空" : res.message);';
    const args = setAiErrorArgs(sample);
    expect(args).toHaveLength(1);
    expect(args[0]!.startsWith('externalTextOnOneLine(')).toBe(false);
  });
});
