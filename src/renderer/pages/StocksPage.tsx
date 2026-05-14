import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

interface AdvisorRecommendation {
  symbol: string;
  rank: number;
  rationale: string;
  riskFactors: string[];
}
interface AdvisorResponse {
  recommendations: AdvisorRecommendation[];
  disclaimer: string;
  notForRealMoney: boolean;
}

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

  // --- AI advisor state -------------------------------------------------
  const [advisorQuestion, setAdvisorQuestion] = useState('');
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [advisorResult, setAdvisorResult] = useState<AdvisorResponse | null>(null);

  // --- Watchlist register / unregister state ----------------------------
  interface RegisterResult {
    symbol: string;
    watchlist: readonly string[];
    message: string;
  }
  const [registerSymbol, setRegisterSymbol] = useState('');
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);

  async function registerOrUnregister(action: 'register-ticker' | 'unregister-ticker') {
    if (!registerSymbol.trim()) {
      setRegisterError('銘柄コードを入力してください');
      return;
    }
    setRegisterBusy(true);
    setRegisterError(null);
    setRegisterMessage(null);
    try {
      const r = await window.serviceHub.invoke<RegisterResult>(
        'stocks',
        action,
        { symbol: registerSymbol.trim() },
      );
      if (r.ok) {
        setRegisterMessage(r.data.message);
        // Refresh snapshot so the watchlist reflects the new state.
        refresh();
      } else {
        setRegisterError(r.message);
      }
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegisterBusy(false);
    }
  }

  // --- Strategy comparison state ----------------------------------------
  interface StrategyComparisonRow {
    strategy: string;
    finalEquity: number;
    totalReturnPct: number;
    maxDrawdownPct: number;
    winRate: number;
    tradeCount: number;
  }
  interface StrategyComparisonResult {
    symbol: string;
    initialCash: number;
    rows: StrategyComparisonRow[];
    bestByReturn: string | null;
  }
  const [compareSymbol, setCompareSymbol] = useState('AAPL');
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<StrategyComparisonResult | null>(null);

  async function runCompare() {
    if (!compareSymbol.trim()) {
      setCompareError('銘柄コードを入力してください');
      return;
    }
    setCompareBusy(true);
    setCompareError(null);
    try {
      const r = await window.serviceHub.invoke<StrategyComparisonResult>(
        'stocks',
        'compare-strategies',
        { symbol: compareSymbol.trim(), initialCash: portfolio.initialCash },
      );
      if (r.ok) {
        setCompareResult(r.data);
      } else {
        setCompareError(r.message);
      }
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompareBusy(false);
    }
  }

  // --- Dashboard export state -------------------------------------------
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportBytes, setExportBytes] = useState<number | null>(null);

  async function exportDashboard() {
    setExportBusy(true);
    setExportError(null);
    try {
      // Forward the latest advisor result + strategy comparison so the
      // dashboard captures them.
      const payload: Record<string, unknown> = {};
      if (advisorResult) payload['advisorResult'] = advisorResult;
      if (compareResult) payload['strategyComparison'] = compareResult;
      const r = await window.serviceHub.invoke<{ path: string; bytes: number }>(
        'stocks',
        'export-dashboard',
        payload,
      );
      if (r.ok) {
        setExportPath(r.data.path);
        setExportBytes(r.data.bytes);
      } else {
        setExportError(r.message);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  }

  function openExportedDashboard() {
    if (exportPath) {
      // Convert OS path to file:// URL — serviceHub.openExternal routes
      // it through the main process which the OS browser will render.
      const url =
        'file:///' + exportPath.replace(/\\/g, '/').replace(/^\//, '');
      window.serviceHub.openExternal(url);
    }
  }

  async function runAdvisor() {
    if (!advisorQuestion.trim()) {
      setAdvisorError('質問を入力してください');
      return;
    }
    setAdvisorBusy(true);
    setAdvisorError(null);
    try {
      const r = await window.serviceHub.invoke<AdvisorResponse>('stocks', 'advise', {
        question: advisorQuestion.trim(),
      });
      if (r.ok) {
        setAdvisorResult(r.data);
      } else {
        setAdvisorError(r.message);
      }
    } catch (e) {
      setAdvisorError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvisorBusy(false);
    }
  }

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

      <Section title="銘柄登録 / 解除" count={data.watchlist.length}>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 12 }}>
          銘柄を登録すると <code>~/.local/business-hub/state.json</code> に永続化されます。
          初期状態 (登録なし) では mock 5 銘柄が表示されます。
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={registerSymbol}
            onChange={(e) => setRegisterSymbol(e.target.value)}
            placeholder="銘柄コード (例: AAPL / 7203.T / ^N225)"
            maxLength={16}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !registerBusy) registerOrUnregister('register-ticker');
            }}
          />
          <button
            onClick={() => registerOrUnregister('register-ticker')}
            disabled={registerBusy}
            style={{
              padding: '8px 16px',
              background: registerBusy ? 'var(--bg-elev)' : 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
              cursor: registerBusy ? 'wait' : 'pointer',
            }}
          >
            {registerBusy ? '…' : '登録'}
          </button>
          <button
            onClick={() => registerOrUnregister('unregister-ticker')}
            disabled={registerBusy}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
              cursor: registerBusy ? 'wait' : 'pointer',
            }}
          >
            解除
          </button>
        </div>
        {registerError && (
          <div
            style={{
              border: '1px solid #ef4444',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {registerError}
          </div>
        )}
        {registerMessage && (
          <div
            style={{
              border: '1px solid #22c55e',
              background: 'rgba(34, 197, 94, 0.08)',
              color: '#22c55e',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {registerMessage}
          </div>
        )}
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

      <Section title="AI アドバイザー" count={advisorResult?.recommendations.length ?? 0}>
        <div
          style={{
            border: '1px solid #fbbf24',
            background: 'rgba(251, 191, 36, 0.08)',
            color: '#fbbf24',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          <strong>免責:</strong> 本機能は教育目的の参考情報であり投資助言ではありません。
          AI 出力は実在しないティッカーや誤った理由付けを含む可能性があります。
          実際の売買判断はご自身の責任で行ってください。
          回答は登録されている許可済みティッカーに限定されます。
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={advisorQuestion}
            onChange={(e) => setAdvisorQuestion(e.target.value)}
            placeholder="例: 長期保有に向いている銘柄を 3 つ"
            maxLength={1000}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !advisorBusy) runAdvisor();
            }}
          />
          <button
            onClick={runAdvisor}
            disabled={advisorBusy}
            style={{
              padding: '8px 16px',
              background: advisorBusy ? 'var(--bg-elev)' : 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
              cursor: advisorBusy ? 'wait' : 'pointer',
            }}
          >
            {advisorBusy ? '分析中…' : 'AI に聞く'}
          </button>
        </div>
        {advisorError && (
          <div
            style={{
              border: '1px solid #ef4444',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {advisorError}
          </div>
        )}
        {advisorResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {advisorResult.recommendations.map((r) => (
              <div
                key={`${r.symbol}-${r.rank}`}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elev)',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {r.rank}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{r.symbol}</div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>
                  {r.rationale}
                </div>
                {r.riskFactors.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-mute)' }}>
                    <strong>リスク要因:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {r.riskFactors.map((rf, idx) => (
                        <li key={idx}>{rf}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-mute)',
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              {advisorResult.disclaimer}
            </div>
          </div>
        )}
      </Section>

      <Section title="戦略比較" count={compareResult?.rows.length ?? 0}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={compareSymbol}
            onChange={(e) => setCompareSymbol(e.target.value)}
            placeholder="銘柄コード (例: AAPL / 7203.T)"
            maxLength={16}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !compareBusy) runCompare();
            }}
          />
          <button
            onClick={runCompare}
            disabled={compareBusy}
            style={{
              padding: '8px 16px',
              background: compareBusy ? 'var(--bg-elev)' : 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
              cursor: compareBusy ? 'wait' : 'pointer',
            }}
          >
            {compareBusy ? '計算中…' : '3 戦略を比較'}
          </button>
        </div>
        {compareError && (
          <div
            style={{
              border: '1px solid #ef4444',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {compareError}
          </div>
        )}
        {compareResult && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
              {compareResult.symbol} (初期 {yen.format(compareResult.initialCash)})
              {compareResult.bestByReturn && (
                <>
                  {' '}
                  · 最良:{' '}
                  <strong style={{ color: '#22c55e' }}>{compareResult.bestByReturn}</strong>
                </>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {compareResult.rows.map((r) => {
                const isBest = r.strategy === compareResult.bestByReturn;
                return (
                  <div
                    key={r.strategy}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 1fr 100px 90px 80px 80px',
                      gap: 8,
                      padding: '8px 12px',
                      background: isBest ? 'rgba(34,197,94,0.08)' : 'var(--bg-elev)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {r.strategy}
                      {isBest && (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: '#22c55e',
                            color: '#fff',
                            fontSize: 10,
                          }}
                        >
                          最良
                        </span>
                      )}
                    </span>
                    <span style={{ color: 'var(--text-mute)' }}>
                      最終資産 {yen.format(r.finalEquity)}
                    </span>
                    <span
                      style={{ color: r.totalReturnPct >= 0 ? '#22c55e' : '#ef4444' }}
                    >
                      {r.totalReturnPct >= 0 ? '+' : ''}
                      {r.totalReturnPct.toFixed(2)}%
                    </span>
                    <span style={{ color: 'var(--text-mute)' }}>
                      最大DD {r.maxDrawdownPct.toFixed(1)}%
                    </span>
                    <span style={{ color: 'var(--text-mute)' }}>
                      勝率 {(r.winRate * 100).toFixed(0)}%
                    </span>
                    <span style={{ color: 'var(--text-mute)' }}>
                      {r.tradeCount} 取引
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      <Section title="ダッシュボード書き出し" count={exportPath ? 1 : 0}>
        <div style={{ fontSize: 13, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.5 }}>
          現在のスナップショット (ウォッチリスト / ペーパー口座 / 取引履歴
          {advisorResult ? ' / AI アドバイザー結果' : ''}) を 1 つの自己完結
          HTML ファイルとして書き出します。出力先は{' '}
          <code style={{ background: 'var(--bg-elev)', padding: '1px 6px', borderRadius: 3 }}>
            ~/.local/business-hub/data/dashboard.html
          </code>
          。ファイルにはインライン CSS のみで外部スクリプトなし、CSP 制約下でも OS
          ブラウザで開けます。
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={exportDashboard}
            disabled={exportBusy}
            style={{
              padding: '8px 16px',
              background: exportBusy ? 'var(--bg-elev)' : 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
              cursor: exportBusy ? 'wait' : 'pointer',
            }}
          >
            {exportBusy ? '書き出し中…' : 'ダッシュボードを書き出す'}
          </button>
          {exportPath && (
            <button
              onClick={openExportedDashboard}
              style={{
                padding: '8px 16px',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              外部ブラウザで開く
            </button>
          )}
        </div>
        {exportError && (
          <div
            style={{
              border: '1px solid #ef4444',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {exportError}
          </div>
        )}
        {exportPath && (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
            書き出し済み: <code>{exportPath}</code>
            {exportBytes != null && ` (${(exportBytes / 1024).toFixed(1)} KB)`}
          </div>
        )}
      </Section>

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
