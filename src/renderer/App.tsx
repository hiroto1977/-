import { useEffect, useMemo, useState } from 'react';
import { SERVICES, CATEGORY_LABEL, type ServiceCategory, type ServiceId } from './services';
import { isServiceId } from '../shared/serviceId';
import { LockScreen } from './security/LockScreen';
import { getVault } from './security/vault';
import { startAutoLock } from './security/autoLock';
import { usePlan } from './plan/usePlan';
import {
  PLAN_ORDER,
  PLANS,
  getPlan,
  isServiceUnlocked,
  requiredPlanForServiceIndex,
  type PlanTier,
} from '../shared/plan';

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

// Sidebar-order index per service id. The plan cap (`maxServices`) gates
// services by this position, so the rule has a single, stable ordering.
const SERVICE_ORDER: ReadonlyMap<ServiceId, number> = new Map(
  SERVICES.map((s, i) => [s.id, i]),
);

export function App() {
  const [activeId, setActiveId] = useState<ServiceId>(SERVICES[0]!.id);
  const [version, setVersion] = useState<string>('');
  const { plan, setPlan } = usePlan();
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

  const grouped = useMemo(() => {
    const out: Record<ServiceCategory, typeof SERVICES> = {
      featured: [],
      tools: [],
      integrations: [],
    };
    for (const s of SERVICES) out[s.category].push(s);
    return out;
  }, []);

  function toggle(cat: ServiceCategory) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
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
  const activeOrder = SERVICE_ORDER.get(active.id) ?? 0;
  // 設定・ホームは常に開放: 設定は招待コードでの全機能無償化やマスターパスワード等の
  // 基盤機能を含むため、プランでロックしない (ロックすると無償化に辿り着けない)。
  const ALWAYS_UNLOCKED = new Set<ServiceId>(['settings', 'home']);
  const activeUnlocked = ALWAYS_UNLOCKED.has(active.id) || isServiceUnlocked(plan, activeOrder);
  const requiredPlan = requiredPlanForServiceIndex(activeOrder);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">サービスハブ</div>
        <nav className="sidebar-nav">
          {(['featured', 'tools', 'integrations'] as const).map((cat) => {
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
                  items.map((service) => {
                    const order = SERVICE_ORDER.get(service.id) ?? 0;
                    const unlocked = ALWAYS_UNLOCKED.has(service.id) || isServiceUnlocked(plan, order);
                    return (
                      <button
                        key={service.id}
                        className={`sidebar-item ${service.id === activeId ? 'active' : ''}`}
                        data-service-id={service.id}
                        data-locked={unlocked ? undefined : 'true'}
                        onClick={() => setActiveId(service.id)}
                        title={unlocked ? undefined : 'プランのアップグレードで利用可能'}
                        style={unlocked ? undefined : { opacity: 0.5 }}
                      >
                        <span className="icon">{service.icon}</span>
                        <span>{service.label}</span>
                        {!unlocked && (
                          <span style={{ marginLeft: 'auto', fontSize: 11 }} aria-label="locked">
                            🔒
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <label style={{ display: 'block', marginBottom: 4 }}>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-mute)' }}>
              プラン
            </span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanTier)}
              aria-label="プラン選択"
              style={{ width: '100%' }}
            >
              {PLAN_ORDER.map((tier) => (
                <option key={tier} value={tier}>
                  {PLANS[tier].label} · {PLANS[tier].audience}
                </option>
              ))}
            </select>
          </label>
          {version ? `v${version}` : 'v0.1.0'} · 開発版
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1>{active.label}</h1>
          <span className="description">{active.description}</span>
        </header>
        <section className="content">
          {activeUnlocked ? (
            <PageComponent />
          ) : (
            <UpgradeNotice
              requiredPlan={requiredPlan}
              onUpgrade={(tier) => setPlan(tier)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function UpgradeNotice({
  requiredPlan,
  onUpgrade,
}: {
  requiredPlan: PlanTier | null;
  onUpgrade: (tier: PlanTier) => void;
}) {
  // `requiredPlan` is null only when Free already covers the service, in
  // which case this notice wouldn't render — default to enterprise defensively.
  const target = requiredPlan ?? 'enterprise';
  const def = getPlan(target);
  return (
    <div style={{ maxWidth: 420, padding: 24 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <h2 style={{ margin: '0 0 8px' }}>このサービスは {def.label} プラン以上で利用できます</h2>
      <p style={{ color: 'var(--text-mute)', marginTop: 0 }}>
        対象: {def.audience} ／ 月額 {def.priceMonthlyJpy.toLocaleString('ja-JP')} 円
        ／ 同時利用サービス数 {def.maxServices === Infinity ? '無制限' : `${def.maxServices} 個まで`}
      </p>
      <button type="button" onClick={() => onUpgrade(target)}>
        {def.label} にアップグレード
      </button>
    </div>
  );
}
