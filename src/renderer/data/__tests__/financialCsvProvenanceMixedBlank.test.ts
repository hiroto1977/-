/**
 * **断り書きが 1 つでも空なら、CSV の書き出しは投げる。** (パス 502)
 *
 * CSV の出所の行 (`CsvProvenance`) は「画面と同じ断り書き」を表の後ろに残すための必須の引数で、
 * **空の断り書きを「書いたことになっている空欄」にしない**ため、空・空白だけの文を投げて断る。
 * 既存の検査は「配列が空」と「空白だけの文 1 つだけの配列」しか見ておらず、
 * **本物の断りに空の 1 文が混ざった配列** (全部ではなく一部が空) は通っていた —— 判定が
 * 「全部が空」になっても (`some` が `every` になっても) 気付けない。
 * 断りは `toThrow(new Error(…))` で値ごと照合する (投げた値が偽だと文面の照合を飛ばして合格する形を避ける)。
 */
import { describe, expect, it } from 'vitest';
import { ratiosToCsv, statementToCsv } from '../financialCsv';

const NOTES_BLANK = new Error('CsvProvenance.notes が空です (画面と同じ断り書きを渡してください)');
const SCOPE_BLANK = new Error('CsvProvenance.scope が空です (書き出しの対象を書いてください)');

describe('CsvProvenance — 断り書きの一部が空 (パス 502)', () => {
  const MIXED: readonly (readonly string[])[] = [
    ['※ 断り 1', ''],
    ['※ 断り 1', '   '],
    ['', '※ 断り 2'],
    ['※ 断り 1', ' ', '※ 断り 3'],
    ['※ 断り 1', '\t\n'],
  ];

  for (const notes of MIXED) {
    it(`★ 断り書き ${JSON.stringify(notes)} は、本物が混ざっていても投げる (指標 CSV・諸表 CSV とも)`, () => {
      expect(() => ratiosToCsv([], { scope: 'A事業', notes })).toThrow(NOTES_BLANK);
      expect(() => statementToCsv([], { scope: 'A事業', notes })).toThrow(NOTES_BLANK);
    });
  }

  it('★ 対照: 断り書きがすべて本物なら投げず、出所の行は 空行 → 対象 → 断り書き の順', () => {
    const csv = statementToCsv([], { scope: 'A事業', notes: ['※ 断り 1', '※ 断り 2'] });
    expect(csv.split('\r\n')).toEqual(['項目,金額', ',', '対象: A事業,', '※ 断り 1,', '※ 断り 2,']);
  });

  it('★ 対象が空 (空白だけ) なら、断り書きが本物でも投げる', () => {
    expect(() => ratiosToCsv([], { scope: ' ', notes: ['※ 断り 1'] })).toThrow(SCOPE_BLANK);
    expect(() => statementToCsv([], { scope: '', notes: ['※ 断り 1'] })).toThrow(SCOPE_BLANK);
  });
});
