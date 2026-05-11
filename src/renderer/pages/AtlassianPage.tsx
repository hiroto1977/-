import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function AtlassianPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'atlassian',
    SNAPSHOT.atlassian,
  );
  const { sites, jiraProjects } = data;
  const site = sites[0];

  return (
    <div>
      <StatusBar
        serviceId="atlassian"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          site ? (
            <>
              <strong>{site.name}</strong>
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{site.url}</span>
            </>
          ) : (
            'no Atlassian site'
          )
        }
        right={
          site ? (
            <button onClick={() => window.serviceHub?.openExternal(site.url)}>サイトを開く</button>
          ) : null
        }
        tokenSetup={{
          label: '認証情報 (JSON)',
          placeholder: '{"email":"you@x.com","token":"...","site":"https://x.atlassian.net"}',
        }}
      />

      <Section title="Jira Projects" count={jiraProjects.length}>
        <DataList
          items={jiraProjects.map((p) => ({
            key: p.key,
            title: `${p.key} · ${p.name}`,
            meta: `${p.projectTypeKey} · ${p.style}`,
            href: site ? `${site.url}/jira/projects/${p.key}` : undefined,
          }))}
        />
      </Section>

      <Section title="Confluence & Compass">
        <div className="empty">
          現在のスコープは <code>read:jira-work</code> / <code>write:jira-work</code> のみ。
          Confluence・Compass を使うにはスコープを追加して再接続が必要。
        </div>
      </Section>
    </div>
  );
}
