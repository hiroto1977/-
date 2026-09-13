/**
 * **読めない単価を「無効リスクなし」と言わない。** (2026-09-08 · パス 94)
 *
 * 適格請求書の明細の金額は `DocstudioPage` が
 *
 *     const unitPrice = readNumber(priceRaw) ?? 0;
 *
 * で計算する。一方、交付前チェック (`checkDoc`) は `docStudioChecks` の
 * `toNum` で読む。**この 2 つは役割が違う** ——
 *
 * - `toNum` は**意図して緩い**。差込欄には「40時間」「第5条」「100個」のような
 *   散文が入るので、そこから数を拾えないと 36協定の上限や議事録の定足数を
 *   判定できない (既存の検査が `toNum('第5条') === 5` を「数字を含めば拾う」と
 *   明記している)。
 * - `readNumber` は**厳しい**。飾りの**位置**まで見るので、金額を取り違えない。
 *
 * 問題は 2 つ在ることではなく、**間に橋が無かった**ことである。
 * 「`toNum` は読めるが `readNumber` は読めない」帯に入る入力は、
 * **明細が ¥0 で計上されるのに、交付前チェックが
 * 「無効リスクは見つかりませんでした」と言っていた。**
 *
 * 実測でその帯に入るもの (`readNumber` は null · 旧 `toNum` は数を返す):
 *
 * | 入力 | `toNum` | `readNumber` |
 * | --- | --- | --- |
 * | `30 000` | 30000 | **null → ¥0** |
 * | `1,23` | 123 | **null → ¥0** |
 * | `1、234` | 1234 | **null → ¥0** |
 * | `100m2` | 100 | **null → ¥0** |
 *
 * **空欄は最初から警告していた** (「品目N の単価が未入力です。金額 0 円として
 * 計算されます。」)。空欄と「読めない」の**非対称**がそのまま欠陥だった。
 *
 * ついでに `toNum` の**符号の取り違え**も直した: 全角 `－` は畳んでいたが
 * **U+2212 `−` を畳んでいなかった**ので `'−500'` が **+500** と読まれ、
 * `num()` 経由で金額の規則に入っていた。
 */
import { describe, expect, it } from 'vitest';
import { checkDoc, toNum } from '../data/docStudioChecks';
import { readNumber } from '../data/inputGuards';
import { STUDIO_TEMPLATES } from '../data/docStudioData';

const invoice = STUDIO_TEMPLATES.find((d) => d.id === 'invoice');
if (!invoice) throw new Error('invoice doc missing');

/** 品目 1 を埋めた差込値。単価だけを差し替えられる。 */
function withPrice(price: string, qty = '1'): Record<string, string> {
  return {
    i1kind: '標準10%',
    i1name: 'コンサルティング',
    i1qty: qty,
    i1price: price,
  };
}

const messages = (values: Record<string, string>): string[] =>
  checkDoc(invoice, values).map((i) => i.message);

/** 「toNum は読めるが readNumber は読めない」帯の実測値。 */
const SILENT_ZERO = ['30 000', '1,23', '1、234', '100m2'];

describe('請求書 — 読めない単価に断りを出す', () => {
  it('★ 標本が本当にその帯に入っている (前提を確かめてから当てる)', () => {
    // **不在を主張する前に、帯が空でないことを確かめる。**
    for (const raw of SILENT_ZERO) {
      expect(toNum(raw), `${raw}: toNum が読めていない`).not.toBeNull();
      expect(readNumber(raw), `${raw}: readNumber が読めてしまう`).toBeNull();
    }
  });

  it('★ その帯の入力に「金額 0 円として計算されます」と言う', () => {
    for (const raw of SILENT_ZERO) {
      const msgs = messages(withPrice(raw));
      expect(
        msgs.some((m) => m.includes('読み取れません') && m.includes('0 円')),
        `${raw}: 明細は ¥0 になるのに、何も言っていない`,
      ).toBe(true);
      // 入力値そのものを文面に載せる (どれを直せばよいか分かるように)
      expect(msgs.some((m) => m.includes(raw))).toBe(true);
    }
  });

  it('★ 対照: 読める単価では断りを出さない (いつでも鳴る形になっていない)', () => {
    for (const raw of ['1234', '1,234', '１，２３４', '500円', '12.5']) {
      expect(readNumber(raw), `${raw} は読めるはず`).not.toBeNull();
      const msgs = messages(withPrice(raw));
      expect(msgs.some((m) => m.includes('読み取れません')), `${raw} で誤って鳴った`).toBe(false);
    }
  });

  it('★ 空欄は従来の文面のまま (2 つの断りが二重に出ない)', () => {
    const msgs = messages(withPrice(''));
    expect(msgs.some((m) => m.includes('単価が未入力です'))).toBe(true);
    expect(msgs.some((m) => m.includes('読み取れません'))).toBe(false);
  });

  it('★ 数量も同じ帯で断る (明細は数量 0 で計上される)', () => {
    const msgs = messages(withPrice('1000', '2 個 3'));
    expect(readNumber('2 個 3')).toBeNull();
    expect(msgs.some((m) => m.includes('数量') && m.includes('読み取れません'))).toBe(true);
  });
});

describe('toNum — 符号を取り違えない', () => {
  it('★ U+2212 の負符号を負として読む (直す前は +500 だった)', () => {
    expect(toNum('−500')).toBe(-500);
    // 対照: 全角ハイフンマイナスと半角も同じ答え
    expect(toNum('－500')).toBe(-500);
    expect(toNum('-500')).toBe(-500);
  });

  it('緩い読み取りは保ったまま (散文から数を拾う役割を壊していない)', () => {
    // この 3 つは既存の検査が仕様として留めている振る舞い。
    expect(toNum('40時間')).toBe(40);
    expect(toNum('第5条')).toBe(5);
    expect(toNum('100個')).toBe(100);
  });

  it('△ / ▲ はまだ負として読まない (未決の判断として記録した)', () => {
    // 会計の慣行では負数だが、書面の数字の意味を変える判断なので
    // このパスでは決めない。**現状を明示して、黙って変わらないようにする。**
    expect(toNum('△500')).toBe(500);
    expect(toNum('▲500')).toBe(500);
  });
});
