import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import { dateText } from '../../shared/isoDate';
import {
  dropboxIntakeNote,
  dropboxKindLabel,
  dropboxSizeText,
  dropboxUsagePct,
} from '../../shared/api/dropbox';

/**
 * Dropbox —— アカウント・容量・最近のアイテムを**読むだけ**の画面 (2026-11-19)。
 *
 * トークンを登録すると実データに切り替わる。登録するまでは同梱の見本を出す (バッジがそう名乗る)。
 * アップロード・削除・共有リンクの作成などの書き込みは、この画面にもアプリのどこにも無い。
 *
 * - トークンは Dropbox App Console で作る自前アプリのもの。権限は読み取りだけ
 *   (`account_info.read` / `files.metadata.read`) で足りる。
 * - 容量・サイズが読めなかったときは 0 と刷らず「容量不明」と述べる。
 * - 照会そのものが読めなかったときは、「0 件」と混ぜずに ⚠ で述べる。
 * - ブラウザ版はプロキシを通して読む。押す前にそう述べる (デスクトップ版は直接つなぐので述べない)。
 */
export function DropboxPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'dropbox',
    SNAPSHOT.dropbox,
  );
  const { accountName, email, entries } = data;
  const note = dropboxIntakeNote(data);
  const usagePct = dropboxUsagePct(data);
  const kind = useBuildKind();

  return (
    <div data-dropbox-page>
      <StatusBar
        serviceId="dropbox"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            Dropbox · {accountName === '' ? 'アカウント不明' : accountName} · アイテム {entries.length} 件
          </>
        }
        tokenSetup={{ label: 'アクセストークン (読み取り専用)', placeholder: 'sl.… (Dropbox アプリのトークン)' }}
      />

      <p data-dropbox-token-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        トークンは Dropbox App Console (dropbox.com/developers/apps) で自分のアプリを作ると発行できます。
        権限 (Permissions) は account_info.read と files.metadata.read の読み取りだけにしてください。
        このアプリが Dropbox へ送るのはアカウント・容量・最近のアイテムの照会だけで、ファイルの変更はしません。
      </p>

      {kind === 'browser' && (
        <p data-dropbox-proxy-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          ブラウザ版で実データを読むには、プロキシ (Cloudflare Worker) の登録が要ります —— 設定ページの「BYO プロキシ」で登録してください。
          プロキシの許可リスト (UPSTREAM_ALLOWLIST) に api.dropboxapi.com を足す必要があります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-dropbox-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      <Section title="アカウント" count={2}>
        <DataList
          items={[
            { key: 'account', title: accountName === '' ? 'アカウント名不明' : accountName, meta: email === '' ? 'メールアドレス不明' : email },
            {
              key: 'space',
              title: `使用量 ${dropboxSizeText(data.usedBytes)} / ${dropboxSizeText(data.allocatedBytes)}`,
              meta: usagePct === null ? '使用率は不明です' : `使用率 ${usagePct}%`,
            },
          ]}
          empty="アカウント情報を読み取れませんでした。"
        />
      </Section>

      <Section title="最近のアイテム" count={entries.length}>
        <DataList
          items={entries.map((e, i) => ({
            key: e.id === '' ? `row-${i}` : e.id,
            title: e.name === '' ? '名前不明' : e.name,
            meta: `${dateText(e.modified)}${e.sizeBytes === null ? '' : ` · ${dropboxSizeText(e.sizeBytes)}`}`,
            badge: dropboxKindLabel(e.kind),
          }))}
          empty="アイテムはまだありません。"
        />
        {data.hasMore && (
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6 }}>
            ※ ルート直下には他にもアイテムがあります (この画面は先頭だけを表示します)。
          </div>
        )}
      </Section>
    </div>
  );
}
