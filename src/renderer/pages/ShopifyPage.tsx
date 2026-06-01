import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useCollection } from '../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../data/sales';
import { orderToSalesEntry } from '../data/shopifyImport';

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

      <Section title="最近のアイテム" count={items.length}>
        <DataList
          items={items.map((it) => ({ key: it.id, title: it.name }))}
          empty="まだデータがありません (Phase 6 で実 API 接続予定)"
        />
      </Section>
    </div>
  );
}
