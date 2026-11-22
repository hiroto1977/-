/**
 * コンシェルジュが自分の記録について聞かれたとき、数字で答える (`chatData.ts` · 2026-11-22)。
 *
 * 背骨は 2 つ —— ① 発話を問いに読むか (読まない物を取らない) ② 答えの数が**画面と同じ漏斗**から
 * 出て、読めなかったことと 0 件を混ぜないか。
 */
import { describe, expect, it } from 'vitest';
import { answerDataQuestion, monthLabel, parseDataQuestion } from '../chatData';
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
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { sales: rows, kpi: [], today: TODAY });
    const screen = summarizeSales(rows.filter((r) => r.date.startsWith('2026-11'))).totalAmount;
    expect(screen).toBe(3500);
    expect(a.text).toBe('📊 今月 (2026年11月)の売上は ¥3,500（記録 2 件・注文 3 件）です。');
    expect(a.screen).toBe('sales');
  });

  it('先月は 1 月なら前の年の 12 月', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'last-month' }, { sales: rows, kpi: [], today: '2026-01-10' });
    expect(a.text).toContain('先月 (2025年12月)の売上は ¥50');
  });

  it('今年・合計・最後の月', () => {
    expect(answerDataQuestion({ topic: 'sales', span: 'this-year' }, { sales: rows, kpi: [], today: TODAY }).text).toContain('¥4,200');
    expect(answerDataQuestion({ topic: 'sales', span: 'all' }, { sales: rows, kpi: [], today: TODAY }).text).toContain('¥4,250');
    expect(answerDataQuestion({ topic: 'sales', span: 'latest' }, { sales: rows, kpi: [], today: TODAY }).text).toContain(
      '記録の在る最後の月 (2026年11月)の売上は ¥3,500',
    );
  });

  it('★ 読めなかったことと 0 件を混ぜない', () => {
    const unread = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { sales: null, kpi: [], today: TODAY });
    expect(unread.text).toContain('読めませんでした');
    expect(unread.text).toContain('0 件という意味ではありません');
    const none = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { sales: [], kpi: [], today: TODAY });
    expect(none.text).toContain('まだ 1 件もありません');
    expect(none.text).not.toContain('読めませんでした');
  });

  it('期間に記録が無ければそう言い、最後の記録の月を添える', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { sales: [sale('2026-09-01', 10)], kpi: [], today: TODAY });
    expect(a.text).toBe('📊 今月 (2026年11月)の販売記録はありません。最後の記録は 2026年9月 です。');
  });

  it('★ 日付や金額が読めない行は数えず、その件数を名乗る', () => {
    const bad = [sale('2026-11-01', 1000), sale('2026-02-31', 9_999_999), { ...sale('2026-11-02', 0), amount: '500' } as unknown as SalesEntry];
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { sales: bad, kpi: [], today: TODAY });
    expect(a.text).toContain('¥1,000');
    expect(a.text).toContain('読めない 2 件は数えていません');
    const allBad = answerDataQuestion({ topic: 'sales', span: 'all' }, { sales: [sale('bad', 1)], kpi: [], today: TODAY });
    expect(allBad.text).toContain('1 件ありますが、日付か金額が読めない');
  });

  it('今日が暦に無い日付なら、最後の月で答える (でっち上げた今月を名乗らない)', () => {
    const a = answerDataQuestion({ topic: 'sales', span: 'this-month' }, { sales: rows, kpi: [], today: 'bad' });
    expect(a.text).toContain('記録の在る最後の月 (2026年11月)');
    const all = answerDataQuestion({ topic: 'sales', span: 'all' }, { sales: rows, kpi: [], today: 'bad' });
    expect(all.text).toContain('これまでの合計');
  });
});

describe('answerDataQuestion — 利益', () => {
  it('★ 営業利益と黒字・赤字を言う', () => {
    const rows = [kpi('2026-10', 1_000_000, 400_000, 200_000), kpi('2026-11', 500_000, 300_000, 400_000)];
    const last = answerDataQuestion({ topic: 'profit', span: 'last-month' }, { sales: [], kpi: rows, today: TODAY });
    expect(last.text).toBe('📈 先月 (2026年10月)の営業利益は ¥400,000 で、黒字です（売上 ¥1,000,000）。');
    const now = answerDataQuestion({ topic: 'profit', span: 'this-month' }, { sales: [], kpi: rows, today: TODAY });
    expect(now.text).toContain('¥-200,000 で、赤字です');
    expect(now.screen).toBe('kpi');
  });

  it('読めない・無い・期間外', () => {
    expect(answerDataQuestion({ topic: 'profit', span: 'latest' }, { sales: [], kpi: null, today: TODAY }).text).toContain('読めませんでした');
    expect(answerDataQuestion({ topic: 'profit', span: 'latest' }, { sales: [], kpi: [], today: TODAY }).text).toContain('「経営指標・損益分岐点」の画面');
    expect(answerDataQuestion({ topic: 'profit', span: 'this-month' }, { sales: [], kpi: [kpi('2026-01', 1, 0, 0)], today: TODAY }).text).toBe(
      '📈 今月 (2026年11月)の実績の記録はありません。最後の記録は 2026年1月 です。',
    );
    expect(answerDataQuestion({ topic: 'profit', span: 'all' }, { sales: [], kpi: [kpi('bad', 1, 0, 0)], today: TODAY }).text).toContain('期か金額が読めない');
  });
});

it('monthLabel', () => {
  expect(monthLabel('2026-03')).toBe('2026年3月');
});
