import { describe, expect, it } from 'vitest';
import { MAX_OLLAMA_PROMPT_CHARS, MAX_OLLAMA_SYSTEM_CHARS } from '../ollama';
import { MAX_OLLAMA_RESPONSE_BYTES } from '../httpLimits';
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
   * **応答の上限は 1 つになった** (2026-09-20 · パス 336)。
   *
   * 2026-08-23 から 2026-09-20 まで main 10 MB / ブラウザ版 2 MB で割れており、
   * **この検査自身が「揃えることを要求しない」と書いて、割れていること自体を
   * 仕様として固定していた** (法則 `no-weakness-as-spec`)。注記さえ在れば通るので、
   * 「分かる人が決める」は 1 か月近く誰も決めないまま残った。
   *
   * 実測して決めた: `capAssistantReply` が 10 万字で切るので、アプリが使える
   * 最大の本文は `/api/chat` の封筒で 600,124 B (全部が \uXXXX へ縮退する最悪) ——
   * 2 MiB でも 3.49 倍の余裕が在り、10 MiB との差は「捨てる物をどれだけ確保するか」
   * だけだった。小さい方へ揃えた (理由は `MAX_OLLAMA_RESPONSE_BYTES` の docblock)。
   *
   * ここが見るのは「**両方が shared の 1 つを読んでいる**」こと ——
   * どちらかが自分の数字に戻れば落ちる。
   */
  it('★ 応答上限は両ビルドが shared の 1 つを読む (数字を書き写さない)', () => {
    for (const [label, src] of [['main', MAIN], ['ブラウザ版', WEB]] as const) {
      expect(src, `${label} が shared の定数を import していない`).toMatch(
        /MAX_OLLAMA_RESPONSE_BYTES/,
      );
      expect(src, `${label} が上限の数字を書き写している`).not.toMatch(
        /MAX_RESPONSE_BYTES\s*=\s*\d+\s*\*/,
      );
    }
    // 標本 —— 針は「書き写した宣言」に実際に当たる (綴り違いで黙る検査を作らない)。
    expect('const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB').toMatch(
      /MAX_RESPONSE_BYTES\s*=\s*\d+\s*\*/,
    );
    expect('const MAX_RESPONSE_BYTES = MAX_OLLAMA_RESPONSE_BYTES;').not.toMatch(
      /MAX_RESPONSE_BYTES\s*=\s*\d+\s*\*/,
    );
  });

  it('★ 値は 2 MiB ちょうど (実測で決めた側)', () => {
    expect(MAX_OLLAMA_RESPONSE_BYTES).toBe(2 * 1024 * 1024);
  });
});
