import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';

export function GithubPage() {
  const { user, pullRequests } = SNAPSHOT.github;

  return (
    <div>
      <StatusBar
        avatarUrl={user.avatarUrl}
        who={
          <>
            <strong>@{user.login}</strong> · {user.name}（{user.company}）· public repos {user.publicRepos}
          </>
        }
        right={
          <button onClick={() => window.serviceHub?.openExternal(user.profileUrl)}>
            プロフィール
          </button>
        }
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
