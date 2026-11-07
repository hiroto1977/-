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
 *
 * ## 両方向になった (2026-09-27 · パス 493l)
 *
 * 関門は欄ごとに**結果を述べる**ようになった —— この表の欄は `refusingSpecs('save', …)` で
 * 包まれているので、断るときは「直すまで保存できません」「入力するまで保存できません」、
 * 空欄を 0 として書くときは「保存すると 0 円 として記録されます」と言う。述べた文が
 * 真であるには、**書き手が同じ答えを出す**必要がある:
 *
 * - 関門が断る (`outcome: 'refused'`) ⇔ 書き手が投げる —— 「保存できません」と言って
 *   保存されれば文が偽、黙って断られれば利用者は理由を読めない
 * - 関門が「0 として記録されます」と言う ⇒ 書き手は受け取り、**その欄は 0** になる
 *
 * 直す前 (パス 493l より前) は ⛔ しか数えておらず、**取得価格の空欄**は ⚠️「未入力です。
 * 0 円 として計算されています」を出しながら書き手が「取得価格は 1 円以上」で断っていた ——
 * 片方向の検査はそれを「安全な向き」として通していた。
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
  return writerValue(field, value) === 'rejected';
}

/** 書き手が受け取ったときの、その欄の保存値。断れば `'rejected'`。 */
function writerValue(field: Field, value: string): number | 'rejected' {
  try {
    return parsePropertyEntry({ ...VALID, [field]: value })[field];
  } catch {
    return 'rejected';
  }
}

describe('物件フォーム — 画面の ⛔ と保存の断りが一致する (パス 215)', () => {
  it('★ 走査が痩せていない (4 欄 × 15 通り)', () => {
    // **鳴らない走査は「合格」ではない。** 欄か標本が減れば下の主張は薄まる。
    expect(FIELDS).toEqual(['monthlyRent', 'purchasePrice', 'monthlyExpenses', 'monthlyLoan']);
    expect(PROBES.length).toBe(15);
  });

  it('★ 標本が実際に「断る」を作っている (空振りしていない)', () => {
    // 肯定形の検査 —— 「食い違いが無い」だけだと、断る欄が 1 つも出ていなくても通る。
    const refused = FIELDS.flatMap((f) =>
      PROBES.filter((v) => guardNumber(v, PROPERTY_FORM_SPECS[f])?.outcome === 'refused'),
    );
    expect(refused.length).toBeGreaterThanOrEqual(20);
    // ⚠️ の段で断る形 (0 を受け付けない欄の空欄) も標本に在る —— 直す前はここが
    // 「0 円 として計算されています」と言いながら書き手に断られていた (パス 493l)
    const warnRefused = FIELDS.flatMap((f) =>
      PROBES.filter((v) => {
        const g = guardNumber(v, PROPERTY_FORM_SPECS[f]);
        return g?.outcome === 'refused' && g.level === 'warn';
      }).map((v) => `${f} = ${JSON.stringify(v)}`),
    );
    expect(warnRefused).toEqual(['purchasePrice = ""', 'purchasePrice = "  "']);
    // 空欄を 0 として書く形も標本に在る (下の「0 として記録」の主張を空にしない)
    const zeroSaved = FIELDS.flatMap((f) =>
      PROBES.filter((v) => guardNumber(v, PROPERTY_FORM_SPECS[f])?.outcome === 'savedAsZero'),
    );
    expect(zeroSaved.length).toBeGreaterThanOrEqual(2);
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

  it('★ 関門が「保存できません」と言う ⇔ 書き手が断る (両方向・パス 493l)', () => {
    const mismatch: string[] = [];
    for (const f of FIELDS) {
      for (const v of PROBES) {
        const says = guardNumber(v, PROPERTY_FORM_SPECS[f])?.outcome === 'refused';
        if (says !== writerRejects(f, v)) {
          mismatch.push(`${f} = ${JSON.stringify(v)}: 関門 ${says ? '断る' : '通す'} / 書き手 ${says ? '通す' : '断る'}`);
        }
      }
    }
    expect(mismatch).toEqual([]);
  });

  it('★ 関門が「保存すると 0 円 として記録されます」と言えば、書き手はその欄を 0 で書く', () => {
    const wrong: string[] = [];
    for (const f of FIELDS) {
      for (const v of PROBES) {
        const g = guardNumber(v, PROPERTY_FORM_SPECS[f]);
        if (g?.outcome !== 'savedAsZero') continue;
        expect(g.message).toContain('保存すると 0 円 として記録されます。');
        const saved = writerValue(f, v);
        if (saved !== 0) wrong.push(`${f} = ${JSON.stringify(v)}: 書き手は ${String(saved)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('★ この表の欄の文は「0 円 として計算されています」と言わない (計算ではなく保存の欄)', () => {
    const said = FIELDS.flatMap((f) =>
      PROBES.filter((v) => (guardNumber(v, PROPERTY_FORM_SPECS[f])?.message ?? '').includes('として計算されています'))
        .map((v) => `${f} = ${JSON.stringify(v)}`),
    );
    expect(said).toEqual([]);
    // 標本: 同じ欄を断らない宣言で検めれば、その句は実際に出る (針は生きている)
    const { refusedBy: _drop, ...plain } = PROPERTY_FORM_SPECS.monthlyRent;
    void _drop;
    expect(guardNumber('百', plain)?.message).toContain('0 円 として計算されています');
  });

  it('★ 正しい 1 件は通る (門が全部を落としていない)', () => {
    // 対照側 —— 上の主張は「全部断る」実装でも通ってしまう。
    const parsed = parsePropertyEntry(VALID);
    expect(parsed.monthlyRent).toBe(100000);
    expect(parsed.purchasePrice).toBe(12000000);
  });
});
