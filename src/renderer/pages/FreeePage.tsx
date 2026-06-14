import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

// freee 会計連携。取引 (deals) から月次の営業キャッシュフローを取得し、
// 棒グラフで表示する。月次CFは資金調達レーダー (funding) の accountingCashflow
// 受け口に流せる形 (月→net)。集計は src/main/clients/freee.ts (純粋関数)。

type FreeeSnapshot = typeof SNAPSHOT.freee;

function jpy(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
}

function CashflowChart({ data }: { data: FreeeSnapshot }) {
  const W = 720, H = 240, P = 44;
  const rows = data.monthly;
  if (rows.length === 0) return null;
  const nets = rows.map((r) => r.net);
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)), ...nets);
  const minV = Math.min(0, ...nets);
  const range = maxV - minV || 1;
  const groupW = (W - P * 2) / rows.length;
  const barW = groupW * 0.28;
  const y = (v: number) => H - P - ((v - minV) / range) * (H - P * 2);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke="#2a2f3a" />
      {rows.map((r, i) => {
        const gx = P + i * groupW + groupW / 2;
        return (
          <g key={r.month}>
            <rect x={gx - barW - 2} y={y(r.income)} width={barW} height={y(0) - y(r.income)} fill="#3ec98a" />
            <rect x={gx + 2} y={y(r.expense)} width={barW} height={y(0) - y(r.expense)} fill="#e0568a" />
            {/* 純CFの点 */}
            <circle cx={gx} cy={y(r.net)} r={3} fill={r.net < 0 ? '#e0568a' : '#4f9cf9'} />
            <text x={gx} y={H - 6} fontSize="9" fill="var(--text-mute)" textAnchor="middle">
              {r.month.slice(2)}
            </text>
          </g>
        );
      })}
      <g fontSize="11">
        <rect x={W - 150} y={6} width="144" height="54" fill="var(--bg)" stroke="#2a2f3a" />
        <rect x={W - 142} y={14} width="10" height="10" fill="#3ec98a" />
        <text x={W - 128} y={23} fill="var(--text)">収入</text>
        <rect x={W - 142} y={28} width="10" height="10" fill="#e0568a" />
        <text x={W - 128} y={37} fill="var(--text)">支出</text>
        <circle cx={W - 137} cy={48} r={4} fill="#4f9cf9" />
        <text x={W - 128} y={52} fill="var(--text)">営業CF (純額)</text>
      </g>
    </svg>
  );
}

export function FreeePage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'freee',
    SNAPSHOT.freee,
  );
  const live = data as FreeeSnapshot;
  const hasData = live.monthly.length > 0;
  const totalNet = live.monthly.reduce((s, m) => s + m.net, 0);

  return (
    <div>
      <StatusBar
        serviceId="freee"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>freee 会計連携{live.companyName ? ` · ${live.companyName}` : ''}</>}
        tokenSetup={{
          label: 'OAuth アクセストークン',
          placeholder: 'freee の read スコープのアクセストークン',
        }}
      />

      <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 16 }}>
        freee 会計の取引 (収入・支出) を取得し、月次の営業キャッシュフローを集計します。
        ここで得た月次CFは<strong>資金調達レーダー</strong>の会計連携 (折れ線・純資金繰り) に利用できます。
        ※ 読み取り専用です。仕訳の登録・更新は行いません。OAuth 連携には freee アプリ登録と
        環境変数 <code>FREEE_OAUTH_CLIENT_ID</code> の設定が必要です。
      </div>

      <Section title="サマリー">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 12 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>対象月数</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{live.monthly.length}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>営業CF 合計</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{jpy(totalNet)}</div>
          </div>
        </div>
      </Section>

      {!hasData ? (
        <Section title="月次キャッシュフロー">
          <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            アクセストークンを設定して「更新」を押すと、freee の取引から月次の収入・支出・営業CF を取得します。
          </div>
        </Section>
      ) : (
        <>
          <Section title="月次キャッシュフロー (収入 / 支出 / 営業CF)">
            <CashflowChart data={live} />
          </Section>

          <Section title="月次明細" count={live.monthly.length}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {live.monthly.map((m) => (
                <div
                  key={m.month}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text)' }}>{m.month}</span>
                  <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{ color: '#3ec98a', fontSize: 12 }}>収入 {jpy(m.income)}</span>
                    <span style={{ color: '#e0568a', fontSize: 12 }}>支出 {jpy(m.expense)}</span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>純 {jpy(m.net)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
