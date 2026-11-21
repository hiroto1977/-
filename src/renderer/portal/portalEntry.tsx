/**
 * 社外向けポータルの入口の共通部 (2026-11-11)。入口のファイル (`partnerMain.tsx` / `customerMain.tsx`) が、
 * そのポータルに入れる画面の表を渡して呼ぶ。
 *
 * 順序: 橋を据える → 枠の中なら断る (なりすましたページに操作を押させる手口を防ぐ) → 描く。
 */
import React, { type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { isFramed, renderFrameRefusal } from '../security/frameGuard';
import { PortalApp } from './PortalApp';
import type { PortalPageRegistry } from './PortalScreenView';
import { installPortalBridge, type ExternalPortalId } from './portalShim';

export function mountPortal(portal: ExternalPortalId, pages: PortalPageRegistry, footer?: ReactNode): void {
  installPortalBridge(portal);
  if (isFramed()) {
    renderFrameRefusal(document, window.location.href);
    return;
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PortalApp portal={portal} pages={pages} footer={footer} />
    </React.StrictMode>,
  );
}
