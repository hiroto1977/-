import { useEffect, useState } from 'react';
import { SERVICES, type ServiceId } from './services';

export function App() {
  const [activeId, setActiveId] = useState<ServiceId>(SERVICES[0]!.id);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    window.serviceHub?.getVersion().then(setVersion).catch(() => undefined);
  }, []);

  const active = SERVICES.find((s) => s.id === activeId)!;
  const PageComponent = active.page;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">Service Hub</div>
        <nav className="sidebar-nav">
          {SERVICES.map((service) => (
            <button
              key={service.id}
              className={`sidebar-item ${service.id === activeId ? 'active' : ''}`}
              data-service-id={service.id}
              onClick={() => setActiveId(service.id)}
            >
              <span className="icon">{service.icon}</span>
              <span>{service.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {version ? `v${version}` : 'v0.1.0'} · skeleton
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1>{active.label}</h1>
          <span className="description">{active.description}</span>
        </header>
        <section className="content">
          <PageComponent />
        </section>
      </main>
    </div>
  );
}
