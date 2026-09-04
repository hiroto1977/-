import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_ADVISOR_ACTION_ITEMS,
  MAX_ADVISOR_ITEM_CHARS,
  MAX_ADVISOR_RATIONALE_CHARS,
  MAX_ADVISOR_RECOMMENDATIONS,
  MAX_ADVISOR_RISK_FACTORS,
} from '../advisorResponseLimits';

/*
 * **第三者が返してくる値の上限は、両ビルドで同じでなければならない。**
 *
 * `business/advise` の応答は LLM が返す。それを画面へ出す手前の検査に
 * 6 つの上限があり、**main と web-shim に字面で二重に**書かれていた
 * (2026-08-25 実測)。片方だけ緩めば、そのビルドだけが**より大きな
 * 第三者由来の値**を通す。
 *
 * 検証器そのものはまとめない —— main は事業 id の許可も見ており、
 * まとめると「どちらかの流儀へ寄せる」変更になる。**ずれていたのは
 * 数字だけ**なので、数字だけを 1 つにして、ここで**字面が戻っていない
 * ことを留める**。
 */

const SRC = [
  ['main/clients/business.ts', join(__dirname, '../../main/clients/business.ts')],
  ['renderer/web-shim.ts', join(__dirname, '../../renderer/web-shim.ts')],
] as const;

/** その数字が、応答検査の文脈で字面に戻っていないか。 */
const LITERAL_BOUNDS = [
  ['recommendations', /recommendations\.length\s*>\s*\d+/],
  ['rationale', /rationale\.length\s*>\s*\d+/],
  ['actionItems', /actionItems\.length\s*>\s*\d+/],
  ['riskFactors', /riskFactors\.length\s*>\s*\d+/],
] as const;

describe('アドバイザーの応答の上限は 1 つだけ', () => {
  it('値が両ビルドで使われる 1 組であること (走査の的)', () => {
    expect(MAX_ADVISOR_RECOMMENDATIONS).toBe(5);
    expect(MAX_ADVISOR_RATIONALE_CHARS).toBe(600);
    expect(MAX_ADVISOR_ACTION_ITEMS).toBe(5);
    expect(MAX_ADVISOR_RISK_FACTORS).toBe(3);
    expect(MAX_ADVISOR_ITEM_CHARS).toBe(240);
  });

  it.each(SRC)('%s が共有の定数を読んでいる', (_label, path) => {
    const code = readFileSync(path, 'utf8');
    expect(code, 'advisorResponseLimits を読んでいない').toContain('advisorResponseLimits');
  });

  it.each(SRC)('%s に応答の上限が字面で書かれていない', (_label, path) => {
    const code = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const back = LITERAL_BOUNDS.filter(([, re]) => re.test(code)).map(([name]) => name);
    expect(back, '上限が字面へ戻っています (shared/advisorResponseLimits.ts を使ってください)').toEqual([]);
  });

  /*
   * **「無いことの検査」には標本を添える。** 上の規則が、元の書き方に
   * 実際に当たることを同じ検査の中で確かめる —— 綴りが 1 つ違えば
   * どの入力でも通る空の検査になる。
   */
  it('★ 上の規則は、元の書き方に本当に当たる', () => {
    const OLD = [
      'if (obj.recommendations.length > 5) {',
      'if (rec.rationale.length > 600) {',
      'if (rec.actionItems.length > 5) {',
      'if (rec.riskFactors.length > 3) {',
    ];
    for (const [name, re] of LITERAL_BOUNDS) {
      expect(OLD.some((o) => re.test(o)), `${name} の規則が元の書き方に当たらない`).toBe(true);
    }
  });
});
