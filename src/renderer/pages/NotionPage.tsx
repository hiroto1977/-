import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';

export function NotionPage() {
  const { teams, note } = SNAPSHOT.notion;

  return (
    <div>
      <StatusBar
        status="connected"
        who={<>Notion アカウント接続済 · チームスペース {teams.length}</>}
      />

      <Section title="Teamspaces" count={teams.length}>
        <div className="empty">
          {note}
          <br />
          ページを作成すると <code>notion-search</code> やこの一覧に反映されます。
        </div>
      </Section>

      <Section title="Quick Actions">
        <div className="page-grid">
          <article className="card">
            <h3>新規ページ作成</h3>
            <p>テンプレートまたはホワイトページから作成（<code>notion-create-pages</code>）。</p>
            <div className="actions">
              <button onClick={() => window.serviceHub?.openExternal('https://www.notion.so/')}>
                Notion を開く
              </button>
            </div>
          </article>
          <article className="card">
            <h3>ワークスペース検索</h3>
            <p>Slack / Drive / GitHub / Jira / Linear など接続ソースを横断検索。</p>
            <div className="actions">
              <button disabled style={{ opacity: 0.5 }}>
                検索 UI（未実装）
              </button>
            </div>
          </article>
        </div>
      </Section>
    </div>
  );
}
