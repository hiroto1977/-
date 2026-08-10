import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

/**
 * Cursor — AI コードエディタのチーム管理。
 *
 * Admin API から取れるのは**チーム全体の集計**であって、誰が何を書いたかではない。
 * 個人の生産性を測る画面にしないため、行数や受入率は日ごとの推移として並べ、
 * メンバー単位で出すのは席（role）と支出だけにしてある。
 */
export function CursorPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'cursor',
    SNAPSHOT.cursor,
  );
  const { members, usage, spend, totals } = data;
  const usd = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div>
      <StatusBar
        serviceId="cursor"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Cursor · {totals.members} 名 / 稼働 {totals.activeDays} 日 / {usd(totals.spendUsd)}</>}
        tokenSetup={{
          label: 'Admin API キー',
          placeholder: 'cursor.com/dashboard → Settings → Cursor Admin API Keys',
        }}
      />

      <Section title="メンバー" count={members.length}>
        <DataList
          items={members.map((m) => ({
            key: m.email,
            title: m.name || m.email,
            meta: m.email,
            badge: m.role,
          }))}
          empty="メンバーを取得できていません。Admin API キーはチーム管理者のみ発行できます。"
        />
      </Section>

      <Section title="日次の利用状況" count={usage.length}>
        <DataList
          items={usage.map((d) => ({
            key: d.date || String(Math.random()),
            title: `${d.date || '日付不明'} ${d.active ? '' : '（稼働なし）'}`,
            meta: d.active
              ? `追加 ${d.linesAdded.toLocaleString('ja-JP')} 行 / 採用 ${d.linesAccepted.toLocaleString('ja-JP')} 行`
                + ` · Tab ${d.tabsAccepted}/${d.tabsShown} · リクエスト ${d.requests}`
                + (d.model ? ` · ${d.model}` : '')
              : 'この日はチームの誰も使っていません',
            badge: d.acceptRate === null
              ? '—'
              : `${d.acceptRate}%${d.overCounted ? ' ⚠️' : ''}`,
          }))}
          empty="利用状況を取得できていません。"
        />
      </Section>

      {usage.some((d) => d.overCounted) && (
        <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '0 0 12px' }}>
          ⚠️ 受入率が 100% を超えた日があります。Cursor 側の集計で採用行が総追加行を上回ることがあり、
          この画面はその値を丸めずそのまま出しています（率だけを見て判断しないでください）。
        </div>
      )}

      <Section title="今月の支出" count={spend.length}>
        <DataList
          items={spend.map((r) => ({
            key: r.email,
            title: r.name || r.email,
            meta: `${r.email} · 高速リクエスト ${r.fastPremiumRequests.toLocaleString('ja-JP')} 回`
              + (r.hardLimitUsd === null ? '' : ` · 上限 ${usd(r.hardLimitUsd)}`),
            badge: usd(r.spendUsd),
          }))}
          empty="支出を取得できていません。"
        />
      </Section>

      <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
        金額は Cursor の請求通貨（米ドル）のまま表示しています。為替レートを当てて円に換算すると、
        いつの何のレートで換算したのかが画面から分からなくなるため、換算していません。
      </div>
    </div>
  );
}
