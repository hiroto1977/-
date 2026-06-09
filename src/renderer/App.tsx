import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICES, CATEGORY_LABEL, type ServiceCategory, type ServiceId } from './services';
import { isServiceId } from '../shared/serviceId';
import { filterServices } from './sidebarFilter';
import { serviceIdFromHash, hashForService } from './hashRoute';
import { pushRecent, toggleFavorite, keepKnown, RECENTS_MAX } from './recents';
import { LockScreen } from './security/LockScreen';
import { getVault } from './security/vault';
import { startAutoLock } from './security/autoLock';
import { usePlan } from './plan/usePlan';
import { VoiceCommandBar } from './components/VoiceCommandBar';
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

const RECENTS_KEY = 'servicehub.recents';
const FAVORITES_KEY = 'servicehub.favorites';
const KNOWN_IDS: ReadonlySet<ServiceId> = new Set(SERVICES.map((s) => s.id));

/** localStorage から ServiceId 配列を安全に読む (壊れた値・private mode は []). */
function loadIds(key: string): ServiceId[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(isServiceId) : [];
  } catch {
    return [];
  }
}

function saveIds(key: string, ids: readonly ServiceId[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* private mode / quota — 永続化は best-effort */
  }
}

/** 初期表示サービス: URL ハッシュ優先、無ければ先頭。 */
function initialActiveId(): ServiceId {
  try {
    const fromHash = serviceIdFromHash(typeof location !== 'undefined' ? location.hash : '');
    if (fromHash) return fromHash;
  } catch {
    /* location 不在環境 */
  }
  return SERVICES[0]!.id;
}

export function App() {
  const [activeId, setActiveId] = useState<ServiceId>(initialActiveId);
  const [version, setVersion] = useState<string>('');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [recents, setRecents] = useState<ServiceId[]>(() => loadIds(RECENTS_KEY));
  const [favorites, setFavorites] = useState<ServiceId[]>(() => loadIds(FAVORITES_KEY));
  const { plan, setPlan, internalUnlocked } = usePlan();
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
    detectBrowserMode()
      .then(async (web) => {
        if (cancelled) return;
        setBrowserMode(web);
        if (web) {
          // status() が IndexedDB / WebCrypto エラーで reject しても、
          // vaultUnlocked を null のままにすると「読み込み中…」で固まり
          // ログイン画面が出なくなる。失敗時は locked 扱いで必ずロック画面を表示。
          let unlocked = false;
          try {
            unlocked = (await getVault().status()) === 'unlocked';
          } catch {
            unlocked = false;
          }
          if (!cancelled) setVaultUnlocked(unlocked);
        } else {
          setVaultUnlocked(true); // Electron: skip lock screen
        }
      })
      .catch(() => {
        // detectBrowserMode 自体の想定外失敗でもハングさせない:
        // ブラウザ扱い + locked でロック画面を表示する。
        if (!cancelled) {
          setBrowserMode(true);
          setVaultUnlocked(false);
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

  // activeId → URL ハッシュ同期 + 「最近使った」へ記録。
  useEffect(() => {
    try {
      const h = hashForService(activeId);
      if (location.hash !== h) location.hash = h;
    } catch {
      /* location 不在環境 */
    }
    setRecents((prev) => pushRecent(prev, activeId));
  }, [activeId]);

  // URL ハッシュ → activeId (ブラウザ戻る/進む・直リンク・共有)。
  useEffect(() => {
    function onHash() {
      const id = serviceIdFromHash(location.hash);
      if (id) setActiveId(id);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // recents / favorites を localStorage へ永続化。
  useEffect(() => saveIds(RECENTS_KEY, recents), [recents]);
  useEffect(() => saveIds(FAVORITES_KEY, favorites), [favorites]);

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

  /** お気に入りのトグル。 */
  function toggleFav(id: ServiceId) {
    setFavorites((prev) => toggleFavorite(prev, id));
  }

  // 保存済み id を現存サービスに解決 (stale id を除外し定義を引く)。
  const byId = (id: ServiceId) => SERVICES.find((s) => s.id === id)!;
  const favoriteServices = keepKnown(favorites, KNOWN_IDS).map(byId);
  const recentServices = keepKnown(recents, KNOWN_IDS).slice(0, RECENTS_MAX).map(byId);
  const favoriteSet = new Set(favorites);

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

  // サイドバー項目の共通描画 (カテゴリ別表示と検索結果の両方で使う)。
  // プランによるロック表示 (🔒) も保持する。
  const renderItem = (service: (typeof SERVICES)[number]) => {
    const order = SERVICE_ORDER.get(service.id) ?? 0;
    const unlocked = ALWAYS_UNLOCKED.has(service.id) || isServiceUnlocked(plan, order);
    const fav = favoriteSet.has(service.id);
    return (
      <button
        key={service.id}
        className={`sidebar-item ${service.id === activeId ? 'active' : ''}`}
        data-service-id={service.id}
        data-locked={unlocked ? undefined : 'true'}
        onClick={() => selectService(service.id)}
        title={unlocked ? undefined : 'プランのアップグレードで利用可能'}
        style={unlocked ? undefined : { opacity: 0.5 }}
      >
        <span className="icon">{service.icon}</span>
        <span>{service.label}</span>
        <span className="sidebar-item-controls">
          {!unlocked && (
            <span style={{ fontSize: 11 }} aria-label="locked">
              🔒
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            className={`fav-toggle ${fav ? 'on' : ''}`}
            aria-label={fav ? 'お気に入りから外す' : 'お気に入りに追加'}
            aria-pressed={fav}
            title={fav ? 'お気に入りから外す' : 'お気に入りに追加'}
            onClick={(e) => {
              e.stopPropagation();
              toggleFav(service.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                toggleFav(service.id);
              }
            }}
          >
            {fav ? '★' : '☆'}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">サービスハブ</div>
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
              filtered.map(renderItem)
            )
          ) : (
            <>
              {favoriteServices.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div className="sidebar-section-label">★ お気に入り</div>
                  {favoriteServices.map(renderItem)}
                </div>
              )}
              {recentServices.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div className="sidebar-section-label">最近使った</div>
                  {recentServices.map(renderItem)}
                </div>
              )}
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
                  {!isCollapsed && items.map(renderItem)}
                </div>
                );
              })}
            </>
          )}
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
          {internalUnlocked && (
            <div
              style={{
                marginTop: 6,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid #22c55e',
                color: '#22c55e',
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'center',
              }}
              title="社内ライセンス: 全サービス・全機能が無償で利用できます"
            >
              ✅ 全機能 開放中（無償）
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-mute)' }}>
            {version ? `v${version}` : 'v0.1.0'} · build: ALL-ACCESS
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1>{active.label}</h1>
          <span className="description">{active.description}</span>
          <span style={{ marginLeft: 'auto' }}>
            <VoiceCommandBar />
          </span>
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
