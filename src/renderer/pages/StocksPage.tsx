import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import {
  MAX_ADVISOR_QUESTION_CHARS,
  MAX_ADVISOR_UNIVERSE_SYMBOLS,
  MAX_TICKER_CHARS,
  capAdvisorUniverse,
} from '../../shared/advisorQuestionLimits';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { ExportActions } from '../components/ExportActions';
import { AI_EGRESS_RECIPIENT_ANTHROPIC, remoteOnly } from '../../shared/aiEgressNotice';
import { exportWarning } from '../data/exportOutcome';
import { ratioPctOrDash } from '../../shared/num';
import type { ActionData } from '../../shared/actionData';

// 助言・戦略比較・登録の戻り値の形は台帳 (`shared/actionData.ts` → `shared/stocksTypes.ts`) を読む
// (パス 117)。それまでここに `AdvisorResponse` の写しが在り、パス 105 まで `notForRealMoney` が
// `boolean` に広がっていた —— 写しは必ず広い方へずれ、`tsc` は黙る (パス 62 / 80)。

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
    SNAPSHOT.stocks,
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
  const [advisorResult, setAdvisorResult] = useState<ActionData<'stocks/advise'> | null>(null);

  // --- Watchlist register / unregister state ----------------------------
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
      // 型は `action` の合併型から鍵を組む —— 登録は `added`、解除は `removed` を返し、同じ型では
      // ない (パス 117 まで `RegisterResult` を両方に付けていた)。合併型に台帳に無い鍵が入れば tsc が落ちる。
      const r = await window.serviceHub.invoke<ActionData<`stocks/${typeof action}`>>(
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
  // **型を手で写さない。** `invoke<T>()` は T を検査しないので、写しがずれても
  // tsc は黙る (パス 62 / 80)。台帳の型をそのまま読む (パス 92 はブラウザ版の双子の型、
  // パス 117 から台帳) —— 写しを残していたら `winRate: number` のままで、
  // `(null * 100).toFixed(0)` が **"0"** を刷り、直したはずの欠陥がそのまま残っていた (2026-09-08 · パス 92)。
  const [compareSymbol, setCompareSymbol] = useState('AAPL');
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<ActionData<'stocks/compare-strategies'> | null>(null);

  async function runCompare() {
    if (!compareSymbol.trim()) {
      setCompareError('銘柄コードを入力してください');
      return;
    }
    setCompareBusy(true);
    setCompareError(null);
    try {
      const r = await window.serviceHub.invoke<ActionData<'stocks/compare-strategies'>>(
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
  /** 収まらなかった先 (ライブラリ / PC の指定フォルダ / ダウンロード) の説明。 */
  const [exportWarn, setExportWarn] = useState<string>();

  async function exportDashboard() {
    setExportBusy(true);
    setExportError(null);
    setExportWarn(undefined);
    try {
      // Forward the latest advisor result + strategy comparison so the
      // dashboard captures them.
      const payload: Record<string, unknown> = {};
      if (advisorResult) payload['advisorResult'] = advisorResult;
      if (compareResult) payload['strategyComparison'] = compareResult;
      const r = await window.serviceHub.invoke<ActionData<'stocks/export-dashboard'>>(
        'stocks',
        'export-dashboard',
        payload,
      );
      if (r.ok) {
        setExportPath(r.data.path);
        setExportBytes(r.data.bytes);
        setExportWarn(exportWarning(r.data));
      } else {
        setExportError(r.message);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  }

  /*
   * **「開く」は `openExternal` ではなく `openPath` を通る。** (2026-09-12 · パス 151)
   *
   * 2026-09-12 まで、ここは書き出し先の OS パスから `file:///…` を組んで
   * `window.serviceHub.openExternal(url)` へ渡していた。**その道は閉じている** ——
   * `shared/externalUrlGate.ts` の `EXTERNAL_URL_SCHEMES` は `http:` / `https:` だけで、
   * 同じファイルの散文が「`file:` はローカル読み出し」を拒む理由として挙げている。
   * ブラウザ版も同じ関門を通り、`webShimBridge.test.ts` は `file:///etc/passwd` を
   * 落とすことを検査している。
   *
   * 実測 (2026-09-12): 組み上がる 3 通り
   *   `file:///home/user/stocks-dashboard.html` / `file:///C:/Users/x/stocks-dashboard.html` /
   *   `file:///tmp/out/My Reports/stocks.html`
   * のすべてで `externalUrlOrNull()` が **null**。main の handler は `null` なら
   * `return;` するので、**押しても何も起きないボタン**だった (両ビルド)。
   *
   * 関門が正しく、呼ぶ側が間違っていた。ローカルのファイルを開く口は
   * `openPath` (→ `shell.openPath` · `shellOpenGate` が書き出し先の封じ込めと
   * 拡張子 `.html` を見る) で、リポジトリの他の書き出し画面
   * (テンプレート / チームレーダー / 経営ダッシュボード) は最初から
   * `components/ExportActions.tsx` を通していた。**この画面だけが取り残されていた。**
   * `ExportActions` は戻り値の `OsOpResult` も画面に出す (2026-08 の
   * 「`shell.openPath` の失敗を捨てていた」の直しがそこに入っている)。
   */

  async function runAdvisor() {
    if (!advisorQuestion.trim()) {
      setAdvisorError('質問を入力してください');
      return;
    }
    setAdvisorBusy(true);
    setAdvisorError(null);
    try {
      // **画面に出ているウォッチリストをそのまま送る** (パス 105)。
      // 2026-09-09 まで `question` だけを送っており、デスクトップ版では main の
      // `askAdvisor` が `payload.universe` を受け取れずに既定の 5 銘柄で答えて
      // いた —— 画面の断り書きが「登録済みウォッチリストのティッカーが送られる」と
      // 書いているのに、1 銘柄も送っていなかった。上限は shared に 1 つ在り、
      // **収める前に件数を控えて画面で述べる** (黙って切らない)。
      const capped = capAdvisorUniverse(data.watchlist.map((w) => w.symbol));
      const r = await window.serviceHub.invoke<ActionData<'stocks/advise'>>('stocks', 'advise', {
        question: advisorQuestion.trim(),
        universe: capped.symbols,
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
            maxLength={MAX_TICKER_CHARS}
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
          {/*
            **何が外へ出るかを書く。** 質問だけでなく、**登録済みウォッチリストの
            ティッカー**が system / user 両方のプロンプトに載って Anthropic へ送られる
            (`callStocksAdvisor` が `loadWatchlistSymbols()` をユニバースにする)。
            指標そのものはモックだが、**どの銘柄を見ているかは利用者が入れた情報**で、
            別の目的で登録したものがここで外部へ出る。
            このアプリは他の画面 (クラウド同期・保存状態) では「何が送られないか」まで
            書いているのに、AI の画面だけ書いていなかった (2026-08-23)。

            **その「AI の画面」は単数ではなかった** (2026-09-09 · パス 106) ——
            Anthropic へ送るのは 5 画面 (ここ / BusinessPage の経営アドバイザー /
            EmotionsPage のテキスト感情分析 / GmailPage の受信要約 /
            SlackPage のチャンネル要約 —— 後の 2 つは `emotions` の action を借りる)
            で、断りが在ったのはここだけだった。
            文面は `shared/aiEgressNotice.ts` へ移し、5 画面が同じ物を読む。
          */}
        </div>
        {/* 文面は `shared/aiEgressNotice.ts` が 1 か所で持つ (パス 106)。
            ここが唯一の断りだった時代の自前の文は捨てた —— 5 画面で同じ物を
            書くと、片方だけ動かしたときに誰も気付かない。**何を送るか**だけを
            この画面の言葉で埋める。指標がモック値であることと上限の話は、
            この画面固有なので下に足す。 */}
        <AiEgressNotice
          subject={{
            what: `質問文と、登録済みウォッチリストのティッカー${
              data.watchlist.length > MAX_ADVISOR_UNIVERSE_SYMBOLS
                ? ` ${MAX_ADVISOR_UNIVERSE_SYMBOLS} 件 (登録 ${data.watchlist.length} 件のうち)`
                : ` ${data.watchlist.length} 件`
            } (指標はモック値) `,
            recipients: remoteOnly(AI_EGRESS_RECIPIENT_ANTHROPIC),
          }}
        />
        {data.watchlist.length > MAX_ADVISOR_UNIVERSE_SYMBOLS && (
          <div
            data-advisor-universe-capped
            style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 12, color: '#fbbf24' }}
          >
            ⚠ 1 度に見られるのは {MAX_ADVISOR_UNIVERSE_SYMBOLS} 件までです。
            残り {data.watchlist.length - MAX_ADVISOR_UNIVERSE_SYMBOLS} 件は
            <strong>今回の助言の対象外</strong>です。
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={advisorQuestion}
            onChange={(e) => setAdvisorQuestion(e.target.value)}
            placeholder="例: 長期保有に向いている銘柄を 3 つ"
            maxLength={MAX_ADVISOR_QUESTION_CHARS}
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
            {/* **答えが何を見たかを、答えのとなりに置く。** 助言は「どの銘柄を
                対象にしたか」で意味が変わるので、対象の集合は答えと同じ強さで
                見えていなければならない (パス 105)。件数は返り値から出す —— 画面が
                送った物を写すと、送った物と見た物が食い違ったときに気付けない。 */}
            <div
              data-advisor-universe
              style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6, lineHeight: 1.6 }}
            >
              対象にした銘柄 ({advisorResult.universeConsidered.length} 件):{' '}
              {advisorResult.universeConsidered.join(' / ')}
              {advisorResult.universeOmitted > 0 && (
                <>
                  <br />
                  <span style={{ color: '#fbbf24' }}>
                    ⚠ 上限のため {advisorResult.universeOmitted} 件は対象外です。
                  </span>
                </>
              )}
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
            maxLength={MAX_TICKER_CHARS}
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
                      勝率 {ratioPctOrDash(r.winRate)}
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
          /*
           * 開く / フォルダを開く / 場所をコピー と「収まらなかった先」の断りを
           * 1 つの部品に寄せる。手書きだった頃はここが生の絶対パスを刷っており
           * (`<code>{exportPath}</code>`)、`ExportActions` が意図して避けている形
           * (「never show the raw path; only the filename」) と食い違っていた。
           */
          <ExportActions
            path={exportPath}
            bytes={exportBytes ?? undefined}
            warning={exportWarn}
          />
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
