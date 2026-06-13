import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

const STATUS_LABEL: Record<'ok' | 'warn' | 'action', string> = {
  ok: '✅ 達成',
  warn: '⚠️ 要注意',
  action: '🔴 要対応',
};

export function DockerPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'docker',
    SNAPSHOT.docker,
  );
  const { engine, containers, images, security, workflows } = data;
  const automatedCount = workflows.filter((w) => w.automated).length;

  return (
    <div>
      <StatusBar
        serviceId="docker"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            Engine v{engine.version} · {engine.containersRunning}/{engine.containersTotal} 稼働 ·{' '}
            {engine.images} イメージ
          </>
        }
      />

      <Section title="Engine 概要">
        <table className="kv-table">
          <tbody>
            <tr>
              <th>rootless モード</th>
              <td>{engine.rootless ? '🔒 有効 (権限分離)' : '無効'}</td>
            </tr>
            <tr>
              <th>GHCR 連携</th>
              <td>{engine.ghcrLinked ? '🔗 GitHub Container Registry' : '未連携'}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="コンテナ" count={containers.length}>
        <table className="kv-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>イメージ</th>
              <th>状態</th>
              <th>CPU%</th>
              <th>メモリMB</th>
              <th>ポート</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.image}</td>
                <td>{c.status === 'running' ? '🟢 running' : c.status}</td>
                <td>{c.cpuPct.toFixed(1)}</td>
                <td>{c.memMb}</td>
                <td>{c.ports}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="イメージと脆弱性スキャン" count={images.length}>
        <table className="kv-table">
          <thead>
            <tr>
              <th>リポジトリ:タグ</th>
              <th>サイズMB</th>
              <th>Crit</th>
              <th>High</th>
              <th>Med</th>
              <th>Low</th>
              <th>取得元</th>
            </tr>
          </thead>
          <tbody>
            {images.map((img) => (
              <tr key={img.id}>
                <td>
                  {img.repo}:{img.tag}
                </td>
                <td>{img.sizeMb}</td>
                <td>{img.critical}</td>
                <td>{img.high}</td>
                <td>{img.medium}</td>
                <td>{img.low}</td>
                <td>{img.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="セキュリティ (GitHub 連携)" count={security.length}>
        <ul className="check-list">
          {security.map((c) => (
            <li key={c.id}>
              <strong>{STATUS_LABEL[c.status]}</strong> {c.item}
              <div className="muted">{c.detail}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="業務効率化ワークフロー" count={workflows.length}>
        <div className="muted">
          {automatedCount} / {workflows.length} 件を自動化済み
        </div>
        <ul className="check-list">
          {workflows.map((w) => (
            <li key={w.id}>
              <strong>{w.automated ? '⚙️ 自動' : '✋ 手動'}</strong> {w.name}
              <div className="muted">{w.description}</div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
