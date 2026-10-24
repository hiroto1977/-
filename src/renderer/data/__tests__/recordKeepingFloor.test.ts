/**
 * **記録・保存の義務に、アプリが勝手な金額の下限を付けない** (2026-09-24 · パス 440)。
 *
 * 直す前の `keihi` (経費精算書) の注意書きは、こう述べていた:
 *
 * > 3万円以上の交際費・会議費については、参加者の氏名・人数・目的の記録を残してください。
 *
 * 租税特別措置法61条の4 の**飲食費を交際費等から除外する特例**は、適用の条件として
 * 書類の保存を求めており、**その保存に金額の下限は無い**。そして判定の基準額は
 * 「総額 3 万円」ではなく **1 人当たり 1 万円**である (2024-04-01 以後の支出。
 * それより前は 5,000 円)。3 万円は**廃止された**消費税法30条7項ただし書
 * (3 万円未満の課税仕入れは帳簿のみで仕入税額控除) の数字で、インボイス制度の
 * 開始 (2023-10-01) で無くなっている。
 *
 * ★ **向きが利用者の損である** —— 保存は**除外の条件**なので、1 人 8,000 円の会食で
 * 「3 万円未満だから記録は要らない」と読んだ利用者は、**その飲食費を交際費等から
 * 除外できなくなる**。交際費等は資本金 1 億円超の法人で 50% 損金不算入 (100 億円超は
 * 全額)、中小法人でも年 800 万円の定額控除枠を食う。**記録を減らす側に誤っていた。**
 *
 * ★ **アプリ自身が正しい規則を持っていた** —— 確証つきコーパス
 * (`complianceKnowledge.ts` の `tax-entertainment-expense-meal-threshold`・出典は
 * 国税庁タックスアンサー No.5265 と中小企業庁) が「1 人当たり 10,000 円以下へ引上げ」と
 * 「飲食年月日・参加者の氏名/関係/人数・費用額・店名所在地等を記載した書類の保存が必要」を
 * **両方**述べている。**2 つの法知識が矛盾していて、出典を持たない側が画面に出ていた。**
 *
 * ★ **同じ note 配列の 2 行上は 3 万円を正しく使っている** —— 「3万円未満の公共交通機関に
 * よる旅客の運送（公共交通機関特例）」。こちらは**義務を免除する側**の下限で、今も生きている。
 * **同じ配列の中で、同じ数が一方では正しく、他方では廃止された規則から来ていた。**
 *
 * ## この検査の形
 *
 * - **基準額はコーパスから導く** (数を 2 度書かない)。コーパスの言い回しが変われば
 *   ここが落ちて人が読み直す —— 出典つきの資産なので、黙って変わるより鳴る方がよい。
 * - **背骨は振る舞い** —— 実物の `STUDIO_TEMPLATES` から注意書きを引いて読む。
 * - **母集団は原文の走査** —— 記録・保存の義務を述べる文を全部拾い、**金額の下限で
 *   義務を始める文が 0 件**であることを両方向の台帳で留める。針が的に当たることは
 *   **直す前の文そのもの**を標本にして示す (規約: 不在の主張には標本を添える)。
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STUDIO_TEMPLATES } from '../docStudioData';
import { VERIFIED_COMPLIANCE } from '../complianceKnowledge';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

/** 飲食費の除外特例を持つ、確証つきコーパスの項目。 */
const MEAL_FACT_ID = 'tax-entertainment-expense-meal-threshold';

/** 直す前の文 —— 針が的に当たることを示す標本 (法則 `no-weakness-as-spec` の逆: 標本は残す)。 */
const PRE_FIX_NOTE = '3万円以上の交際費・会議費については、参加者の氏名・人数・目的の記録を残してください。';

/** 「1万」「10,000」のどちらの綴りでも同じ数にする。 */
function yenOf(text: string): number {
  const man = /^([0-9,]+)万$/.exec(text.trim());
  if (man !== null) return Number(man[1]!.replace(/,/g, '')) * 10_000;
  return Number(text.replace(/[,\s]/g, ''));
}

/** コーパスの statement から「今の」1 人当たり基準額を導く。 */
function corpusMealThresholdYen(): number {
  const claim = VERIFIED_COMPLIANCE.find((c) => c.value.id === MEAL_FACT_ID);
  expect(claim, `コーパスに ${MEAL_FACT_ID} が無い`).toBeDefined();
  const m = /から\s*([0-9,]+)\s*円以下へ引き上げ/.exec(claim!.value.statement);
  expect(m, `コーパスの statement から基準額を導けない: ${claim!.value.statement.slice(0, 120)}`).not.toBeNull();
  return yenOf(m![1]!);
}

/** 飲食費の除外特例を述べる注意書き —— 無ければ**その事実を名指しして**落とす。 */
function mealNote(): string {
  const doc = STUDIO_TEMPLATES.find((t) => t.id === 'keihi');
  expect(doc, '経費精算書 (keihi) が見つからない').toBeDefined();
  const note = (doc!.note ?? []).find((n) => n.includes('交際費等から除外'));
  expect(
    note,
    `飲食費の除外特例を述べる注意書きが無い。今ある注意書き: ${JSON.stringify(doc!.note ?? [])}`,
  ).toBeDefined();
  return note!;
}

const OBLIGATION = /記録|保存|残して|控えて/;
/** 「N 円以上」「N 万円以上」—— 義務を**始める**下限。 */
const AMOUNT_FLOOR = /[0-9０-９][0-9０-９,，]*\s*(?:万)?円\s*以上/;

/** 原文から、10 文字以上の文字列リテラルを行番号つきで拾う。 */
function literals(src: string): readonly { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const re = /(['`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    if (m[2]!.length >= 10) out.push({ line: src.slice(0, m.index).split('\n').length, text: m[2]! });
  }
  return out;
}

const SOURCES: readonly { name: string; src: string }[] = [
  { name: 'docStudioData.ts', src: readOriginalSource(join(__dirname, '..', 'docStudioData.ts')) },
  { name: 'docStudioChecks.ts', src: readOriginalSource(join(__dirname, '..', 'docStudioChecks.ts')) },
];

describe('交際費の飲食費 —— 記録は除外の条件で、金額の下限は無い', () => {
  it('★ 注意書きの基準額は、確証つきコーパスと同じ数を「1 人当たり」で名乗る', () => {
    const note = mealNote();
    const m = /1\s*人\s*当たり\s*([0-9,万]+)\s*円以下/.exec(note);
    expect(m, `「1 人当たり N 円以下」を名乗っていない: ${note}`).not.toBeNull();
    expect(yenOf(m![1]!), '注意書きの基準額とコーパスの基準額').toBe(corpusMealThresholdYen());
  });

  it('★ 保存は「金額の大小にかかわらず」要ると述べ、根拠条文を名乗る', () => {
    const note = mealNote();
    expect(note).toContain('金額の大小にかかわらず');
    expect(note).toContain('租税特別措置法61条の4');
    // 直す前の文は下限を付けていた。同じ針をそこへ当てると鳴る (標本)。
    expect(AMOUNT_FLOOR.test(PRE_FIX_NOTE), '針が直す前の文に当たる').toBe(true);
    expect(AMOUNT_FLOOR.test(note), '直した文には下限が無い').toBe(false);
  });

  it('★ 法定の記載事項をすべて挙げる (1 つでも欠けると除外を受けられない)', () => {
    const note = mealNote();
    // 租税特別措置法施行規則21条の18の4。直す前の文は「氏名・人数・目的」の 3 つだけで、
    // 年月日・金額・店名・所在地が無く、「目的」は法定事項ではなかった。
    for (const item of ['年月日', '氏名', '関係', '人数', '金額', '所在地']) {
      expect(note, `法定の記載事項「${item}」が注意書きに無い`).toContain(item);
    }
  });

  it('基準額を超えたら全額が交際費等になることを述べる (「超えた分だけ」ではない)', () => {
    const note = mealNote();
    expect(note).toContain('全額');
  });

  it('コーパスは出典つきで、確認時点を持つ (この検査が寄りかかる資産)', () => {
    const claim = VERIFIED_COMPLIANCE.find((c) => c.value.id === MEAL_FACT_ID)!;
    expect(claim.sources.length, '独立した出典').toBeGreaterThanOrEqual(2);
    expect(claim.sources.some((s) => s.type === 'government'), '公的な出典').toBe(true);
    expect(claim.value.asOf).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('母集団 —— 記録・保存の義務に金額の下限を付ける文は 0 件 (両方向)', () => {
  /** 義務を述べる文のうち、金額の下限を持つもの。 */
  function floored(): readonly string[] {
    const out: string[] = [];
    for (const { name, src } of SOURCES) {
      for (const { line, text } of literals(src)) {
        if (!OBLIGATION.test(text)) continue;
        if (AMOUNT_FLOOR.test(text)) out.push(`${name}:${line}`);
      }
    }
    return out;
  }

  it('★ 義務を述べる文はどれも「N 円以上」で始まらない', () => {
    // 下限が正当に出るのは**義務を免除する側**だけである (公共交通機関特例の
    // 「3万円未満」は帳簿のみでよいという緩和で、義務の開始点ではない)。
    expect(floored(), '記録・保存の義務を金額の下限で始めている文').toEqual([]);
  });

  it('走査が空虚でない (床) —— 義務を述べる文が実際に在る', () => {
    let n = 0;
    for (const { src } of SOURCES) for (const { text } of literals(src)) if (OBLIGATION.test(text)) n += 1;
    expect(n, '記録・保存の義務を述べる文の数').toBeGreaterThanOrEqual(30);
  });

  it('★ 針が的に当たる —— 直す前の文を母集団に混ぜると 1 件になる', () => {
    const sample = [PRE_FIX_NOTE];
    const hit = sample.filter((t) => OBLIGATION.test(t) && AMOUNT_FLOOR.test(t));
    expect(hit, '直す前の文は義務 + 下限の両方を持つ').toEqual([PRE_FIX_NOTE]);
  });

  it('免除の側の下限は落とさない (公共交通機関特例の「3万円未満」は今も正しい)', () => {
    const note = (STUDIO_TEMPLATES.find((t) => t.id === 'keihi')!.note ?? [])
      .find((n) => n.includes('公共交通機関特例'));
    expect(note, '公共交通機関特例の注意書きが無い').toBeDefined();
    expect(note!).toContain('3万円未満');
    expect(AMOUNT_FLOOR.test(note!), '「未満」は下限ではない').toBe(false);
  });
});
