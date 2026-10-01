import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function A8netPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'a8net',
    SNAPSHOT.a8net,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="a8net"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>A8.net · {items.length} 件</>}
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
