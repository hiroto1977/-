/**
 * **差引支給額の検算は、書面が足す欄そのものを足す** (2026-09-23 · パス 431)。
 *
 * 書面 (`DocTable.sum`) は `minus` を持つとき「支給額合計 − 控除額合計」の行で、
 * その docblock が理由つきで **「差引は常に同じ欄から導く」** と規則にしている。
 * 書面はその規則を守っていたが、**交付前チェックだけが同じ 2 つの一覧を
 * `docStudioChecks.ts` へ手で写していた**。写した側の docblock 自身が
 * 「ここだけ別の欄を足すと、書面はマイナスを刷っているのに何も指摘されない」と
 * その失敗を名指ししているのに、**それを縛る物が 1 つも無かった**。
 *
 * 実測 (2026-09-23 · 直す前・写した一覧から 1 欄ずつ落として既存の検査を回す):
 *
 * ```
 *   kyuyo-meisai        支給 otherPay  → 黙る    控除 otherDed  → 黙る
 *   shoyo-meisai        支給 otherPay  → 黙る    控除 otherDed  → 黙る
 *   yakuin-hoshu-meisai 支給 otherPay  → 黙る    控除 otherDed  → 黙る
 *   yakuin-shoyo-meisai (支給は 1 欄)            控除 otherDed  → 黙る
 * ```
 *
 * **7 方向すべてが黙った。** 最初に手で当てた 1 件 (住民税) だけが鳴ったのは、
 * 既存の標本がたまたまその欄を埋めていたからで、標本が 0 のままの欄を落とすと
 * どの書面も鳴らない —— **束縛ではなく偶然**だった。
 *
 * ## この検査が留めるもの
 *
 * 母集団は**走査で導く** (`STUDIO_TEMPLATES` のうち `minus` つきの合計行を持つ書面)。
 * そのうえで**宣言された欄を 1 つずつ**動かし、振る舞いで結ぶ:
 *
 *   - 控除の欄はどれも**単独で**差引をマイナスにでき、検算はそれを警告する
 *     (検算がその欄を足していなければ黙る = 鳴る)。
 *   - 支給の欄はどれも**単独で**控除を覆え、そのとき警告は出ない
 *     (検算がその欄を足していなければ、出ないはずの警告が出る = 鳴る)。
 *
 * 欄を写す形へ戻しても、**写し間違えた欄が名指しで鳴る**。
 */
import { describe, expect, it } from 'vitest';
import { STUDIO_TEMPLATES, type StudioDoc } from '../data/docStudioData';
import { checkDoc } from '../data/docStudioChecks';

/** 書面が宣言する「支給額合計 − 控除額合計」の欄 (走査で導く)。 */
function declaredNetPayFields(doc: StudioDoc): { pay: readonly string[]; ded: readonly string[] } | null {
  for (const b of doc.body) {
    const sum = b.table?.sum;
    if (sum?.minus !== undefined && sum.minus.length > 0 && sum.keys.length > 0) {
      return { pay: sum.keys, ded: sum.minus };
    }
  }
  return null;
}

const SHEETS = STUDIO_TEMPLATES
  .map((d) => ({ doc: d, f: declaredNetPayFields(d) }))
  .filter((x): x is { doc: StudioDoc; f: { pay: readonly string[]; ded: readonly string[] } } => x.f !== null);

/** 差引がマイナスになったときの警告だけを取る。 */
const netPayWarnings = (doc: StudioDoc, v: Record<string, string>): string[] =>
  checkDoc(doc, v).map((i) => i.message).filter((m) => m.includes('控除額の合計'));

describe('差引支給額の検算は書面の宣言から欄を取る (パス 431)', () => {
  it('★ 母集団は走査で導く —— 差引の行を持つ書面が在る (走査が空でない)', () => {
    expect(SHEETS.length).toBeGreaterThanOrEqual(4);
    for (const { doc, f } of SHEETS) {
      expect(f.pay.length, doc.id).toBeGreaterThanOrEqual(1);
      expect(f.ded.length, doc.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('★ 宣言された控除の欄はどれも単独で差引をマイナスにでき、検算が警告する', () => {
    for (const { doc, f } of SHEETS) {
      for (const k of f.ded) {
        // 支給は全欄 1 円、その控除の欄だけ 1,000,000 円。
        const v: Record<string, string> = {};
        for (const p of f.pay) v[p] = '1';
        v[k] = '1000000';
        expect(netPayWarnings(doc, v), `${doc.id} / 控除 ${k}`).toHaveLength(1);
      }
    }
  });

  it('★ 宣言された支給の欄はどれも単独で控除を覆え、そのとき警告は出ない', () => {
    for (const { doc, f } of SHEETS) {
      for (const k of f.pay) {
        // 控除は全欄 1 円、その支給の欄だけ 1,000,000 円。
        const v: Record<string, string> = {};
        for (const d of f.ded) v[d] = '1';
        v[k] = '1000000';
        expect(netPayWarnings(doc, v), `${doc.id} / 支給 ${k}`).toHaveLength(0);
      }
    }
  });

  it('★ 警告は差引の額を添える (読み手が不足額をその場で読める)', () => {
    const { doc, f } = SHEETS[0]!;
    const v: Record<string, string> = { [f.pay[0]!]: '1000', [f.ded[0]!]: '3000' };
    const [msg] = netPayWarnings(doc, v);
    expect(msg).toContain('3,000 円');
    expect(msg).toContain('1,000 円');
    expect(msg).toContain('-2,000 円');
    // 標本: この針は「額を添えない」文面には当たらない。
    expect('控除額の合計が支給額の合計を超えています。').not.toContain('-2,000 円');
  });
});
