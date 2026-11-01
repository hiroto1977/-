import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function NetseaPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'netsea',
    SNAPSHOT.netsea,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="netsea"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>NETSEA · {items.length} 件</>}
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
