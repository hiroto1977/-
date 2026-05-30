import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function TaxPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'tax',
    SNAPSHOT.tax,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="tax"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>税務試算 · {items.length} 件</>}
        tokenSetup={{ label: 'API トークン', placeholder: 'Bearer token' }}
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
