import { ServicePage } from '../components/ServicePage';

export function CalendarPage() {
  return (
    <ServicePage
      intro="Google Calendar の予定を表示・操作します。"
      features={[
        { title: 'Calendars', description: '所有・購読カレンダーの一覧。' },
        { title: 'Events', description: '今日 / 今週の予定を表示。' },
        { title: 'Create Event', description: '予定の新規作成と更新。' },
        { title: 'Suggest Time', description: '空き時間の提案。' },
        { title: 'RSVP', description: '招待への応答。' },
        {
          title: 'Docs',
          description: 'Google Calendar API ドキュメント。',
          action: 'Open',
          href: 'https://developers.google.com/calendar',
        },
      ]}
    />
  );
}
