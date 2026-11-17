/**
 * 村の殻 (2026-11-04 · 村リビルド P1) —— 利用者に見えるのは**村と会話だけ**。
 *
 * 旧画面 (サイドバー + 78 の画面) はここでは描かない。機能は会話の裏へ移す (P3)。会話が出す
 * 「〇〇を開いて」(`servicehub:navigate`) は殻が聞き、そのサービスの画面を役場と同じ窓に開く
 * (聞き手が無いと 旧画面の App だけが聞いていたので、殻では無反応になる)。
 * 移し終えるまでの間も、次の 3 つは**必ず残す** (消すと利用者が自分のデータから締め出される ——
 * 法則 `escape-hatch-stays-open`):
 *
 * - 「役場」 … 設定の画面そのもの。ロック/解錠・マスターパスワード・データの書き出しと削除・
 *   API キー・プロキシ・見た目。村の建物として開く窓で、閉じれば村へ戻る。
 * - 端末の保存の知らせ (`DeviceStoreFailureBanner`) … 端末が記録の読み書きを断ったことは、どの画面でも
 *   同じ打ち手になるので殻に 1 つ置く。
 * - 危機の相談窓口 … 会話の部品 (コンシェルジュ・村人) が、つらい内容を外部のモデルへ送らず窓口を出す。
 *
 * 画面の外の部品はどれも自分の境界に入れる (パス 489): 殻の 1 部品が落ちても、村と役場は残る。
 *
 * **ポータルの入口 (2026-11-11)** —— 「ポータル」のボタンは、社内 / パートナー / カスタマーの 3 つの入口を
 * 同じ窓に開く (`PortalDirectory` · `#portal/<id>`)。村はそのまま残る。一覧から開いた画面を閉じると、
 * 村ではなく一覧へ戻る。どの画面を社外向けに出すかは `shared/portal.mamori` の台帳が決める。
 */
import { useEffect, useRef, useState } from 'react';
import { onNavigate } from '../navigate';
import { SERVICES } from '../services';
import { hashForPortal, hashForService, portalIdFromHash, serviceIdFromHash } from '../hashRoute';
import { ManualDataSection } from './ManualDataSection';
import { BestAnswersIndicator } from './BestAnswersIndicator';
import { isServiceId, type ServiceId } from '../../shared/serviceId';
import { PORTALS, type PortalId } from '../../shared/portal';
import { PortalDirectory } from '../portal/PortalDirectory';
import { ChatbotWidget, clearChatbotHistory } from './ChatbotWidget';
import { DeviceStoreFailureBanner } from './DeviceStoreFailureBanner';
import { PageErrorBoundary } from './PageErrorBoundary';
import { ShellPartBoundary } from './ShellPartBoundary';
import { useDialogFocus } from './useDialogFocus';

const VillagePage = SERVICES.find((s) => s.id === 'village')!.page;
const SettingsPage = SERVICES.find((s) => s.id === 'settings')!.page;

/** URL ハッシュ (`#stocks`) → 開く窓。村そのもの (`#village`)・空・知らない値は窓なし。 */
function openIdFromHash(hash: string): ServiceId | null {
  const id = serviceIdFromHash(hash);
  return id !== null && id !== 'village' && SERVICES.some((s) => s.id === id) ? id : null;
}

function currentHash(): string {
  try {
    return typeof location !== 'undefined' ? location.hash : '';
  } catch {
    return '';
  }
}

export function VillageShell() {
  // 開いている窓。'settings' は役場 (設定そのもの)。会話の「〇〇を開いて」(`servicehub:navigate`) で
  // 各サービスの画面も同じ窓に開く —— 殻は聞き手が 1 つも無いと「開いて」が無反応になる (P3)。
  // 初期値は URL ハッシュ (直リンク・共有): 旧画面のサイドバーを廃止したので、78 の画面への入口は
  // 会話とこのハッシュの 2 つ。
  const [openId, setOpenId] = useState<ServiceId | null>(() => openIdFromHash(currentHash()));
  // 開いているポータルの一覧 (`#portal/partner`)。画面 (openId) はその上に重なる: 一覧から画面を開いて
  // 閉じると、村ではなく一覧へ戻る。
  const [portal, setPortal] = useState<PortalId | null>(() => portalIdFromHash(currentHash()));
  const hallOpen = openId !== null || portal !== null;
  const hallRef = useRef<HTMLDivElement | null>(null);
  const hallBtnRef = useRef<HTMLButtonElement | null>(null);
  const portalBtnRef = useRef<HTMLButtonElement | null>(null);
  // 状態 → hash の同期が最後に揃えた綴り (まだ揃えていなければ null)。
  const syncedHashRef = useRef<string | null>(null);
  // 戻す先: 役場のボタンで開いたときだけそのボタン。会話から開いたときは null (= 開いた時に焦点を持っていた物)。
  const returnRef = useRef<HTMLElement | null>(null);
  const hallKeys = useDialogFocus(hallRef, {
    open: hallOpen,
    onClose: closeWindow,
    returnTo: returnRef,
  });

  /** 窓を 1 段閉じる: ポータルの一覧から開いた画面なら一覧へ戻り、そうでなければ村へ戻る。 */
  function closeWindow() {
    if (openId !== null && portal !== null) {
      setOpenId(null);
      return;
    }
    setOpenId(null);
    setPortal(null);
  }

  useEffect(
    () =>
      onNavigate((target) => {
        if (target === 'village') {
          setOpenId(null);
          setPortal(null);
          return;
        }
        if (!isServiceId(target) || !SERVICES.some((s) => s.id === target)) return;
        returnRef.current = null;
        setOpenId(target);
      }),
    [],
  );

  // 窓 → URL ハッシュ (開いた画面を共有・戻る/進むで辿れる)。画面 > ポータルの一覧 > 村 の順。
  // 状態から導いた綴りを覚える (書いたかどうかに依らず毎回) —— 下の聞き手が、自分の書き込みの反響を見分ける。
  useEffect(() => {
    try {
      const h = openId !== null ? hashForService(openId) : portal !== null ? hashForPortal(portal) : hashForService('village');
      syncedHashRef.current = h;
      if (location.hash !== h) location.hash = h;
    } catch {
      /* location 不在環境 */
    }
  }, [openId, portal]);

  // URL ハッシュ → 窓 (ブラウザ戻る/進む・直リンク)。
  useEffect(() => {
    function onHash() {
      const h = currentHash();
      // 自分の書き込みの反響は状態を動かさない。hashchange は書いた後に遅れて届くので、その間に会話の
      // 「開いて」(まだ描かれていない状態の更新) が来ていると、反響が古い綴りで上書きして開く要求が消える
      // (2026-11-11 に実 chromium で実測: 窓を閉じた直後の「開いて」で窓が開かなかった)。
      if (h === syncedHashRef.current) return;
      const p = portalIdFromHash(h);
      if (p !== null) {
        setPortal(p);
        setOpenId(null);
        return;
      }
      // 画面の hash はポータルの一覧をそのまま残す (一覧から開いた画面)。村・知らない hash は両方閉じる。
      const id = openIdFromHash(h);
      setOpenId(id);
      if (id === null) setPortal(null);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const def = openId === null ? undefined : SERVICES.find((s) => s.id === openId);
  const OpenPage = def?.page ?? SettingsPage;
  const portalLabel = portal === null ? null : (PORTALS.find((p) => p.id === portal)?.label ?? 'ポータル');
  const showDirectory = openId === null && portalLabel !== null;
  // 窓の名前。'役場' を 1 つ目の枝に置く (dialog の census が字面を読む)。一覧を出しているときはポータルの名前。
  const title =
    openId === 'settings' || (openId === null && !showDirectory) ? '役場' : showDirectory ? portalLabel : (def?.label ?? '役場');

  return (
    <div className="village-shell" data-village-shell>
      <header className="village-shell-bar">
        <h1 className="village-shell-title">
          <span aria-hidden="true">⛏️🌳</span> ブロックの村
        </h1>
        <span className="village-shell-bar-right">
          <ShellPartBoundary label="ベスト3 の進み具合">
            <BestAnswersIndicator />
          </ShellPartBoundary>
        </span>
        <button
          type="button"
          ref={portalBtnRef}
          className="village-hall-btn"
          data-village-portal-open
          aria-haspopup="dialog"
          aria-expanded={portal !== null}
          onClick={() => {
            returnRef.current = portalBtnRef.current;
            setOpenId(null);
            setPortal('internal');
          }}
        >
          🚪 ポータル <span className="village-hall-sub">社内・取引先・顧客の入口</span>
        </button>
        <button
          type="button"
          ref={hallBtnRef}
          className="village-hall-btn"
          data-village-hall-open
          aria-haspopup="dialog"
          aria-expanded={hallOpen}
          onClick={() => {
            returnRef.current = hallBtnRef.current;
            setOpenId('settings');
          }}
        >
          🏛️ 役場 <span className="village-hall-sub">ロック・データ・鍵の設定</span>
        </button>
      </header>

      <ShellPartBoundary label="端末の保存の知らせ">
        <DeviceStoreFailureBanner />
      </ShellPartBoundary>

      <div className="village-shell-body">
        <main className="village-shell-scene" aria-label="村">
          <PageErrorBoundary label="村">
            <VillagePage />
          </PageErrorBoundary>
        </main>
        <aside className="village-shell-chat" aria-label="村の案内所 (会話)" data-village-chat>
          <ShellPartBoundary
            label="AI コンシェルジュ"
            recover={{ label: '会話履歴を消去してやり直す', run: clearChatbotHistory }}
          >
            <ChatbotWidget docked />
          </ShellPartBoundary>
        </aside>
      </div>

      {hallOpen && (
        <div className="village-hall-backdrop" onClick={closeWindow} aria-hidden="true" />
      )}
      {hallOpen && (
        <div
          ref={hallRef}
          role="dialog"
          aria-label={title}
          className="village-hall"
          data-village-hall
          data-village-window={openId ?? (showDirectory ? 'portal' : undefined)}
          onKeyDown={hallKeys.onKeyDown}
        >
          <div className="village-hall-head">
            <strong>{openId === 'settings' ? '🏛️ ' : ''}{title}</strong>
            <button type="button" data-dialog-initial onClick={closeWindow}>
              {openId !== null && portal !== null ? '← ポータルへ戻る' : '閉じる ✕'}
            </button>
          </div>
          <div className="village-hall-body">
            {showDirectory && portal !== null ? (
              <PageErrorBoundary label={title} key={`portal-${portal}`}>
                <PortalDirectory portal={portal} onSelectPortal={setPortal} onOpenService={setOpenId} />
              </PageErrorBoundary>
            ) : (
              <PageErrorBoundary label={title} key={openId}>
                <OpenPage />
                {/* 手入力欄は窓の中の 1 か所 (画面ごとに貼ると漏れる)。置き換えの一覧を持たない画面は「足す」側だけ。 */}
                <ManualDataSection scope={openId ?? 'settings'} />
              </PageErrorBoundary>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
