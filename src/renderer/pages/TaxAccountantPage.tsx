import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';

const jpy = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

const STATUS_COLOR: Record<string, string> = {
  相談予約: '#94a3b8',
  相談中: '#fbbf24',
  対応中: '#3b82f6',
  完了: '#22c55e',
};

export function TaxAccountantPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'tax-accountant',
    SNAPSHOT.taxAccountant,
  );
  const { contacts, recentConsultations, pendingDocuments, monthlyFee, outstandingInvoice } = data;

  return (
    <div>
      <StatusBar
        serviceId="tax-accountant"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>税理士 · 連携 {contacts.length} 名 · 顧問料 {jpy(monthlyFee)}/月</>}
      />

      <Section title="連携先一覧" count={contacts.length}>
        {contacts.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
            連携先が未登録です (Phase 6 で「専門家を追加」フォームに対応予定)
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>氏名</th>
                <th style={thStyle}>事務所</th>
                <th style={thStyle}>連絡先</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td style={tdStyle}>{c.name}</td>
                  <td style={tdStyle}>{c.firm}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-mute)' }}>
                    {c.email ?? ''}{c.phone ? ` · ${c.phone}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="月次サマリ" count={2}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label="月次顧問料" value={jpy(monthlyFee)} />
          <Stat label="未払い請求額" value={jpy(outstandingInvoice)} positive={outstandingInvoice === 0} />
        </div>
      </Section>

      <Section title="直近の相談" count={recentConsultations.length}>
        {recentConsultations.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>相談履歴はまだありません</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>日付</th>
                <th style={thStyle}>テーマ</th>
                <th style={thStyle}>ステータス</th>
              </tr>
            </thead>
            <tbody>
              {recentConsultations.map((c) => (
                <tr key={c.id}>
                  <td style={tdStyle}>{c.date}</td>
                  <td style={tdStyle}>{c.topic}</td>
                  <td style={tdStyle}>
                    <span style={{ color: STATUS_COLOR[c.status] ?? 'var(--text)', fontWeight: 600 }}>
                      ● {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="やり取り中の書類" count={pendingDocuments.length}>
        {pendingDocuments.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>未処理の書類はありません</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>方向</th>
                <th style={thStyle}>タイトル</th>
                <th style={thNum}>日付</th>
              </tr>
            </thead>
            <tbody>
              {pendingDocuments.map((d) => (
                <tr key={d.id}>
                  <td style={tdStyle}>{d.direction === 'sent' ? '📤 送付' : '📥 受領'}</td>
                  <td style={tdStyle}>{d.title}</td>
                  <td style={tdNum}>{d.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
