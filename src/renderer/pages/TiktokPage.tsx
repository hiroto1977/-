import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function TiktokPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'tiktok',
    SNAPSHOT.tiktok,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="tiktok"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>TikTok · {items.length} 件</>}
      />

      <Section title="投稿・広告・運用サマリー" count={items.length}>
        <DataList
          items={items.map((it) => ({
            key: it.id,
            title: it.name,
          }))}
        />
      </Section>
    </div>
  );
}
