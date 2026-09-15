import { useState } from 'react';
import { CALENDAR_EVENT_FIELDS } from '../../shared/writeFieldLimits';
import { parseTimestamp } from '../../shared/isoDate';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { GoogleConnectCard } from '../components/GoogleConnectCard';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { useServiceData } from '../hooks/useServiceData';
import type { ActionData } from '../../shared/actionData';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

/**
 * 予定の開始を刷る。**読めない値は「Invalid Date」と刷らない** (パス 185)。
 *
 * `startDate` は取得の側で `e.start.dateTime ?? ''` と倒れるので、時間指定の
 * 予定に `dateTime` が無ければ空文字が届く —— `new Date('')` は例外を投げず、
 * `toLocaleString` が英語で `Invalid Date` を返す。
 */
function formatStart(startDate: string, allDay: boolean): string {
  if (allDay) return `${startDate}（終日）`;
  const d = parseTimestamp(startDate);
  if (d === null) return '開始時刻が読めません';
  return d.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "datetime-local" returns "YYYY-MM-DDTHH:mm" in local time. Treat it as
// the local time zone and append :00 for ISO compliance.
//
// **帯 (timeZone) を送るのはこの画面ではない** (パス 185 で注記を実物に直した)。
// 以前ここは「the timeZone field we send」と書いていたが、payload に入れるのは
// main の `createEvent` / ブラウザ版の `createCalendarEvent` で、どちらも
// `Intl.DateTimeFormat().resolvedOptions().timeZone` (端末の帯) に倒す ——
// 両ビルドで同じ既定である。画面は壁時計の時刻だけを渡す。
function localToIso(local: string): string {
  if (!local) return '';
  return `${local}:00`;
}

export function CalendarPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'calendar',
    SNAPSHOT.calendar,
  );
  const { calendars, events } = data;

  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState('');
  /* 貼り付けを黙って切らない (パス 172 → **全欄へ** パス 183)。天井は台帳から読む。 */
  const summaryOver = charsOverCeiling(summary, CALENDAR_EVENT_FIELDS.summary!.max);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  /*
   * **終了が開始より後でなければ、押す前に断る** (パス 185)。
   *
   * Google Calendar は end <= start を 400 で拒むので、この組では
   * 「押せば必ず失敗する」—— 画面には API の英語の文面だけが出ていた
   * (パス 109 の「必ず失敗する書き込みの承認を求めていた」と同じ形)。
   * 順序は**刷る前に読む** `parseTimestamp` で見る (`datetime-local` は
   * `YYYY-MM-DDTHH:mm` だが、値は state なので綴りを仮定しない)。
   */
  const startAt = parseTimestamp(localToIso(start));
  const endAt = parseTimestamp(localToIso(end));
  const rangeBad =
    startAt !== null && endAt !== null && endAt.getTime() <= startAt.getTime();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'calendar/create-event'>>(
      'calendar',
      'create-event',
      {
        summary: summary.trim(),
        start: localToIso(start),
        end: localToIso(end),
      },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: '作成成功', url: res.data.htmlLink });
      setSummary('');
      // 作った予定は「Upcoming Events」(timeMin=now の 10 件) に入る —— 取り直す (パス 173)。
      refresh();
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="calendar"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Google Calendar · {calendars.length} カレンダー · {events.length} 件の予定</>}
        tokenSetup={{
          label: 'OAuth アクセストークン',
          placeholder: 'ya29.… (calendar.readonly + calendar.events scope)',
        }}
      />

      <GoogleConnectCard serviceId="calendar" onConnected={refresh} />

      <Section title="Calendars" count={calendars.length}>
        <DataList
          items={calendars.map((c) => ({
            key: c.id,
            title: c.summary,
            meta: `${c.id} · ${c.timeZone}`,
          }))}
        />
      </Section>

      <Section title="Upcoming Events" count={events.length}>
        <DataList
          items={events.map((e) => ({
            key: e.id,
            title: e.summary,
            meta: formatStart(e.startDate, e.allDay),
            badge: e.allDay ? '終日' : '時間指定',
          }))}
        />
      </Section>

      <Section
        title="Actions"
        action={
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? '閉じる' : '予定を作成'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            {/* 上限は main / ブラウザ版と同じ台帳から読む (パス 110)。数を写さない。 */}
            <input
              placeholder="タイトル"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={inputStyle}
            />
            <CeilingNotice label="タイトル" value={summary} max={CALENDAR_EVENT_FIELDS.summary!.max} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={inputStyle}
              />
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={inputStyle}
              />
            </div>
            {rangeBad ? (
              <span data-calendar-range-note style={{ color: 'var(--danger)', fontSize: 12 }}>
                終了は開始より後の時刻にしてください (この組は Calendar 側で必ず拒まれます)
              </span>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={
                  submitting || !summary.trim() || !start || !end || summaryOver > 0 || rangeBad
                }
              >
                {submitting ? '作成中…' : '作成'}
              </button>
              {result?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                  {result.message}{' '}
                  {result.url ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.serviceHub?.openExternal(result.url!);
                      }}
                    >
                      開く
                    </a>
                  ) : null}
                </span>
              ) : null}
              {result?.kind === 'error' ? (
                <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                  {result.message}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
