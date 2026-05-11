import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function NotionPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'notion',
    SNAPSHOT.notion,
  );
  const { teams, note, pages } = data;

  return (
    <div>
      <StatusBar
        serviceId="notion"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Notion · ページ {pages.length} · チームスペース {teams.length}</>}
        tokenSetup={{ label: 'インテグレーショントークン', placeholder: 'secret_…' }}
      />

      {pages.length > 0 ? (
        <Section title="Recent Pages" count={pages.length}>
          <DataList
            items={pages.map((p) => ({
              key: p.id,
              title: p.title,
              meta: `${p.kind} · 更新 ${p.lastEditedTime.slice(0, 10)}`,
              href: p.url,
            }))}
          />
        </Section>
      ) : (
        <Section title="Teamspaces">
          <div className="empty">
            {note}
            <br />
            インテグレーションを Notion ページに招待し、トークンを設定すると一覧が表示されます。
          </div>
        </Section>
      )}

      <Section title="Quick Actions">
        <div className="page-grid">
          <article className="card">
            <h3>新規ページ作成</h3>
            <p>テンプレートまたはホワイトページから作成。</p>
            <div className="actions">
              <button onClick={() => window.serviceHub?.openExternal('https://www.notion.so/')}>
                Notion を開く
              </button>
            </div>
          </article>
        </div>
      </Section>
    </div>
  );
}
