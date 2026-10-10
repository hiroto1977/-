import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function DiscordPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'discord',
    SNAPSHOT.discord,
  );
  const { items, count } = data;

  return (
    <div>
      {/* トークン入力欄は出さない — このサービスは fetcher もアクションも
          資格情報を読まない (`shared/credentialUse.ts` が 'none' と宣言)。
          実 API を配線する時に宣言を直すと `lint:credential-use` が通り、
          ここへ tokenSetup を戻せる。 */}
      <StatusBar
        serviceId="discord"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Discord · {count} 件</>}
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
