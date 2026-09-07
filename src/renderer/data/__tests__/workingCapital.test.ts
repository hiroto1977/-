import { describe, expect, it, vi } from 'vitest';
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

/**
 * **未入力 (`undefined`) と実測した 0 は別の答えを出す。** (2026-09-07)
 *
 * 以前は貸借対照表の入力の境界が空欄を 0 に潰していたので、4 欄を空にしたまま
 * 保存した控えが CCC 0 日 (即日回収・即日支払) —— **最良の運転資金**を報告していた。
 * ここは「0 に倒すと落ちる」検査を、実測した 0 との**対照つき**で留める。
 * 経緯と実測表は `data/balanceSheet.ts` の `BalanceSheet` に在る。
 */
describe('computeCashConversionCycle — 未入力の溜まりは算定不能 (0 と混ぜない)', () => {
  const FLOW = { revenue: 3_650_000, cogs: 3_650_000 } as const;

  it('売上債権が未入力なら DSO と CCC は null・欄の名前を返す', () => {
    const c = computeCashConversionCycle({ ...FLOW, inventory: 0, accountsPayable: 0 });
    expect(c.dso).toBeNull();
    expect(c.ccc).toBeNull();
    expect(c.workingCapital).toBeNull();
    expect(c.missingStocks).toEqual(['売上債権']);
  });

  it('★ 対照: 同じ形で売上債権が実測の 0 なら DSO 0 日・CCC 0 日・運転資本 0 円', () => {
    // これが「0 を算定不能にしてはいけない」側。現金商売の DSO 0 日は正しい答え。
    const c = computeCashConversionCycle({ ...FLOW, accountsReceivable: 0, inventory: 0, accountsPayable: 0 });
    expect(c.dso).toBe(0);
    expect(c.dio).toBe(0);
    expect(c.dpo).toBe(0);
    expect(c.ccc).toBe(0);
    expect(c.workingCapital).toBe(0);
    expect(c.missingStocks).toEqual([]);
  });

  it('棚卸資産だけが未入力なら DIO は null・DPO は残る (同じ cogs でも別々に決まる)', () => {
    // 以前ここに「dio と dpo は常に同時に null」という前提の pragma が在った。
    // 溜まりの有無は欄ごとなので、その前提は成り立たない —— この検査がそれを留める。
    const c = computeCashConversionCycle({ ...FLOW, accountsReceivable: 0, accountsPayable: 365_000 });
    expect(c.dio).toBeNull();
    expect(c.dpo).toBe(36.5);
    expect(c.dso).toBe(0);
    expect(c.ccc).toBeNull();
    expect(c.workingCapital).toBeNull();
    expect(c.missingStocks).toEqual(['棚卸資産']);
  });

  it('仕入債務だけが未入力なら DPO は null・DIO は残る', () => {
    const c = computeCashConversionCycle({ ...FLOW, accountsReceivable: 0, inventory: 365_000 });
    expect(c.dpo).toBeNull();
    expect(c.dio).toBe(36.5);
    expect(c.ccc).toBeNull();
    expect(c.workingCapital).toBeNull();
    expect(c.missingStocks).toEqual(['仕入債務']);
  });

  it('3 つとも未入力なら欄の名前を入力順に並べる', () => {
    const c = computeCashConversionCycle(FLOW);
    expect(c.missingStocks).toEqual(['売上債権', '棚卸資産', '仕入債務']);
    expect(c.dso).toBeNull();
    expect(c.dio).toBeNull();
    expect(c.dpo).toBeNull();
    expect(c.ccc).toBeNull();
    expect(c.workingCapital).toBeNull();
  });

  it('運転資本は 1 欄でも欠ければ null (欠けた項を 0 として足さない)', () => {
    // 売上債権 100 万・棚卸 0 が判っていても、仕入債務が判らなければ差は定まらない。
    const c = computeCashConversionCycle({ ...FLOW, accountsReceivable: 1_000_000, inventory: 0 });
    expect(c.workingCapital).toBeNull();
    // ★ 対照: 仕入債務を 0 と実測すれば 100 万で算定できる。
    const filled = computeCashConversionCycle({ ...FLOW, accountsReceivable: 1_000_000, inventory: 0, accountsPayable: 0 });
    expect(filled.workingCapital).toBe(1_000_000);
  });
});

/**
 * **定数表そのものを変異検査の射程に入れる (読み直して測る)。** (2026-09-07)
 *
 * module 直下の `const` は**読み込みのときに 1 度だけ**評価されるので、Stryker が
 * 実行時に切り替える仕組みは届かない —— 覆われていても「生存」と報告される
 * (`stryker.config.json` の `_commentIgnoreStatic`)。殺し方は**テスト側で読み直す**
 * こと: `vi.resetModules()` + 動的 `import()` なら変異体が有効な状態で評価される。
 *
 * ここで留めるのは、画面と**金融機関等へ出す書面**が刷る文字そのものである。
 */
describe('読み直して測る — module 直下の回転日数ヘルパー', () => {
  it('読み直しても DSO / DIO / DPO が数を返す (ヘルパーが空にすり替わっていない)', async () => {
    vi.resetModules();
    const { computeCashConversionCycle: fresh } = await import('../workingCapital');
    const c = fresh({
      accountsReceivable: 1_000_000, inventory: 1_200_000, accountsPayable: 730_000,
      revenue: 7_300_000, cogs: 3_650_000,
    });
    expect(c.dso).toBe(50);
    expect(c.dio).toBe(120);
    expect(c.dpo).toBe(73);
    expect(c.ccc).toBe(97);
  });
});
