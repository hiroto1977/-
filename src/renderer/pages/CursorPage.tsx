import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { cursorIntakeNote, type CursorSectionState } from '../../shared/api/cursor';

/**
 * Cursor — AI コードエディタのチーム管理。
 *
 * Admin API から取れるのは**チーム全体の集計**であって、誰が何を書いたかではない。
 * 個人の生産性を測る画面にしないため、行数や受入率は日ごとの推移として並べ、
 * メンバー単位で出すのは席（role）と支出だけにしてある。
 *
 * **「0」と「分からない」を書き分ける** (2026-09-14 · パス 263)。以前は
 * 応答が `null` でも `{}` でもスカラーでも、見出しに
 * `Cursor · 0 名 / 稼働 0 日 / $0.00` を**緑のライブ表示で**刷っていた ——
 * かつ本当に 0 名のチームには「取得できていません」と言っていた (両方向に嘘)。
 * 素性は `snapshot.intake` が持ち、数字は読めなければ `null` で来る。
 */
export function CursorPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'cursor',
    SNAPSHOT.cursor,
  );
  const { members, usage, spend, totals, intake } = data;
  const usd = (n: number) => `$${n.toFixed(2)}`;
  /** 読めなかった数は「0」ではなく「—」。 */
  const count = (n: number | null) => (n === null ? '—' : String(n));
  const money = (n: number | null) => (n === null ? '—' : usd(n));
  const note = cursorIntakeNote(intake);
  /** 節が空のときの文。**答えとして空だったのか、読めなかったのか**で分ける。 */
  const emptyOf = (state: CursorSectionState, answered: string, unread: string) =>
    state === 'read' ? answered : unread;

  return (
    <div>
      <StatusBar
        serviceId="cursor"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            Cursor · {count(totals.members)} 名 / 稼働 {count(totals.activeDays)} 日 /{' '}
            {money(totals.spendUsd)}
          </>
        }
        tokenSetup={{
          label: 'Admin API キー',
          placeholder: 'cursor.com/dashboard → Settings → Cursor Admin API Keys',
        }}
      />

      {note !== null && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      <Section title="メンバー" count={members.length}>
        <DataList
          items={members.map((m) => ({
            key: m.email,
            title: m.name || m.email,
            meta: m.email,
            badge: m.role,
          }))}
          empty={emptyOf(
            intake.members,
            'このチームにメンバーは登録されていません（Admin API が 0 名と答えました）。',
            'メンバーの応答を読めませんでした。Admin API キーはチーム管理者のみ発行できます。',
          )}
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
          empty={emptyOf(
            intake.usage,
            'この期間にチームの利用はありませんでした（Admin API が 0 日と答えました）。',
            '日次の利用状況の応答を読めませんでした。',
          )}
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
              + (r.hardLimitUsd === null ? '' : ` · 上限 ${usd(r.hardLimitUsd)}`)
              // 金額が読めなかった行はその理由を行に書く ($0.00 と並べない)。
              + (r.spendUsd === null ? ' · 金額を読めませんでした' : ''),
            badge: money(r.spendUsd),
          }))}
          empty={emptyOf(
            intake.spend,
            '今月の支出はまだありません（Admin API が 0 件と答えました）。',
            '支出の応答を読めませんでした。',
          )}
        />
      </Section>

      <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
        金額は Cursor の請求通貨（米ドル）のまま表示しています。為替レートを当てて円に換算すると、
        いつの何のレートで換算したのかが画面から分からなくなるため、換算していません。
      </div>
    </div>
  );
}
