import type { ReactNode } from 'react';

interface Props {
  who: ReactNode;
  status?: 'connected' | 'mock' | 'unconfigured';
  avatarUrl?: string;
  right?: ReactNode;
}

export function StatusBar({ who, status = 'connected', avatarUrl, right }: Props) {
  const text =
    status === 'connected' ? 'Connected'
    : status === 'unconfigured' ? 'Not configured'
    : 'Mock';
  const cls = status === 'connected' ? 'badge ok'
    : status === 'unconfigured' ? 'badge warn'
    : 'badge';

  return (
    <div className="status-bar">
      <span className={cls}>{text}</span>
      <div className="who">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
      </div>
      {right}
    </div>
  );
}

interface SectionProps {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, count, action, children }: SectionProps) {
  return (
    <section className="data-section">
      <header className="data-section-header">
        <h2>{title}</h2>
        <span className="count">
          {typeof count === 'number' ? `${count} 件` : null} {action}
        </span>
      </header>
      {children}
    </section>
  );
}
