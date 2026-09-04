import { describe, expect, it } from 'vitest';
import { computeCashConversionCycle } from '../workingCapital';

describe('computeCashConversionCycle', () => {
  it('computes DSO, DIO, DPO and CCC over a 365-day basis', () => {
    // AR 1,000,000 / revenue 7,300,000 × 365 = 50 日 (DSO)
    // inventory 1,200,000 / cogs 3,650,000 × 365 = 120 日 (DIO)
    // AP 730,000 / cogs 3,650,000 × 365 = 73 日 (DPO)
    // CCC = 50 + 120 - 73 = 97 日
    const c = computeCashConversionCycle({
      accountsReceivable: 1_000_000,
      inventory: 1_200_000,
      accountsPayable: 730_000,
      revenue: 7_300_000,
      cogs: 3_650_000,
    });
    expect(c.dso).toBe(50);
    expect(c.dio).toBe(120);
    expect(c.dpo).toBe(73);
    expect(c.ccc).toBe(97);
    expect(c.workingCapital).toBe(1_470_000); // 1,000,000 + 1,200,000 - 730,000
  });

  it('honours a custom period length', () => {
    // 30-day month: AR 100 / revenue 100 × 30 = 30 日
    const c = computeCashConversionCycle({
      accountsReceivable: 100, inventory: 0, accountsPayable: 0,
      revenue: 100, cogs: 100, days: 30,
    });
    expect(c.dso).toBe(30);
  });

  it('nulls DSO when revenue is zero and CCC when any component is missing', () => {
    const c = computeCashConversionCycle({
      accountsReceivable: 500, inventory: 0, accountsPayable: 0,
      revenue: 0, cogs: 1000,
    });
    expect(c.dso).toBeNull();
    expect(c.ccc).toBeNull(); // DSO null → CCC not computable
    expect(c.workingCapital).toBe(500);
  });

  it('nulls DIO/DPO when COGS is zero (service business)', () => {
    const c = computeCashConversionCycle({
      accountsReceivable: 1000, inventory: 0, accountsPayable: 0,
      revenue: 12000, cogs: 0,
    });
    expect(c.dio).toBeNull();
    expect(c.dpo).toBeNull();
    expect(c.ccc).toBeNull();
    expect(c.dso).not.toBeNull();
  });

  it('can yield a negative CCC when payables outlast receivables+inventory', () => {
    // DSO 10, DIO 0, DPO 36.5 → CCC = -26.5
    const c = computeCashConversionCycle({
      accountsReceivable: 100, inventory: 0, accountsPayable: 365,
      revenue: 3650, cogs: 3650,
    });
    expect(c.ccc).toBe(-26.5);
    expect(c.workingCapital).toBe(-265);
  });
});
