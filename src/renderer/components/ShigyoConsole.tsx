import type { ServiceId } from '../services';
import type { ShigyoSnapshot } from '../../shared/shigyoTypes';
import { Section, StatusBar } from './StatusBar';
import { Stat } from './Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from './tableStyles';
import { useServiceData } from '../hooks/useServiceData';

/**
 * 士業連携コンソール — 7 士業ページ共通の表示コンポーネント。
 *
 * PR #7 R1 #3 で指摘された「7 ページが 882 行コピペ」を解消するために
 * 抽出。各士業ページは serviceId / label / snapshot / disclaimer を渡す
 * だけの 5 行程度のラッパに縮小できる。
 *
 * 弁護士 / 弁理士 (業務独占資格) には法的 disclaimer 表示用 `disclaimer`
 * prop を渡す (PR #7 R1 #5)。それ以外の士業 (税理士 / 社労士 等) も
 * 任意で disclaimer を付与できる。
 */

const jpy = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

const STATUS_COLOR: Record<string, string> = {
  相談予約: '#94a3b8',
  相談中: '#fbbf24',
  対応中: '#3b82f6',
  完了: '#22c55e',
};
const STATUS_TOOLTIP: Record<string, string> = {
  相談予約: 'これから日時を確保する段階',
  相談中: '専門家と面談・電話で議論中',
  対応中: '案件として継続進行中 (書類作成・代理人活動など)',
  完了: '依頼内容が完結し、追加対応の必要なし',
};

export interface ShigyoConsoleProps {
  readonly serviceId: ServiceId;
  readonly serviceLabel: string;
  readonly snapshot: ShigyoSnapshot;
  /** 業務独占資格の場合は disclaimer 必須。それ以外は省略可。 */
  readonly disclaimer?: string;
}

export function ShigyoConsole({ serviceId, serviceLabel, snapshot, disclaimer }: ShigyoConsoleProps) {
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
        who={<>{serviceLabel} · 連携 {contacts.length} 名 · 顧問料 {jpy(monthlyFee)}/月</>}
      />

      {disclaimer && (
        <div style={disclaimerStyle}>
          ⚠ {disclaimer}
        </div>
      )}

      <Section title="連携先一覧" count={contacts.length}>
        {contacts.length === 0 ? (
          <div style={emptyStyle}>
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
          <div style={emptyStyle}>相談履歴はまだありません</div>
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
                    <span
                      style={{ color: STATUS_COLOR[c.status] ?? 'var(--text)', fontWeight: 600 }}
                      title={STATUS_TOOLTIP[c.status] ?? ''}
                    >
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
          <div style={emptyStyle}>未処理の書類はありません</div>
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

const disclaimerStyle: React.CSSProperties = {
  padding: '10px 14px',
  margin: '8px 0 16px',
  background: 'rgba(251, 191, 36, 0.08)',
  border: '1px solid #fbbf24',
  borderRadius: 6,
  fontSize: 11,
  color: '#fbbf24',
  lineHeight: 1.6,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-mute)',
};
