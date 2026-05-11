import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';

export function GmailPage() {
  const { threads } = SNAPSHOT.gmail;

  return (
    <div>
      <StatusBar who={<>Gmail 受信トレイ · 直近 {threads.length} スレッド</>} />

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
