/**
 * **1 度も決済していない戦略の勝率を「0%」と言わない。** (2026-09-08 · パス 92)
 *
 * `winRate = completed > 0 ? wins / completed : 0` —— `completed` は**決済まで
 * 至った往復**の数である。0 件のときに 0 を返すと、画面と書き出しは
 * 「**決済した取引が在り、どれも勝てなかった**」と読める最悪値を刷る。
 *
 * 実測 (既定の初期資金 100 万円・戦略比較): 3 戦略のうち **2 つが 1 度も取引せず**、
 * それでも表には
 *
 *     sma-crossover        勝率 0%   0 取引
 *     rsi-mean-reversion   勝率 0%   0 取引
 *     macd-signal          勝率 67%  6 取引
 *
 * と並んでいた。**「0 取引」と「勝率 0%」は同時に成り立たない。**
 * さらに悪い形が買い持ち (`tradeCount = 1`・建てたまま) で、そこには
 * 「0 取引」という手掛かりすら無いまま「勝率 0%」だけが出る。
 *
 * **同じ行の「リターン 0.00%」「最大DD 0.00%」は正しい** —— 現金のまま持てば
 * 本当に 0% で、値下がりもしない。捏造しているのは勝率だけである。
 *
 * 面は 8 つ在った: **2 実装** (デスクトップ `main/clients/stocks.ts` と
 * ブラウザ版 `renderer/data/stocksAnalysisWeb.ts`) × (値 + HTML + Markdown)
 * ＋ 画面 ＋ `StocksPage` の**手写しの型**。写しは `invoke<T>()` が検査しないので、
 * 残していたら `winRate: number` のままで `(null * 100).toFixed(0)` が
 * **"0"** を刷り、直したはずの欠陥がそのまま残っていた (パス 62 / 80 と同じ形)。
 *
 * **見本が欠陥を仕様として固定していた (両方の実装で)。** デスクトップ側は
 * `// Constant prices → no crossovers → no trades;` と書いた 3 行下で
 * `expect(res.winRate).toBe(0)` を留め、実装側にも
 * `// the \`0\` fallback fires when no trades pair up; tested separately by
 * the no-trade case.` と**その見本を指す注釈**が付いていた。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import {
  backtest as backtestMain,
  renderDashboardHtml as htmlMain,
  renderDashboardMarkdown as mdMain,
  SMA_CROSSOVER_STRATEGY as smaMain,
  type StocksSnapshot,
  type StrategyComparisonResult as CmpMain,
} from '../stocks';
import {
  backtest as backtestWeb,
  compareStrategies as compareWeb,
  renderDashboardHtml as htmlWeb,
  renderDashboardMarkdown as mdWeb,
  SMA_CROSSOVER_STRATEGY as smaWeb,
} from '../../../renderer/data/stocksAnalysisWeb';
import { ratioPctOrDash } from '../../../shared/num';

const DASH = '—';

/** 値動きの無い足。クロスが起きないので売買が 1 度も成立しない。 */
function flatCandles(n = 200, price = 100): { date: string; open: number; high: number; low: number; close: number; volume: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1000,
  }));
}

function emptySnapshot(): StocksSnapshot {
  return {
    watchlist: [],
    portfolio: { cash: 1_000_000, initialCash: 1_000_000, positions: {}, history: [] },
    fetchedAt: '2026-09-08T00:00:00.000Z',
    isMock: true,
  };
}

/** 決済ゼロの行と、本当に負けた行を 1 つずつ持つ比較結果。 */
function cmp(winRate: number | null): CmpMain {
  return {
    symbol: 'AAPL',
    initialCash: 1_000_000,
    rows: [
      { strategy: 'sma-crossover', finalEquity: 1_000_000, totalReturnPct: 0, maxDrawdownPct: 0, winRate, tradeCount: 0 },
    ],
    bestByReturn: null,
  } as CmpMain;
}

describe('ratioPctOrDash — 算定不能と「測って 0」を分ける', () => {
  it('★ null / undefined は「—」', () => {
    expect(ratioPctOrDash(null)).toBe(DASH);
    expect(ratioPctOrDash(undefined)).toBe(DASH);
  });

  it('★ 対照: 0 は「0%」のまま (測って 0 だった場合を潰していない)', () => {
    expect(ratioPctOrDash(0)).toBe('0%');
    expect(ratioPctOrDash(0.5)).toBe('50%');
    expect(ratioPctOrDash(1)).toBe('100%');
    expect(ratioPctOrDash(1 / 3, 1)).toBe('33.3%');
  });

  it('★ 直す前の書き方は null を「0%」に潰す —— これが欠陥の機構', () => {
    const winRate = null as number | null;
    // 標本。`null * 100` は 0 なので、型が `number` のままだと "0%" が出る。
    expect(`${((winRate as unknown as number) * 100).toFixed(0)}%`).toBe('0%');
    expect(ratioPctOrDash(winRate)).toBe(DASH);
  });
});

describe('値: 決済ゼロなら勝率は null (両方の実装)', () => {
  it('★ デスクトップ — 値動き無しで 1 度も取引せず、勝率は null', () => {
    const r = backtestMain(flatCandles(), smaMain, 10_000);
    expect(r.tradeCount).toBe(0);
    expect(r.winRate).toBeNull();
    // 同じ行の 0 は正しい (現金のまま持てば本当に 0%)。潰していないことを留める。
    expect(r.totalReturnPct).toBe(0);
    expect(r.maxDrawdownPct).toBe(0);
  });

  it('★ ブラウザ版 — 同じ入力で同じ答え (双子がずれていない)', () => {
    const r = backtestWeb(flatCandles(), smaWeb, 10_000);
    expect(r.tradeCount).toBe(0);
    expect(r.winRate).toBeNull();
    expect(backtestMain(flatCandles(), smaMain, 10_000).winRate).toBe(r.winRate);
  });

  it('★ 実測の再現: 既定の初期資金でも「0 取引」の戦略が出て、その勝率は null', () => {
    const res = compareWeb('7203.T', 1_000_000, 1_757_000_000_000);
    const noTrade = res.rows.filter((r) => r.tradeCount === 0);
    // **標本が空でないこと** —— 0 件なら以下は何も検査していない。
    expect(noTrade.length).toBeGreaterThan(0);
    for (const r of noTrade) {
      expect(r.winRate, `${r.strategy} は 0 取引なのに勝率が数で出ている`).toBeNull();
    }
    // 対照: 取引した戦略は数で出る (全部 null に倒していない)。
    const traded = res.rows.filter((r) => r.tradeCount > 0);
    expect(traded.length).toBeGreaterThan(0);
    for (const r of traded) expect(typeof r.winRate).toBe('number');
  });
});

describe('書き出し: 相手に渡る面でも「—」(両方の実装 × HTML / Markdown)', () => {
  it('★ デスクトップ HTML — 勝率の欄が「—」で、「0%」を刷らない', () => {
    const html = htmlMain({ snapshot: emptySnapshot(), strategyComparison: cmp(null), generatedAt: '2026-09-08T12:00:00.000Z' });
    expect(html).toContain(`>${DASH}</td>`);
    expect(html).not.toContain('>0%</td>');
  });

  it('★ 対照: 本当に負けた行 (winRate 0) は HTML でも「0%」と刷る', () => {
    const html = htmlMain({ snapshot: emptySnapshot(), strategyComparison: cmp(0), generatedAt: '2026-09-08T12:00:00.000Z' });
    expect(html).toContain('>0%</td>');
    expect(html).not.toContain(`>${DASH}</td>`);
  });

  it('★ デスクトップ Markdown — 勝率の欄が「—」で、「0%」を刷らない', () => {
    const md = mdMain({ snapshot: emptySnapshot(), strategyComparison: cmp(null), generatedAt: '2026-09-08T12:00:00.000Z' });
    const row = md.split('\n').find((l) => l.includes('sma-crossover'));
    expect(row).toBeDefined();
    expect(row).toContain(`| ${DASH} |`);
    expect(row).not.toContain('| 0% |');
  });

  it('★ 対照: 本当に負けた行は Markdown でも「0%」', () => {
    const md = mdMain({ snapshot: emptySnapshot(), strategyComparison: cmp(0), generatedAt: '2026-09-08T12:00:00.000Z' });
    const row = md.split('\n').find((l) => l.includes('sma-crossover'));
    expect(row).toContain('| 0% |');
    expect(row).not.toContain(`| ${DASH} |`);
  });

  it('★ ブラウザ版 HTML / Markdown も同じ答え方をする', () => {
    const input = {
      watchlist: [],
      strategyComparison: {
        symbol: 'AAPL',
        initialCash: 1_000_000,
        rows: [{ strategy: 'sma-crossover', finalEquity: 1_000_000, totalReturnPct: 0, maxDrawdownPct: 0, winRate: null, tradeCount: 0 }],
        bestByReturn: null,
      },
      generatedAt: '2026-09-08T12:00:00.000Z',
    };
    const html = htmlWeb(input as Parameters<typeof htmlWeb>[0]);
    expect(html).toContain(DASH);
    expect(html).not.toContain('>0%</td>');
    const md = mdWeb(input as Parameters<typeof mdWeb>[0]);
    const row = md.split('\n').find((l) => l.includes('sma-crossover'));
    expect(row).toContain(`| ${DASH} |`);
    expect(row).not.toContain('| 0% |');
  });
});
