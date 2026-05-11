import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

export function GithubPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'github',
    SNAPSHOT.github,
  );
  const { user, pullRequests } = data;

  return (
    <div>
      <StatusBar
        serviceId="github"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        avatarUrl={user.avatarUrl}
        who={
          <>
            <strong>@{user.login}</strong> · {user.name}
            {user.company ? `（${user.company}）` : ''} · public repos {user.publicRepos}
          </>
        }
        tokenSetup={{ label: 'PAT を設定', placeholder: 'ghp_… (repo, read:user)' }}
      />

      <Section title="Pull Requests" count={pullRequests.length}>
        <DataList
          items={pullRequests.map((pr) => ({
            key: String(pr.number),
            title: `#${pr.number} ${pr.title}`,
            meta: `${pr.state}${pr.draft ? ' · draft' : ''} · ${pr.head} → ${pr.base} · 更新 ${pr.updatedAt.slice(0, 10)}`,
            badge: pr.draft ? 'draft' : pr.state,
            href: pr.htmlUrl,
          }))}
        />
      </Section>
    </div>
  );
}
