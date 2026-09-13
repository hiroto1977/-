/**
 * **ペーパー口座が実際に何を返すのか** (2026-09-12 · パス 189)。
 *
 * `shared/paperAccount.ts` の注記が 3 つの実測を主張している。散文は古びるので、
 * ここで**同じ主張を機械に測らせる** —— 主張が外れたら鳴る。
 *
 *   1. 既定の取得は取引 0 件・玉 0 件で、2 度取っても蓄積しない。
 *   2. 買いが起きても時価は初期入金に戻る (約定値と評価値が同じ終値)。
 *   3. 同梱のモック源では**到達可能な全部の種**でシグナルが出ない。
 *
 * 3 は種の作り方 (`(symbol.charCodeAt(0) || 1) * 1000`) から母集団が
 * 「`isSafeSymbol` が通す先頭 1 文字」に閉じることを使う —— 手で並べた
 * 「代表的な銘柄」ではなく**総当たり**である。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RISK_PARAMS,
  MOCK_TICKERS,
  applySignal,
  createMockStocksDataSource,
  createPaperPortfolio,
  fetchStocksSnapshotImpl,
  portfolioEquity,
  renderDashboardHtml,
  renderDashboardMarkdown,
  watchlistPrices,
} from '../stocks';
import type { FetchContext } from '../types';
import { paperAccountView } from '../../../shared/paperAccount';
import { MAX_TICKER_CHARS } from '../../../shared/advisorQuestionLimits';

const CTX = {} as FetchContext;
const noState = { loadState: async () => ({ watchlist: [] as string[] }) };

/** `isSafeSymbol` が通す文字 —— 種は先頭 1 文字しか見ないので、これが母集団。 */
const SEED_ALPHABET = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  '.', '-', '^',
];

describe('主張 1 — 既定の取得は取引 0 件で、蓄積しない', () => {
  it('★ 内蔵 5 銘柄で玉 0・取引 0・現金は初期入金のまま', async () => {
    const snap = await fetchStocksSnapshotImpl(CTX, noState);
    expect(snap.watchlist.map((w) => w.symbol)).toEqual(MOCK_TICKERS.map((t) => t.symbol));
    expect(Object.keys(snap.portfolio.positions)).toEqual([]);
    expect(snap.portfolio.history).toEqual([]);
    expect(snap.portfolio.cash).toBe(snap.portfolio.initialCash);
  });

  it('★ 2 度取っても取引は増えない (口座は毎回組み直される)', async () => {
    const a = await fetchStocksSnapshotImpl(CTX, noState);
    const b = await fetchStocksSnapshotImpl(CTX, noState);
    expect(a.portfolio.history.length).toBe(0);
    expect(b.portfolio.history.length).toBe(0);
  });

  it('★ だから損益は「—」になる (金額ではない)', async () => {
    const snap = await fetchStocksSnapshotImpl(CTX, noState);
    const v = paperAccountView(snap.portfolio, watchlistPrices(snap.watchlist));
    expect(v.tradeCount).toBe(0);
    expect(v.pnl).toBeNull();
  });
});

describe('主張 2 — 買いが起きても時価は初期入金に戻る', () => {
  it('★ 約定値と評価値が同じ終値なら損益は 0 (構造上)', () => {
    const price = 1_234.56;
    const port = applySignal(
      createPaperPortfolio(1_000_000),
      'X',
      { date: '01', action: 'buy', confidence: 0.7, reason: 'r', strategy: 's' },
      price,
      DEFAULT_RISK_PARAMS,
    );
    expect(port.history.length).toBe(1);
    // 端数で余った現金もそのまま現金に残るので、時価はぴったり初期入金
    expect(portfolioEquity(port, { X: price })).toBeCloseTo(1_000_000, 6);
    const v = paperAccountView(port, { X: price });
    expect(v.pnl).toBeCloseTo(0, 6);
    // 値段が動けば初めて損益が出る —— つまり 0 は「動いていない」ことの表示
    expect(paperAccountView(port, { X: price * 1.1 }).pnl!).toBeGreaterThan(0);
  });
});

describe('主張 3 — 同梱のモック源では到達可能な全部の種でシグナルが出ない', () => {
  it('★ 先頭 1 文字の総当たり (母集団は種の作り方で閉じる) が全部 hold', async () => {
    const actions = new Set<string>();
    for (const c of SEED_ALPHABET) {
      const snap = await fetchStocksSnapshotImpl(CTX, {
        loadState: async () => ({ watchlist: [(c + 'ZZZ').toUpperCase()] }),
      });
      actions.add(snap.watchlist[0]!.signal.action);
    }
    expect([...actions]).toEqual(['hold']);
  });

  it('種は先頭 1 文字しか見ない (だから上の総当たりで足りる)', async () => {
    const src = createMockStocksDataSource();
    const a = await src.fetchHistory('QAAA', 3);
    const b = await src.fetchHistory('QBBB', 3);
    // 同じ先頭文字・同じ既定の basePrice → 同じ系列
    expect(a.map((c) => c.close)).toEqual(b.map((c) => c.close));
    // 記号の長さの上限も台帳から読む (総当たりの前提が動いたら気付く)
    expect(MAX_TICKER_CHARS).toBeGreaterThanOrEqual(4);
  });
});

describe('書き出す 2 面も「—」と注記を載せる', () => {
  it('★ HTML は取引 0 件のとき「—」と理由を刷り、+￥0 を刷らない', async () => {
    const snap = await fetchStocksSnapshotImpl(CTX, noState);
    const html = renderDashboardHtml({ snapshot: snap, generatedAt: '01' });
    expect(html).toContain('>—</div>');
    expect(html).toContain('取引 0 件 — 損益は算定できません');
    expect(html).toContain('取引が 1 件も発生していない');
    expect(html).not.toContain('+￥0');
    expect(html).not.toContain('paper trades');
    expect(html).toContain('まだ 1 件もありません');
  });

  it('★ Markdown も同じことを書く (渡す物に断りが乗る)', async () => {
    const snap = await fetchStocksSnapshotImpl(CTX, noState);
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    expect(md).toContain('| 損益 | — (取引 0 件 — 損益は算定できません) |');
    expect(md).toContain('※ ペーパー口座はこの取得時点で組み直した仮想の口座です');
    expect(md).not.toMatch(/\| 損益 \| \+￥0/);
  });
});
