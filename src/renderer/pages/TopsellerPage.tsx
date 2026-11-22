import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function TopsellerPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'topseller',
    SNAPSHOT.topseller,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="topseller"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>TopSeller · {items.length} 件</>}
      />

      <Section title="商品 (Items)" count={items.length}>
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
