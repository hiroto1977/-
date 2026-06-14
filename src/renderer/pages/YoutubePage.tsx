import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

const num = new Intl.NumberFormat('ja-JP');

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export function YoutubePage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'youtube',
    SNAPSHOT.youtube,
  );
  const { channel, recentVideos } = data;

  return (
    <div>
      <StatusBar
        serviceId="youtube"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>YouTube{channel.title ? ` · ${channel.title}` : ''}</>}
        tokenSetup={{ label: 'API キー + チャンネル ID', placeholder: '{"apiKey":"...","channelId":"UC..."}' }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <Tile label="登録者数" value={num.format(channel.subscribers)} />
        <Tile label="総再生回数" value={num.format(channel.views)} />
        <Tile label="動画本数" value={num.format(channel.videos)} />
      </div>

      <Section title="最近の動画" count={recentVideos.length}>
        <DataList
          items={recentVideos.map((v) => ({
            key: v.videoId,
            title: v.title,
            meta: v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('ja-JP') : undefined,
            href: v.url,
          }))}
        />
      </Section>
    </div>
  );
}
