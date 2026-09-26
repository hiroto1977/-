import { onNavigate } from './navigate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICES, CATEGORY_LABEL, type ServiceCategory, type ServiceDefinition, type ServiceId } from './services';
import { ShellContext, type ShellService, type ShellState } from './shellContext';
import { isServiceId } from '../shared/serviceId';
import { filterServices } from './sidebarFilter';
import { serviceIdFromHash, hashForService } from './hashRoute';
import { ManualDataSection } from './components/ManualDataSection';
import { pushRecent, toggleFavorite, keepKnown, RECENTS_MAX } from './recents';
import { LockScreen } from './security/LockScreen';
import { isBrowserBuild } from './runtimeMode';
import { getVault } from './security/vault';
import { startAutoLock } from './security/autoLock';
import { lockWorkspace, startLockRelay, subscribeWorkspaceLocked } from './security/lockWorkspace';
import { usePlan } from './plan/usePlan';
import { VoiceCommandBar } from './components/VoiceCommandBar';
import { ChatbotWidget } from './components/ChatbotWidget';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { DeviceStoreFailureBanner } from './components/DeviceStoreFailureBanner';
import { BestAnswersIndicator } from './components/BestAnswersIndicator';
import {
  PLAN_ORDER,
  PLANS,
  getPlan,
  isServiceUnlocked,
  requiredPlanForServiceIndex,
  type PlanTier,
} from '../shared/plan';

// True when the renderer is loaded in a plain browser (no Electron preload).
// The Electron preload sets serviceHub via contextBridge — the web shim adds the
// `-web` suffix to the version it reports, and that suffix is what we look at
// (2026-09-25 · パス 460: 版の数まで見ると、版を上げた日に実行形態が動く).
/** 設定画面と同じ判定 (`runtimeMode.ts` · パス 137) —— 片方だけ写すとデスクトップ版に保管庫の操作が出る。 */
const detectBrowserMode = isBrowserBuild;

const COLLAPSED_BY_DEFAULT: ReadonlySet<ServiceCategory> = new Set<ServiceCategory>([
  'tools',
  'integrations',
]);

/** 分類の見出しに添える絵文字 (パス 322)。文字は `CATEGORY_LABEL` が持つ —— ここは飾りだけ。 */
const CATEGORY_EMOJI: Readonly<Record<ServiceCategory, string>> = {
  featured: '⭐',
  professionals: '⚖️',
  tools: '🧰',
  integrations: '🔗',
};

/** 分類の並び (サイドバーの上から下へ)。 */
const CATEGORY_ORDER = ['featured', 'professionals', 'tools', 'integrations'] as const;

/** 「先頭へ戻る」ボタンを出す縦スクロール量 (px)。 */
const SCROLL_TOP_THRESHOLD = 320;

/**
 * 検索欄に添えるショートカットの表記。Apple の端末では ⌘K、それ以外は Ctrl K
 * (押す鍵は `onKey` が両方とも受ける —— 表記だけを端末に合わせる)。
 */
const SHORTCUT_LABEL: string = (() => {
  try {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /Mac|iPhone|iPad|iPod/.test(ua) ? '⌘K' : 'Ctrl K';
  } catch {
    return 'Ctrl K';
  }
})();

/** 動きを減らす設定 (OS)。読めない環境は「減らさない」に倒す (装飾だけの判定)。 */
function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 要素の先頭へ。`scrollTo` を持たない環境 (jsdom) では `scrollTop` へ倒す。 */
function scrollElementToTop(el: HTMLElement, behavior: ScrollBehavior): void {
  if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, behavior });
  else el.scrollTop = 0;
}

/** 画面へ渡す最小の欄 (`shellContext.ts` の理由: `HomePage` は `SERVICES` を読めない)。 */
function toShellService(s: ServiceDefinition): ShellService {
  return { id: s.id, label: s.label, icon: s.icon, description: s.description };
}

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
  // モバイル/タブレット (≤768px) のドロワー開閉。デスクトップでは
  // .menu-btn / .sidebar-backdrop が CSS で不可視のため常に無害。
  const [navOpen, setNavOpen] = useState(false);
  // 本文の縦スクロールが閾値を越えたか (「先頭へ戻る」ボタンの表示)。
  const [scrolled, setScrolled] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const { plan, setPlan, internalUnlocked } = usePlan();
  const [collapsed, setCollapsed] = useState<Record<ServiceCategory, boolean>>({
    featured: false,
    professionals: COLLAPSED_BY_DEFAULT.has('professionals'),
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

  /*
   * 施錠されたら**必ず**ロック画面へ戻す。
   *
   * `vaultUnlocked` はマウント時に 1 度だけ読むので、購読が無いと
   * 「鍵は落ちたのに画面は解錠のまま」が残る —— 2026-09-06 実測で、
   * 設定ページの「Vault を今すぐロック」がまさにそれだった (ページ局所の
   * 状態を立てるだけで、ロック画面は出ず、他のページへ移れば見た目は解錠)。
   *
   * 解錠状態に**依らず**登録する (`vaultUnlocked` を依存に入れない) ——
   * 施錠済みのタブが他のタブからの要求を受け取っても害はなく、
   * 逆に「登録される前に施錠が来る」窓を作らない。
   * Electron ではロック画面を使わないので購読も中継もしない。
   */
  useEffect(() => {
    if (!browserMode) return undefined;
    const unsubscribe = subscribeWorkspaceLocked(() => setVaultUnlocked(false));
    const stopRelay = startLockRelay();
    return () => {
      unsubscribe();
      stopRelay();
    };
  }, [browserMode]);

  // Start auto-lock when entering unlocked state (browser mode only).
  useEffect(() => {
    if (!browserMode || !vaultUnlocked) return undefined;
    // 鍵を落とすのと画面を施錠表示にするのは `lockWorkspace` の中で 1 つ。
    // 並べて書くと鍵を落とす側だけ消えても全検査が緑のまま通る (実測)。
    // 自動施錠は**この文脈だけ**を施錠する —— hidden は「同じアプリの別の
    // タブへ移った」時でもあるので、配ると使用中のタブを施錠してしまう。
    const handle = startAutoLock({ onLock: lockWorkspace });
    return () => handle.dispose();
  }, [browserMode, vaultUnlocked]);

  useEffect(() => {
    window.serviceHub?.getVersion().then(setVersion).catch(() => undefined);
  }, []);

  // Loosely-coupled navigation: any page can dispatch a CustomEvent to
  // jump to another service without prop-drilling a callback. The Home
  // page uses this for "細かく編集する" links.
  useEffect(() => onNavigate((target) => {
    if (!isServiceId(target)) return;
    setActiveId(target);
    // Auto-expand the group containing the destination so it's visible.
    const def = SERVICES.find((s) => s.id === target);
    if (def) {
      setCollapsed((prev) => ({ ...prev, [def.category]: false }));
    }
    setNavOpen(false); // ページ内リンク遷移でもモバイルのドロワーを閉じる
  }), []);

  // Cmd/Ctrl-K でサイドバー検索にフォーカス (どの画面からでも)。Escape はドロワーを閉じる。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape') {
        setNavOpen(false);
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

  // 画面を切り替えたら本文を先頭へ戻す (前の画面のスクロール位置を引き継がない)。
  useEffect(() => {
    const el = contentRef.current;
    if (el) scrollElementToTop(el, 'auto');
    setScrolled(false);
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
      professionals: [],
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

  /** サービスを選択し、属するカテゴリを展開する。モバイルではドロワーも閉じる。 */
  function selectService(id: ServiceId) {
    setActiveId(id);
    const def = SERVICES.find((s) => s.id === id);
    if (def) setCollapsed((prev) => ({ ...prev, [def.category]: false }));
    setNavOpen(false);
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
  // ホームの「お気に入り / 最近使った」の列はサイドバーと同じ並びを映す (`shellContext.ts`)。
  const shell: ShellState = {
    favorites: favoriteServices.map(toShellService),
    recents: recentServices.map(toShellService),
    toggleFavorite: toggleFav,
  };

  function onContentScroll(e: React.UIEvent<HTMLElement>) {
    const next = e.currentTarget.scrollTop > SCROLL_TOP_THRESHOLD;
    setScrolled((prev) => (prev === next ? prev : next));
  }

  function scrollToTop() {
    const el = contentRef.current;
    if (el) scrollElementToTop(el, prefersReducedMotion() ? 'auto' : 'smooth');
  }

  // Browser-mode + locked → show only the lock screen.
  if (browserMode === null || vaultUnlocked === null) {
    return <div style={{ padding: 24, color: 'var(--text-mute)' }}>読み込み中…</div>;
  }
  if (browserMode && !vaultUnlocked) {
    // ロック画面はアプリへの唯一の入口 —— ここが描画で投げると真っ白のまま何もできない。
    // 画面の境界と同じ物で包む (「ホームへ戻る」は無い: 解錠前に戻る先が無い)。
    return (
      <PageErrorBoundary label="ロック画面">
        <LockScreen onUnlocked={() => setVaultUnlocked(true)} />
      </PageErrorBoundary>
    );
  }

  const active = SERVICES.find((s) => s.id === activeId)!;
  const PageComponent = active.page;
  const activeOrder = SERVICE_ORDER.get(active.id) ?? 0;
  // 設定・ホームは常に開放: 設定は招待コードでの全機能無償化やマスターパスワード等の
  // 基盤機能を含むため、プランでロックしない (ロックすると無償化に辿り着けない)。
  const ALWAYS_UNLOCKED = new Set<ServiceId>(['settings', 'home', 'village']);
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
        aria-current={service.id === activeId ? 'page' : undefined}
        onClick={() => selectService(service.id)}
        title={unlocked ? service.description : 'プランのアップグレードで利用可能'}
        style={unlocked ? undefined : { opacity: 0.5 }}
      >
        <span className="icon" aria-hidden="true">{service.icon}</span>
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
            {fav ? '♥' : '♡'}
          </span>
        </span>
      </button>
    );
  };

  const activeFav = favoriteSet.has(active.id);

  return (
    <ShellContext.Provider value={shell}>
    <div className={navOpen ? 'app nav-open' : 'app'}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-header">サービスハブ</div>
          <button
            type="button"
            className="drawer-close"
            aria-label="メニューを閉じる"
            onClick={() => setNavOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="sidebar-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="サービスを検索"
            aria-label="サービスを検索"
            title={`サービスを検索 (${SHORTCUT_LABEL} · Enter で先頭の候補を開く · Esc で消す)`}
            className="sidebar-search-input"
          />
          {query ? (
            <button
              type="button"
              className="sidebar-search-clear"
              aria-label="検索を消す"
              title="検索を消す (Esc)"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
            >
              ✕
            </button>
          ) : (
            <kbd className="kbd sidebar-search-kbd" aria-hidden="true">
              {SHORTCUT_LABEL}
            </kbd>
          )}
        </div>
        <nav className="sidebar-nav" aria-label="サービス一覧">
          {filtered !== null ? (
            filtered.length === 0 ? (
              <div className="sidebar-empty" role="status">
                「{query.trim()}」に一致するサービスはありません
              </div>
            ) : (
              <>
                <div className="sidebar-section-label" role="status" title="Enter で先頭の候補を開く">
                  🔍 検索結果 {filtered.length} 件
                </div>
                {filtered.map(renderItem)}
              </>
            )
          ) : (
            <>
              {favoriteServices.length > 0 && (
                <div className="sidebar-group" data-section="favorites">
                  <div className="sidebar-section-label">♥ お気に入り</div>
                  {favoriteServices.map(renderItem)}
                </div>
              )}
              {recentServices.length > 0 && (
                <div className="sidebar-group" data-section="recents">
                  <div className="sidebar-section-label">🕒 最近使った</div>
                  {recentServices.map(renderItem)}
                </div>
              )}
              {CATEGORY_ORDER.map((cat) => {
                const items = grouped[cat];
                if (items.length === 0) return null;
                const isCollapsed = collapsed[cat];
                return (
                  <div key={cat} className="sidebar-group" data-category={cat}>
                    <button
                      type="button"
                      className="sidebar-group-head"
                      onClick={() => toggle(cat)}
                      aria-expanded={!isCollapsed}
                      title={isCollapsed ? `${CATEGORY_LABEL[cat]} を開く` : `${CATEGORY_LABEL[cat]} を畳む`}
                    >
                      <span className="group-emoji" aria-hidden="true">
                        {CATEGORY_EMOJI[cat]}
                      </span>
                      <span>{CATEGORY_LABEL[cat]}</span>
                      <span className="group-count" aria-label={`${items.length} 件`}>
                        {items.length}
                      </span>
                      <span className="chev" aria-hidden="true">
                        ⌄
                      </span>
                    </button>
                    {!isCollapsed && items.map(renderItem)}
                  </div>
                );
              })}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <label className="plan-label">
            <span style={{ display: 'block', marginBottom: 4 }}>プラン</span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanTier)}
              aria-label="プラン選択"
              className="plan-select"
            >
              {PLAN_ORDER.map((tier) => (
                <option key={tier} value={tier}>
                  {PLANS[tier].label} · {PLANS[tier].audience}
                </option>
              ))}
            </select>
          </label>
          {internalUnlocked && (
            <div className="license-pill" title="社内ライセンス: 全サービス・全機能が無償で利用できます">
              ✅ 全機能 開放中（無償）
            </div>
          )}
          {/*
            * 版が分かっていないときに数を名乗らない (2026-09-25 · パス 460)。
            * 直す前は `'v0.1.0'` を直書きしており、**橋の `getVersion` が落ちると
            * その文字列が残り続ける** (実測: reject する橋で描くとサイドバーは
            * 永久に `v0.1.0` と言う)。版を上げた日には、動いているどの版に対しても偽になる。
            * 「価格不明」「在庫不明」(パス 410) と同じで、**空欄ではなく理由を名乗る。**
            */}
          <div className="sidebar-version">
            {version ? `v${version}` : '版不明'} · build: ALL-ACCESS
          </div>
        </div>
      </aside>
      {navOpen && (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            aria-label={navOpen ? 'メニューを閉じる' : 'メニューを開く'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((o) => !o)}
          >
            ☰
          </button>
          <span className="topbar-icon" aria-hidden="true">
            {active.icon}
          </span>
          <h1>{active.label}</h1>
          <span className="chip crumb">
            <span aria-hidden="true">{CATEGORY_EMOJI[active.category]}</span>
            {CATEGORY_LABEL[active.category]}
          </span>
          <span className="description">{active.description}</span>
          <div className="topbar-right">
            <BestAnswersIndicator />
            <button
              type="button"
              className={`topbar-fav ${activeFav ? 'on' : ''}`}
              aria-label={activeFav ? 'お気に入りから外す' : 'お気に入りに追加'}
              aria-pressed={activeFav}
              title={activeFav ? 'お気に入りから外す' : 'お気に入りに追加'}
              onClick={() => toggleFav(active.id)}
            >
              {activeFav ? '♥' : '♡'}
            </button>
            <VoiceCommandBar />
          </div>
        </header>
        <section className="content" ref={contentRef} onScroll={onContentScroll}>
          {/*
            端末が業務レコードの読み書きを断ったことは、**どの画面でも同じ打ち手**に
            なるので 1 か所で出す。画面の境界の外に置く —— 中だと画面が落ちたときに
            報せも消える。
          */}
          <DeviceStoreFailureBanner />
          {/* key で画面ごとに張り直す —— 切り替えのたびに `.page-enter` がふわっと現れる。 */}
          <div key={active.id} className="page-enter">
            {activeUnlocked ? (
              // 画面の描画エラーはこの枠に閉じる (境界が無いと React はツリー全体を外し、サイドバーごと白くなる)。
              // 別の画面へ移れば新しい境界 (外側の key が張り直す)。
              <PageErrorBoundary label={active.label} onGoHome={() => selectService('home')}>
                <PageComponent />
                {/*
                  手入力欄は**ここ 1 か所**に置く。画面ごとに貼って回ると必ず
                  どれか 1 つが漏れるし、新しいサービスを足すたびに忘れる。
                  置き換えの一覧を持たない画面では「足す」側だけが出る。
                */}
                <ManualDataSection scope={active.id} />
              </PageErrorBoundary>
            ) : (
              <UpgradeNotice
                requiredPlan={requiredPlan}
                onUpgrade={(tier) => setPlan(tier)}
              />
            )}
          </div>
        </section>
        <button
          type="button"
          className={`scroll-top ${scrolled ? 'show' : ''}`}
          aria-label="ページの先頭へ戻る"
          aria-hidden={!scrolled}
          tabIndex={scrolled ? 0 : -1}
          onClick={scrollToTop}
        >
          ↑
        </button>
      </main>
      <ChatbotWidget />
    </div>
    </ShellContext.Provider>
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
    <div className="upgrade-card">
      <div className="lock" aria-hidden="true">🔒</div>
      <h2>このサービスは {def.label} プラン以上で利用できます</h2>
      <p>
        対象: {def.audience} ／ 月額 {def.priceMonthlyJpy.toLocaleString('ja-JP')} 円
        ／ 同時利用サービス数 {def.maxServices === Infinity ? '無制限' : `${def.maxServices} 個まで`}
      </p>
      <button type="button" className="primary" onClick={() => onUpgrade(target)}>
        {def.label} にアップグレード
      </button>
    </div>
  );
}
