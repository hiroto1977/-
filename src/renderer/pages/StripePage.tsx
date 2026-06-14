import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function StripePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'stripe',
    SNAPSHOT.stripe,
  );
  const { items, count } = data;

  return (
    <div>
      <StatusBar
        serviceId="stripe"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Stripe · {count} 件</>}
        tokenSetup={{ label: 'API トークン', placeholder: 'Bearer token' }}
      />

      <Section title="最近のアイテム" count={items.length}>
        <DataList
          items={items.map((it) => ({ key: it.id, title: it.name }))}
          empty="まだデータがありません (Phase 6 で実 API 接続予定)"
        />
      </Section>
    </div>
  );
}
