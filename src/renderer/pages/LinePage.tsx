import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import {
  lineAccountTitle,
  lineChatModeText,
  lineIntakeNote,
  lineQuotaText,
  lineRemainingText,
  lineUsageText,
} from '../../shared/api/line';

/**
 * LINE 公式アカウント —— アカウントの情報と、今月の配信数を**読むだけ**の画面 (2026-11-18)。
 *
 * 鍵を登録すると実データに切り替わる。登録するまでは同梱の見本を出す (バッジがそう名乗る)。
 * メッセージの送信・友だちの一覧やプロフィールの照会は、この画面にもアプリのどこにも無い。
 *
 * - 配信数・上限は「0 通」「上限なし」と「読めません」を言い分ける (どれも空欄にしない)。
 * - 残りの通数は、上限と配信数の両方が読めたときだけ数を出す。
 * - 読めなかった物が在れば、⚠ で名指しする。
 * - ブラウザ版はプロキシを通して読む。押す前にそう述べる (デスクトップ版は直接つなぐので述べない。
 *   実行形態がまだ分からない間も述べない —— `useBuildKind` と同じ天秤)。
 */
export function LinePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'line',
    SNAPSHOT.line,
  );
  const note = lineIntakeNote(data);
  const kind = useBuildKind();

  return (
    <div data-line-page>
      <StatusBar
        serviceId="line"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            LINE · {lineAccountTitle(data.displayName)}
            {data.basicId === '' ? '' : ` · ${data.basicId}`}
          </>
        }
        tokenSetup={{ label: 'チャネルアクセストークン', placeholder: '長期のチャネルアクセストークン' }}
      />

      <p data-line-key-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        登録する鍵は、LINE Developers コンソールの Messaging API の設定で発行する「チャネルアクセストークン（長期）」です。
        この鍵は友だちへメッセージを送る権限も持つので、ほかの人に渡さないでください。このアプリが LINE へ送るのは、
        アカウントの情報・配信の上限・今月の配信数の 3 つの照会だけで、メッセージの送信や友だちの情報の照会はしません。
      </p>

      {kind === 'browser' && (
        <p data-line-proxy-note role="note" style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          ブラウザ版で実データを読むには、プロキシ (Cloudflare Worker) の登録が要ります —— 設定ページの「BYO プロキシ」で登録してください。
          プロキシの許可リスト (UPSTREAM_ALLOWLIST) に api.line.me を足す必要があります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-line-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      <Section title="今月の配信" count={3}>
        <DataList
          items={[
            { key: 'quota', title: '配信の上限', meta: lineQuotaText(data) },
            { key: 'usage', title: '今月の配信数', meta: lineUsageText(data.usage) },
            { key: 'remaining', title: '残り', meta: lineRemainingText(data) },
          ]}
        />
      </Section>

      <Section title="アカウント" count={1}>
        <DataList
          items={[{ key: 'chat-mode', title: '応答モード', meta: lineChatModeText(data.chatMode) }]}
        />
      </Section>
    </div>
  );
}
