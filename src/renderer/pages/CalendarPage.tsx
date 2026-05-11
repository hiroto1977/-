import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

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

export function CalendarPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'calendar',
    SNAPSHOT.calendar,
  );
  const { calendars, events } = data;

  return (
    <div>
      <StatusBar
        serviceId="calendar"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Google Calendar · {calendars.length} カレンダー · {events.length} 件の予定</>}
      />

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
    </div>
  );
}
