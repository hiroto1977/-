/**
 * **一覧から本文を組む所の天井** (2026-09-12 · パス 156)。
 *
 * `packAnalyzeText` は先頭から入るぶんだけ詰め、`analyzeBatchNote` が外した件数を言う。
 * パス 112 は「AI への入力の天井を画面が共有定数から読む」で閉じたつもりだったが、
 * 読んでいたのは `EmotionsPage` 1 つで、`analyze-text` を呼ぶ画面は 3 つ在った。
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_ANALYZE_TEXT_CHARS,
  analyzeBatchNote,
  packAnalyzeText,
} from '../emotionsLimits';
import { countChars } from '../inputCeiling';

describe('packAnalyzeText', () => {
  it('全部入るなら全部入れ、外した件数は 0', () => {
    const out = packAnalyzeText(['a', 'bb', 'ccc']);
    expect(out).toEqual({ text: 'a\nbb\nccc', included: 3, omitted: 0 });
  });

  it('空の一覧は空の本文 (「1 件だけ空文字を送る」にしない)', () => {
    expect(packAnalyzeText([])).toEqual({ text: '', included: 0, omitted: 0 });
  });

  /**
   * **連結の `\n` も数える。** ここを忘れると行数ぶんだけ上限を超え、
   * `analyze-text` が断る (直そうとした欠陥がそのまま残る)。
   */
  it('★ 区切りの改行も数に入れる', () => {
    /*
     * **標本は差が出る物を選ぶ。** 最初は `['aa','bb','cc']` / 上限 5 で書いたが、
     * 改行を数えない写しでも同じ答え (先頭 2 行) になるので**対照が鳴らなかった**
     * —— 実際に `cost = row.length` へ戻して確かめて気づいた。
     * `['aa','bbb']` なら分かれる: 数えれば 2+1+3=6 > 5 で 1 行だけ、
     * 数えなければ 2+3=5 で 2 行入り、本文は 6 字 (上限超過) になる。
     */
    const out = packAnalyzeText(['aa', 'bbb'], 5);
    expect(out).toEqual({ text: 'aa', included: 1, omitted: 1 });
    // 改行を数えない写しが作る本文は、上限を超える。
    expect('aa\nbbb'.length).toBe(6);
    // ちょうど収まる形も見る ('aa' + '\n' + 'bb' = 5)。
    expect(packAnalyzeText(['aa', 'bb'], 5)).toEqual({ text: 'aa\nbb', included: 2, omitted: 0 });
  });

  it('境界: ちょうど上限なら入り、1 字超えると入らない', () => {
    expect(packAnalyzeText(['abcde'], 5).included).toBe(1);
    expect(packAnalyzeText(['abcdef'], 5).included).toBe(0);
  });

  it('★ 入らない行が来たら止める (途中を飛ばして詰めない)', () => {
    // 2 行目が長すぎても 3 行目を拾わない —— 分析が読むのは一覧の
    // **先頭からの連続した一部**で、間に穴が開くと主張が実物と違う物になる。
    const out = packAnalyzeText(['ab', 'zzzzzzzzzz', 'cd'], 6);
    expect(out).toEqual({ text: 'ab', included: 1, omitted: 2 });
  });

  it('1 行目だけで超えるなら 1 件も入れない (切った本文を送らない)', () => {
    const out = packAnalyzeText(['zzzzzzzzzz', 'a'], 3);
    expect(out).toEqual({ text: '', included: 0, omitted: 2 });
  });

  it('既定の上限は共有定数 (画面が数を写さない)', () => {
    const rows = Array.from({ length: 400 }, () => 'x'.repeat(20));
    const out = packAnalyzeText(rows);
    expect(out.text.length).toBeLessThanOrEqual(MAX_ANALYZE_TEXT_CHARS);
    // 400 行 × 21 字 = 8400 > 5000 なので必ず一部が外れる (走査が空振りしていない標本)。
    expect(out.omitted).toBeGreaterThan(0);
    expect(out.included + out.omitted).toBe(400);
  });
});

describe('analyzeBatchNote', () => {
  it('全部入るなら述べることは無い', () => {
    expect(analyzeBatchNote(packAnalyzeText(['a', 'b']))).toBeNull();
    expect(analyzeBatchNote(packAnalyzeText([]))).toBeNull();
  });

  /**
   * **予算は文字で積む** (2026-09-14 · パス 254)。
   *
   * 2026-09-14 まで `row.length` —— **UTF-16 のコード単位**だった。門
   * (`main/clients/emotions.ts` と `web-shim.ts`) は `countChars(text) > 上限` と
   * **文字**で測るので、予算だけが別の単位で組まれていた。
   *
   * 標本は**絵文字**を選ぶ (BMP 外なので 1 文字 = 2 コード単位)。Gmail の件名・
   * Slack のチャンネル名は絵文字を含みやすく、この 2 画面が `packAnalyzeText` の
   * 実際の呼び手である。
   */
  it('★ 予算を文字で積む — 絵文字の行はコード単位の半分しか食わない', () => {
    // 1 行 = 絵文字 5 個 = 5 文字 = 10 コード単位。上限 20 字。
    const rows = Array.from({ length: 10 }, () => '\u{1F600}'.repeat(5));
    const out = packAnalyzeText(rows, 20);
    /*
     * 文字で積む: 5 + (5+1) + (5+1) = 17 ≦ 20、4 行目で 23 > 20 → 3 行。
     * コード単位で積む写し: 10 + 11 = 21 > 20 → **1 行**しか入らない。
     * 差は 2 行なので、単位を戻すとこの検査は必ず落ちる。
     */
    expect(out.included).toBe(3);
    expect(out.omitted).toBe(7);
    expect(countChars(out.text)).toBe(17);
    // 同じ本文をコード単位で測れば 32 (絵文字 15 個 × 2 + 改行 2) —— **門はこちらを見ていない**。
    expect(out.text.length).toBe(32);
  });

  /**
   * **門が受ける量まで詰める。** 断りの文面は「1 回に送れるのは N 字まで」と言う
   * ので、詰め終わった本文は N 字に近いところまで届いていなければ、
   * その理由は成り立たない (実測: 5,000 字の門に 2,617 字送って 362 行落としていた)。
   */
  it('★ 断りの理由が成り立つ — 詰めた本文は上限の近くまで届く', () => {
    const rows = Array.from({ length: 600 }, () => '\u{1F600}'.repeat(10));
    const out = packAnalyzeText(rows);
    expect(out.omitted).toBeGreaterThan(0);
    const chars = countChars(out.text);
    expect(chars).toBeLessThanOrEqual(MAX_ANALYZE_TEXT_CHARS);
    // あと 1 行 (11 文字) 入れれば超える = 上限まで使い切っている。
    expect(chars + 11).toBeGreaterThan(MAX_ANALYZE_TEXT_CHARS);
    // コード単位で積む写しはここで 2,617 字しか送らない (半分未満)。
    expect(chars).toBeGreaterThan(MAX_ANALYZE_TEXT_CHARS / 2);
  });

  it('件数と理由の両方を言う', () => {
    const note = analyzeBatchNote(packAnalyzeText(['aa', 'bb', 'cc'], 5), 5);
    expect(note).toBe('3 件のうち、先頭 2 件だけを分析に送ります (1 回に送れるのは 5 字までのため、残り 1 件は含みません)。');
  });

  it('1 件も入らないときは、その理由を言う', () => {
    const note = analyzeBatchNote(packAnalyzeText(['zzzzzz'], 3), 3);
    expect(note).toBe('1 件目だけで 3 字を超えるため、分析に送れる行がありません。');
  });

  it('★ 文は終止形で終わる (連結して読める)', () => {
    for (const b of [packAnalyzeText(['aa', 'bb', 'cc'], 5), packAnalyzeText(['zzzzzz'], 3)]) {
      const note = analyzeBatchNote(b, b.included === 0 ? 3 : 5);
      expect(note).not.toBeNull();
      expect(note!.endsWith('。')).toBe(true);
    }
  });
});
