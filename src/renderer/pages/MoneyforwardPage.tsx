import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function MoneyforwardPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'moneyforward',
    SNAPSHOT.moneyforward,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="moneyforward"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>マネーフォワード · {items.length} 件</>}
      />

      <Section title="項目" count={items.length}>
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
