import { describe, expect, it } from 'vitest';
import { calcExport, calcJapanImport, type ExportInput, type ImportInput } from '../tradeTax';

/**
 * **断りの注記と売手の負担を、値ごとに留める** (パス 502 · `tradeTax.ts` の変異検査の生存 10 件)。
 *
 * パス 208 は「画面が ⛔ で断っている税率から税額を作らない」を入れ、`tradeTax.test.ts` は
 * `null` になる欄を確かめていた。ところが**断りの文そのもの**は断片 (`toContain('輸出税率')`) でしか
 * 見ておらず、次の 4 つの変異体が生き残っていた:
 *
 * | 変異体 | 何が壊れるか | 直す前に見ていた物 |
 * | --- | --- | --- |
 * | 輸入の断りの `MAX_TRADE_RATE * 100` → `/ 100` | 「**0.01%** 以下」と上限を偽る | 断片 `関税率が入力できる範囲の外` |
 * | 輸出の断りの `MAX_TRADE_RATE * 100` → `/ 100` | 同上 | 断片 `輸出税率` ほか |
 * | `else if (exportRateOk)` → `else if (true)` | 輸出税率が断られたのに「輸出取引は消費税も免除されます」を足す | 範囲内の入力の先頭の注記だけ |
 * | 売手の負担の `bearer === 'seller' &&` → `true &&` | 買手負担でも、仕向国の税が算定不能なら**売手の負担まで**算定不能にする | 売手負担 (DDP) の 1 件だけ |
 *
 * どれも**観測できる差**がある (注記の字面・注記の件数・`sellerBurden` の `null` か数か) のに、
 * 誰もそれを主張していなかった (断片ごとの `toContain` は文の数字も件数も見ない)。
 * ここでは**注記を配列ごと・字面そのまま**で並べる。期待値は原文の式から組まない
 * (`MAX_TRADE_RATE * 100` を写すと、原文が壊れた日に両辺が一緒に動いて素通りする)。
 *
 * 同じ報告にあった残る 6 件は、税の合計を作る所の `duty === null || nationalTax === null || localTax === null`
 * の変異体で、**どんな入力でも答えが同じ** (3 つの `null` は同時に立つ) 等価だった。
 * 検査では殺せないので**形ごと消し** (`duty === null` の 1 つだけを見る)、消してよい根拠 ——
 * 下流の `null` は 1 つの事実で決まること —— は末尾の格子の検査が留める。
 */

/** 999,999,999% (画面は % で受けて /100 して渡す) —— 上限 100% を大きく超える率。 */
const OVER = 9_999_999.99;

const imp = (over: Partial<ImportInput> = {}): ImportInput => ({
  goodsValue: 500_000,
  freight: 30_000,
  insurance: 5_000,
  dutyRate: 0.045,
  ...over,
});

const exp = (over: Partial<ExportInput> = {}): ExportInput => ({
  goodsValue: 1_000_000,
  freight: 80_000,
  insurance: 10_000,
  destBasis: 'CIF',
  destDutyRate: 0.05,
  destVatRate: 0.2,
  ...over,
});

// --- 輸出の注記 (字面そのまま。`calcExport` の notes は断り → 輸出税 → 基準 → 負担者 → 丸め の順) ---
const EXEMPT_NOTE = '日本は輸出に関税を課していません。輸出取引は消費税も免除されます（消費税法7条）。';
const CIF_NOTE = '課税価格を CIF（国際運賃・保険料を含む）で計算しています。EU をはじめ多くの国はこの基準です。';
const BUYER_NOTE = 'DAP・FOB など買手が輸入通関を行う条件のため、仕向国の関税・付加価値税は買手の負担です。';
const ROUND_NOTE = '仕向国側の端数処理は国ごとに規則が異なるため、丸めを行っていません。';
const refusal = (fields: string): string => `${fields}が入力できる範囲の外（100% 以下）なので、その税額は算定していません。`;

describe('輸入 — 関税率が範囲外のときの注記を全文で留める', () => {
  it('★ 関税率が範囲外なら、注記は断りの 1 文だけで、上限は「100% 以下」と言う', () => {
    expect(calcJapanImport(imp({ dutyRate: OVER })).notes).toEqual([
      '関税率が入力できる範囲の外（100% 以下）なので、関税と消費税は算定していません。',
    ]);
  });

  it('★ NaN の率も同じ断り 1 文 (個別消費税があっても、課税標準に含まれる旨は足さない)', () => {
    // 個別消費税の注記は「課税されて かつ 個別消費税がある」ときだけ —— 断られた計算には課税標準が無い。
    expect(calcJapanImport(imp({ dutyRate: Number.NaN, otherExcise: 1_000 })).notes).toEqual([
      '関税率が入力できる範囲の外（100% 以下）なので、関税と消費税は算定していません。',
    ]);
  });

  it('★ 対照: 率が上限ちょうど (100%) なら断らず、断りの文は 1 つも出ない', () => {
    // 断りの文は「100% 以下」と言う。その境目ちょうど (100%) が実際に範囲内であること
    // (文の数字と判定が食い違わない) —— 100% ちょうどの関税は課税価格そのもの。
    const r = calcJapanImport(imp({ dutyRate: 1 }));
    expect(r.duty).toBe(535_000);
    expect(r.notes).toEqual([]);
  });
});

describe('輸出 — 税率が範囲外のときの注記を全文で留める', () => {
  it.each([
    {
      label: '輸出税率だけ',
      over: { exportDutyRate: OVER },
      // 輸出税が断られたときは「輸出取引は消費税も免除されます」も「日本以外からの輸出」も言わない。
      notes: [refusal('輸出税率'), CIF_NOTE, BUYER_NOTE, ROUND_NOTE],
    },
    {
      label: '輸出税率が NaN',
      over: { exportDutyRate: Number.NaN },
      notes: [refusal('輸出税率'), CIF_NOTE, BUYER_NOTE, ROUND_NOTE],
    },
    {
      label: '仕向国の関税率だけ',
      over: { destDutyRate: OVER },
      notes: [refusal('仕向国の関税率'), EXEMPT_NOTE, CIF_NOTE, BUYER_NOTE, ROUND_NOTE],
    },
    {
      label: '仕向国の付加価値税だけ',
      over: { destVatRate: OVER },
      notes: [refusal('仕向国の付加価値税'), EXEMPT_NOTE, CIF_NOTE, BUYER_NOTE, ROUND_NOTE],
    },
    {
      label: '輸出税率と仕向国の関税率',
      over: { exportDutyRate: OVER, destDutyRate: OVER },
      notes: [refusal('輸出税率・仕向国の関税率'), CIF_NOTE, BUYER_NOTE, ROUND_NOTE],
    },
    {
      label: '3 つとも',
      over: { exportDutyRate: OVER, destDutyRate: OVER, destVatRate: OVER },
      notes: [refusal('輸出税率・仕向国の関税率・仕向国の付加価値税'), CIF_NOTE, BUYER_NOTE, ROUND_NOTE],
    },
  ])('★ $label が範囲外なら、注記は「断り → (範囲内の率の) 輸出税の注記 → 基準 → 負担者 → 丸め」の順で全文', ({ over, notes }) => {
    expect(calcExport(exp(over)).notes).toEqual(notes);
  });

  it('★ 輸出税率が範囲外なら、断りの隣に「輸出取引は消費税も免除されます」を並べない (注記は 4 件のまま)', () => {
    // 輸出税率が範囲外 = 輸出税を算定していない。その人に「輸出取引は消費税も免除されます」と言うと、
    // 断った計算の隣に別の結論を並べることになる。**消費税の免除の注記は、率が範囲内のときだけ**。
    const refused = calcExport(exp({ exportDutyRate: OVER })).notes;
    expect(refused).toHaveLength(4);
    expect(refused[0]).toBe(refusal('輸出税率'));
    expect(refused[1]).toBe(CIF_NOTE);
    // 対照: 同じ標本で率だけを範囲内 (0) にすると、断りの代わりに免除の注記が先頭に入る (これも 4 件)。
    // 断りと免除の両方を並べる形 (`else if (true)`) になると、上の 4 件が 5 件に増える。
    const ok = calcExport(exp({ exportDutyRate: 0 })).notes;
    expect(ok).toEqual([EXEMPT_NOTE, CIF_NOTE, BUYER_NOTE, ROUND_NOTE]);
  });
});

describe('輸出 — 売手の負担は「輸出税 + (売手が通関するなら仕向国の税)」', () => {
  it.each([
    { label: '仕向国の付加価値税が範囲外', over: { destVatRate: OVER } },
    { label: '仕向国の関税率が範囲外', over: { destDutyRate: OVER } },
    { label: '仕向国の 2 つの率が範囲外', over: { destDutyRate: OVER, destVatRate: OVER } },
  ])('★ 買手負担 (既定) のとき、$label でも売手の負担は輸出税だけで決まる (算定不能にしない)', ({ over }) => {
    // 買手が通関するなら、仕向国の税は売手の負担に入らない —— それが算定不能でも売手の負担は言える。
    const withExportDuty = calcExport(exp({ ...over, exportDutyRate: 0.03 }));
    expect(withExportDuty.destTotalTax).toBeNull();
    expect(withExportDuty.sellerBurden).toBe(30_000);
    expect(withExportDuty.buyerBurden).toBeNull(); // 買手の負担は仕向国の税そのもの —— こちらは算定不能のまま
    // 輸出税が 0 (既定) なら売手の負担は 0 円という判定 (null ではない)。
    expect(calcExport(exp(over)).sellerBurden).toBe(0);
    // 明示の 'buyer' も既定と同じ。
    expect(calcExport(exp({ ...over, bearer: 'buyer', exportDutyRate: 0.03 })).sellerBurden).toBe(30_000);
  });

  it.each([
    { label: '仕向国の付加価値税が範囲外', over: { destVatRate: OVER } },
    { label: '仕向国の関税率が範囲外', over: { destDutyRate: OVER } },
  ])('★ 対照: 売手負担 (DDP) のときは、$label なら売手の負担も算定不能 (買手は通関しないので 0)', ({ over }) => {
    const r = calcExport(exp({ ...over, bearer: 'seller', exportDutyRate: 0.03 }));
    expect(r.destTotalTax).toBeNull();
    expect(r.sellerBurden).toBeNull();
    expect(r.buyerBurden).toBe(0);
  });

  it('★ 対照: 輸出税率が範囲外なら、負担者に依らず売手の負担は算定不能', () => {
    expect(calcExport(exp({ exportDutyRate: OVER, bearer: 'buyer' })).sellerBurden).toBeNull();
    expect(calcExport(exp({ exportDutyRate: OVER, bearer: 'seller' })).sellerBurden).toBeNull();
  });
});

/**
 * **課税標準・国税・地方消費税・税の合計・通関までの原価の `null` は、関税が算定不能かどうかで同時に決まる。**
 *
 * `calcJapanImport` の連鎖は「関税 → 課税標準 → 国税 → 地方消費税」で、どの段も前の段が `null` のときだけ
 * `null` になる。だから税の合計を作る所は `duty === null` 1 つだけを見て、国税・地方消費税の `null` の
 * 判定は置いていない (置くと**同じ答えを返す写し**で、変異検査が等価の生存として残す)。
 * その約束 (下流の `null` は 1 つの事実) を、率・金額・免税・個人使用・軽減・個別消費税の格子で留める。
 * 約束が崩れる (国税だけが `null` になる道が生える) と、合計の `?? Number.NaN` の枝が届いて
 * 合計が NaN になり、ここで落ちる。
 */
describe('輸入 — 関税から下の 5 欄 (課税標準・国税・地方消費税・税の合計・通関までの原価) の null は同時に決まる', () => {
  const must = (n: number | null, what: string): number => {
    if (n === null) throw new Error(`${what} が null (算定できているはずの入力)`);
    return n;
  };

  it('★ 格子の全入力で、下流 5 欄の null は「関税が null か」と一致し、数のときは税の合計が 4 項の和そのもの', () => {
    let refused = 0;
    let computed = 0;
    for (const goodsValue of [0, 8_000, 10_000, 11_000, 535_000]) {
      for (const dutyRate of [0, 0.045, 1, 1.01, OVER, Number.NaN, Number.POSITIVE_INFINITY]) {
        for (const otherExcise of [0, 5_000]) {
          for (const personalUse of [false, true]) {
            for (const reducedRate of [false, true]) {
              const r = calcJapanImport(imp({ goodsValue, freight: 0, insurance: 0, dutyRate, otherExcise, personalUse, reducedRate }));
              const label = JSON.stringify({ goodsValue, dutyRate: String(dutyRate), otherExcise, personalUse, reducedRate });
              const dutyNull = r.duty === null;
              expect(r.consumptionBase === null, label).toBe(dutyNull);
              expect(r.nationalTax === null, label).toBe(dutyNull);
              expect(r.localTax === null, label).toBe(dutyNull);
              expect(r.totalTax === null, label).toBe(dutyNull);
              expect(r.landedCost === null, label).toBe(dutyNull);
              if (dutyNull) {
                refused += 1;
              } else {
                computed += 1;
                expect(r.totalTax, label).toBe(
                  must(r.duty, '関税') + r.otherExcise + must(r.nationalTax, '国税') + must(r.localTax, '地方消費税'),
                );
              }
            }
          }
        }
      }
    }
    // 格子が両方の側を踏んでいること (どちらかが 0 件なら上の主張が空虚になる)。
    expect(refused).toBeGreaterThan(20);
    expect(computed).toBeGreaterThan(20);
  });
});
