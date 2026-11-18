import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import { linearIntakeNote, linearIssueMeta, linearIssueTitle, linearScopeNote } from '../../shared/api/linear';

/**
 * Linear (課題管理) —— 自分に割り当てられた未完了の課題を**読むだけ**の画面 (2026-11-18)。
 *
 * 鍵を登録すると実データに切り替わる。登録するまでは同梱の見本を出す (バッジがそう名乗る)。
 * 課題の作成・更新・コメントなどの書き込みは、この画面にもアプリのどこにも無い。
 *
 * - 期限は「期限なし」と「期限が読めません」を言い分ける (どちらも空欄にしない)。優先度も同じ。
 * - 一覧そのものが読めなかったとき・Linear が照会を断ったときは、「0 件」と混ぜずに ⚠ で述べる。
 * - 21 件目以降が在れば、そう述べる。
 * - ブラウザ版はプロキシを通して読む。押す前にそう述べる (デスクトップ版は直接つなぐので述べない。
 *   実行形態がまだ分からない間も述べない —— `useBuildKind` と同じ天秤)。
 */
export function LinearPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'linear',
    SNAPSHOT.linear,
  );
  const { issues, userName } = data;
  const note = linearIntakeNote(data);
  const scope = linearScopeNote(data);
  const kind = useBuildKind();

  return (
    <div data-linear-page>
      <StatusBar
        serviceId="linear"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            Linear{userName === '' ? '' : ` · ${userName}`} · 未完了 {issues.length} 件
          </>
        }
        tokenSetup={{ label: '個人の API キー', placeholder: 'lin_api_…' }}
      />

      <p data-linear-key-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        登録する鍵は、Linear の設定で作る「個人の API キー」です。作るときに権限を選べるなら「読み取りだけ」を選んでください。
        この鍵はあなたの Linear の権限を持つので、ほかの人に渡さないでください。このアプリが Linear へ送るのは、
        あなたの名前と、あなたに割り当てられた未完了の課題の照会だけで、課題の作成や変更はしません。
      </p>

      {kind === 'browser' && (
        <p data-linear-proxy-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          ブラウザ版で実データを読むには、プロキシ (Cloudflare Worker) の登録が要ります —— 設定ページの「BYO プロキシ」で登録してください。
          プロキシの許可リスト (UPSTREAM_ALLOWLIST) に api.linear.app を足す必要があります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-linear-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      {scope !== null && (
        <p data-linear-scope-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {scope}
        </p>
      )}

      <Section title="未完了の課題 (自分の担当)" count={issues.length}>
        <DataList
          items={issues.map((issue, i) => ({
            key: issue.identifier === '' ? `row-${i}` : `${issue.identifier}-${i}`,
            title: linearIssueTitle(issue),
            meta: linearIssueMeta(issue),
          }))}
          empty="未完了の課題はありません。"
        />
      </Section>
    </div>
  );
}
