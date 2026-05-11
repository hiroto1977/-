import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

function ts(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function CanvaPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'canva',
    SNAPSHOT.canva,
  );
  const { designs, brandKits } = data;

  return (
    <div>
      <StatusBar
        serviceId="canva"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Canva · ブランドキット {brandKits.length} · デザイン {designs.length}+</>}
      />

      <Section title="Recent Designs" count={designs.length}>
        <DataList
          items={designs.map((d) => ({
            key: d.id,
            title: d.title,
            meta: `${d.pageCount} ページ · 更新 ${ts(d.updatedAt)}`,
            thumbnailUrl: d.thumbnailUrl,
            href: d.viewUrl,
          }))}
        />
      </Section>

      <Section title="Brand Kits" count={brandKits.length}>
        <DataList
          items={brandKits.map((b) => ({
            key: b.id,
            title: `Brand Kit ${b.id}`,
            meta: 'ブランドキットを開いて適用 → generate-design でデザイン生成可能',
          }))}
        />
      </Section>
    </div>
  );
}
