import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

const STATUS_LABEL: Record<'ok' | 'warn' | 'action', string> = {
  ok: '✅ 達成',
  warn: '⚠️ 要注意',
  action: '🔴 要対応',
};

export function ObsidianPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'obsidian',
    SNAPSHOT.obsidian,
  );
  const { vault, notes, security, workflows } = data;
  const automatedCount = workflows.filter((w) => w.automated).length;

  return (
    <div>
      <StatusBar
        serviceId="obsidian"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            {vault.name} · {vault.noteCount} ノート · {vault.totalWords.toLocaleString()} words
          </>
        }
      />

      <Section title="Vault 概要">
        <table className="kv-table">
          <tbody>
            <tr>
              <th>パス</th>
              <td>{vault.path}</td>
            </tr>
            <tr>
              <th>GitHub 連携</th>
              <td>{vault.gitRemote ? `🔗 ${vault.gitRemote}` : '未連携'}</td>
            </tr>
            <tr>
              <th>最終同期</th>
              <td>{vault.lastSyncIso}</td>
            </tr>
            <tr>
              <th>保存時暗号化</th>
              <td>{vault.encrypted ? '🔒 有効' : '無効'}</td>
            </tr>
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

      <Section title="最近のノート" count={notes.length}>
        <table className="kv-table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>フォルダ</th>
              <th>タグ</th>
              <th>更新</th>
              <th>語数</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <td>{n.title}</td>
                <td>{n.folder}</td>
                <td>{n.tags.join(', ')}</td>
                <td>{n.updatedIso.slice(0, 10)}</td>
                <td>{n.words.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
