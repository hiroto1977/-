import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_ADVISOR_QUESTION_CHARS, checkAdvisorQuestion } from '../advisorQuestionLimits';

/*
 * **同じ判断を 4 度書いていた。**
 *
 * `business/advise` と `stocks/advise` は利用者の質問を有料 API の本文へ
 * そのまま載せる。その手前の検査 (空でない / 上限 / 制御文字) が
 * **main 2 か所 + web-shim 2 か所**に字面で書かれていた (2026-08-25 実測)。
 *
 * 片方だけ動かしても誰も気付かない —— `main` は IPC の**信頼境界**なので、
 * そちらが緩めば乗っ取られたレンダラーが利用者の鍵で長い本文を送れる。
 *
 * ここでは**振る舞い**と**字面が残っていないこと**の両方を留める。
 * 注記で「共有した」と書くだけでは、書き戻されたときに黙る。
 */

const SRC = [
  ['main/clients/business.ts', join(__dirname, '../../main/clients/business.ts')],
  ['main/clients/stocks.ts', join(__dirname, '../../main/clients/stocks.ts')],
  ['renderer/web-shim.ts', join(__dirname, '../../renderer/web-shim.ts')],
] as const;

describe('アドバイザーの質問の規則は 1 つだけ', () => {
  it.each([
    ['空文字', '', 'empty'],
    ['文字列でない', 42, 'empty'],
    ['undefined', undefined, 'empty'],
    ['上限ちょうどは通す', 'あ'.repeat(MAX_ADVISOR_QUESTION_CHARS), null],
    ['上限 +1 は断る', 'あ'.repeat(MAX_ADVISOR_QUESTION_CHARS + 1), 'too-long'],
    ['CR を含む', 'a\rb', 'control-chars'],
    ['LF を含む', 'a\nb', 'control-chars'],
    ['NUL を含む', 'a\u0000b', 'control-chars'],
    ['普通の質問は通す', '次に注力すべき事業は？', null],
  ])('%s', (_label, input, expected) => {
    expect(checkAdvisorQuestion(input)).toBe(expected);
  });

  /*
   * **順序も決めておく。** 空の判定が先でないと、`''` が `too-long` に
   * 化けたり、理由が入れ替わったりする。
   */
  it('空の判定が上限より先 (理由が入れ替わらない)', () => {
    expect(checkAdvisorQuestion('')).toBe('empty');
    // 上限超えかつ制御文字 → 先に上限で断る (本文へ載る前に切る意図)。
    expect(checkAdvisorQuestion('a'.repeat(MAX_ADVISOR_QUESTION_CHARS + 1) + '\n')).toBe('too-long');
  });

  /*
   * **字面が戻っていないこと。** 共有へ寄せても、あとから
   * `question.length > 1000` と書き直されたら元に戻る。
   */
  it.each(SRC)('%s に質問の上限が字面で書かれていない', (_label, path) => {
    const code = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code, '上限が字面へ戻っています (shared/advisorQuestionLimits.ts を使ってください)').not.toMatch(
      /question\.length\s*>\s*\d+/,
    );
    // 走査が空撃ちでないこと —— そのファイルが実際に質問を扱っている。
    expect(code).toContain('checkAdvisorQuestion');
  });

  /*
   * **「無いこと」の検査には標本を添える。** 上の `not.toMatch` が
   * 実際に元の書き方へ当たることを、同じ検査の中で確かめる。
   */
  it('★ 上の規則は、元の書き方に本当に当たる', () => {
    const OLD = 'if (question.length > 1000) {';
    expect(OLD).toMatch(/question\.length\s*>\s*\d+/);
  });
});
