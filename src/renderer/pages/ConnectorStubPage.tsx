import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import type { ServiceId } from '../../shared/serviceId';

/**
 * 連携先 (snapshot 専用) スタブページの共通実装。
 *
 * PR #5 で追加した 10 連携先 (Microsoft 365 / Dropbox / Salesforce / Discord /
 * Asana / Linear / Sentry / Shopify / Stripe / LINE) は、ID・ラベル・snapshot
 * 値だけが異なる 34 行の同一ページだった (合計 340 行のコピペ)。それらを
 * この 1 つの factory に集約する。
 *
 * 各サービスの公式 API 配線は Phase 6+ 予定。現フェーズは
 * `{ items: {id,name}[]; count }` 形状の snapshot を `最近のアイテム`
 * セクションに描画するだけ。リッチな業務 UI を持つサービス
 * (uber-eats / 士業 等) はこの factory の対象外。
 */
export interface ConnectorStubSnapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

/**
 * 連携スタブページのコンポーネントを生成する。
 *
 * snapshot 値は呼び出し側 (`services.ts`) から明示的に渡す。`SNAPSHOT[id]` を
 * 内部で引かないのは、ハイフン ID (`microsoft-365`) の snapshot キーが
 * camelCase (`microsoft365`) で ServiceId と一致しないため (scaffold 由来)。
 */
export function createConnectorStubPage<T extends ConnectorStubSnapshot>(
  id: ServiceId,
  label: string,
  snapshot: T,
) {
  function ConnectorStubPage() {
    const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
      id,
      snapshot,
    );
    const { items, count } = data;

    return (
      <div>
        <StatusBar
          serviceId={id}
          source={source}
          status={status}
          errorMessage={errorMessage}
          isConfigured={isConfigured}
          onRefresh={refresh}
          who={
            <>
              {label} · {count} 件
            </>
          }
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
  ConnectorStubPage.displayName = `ConnectorStubPage(${id})`;
  return ConnectorStubPage;
}
