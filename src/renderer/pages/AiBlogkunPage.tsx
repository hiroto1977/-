import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function AiBlogkunPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'ai-blogkun',
    SNAPSHOT['ai-blogkun'],
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="ai-blogkun"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>AIブログくん · {items.length} 件</>}
      />

      <Section title="Items" count={items.length}>
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
