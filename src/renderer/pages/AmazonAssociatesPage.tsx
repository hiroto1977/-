import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function AmazonAssociatesPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'amazon-associates',
    SNAPSHOT['amazon-associates'],
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="amazon-associates"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Amazon アソシエイト · {items.length} 件</>}
      />

      <Section title="成果レポート" count={items.length}>
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
