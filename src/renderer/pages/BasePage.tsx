import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function BasePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'base',
    SNAPSHOT.base,
  );
  const { items } = data;

  return (
    <div>
      <StatusBar
        serviceId="base"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>BASE · {items.length} 件</>}
        tokenSetup={{ label: 'OAuth アクセストークン', placeholder: 'OAuth access token' }}
      />

      <Section title="商品" count={items.length}>
        <DataList
          items={items.map((it) => ({
            key: it.id,
            title: it.name,
            meta: `¥${it.price.toLocaleString('ja-JP')} · 在庫 ${it.stock}`,
            badge: it.visible ? '公開' : '非公開',
          }))}
        />
      </Section>
    </div>
  );
}
