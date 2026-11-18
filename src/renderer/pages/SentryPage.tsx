import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import { sentryIntakeNote, sentryIssueMeta, sentryIssueTitle, sentryScopeNote } from '../../shared/api/sentry';

/**
 * Sentry (エラー監視) —— 未解決の問題を**読むだけ**の画面 (2026-11-18)。
 *
 * 鍵を登録すると実データに切り替わる。登録するまでは同梱の見本を出す (バッジがそう名乗る)。
 * 問題の解決・割り当て・削除などの書き込みは、この画面にもアプリのどこにも無い。
 *
 * - 重大度・発生回数・最終発生日は、読めなければそう述べる (空欄や 0 にしない)。
 * - 一覧そのものが読めなかったとき・読める組織が無かったときは、「0 件」と混ぜずに ⚠ で述べる。
 * - 組織が 2 つ以上あるとき・21 件目以降が在るときは、見ていない分が在ると述べる。
 * - ブラウザ版はプロキシを通して読む。押す前にそう述べる (デスクトップ版は直接つなぐので述べない。
 *   実行形態がまだ分からない間も述べない —— `useBuildKind` と同じ天秤)。
 */
export function SentryPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'sentry',
    SNAPSHOT.sentry,
  );
  const { issues, orgName } = data;
  const note = sentryIntakeNote(data);
  const scope = sentryScopeNote(data);
  const kind = useBuildKind();

  return (
    <div data-sentry-page>
      <StatusBar
        serviceId="sentry"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            Sentry{orgName === '' ? '' : ` · ${orgName}`} · 未解決 {issues.length} 件
          </>
        }
        tokenSetup={{ label: '個人のトークン', placeholder: 'sntryu_…' }}
      />

      <p data-sentry-key-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        登録する鍵は、Sentry の利用者設定で作る「個人のトークン (User Auth Token)」です。権限は読み取りの 2 つ
        (org:read と event:read) だけを選んでください。この鍵はあなたの Sentry の権限を持つので、ほかの人に渡さないでください。
        このアプリが Sentry へ送るのは、組織の一覧と未解決の問題の照会だけで、問題の解決や変更はしません。
        つなぐ先は sentry.io です (自社で動かしている Sentry には対応していません)。
      </p>

      {kind === 'browser' && (
        <p data-sentry-proxy-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          ブラウザ版で実データを読むには、プロキシ (Cloudflare Worker) の登録が要ります —— 設定ページの「BYO プロキシ」で登録してください。
          プロキシの許可リスト (UPSTREAM_ALLOWLIST) に sentry.io を足す必要があります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-sentry-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      {scope !== null && (
        <p data-sentry-scope-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {scope}
        </p>
      )}

      <Section title="未解決の問題" count={issues.length}>
        <DataList
          items={issues.map((issue, i) => ({
            key: issue.shortId === '' ? `row-${i}` : `${issue.shortId}-${i}`,
            title: sentryIssueTitle(issue),
            meta: sentryIssueMeta(issue),
          }))}
          empty="未解決の問題はありません。"
        />
      </Section>
    </div>
  );
}
