import { navigateTo } from '../navigate';
import { useMemo, useState, type ReactNode } from 'react';
import { Section, StatusBar } from './StatusBar';
import { Stat } from './Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from './tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { useCollection } from '../data/useCollection';
import { fireReported } from '../data/recordStoreFailure';
import type { ServiceId } from '../../shared/serviceId';
import type { ShigyoSnapshot, ShigyoConsultationStatus } from '../../shared/shigyoTypes';
import { jpy } from '../../shared/formatters';
import { PROFESSIONAL_MAP, otherProfessionals, isProfessionalId } from '../data/professionalMap';
import { docsForProfessional } from '../data/businessTriage';
import {
  SHIGYO_CONTACTS_COLLECTION,
  SHIGYO_CONSULTATIONS_COLLECTION,
  CONSULTATION_STATUSES,
  parseShigyoContact,
  parseShigyoConsultation,
  contactToForm,
  type ShigyoContactEntry,
  type ShigyoConsultationEntry,
} from '../data/shigyoDirectory';

const EMPTY_CONTACT_FORM = { name: '', firm: '', phone: '', email: '' };
const EMPTY_CONSULTATION_FORM = { date: '', topic: '', status: '相談予約' as ShigyoConsultationStatus };

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 150,
};

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
  const { pendingDocuments, monthlyFee, outstandingInvoice } = data;
  const profile = isProfessionalId(serviceId) ? PROFESSIONAL_MAP[serviceId] : null;
  const others = isProfessionalId(serviceId) ? otherProfessionals(serviceId) : [];
  // 書類スタジオで作れる、この士業に関わる書式 (仕分け表の逆引き)。
  const docs = useMemo(() => (isProfessionalId(serviceId) ? docsForProfessional(serviceId) : []), [serviceId]);

  // ユーザー登録の連絡先・相談履歴 (record store 永続化・端末内)。8 士業で
  // コレクションを共有し、serviceId で自分のページの分だけを表示する。
  const contactsCol = useCollection<ShigyoContactEntry>(SHIGYO_CONTACTS_COLLECTION);
  const consultationsCol = useCollection<ShigyoConsultationEntry>(SHIGYO_CONSULTATIONS_COLLECTION);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT_FORM);
  const [contactError, setContactError] = useState<string>();
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [consultForm, setConsultForm] = useState(EMPTY_CONSULTATION_FORM);
  const [consultError, setConsultError] = useState<string>();

  /** デモ (snapshot) 行 + ユーザー行の結合。 */
  const contacts = useMemo(
    () => [
      ...data.contacts.map((c) => ({ ...c, rowId: c.id, user: false as const })),
      ...contactsCol.records
        .filter((r) => r.data.serviceId === serviceId)
        .map((r) => ({ ...r.data, rowId: r.id, user: true as const })),
    ],
    [data.contacts, contactsCol.records, serviceId],
  );

  const recentConsultations = useMemo(() => {
    const combined = [
      ...data.recentConsultations.map((c) => ({ ...c, rowId: c.id, user: false as const })),
      ...consultationsCol.records
        .filter((r) => r.data.serviceId === serviceId)
        .map((r) => ({ ...r.data, rowId: r.id, user: true as const })),
    ];
    // 新しい相談が上に来るよう日付降順 (同日は元の順を保つ安定ソート)。
    return combined.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [data.recentConsultations, consultationsCol.records, serviceId]);

  async function onSaveContact() {
    try {
      const parsed = parseShigyoContact({ serviceId, ...contactForm });
      setContactError(undefined);
      if (editingContactId !== null) {
        await contactsCol.edit(editingContactId, parsed);
        setEditingContactId(null);
      } else {
        await contactsCol.add(parsed);
      }
      setContactForm(EMPTY_CONTACT_FORM);
    } catch (e) {
      setContactError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  function onStartEditContact(rowId: string, c: ShigyoContactEntry) {
    setContactForm(contactToForm(c));
    setEditingContactId(rowId);
    setContactError(undefined);
  }

  async function onAddConsultation() {
    try {
      const parsed = parseShigyoConsultation({ serviceId, ...consultForm });
      setConsultError(undefined);
      await consultationsCol.add(parsed);
      setConsultForm(EMPTY_CONSULTATION_FORM);
    } catch (e) {
      setConsultError(e instanceof Error ? e.message : '入力エラー');
    }
  }

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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{duty.title}</div>
                  <span
                    title={
                      duty.scope === 'exclusive'
                        ? 'この士業の独占業務 — 無資格者が業として行うことは士業法で制限されます'
                        : '独占業務ではありませんが、この士業の専門性で頼るのが定石の領域です'
                    }
                    style={{
                      flex: 'none',
                      fontSize: 10,
                      border: `1px solid ${duty.scope === 'exclusive' ? '#f87171' : 'var(--border)'}`,
                      borderRadius: 999,
                      padding: '1px 8px',
                      color: duty.scope === 'exclusive' ? '#f87171' : 'var(--text-mute)',
                      cursor: 'help',
                    }}
                  >
                    {duty.scope === 'exclusive' ? '独占業務' : '専門相談'}
                  </span>
                </div>
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

      {profile != null && docs.length > 0 && (
        <Section title="書類スタジオで作る書類" count={docs.length}>
          <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 8, lineHeight: 1.6 }}>
            この士業に関わる書式です。自社の分は書類スタジオで作れます (開くと書式ごとの事業仕分けと注意点が出ます)。
            計算書類は経営サマリーの数値から組めます。
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {docs.some((d) => d.doc === 'kessan') && (
              <button
                type="button"
                className="primary"
                onClick={() => navigateTo('docstudio', { doc: 'kessan', action: 'import-overview' })}
                style={{ fontSize: 12 }}
              >
                経営サマリーの数値から計算書類を作る →
              </button>
            )}
            <button type="button" onClick={() => navigateTo('overview')} style={{ fontSize: 12 }}>
              経営サマリーを開く →
            </button>
            <button type="button" onClick={() => navigateTo('overview', { action: 'bank-sheet' })} style={{ fontSize: 12 }}>
              金融機関等提出用の書面を開く →
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle} data-shigyo-docs>
              <thead>
                <tr>
                  <th style={thStyle}>書類</th>
                  <th style={thStyle}>この士業との関わり</th>
                  <th style={thStyle}>自社分</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.doc}>
                    <td style={tdStyle}>{d.label}</td>
                    <td style={tdStyle}>{d.relation === 'exclusive' ? '他人のために業として行うと独占業務' : '相談先'}</td>
                    <td style={tdStyle}>{d.ownUse === 'ok' ? '自社で作れる' : '自社で作れる (手順に注意)'}</td>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => navigateTo('docstudio', { doc: d.doc })} style={{ fontSize: 11 }}>
                        書類スタジオで開く →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <div className="field-grid" style={{ marginBottom: 10 }}>
          {([
            ['氏名', 'name', '例: 山田 太郎'],
            ['事務所 (任意)', 'firm', '例: 山田会計事務所'],
            ['電話 (任意)', 'phone', '03-xxxx-xxxx'],
            ['メール (任意)', 'email', 'you@example.com'],
          ] as const).map(([label, key, ph]) => (
            <label key={key} style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {label}
              <input
                type="text"
                value={contactForm[key]}
                placeholder={ph}
                onChange={(e) => setContactForm((f) => ({ ...f, [key]: e.target.value }))}
                style={inputStyle}
              />
            </label>
          ))}
          <button type="button" onClick={onSaveContact}>
            {editingContactId !== null ? '保存' : `＋ ${label}を追加`}
          </button>
          {editingContactId !== null && (
            <button
              type="button"
              onClick={() => {
                setEditingContactId(null);
                setContactForm(EMPTY_CONTACT_FORM);
                setContactError(undefined);
              }}
              style={{ color: 'var(--text-mute)' }}
            >
              キャンセル
            </button>
          )}
        </div>
        {contactError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{contactError}</div>}
        {contacts.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
            連携先が未登録です — 上のフォームから実際の{label}を登録できます (端末内にのみ保存)
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>氏名</th>
                <th style={thStyle}>事務所</th>
                <th style={thStyle}>連絡先</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.rowId}>
                  <td style={tdStyle}>
                    {c.name}
                    {!c.user && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', background: 'var(--bg-elev)', color: 'var(--text-mute)', borderRadius: 3, fontSize: 10 }}>
                        デモ
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>{c.firm}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-mute)' }}>
                    {c.email ?? ''}{c.phone ? ` · ${c.phone}` : ''}
                  </td>
                  <td style={tdStyle}>
                    {c.user && (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" onClick={() => onStartEditContact(c.rowId, c)} style={{ fontSize: 11 }}>
                          編集
                        </button>
                        <button type="button" onClick={() => fireReported(contactsCol.remove(c.rowId))} style={{ fontSize: 11, color: '#f87171' }}>
                          削除
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="月次サマリ" count={2}>
        <div className="stat-grid">
          <Stat label="月次顧問料" value={jpy(monthlyFee)} />
          <Stat label="未払い請求額" value={jpy(outstandingInvoice)} positive={outstandingInvoice === 0} />
        </div>
      </Section>

      <Section title="直近の相談" count={recentConsultations.length}>
        <div className="field-grid" style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            相談日
            <input
              type="date"
              value={consultForm.date}
              onChange={(e) => setConsultForm((f) => ({ ...f, date: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            相談テーマ
            <input
              type="text"
              value={consultForm.topic}
              placeholder="例: 決算前の節税相談"
              onChange={(e) => setConsultForm((f) => ({ ...f, topic: e.target.value }))}
              style={{ ...inputStyle, width: 220 }}
            />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            ステータス
            <select
              value={consultForm.status}
              onChange={(e) => setConsultForm((f) => ({ ...f, status: e.target.value as ShigyoConsultationStatus }))}
              style={{ ...inputStyle, width: 120 }}
            >
              {CONSULTATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button type="button" onClick={onAddConsultation}>＋ 相談を記録</button>
        </div>
        {consultError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{consultError}</div>}
        {recentConsultations.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>相談履歴はまだありません — 上のフォームから記録できます</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>日付</th>
                <th style={thStyle}>テーマ</th>
                <th style={thStyle}>ステータス</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {recentConsultations.map((c) => (
                <tr key={c.rowId}>
                  <td style={tdStyle}>{c.date}</td>
                  <td style={tdStyle}>{c.topic}</td>
                  <td style={tdStyle}>
                    {c.user ? (
                      <select
                        value={c.status}
                        aria-label="相談ステータスを変更"
                        onChange={(e) => fireReported(consultationsCol.edit(c.rowId, { status: e.target.value as ShigyoConsultationStatus }))}
                        style={{ ...inputStyle, width: 110, color: STATUS_COLOR[c.status] ?? 'var(--text)', fontWeight: 600 }}
                      >
                        {CONSULTATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span
                        title={STATUS_HINT[c.status]}
                        style={{ color: STATUS_COLOR[c.status] ?? 'var(--text)', fontWeight: 600, cursor: 'help' }}
                      >
                        ● {c.status}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {c.user && (
                      <button type="button" onClick={() => fireReported(consultationsCol.remove(c.rowId))} style={{ fontSize: 11, color: '#f87171' }}>
                        削除
                      </button>
                    )}
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
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {pendingDocuments.map((d) => (
                <tr key={d.id}>
                  <td style={tdStyle}>{d.direction === 'sent' ? '📤 送付' : '📥 受領'}</td>
                  <td style={tdStyle}>{d.title}</td>
                  <td style={tdNum}>{d.date}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => navigateTo('docstudio', { query: d.title })}
                      title="書類スタジオの書式検索にこの題名を入れて開きます"
                      style={{ fontSize: 11 }}
                    >
                      書類スタジオで探す →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
