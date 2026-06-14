import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, tdStyle } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import {
  FREE_CONNECTORS,
  FREE_CONNECTOR_REGISTRY,
} from '../../shared/connectors/freeConnectors';
import { planConnectorRun, CONNECTOR_CATALOG } from '../../shared/connectors/connectorCatalog';
import { PLUGIN_CATALOG } from '../../shared/connectors/pluginCatalog';
import {
  resolveHookPlan,
  requiredPermissionFor,
  type HookDispatchStep,
} from '../../shared/connectors/pluginRuntime';
import { executeFreeConnector, type ExecutionResult } from '../data/connectorExecution';
import { realConnectorSinks } from '../data/connectorSinks';

/**
 * コネクター / 自動化ページ。
 *
 * 認証不要 (無料) のローカル連携カタログ (`shared/connectors/freeConnectors`) と、
 * それを束ねた即使えるプラグイン (`shared/connectors/pluginCatalog`) を一覧表示し、
 * 純ロジックの `planConnectorRun` でサンプル入力から送信ペイロードを **ドライラン**
 * (実送信せず試算) する。実際の送信はアダプタ層の役割で、本画面は宣言と計画の可視化。
 */

/** 各コネクターのドライラン用サンプル入力 (source レコード)。 */
const SAMPLES: Record<string, Record<string, unknown>> = {
  'stocks-to-storage-export': { symbol: '7203', price: 2800, name: 'トヨタ' },
  'emotions-to-library-export': { date: '2026-06-10', score: 72, note: '集中できた' },
  'security-to-storage-export': { check: 'tls-cert', status: 'ok', severity: 'low' },
  'sales-to-storage-export': { month: '2026-05', revenue: 1_500_000, channel: 'shopify' },
  'business-to-library-export': { kpiName: 'NRR', score: 118, period: '2026Q2' },
  'teamradar-to-storage-export': { member: 'alice', load: 0.8, status: 'busy' },
  'overview-to-storage-export': { metric: 'cash', value: 8_200_000, unit: 'JPY' },
  'kpi-to-library-record': { metric: 'MRR', value: 120_000, period: 'monthly' },
  'quality-to-library-record': { suite: 'unit', passRate: 100, note: '5112 件 green' },
  'tax-to-library-record': { taxType: '所得税', amount: 320_000, year: '2026' },
};

const CAPABILITY_LABEL: Record<string, string> = {
  export: '書き出し (export)',
  record: '記録 (record)',
  notify: '通知 (notify)',
  sync: '同期 (sync)',
};

const codeBox: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
  margin: 0,
};

export function ConnectorsPage() {
  const { source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'connectors',
    SNAPSHOT.connectors,
  );

  const [selectedId, setSelectedId] = useState(FREE_CONNECTORS[0]?.id ?? '');
  // 実実行: 連携ごとの実行中フラグと直近結果。
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, ExecutionResult>>({});

  const runConnector = async (id: string) => {
    setRunningId(id);
    try {
      const result = await executeFreeConnector(
        FREE_CONNECTOR_REGISTRY,
        id,
        SAMPLES[id] ?? {},
        realConnectorSinks,
      );
      setRunResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setRunResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          connectorId: id,
          target: '',
          message: err instanceof Error ? err.message : '実行に失敗しました。',
        },
      }));
    } finally {
      setRunningId(null);
    }
  };

  const plan = useMemo(() => {
    const sample = SAMPLES[selectedId] ?? {};
    return planConnectorRun(FREE_CONNECTOR_REGISTRY, selectedId, sample);
  }, [selectedId]);

  const sampleInput = SAMPLES[selectedId] ?? {};

  // プラグインごとの hook ディスパッチ計画 (各プラグインの全 hook を展開)。
  const pluginPlans = useMemo(
    () =>
      PLUGIN_CATALOG.map((p) => ({
        plugin: p,
        steps: p.hooks.flatMap((h) => resolveHookPlan({ byId: new Map(), all: [p] }, h)),
      })),
    [],
  );

  const totalSteps = pluginPlans.reduce((n, pp) => n + pp.steps.length, 0);
  const permittedSteps = pluginPlans.reduce(
    (n, pp) => n + pp.steps.filter((s) => s.permitted).length,
    0,
  );

  return (
    <div>
      <StatusBar
        serviceId="connectors"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            コネクター / 自動化 · 無料コネクター {FREE_CONNECTORS.length} 種 · プラグイン{' '}
            {PLUGIN_CATALOG.length} 種
          </>
        }
      />

      <Section title="概要" count={3}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 4 }}>
          <Stat label="無料コネクター" value={`${FREE_CONNECTORS.length} 種`} />
          <Stat label="即使えるプラグイン" value={`${PLUGIN_CATALOG.length} 種`} />
          <Stat label="実行可能な手順 (permitted)" value={`${permittedSteps} / ${totalSteps}`} positive={permittedSteps === totalSteps} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 10, lineHeight: 1.6 }}>
          いずれも <strong>認証不要 (無料)</strong> のローカル連携です。ストレージ/ライブラリへの
          書き出し・記録のみを行い、外部サービスへの送信やトークンは必要としません。下の
          ドライランは純ロジックの計画器で <strong>実送信せず</strong> 送信ペイロードを試算します。
        </p>
      </Section>

      {/* ドライラン */}
      <Section title="ドライラン (送信ペイロードの試算)">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
          <span>コネクター</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="ドライラン対象のコネクター"
            style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '4px 6px', fontSize: 13 }}
          >
            {FREE_CONNECTORS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 6 }}>
              入力 (source: {plan.sourceService})
            </div>
            <pre style={codeBox}>{JSON.stringify(sampleInput, null, 2)}</pre>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 6 }}>
              計画ペイロード (target: {plan.targetService} · {CAPABILITY_LABEL[plan.capability] ?? plan.capability})
            </div>
            <pre style={codeBox}>{JSON.stringify(plan.payload, null, 2)}</pre>
          </div>
        </div>
      </Section>

      {/* コネクター・カタログ */}
      <Section title="無料コネクター一覧 (実実行できます)" count={FREE_CONNECTORS.length}>
        <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: '0 0 10px', lineHeight: 1.6 }}>
          各行の <strong>▶ 実行</strong> で、サンプル入力を実際にローカルへ書き込みます
          （storage → レコードストア / library → ライブラリ。Electron・ブラウザ版とも動作）。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>連携</th>
                <th style={thStyle}>能力</th>
                <th style={thStyle}>説明</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>実行</th>
              </tr>
            </thead>
            <tbody>
              {FREE_CONNECTORS.map((c) => {
                const res = runResults[c.id];
                return (
                  <tr key={c.id}>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{c.id}</td>
                    <td style={tdStyle}>{c.sourceService} → {c.targetService}</td>
                    <td style={tdStyle}>{CAPABILITY_LABEL[c.capability] ?? c.capability}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-mute)' }}>{c.description}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => void runConnector(c.id)}
                        disabled={runningId === c.id}
                        aria-label={`${c.id} を実行`}
                      >
                        {runningId === c.id ? '実行中…' : '▶ 実行'}
                      </button>
                      {res ? (
                        <div style={{ fontSize: 10, marginTop: 4, color: res.ok ? 'var(--success)' : 'var(--danger, #ef4444)' }}>
                          {res.ok ? '✅' : '⛔'} {res.message}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 要認証コネクター (外部サービス連携・Microsoft 365 等) */}
      <Section title="要認証コネクター (外部サービス連携)" count={CONNECTOR_CATALOG.length}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>連携</th>
                <th style={thStyle}>能力</th>
                <th style={thStyle}>認証</th>
                <th style={thStyle}>説明</th>
              </tr>
            </thead>
            <tbody>
              {CONNECTOR_CATALOG.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{c.id}</td>
                  <td style={tdStyle}>{c.sourceService} → {c.targetService}</td>
                  <td style={tdStyle}>{CAPABILITY_LABEL[c.capability] ?? c.capability}</td>
                  <td style={{ ...tdStyle, color: c.requiresAuth ? 'var(--text-mute)' : 'var(--success)' }}>
                    {c.requiresAuth ? '要' : '不要'}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-mute)' }}>{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.6 }}>
          ※ これらは各サービスのトークン/OAuth 連携が前提です（例: Microsoft 365 は
          <code>docs/MICROSOFT365_SETUP.md</code> 参照）。実送信はアダプタ層が担います。
        </p>
      </Section>

      {/* プラグイン・カタログ */}
      <Section title="即使えるプラグイン" count={PLUGIN_CATALOG.length}>
        {pluginPlans.map(({ plugin, steps }) => (
          <div
            key={plugin.id}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{plugin.id}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>v{plugin.version}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '6px 0', lineHeight: 1.6 }}>
              hooks: {plugin.hooks.join(', ')} ／ 権限: {plugin.permissions.join(', ')}
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>コネクター</th>
                  <th style={thStyle}>必要権限</th>
                  <th style={thStyle}>実行可否</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s: HookDispatchStep) => (
                  <tr key={s.connectorId}>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{s.connectorId}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{requiredPermissionFor(s.capability)}</td>
                    <td style={{ ...tdStyle, color: s.permitted ? 'var(--success)' : '#ef4444' }}>
                      {s.permitted ? '✅ 実行可' : '⛔ 権限不足'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.6 }}>
          ※ これらは宣言と計画の可視化です。実際の書き出し・記録はアダプタ層が担います
          (本画面は純ロジック `shared/connectors/*` をそのまま描画)。
        </p>
      </Section>
    </div>
  );
}
