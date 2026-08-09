import { describe, expect, it } from 'vitest';
import { balanceTotals, incomeTotals, type Amounts } from '../statementAccounts';
import {
  buildEquityRows,
  buildNoteSections,
  checkEquity,
  requiredReserve,
  type EquityOptions,
  type EquityRow,
  type NoteOptions,
} from '../statementEquity';

/** 変動なしの既定値。テストごとに必要な項目だけ上書きする。 */
const OPT: EquityOptions = {
  retainedEarningsOpening: 0,
  dividends: 0,
  reserveTransfer: 0,
  newShares: 0,
  newSharesSurplus: 0,
};

const NOTE: NoteOptions = {
  inventoryPolicy: '',
  depreciationPolicy: '',
  allowancePolicy: '',
  consumptionTaxPolicy: '',
  sharesIssued: 100,
  contingent: '',
  otherNote: '',
};

/** 純資産 700（資本金 500 + 資本剰余金 100 + 利益準備金 50 + 繰越 50）の期末残高。 */
const V: Amounts = { capitalStock: '500', capitalSurplus: '100', legalReserve: '50' };

const at = (label: string, rows: readonly EquityRow[]): EquityRow => {
  const hit = rows.find((r) => r.label === label);
  expect(hit).toBeDefined();
  return hit!;
};

describe('株主資本等変動計算書', () => {
  it('行は 当期首 → 変動事由4件 → 変動額合計 → 当期末 の順に並ぶ', () => {
    const rows = buildEquityRows(V, OPT, 0);
    expect(rows.map((r) => r.label)).toEqual([
      '当期首残高', '新株の発行', '剰余金の配当', '利益準備金の積立', '当期純利益', '当期変動額 合計', '当期末残高',
    ]);
    expect(rows.map((r) => r.kind)).toEqual([
      'opening', 'change', 'change', 'change', 'change', 'changeTotal', 'ending',
    ]);
  });

  it('合計列は 4 列の和になっている', () => {
    const rows = buildEquityRows(V, { ...OPT, retainedEarningsOpening: 30, newShares: 200, newSharesSurplus: 100, reserveTransfer: 10, dividends: 20 }, 90);
    for (const r of rows) {
      expect(r.total).toBe(r.capital + r.capitalSurplus + r.legalReserve + r.retained);
    }
  });

  it('当期末残高は貸借対照表の純資産の部と一致する', () => {
    const opt = { ...OPT, retainedEarningsOpening: 30, dividends: 20, reserveTransfer: 10 };
    const bs = balanceTotals(V, opt, 90);
    const end = at('当期末残高', buildEquityRows(V, opt, 90));
    expect(end.capital).toBe(bs.capital);
    expect(end.capitalSurplus).toBe(bs.capitalSurplus);
    expect(end.legalReserve).toBe(bs.legalReserve);
    expect(end.retained).toBe(bs.retainedEarnings);
    expect(end.total).toBe(bs.totalEquity);
  });

  it('当期首残高 ＋ 当期変動額 = 当期末残高', () => {
    const opt = { ...OPT, retainedEarningsOpening: 30, dividends: 20, reserveTransfer: 10, newShares: 200, newSharesSurplus: 100 };
    const rows = buildEquityRows(V, opt, 90);
    const open = at('当期首残高', rows);
    const delta = at('当期変動額 合計', rows);
    const end = at('当期末残高', rows);
    expect(open.capital + delta.capital).toBe(end.capital);
    expect(open.capitalSurplus + delta.capitalSurplus).toBe(end.capitalSurplus);
    expect(open.legalReserve + delta.legalReserve).toBe(end.legalReserve);
    expect(open.retained + delta.retained).toBe(end.retained);
    expect(open.total + delta.total).toBe(end.total);
  });

  it('新株の発行は資本金と資本剰余金だけを動かす', () => {
    const r = at('新株の発行', buildEquityRows(V, { ...OPT, newShares: 200, newSharesSurplus: 100 }, 0));
    expect(r.capital).toBe(200);
    expect(r.capitalSurplus).toBe(100);
    expect(r.legalReserve).toBe(0);
    expect(r.retained).toBe(0);
    expect(r.total).toBe(300);
  });

  it('剰余金の配当は繰越利益剰余金をマイナスで動かす', () => {
    const r = at('剰余金の配当', buildEquityRows(V, { ...OPT, dividends: 20 }, 0));
    expect(r.retained).toBe(-20);
    expect(r.capital).toBe(0);
    expect(r.capitalSurplus).toBe(0);
    expect(r.legalReserve).toBe(0);
    expect(r.total).toBe(-20);
  });

  it('利益準備金の積立は純資産の中の振替なので合計が動かない', () => {
    const r = at('利益準備金の積立', buildEquityRows(V, { ...OPT, reserveTransfer: 10 }, 0));
    expect(r.legalReserve).toBe(10);
    expect(r.retained).toBe(-10);
    expect(r.total).toBe(0);
  });

  it('当期純利益は繰越利益剰余金だけを動かす', () => {
    const r = at('当期純利益', buildEquityRows(V, OPT, 90));
    expect(r.retained).toBe(90);
    expect(r.capital).toBe(0);
    expect(r.capitalSurplus).toBe(0);
    expect(r.legalReserve).toBe(0);
    expect(r.total).toBe(90);
  });

  it('当期純損失なら繰越利益剰余金が減る', () => {
    const rows = buildEquityRows(V, OPT, -40);
    expect(at('当期純利益', rows).retained).toBe(-40);
    expect(at('当期末残高', rows).retained).toBe(-40);
    expect(at('当期首残高', rows).retained).toBe(0);
  });

  it('reserveTransfer を省いても 0 として扱う', () => {
    const { reserveTransfer: _drop, ...noTransfer } = OPT;
    const rows = buildEquityRows(V, noTransfer, 90);
    expect(at('利益準備金の積立', rows).legalReserve).toBe(0);
    expect(at('利益準備金の積立', rows).retained).toBe(0);
    expect(at('当期末残高', rows).retained).toBe(90);
  });

  it('期末残高は勘定科目から取る（資本金・資本剰余金・利益準備金）', () => {
    const end = at('当期末残高', buildEquityRows({ capitalStock: '7', capitalSurplus: '5', legalReserve: '3' }, OPT, 0));
    expect(end.capital).toBe(7);
    expect(end.capitalSurplus).toBe(5);
    expect(end.legalReserve).toBe(3);
  });
});

describe('個別注記表', () => {
  const build = (over: Partial<EquityOptions & NoteOptions> = {}, v: Amounts = V, net = 90) =>
    buildNoteSections(v, { ...OPT, ...NOTE, ...over }, net);

  it('見出しは 5 区分', () => {
    expect(build().map((s) => s.heading)).toEqual([
      '1. 重要な会計方針に係る事項に関する注記',
      '2. 貸借対照表に関する注記',
      '3. 損益計算書に関する注記',
      '4. 株主資本等変動計算書に関する注記',
      '5. その他の注記',
    ]);
  });

  it('会計方針が空欄なら既定の書きぶりで埋める', () => {
    const items = build()[0]!.items;
    expect(items[0]).toContain('最終仕入原価法');
    expect(items[1]).toContain('定額法');
    expect(items[2]).toContain('貸倒引当金');
    expect(items[3]).toContain('税抜方式');
  });

  it('会計方針を入力したらそれを使う', () => {
    const items = build({
      inventoryPolicy: '移動平均法', depreciationPolicy: '定率法',
      allowancePolicy: '法定繰入率', consumptionTaxPolicy: '税込方式',
    })[0]!.items;
    expect(items[0]).toBe('資産の評価基準及び評価方法: 移動平均法');
    expect(items[1]).toBe('固定資産の減価償却の方法: 定率法');
    expect(items[2]).toBe('引当金の計上基準: 法定繰入率');
    expect(items[3]).toBe('消費税等の会計処理: 税込方式');
  });

  it('空白だけの入力は未入力と同じ扱いにする', () => {
    expect(build({ inventoryPolicy: '   ' })[0]!.items[0]).toContain('最終仕入原価法');
  });

  it('減価償却累計額は勘定科目から引く', () => {
    const items = build({}, { ...V, accumDepreciation: '1234567' })[1]!.items;
    expect(items[0]).toBe('有形固定資産の減価償却累計額: 1,234,567 円');
  });

  it('偶発債務は空欄なら「該当事項はありません」', () => {
    expect(build()[1]!.items[1]).toBe('保証債務その他の偶発債務: 該当事項はありません。');
    expect(build({ contingent: '借入金の保証 500 万円' })[1]!.items[1]).toContain('借入金の保証 500 万円');
  });

  it('損益計算書に関する注記は当期純利益を出す', () => {
    expect(build({}, V, 90)[2]!.items).toEqual(['当期純利益: 90 円']);
    expect(build({}, V, -40)[2]!.items).toEqual(['当期純利益: -40 円']);
  });

  it('株主資本等変動計算書に関する注記は 発行済株式数・配当・純資産', () => {
    const items = build({ sharesIssued: 12345, dividends: 20 })[3]!.items;
    expect(items[0]).toBe('当事業年度末日における発行済株式の総数: 普通株式 12,345 株');
    expect(items[1]).toBe('剰余金の配当: 配当金の総額 20 円');
    expect(items[2]).toContain('当事業年度末日における純資産の額');
  });

  it('配当が 0 なら「配当はありません」と書く', () => {
    expect(build({ dividends: 0 })[3]!.items[1]).toBe('剰余金の配当: 当事業年度中の剰余金の配当はありません。');
  });

  it('純資産の額は貸借対照表と一致する', () => {
    const opt = { ...OPT, ...NOTE, retainedEarningsOpening: 30, dividends: 20, reserveTransfer: 10 };
    const total = balanceTotals(V, opt, 90).totalEquity;
    expect(buildNoteSections(V, opt, 90)[3]!.items[2]).toBe(`当事業年度末日における純資産の額: ${total.toLocaleString('ja-JP')} 円`);
  });

  it('その他の注記は空欄なら「該当事項はありません」', () => {
    expect(build()[4]!.items).toEqual(['該当事項はありません。']);
    expect(build({ otherNote: '重要な後発事象: なし' })[4]!.items).toEqual(['重要な後発事象: なし']);
  });
});

describe('準備金の積立額', () => {
  it('配当額の 10 分の 1（円未満切捨て）', () => {
    expect(requiredReserve(0)).toBe(0);
    expect(requiredReserve(9)).toBe(0);
    expect(requiredReserve(10)).toBe(1);
    expect(requiredReserve(19)).toBe(1);
    expect(requiredReserve(1_000_000)).toBe(100_000);
  });
});

describe('株主資本等変動計算書・個別注記表の検算', () => {
  const run = (over: Partial<EquityOptions & NoteOptions> = {}, v: Amounts = V, net = 0) =>
    checkEquity(v, { ...OPT, ...NOTE, ...over }, net);
  const has = (out: readonly { message: string }[], re: RegExp) => out.some((i) => re.test(i.message));
  const pick = (out: readonly { message: string }[], re: RegExp) => out.find((i) => re.test(i.message));

  it('増加額が期末残高を上回ると期首がマイナスになるので fatal', () => {
    const hit = pick(run({ newShares: 600 }), /当期首の資本金/);
    expect(hit).toBeDefined();
    expect(hit).toMatchObject({ level: 'fatal', field: 'newShares' });
    expect(hit!.message).toContain('-100 円');
    expect(hit!.message).toContain('当期の増加額が期末残高を上回っている');
    expect(has(run({ newShares: 500 }), /当期首の資本金/)).toBe(false);
  });

  it('資本剰余金・利益準備金も同じように見る', () => {
    expect(pick(run({ newSharesSurplus: 101 }), /当期首の資本剰余金/)).toMatchObject({ level: 'fatal', field: 'newSharesSurplus' });
    expect(has(run({ newSharesSurplus: 100 }), /当期首の資本剰余金/)).toBe(false);
    expect(pick(run({ reserveTransfer: 51 }), /当期首の利益準備金/)).toMatchObject({ level: 'fatal', field: 'reserveTransfer' });
    expect(has(run({ reserveTransfer: 50 }), /当期首の利益準備金/)).toBe(false);
  });

  it('3 項目とも同時に指摘できる', () => {
    const out = run({ newShares: 600, newSharesSurplus: 200, reserveTransfer: 60 });
    expect(out.filter((i) => i.level === 'fatal')).toHaveLength(3);
  });

  it('資本準備金が資本金の増加額を超えたら会社法445条2項・3項で warn', () => {
    const hit = pick(run({ newShares: 100, newSharesSurplus: 101 }, { ...V, capitalStock: '5000', capitalSurplus: '5000' }), /2分の1を超える額/);
    expect(hit).toMatchObject({ level: 'warn', field: 'newSharesSurplus', basis: '会社法445条2項・3項' });
    expect(hit!.message).toContain('101 円');
    expect(hit!.message).toContain('100 円');
    // ちょうど同額（＝払込額の2分の1ずつ）は通す
    expect(has(run({ newShares: 100, newSharesSurplus: 100 }, { ...V, capitalStock: '5000', capitalSurplus: '5000' }), /2分の1を超える額/)).toBe(false);
  });

  it('配当したのに準備金の積立が 10 分の 1 に足りなければ warn', () => {
    const hit = pick(run({ dividends: 100, reserveTransfer: 9 }), /10分の1/);
    expect(hit).toMatchObject({ level: 'warn', field: 'reserveTransfer', basis: '会社法445条4項' });
    expect(hit!.message).toContain('100 円');
    expect(hit!.message).toContain('（10 円）');
    expect(hit!.message).toContain('資本準備金または利益準備金として計上する必要があります');
    expect(hit!.message).toContain('4分の1に達している場合を除く');
    // ちょうど 10 分の 1 は通す
    expect(has(run({ dividends: 100, reserveTransfer: 10 }), /10分の1/)).toBe(false);
    // 多く積むのも通す
    expect(has(run({ dividends: 100, reserveTransfer: 11 }), /10分の1/)).toBe(false);
  });

  it('配当が 0 なら積立を求めない', () => {
    expect(has(run({ dividends: 0, reserveTransfer: 0 }), /10分の1/)).toBe(false);
    // 配当が 9 円だと 10 分の 1 が 0 円になるので求めようがない
    expect(has(run({ dividends: 9, reserveTransfer: 0 }), /10分の1/)).toBe(false);
    expect(has(run({ dividends: 10, reserveTransfer: 0 }), /10分の1/)).toBe(true);
    // 積立額がマイナスでも、配当が無いなら 445条4項 の話は出てこない
    expect(has(run({ dividends: 0, reserveTransfer: -5 }), /10分の1/)).toBe(false);
    expect(has(run({ dividends: 9, reserveTransfer: -5 }), /10分の1/)).toBe(false);
  });

  it('reserveTransfer を省いた場合も 0 として積立不足を見る', () => {
    const { reserveTransfer: _drop, ...noTransfer } = OPT;
    expect(has(checkEquity(V, { ...noTransfer, ...NOTE, dividends: 100 }, 0), /10分の1/)).toBe(true);
  });

  it('発行済株式の総数が未入力なら warn', () => {
    expect(pick(run({ sharesIssued: 0 }), /発行済株式の総数/)).toMatchObject({ level: 'warn', field: 'sharesIssued' });
    expect(has(run({ sharesIssued: 1 }), /発行済株式の総数/)).toBe(false);
    expect(has(run({ sharesIssued: -1 }), /発行済株式の総数/)).toBe(true);
  });

  it('貸借対照表との一致と、注記の省略可否を必ず案内する', () => {
    const out = run();
    const a = pick(out, /貸借対照表の純資産の部と一致/);
    expect(a).toMatchObject({ level: 'info', basis: '会社法435条2項' });
    expect(a!.message).toContain('逆算');
    const b = pick(out, /省略できる注記/);
    expect(b).toMatchObject({ level: 'info', basis: '会社法435条2項' });
    expect(b!.message).toContain('税理士・公認会計士');
  });

  it('問題がなければ info 2 件だけ', () => {
    const out = run();
    expect(out.filter((i) => i.level !== 'info')).toHaveLength(0);
    expect(out).toHaveLength(2);
  });

  it('当期純利益は検算に渡した値がそのまま効く（貸借対照表側と同じ純資産を見る）', () => {
    const inc = incomeTotals({ sales: '1000', purchases: '600', salaries: '250', incomeTax: '50' });
    expect(inc.netIncome).toBe(100);
    const end = at('当期末残高', buildEquityRows(V, OPT, inc.netIncome));
    expect(end.retained).toBe(100);
  });
});
