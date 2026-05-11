import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';

export function SlackPage() {
  const { channels } = SNAPSHOT.slack;

  return (
    <div>
      <StatusBar who={<>Slack ワークスペース接続済 · チャンネル {channels.length}</>} />

      <Section title="Channels" count={channels.length}>
        <DataList
          items={channels.map((c) => ({
            key: c.id,
            title: `#${c.name}`,
            meta: c.purpose,
            badge: c.isArchived ? 'archived' : 'active',
            href: c.permalink,
          }))}
        />
      </Section>

      <Section title="Quick Actions">
        <div className="page-grid">
          <article className="card">
            <h3>メッセージ送信</h3>
            <p>チャンネル / DM へ送信。下書き保存・スケジュール送信に対応。</p>
            <div className="actions">
              <button disabled style={{ opacity: 0.5 }}>UI 未実装</button>
            </div>
          </article>
          <article className="card">
            <h3>Canvas 作成</h3>
            <p>チャンネル / スタンドアロン / DM 上に Canvas を作成。</p>
            <div className="actions">
              <button disabled style={{ opacity: 0.5 }}>UI 未実装</button>
            </div>
          </article>
        </div>
      </Section>
    </div>
  );
}
