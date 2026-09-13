import { describe, expect, it } from 'vitest';
import { MAX_OLLAMA_PROMPT_CHARS, MAX_OLLAMA_SYSTEM_CHARS } from '../ollama';
import { readOriginalSource } from './originalSource';

/*
 * **チャット入力の上限を、2 つの版が同じ 1 つから読み、超えたら切らずに断る。**
 *
 * 2026-08-23 まで、ブラウザ版は `MAX_SYSTEM_CHARS` / `MAX_PROMPT_CHARS` と
 * いう名前で持ち、main は `slice(0, 8192)` / `slice(0, 32768)` と**字面で
 * 書いていた**。値は一致していたので壊れてはいなかったが、片方を動かしても
 * もう片方は動かない。本セッションで `emotionsLimits` / `recordEntryLimits` /
 * `assistantLimits` を同じ理由で寄せたので、ここも揃える。
 *
 * 字面が戻ってきたら鳴らす —— 「同じ値を 2 度書く」に戻る道を塞ぐ。
 *
 * ## 切らずに断る (2026-09-09 · パス 114)
 *
 * 定数を共有した後も、両ビルドは `slice(0, MAX_…)` で**黙って切っていた**。貼った長文の
 * 末尾 (質問はたいてい末尾に在る) が届かないまま答えが返る。アシスタントはパス 112 で
 * 「最新の発話は切らずに断る」と決めており、端末内のモデルでも形は同じ —— 天井超えは
 * `inputTooLongMessage` (文面 1 つ) で断る。この検査は「切り詰めが戻ってきていないこと」と
 * 「比較式で断っていること」の両方を、両ビルドの本体に当てる。
 */

const MAIN = readOriginalSource('src/main/clients/ollama.ts');
const WEB = readOriginalSource('src/renderer/network/ollamaWeb.ts');
const BUILDS = [
  ['main', MAIN],
  ['ブラウザ版', WEB],
] as const;

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
    for (const [label, text] of BUILDS) {
      expect(code(text), `${label} が共有の上限を読んでいない`).toContain('MAX_OLLAMA_PROMPT_CHARS');
      expect(code(text), `${label} が共有の上限を読んでいない`).toContain('MAX_OLLAMA_SYSTEM_CHARS');
    }
  });

  it('字面の 8192 / 32768 が切り詰めに戻ってきていない', () => {
    for (const [label, text] of BUILDS) {
      const c = code(text);
      expect(c, `${label} が上限を字面で書いている`).not.toMatch(/slice\(\s*0\s*,\s*8192\s*\)/);
      expect(c, `${label} が上限を字面で書いている`).not.toMatch(/slice\(\s*0\s*,\s*32768\s*\)/);
    }
  });

  it('★ 天井超えは切らずに断る (両ビルド) —— `slice(0, MAX_OLLAMA_…)` が戻ってきていない', () => {
    const cut = /\.slice\(\s*0\s*,\s*MAX_OLLAMA_(?:PROMPT|SYSTEM)_CHARS\s*\)/;
    // 対照: 規則が切り詰めの字面に当たる (どの入力でも通る空の検査でない)。
    expect('content: promptStr.slice(0, MAX_OLLAMA_PROMPT_CHARS)').toMatch(cut);
    expect('content: system.slice(0, MAX_OLLAMA_SYSTEM_CHARS)').toMatch(cut);
    for (const [label, text] of BUILDS) {
      const c = code(text);
      expect(c, `${label} が黙って切っている`).not.toMatch(cut);
      // パス 195: 単位を「字」に揃えたので `countChars(...)` を通る (対照は下の `cut`)。
      expect(c, `${label} が prompt の天井で断っていない`).toMatch(
        /countChars\([^)]*\)\s*>\s*MAX_OLLAMA_PROMPT_CHARS\b/,
      );
      expect(c, `${label} が system の天井で断っていない`).toMatch(
        /countChars\([^)]*\)\s*>\s*MAX_OLLAMA_SYSTEM_CHARS\b/,
      );
      // 文面は共有の 1 つ (家系ごとに書かない)。
      expect(c, `${label} が文面を写している`).toContain(
        "inputTooLongMessage('プロンプト', MAX_OLLAMA_PROMPT_CHARS)",
      );
      expect(c, `${label} が文面を写している`).toContain(
        "inputTooLongMessage('システムプロンプト', MAX_OLLAMA_SYSTEM_CHARS)",
      );
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
