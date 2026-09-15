/**
 * 少額減価償却資産の特例 —— **数字の出所は 1 つ** (2026-09-09 · パス 140)。
 *
 * 令和 8 年度税制改正 (2026-04-01 施行) で上限が 30 万 → 40 万円になったとき、知識台帳
 * (`complianceKnowledge.ts` の `tax-small-amount-depreciation`・asOf 2026-06) は 40 万円を書いたが、
 * 計算 (`depreciation.ts`) は 30 万円のまま、兄弟の 2 項目 (償却資産の申告・一括償却資産) も日付の無い
 * 「30万円未満」のままだった。同じ数字が 4 か所に手で写され、1 か所だけが動いた。
 *
 * ここでは**計算の定数を規準**に、知識台帳・節税カタログ・期限の台帳が同じ数字と日付を持つことを留める。
 * 不在の検査 (「日付の無い 30万円 が無い」) には標本を添える —— 規則が実際にその文面に当たることを確かめる。
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { VERIFIED_COMPLIANCE } from '../complianceKnowledge';
import {
  SME_ANNUAL_CAP,
  SME_EMPLOYEE_CAP,
  SME_MEASURE_END,
  SME_UNIT_LIMIT,
  SME_UNIT_LIMIT_BEFORE_STEP,
  SME_UNIT_LIMIT_STEP_DATE,
} from '../../../shared/depreciation';
import { INVESTMENT_PROMOTION_MEASURE_END, taxSchemeCatalog } from '../../../shared/taxCalc';
import { isCalendarDate } from '../../../shared/isoDate';

const req = createRequire(import.meta.url);
const gate = req('../../../../scripts/lint-rate-freshness.cjs') as {
  DATED_MEASURES: readonly { source: string; constName: string }[];
  unledgeredDeadlines: (
    files: { file: string; text: string }[],
    ledger?: readonly { source: string; constName: string }[],
  ) => string[];
};

const MOF_OUTLINE = 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_03.htm';

/** `YYYY-MM-DD` → 「YYYY年M月D日」(知識台帳の綴り)。 */
function jpDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not a date: ${iso}`);
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}
const man = (v: number): string => String(v / 10_000);
function fact(id: string) {
  const f = VERIFIED_COMPLIANCE.find((c) => c.value.id === id);
  if (!f) throw new Error(`fact ${id} missing`);
  return f;
}

describe('少額減価償却資産の特例 — 知識台帳は計算の定数と同じ数字・日付を言う', () => {
  it('★ tax-small-amount-depreciation: 40万円 / 30万円 / 2026年4月1日以後 / 300万円 / 400人以下 / 2029年3月31日まで', () => {
    const st = fact('tax-small-amount-depreciation').value.statement;
    expect(st).toContain(`${man(SME_UNIT_LIMIT)}万円未満`);
    expect(st).toContain(`${man(SME_UNIT_LIMIT_BEFORE_STEP)}万円未満`);
    expect(st).toContain(`${jpDate(SME_UNIT_LIMIT_STEP_DATE)}以後`);
    expect(st).toContain(`${man(SME_ANNUAL_CAP)}万円`);
    expect(st).toContain(`${String(SME_EMPLOYEE_CAP)}人以下`);
    expect(st).toContain(`${jpDate(SME_MEASURE_END)}まで`);
  });

  it('★ 財務省の大綱を出典に持つ (40 万円と期限の根拠)', () => {
    const urls = fact('tax-small-amount-depreciation').sources.map((s) => s.url);
    expect(urls).toContain(MOF_OUTLINE);
  });

  it('★ 特例に触れる項目は、日付の無い「30万円」を残さない (兄弟 2 項目が 2026-09-09 までそうだった)', () => {
    // 本項目は題名にだけ「少額減価償却資産の特例」を持つ (本文は「基準額」と言う) —— 題名と本文を合わせて見る。
    const touching = VERIFIED_COMPLIANCE.filter((c) => `${c.value.title}\n${c.value.statement}`.includes('少額減価償却資産の特例'));
    expect(touching.map((c) => c.value.id)).toEqual(
      expect.arrayContaining(['tax-small-amount-depreciation', 'tax-depreciable-asset-filing', 'tax-lump-sum-depreciation']),
    );
    for (const c of touching) {
      const st = c.value.statement;
      if (st.includes(`${man(SME_UNIT_LIMIT_BEFORE_STEP)}万円`)) {
        expect(st, c.value.id).toContain(`${man(SME_UNIT_LIMIT)}万円未満`);
        expect(st, c.value.id).toContain(`${jpDate(SME_UNIT_LIMIT_STEP_DATE)}以後`);
        expect(c.sources.map((s) => s.url), c.value.id).toContain(MOF_OUTLINE);
      }
    }
  });

  it('標本: 規則は 2026-09-09 までの文面 (日付の無い 30万円) に当たる', () => {
    const before = '少額減価償却資産の特例（30万円未満を即時償却）で損金算入した資産は';
    expect(before.includes(`${man(SME_UNIT_LIMIT_BEFORE_STEP)}万円`)).toBe(true);
    expect(before.includes(`${man(SME_UNIT_LIMIT)}万円未満`)).toBe(false);
  });
});

describe('節税制度カタログ — 期限つきの制度は期限を定数から持つ', () => {
  const byId = new Map(taxSchemeCatalog().map((s) => [s.id, s]));

  it('★ 少額減価償却資産の特例: until = SME_MEASURE_END、概要は 40 万円・30 万円・段差の日・300 万円を刷る', () => {
    const s = byId.get('sp-small-depreciation');
    expect(s?.until).toBe(SME_MEASURE_END);
    expect(s?.summary).toContain(`${man(SME_UNIT_LIMIT)}万円未満`);
    expect(s?.summary).toContain(`${man(SME_UNIT_LIMIT_BEFORE_STEP)}万円未満`);
    expect(s?.summary).toContain(SME_UNIT_LIMIT_STEP_DATE);
    expect(s?.summary).toContain(`${man(SME_ANNUAL_CAP)}万円`);
  });

  it('★ 中小企業投資促進税制: until = INVESTMENT_PROMOTION_MEASURE_END (2027-03-31)', () => {
    expect(byId.get('corp-investment-tax')?.until).toBe(INVESTMENT_PROMOTION_MEASURE_END);
    expect(INVESTMENT_PROMOTION_MEASURE_END).toBe('2027-03-31');
  });

  it('until を持つ制度の期限は暦に在る日で、期限の台帳 (lint:rate-freshness) に載っている', () => {
    const dated = taxSchemeCatalog().filter((s) => s.until !== undefined);
    expect(dated.map((s) => s.id).sort()).toEqual(['corp-investment-tax', 'sp-small-depreciation']);
    for (const s of dated) expect(isCalendarDate(s.until)).toBe(true);
    const ledgered = gate.DATED_MEASURES.map((m) => `${m.source}::${m.constName}`);
    expect(ledgered).toEqual(
      expect.arrayContaining([
        'src/shared/depreciation.ts::SME_MEASURE_END',
        'src/shared/taxCalc.ts::INVESTMENT_PROMOTION_MEASURE_END',
        'src/shared/taxConsumption.ts::TWENTY_PERCENT_MEASURE_END',
      ]),
    );
  });

  it('★ 台帳の母集団の走査は、台帳に無い期限定数を拾う (標本) — 台帳済みの 2 件は拾わない', () => {
    expect(
      gate.unledgeredDeadlines([{ file: 'src/shared/x.ts', text: "export const NEW_MEASURE_END = '2030-01-01';" }]),
    ).toEqual(['src/shared/x.ts::NEW_MEASURE_END']);
    expect(
      gate.unledgeredDeadlines([
        { file: 'src/shared/depreciation.ts', text: `export const SME_MEASURE_END = '${SME_MEASURE_END}';` },
        {
          file: 'src/shared/taxCalc.ts',
          text: `export const INVESTMENT_PROMOTION_MEASURE_END = '${INVESTMENT_PROMOTION_MEASURE_END}';`,
        },
      ]),
    ).toEqual([]);
  });
});
