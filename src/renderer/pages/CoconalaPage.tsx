import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function CoconalaPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'coconala',
    SNAPSHOT.coconala,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="coconala"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>ココナラ · {items.length} 件</>}
      />

      <Section title="出品・受注" count={items.length}>
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
