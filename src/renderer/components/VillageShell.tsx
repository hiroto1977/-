/**
 * 村の殻 (2026-11-04 · 村リビルド P1) —— 利用者に見えるのは**村と会話だけ**。
 *
 * 旧画面 (サイドバー + 78 の画面) はここでは描かない。機能は順に会話の裏へ移す (P3)。
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
 */
import { useRef, useState } from 'react';
import { SERVICES } from '../services';
import { ChatbotWidget, clearChatbotHistory } from './ChatbotWidget';
import { DeviceStoreFailureBanner } from './DeviceStoreFailureBanner';
import { PageErrorBoundary } from './PageErrorBoundary';
import { ShellPartBoundary } from './ShellPartBoundary';
import { useDialogFocus } from './useDialogFocus';

const VillagePage = SERVICES.find((s) => s.id === 'village')!.page;
const SettingsPage = SERVICES.find((s) => s.id === 'settings')!.page;

export function VillageShell() {
  const [hallOpen, setHallOpen] = useState(false);
  const hallRef = useRef<HTMLDivElement | null>(null);
  const hallBtnRef = useRef<HTMLButtonElement | null>(null);
  const hallKeys = useDialogFocus(hallRef, {
    open: hallOpen,
    onClose: () => setHallOpen(false),
    returnTo: hallBtnRef,
  });

  return (
    <div className="village-shell" data-village-shell>
      <header className="village-shell-bar">
        <h1 className="village-shell-title">
          <span aria-hidden="true">⛏️🌳</span> ブロックの村
        </h1>
        <button
          type="button"
          ref={hallBtnRef}
          className="village-hall-btn"
          data-village-hall-open
          aria-haspopup="dialog"
          aria-expanded={hallOpen}
          onClick={() => setHallOpen(true)}
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
        <div className="village-hall-backdrop" onClick={() => setHallOpen(false)} aria-hidden="true" />
      )}
      {hallOpen && (
        <div
          ref={hallRef}
          role="dialog"
          aria-label="役場"
          className="village-hall"
          data-village-hall
          onKeyDown={hallKeys.onKeyDown}
        >
          <div className="village-hall-head">
            <strong>🏛️ 役場</strong>
            <button type="button" data-dialog-initial onClick={() => setHallOpen(false)}>
              閉じる ✕
            </button>
          </div>
          <div className="village-hall-body">
            <PageErrorBoundary label="役場 (設定)">
              <SettingsPage />
            </PageErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}
