import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { SALES_COLLECTION, duplicateOrderMessage, findShopifyOrder, type SalesEntry } from '../data/sales';
import { orderToSalesEntry } from '../data/shopifyImport';
import { readCollectionNow, unreadableForJudgementNote } from '../data/readCollectionNow';

const inputStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
} as const;

/** Record a Shopify order into the cross-channel 売上集計 (→ KPI). Bridges
 *  Shopify into the analytics pipeline so dashboards reflect real orders. */
function OrderToSalesForm() {
  // 購読は書き込み (`add`) のためだけに持つ —— 判定は `readCollectionNow` で読み直す (パス 384)。
  const { add } = useCollection<SalesEntry>(SALES_COLLECTION);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const submit = useSubmitGuard();

  async function onRecord() {
    setMsg(undefined);
    setErr(undefined);
    const entry = orderToSalesEntry({ name, total }, date ? { date } : {});
    if (!entry) {
      setErr('金額を正しく入力してください (例: ¥12,000)');
      return;
    }
    // 同じ注文名は 1 件 —— 2 度記録すると売上高と受注件数に 2 度数えられる (パス 126)。
    // **判定の相手は保管層から読み直す** (パス 384) —— 画面の `records` は購読の写しで、
    // 一覧が届く前は空なので「既に在るか」に必ず「無い」と答える。
    const existing = await readCollectionNow<SalesEntry>(SALES_COLLECTION);
    if (existing === null) {
      setErr(unreadableForJudgementNote('売上の一覧'));
      return;
    }
    const dup = findShopifyOrder(existing, name);
    if (dup !== null) {
      setErr(duplicateOrderMessage(dup));
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
        <button type="button" onClick={() => void submit.run(onRecord)} disabled={submit.busy}>売上集計に記録</button>
      </div>
      {msg && <div style={{ color: 'var(--success)', fontSize: 12, marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{err}</div>}
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
        /*
         * **資格情報の入力欄は置かない** (2026-09-24 · パス 452)。
         * 2026-09-24 まで「API トークン」を預かっていたが、**それを読む出荷コードは
         * 0 件**だった —— 7 つのコネクタは `ctx.payload` から**連携先** (Slack / LINE /
         * Gmail / Notion / Salesforce / Stripe / Discord) の資格情報を取り出し、
         * fetcher は静的 stub である。`SERVICE_CREDENTIAL_USE.shopify` が `'none'` を
         * 宣言し、`lint:credential-use` が「読まないのに欄を出す」形を落とす。
         * 既に保存した分は設定画面の掃除 (`unusedStoredCredentials`) から消せる。
         */
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
