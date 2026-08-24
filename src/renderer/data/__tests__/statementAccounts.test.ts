import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS,
  SECTION_LABEL,
  amountOf,
  balanceTotals,
  buildBalanceRows,
  buildIncomeRows,
  buildPublicNoticeRows,
  checkStatements,
  incomeTotals,
  sectionTotal,
  sideOf,
  type Amounts,
  type Section,
} from '../statementAccounts';

const NO_OPT = { retainedEarningsOpening: 0, dividends: 0 };

/** 貸借の合う最小の決算例。資産 = 負債 + 純資産 になるよう組んである。 */
const BALANCED: Amounts = {
  // 資産 1,000
  cash: '600', accountsReceivable: '400',
  // 負債 300
  accountsPayable: '300',
  // 純資産 700 = 資本金 500 + 繰越利益剰余金(期首 100 + 当期純利益 100)
  capitalStock: '500',
  // PL: 売上 1,000 − 原価 600 − 販管費 250 − 税 50 = 100
  sales: '1000', purchases: '600', salaries: '250', incomeTax: '50',
};
const BALANCED_OPT = { retainedEarningsOpening: 100, dividends: 0 };

describe('勘定科目の定義', () => {
  it('キーが重複していない', () => {
    const ks = ACCOUNTS.map((a) => a.k);
    expect(new Set(ks).size).toBe(ks.length);
  });

  it('科目名が重複していない', () => {
    const ns = ACCOUNTS.map((a) => a.name);
    expect(new Set(ns).size).toBe(ns.length);
  });

  it('キーに空白や記号が混ざっていない（差込キーとして使うため）', () => {
    for (const a of ACCOUNTS) expect(a.k, a.name).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
  });

  it('すべての区分に見出しがある', () => {
    for (const a of ACCOUNTS) expect(SECTION_LABEL[a.section], a.name).toBeTruthy();
  });

  it('控除科目は期末棚卸・減価償却累計額・貸倒引当金だけ', () => {
    expect(ACCOUNTS.filter((a) => a.contra).map((a) => a.name))
      .toEqual(['貸倒引当金', '減価償却累計額', '期末商品棚卸高']);
  });

  it('区分ごとに 1 科目以上ある（空の見出しを出さない）', () => {
    const used = new Set(ACCOUNTS.map((a) => a.section));
    for (const s of Object.keys(SECTION_LABEL) as Section[]) expect(used.has(s), s).toBe(true);
  });

  it('科目一覧をスナップショットで固定する', () => {
    expect(ACCOUNTS.map((a) => `${a.section}|${a.k}|${a.name}${a.contra ? '|△' : ''}`)).toMatchSnapshot();
  });
});

describe('借方・貸方', () => {
  it('資産と費用が借方、負債・純資産・収益が貸方', () => {
    expect(sideOf('current-asset')).toBe('debit');
    expect(sideOf('fixed-asset')).toBe('debit');
    expect(sideOf('deferred-asset')).toBe('debit');
    expect(sideOf('cogs')).toBe('debit');
    expect(sideOf('sga')).toBe('debit');
    expect(sideOf('non-op-expense')).toBe('debit');
    expect(sideOf('extra-loss')).toBe('debit');
    expect(sideOf('tax')).toBe('debit');
    expect(sideOf('current-liability')).toBe('credit');
    expect(sideOf('fixed-liability')).toBe('credit');
    expect(sideOf('capital')).toBe('credit');
    expect(sideOf('capital-surplus')).toBe('credit');
    expect(sideOf('retained-earnings')).toBe('credit');
    expect(sideOf('revenue')).toBe('credit');
    expect(sideOf('non-op-income')).toBe('credit');
    expect(sideOf('extra-income')).toBe('credit');
  });

  it('すべての区分がどちらかに分類される', () => {
    for (const s of Object.keys(SECTION_LABEL) as Section[]) {
      expect(['debit', 'credit'], s).toContain(sideOf(s));
    }
  });
});

describe('金額の読み取り', () => {
  it('空欄・未入力は 0', () => {
    expect(amountOf({}, 'cash')).toBe(0);
    expect(amountOf({ cash: '' }, 'cash')).toBe(0);
  });

  it('桁区切りと全角を読む', () => {
    expect(amountOf({ cash: '1,000,000' }, 'cash')).toBe(1_000_000);
    expect(amountOf({ cash: '１０００' }, 'cash')).toBe(1000);
  });

  it('読めない入力は 0 として集計する', () => {
    expect(amountOf({ cash: '約100万' }, 'cash')).toBe(0);
  });

  it('マイナスも読む', () => {
    expect(amountOf({ cash: '-500' }, 'cash')).toBe(-500);
  });
});

describe('区分合計', () => {
  it('控除科目は引く', () => {
    expect(sectionTotal({ cash: '1000', allowanceDoubtful: '100' }, 'current-asset')).toBe(900);
    expect(sectionTotal({ buildings: '5000', accumDepreciation: '2000' }, 'fixed-asset')).toBe(3000);
  });

  it('売上原価は 期首 + 仕入 − 期末', () => {
    expect(sectionTotal({ openingInventory: '100', purchases: '700', closingInventory: '200' }, 'cogs')).toBe(600);
  });

  it('該当科目が無ければ 0', () => {
    expect(sectionTotal({}, 'extra-income')).toBe(0);
  });
});

describe('損益計算書', () => {
  it('段階利益を順に積み上げる', () => {
    const t = incomeTotals({
      sales: '10000', openingInventory: '1000', purchases: '5000', closingInventory: '1500',
      salaries: '2000', rent: '500',
      interestIncome: '50', interestExpense: '150',
      extraIncome: '300', extraLoss: '100',
      incomeTax: '400',
    });
    expect(t.sales).toBe(10000);
    expect(t.cogs).toBe(4500);          // 1000 + 5000 − 1500
    expect(t.grossProfit).toBe(5500);
    expect(t.sga).toBe(2500);
    expect(t.operatingProfit).toBe(3000);
    expect(t.ordinaryProfit).toBe(2900); // 3000 + 50 − 150
    expect(t.pretaxProfit).toBe(3100);   // 2900 + 300 − 100
    expect(t.tax).toBe(400);
    expect(t.netIncome).toBe(2700);
  });

  it('全欄空なら全段階 0', () => {
    const t = incomeTotals({});
    expect([t.sales, t.grossProfit, t.operatingProfit, t.ordinaryProfit, t.pretaxProfit, t.netIncome])
      .toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('赤字も素直に通す', () => {
    const t = incomeTotals({ sales: '1000', purchases: '900', salaries: '500' });
    expect(t.operatingProfit).toBe(-400);
    expect(t.netIncome).toBe(-400);
  });

  it('表示行に段階利益が漏れなく並ぶ', () => {
    const labels = buildIncomeRows(BALANCED).filter((r) => r.kind === 'subtotal' || r.kind === 'total').map((r) => r.label);
    expect(labels).toEqual(['売上総利益', '営業利益', '経常利益', '税引前当期純利益', '当期純利益']);
  });

  it('残高 0 の科目は明細に出さない', () => {
    const rows = buildIncomeRows({ sales: '1000' });
    expect(rows.some((r) => r.label === '雑費')).toBe(false);
    expect(rows.some((r) => r.label === '売上高' && r.kind === 'section')).toBe(true);
  });

  it('損益計算書をスナップショットで固定する', () => {
    expect(buildIncomeRows(BALANCED).map((r) => `${r.kind}|${r.label}|${r.amount}${r.contra ? '|△' : ''}`))
      .toMatchSnapshot();
  });
});

describe('貸借対照表', () => {
  it('当期純利益を繰越利益剰余金に足す（二表の連結）', () => {
    const t = balanceTotals(BALANCED, BALANCED_OPT, 100);
    expect(t.retainedEarnings).toBe(200); // 期首 100 + 当期純利益 100
    expect(t.totalEquity).toBe(700);      // 資本金 500 + 200
  });

  it('配当は繰越利益剰余金から引く', () => {
    const t = balanceTotals({}, { retainedEarningsOpening: 500, dividends: 200 }, 300);
    expect(t.retainedEarnings).toBe(600); // 500 + 300 − 200
  });

  it('利益準備金への振替も繰越利益剰余金から引く（純資産は動かない）', () => {
    const v = { legalReserve: '50' };
    const t = balanceTotals(v, { retainedEarningsOpening: 500, dividends: 0, reserveTransfer: 50 }, 0);
    expect(t.retainedEarnings).toBe(450); // 500 − 50
    expect(t.legalReserve).toBe(50);
    expect(t.totalEquity).toBe(500); // 振替は純資産の中の移動なので合計は変わらない
  });

  it('reserveTransfer を省いたら 0 として扱う', () => {
    const t = balanceTotals({}, { retainedEarningsOpening: 500, dividends: 0 }, 0);
    expect(t.retainedEarnings).toBe(500);
  });

  it('貸借が合う例では差額 0', () => {
    const inc = incomeTotals(BALANCED);
    const t = balanceTotals(BALANCED, BALANCED_OPT, inc.netIncome);
    expect(inc.netIncome).toBe(100);
    expect(t.totalAssets).toBe(1000);
    expect(t.totalLiabilitiesEquity).toBe(1000);
    expect(t.difference).toBe(0);
  });

  it('差額は 資産 − 負債純資産 の向きで出る', () => {
    const t = balanceTotals({ cash: '1000' }, NO_OPT, 0);
    expect(t.difference).toBe(1000);
    const u = balanceTotals({ accountsPayable: '1000' }, NO_OPT, 0);
    expect(u.difference).toBe(-1000);
  });

  it('繰越損失（期首マイナス）も通す', () => {
    const t = balanceTotals({}, { retainedEarningsOpening: -800, dividends: 0 }, 100);
    expect(t.retainedEarnings).toBe(-700);
    expect(t.totalEquity).toBe(-700);
  });

  it('資産の部と負債・純資産の部を別々に返す', () => {
    const { assets, liabilitiesEquity } = buildBalanceRows(BALANCED, BALANCED_OPT, 100);
    expect(assets.at(-1)).toMatchObject({ label: '資産合計', amount: 1000, kind: 'total' });
    expect(liabilitiesEquity.at(-1)).toMatchObject({ label: '負債・純資産合計', amount: 1000, kind: 'total' });
    expect(liabilitiesEquity.some((r) => r.label === '（うち 当期純利益）' && r.amount === 100)).toBe(true);
  });

  it('貸借対照表をスナップショットで固定する', () => {
    const { assets, liabilitiesEquity } = buildBalanceRows(BALANCED, BALANCED_OPT, 100);
    expect([...assets, ...liabilitiesEquity].map((r) => `${r.kind}|${r.label}|${r.amount}${r.contra ? '|△' : ''}`))
      .toMatchSnapshot();
  });
});

describe('検算', () => {
  const msgs = (v: Amounts, opt = NO_OPT) => checkStatements(v, opt).map((i) => `${i.level}:${i.message}`);
  const has = (v: Amounts, opt: typeof NO_OPT, re: RegExp) => checkStatements(v, opt).some((i) => re.test(i.message));

  it('貸借が合っていれば fatal は出ない', () => {
    expect(checkStatements(BALANCED, BALANCED_OPT).some((i) => i.level === 'fatal')).toBe(false);
  });

  it('貸借がずれたら差額つきで fatal', () => {
    const out = checkStatements({ cash: '1000' }, NO_OPT);
    expect(out[0]!.level).toBe('fatal');
    expect(out[0]!.message).toContain('1,000 円');
    expect(out[0]!.message).toContain('貸借が一致していません');
  });

  it('差額が当期純利益と一致したら、繰越利益剰余金の二重計上を名指しする', () => {
    // 資産 1000 / 資本金 500 なら、貸借が合う期首繰越は 400（+ 当期純利益 100 = 500）。
    // そこへ期末の 500 を期首として入れてしまうと、差額はちょうど当期純利益になる。
    const v: Amounts = { cash: '1000', capitalStock: '500', sales: '1000', purchases: '900' };
    expect(incomeTotals(v).netIncome).toBe(100);
    expect(balanceTotals(v, { retainedEarningsOpening: 400, dividends: 0 }, 100).difference).toBe(0);
    const out = checkStatements(v, { retainedEarningsOpening: 500, dividends: 0 });
    expect(out.some((i) => i.field === 'retainedEarningsOpening' && i.level === 'fatal')).toBe(true);
    expect(out.some((i) => i.message.includes('二重に足している'))).toBe(true);
  });

  it('当期純利益が 0 なら二重計上の指摘は出さない（差額 0 と区別できないため）', () => {
    const out = checkStatements({ cash: '1000' }, NO_OPT);
    expect(out.some((i) => i.field === 'retainedEarningsOpening')).toBe(false);
  });

  it('債務超過を警告する', () => {
    // 資産 100 / 負債 500 / 繰越損失 −400 → 純資産 −400 で貸借は合う
    const insolvent = { cash: '100', accountsPayable: '500' };
    const opt = { retainedEarningsOpening: -400, dividends: 0 };
    expect(balanceTotals(insolvent, opt, 0).difference).toBe(0);
    expect(has(insolvent, opt, /債務超過/)).toBe(true);
    // 純資産ちょうど 0 は警告しない
    expect(has({ cash: '500', accountsPayable: '500' }, NO_OPT, /債務超過/)).toBe(false);
    expect(has(BALANCED, BALANCED_OPT, /債務超過/)).toBe(false);
  });

  it('売上総損失を警告し、期末棚卸を名指しする', () => {
    const out = checkStatements({ sales: '100', purchases: '500' }, NO_OPT);
    expect(out.some((i) => i.field === 'closingInventory' && i.message.includes('売上総損失'))).toBe(true);
  });

  it('売上総利益ちょうど 0 は警告しない', () => {
    expect(has({ sales: '500', purchases: '500' }, NO_OPT, /売上総損失/)).toBe(false);
  });

  it('税引前損失なのに法人税等があれば確認を促す', () => {
    expect(has({ sales: '100', purchases: '500', incomeTax: '70' }, NO_OPT, /均等割/)).toBe(true);
    // 黒字なら出さない
    expect(has({ sales: '1000', purchases: '100', incomeTax: '70' }, NO_OPT, /均等割/)).toBe(false);
  });

  it('赤字の期の配当は分配可能額の確認を促す', () => {
    expect(has({ sales: '100', purchases: '500' }, { retainedEarningsOpening: 0, dividends: 50 }, /分配可能額/)).toBe(true);
    expect(has({ sales: '1000', purchases: '100' }, { retainedEarningsOpening: 0, dividends: 50 }, /分配可能額/)).toBe(false);
  });

  it('数値として読めない入力を名指しする', () => {
    const out = checkStatements({ cash: '約100万' }, NO_OPT);
    expect(out.some((i) => i.field === 'cash' && i.message.includes('読み取れません'))).toBe(true);
  });

  it('空欄は読めない扱いにしない', () => {
    expect(checkStatements({ cash: '   ' }, NO_OPT).some((i) => i.message.includes('読み取れません'))).toBe(false);
  });

  it('マイナス残高は区分の取り違えを疑う', () => {
    const out = checkStatements({ cash: '-100' }, NO_OPT);
    expect(out.some((i) => i.field === 'cash' && i.message.includes('マイナス'))).toBe(true);
  });

  it('控除科目のマイナスは疑わない', () => {
    const out = checkStatements({ allowanceDoubtful: '-100' }, NO_OPT);
    expect(out.some((i) => i.field === 'allowanceDoubtful' && i.message.includes('マイナス'))).toBe(false);
  });

  it('会社法の作成義務と決算公告を必ず案内する', () => {
    const out = checkStatements(BALANCED, BALANCED_OPT);
    expect(out.some((i) => i.basis === '会社法435条2項・4項')).toBe(true);
    const koukoku = out.find((i) => i.basis === '会社法440条1項・2項・3項');
    expect(koukoku?.level).toBe('info');
    // 電子公告は要旨では足りない — ここを落とすと「要旨を出せば済む」と読める案内になる
    expect(koukoku?.message).toContain('電子公告を公告方法としている場合は要旨では足りず');
    expect(koukoku?.message).toContain('官報・日刊新聞紙を公告方法とする会社は要旨で足り');
  });

  it('fatal → warn → info の順に並ぶ', () => {
    const rank = { fatal: 0, warn: 1, info: 2 } as const;
    for (const v of [BALANCED, { cash: '-1000', accountsPayable: '99' }, {}]) {
      const levels = checkStatements(v, NO_OPT).map((i) => rank[i.level]);
      expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    }
  });

  it('全欄空でも落ちず、案内だけを返す', () => {
    expect(msgs({})).toEqual([
      expect.stringContaining('info:計算書類は'),
      expect.stringContaining('info:定時株主総会'),
    ]);
  });
});

/**
 * 科目名と区分の食い違いを、実行時ではなくここで止める。
 *
 * ACCOUNTS は定数なので、区分の付け間違いはビルド前に必ず決まっている。
 * 実行時に毎回チェックしても発火しようがないため、検査はテストに置く。
 * 借入金を資産に、売掛金を負債に置くといった間違いはここで落ちる。
 */
describe('科目表そのものの検算', () => {
  const HINTS: readonly { readonly re: RegExp; readonly expect: readonly Section[]; readonly label: string }[] = [
    { re: /借入金|社債/, expect: ['current-liability', 'fixed-liability'], label: '負債' },
    { re: /売掛金|受取手形/, expect: ['current-asset'], label: '流動資産' },
    { re: /買掛金|支払手形|未払/, expect: ['current-liability', 'fixed-liability'], label: '負債' },
    { re: /資本金/, expect: ['capital'], label: '純資産（資本金）' },
    { re: /売上高$/, expect: ['revenue'], label: '売上高' },
    { re: /棚卸高/, expect: ['cogs'], label: '売上原価' },
    { re: /引当金|累計額/, expect: ['current-asset', 'fixed-asset', 'fixed-liability'], label: '控除項目または引当' },
  ];

  it('名前から期待される区分と一致している', () => {
    const bad: string[] = [];
    for (const a of ACCOUNTS) {
      for (const h of HINTS) {
        if (h.re.test(a.name) && !h.expect.includes(a.section)) {
          bad.push(`${a.name} は ${h.label} のはずが ${SECTION_LABEL[a.section]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('検査そのものが働いていること（負のコントロール）', () => {
    // 借入金を流動資産に置いた偽の科目で、上の検査が実際に引っかかることを確かめる。
    const wrong = { k: 'x', name: '短期借入金', section: 'current-asset' as Section };
    const hit = HINTS.filter((h) => h.re.test(wrong.name) && !h.expect.includes(wrong.section));
    expect(hit).toHaveLength(1);
    expect(hit[0]!.label).toBe('負債');
  });
});

/** すべての区分に残高がある例。区分ごとの集計と表示順を余さず踏む。 */
const ALL_SECTIONS: Amounts = {
  cash: '1000', allowanceDoubtful: '50',
  buildings: '3000', accumDepreciation: '1200',
  deferredAsset: '150',
  accountsPayable: '400', longTermDebt: '900',
  capitalStock: '600', capitalSurplus: '200', legalReserve: '80',
  sales: '9000',
  openingInventory: '300', purchases: '4000', closingInventory: '500',
  salaries: '2200',
  interestIncome: '30', interestExpense: '110',
  extraIncome: '70', extraLoss: '40',
  incomeTax: '250',
};

describe('全区分に残高がある例', () => {
  it('区分ごとの合計が控除込みで合う', () => {
    expect(sectionTotal(ALL_SECTIONS, 'current-asset')).toBe(950);
    expect(sectionTotal(ALL_SECTIONS, 'fixed-asset')).toBe(1800);
    expect(sectionTotal(ALL_SECTIONS, 'deferred-asset')).toBe(150);
    expect(sectionTotal(ALL_SECTIONS, 'current-liability')).toBe(400);
    expect(sectionTotal(ALL_SECTIONS, 'fixed-liability')).toBe(900);
    expect(sectionTotal(ALL_SECTIONS, 'capital')).toBe(600);
    expect(sectionTotal(ALL_SECTIONS, 'capital-surplus')).toBe(200);
    expect(sectionTotal(ALL_SECTIONS, 'retained-earnings')).toBe(80);
    expect(sectionTotal(ALL_SECTIONS, 'revenue')).toBe(9000);
    expect(sectionTotal(ALL_SECTIONS, 'cogs')).toBe(3800);
    expect(sectionTotal(ALL_SECTIONS, 'sga')).toBe(2200);
    expect(sectionTotal(ALL_SECTIONS, 'non-op-income')).toBe(30);
    expect(sectionTotal(ALL_SECTIONS, 'non-op-expense')).toBe(110);
    expect(sectionTotal(ALL_SECTIONS, 'extra-income')).toBe(70);
    expect(sectionTotal(ALL_SECTIONS, 'extra-loss')).toBe(40);
    expect(sectionTotal(ALL_SECTIONS, 'tax')).toBe(250);
  });

  it('資産・負債・純資産の各合計が区分の足し合わせになる', () => {
    const t = balanceTotals(ALL_SECTIONS, { retainedEarningsOpening: 100, dividends: 30 }, 700);
    expect(t.totalAssets).toBe(2900);        // 950 + 1800 + 150
    expect(t.totalLiabilities).toBe(1300);   // 400 + 900
    expect(t.retainedEarnings).toBe(770);    // 100 + 700 − 30
    expect(t.totalEquity).toBe(1650);        // 600 + 200 + 80 + 770
    expect(t.totalLiabilitiesEquity).toBe(2950);
    expect(t.difference).toBe(-50);
  });

  it('段階利益が全区分を通って積み上がる', () => {
    const t = incomeTotals(ALL_SECTIONS);
    expect(t.grossProfit).toBe(5200);      // 9000 − 3800
    expect(t.operatingProfit).toBe(3000);  // 5200 − 2200
    expect(t.ordinaryProfit).toBe(2920);   // 3000 + 30 − 110
    expect(t.pretaxProfit).toBe(2950);     // 2920 + 70 − 40
    expect(t.netIncome).toBe(2700);        // 2950 − 250
  });

  it('損益計算書の全行をスナップショットで固定する', () => {
    expect(buildIncomeRows(ALL_SECTIONS).map((r) => `${r.kind}|${r.label}|${r.amount}${r.contra ? '|△' : ''}`))
      .toMatchSnapshot();
  });

  it('貸借対照表の全行をスナップショットで固定する', () => {
    const { assets, liabilitiesEquity } = buildBalanceRows(ALL_SECTIONS, { retainedEarningsOpening: 100, dividends: 30 }, 2700);
    expect([...assets, ...liabilitiesEquity].map((r) => `${r.kind}|${r.label}|${r.amount}${r.contra ? '|△' : ''}`))
      .toMatchSnapshot();
  });

  it('控除科目は明細でも △ 印が付く', () => {
    const rows = buildIncomeRows(ALL_SECTIONS);
    expect(rows.find((r) => r.label === '期末商品棚卸高')?.contra).toBe(true);
    expect(rows.find((r) => r.label === '当期商品仕入高')?.contra).toBeUndefined();
  });
});

describe('検算の文面を丸ごと固定する', () => {
  const flat = (v: Amounts, opt: { retainedEarningsOpening: number; dividends: number }) =>
    checkStatements(v, opt).map((i) => `${i.level}|${i.field ?? '-'}|${i.message}|${i.basis ?? '-'}`);

  it('貸借が合う例', () => {
    expect(flat(BALANCED, BALANCED_OPT)).toMatchSnapshot();
  });

  it('貸借がずれた例', () => {
    expect(flat({ cash: '1000' }, NO_OPT)).toMatchSnapshot();
  });

  it('繰越利益剰余金を二重に足した例', () => {
    expect(flat({ cash: '1000', capitalStock: '500', sales: '1000', purchases: '900' },
      { retainedEarningsOpening: 500, dividends: 0 })).toMatchSnapshot();
  });

  it('債務超過・赤字配当・読み取り不能・マイナス残高が同時に出る例', () => {
    expect(flat(
      { cash: '100', accountsPayable: '500', sales: '100', purchases: '500', incomeTax: '10', land: '約100万', capitalStock: '-20' },
      { retainedEarningsOpening: -400, dividends: 50 },
    )).toMatchSnapshot();
  });
});

describe('検算の境界', () => {
  const has = (v: Amounts, opt: { retainedEarningsOpening: number; dividends: number }, re: RegExp) =>
    checkStatements(v, opt).some((i) => re.test(i.message));

  it('税引前利益ちょうど 0 で法人税等があれば確認を促す', () => {
    expect(has({ sales: '500', purchases: '500', incomeTax: '70' }, NO_OPT, /均等割/)).toBe(true);
    expect(has({ sales: '500', purchases: '500' }, NO_OPT, /均等割/)).toBe(false);
  });

  it('配当 0 なら赤字でも分配可能額の指摘は出ない', () => {
    expect(has({ sales: '100', purchases: '500' }, { retainedEarningsOpening: 0, dividends: 0 }, /分配可能額/)).toBe(false);
  });

  it('当期純利益ちょうど 0 なら赤字配当の指摘は出ない', () => {
    expect(has({}, { retainedEarningsOpening: 0, dividends: 50 }, /分配可能額/)).toBe(false);
  });

  it('残高 0 の科目をマイナス扱いしない', () => {
    expect(checkStatements({ cash: '0' }, NO_OPT).some((i) => i.message.includes('マイナス'))).toBe(false);
  });

  it('純資産ちょうど 0 は債務超過にしない', () => {
    expect(has({}, NO_OPT, /債務超過/)).toBe(false);
    expect(has({}, { retainedEarningsOpening: -1, dividends: 0 }, /債務超過/)).toBe(true);
  });
});

describe('決算公告（貸借対照表の要旨）', () => {
  it('明細を落として区分の合計だけを並べる', () => {
    const rows = buildPublicNoticeRows(BALANCED, BALANCED_OPT, 100);
    expect(rows.map((r) => r.label)).toEqual([
      '資産の部', '流動資産', '固定資産', '繰延資産', '資産合計',
      '負債の部', '流動負債', '固定負債', '負債合計',
      '純資産の部', '資本金', '資本剰余金', '利益剰余金', '（うち 当期純利益）', '純資産合計',
      '負債・純資産合計',
    ]);
    // 科目名（現金及び預金など）は要旨には出さない
    expect(rows.some((r) => r.label === '現金及び預金')).toBe(false);
  });

  it('金額は貸借対照表と同じ集計値になる', () => {
    const t = balanceTotals(BALANCED, BALANCED_OPT, 100);
    const rows = buildPublicNoticeRows(BALANCED, BALANCED_OPT, 100);
    const amount = (label: string) => rows.find((r) => r.label === label)!.amount;
    expect(amount('資産合計')).toBe(t.totalAssets);
    expect(amount('流動資産')).toBe(t.currentAssets);
    expect(amount('固定資産')).toBe(t.fixedAssets);
    expect(amount('繰延資産')).toBe(t.deferredAssets);
    expect(amount('負債合計')).toBe(t.totalLiabilities);
    expect(amount('流動負債')).toBe(t.currentLiabilities);
    expect(amount('固定負債')).toBe(t.fixedLiabilities);
    expect(amount('資本金')).toBe(t.capital);
    expect(amount('資本剰余金')).toBe(t.capitalSurplus);
    expect(amount('純資産合計')).toBe(t.totalEquity);
    expect(amount('負債・純資産合計')).toBe(t.totalLiabilitiesEquity);
    expect(amount('（うち 当期純利益）')).toBe(100);
    expect(amount('資産の部')).toBe(t.totalAssets);
    expect(amount('負債の部')).toBe(t.totalLiabilities);
    expect(amount('純資産の部')).toBe(t.totalEquity);
  });

  it('利益剰余金は 利益準備金 ＋ 繰越利益剰余金 をまとめて出す', () => {
    const v = { ...BALANCED, legalReserve: '30' };
    const t = balanceTotals(v, BALANCED_OPT, 100);
    const rows = buildPublicNoticeRows(v, BALANCED_OPT, 100);
    expect(rows.find((r) => r.label === '利益剰余金')!.amount).toBe(t.legalReserve + t.retainedEarnings);
    expect(rows.find((r) => r.label === '利益剰余金')!.amount).toBe(230); // 30 + (100 + 100)
  });

  it('区分の見出し・小計・合計の別を持つ', () => {
    const rows = buildPublicNoticeRows(BALANCED, BALANCED_OPT, 100);
    // filter で数えると kind が空文字に化けたときに検出できないので、並びを丸ごと固定する
    expect(rows.map((r) => r.kind)).toEqual([
      'section', 'item', 'item', 'item', 'subtotal',
      'section', 'item', 'item', 'subtotal',
      'section', 'item', 'item', 'item', 'item', 'subtotal',
      'total',
    ]);
    expect(rows.filter((r) => r.kind === 'item').map((r) => r.indent)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(rows.filter((r) => r.kind !== 'item').every((r) => r.indent === undefined)).toBe(true);
  });
});

describe('消費税の科目 (税抜経理方式)', () => {
  /*
   * 期中は仮払 (資産) と仮受 (負債) で両建てし、決算で相殺した差額を
   * 未払 (負債) か未収還付 (資産) のどちらか一方へ振り替える。
   * **区分を取り違えると貸借が合わなくなる**ので、位置を検査で固定する。
   */
  it.each([
    ['consumptionTaxPaid', '仮払消費税等', 'current-asset', '仕入れ税額 — 支払った消費税は返ってくるので資産'],
    ['consumptionTaxRefundReceivable', '未収還付消費税等', 'current-asset', '還付金 — 受け取る権利なので資産'],
    ['consumptionTaxReceived', '仮受消費税等', 'current-liability', '販売価格消費税 — 預かって納める義務なので負債'],
    ['consumptionTaxPayable', '未払消費税等', 'current-liability', '納付額 — 納める義務なので負債'],
  ])('%s (%s) は %s に置く (%s)', (k, name, section) => {
    const a = ACCOUNTS.find((x) => x.k === k);
    expect(a, `${k} が科目一覧にありません`).toBeDefined();
    expect(a!.name).toBe(name);
    expect(a!.section).toBe(section);
    expect(a!.contra).toBeUndefined(); // 控除科目ではない
  });

  it('資産側は借方・負債側は貸方に分類される', () => {
    expect(sideOf('current-asset')).toBe('debit');
    expect(sideOf('current-liability')).toBe('credit');
  });

  it('仮払・未収還付は流動資産の合計に足される', () => {
    const v: Amounts = { cash: '1000', consumptionTaxPaid: '80', consumptionTaxRefundReceivable: '20' };
    expect(sectionTotal(v, 'current-asset')).toBe(1100);
  });

  it('仮受・未払は流動負債の合計に足される', () => {
    const v: Amounts = { accountsPayable: '500', consumptionTaxReceived: '100', consumptionTaxPayable: '30' };
    expect(sectionTotal(v, 'current-liability')).toBe(630);
  });

  it('★ 貸借対照表の表示行に、資産の部と負債の部それぞれへ出る', () => {
    const v: Amounts = {
      ...BALANCED,
      consumptionTaxPaid: '80',
      consumptionTaxReceived: '80', // 資産・負債を同額増やして貸借は保つ
    };
    const rows = buildBalanceRows(v, BALANCED_OPT, incomeTotals(v).netIncome);
    expect(rows.assets.some((r) => r.label === '仮払消費税等' && r.amount === 80)).toBe(true);
    expect(rows.liabilitiesEquity.some((r) => r.label === '仮受消費税等' && r.amount === 80)).toBe(true);
    // 両建てしても貸借は崩れない
    expect(balanceTotals(v, BALANCED_OPT, incomeTotals(v).netIncome).difference).toBe(0);
  });

  it('★ 納付と還付を両建てすると鳴る (どちらか一方にしかならない)', () => {
    const v: Amounts = { ...BALANCED, consumptionTaxPayable: '30', consumptionTaxRefundReceivable: '30' };
    const hit = checkStatements(v, BALANCED_OPT).filter((i) => i.field === 'consumptionTaxPayable');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.level).toBe('warn');
    expect(hit[0]!.message).toContain('どちらか一方');
  });

  it('片方だけなら鳴らない (負の対照)', () => {
    for (const k of ['consumptionTaxPayable', 'consumptionTaxRefundReceivable']) {
      const v: Amounts = { ...BALANCED, [k]: '30' };
      const hit = checkStatements(v, BALANCED_OPT).filter((i) =>
        i.message.includes('未払消費税等と未収還付消費税等'),
      );
      expect(hit, `${k} だけで鳴ってはいけない`).toHaveLength(0);
    }
  });

  it('仮払と仮受の両建ては鳴らない (期中は正常な状態)', () => {
    const v: Amounts = { ...BALANCED, consumptionTaxPaid: '80', consumptionTaxReceived: '100' };
    const hit = checkStatements(v, BALANCED_OPT).filter((i) =>
      i.message.includes('未払消費税等と未収還付消費税等'),
    );
    expect(hit).toHaveLength(0);
  });
});
