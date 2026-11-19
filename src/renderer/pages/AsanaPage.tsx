import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import { asanaDueText, asanaIntakeNote, asanaScopeNote, asanaTaskTitle } from '../../shared/api/asana';

/**
 * Asana (タスク管理) —— 自分に割り当てられた未完了のタスクを**読むだけ**の画面 (2026-11-18)。
 *
 * 鍵を登録すると実データに切り替わる。登録するまでは同梱の見本を出す (バッジがそう名乗る)。
 * タスクの作成・完了・コメントなどの書き込みは、この画面にもアプリのどこにも無い。
 *
 * - 期限は「期限なし」と「期限が読めません」を言い分ける (どちらも空欄にしない)。
 * - 一覧そのものが読めなかったときは、「0 件」と混ぜずに ⚠ で述べる。
 * - 見ていない範囲 (2 つ目以降のワークスペース・21 件目以降) が在れば、そう述べる。
 * - ブラウザ版はプロキシを通して読む。押す前にそう述べる (デスクトップ版は直接つなぐので述べない。
 *   実行形態がまだ分からない間も述べない —— `useBuildKind` と同じ天秤)。
 */
export function AsanaPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'asana',
    SNAPSHOT.asana,
  );
  const { tasks, userName, workspaceName } = data;
  const note = asanaIntakeNote(data);
  const scope = asanaScopeNote(data);
  const kind = useBuildKind();

  return (
    <div data-asana-page>
      <StatusBar
        serviceId="asana"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            Asana{userName === '' ? '' : ` · ${userName}`}
            {workspaceName === '' ? '' : ` · ${workspaceName}`} · 未完了 {tasks.length} 件
          </>
        }
        tokenSetup={{ label: '個人アクセストークン', placeholder: '2/…' }}
      />

      <p data-asana-key-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        登録する鍵は、Asana の開発者コンソールで作る「個人アクセストークン」です。この鍵はあなたの Asana の権限を広く持つので、
        ほかの人に渡さないでください。このアプリが Asana へ送るのは、あなたの名前とワークスペースの照会と、
        あなたに割り当てられた未完了のタスクの照会だけで、タスクの作成や変更はしません。
      </p>

      {kind === 'browser' && (
        <p data-asana-proxy-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          ブラウザ版で実データを読むには、プロキシ (Cloudflare Worker) の登録が要ります —— 設定ページの「BYO プロキシ」で登録してください。
          プロキシの許可リスト (UPSTREAM_ALLOWLIST) に app.asana.com を足す必要があります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-asana-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      {scope !== null && (
        <p data-asana-scope-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {scope}
        </p>
      )}

      <Section title="未完了のタスク (自分の担当)" count={tasks.length}>
        <DataList
          items={tasks.map((t, i) => ({
            key: t.id === '' ? `row-${i}` : t.id,
            title: asanaTaskTitle(t.name),
            meta: asanaDueText(t),
          }))}
          empty="未完了のタスクはありません。"
        />
      </Section>
    </div>
  );
}
