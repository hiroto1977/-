import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { GoogleConnectCard } from '../components/GoogleConnectCard';
import { useServiceData } from '../hooks/useServiceData';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

function formatStart(startDate: string, allDay: boolean): string {
  if (allDay) return `${startDate}（終日）`;
  const d = new Date(startDate);
  return d.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "datetime-local" returns "YYYY-MM-DDTHH:mm" in local time. Treat it as
// the local time zone and append :00 for ISO compliance. The Calendar
// API will normalize against the timeZone field we send.
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
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ id: string; htmlLink: string }>(
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
            <input
              placeholder="タイトル"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={inputStyle}
            />
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !summary.trim() || !start || !end}
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
