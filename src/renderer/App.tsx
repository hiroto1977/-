import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICES, CATEGORY_LABEL, type ServiceCategory, type ServiceId } from './services';
import { isServiceId } from '../shared/serviceId';
import { filterServices } from './sidebarFilter';
import { LockScreen } from './security/LockScreen';
import { getVault } from './security/vault';
import { startAutoLock } from './security/autoLock';

// True when the renderer is loaded in a plain browser (no Electron preload).
// The Electron preload sets serviceHub via contextBridge — if `getVersion`
// returns the web shim's '0.1.0-web', we're in the browser.
async function detectBrowserMode(): Promise<boolean> {
  try {
    const v = await window.serviceHub.getVersion();
    return v === '0.1.0-web';
  } catch {
    return false;
  }
}

const COLLAPSED_BY_DEFAULT: ReadonlySet<ServiceCategory> = new Set<ServiceCategory>([
  'tools',
  'integrations',
]);

export function App() {
  const [activeId, setActiveId] = useState<ServiceId>(SERVICES[0]!.id);
  const [version, setVersion] = useState<string>('');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState<Record<ServiceCategory, boolean>>({
    featured: false,
    tools: COLLAPSED_BY_DEFAULT.has('tools'),
    integrations: COLLAPSED_BY_DEFAULT.has('integrations'),
  });

  // Browser-mode lock state. Initially `null` (unknown) — once we detect
  // browser mode and Vault status, switch to a concrete boolean.
  const [vaultUnlocked, setVaultUnlocked] = useState<boolean | null>(null);
  const [browserMode, setBrowserMode] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectBrowserMode().then(async (web) => {
      if (cancelled) return;
      setBrowserMode(web);
      if (web) {
        const s = await getVault().status();
        if (!cancelled) setVaultUnlocked(s === 'unlocked');
      } else {
        setVaultUnlocked(true); // Electron: skip lock screen
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Start auto-lock when entering unlocked state (browser mode only).
  useEffect(() => {
    if (!browserMode || !vaultUnlocked) return undefined;
    const handle = startAutoLock({
      onLock: () => {
        getVault().lock();
        setVaultUnlocked(false);
      },
    });
    return () => handle.dispose();
  }, [browserMode, vaultUnlocked]);

  useEffect(() => {
    window.serviceHub?.getVersion().then(setVersion).catch(() => undefined);
  }, []);

  // Loosely-coupled navigation: any page can dispatch a CustomEvent to
  // jump to another service without prop-drilling a callback. The Home
  // page uses this for "細かく編集する" links.
  useEffect(() => {
    function onNavigate(e: Event) {
      const target = (e as CustomEvent<unknown>).detail;
      if (isServiceId(target)) {
        setActiveId(target);
        // Auto-expand the group containing the destination so it's visible.
        const def = SERVICES.find((s) => s.id === target);
        if (def) {
          setCollapsed((prev) => ({ ...prev, [def.category]: false }));
        }
      }
    }
    window.addEventListener('servicehub:navigate', onNavigate);
    return () => window.removeEventListener('servicehub:navigate', onNavigate);
  }, []);

  // Cmd/Ctrl-K でサイドバー検索にフォーカス (どの画面からでも)。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const grouped = useMemo(() => {
    const out: Record<ServiceCategory, typeof SERVICES> = {
      featured: [],
      tools: [],
      integrations: [],
    };
    for (const s of SERVICES) out[s.category].push(s);
    return out;
  }, []);

  // 検索クエリでの絞り込み結果。null = 非検索 (カテゴリ別表示)。
  const filtered = useMemo(() => filterServices(SERVICES, query), [query]);

  function toggle(cat: ServiceCategory) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  /** サービスを選択し、属するカテゴリを展開する。 */
  function selectService(id: ServiceId) {
    setActiveId(id);
    const def = SERVICES.find((s) => s.id === id);
    if (def) setCollapsed((prev) => ({ ...prev, [def.category]: false }));
  }

  /** 検索ボックスのキー操作: Enter=先頭ヒット選択、Escape=クリア。 */
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && filtered && filtered.length > 0) {
      selectService(filtered[0]!.id);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  }

  // Browser-mode + locked → show only the lock screen.
  if (browserMode === null || vaultUnlocked === null) {
    return <div style={{ padding: 24, color: 'var(--text-mute)' }}>読み込み中…</div>;
  }
  if (browserMode && !vaultUnlocked) {
    return <LockScreen onUnlocked={() => setVaultUnlocked(true)} />;
  }

  const active = SERVICES.find((s) => s.id === activeId)!;
  const PageComponent = active.page;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">Service Hub</div>
        <div className="sidebar-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="サービスを検索 (⌘/Ctrl-K)"
            aria-label="サービスを検索"
            className="sidebar-search-input"
          />
        </div>
        <nav className="sidebar-nav" aria-label="サービス一覧">
          {filtered !== null ? (
            filtered.length === 0 ? (
              <div className="sidebar-empty">「{query.trim()}」に一致するサービスはありません</div>
            ) : (
              filtered.map((service) => (
                <button
                  key={service.id}
                  className={`sidebar-item ${service.id === activeId ? 'active' : ''}`}
                  data-service-id={service.id}
                  onClick={() => selectService(service.id)}
                >
                  <span className="icon">{service.icon}</span>
                  <span>{service.label}</span>
                </button>
              ))
            )
          ) : (
          (['featured', 'tools', 'integrations'] as const).map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const isCollapsed = collapsed[cat];
            return (
              <div key={cat} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={() => toggle(cat)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '4px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-mute)',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginTop: 4,
                  }}
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? '▶' : '▼'} {CATEGORY_LABEL[cat]} ({items.length})
                </button>
                {!isCollapsed &&
                  items.map((service) => (
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
              </div>
            );
          })
          )}
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
