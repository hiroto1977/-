import { useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { useCollection } from '../data/useCollection';
import {
  SALES_COLLECTION,
  SALES_CHANNELS,
  CHANNEL_LABEL,
  parseSalesEntry,
  summarizeSales,
  monthlyTotals,
  type SalesEntry,
  type SalesChannel,
} from '../data/sales';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

const CHANNEL_COLOR: Record<SalesChannel, string> = {
  amazon: '#ff9900',
  shopify: '#95bf47',
  base: '#2c6ef2',
  rakuten: '#bf0000',
  mercari: '#ff0211',
  other: '#94a3b8',
};

const EMPTY = { date: '', channel: 'amazon' as SalesChannel, amount: '', orders: '', note: '' };

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      flex: 1,
      minWidth: 150,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** Horizontal stacked bar of channel shares. */
function ChannelBar({ parts }: { parts: readonly { channel: SalesChannel; share: number }[] }) {
  if (parts.length === 0) return null;
  return (
    <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', margin: '8px 0' }}>
      {parts.map((p) => (
        <div
          key={p.channel}
          title={`${CHANNEL_LABEL[p.channel]} ${p.share.toFixed(1)}%`}
          style={{ width: `${p.share}%`, background: CHANNEL_COLOR[p.channel] }}
        />
      ))}
    </div>
  );
}

export function SalesPage() {
  const { records, add, remove } = useCollection<SalesEntry>(SALES_COLLECTION);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string>();

  const entries = useMemo(() => records.map((r) => r.data), [records]);
  const summary = useMemo(() => summarizeSales(entries), [entries]);
  const months = useMemo(() => monthlyTotals(entries), [entries]);

  async function onAdd() {
    try {
      const parsed = parseSalesEntry(form);
      setError(undefined);
      await add(parsed);
      setForm((f) => ({ ...EMPTY, channel: f.channel, date: f.date }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    padding: '6px 8px',
    fontSize: 13,
  } as const;

  return (
    <div>
      <Section title="売上を記録 — チャネル横断 (ローカル保存)">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={form.date}
            placeholder="YYYY-MM-DD"
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            style={{ ...inputStyle, width: 120 }}
          />
          <select
            value={form.channel}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as SalesChannel }))}
            style={{ ...inputStyle, width: 110 }}
          >
            {SALES_CHANNELS.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
            ))}
          </select>
          <input
            value={form.amount}
            placeholder="売上金額"
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            style={{ ...inputStyle, width: 110 }}
          />
          <input
            value={form.orders}
            placeholder="注文件数"
            onChange={(e) => setForm((f) => ({ ...f, orders: e.target.value }))}
            style={{ ...inputStyle, width: 90 }}
          />
          <input
            value={form.note}
            placeholder="メモ (任意)"
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            style={{ ...inputStyle, width: 140 }}
          />
          <button type="button" onClick={onAdd}>追加</button>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </Section>

      {entries.length === 0 ? (
        <p style={{ color: 'var(--text-mute)', fontSize: 13, marginTop: 12 }}>
          各 EC チャネルの売上を入力すると、横断で合計・チャネル別構成・月次推移を集計します。
          データはこの端末のローカル (IndexedDB) に保存されます。
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            <Tile label="総売上" value={yen.format(summary.totalAmount)} />
            <Tile label="総注文件数" value={summary.totalOrders.toLocaleString('ja-JP')} />
            <Tile label="平均注文単価 (AOV)" value={yen.format(Math.round(summary.aov))} />
            <Tile label="チャネル数" value={`${summary.byChannel.length}`} />
          </div>

          <Section title="チャネル別構成">
            <ChannelBar parts={summary.byChannel} />
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                  <th style={{ padding: '4px 8px' }}>チャネル</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>売上</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>構成比</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>注文</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>AOV</th>
                </tr>
              </thead>
              <tbody>
                {summary.byChannel.map((c) => (
                  <tr key={c.channel} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CHANNEL_COLOR[c.channel], marginRight: 6 }} />
                      {c.label}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(c.amount)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{c.share.toFixed(1)}%</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{c.orders.toLocaleString('ja-JP')}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(Math.round(c.aov))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {months.length > 0 && (
            <Section title="月次推移">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px' }}>{m.month}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title="明細" count={records.length}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                  <th style={{ padding: '4px 8px' }}>日付</th>
                  <th style={{ padding: '4px 8px' }}>チャネル</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>売上</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>注文</th>
                  <th style={{ padding: '4px 8px' }}>メモ</th>
                  <th style={{ padding: '4px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px' }}>{r.data.date}</td>
                    <td style={{ padding: '4px 8px' }}>{CHANNEL_LABEL[r.data.channel]}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(r.data.amount)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.data.orders}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--text-mute)' }}>{r.data.note ?? ''}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <button type="button" onClick={() => remove(r.id)} aria-label="削除">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}
