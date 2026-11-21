/**
 * **スキル評価の「未評価の軸」の断りを、全文で留める。** (パス 502)
 *
 * 評価が入っていない軸が在るとき、平均の分母は軸の数と違う (評価済みだけで平均する)。
 * その理由は数字からは読めないので、画面は 1 文で述べる (`unevaluatedAxesNote`)。
 * 既存の検査は軸名が 1 つだけの標本と断片 (`評価済み 4 軸で出しています`) しか見ておらず、
 * **複数の軸名を並べる区切り (`・`)** が消えても通っていた。区切りが消えると
 * 「交渉力顧客管理力」のように軸名が 1 語に繋がり、どの軸が未評価かが読めなくなる。
 */
import { describe, expect, it } from 'vitest';
import { skillEvaluation, unevaluatedAxesNote } from '../memberCare';

const AXES = ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'];

describe('unevaluatedAxesNote — 全文 (パス 502)', () => {
  it('★ 1 軸だけ未評価: 軸名・評価済みの軸数・0 点として平均しない理由', () => {
    expect(unevaluatedAxesNote(skillEvaluation(AXES, [4, 4, 4, 4]))).toBe(
      '顧客管理力 は評価が入っていないため、平均は評価済み 4 軸で出しています（0 点として平均すると全体が下がります）。',
    );
  });

  it('★ 2 軸が未評価: 軸名を「・」で並べる', () => {
    expect(unevaluatedAxesNote(skillEvaluation(AXES, [4, 4, 4]))).toBe(
      '交渉力・顧客管理力 は評価が入っていないため、平均は評価済み 3 軸で出しています（0 点として平均すると全体が下がります）。',
    );
  });

  it('★ 3 軸が未評価: 並びは軸の並びのまま・区切りは軸数 − 1 個', () => {
    const note = unevaluatedAxesNote(skillEvaluation(AXES, [5, 3]));
    expect(note).toBe(
      'プレゼン力・交渉力・顧客管理力 は評価が入っていないため、平均は評価済み 2 軸で出しています（0 点として平均すると全体が下がります）。',
    );
  });

  it('★ 1 軸も評価されていなければ、全軸を並べて「平均・強み・伸びしろは算定していません」と言う', () => {
    expect(unevaluatedAxesNote(skillEvaluation(AXES, []))).toBe(
      '評価が 1 軸も入っていません（営業力・顧客対応力・プレゼン力・交渉力・顧客管理力）。平均・強み・伸びしろは算定していません。',
    );
  });

  it('★ 対照: 全軸が評価されていれば断りは出さない (null)', () => {
    expect(unevaluatedAxesNote(skillEvaluation(AXES, [4, 4, 4, 4, 4]))).toBeNull();
  });
});
