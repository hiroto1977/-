import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import { dateText } from '../../shared/isoDate';
import {
  STRIPE_CURRENCY_UNKNOWN,
  stripeAmountText,
  stripeIntakeNote,
  stripeModeLabel,
  stripeStatusLabel,
} from '../../shared/api/stripe';

/**
 * Stripe (カード決済) —— 残高と最近の入金を**読むだけ**の画面 (2026-11-18)。
 *
 * 鍵を登録すると実データに切り替わる。登録するまでは同梱の見本を出す (バッジがそう名乗る)。
 * 返金・請求の作成などの書き込みは、この画面にもアプリのどこにも無い。
 *
 * - 金額は通貨の最小単位で来るので、`stripeAmountText` が通貨から桁を決める。
 * - 読めなかった金額・日付は 0 や空欄にせず「金額不明」「日付が読めません」と述べる。
 * - 一覧そのものが読めなかったときは、「0 件」と混ぜずに ⚠ で述べる。
 * - ブラウザ版はプロキシを通して読む。押す前にそう述べる (デスクトップ版は直接つなぐので述べない。
 *   実行形態がまだ分からない間も述べない —— `useBuildKind` と同じ天秤)。
 */
export function StripePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'stripe',
    SNAPSHOT.stripe,
  );
  const { balances, charges, livemode } = data;
  const note = stripeIntakeNote(data);
  const kind = useBuildKind();

  return (
    <div data-stripe-page>
      <StatusBar
        serviceId="stripe"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            Stripe · {stripeModeLabel(livemode)} · 入金 {charges.length} 件
          </>
        }
        tokenSetup={{ label: '制限付きキー (読み取り専用)', placeholder: 'rk_live_…' }}
      />

      <p data-stripe-key-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        登録する鍵は、Stripe のダッシュボードで作る「制限付きキー」にしてください (残高と支払いの「読み取り」だけを許可)。
        このアプリが Stripe へ送るのは残高と最近の入金の照会だけで、返金や請求の作成はしません。
      </p>

      {kind === 'browser' && (
        <p data-stripe-proxy-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          ブラウザ版で実データを読むには、プロキシ (Cloudflare Worker) の登録が要ります —— 設定ページの「BYO プロキシ」で登録してください。
          プロキシの許可リスト (UPSTREAM_ALLOWLIST) に api.stripe.com を足す必要があります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-stripe-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      <Section title="残高" count={balances.length}>
        <DataList
          items={balances.map((b) => ({
            key: b.currency === '' ? 'unknown' : b.currency,
            title: b.currency === '' ? STRIPE_CURRENCY_UNKNOWN : b.currency.toUpperCase(),
            meta: `利用可能 ${stripeAmountText(b.available, b.currency)} · 入金待ち ${stripeAmountText(b.pending, b.currency)}`,
          }))}
          empty="残高の行がありません。"
        />
      </Section>

      <Section title="最近の入金" count={charges.length}>
        <DataList
          items={charges.map((c, i) => ({
            key: c.id === '' ? `row-${i}` : c.id,
            title: stripeAmountText(c.amount, c.currency),
            meta: `${dateText(c.created)}${c.description === '' ? '' : ` · ${c.description}`}`,
            badge: stripeStatusLabel(c.status, c.refunded),
          }))}
          empty="入金はまだありません。"
        />
      </Section>
    </div>
  );
}
