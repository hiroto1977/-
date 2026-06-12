import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useCollection } from '../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../data/sales';
import { orderToSalesEntry } from '../data/shopifyImport';
import { planOrderFanout, uniqueRequiredFields } from '../../shared/connectors/orderFanout';
import { SHOPIFY_CONNECTOR_META } from '../../shared/connectors/shopifyConnectorMeta';

const inputStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
} as const;

/** Record a Shopify order into the cross-channel 売上集計 (→ KPI). Bridges
 *  Shopify into the analytics pipeline so dashboards reflect real orders. */
function OrderToSalesForm() {
  const { add } = useCollection<SalesEntry>(SALES_COLLECTION);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();

  async function onRecord() {
    setMsg(undefined);
    setErr(undefined);
    const entry = orderToSalesEntry({ name, total }, date ? { date } : {});
    if (!entry) {
      setErr('金額を正しく入力してください (例: ¥12,000)');
      return;
    }
    try {
      await add(entry);
      setMsg(`売上集計に記録しました (${entry.amount.toLocaleString('ja-JP')} 円)。KPI にも反映されます。`);
      setName('');
      setTotal('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '記録に失敗しました');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={date} placeholder="YYYY-MM-DD (任意)" onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, width: 140 }} />
        <input value={name} placeholder="注文名 (#1001)" onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: 130 }} />
        <input value={total} placeholder="金額 (¥12,000)" onChange={(e) => setTotal(e.target.value)} style={{ ...inputStyle, width: 130 }} />
        <button type="button" onClick={onRecord}>売上集計に記録</button>
      </div>
      {msg && <div style={{ color: '#22c55e', fontSize: 12, marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{err}</div>}
    </div>
  );
}

/** Pre-flight check for order fan-out: tick the fields you have configured and
 *  see which connectors become runnable (and which fields the rest still
 *  need). Pure planning via planOrderFanout — no tokens are entered or sent. */
function FanoutPlanPanel() {
  const fields = useMemo(() => uniqueRequiredFields(SHOPIFY_CONNECTOR_META), []);
  const [have, setHave] = useState<ReadonlySet<string>>(new Set());

  const plan = useMemo(() => {
    const payload: Record<string, unknown> = {};
    for (const f of have) payload[f] = '✓';
    return planOrderFanout(SHOPIFY_CONNECTOR_META, payload);
  }, [have]);

  function toggle(field: string) {
    setHave((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted, #94a3b8)', marginBottom: 8 }}>
        設定済みのフィールドにチェックを入れると、注文を同報できる連携先 (runnable) と不足項目が分かります
        (計画のみ — トークンの入力・送信はしません)。
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {fields.map((f) => (
          <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={have.has(f)} onChange={() => toggle(f)} />
            {f}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        実行可能 {plan.runnableCount} / {plan.decisions.length} 件
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
        {plan.decisions.map((d) => (
          <li key={d.id} style={{ fontSize: 13 }}>
            {d.runnable ? (
              <span style={{ color: '#22c55e' }}>✅ {d.label} — 同報できます ({d.action})</span>
            ) : (
              <span style={{ color: 'var(--muted, #94a3b8)' }}>
                ⏸ {d.label} — 不足: {d.missingFields.join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShopifyPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'shopify',
    SNAPSHOT.shopify,
  );
  const { items, count } = data;

  return (
    <div>
      <StatusBar
        serviceId="shopify"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Shopify · {count} 件</>}
        tokenSetup={{ label: 'API トークン', placeholder: 'Bearer token' }}
      />

      <Section title="注文を売上集計に記録 (→ KPI に反映)">
        <OrderToSalesForm />
      </Section>

      <Section title="受注ファンアウト計画 (連携先の準備状況)" count={SHOPIFY_CONNECTOR_META.length}>
        <FanoutPlanPanel />
      </Section>

      <Section title="最近のアイテム" count={items.length}>
        <DataList
          items={items.map((it) => ({ key: it.id, title: it.name }))}
          empty="まだデータがありません (Phase 6 で実 API 接続予定)"
        />
      </Section>
    </div>
  );
}
