/**
 * コンシェルジュが自分の記録について聞かれたとき、数字で答える (`chatData.ts` · 2026-11-22)。
 *
 * 背骨は 2 つ —— ① 発話を問いに読むか (読まない物を取らない) ② 答えの数が**画面と同じ漏斗**から
 * 出て、読めなかったことと 0 件を混ぜないか。
 */
import { describe, expect, it } from 'vitest';
import { answerDataQuestion, monthLabel, parseDataQuestion, type DataSnapshot } from '../chatData';
import type { Member } from '../members';
import { summarizeSales, type SalesEntry } from '../sales';
import type { KpiActual } from '../kpiActuals';

const sale = (date: string, amount: number, orders = 1): SalesEntry =>
  ({ date, channel: 'shopify', amount, orders }) as SalesEntry;
const kpi = (period: string, revenue: number, cogs: number, sga: number): KpiActual =>
  ({ period, unit: '全社', revenue, cogs, advertising: 0, sga, depreciation: 0 }) as KpiActual;

const TODAY = '2026-11-22';

describe('parseDataQuestion — 問いと読む物・読まない物', () => {
  it.each([
    ['今月の売上はいくら？', { topic: 'sales', span: 'this-month' }],
    ['先月の売り上げを教えて', { topic: 'sales', span: 'last-month' }],
    ['今年の売上は', { topic: 'sales', span: 'this-year' }],
    ['これまでの売上の合計は？', { topic: 'sales', span: 'all' }],
    ['注文は何件？', { topic: 'sales', span: 'latest' }],
    ['利益はいくら？', { topic: 'profit', span: 'latest' }],
    ['今月は赤字ですか', { topic: 'profit', span: 'this-month' }],
  ] as const)('「%s」は問い', (text, want) => {
    expect(parseDataQuestion(text)).toEqual(want);
  });

  it.each(['売上集計を開いて', '売上', '利益', '', '   ', '今月の天気は？', '経営指標・損益分岐点を開いて'])(
    '「%s」は問いではない (画面の案内・別の話題のまま)',
    (text) => {
      expect(parseDataQuestion(text)).toBeNull();
    },
  );

  it('「先月」は「今月」より先に読む (語の重なりで取り違えない)', () => {
    expect(parseDataQuestion('先月と今月の売上は？')?.span).toBe('last-month');
  });
});

describe('answerDataQuestion — 売上', () => {
  const rows = [sale('2026-11-01', 1000, 2), sale('2026-11-15', 2500, 1), sale('2026-10-03', 700, 4), sale('2025-12-31', 50, 1)];

  it('★ 今月の売上は画面の集計と同じ額 (同じ漏斗)', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { balanceSheets: [], members: [], sales: rows, kpi: [], today: TODAY });
    const screen = summarizeSales(rows.filter((r) => r.date.startsWith('2026-11'))).totalAmount;
    expect(screen).toBe(3500);
    expect(a.text).toBe('📊 今月 (2026年11月)の売上は ¥3,500（記録 2 件・注文 3 件）です。');
    expect(a.screen).toBe('sales');
  });

  it('先月は 1 月なら前の年の 12 月', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'last-month' }, { balanceSheets: [], members: [], sales: rows, kpi: [], today: '2026-01-10' });
    expect(a.text).toContain('先月 (2025年12月)の売上は ¥50');
  });

  it('今年・合計・最後の月', () => {
    expect(answerDataQuestion({ topic: 'sales', span: 'this-year' }, { balanceSheets: [], members: [], sales: rows, kpi: [], today: TODAY }).text).toContain('¥4,200');
    expect(answerDataQuestion({ topic: 'sales', span: 'all' }, { balanceSheets: [], members: [], sales: rows, kpi: [], today: TODAY }).text).toContain('¥4,250');
    expect(answerDataQuestion({ topic: 'sales', span: 'latest' }, { balanceSheets: [], members: [], sales: rows, kpi: [], today: TODAY }).text).toContain(
      '記録の在る最後の月 (2026年11月)の売上は ¥3,500',
    );
  });

  it('★ 読めなかったことと 0 件を混ぜない', () => {
    const unread = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { balanceSheets: [], members: [], sales: null, kpi: [], today: TODAY });
    expect(unread.text).toContain('読めませんでした');
    expect(unread.text).toContain('0 件という意味ではありません');
    const none = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { balanceSheets: [], members: [], sales: [], kpi: [], today: TODAY });
    expect(none.text).toContain('まだ 1 件もありません');
    expect(none.text).not.toContain('読めませんでした');
  });

  it('期間に記録が無ければそう言い、最後の記録の月を添える', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { balanceSheets: [], members: [], sales: [sale('2026-09-01', 10)], kpi: [], today: TODAY });
    expect(a.text).toBe('📊 今月 (2026年11月)の販売記録はありません。最後の記録は 2026年9月 です。');
  });

  it('★ 日付や金額が読めない行は数えず、その件数を名乗る', () => {
    const bad = [sale('2026-11-01', 1000), sale('2026-02-31', 9_999_999), { ...sale('2026-11-02', 0), amount: '500' } as unknown as SalesEntry];
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { balanceSheets: [], members: [], sales: bad, kpi: [], today: TODAY });
    expect(a.text).toContain('¥1,000');
    expect(a.text).toContain('読めない 2 件は数えていません');
    const allBad = answerDataQuestion({ topic: 'sales', span: 'all' }, { balanceSheets: [], members: [], sales: [sale('bad', 1)], kpi: [], today: TODAY });
    expect(allBad.text).toContain('1 件ありますが、日付か金額が読めない');
  });

  it('今日が暦に無い日付なら、最後の月で答える (でっち上げた今月を名乗らない)', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { balanceSheets: [], members: [], sales: rows, kpi: [], today: 'bad' });
    expect(a.text).toContain('記録の在る最後の月 (2026年11月)');
    const all = answerDataQuestion({ topic: 'sales', span: 'all' }, { balanceSheets: [], members: [], sales: rows, kpi: [], today: 'bad' });
    expect(all.text).toContain('これまでの合計');
  });
});

describe('answerDataQuestion — 利益', () => {
  it('★ 営業利益と黒字・赤字を言う', () => {
    const rows = [kpi('2026-10', 1_000_000, 400_000, 200_000), kpi('2026-11', 500_000, 300_000, 400_000)];
    const last = answerDataQuestion({ topic: 'profit', span: 'last-month' }, { balanceSheets: [], members: [], sales: [], kpi: rows, today: TODAY });
    expect(last.text).toBe('📈 先月 (2026年10月)の営業利益は ¥400,000 で、黒字です（売上 ¥1,000,000）。');
    const now = answerDataQuestion({ topic: 'profit', span: 'this-month' }, { balanceSheets: [], members: [], sales: [], kpi: rows, today: TODAY });
    expect(now.text).toContain('¥-200,000 で、赤字です');
    expect(now.screen).toBe('kpi');
  });

  it('読めない・無い・期間外', () => {
    expect(answerDataQuestion({ topic: 'profit', span: 'latest' }, { balanceSheets: [], members: [], sales: [], kpi: null, today: TODAY }).text).toContain('読めませんでした');
    expect(answerDataQuestion({ topic: 'profit', span: 'latest' }, { balanceSheets: [], members: [], sales: [], kpi: [], today: TODAY }).text).toContain('「経営指標・損益分岐点」の画面');
    expect(answerDataQuestion({ topic: 'profit', span: 'this-month' }, { balanceSheets: [], members: [], sales: [], kpi: [kpi('2026-01', 1, 0, 0)], today: TODAY }).text).toBe(
      '📈 今月 (2026年11月)の実績の記録はありません。最後の記録は 2026年1月 です。',
    );
    expect(answerDataQuestion({ topic: 'profit', span: 'all' }, { balanceSheets: [], members: [], sales: [], kpi: [kpi('bad', 1, 0, 0)], today: TODAY }).text).toContain('期か金額が読めない');
  });
});

it('monthLabel', () => {
  expect(monthLabel('2026-03')).toBe('2026年3月');
});

describe('語の表 —— 1 語ずつ効いている (変異検査が教えた標本)', () => {
  it.each([
    ['今月の売上は？', 'sales'], ['今月の売り上げは？', 'sales'], ['今月のうりあげは？', 'sales'], ['今月のウリアゲは？', 'sales'],
    ['今月の注文は？', 'sales'], ['今月の受注は？', 'sales'],
    ['今月の利益は？', 'profit'], ['今月のもうけは？', 'profit'], ['今月の儲けは？', 'profit'], ['今月のモウケは？', 'profit'],
    ['今月は黒字？', 'profit'], ['今月は赤字？', 'profit'],
  ] as const)('話題「%s」→ %s', (text, topic) => {
    expect(parseDataQuestion(text)?.topic).toBe(topic);
  });

  it.each([
    ['売上いくら', 'latest'], ['売上どれくらい', 'latest'], ['売上どのくらい', 'latest'], ['売上どれぐらい', 'latest'],
    ['注文何件', 'latest'], ['注文なんけん', 'latest'], ['社員何人', 'latest'], ['社員なんにん', 'latest'], ['売上何円', 'latest'], ['売上教えて', 'latest'], ['売上おしえて', 'latest'],
    ['売上知りたい', 'latest'], ['売上しりたい', 'latest'], ['売上?', 'latest'], ['売上？', 'latest'], ['売上ですか', 'latest'],
    ['売上でしたか', 'latest'], ['売上どう', 'latest'],
    ['先月売上', 'last-month'], ['せんげつ売上', 'last-month'], ['前月売上', 'last-month'],
    ['今月売上', 'this-month'], ['こんげつ売上', 'this-month'],
    ['今年売上', 'this-year'], ['ことし売上', 'this-year'], ['本年売上', 'this-year'], ['年間売上', 'this-year'],
    ['累計売上', 'all'], ['合計売上', 'all'], ['全部売上', 'all'], ['ぜんぶ売上', 'all'], ['これまで売上', 'all'], ['全期間売上', 'all'],
  ] as const)('印「%s」→ %s', (text, span) => {
    expect(parseDataQuestion(text)?.span).toBe(span);
  });

  it.each(['今月の売上を開いて', '今月の売上をひらいて', '今月の売上画面を開け', '今月の売上へ移動'])(
    '「%s」は開けと言っているので問いではない',
    (text) => {
      expect(parseDataQuestion(text)).toBeNull();
    },
  );
});

describe('答えの細部 (変異検査が教えた標本)', () => {
  it('1 桁の月も今月として数える (2026-03)', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { balanceSheets: [], members: [], sales: [sale('2026-03-01', 10)], kpi: [], today: '2026-03-05' });
    expect(a.text).toBe('📊 今月 (2026年3月)の売上は ¥10（記録 1 件・注文 1 件）です。');
  });

  it('今年の名前', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'this-year' }, { balanceSheets: [], members: [], sales: [sale('2026-05-01', 10)], kpi: [], today: TODAY });
    expect(a.text).toBe('📊 今年 (2026年)の売上は ¥10（記録 1 件・注文 1 件）です。');
  });

  it('★ 最後の月は並び順に依らず、綴りの最大を採る', () => {
    const s = answerDataQuestion({ topic: 'sales', span: 'latest' }, {
      balanceSheets: [], members: [], sales: [sale('2026-09-01', 1), sale('2026-11-01', 2), sale('2026-10-01', 4)], kpi: [], today: TODAY,
    });
    expect(s.text).toContain('記録の在る最後の月 (2026年11月)の売上は ¥2');
    const p = answerDataQuestion({ topic: 'profit', span: 'latest' }, {
      balanceSheets: [], members: [], sales: [], kpi: [kpi('2026-09', 1, 0, 0), kpi('2026-11', 2, 0, 0), kpi('2026-10', 4, 0, 0)], today: TODAY,
    });
    expect(p.text).toContain('記録の在る最後の月 (2026年11月)の営業利益は ¥2');
  });

  it('読めなかったときの文 (何を読めなかったかを名指しする)', () => {
    expect(answerDataQuestion({ topic: 'sales', span: 'all' }, { balanceSheets: [], members: [], sales: null, kpi: [], today: TODAY }).text).toBe(
      '⚠ この端末に保存した販売記録を読めませんでした。記録が 0 件という意味ではありません。画面を開き直してから、もう一度聞いてください。',
    );
    expect(answerDataQuestion({ topic: 'profit', span: 'all' }, { balanceSheets: [], members: [], sales: [], kpi: null, today: TODAY }).text).toBe(
      '⚠ この端末に保存した実績 (KPI) の記録を読めませんでした。記録が 0 件という意味ではありません。画面を開き直してから、もう一度聞いてください。',
    );
  });

  it('利益: 読めない行を数えず件数を言う・収支 0 は黒字とも赤字とも言わない', () => {
    const a = answerDataQuestion({ topic: 'profit', span: 'all' }, { balanceSheets: [], members: [], sales: [], kpi: [kpi('2026-10', 100, 40, 60), kpi('bad', 1, 0, 0)], today: TODAY });
    expect(a.text).toBe('📈 これまでの合計の営業利益は ¥0 で、収支はちょうど 0 円です（売上 ¥100）。\n（期か金額が読めない 1 件は数えていません）');
  });
});

describe('現預金と人数 (2026-11-23)', () => {
  const base: DataSnapshot = { sales: [], kpi: [], balanceSheets: [], members: [], today: TODAY };
  const bs = (asOf: string, data: Record<string, unknown>, createdAt = 1) => ({ id: `bs-${createdAt}`, data: { asOf, ...data }, createdAt });
  const member = (role: Member['role']): Member => ({ name: 'Aさん', email: 'a@example.com', role });

  it.each([
    ['現預金はいくら？', 'cash'], ['現金は？', 'cash'], ['預金はどれくらい', 'cash'], ['手元資金を教えて', 'cash'], ['手持ちは？', 'cash'],
    ['メンバーは何人？', 'members'], ['めんばーは？', 'members'], ['従業員は？', 'members'], ['社員は？', 'members'],
    ['スタッフは？', 'members'], ['何人いる', 'members'], ['なんにんいる', 'members'], ['人数は？', 'members'],
  ] as const)('話題「%s」→ %s', (text, topic) => {
    expect(parseDataQuestion(text)?.topic).toBe(topic);
  });

  it('「資金調達の案件は？」は現預金の問いではない (別の画面)', () => {
    expect(parseDataQuestion('資金調達の案件は？')).toBeNull();
  });

  it('★ 現預金は「現在」の控え (基準日の新しい物) から、基準日つきで言う', () => {
    const a = answerDataQuestion({ topic: 'cash', span: 'latest' }, {
      ...base,
      balanceSheets: [bs('2026-09-30', { cash: 9_000 }, 5), bs('2026-10-31', { cash: 1_234_567 }, 1), bs('2026-08-31', { cash: 7 }, 9)],
    });
    expect(a.text).toBe('💴 手元の現預金は ¥1,234,567 です（基準日 2026-10-31 の控え）。');
    expect(a.screen).toBe('kpi');
  });

  it('現預金: 未入力・読めない・基準日なし・控え無し・読めない保管層', () => {
    expect(answerDataQuestion({ topic: 'cash', span: 'latest' }, { ...base, balanceSheets: [bs('2026-10-31', {})] }).text).toBe(
      '💴 基準日 2026-10-31 の控えでは、現預金がまだ入力されていません。「経営指標・損益分岐点」の画面の貸借対照表で入れると答えられます。',
    );
    expect(answerDataQuestion({ topic: 'cash', span: 'latest' }, { ...base, balanceSheets: [bs('2026-10-31', { cash: '500' })] }).text).toContain(
      '現預金が数として読めません',
    );
    expect(answerDataQuestion({ topic: 'cash', span: 'latest' }, { ...base, balanceSheets: [bs('', { cash: 10 })] }).text).toBe(
      '💴 手元の現預金は ¥10 です（基準日の書かれていない控え）。',
    );
    expect(answerDataQuestion({ topic: 'cash', span: 'latest' }, base).text).toBe(
      '💴 貸借対照表がまだ 1 件もありません。「経営指標・損益分岐点」の画面で入力すると答えられます。',
    );
    expect(answerDataQuestion({ topic: 'cash', span: 'latest' }, { ...base, balanceSheets: null }).text).toBe(
      '⚠ この端末に保存した貸借対照表を読めませんでした。記録が 0 件という意味ではありません。画面を開き直してから、もう一度聞いてください。',
    );
  });

  it('★ 人数とオーナーの数', () => {
    const a = answerDataQuestion({ topic: 'members', span: 'latest' }, { ...base, members: [member('owner'), member('member'), member('admin')] });
    expect(a.text).toBe('👥 チームのメンバーは 3 人です（うちオーナー 1 人）。');
    expect(a.screen).toBe('team');
    expect(answerDataQuestion({ topic: 'members', span: 'latest' }, base).text).toBe(
      '👥 チームのメンバーはまだ登録されていません。「チーム管理」の画面で招待すると答えられます。',
    );
    expect(answerDataQuestion({ topic: 'members', span: 'latest' }, { ...base, members: null }).text).toBe(
      '⚠ この端末に保存したチームのメンバーを読めませんでした。記録が 0 件という意味ではありません。画面を開き直してから、もう一度聞いてください。',
    );
  });
});
