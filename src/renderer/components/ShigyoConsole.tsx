import type { ReactNode } from 'react';
import { Section, StatusBar } from './StatusBar';
import { Stat } from './Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from './tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import type { ServiceId } from '../../shared/serviceId';
import type { ShigyoSnapshot, ShigyoConsultationStatus } from '../../shared/shigyoTypes';
import { jpy } from '../../shared/formatters';
import { PROFESSIONAL_MAP, otherProfessionals, isProfessionalId } from '../data/professionalMap';

const STATUS_COLOR: Record<ShigyoConsultationStatus, string> = {
  相談予約: '#94a3b8',
  相談中: '#fbbf24',
  対応中: '#3b82f6',
  完了: '#22c55e',
};

/** ステータスの意味を補足するツールチップ (NIT: 相談中 / 対応中 の区別)。 */
const STATUS_HINT: Record<ShigyoConsultationStatus, string> = {
  相談予約: 'これから相談予定 (日程確定済み・未着手)',
  相談中: '相談・ヒアリングを実施中 (方針検討段階)',
  対応中: '方針が決まり実務 (書類作成・手続) を進行中',
  完了: '対応が完了済み',
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

/** アプリ内遷移 (App.tsx が servicehub:navigate を listen)。 */
function navigateTo(serviceId: ServiceId): void {
  window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: serviceId }));
}

/**
 * 士業 (専門家) 連携の共通コンソール。
 *
 * 8 士業 (税理士 / 公認会計士 / 社労士 / 弁護士 / 司法書士 / 行政書士 /
 * 中小企業診断士 / 弁理士) は同一の軽量 CRM UI — 担当領域 (事業仕分け) /
 * 連絡先 / 月次サマリ / 相談履歴 / 書類 — を共有するため、各 Page はこの
 * コンポーネントに `serviceId` / `snapshot` / `label` (+ 任意の
 * `disclaimer`) を渡すだけにする。担当領域は `data/professionalMap.ts` の
 * 事業仕分けマップから serviceId で引く。
 */
export function ShigyoConsole({ serviceId, snapshot, label, disclaimer }: ShigyoConsoleProps) {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    serviceId,
    snapshot,
  );
  const { contacts, recentConsultations, pendingDocuments, monthlyFee, outstandingInvoice } = data;
  const profile = isProfessionalId(serviceId) ? PROFESSIONAL_MAP[serviceId] : null;
  const others = isProfessionalId(serviceId) ? otherProfessionals(serviceId) : [];

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

      {profile != null && (
        <Section title="担当領域 (事業仕分け)" count={profile.duties.length}>
          <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 6, lineHeight: 1.6 }}>
            {profile.summary}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11,
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '2px 10px',
                color: 'var(--text-mute)',
              }}
            >
              根拠法: {profile.law}
            </span>
            <span
              title={profile.exclusive}
              style={{
                fontSize: 11,
                border: '1px solid #3b82f6',
                borderRadius: 999,
                padding: '2px 10px',
                color: '#3b82f6',
                cursor: 'help',
              }}
            >
              独占業務: {profile.exclusive.length > 26 ? `${profile.exclusive.slice(0, 26)}…` : profile.exclusive}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 10,
            }}
          >
            {profile.duties.map((duty) => (
              <div
                key={duty.title}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{duty.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.55, flex: 1 }}>
                  {duty.desc}
                </div>
                {duty.link != null && (
                  <div>
                    <button
                      type="button"
                      onClick={() => navigateTo(duty.link!.serviceId)}
                      style={{ fontSize: 11 }}
                    >
                      {duty.link.label} を開く →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {others.length > 0 && (
        <Section title="他の士業に相談" count={others.length}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {others.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigateTo(p.id)}
                title={p.summary}
                style={{ fontSize: 12 }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Section>
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
                    <span
                      title={STATUS_HINT[c.status]}
                      style={{ color: STATUS_COLOR[c.status] ?? 'var(--text)', fontWeight: 600, cursor: 'help' }}
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
