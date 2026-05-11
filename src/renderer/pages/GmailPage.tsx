import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function GmailPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'gmail',
    SNAPSHOT.gmail,
  );
  const { threads } = data;

  return (
    <div>
      <StatusBar
        serviceId="gmail"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Gmail 受信トレイ · 直近 {threads.length} スレッド</>}
      />

      <Section title="Inbox" count={threads.length}>
        <DataList
          items={threads.map((t) => ({
            key: t.id,
            title: t.subject,
            meta: `${t.sender} · ${t.date}`,
            href: `https://mail.google.com/mail/u/0/#inbox/${t.id}`,
          }))}
        />
      </Section>
    </div>
  );
}
