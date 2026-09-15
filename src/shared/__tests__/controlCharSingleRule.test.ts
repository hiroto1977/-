import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { hasControlChar } from '../controlChars';
import { hasControlChars } from '../tokenInput';
import { readOriginalSource } from './originalSource';

/*
 * **制御文字の判定は、アプリ全体で 1 つだけ。** (2026-09-15 · パス 280)
 *
 * `shared/controlChars.ts` の docblock は、自分が在る理由をこう書いている:
 *
 *     独立した小さなモジュールにしてあるのは、**同じ判定が 2 つ目を作りかけた**ため。
 *     「0x1f まで」か「0x20 未満」か、0x7f を入れるか — どれも一見して差が
 *     出ないので、片方だけ緩んでも気付けない。
 *
 * **その 2 つ目が `shared/tokenInput.ts` に在った** —— 正規表現
 * **U+0000〜U+001F と U+007F の文字クラスを持つ正規表現**で、名前は 1 字違いの
 * `hasControlChars`。範囲そのものをここに書かない —— 書くと `lint:charset` が
 * 落とす (パス 280 で実際に落ちた。制御文字の話をする文書は、制御文字を
 * 含んではいけない)。
 * しかも資格情報の入口 (`checkTokenInput`) と保管層の床が読む側である。
 *
 * ## 実測 (パス 280)
 *
 * **2 つは一致していた** —— BMP のスカラー値すべて (lone surrogate を除く)
 * + astral + lone surrogate + 貼り付けで混ざる形、計 63,504 標本で食い違い 0 件。
 * だから**欠陥ではなかった**。判定を 1 つに寄せたのは、
 * 「いつでも欠陥になれる形」を残さないためである。
 *
 * この検査が留めるのは 2 つ:
 *   ① 振る舞いが一致する (実装が分かれても鳴る)
 *   ② `tokenInput.ts` が**自分の範囲を持たない** (綴りが戻れば鳴る)
 *
 * ② だけでは足りない —— 綴りを変えて同じことをする道が残る。
 * ① だけでも足りない —— 今日一致しているだけで、分岐は許されたままになる。
 */

/**
 * ブロックコメントと行コメントを落とす。
 *
 * **文字列リテラルは残す** —— 落とすと下の「規則が実物の綴りに当たる」標本
 * (旧実装を文字列で持つ) まで消えて、その検査が空になる。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** 制御文字はリテラルで書かない (`lint:charset` が混入を落とす)。 */
const ch = (code: number): string => String.fromCharCode(code);

/** 両方に同じ標本を通す。母集団は BMP のスカラー値すべて。 */
function disagreements(): { samples: number; diff: string[] } {
  const diff: string[] = [];
  let samples = 0;
  const check = (label: string, s: string): void => {
    samples += 1;
    if (hasControlChar(s) !== hasControlChars(s)) diff.push(label);
  };

  for (let cp = 0; cp <= 0xffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogate は下で別に見る
    check(`bmp:${cp.toString(16)}`, String.fromCodePoint(cp));
  }
  // astral —— `charCodeAt(0)` が**高位サロゲート** (>= 0xd800) を返す所。
  // 走査の実装が code point 単位で歩くので、ここが 2 つの実装の分かれ目になりうる。
  for (const cp of [0x10000, 0x1f600, 0x10ffff, 0x1d400]) {
    check(`astral:${cp.toString(16)}`, `a${String.fromCodePoint(cp)}b`);
    check(`astral+ctrl:${cp.toString(16)}`, `${String.fromCodePoint(cp)}${ch(0x07)}`);
  }
  // 壊れた文字列 (貼り付けで実際に来る)
  check('lone-high', ch(0xd800));
  check('lone-low', ch(0xdc00));
  check('lone+lf', `${ch(0xd800)}${ch(0x0a)}`);
  // 貼り付けで混ざる形
  check('crlf', `tok${ch(0x0d)}${ch(0x0a)}en`);
  check('tab', `tok${ch(0x09)}en`);
  check('vt', `tok${ch(0x0b)}en`);
  check('del', `tok${ch(0x7f)}en`);
  check('nul', `tok${ch(0x00)}en`);
  check('c1', `tok${ch(0x80)}en`);
  check('clean', 'ghp_abcDEF123');
  return { samples, diff };
}

describe('制御文字の判定は 1 つだけ', () => {
  it('★ 2 つの入口は同じ答えを返す (BMP 全域 + astral + 壊れた文字列)', () => {
    const { samples, diff } = disagreements();
    // 走査の生死 —— 標本が減ったら「一致した」ではなく「測っていない」。
    expect(samples, '標本が少なすぎる (走査が壊れた)').toBeGreaterThanOrEqual(63_000);
    expect(diff, `食い違った標本:\n  ${diff.slice(0, 20).join('\n  ')}`).toEqual([]);
  });

  it('★ tokenInput.ts は自分の制御文字の範囲を持たない (実装は 1 つ)', () => {
    /*
     * **コメントを落としてから当てる。** 最初はそのまま当てて落ちた ——
     * `tokenInput.ts` の docblock が、消した旧実装を**引用して**いるためである。
     * 「印について書いた文書は、印そのものと見分けられなければならない」
     * (`originalSource.ts` が同じ罠を 2026-09-07 に記録している) の別の面で、
     * 今回は**自分が書いた説明が自分の規則に当たった**。
     */
    const src = stripComments(readOriginalSource(join(__dirname, '..', 'tokenInput.ts')));
    // 範囲を綴る形すべて —— u 形式・x 形式・数値比較の 3 通り。
    const ownRange = [/\\u0000-\\u001f/, /\\x00-\\x1f/, /<\s*0x20/, /===\s*0x7f/];
    const found = ownRange.filter((re) => re.test(src)).map((re) => re.source);
    expect(found, `tokenInput.ts が自分の範囲を持っている: ${found.join(', ')}`).toEqual([]);
    // 逆向き: 委譲していることを**肯定形**で確かめる (無いことの検査だけにしない)。
    expect(src).toContain("from './controlChars'");
    expect(src).toMatch(/return hasControlChar\(value\);/);
  });

  it('規則は実物の綴りに当たる (空の検査になっていない)', () => {
    // ② の規則が、実際にその形へ当たることを標本で示す。
    const sample = 'return /[\\u0000-\\u001f\\u007f]/.test(value);';
    expect(/\\u0000-\\u001f/.test(sample), '規則が旧い綴りに当たらない').toBe(true);
    const sample2 = 'if (c < 0x20 || c === 0x7f) return true;';
    expect(/<\s*0x20/.test(sample2), '規則が走査の綴りに当たらない').toBe(true);
  });

  it('判定そのものは C0 と DEL を断り、C1 は断らない (範囲の標本)', () => {
    for (const code of [0x00, 0x09, 0x0a, 0x0b, 0x0d, 0x1f, 0x7f]) {
      expect(hasControlChar(`a${ch(code)}b`), `0x${code.toString(16)} は断る`).toBe(true);
      expect(hasControlChars(`a${ch(code)}b`), `0x${code.toString(16)} は断る (入口)`).toBe(true);
    }
    for (const code of [0x20, 0x21, 0x7e, 0x80, 0x9f, 0xa0]) {
      expect(hasControlChar(`a${ch(code)}b`), `0x${code.toString(16)} は通す`).toBe(false);
      expect(hasControlChars(`a${ch(code)}b`), `0x${code.toString(16)} は通す (入口)`).toBe(false);
    }
  });
});
