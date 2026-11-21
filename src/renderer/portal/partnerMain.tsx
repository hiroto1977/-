/**
 * パートナーポータルの入口 (取引先へ配る `dist/portal-partner.html` · 2026-11-11)。
 *
 * **ここで取り込む画面が、この HTML に入る画面のすべて**である。台帳 `shared/portal.mamori` の
 * `PARTNER_SCREENS` のうちアプリの画面 (`service`) と、過不足なく一致させる
 * (`portal/__tests__/portalBundleClosure.test.ts` が両方向に見る)。社内版の入口 (`main.tsx`) と
 * 橋 (`web-shim.ts`) は取り込まない。
 */
import '../styles.css';
import { CompliancePage } from '../pages/CompliancePage';
import { DocstudioPage } from '../pages/DocstudioPage';
import { mountPortal } from './portalEntry';
import { PortalEraseHatch } from './PortalEraseHatch';

mountPortal('partner', { docstudio: DocstudioPage, compliance: CompliancePage }, <PortalEraseHatch />);
