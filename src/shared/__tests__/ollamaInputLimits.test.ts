import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_OLLAMA_PROMPT_CHARS, MAX_OLLAMA_SYSTEM_CHARS } from '../ollama';

/*
 * **チャット入力の上限を、2 つの版が同じ 1 つから読む。**
 *
 * 2026-08-23 まで、ブラウザ版は `MAX_SYSTEM_CHARS` / `MAX_PROMPT_CHARS` と
 * いう名前で持ち、main は `slice(0, 8192)` / `slice(0, 32768)` と**字面で
 * 書いていた**。値は一致していたので壊れてはいなかったが、片方を動かしても
 * もう片方は動かない。本セッションで `emotionsLimits` / `recordEntryLimits` /
 * `assistantLimits` を同じ理由で寄せたので、ここも揃える。
 *
 * 字面が戻ってきたら鳴らす —— 「同じ値を 2 度書く」に戻る道を塞ぐ。
 */

const MAIN = readFileSync('src/main/clients/ollama.ts', 'utf8');
const WEB = readFileSync('src/renderer/network/ollamaWeb.ts', 'utf8');

/** コメントを落とす (説明文の中の数字を数えないため)。 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('ollama のチャット入力の上限は 1 つだけ', () => {
  it('値そのものを留める', () => {
    expect(MAX_OLLAMA_SYSTEM_CHARS).toBe(8_192);
    expect(MAX_OLLAMA_PROMPT_CHARS).toBe(32_768);
  });

  it('両方の版が共有の定数を読んでいる', () => {
    for (const [label, text] of [
      ['main', MAIN],
      ['ブラウザ版', WEB],
    ] as const) {
      expect(code(text), `${label} が共有の上限を読んでいない`).toContain('MAX_OLLAMA_PROMPT_CHARS');
      expect(code(text), `${label} が共有の上限を読んでいない`).toContain('MAX_OLLAMA_SYSTEM_CHARS');
    }
  });

  it('字面の 8192 / 32768 が切り詰めに戻ってきていない', () => {
    for (const [label, text] of [
      ['main', MAIN],
      ['ブラウザ版', WEB],
    ] as const) {
      const c = code(text);
      expect(c, `${label} が上限を字面で書いている`).not.toMatch(/slice\(\s*0\s*,\s*8192\s*\)/);
      expect(c, `${label} が上限を字面で書いている`).not.toMatch(/slice\(\s*0\s*,\s*32768\s*\)/);
    }
  });

  /*
   * 応答の上限は**揃っていない** —— main 10 MB / ブラウザ版 2 MB。
   * どこにも理由が書かれていなかったので、両方の宣言に「片方だけ違う」と
   * 明記した (値は動かしていない。ブラウザ版の 2 MB は画面の
   * 「セキュリティポリシー」欄に出ているため)。
   *
   * この検査は**揃えることを要求しない**。違いが**黙って**存在する状態に
   * 戻らないよう、注記が消えたら鳴らす。
   */
  it('応答上限の食い違いは、注記つきで在る (黙って割れていない)', () => {
    expect(MAIN, 'main 側に食い違いの注記が無い').toMatch(/ブラウザ版.*2 MB|2 MB.*ブラウザ版/s);
    expect(WEB, 'ブラウザ版に食い違いの注記が無い').toMatch(/main.*10 MB|10 MB.*main/s);
  });
});
