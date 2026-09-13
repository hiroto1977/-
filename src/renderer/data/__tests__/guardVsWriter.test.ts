/**
 * **画面の ⛔ と、書き手の断りが一致しているか** (パス 215)。
 *
 * パス 214 で閉じたのは「⛔ の値が保存される」道 —— 経営サマリーの水耕栽培は
 * `床面積 = −9999` を ⛔ と表示したまま保存でき、そのあと `営業利益 −￥6,000,000` を
 * 出していた。同じ形を探して 67 欄の**分母**を採ったが、読むと大半は
 * **過大計上**だった (画面全体の「書く」ボタンを数えていたので、その欄を読まない
 * ボタンも入っていた):
 *
 * | 画面 | 分母 | 読んだ結果 |
 * | --- | --- | --- |
 * | overview | 14 | **本物** —— パス 214 で閉じた |
 * | real-estate | 54 行 | 物件フォームの 4 欄には `parsePropertyEntry` が在る (下でその一致を測る) |
 * | mutual-funds | 22 行 | 算盤の欄で、値は `—` に倒れる。銘柄フォームは**素の `<input>`** で ⛔ を持たない |
 *
 * **数は機械が、判断は散文が持つ。** 分母が縮んだことも記録に残す。
 *
 * ## この検査が守っているもの
 *
 * 物件フォームは ⛔ (`GuardedNumber`) と断り (`parsePropertyEntry` が投げる) を
 * **二重に**持つ。今は一致しているが、**宣言だけを直すと食い違う** ——
 * たとえば取得価格に天井 `sane` を足すと、画面は ⛔ にするのに `toAmount` は
 * 通してしまい、**画面が赤で断っている値が保存される**。
 *
 * 向きが大事: 危ないのは **⛔ なのに書き手が受け取る**方だけ。
 * 逆 (画面は通すが書き手が断る) は分かりにくいが、悪い値は入らない。
 *
 * ## 天井は 2 種あり、⛔ になるのは片方だけ
 *
 * `guardNumber` は `spec.max ?? rule.max` を超えたら **`fatal`**、
 * `spec.sane ?? rule.sane` を超えたら **`warn`** (「桁を間違えていないか確認して
 * ください」) を返す。対照を最初 `sane: 100` で組んで**鳴らなかった** ——
 * 私の対照の作り方の誤りで、コードの報せではない。`max: 100` にすると
 * `9999999999` と `１２３` の 2 件が漏れとして名指しされる。
 * **天井を足すときは、それが ⛔ か ⚠️ かで書き手との一致の要否が変わる。**
 */
import { describe, expect, it } from 'vitest';
import { guardNumber } from '../inputGuards';
import { parsePropertyEntry, PROPERTY_FORM_SPECS } from '../investments';

/** 正しい 1 件 (この上で 1 欄だけ差し替える)。 */
const VALID = {
  name: 'テスト物件',
  type: 'アパート',
  monthlyRent: '100000',
  purchasePrice: '12000000',
  monthlyExpenses: '0',
  monthlyLoan: '0',
  occupied: true,
} as const;

/**
 * 入力の標本。**⛔ を作る種類を全部通す** —— 負・0・読めない・単位語・
 * 途中の記号・非有限・全角・小数・空欄・空白だけ。
 */
const PROBES = [
  '-9999', '-1', '-0.5', '0', '', '  ', '9999999999', '1e309',
  '百', '10万', '1,0,0', 'NaN', 'Infinity', '1.5', '１２３',
] as const;

type Field = keyof typeof PROPERTY_FORM_SPECS;
const FIELDS = Object.keys(PROPERTY_FORM_SPECS) as Field[];

function writerRejects(field: Field, value: string): boolean {
  try {
    parsePropertyEntry({ ...VALID, [field]: value });
    return false;
  } catch {
    return true;
  }
}

describe('物件フォーム — 画面の ⛔ と保存の断りが一致する (パス 215)', () => {
  it('★ 走査が痩せていない (4 欄 × 15 通り)', () => {
    // **鳴らない走査は「合格」ではない。** 欄か標本が減れば下の主張は薄まる。
    expect(FIELDS).toEqual(['monthlyRent', 'purchasePrice', 'monthlyExpenses', 'monthlyLoan']);
    expect(PROBES.length).toBe(15);
  });

  it('★ 標本が実際に ⛔ を作っている (空振りしていない)', () => {
    // 肯定形の検査 —— 「食い違いが無い」だけだと、⛔ が 1 つも出ていなくても通る。
    const fatals = FIELDS.flatMap((f) =>
      PROBES.filter((v) => guardNumber(v, PROPERTY_FORM_SPECS[f])?.level === 'fatal'),
    );
    expect(fatals.length).toBeGreaterThanOrEqual(20);
  });

  it('★ ⛔ の値は 1 つも保存されない (危ない向き)', () => {
    const leaks: string[] = [];
    for (const f of FIELDS) {
      for (const v of PROBES) {
        const fatal = guardNumber(v, PROPERTY_FORM_SPECS[f])?.level === 'fatal';
        if (fatal && !writerRejects(f, v)) leaks.push(`${f} = ${JSON.stringify(v)}`);
      }
    }
    expect(leaks, '画面が ⛔ で断っている値を parsePropertyEntry が受け取っている').toEqual([]);
  });

  it('★ 正しい 1 件は通る (門が全部を落としていない)', () => {
    // 対照側 —— 上の主張は「全部断る」実装でも通ってしまう。
    const parsed = parsePropertyEntry(VALID);
    expect(parsed.monthlyRent).toBe(100000);
    expect(parsed.purchasePrice).toBe(12000000);
  });
});
