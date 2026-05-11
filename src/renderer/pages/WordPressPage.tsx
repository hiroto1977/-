import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';

export function WordPressPage() {
  const { sites } = SNAPSHOT.wordpress;

  return (
    <div>
      <StatusBar who={<>WordPress.com アカウント · 所有サイト {sites.length}</>} />

      <Section title="Sites" count={sites.length}>
        <DataList
          items={sites.map((site) => ({
            key: String(site.blogId),
            title: site.name,
            meta: `${site.url} · platform: ${site.platform} · 最終更新 ${site.lastUpdated}`,
            badge: site.paidPlan ? 'paid' : 'free',
            href: site.url,
          }))}
        />
      </Section>

      <Section title="MCP Access">
        <div className="empty">
          すべてのサイトが free プラン（mcp_access: <code>wpcom_paid_plan_required</code>）。
          site 単位の MCP ツール (投稿作成・サイトエディタ等) を使うには WordPress.com 有料プランへのアップグレードが必要。
        </div>
      </Section>
    </div>
  );
}
