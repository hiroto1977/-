import type { ReactNode } from 'react';
import { Section, StatusBar } from './StatusBar';
import { Stat } from './Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from './tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import type { ServiceId } from '../../shared/serviceId';
import type { ShigyoSnapshot, ShigyoConsultationStatus } from '../../shared/shigyoTypes';

const jpy = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

const STATUS_COLOR: Record<ShigyoConsultationStatus, string> = {
  相談予約: '#94a3b8',
  相談中: '#fbbf24',
  対応中: '#3b82f6',
  完了: '#22c55e',
};

export interface ShigyoConsoleProps {
  /** ルーティング用の ServiceId。 */
  readonly serviceId: ServiceId;
  /** `SNAPSHOT[...]` の士業 snapshot。 */
  readonly snapshot: ShigyoSnapshot;
  /** ヘッダーに出す士業名 (例: 「税理士」)。 */
  readonly label: string;
  /**
   * 法的助言に当たり得る士業 (弁護士 / 弁理士) 向けの注意書き。
   * 指定すると最上部に警告バナーを表示する。
   */
  readonly disclaimer?: ReactNode;
}

/**
 * 士業 (専門家) 連携の共通コンソール。
 *
 * 7 士業 (税理士 / 社労士 / 弁護士 / 司法書士 / 行政書士 / 中小企業診断士 /
 * 弁理士) は同一の軽量 CRM UI — 連絡先 / 月次サマリ / 相談履歴 / 書類 —
 * を共有するため、各 Page はこのコンポーネントに `serviceId` / `snapshot`
 * / `label` (+ 任意の `disclaimer`) を渡すだけにする。
 */
export function ShigyoConsole({ serviceId, snapshot, label, disclaimer }: ShigyoConsoleProps) {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    serviceId,
    snapshot,
  );
  const { contacts, recentConsultations, pendingDocuments, monthlyFee, outstandingInvoice } = data;

  return (
    <div>
      <StatusBar
        serviceId={serviceId}
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>{label} · 連携 {contacts.length} 名 · 顧問料 {jpy(monthlyFee)}/月</>}
      />

      {disclaimer != null && (
        <div
          role="note"
          style={{
            margin: '0 0 12px',
            padding: 10,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            fontSize: 11,
            color: '#fbbf24',
            lineHeight: 1.5,
          }}
        >
          ⚖️ {disclaimer}
        </div>
      )}

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
