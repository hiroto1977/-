/**
 * インボイスの経過措置 —— **知識台帳と計算の定数は同じ日付と割合を言う** (2026-09-10 · パス 141)。
 *
 * 2割特例の期限 (`TWENTY_PERCENT_MEASURE_END`)、3割特例の対象年分 (`THIRTY_PERCENT_MEASURE_START/END`) と
 * 割合 (`THIRTY_PERCENT_RATE`) は計算の定数が持ち、`complianceKnowledge.ts` の `tax-invoice` はそれを文で言う。
 * どちらかだけが動くと、画面の見積りと知識の説明が食い違う (パス 140 の少額減価償却資産と同じ形)。
 * 期限そのものは `lint:rate-freshness` の台帳 (2 件) が見る。
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { VERIFIED_COMPLIANCE } from '../complianceKnowledge';
import {
  THIRTY_PERCENT_MEASURE_END,
  THIRTY_PERCENT_MEASURE_START,
  THIRTY_PERCENT_RATE,
  TWENTY_PERCENT_MEASURE_END,
  thirtyPercentMeasureYearsLabel,
} from '../../../shared/taxConsumption';
import { formatDate } from '../../../shared/bankFormat';

const req = createRequire(import.meta.url);
const gate = req('../../../../scripts/lint-rate-freshness.cjs') as {
  DATED_MEASURES: readonly { source: string; constName: string; graceDays?: number }[];
};

const NTA_THIRTY_PDF = 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice-review/pdf/0026002-095.pdf';

function fact(id: string) {
  const f = VERIFIED_COMPLIANCE.find((c) => c.value.id === id);
  if (!f) throw new Error(`fact ${id} missing`);
  return f;
}

describe('tax-invoice — 2割特例の終わりと 3割特例の対象年分・割合は定数と同じ', () => {
  it('★ 2割特例の期限は「令和8年9月30日の属する課税期間で終了」と定数の日付で言う', () => {
    const st = fact('tax-invoice').value.statement;
    expect(st).toContain(`${formatDate(TWENTY_PERCENT_MEASURE_END, { era: 'wareki' })}の属する課税期間で終了`);
  });

  it('★ 3割特例: 対象年分 (令和9年分・令和10年分) と割合 (3割) と「個人事業者に限り」「法人に後継措置はない」', () => {
    const st = fact('tax-invoice').value.statement;
    expect(st).toContain('3割特例');
    expect(st).toContain(thirtyPercentMeasureYearsLabel());
    expect(st).toContain(`売上税額の${String(THIRTY_PERCENT_RATE * 10)}割`);
    expect(st).toContain('個人事業者に限り');
    expect(st).toContain('法人に後継措置はない');
  });

  it('★ 国税庁の 3割特例の資料を出典に持つ', () => {
    expect(fact('tax-invoice').sources.map((s) => s.url)).toContain(NTA_THIRTY_PDF);
  });

  it('★ 対象年分の定数: 2027-01-01 〜 2028-12-31 (暦年 2 年分) で、文面は「令和9年分・令和10年分」', () => {
    expect(THIRTY_PERCENT_MEASURE_START).toBe('2027-01-01');
    expect(THIRTY_PERCENT_MEASURE_END).toBe('2028-12-31');
    expect(thirtyPercentMeasureYearsLabel()).toBe('令和9年分・令和10年分');
    expect(THIRTY_PERCENT_MEASURE_START > TWENTY_PERCENT_MEASURE_END).toBe(true);
  });

  it('期限の台帳 (lint:rate-freshness) は 2割特例 (猶予帯つき) と 3割特例の両方を持つ', () => {
    const byName = new Map(gate.DATED_MEASURES.map((m) => [m.constName, m]));
    expect(byName.get('TWENTY_PERCENT_MEASURE_END')?.source).toBe('src/shared/taxConsumption.ts');
    expect(byName.get('TWENTY_PERCENT_MEASURE_END')?.graceDays).toBe(364);
    expect(byName.get('THIRTY_PERCENT_MEASURE_END')?.source).toBe('src/shared/taxConsumption.ts');
  });
});
