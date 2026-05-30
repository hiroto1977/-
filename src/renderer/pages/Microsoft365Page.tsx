import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function Microsoft365Page() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'microsoft-365',
    SNAPSHOT.microsoft365,
  );
  const { userName, messages, events, items } = data;

  return (
    <div>
      <StatusBar
        serviceId="microsoft-365"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Microsoft 365{userName ? ` · ${userName}` : ''}</>}
        tokenSetup={{
          label: 'OAuth アクセストークン',
          placeholder: 'Microsoft Graph (User.Read / Mail.Read / Calendars.Read)',
        }}
      />

      <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 16 }}>
        Microsoft Graph からプロフィール・Outlook メール・カレンダー予定を取得します (読み取り専用)。
        OAuth 連携には Azure ポータルでのアプリ登録と環境変数 <code>MS365_OAUTH_CLIENT_ID</code> の設定が必要です。
      </div>

      <Section title="サマリー" count={items.length}>
        <DataList items={items.map((it) => ({ key: it.id, title: it.name }))} empty="データなし" />
      </Section>

      <Section title="Outlook メール (直近)" count={messages.length}>
        <DataList
          items={messages.map((m) => ({
            key: m.id,
            title: `${m.unread ? '● ' : ''}${m.subject}`,
            meta: `${m.from} · ${m.received}`,
          }))}
          empty="アクセストークンを設定して更新するとメールが表示されます"
        />
      </Section>

      <Section title="カレンダー予定 (直近)" count={events.length}>
        <DataList
          items={events.map((e) => ({
            key: e.id,
            title: e.subject,
            meta: [e.start, e.location].filter(Boolean).join(' · '),
          }))}
          empty="アクセストークンを設定して更新すると予定が表示されます"
        />
      </Section>
    </div>
  );
}
