import type { ReactNode } from 'react';

interface Props {
  intro: string;
  status?: 'connected' | 'mock' | 'unconfigured';
  features: { title: string; description: string; action?: string; href?: string }[];
  children?: ReactNode;
}

export function ServicePage({ intro, status = 'mock', features, children }: Props) {
  const badgeText =
    status === 'connected' ? 'Connected'
    : status === 'unconfigured' ? 'Not configured'
    : 'Mock data';
  const badgeClass = status === 'unconfigured' ? 'badge warn' : 'badge';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span className={badgeClass}>{badgeText}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{intro}</span>
      </div>

      <h2 className="section-title">Features</h2>
      <div className="page-grid">
        {features.map((f) => (
          <article key={f.title} className="card">
            <h3>{f.title}</h3>
            <p>{f.description}</p>
            <div className="actions">
              {f.href ? (
                <button
                  onClick={() => window.serviceHub?.openExternal(f.href!)}
                >
                  {f.action ?? 'Open docs'}
                </button>
              ) : (
                <button disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  {f.action ?? 'Coming soon'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {children ? <div style={{ marginTop: 24 }}>{children}</div> : null}
    </div>
  );
}
