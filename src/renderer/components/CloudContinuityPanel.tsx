/**
 * 事業継続 —— 他社のクラウドが止まったとき (2026-11-11)。
 *
 * 台帳 `shared/cloudContinuity.ts` を、利用者が資格情報を預けているサービスに当てて見せる。
 * 判断はここに置かない (立ち位置の導出・提供者の行・責任の断りはすべて台帳が持つ)。
 *
 * 資格情報の一覧は橋 (`window.serviceHub.listConfigured`) から読む —— 実行形態ごとの保管先は橋が振り分ける。
 * 読めなかったときは「預けていない」と言わず、確かめられないと言う。
 */
import { useEffect, useState } from 'react';
import {
  CLOUD_PROVIDERS,
  CONTINUITY_CLASS_LABEL,
  continuityTotals,
  LIABILITY_NOTE,
  outageExposure,
  RESPONSIBILITY_STAYS,
  type CloudProvider,
} from '../../shared/cloudContinuity';
import { SERVICES } from '../services';

type Configured = { readonly state: 'loading' } | { readonly state: 'unreadable' } | { readonly state: 'read'; readonly ids: readonly string[] };

const MUTED = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 } as const;
const BOX = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 } as const;
const ROW = { borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 } as const;

function labelOf(id: string): string {
  return SERVICES.find((s) => s.id === id)?.label ?? id;
}

function ProviderRow({ provider, held }: { provider: CloudProvider; held: readonly string[] }) {
  return (
    <div data-cloud-provider={provider.id} style={ROW}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{provider.label}</div>
      {held.length > 0 && (
        <div style={MUTED}>資格情報を預けている画面: {held.map(labelOf).join('・')}</div>
      )}
      <div style={MUTED}>預けている物: {provider.entrusted}</div>
      <div style={MUTED}>止まったとき: {provider.whenDown}</div>
      <div style={MUTED}>その間: {provider.meanwhile}</div>
    </div>
  );
}

export function CloudContinuityPanel() {
  const [configured, setConfigured] = useState<Configured>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const hub = window.serviceHub;
    if (!hub) {
      setConfigured({ state: 'unreadable' });
      return;
    }
    hub
      .listConfigured()
      .then((ids) => {
        if (!cancelled) setConfigured({ state: 'read', ids });
      })
      .catch(() => {
        if (!cancelled) setConfigured({ state: 'unreadable' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = continuityTotals();
  const exposed = configured.state === 'read' ? outageExposure(configured.ids) : [];
  const infrastructure = CLOUD_PROVIDERS.filter((p) => p.kind === 'infrastructure');

  return (
    <div data-cloud-continuity style={BOX}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>事業継続 —— 他社のクラウドが止まったとき</div>
      <p data-continuity-totals style={{ ...MUTED, margin: '6px 0 0' }}>
        全 {totals.total} サービスのうち、{CONTINUITY_CLASS_LABEL.local}: {totals.local}・{CONTINUITY_CLASS_LABEL['cloud-assist']}: {totals.cloudAssist}・
        {CONTINUITY_CLASS_LABEL['cloud-data']}: {totals.cloudData}。
      </p>
      <p style={{ ...MUTED, margin: '6px 0 0' }}>
        事業の記録 (売上・KPI・貸借対照表・書類ほか) はこの端末に保存します。どのクラウドが止まっても読み書きできます。
        端末の故障に備える控えは、この画面の「バックアップ / 復元」から書き出してください。
      </p>

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 14 }}>いま資格情報を預けているクラウド</div>
      {configured.state === 'loading' && <div style={MUTED}>読み込み中…</div>}
      {configured.state === 'unreadable' && (
        <div data-continuity-unreadable role="alert" style={MUTED}>
          資格情報の一覧を読めなかったので、どのクラウドに依っているかを確かめられません。
        </div>
      )}
      {configured.state === 'read' && exposed.length === 0 && (
        <div data-continuity-none style={MUTED}>
          資格情報を預けているクラウドはありません。外部のクラウドが止まっても、このアプリで止まる機能はありません。
        </div>
      )}
      {exposed.map((e) => (
        <ProviderRow key={e.provider.id} provider={e.provider} held={e.configured} />
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 14 }}>資格情報に依らない依存先</div>
      {infrastructure.map((p) => (
        <ProviderRow key={p.id} provider={p} held={[]} />
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 14 }}>責任の所在</div>
      <p data-liability-note role="note" style={{ ...MUTED, margin: '6px 0 0' }}>
        {LIABILITY_NOTE}
      </p>
      <ul style={{ ...MUTED, margin: '6px 0 0', paddingLeft: 18 }}>
        {RESPONSIBILITY_STAYS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
