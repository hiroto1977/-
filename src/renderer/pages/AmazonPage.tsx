import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function AmazonPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'amazon',
    SNAPSHOT.amazon,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="amazon"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Amazon · {items.length} 件</>}
      />

      <Section title="商品・注文" count={items.length}>
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
