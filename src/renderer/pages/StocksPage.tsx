import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Signal {
  date: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reason: string;
  strategy: string;
}

interface WatchlistItem {
  symbol: string;
  label: string;
  latestClose: number;
  previousClose: number;
  changePct: number;
  signal: Signal;
  candles: Candle[];
}

interface Position {
  shares: number;
  avgCost: number;
}

interface Trade {
  date: string;
  ticker: string;
  action: 'buy' | 'sell';
  shares: number;
  price: number;
  cashAfter: number;
  reason: string;
}

interface Portfolio {
  cash: number;
  initialCash: number;
  positions: Record<string, Position>;
  history: Trade[];
}

interface StocksSnapshot {
  watchlist: WatchlistItem[];
  portfolio: Portfolio;
  fetchedAt: string;
  isMock: boolean;
}

const ACTION_COLORS: Record<Signal['action'], string> = {
  buy: '#22c55e',
  sell: '#ef4444',
  hold: '#94a3b8',
};

const ACTION_LABELS: Record<Signal['action'], string> = {
  buy: '買い',
  sell: '売り',
  hold: '見送り',
};

const fmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const pctLabel = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

// --- Sparkline ----------------------------------------------------------

function Sparkline({ candles, width = 160, height = 40 }: { candles: Candle[]; width?: number; height?: number }) {
  if (candles.length < 2) return null;
  const closes = candles.slice(-60).map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const points = closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * width;
      const y = height - ((c - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = closes[closes.length - 1]!;
  const first = closes[0]!;
  const color = last >= first ? '#22c55e' : '#ef4444';
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={points} />
    </svg>
  );
}

// --- Tile ---------------------------------------------------------------

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 16px',
        flex: 1,
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// --- Page ---------------------------------------------------------------

export function StocksPage() {
  const { data, source, status, errorMessage, refresh } = useServiceData<StocksSnapshot>(
    'stocks',
    SNAPSHOT.stocks as unknown as StocksSnapshot,
  );

  const portfolio = data.portfolio;
  const equity = useMemo(() => {
    let e = portfolio.cash;
    for (const [ticker, pos] of Object.entries(portfolio.positions)) {
      const w = data.watchlist.find((x) => x.symbol === ticker);
      if (w) e += pos.shares * w.latestClose;
    }
    return e;
  }, [portfolio, data.watchlist]);

  const pnl = equity - portfolio.initialCash;
  const pnlPct = portfolio.initialCash > 0 ? (pnl / portfolio.initialCash) * 100 : 0;

  const [filterAction, setFilterAction] = useState<'all' | Signal['action']>('all');
  const visibleWatchlist = data.watchlist.filter(
    (w) => filterAction === 'all' || w.signal.action === filterAction,
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <StatusBar
        who="Stocks · 模擬データ"
        serviceId="stocks"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured
        onRefresh={refresh}
      />

      {data.isMock && (
        <div
          style={{
            border: '1px solid #fbbf24',
            background: 'rgba(251, 191, 36, 0.08)',
            color: '#fbbf24',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>シミュレーション中 / 実弾発注は行いません.</strong> Phase 7 で証券会社 API
          (Interactive Brokers / Alpaca / 楽天 / SBI) 連携時に有効化。
          過去データでの分析・シグナル生成・ペーパートレードのみ稼働中で、表示される売買は仮想資金です。
          過去パフォーマンスは将来リターンを保証しません。
        </div>
      )}

      <Section title="ペーパー口座" count={Object.keys(portfolio.positions).length}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Tile label="現在資産 (cash + 保有時価)" value={yen.format(equity)} />
          <Tile label="現金残高" value={yen.format(portfolio.cash)} />
          <Tile
            label="損益"
            value={(pnl >= 0 ? '+' : '') + yen.format(pnl)}
            sub={pctLabel(pnlPct)}
            accent={pnl >= 0 ? '#22c55e' : '#ef4444'}
          />
          <Tile label="初期入金" value={yen.format(portfolio.initialCash)} />
          <Tile label="取引履歴" value={String(portfolio.history.length)} sub="paper trades" />
        </div>
      </Section>

      <Section title="ウォッチリスト" count={data.watchlist.length}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12 }}>
          {(['all', 'buy', 'sell', 'hold'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilterAction(opt)}
              style={{
                padding: '4px 12px',
                background: filterAction === opt ? 'var(--accent)' : 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {opt === 'all' ? '全て' : ACTION_LABELS[opt]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleWatchlist.map((w) => (
            <div
              key={w.symbol}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 16px',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 110 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{w.symbol}</div>
                <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{w.label}</div>
              </div>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt.format(w.latestClose)}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: w.changePct >= 0 ? '#22c55e' : '#ef4444',
                  }}
                >
                  {pctLabel(w.changePct)}
                </div>
              </div>
              <Sparkline candles={w.candles} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    background: ACTION_COLORS[w.signal.action],
                    color: '#fff',
                  }}
                >
                  {ACTION_LABELS[w.signal.action]}
                </div>
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-mute)' }}>
                  {w.signal.reason} · {w.signal.strategy}
                </span>
              </div>
            </div>
          ))}
          {visibleWatchlist.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-mute)' }}>
              該当する銘柄はありません
            </div>
          )}
        </div>
      </Section>

      {portfolio.history.length > 0 && (
        <Section title="取引履歴" count={portfolio.history.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {portfolio.history.slice(-20).reverse().map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 80px 60px 100px 100px 1fr',
                  gap: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ color: 'var(--text-mute)' }}>{t.date}</span>
                <span style={{ fontWeight: 600 }}>{t.ticker}</span>
                <span style={{ color: t.action === 'buy' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {ACTION_LABELS[t.action]}
                </span>
                <span>{t.shares} 株</span>
                <span>@ {fmt.format(t.price)}</span>
                <span style={{ color: 'var(--text-mute)' }}>{t.reason}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="搭載ストラテジー" count={3}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-mute)' }}>
          <div>
            <strong style={{ color: 'var(--text)' }}>sma-crossover</strong>: SMA(20) が
            SMA(50) を上抜けで買い (golden cross) / 下抜けで売り (death cross)。
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>rsi-mean-reversion</strong>: RSI(14)
            &lt; 30 で買い (oversold) / &gt; 70 で売り (overbought)。
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>macd-signal</strong>: MACD ライン
            (EMA12 - EMA26) がシグナル線 (EMA9) を上抜けで買い / 下抜けで売り。
          </div>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            リスク管理: ストップロス -5%, テイクプロフィット +15%,
            1 取引あたり残高の 10%。`backtest` アクションで戦略検証可能。
          </div>
        </div>
      </Section>
    </div>
  );
}
