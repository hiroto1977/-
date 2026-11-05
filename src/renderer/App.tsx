import { useEffect, useState } from 'react';
import { LockScreen } from './security/LockScreen';
import { isBrowserBuild } from './runtimeMode';
import { getVault } from './security/vault';
import { startAutoLock } from './security/autoLock';
import { lockWorkspace, startLockRelay, subscribeWorkspaceLocked } from './security/lockWorkspace';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { VillageShell } from './components/VillageShell';

// True when the renderer is loaded in a plain browser (no Electron preload).
// The Electron preload sets serviceHub via contextBridge — the web shim adds the
// `-web` suffix to the version it reports, and that suffix is what we look at
// (2026-09-25 · パス 460: 版の数まで見ると、版を上げた日に実行形態が動く).
/** 設定画面と同じ判定 (`runtimeMode.ts` · パス 137) —— 片方だけ写すとデスクトップ版に保管庫の操作が出る。 */
const detectBrowserMode = isBrowserBuild;

export function App() {
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

  // 解錠の後は村の殻だけ (2026-11-04: 旧画面のサイドバーは廃止。各サービスの画面は村の役場の窓へ開く)。
  return <VillageShell />;
}
