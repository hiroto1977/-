/**
 * Browser-fallback shim for window.serviceHub.
 *
 * The Electron preload sets `window.serviceHub` via contextBridge before
 * the renderer loads. When the renderer is loaded directly in a browser
 * (e.g. opening dist/standalone.html in Chrome), preload has not run, so
 * `window.serviceHub` is undefined. This shim provides a minimal-but-safe
 * polyfill so the UI renders and the most useful actions still work:
 *
 *   - openExternal()           → window.open(url, '_blank', 'noopener')
 *   - revealInFolder() / openPath() → alert("ブラウザ版では使えません…")
 *   - setToken / clearToken / listConfigured → no-op
 *   - fetchSnapshot()          → returns "not_implemented" — pages already
 *                                fall back to SNAPSHOT[id] (the bundled
 *                                static snapshot), so the UI still shows
 *                                meaningful data
 *   - invoke('templates', 'export-template', …)
 *                              → renders SVG client-side and triggers
 *                                a browser download via <a download>
 *   - invoke('teamradar', 'export-svg', …)
 *                              → same, but expects the page to provide
 *                                the SVG (we extract from the live <svg>
 *                                element on the page)
 *   - other invoke calls       → return action_not_found with message
 *
 * This file is only imported in the web build entry; in Electron, preload
 * already populates window.serviceHub and this shim is skipped.
 */

import { TEMPLATE_CATALOG_FOR_WEB, renderTemplateForWeb } from './web-templates';

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function notSupportedAlert(): Promise<void> {
  // eslint-disable-next-line no-alert
  alert(
    'ブラウザ版では使えません。\nファイルはお使いのブラウザのダウンロードフォルダに保存されています。',
  );
  return Promise.resolve();
}

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function err<T = never>(code: string, message: string): ActionResult<T> {
  return { ok: false, code, message };
}

interface ExportTemplatePayload {
  templateId?: string;
  params?: Record<string, unknown>;
}

interface ExportSvgPayload {
  title?: string;
}

function tryGrabSvgFromPage(): string | null {
  // The TeamRadarPage renders the chart as an inline <svg> with role="img".
  // For the web export fallback, serialize whatever radar svg is currently
  // shown.
  const svg = document.querySelector('svg[role="img"][aria-label*="レーダー"]');
  if (!svg) return null;
  // Add xmlns if missing (sometimes React strips it).
  const cloned = svg.cloneNode(true) as SVGElement;
  if (!cloned.getAttribute('xmlns')) {
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(cloned);
}

const shim = {
  getVersion: (): Promise<string> => Promise.resolve('0.1.0-web'),

  openExternal: (url: string): Promise<void> => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return Promise.resolve();
  },

  revealInFolder: notSupportedAlert,
  openPath: notSupportedAlert,

  setToken: (): Promise<void> => Promise.resolve(),
  clearToken: (): Promise<void> => Promise.resolve(),
  listConfigured: (): Promise<string[]> => Promise.resolve([]),

  fetchSnapshot: <T>(): Promise<ActionResult<T>> =>
    Promise.resolve(err('not_implemented', 'ブラウザ版では live fetch を行いません。同梱の snapshot を使用します。')),

  invoke: <T>(serviceId: string, action: string, payload: Record<string, unknown>): Promise<ActionResult<T>> => {
    // Template export: render SVG client-side and download.
    if (serviceId === 'templates' && action === 'export-template') {
      const p = payload as ExportTemplatePayload;
      const id = p.templateId;
      const def = TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === id);
      if (!def) return Promise.resolve(err('action_failed', `unknown template id: ${String(id)}`));
      let svg: string;
      try {
        svg = renderTemplateForWeb(def, (p.params as Record<string, string> | undefined) ?? {});
      } catch (e) {
        return Promise.resolve(err('action_failed', e instanceof Error ? e.message : String(e)));
      }
      const filename = `${def.id}.svg`;
      downloadBlob(filename, svg, 'image/svg+xml');
      return Promise.resolve(
        ok({ path: filename, bytes: new Blob([svg]).size, generatedAt: new Date().toISOString() }) as ActionResult<T>,
      );
    }

    // TeamRadar export: grab the inline svg already rendered on the page.
    if (serviceId === 'teamradar' && action === 'export-svg') {
      const svg = tryGrabSvgFromPage();
      if (!svg) {
        return Promise.resolve(err('action_failed', 'チームレーダーページに切り替えてからもう一度お試しください'));
      }
      const p = payload as ExportSvgPayload;
      const title = typeof p.title === 'string' && p.title.length > 0 ? p.title : 'team-radar';
      const filename = title.replace(/[^\w.-]+/g, '-').slice(0, 64) + '.svg';
      downloadBlob(filename, svg, 'image/svg+xml');
      return Promise.resolve(
        ok({ path: filename, bytes: new Blob([svg]).size, generatedAt: new Date().toISOString() }) as ActionResult<T>,
      );
    }

    // TeamRadar save-state: persist into localStorage so reloads keep edits.
    if (serviceId === 'teamradar' && action === 'save-state') {
      try {
        localStorage.setItem('teamradar.state', JSON.stringify(payload));
        return Promise.resolve(ok(payload) as ActionResult<T>);
      } catch {
        return Promise.resolve(err('action_failed', 'localStorage への保存に失敗しました'));
      }
    }

    // Business dashboard export: render a simple HTML/MD client-side.
    if (serviceId === 'business' && (action === 'export-dashboard' || action === 'export-dashboard-md')) {
      const isMd = action === 'export-dashboard-md';
      const ext = isMd ? '.md' : '.html';
      const content = isMd
        ? '# 事業ダッシュボード (ブラウザ版)\n\nブラウザ版では完全な事業データのエクスポートに対応していません。\nElectron 版または `npm run dev` で完全な機能をお試しください。\n'
        : '<!doctype html><html><head><meta charset="utf-8"><title>事業ダッシュボード</title></head><body style="font-family:sans-serif;padding:24px;background:#0f1117;color:#e6e8ec"><h1>事業ダッシュボード (ブラウザ版)</h1><p>ブラウザ版では完全な事業データのエクスポートに対応していません。</p><p>Electron 版または <code>npm run dev</code> で完全な機能をお試しください。</p></body></html>';
      const filename = 'business-dashboard' + ext;
      downloadBlob(filename, content, isMd ? 'text/markdown' : 'text/html');
      return Promise.resolve(
        ok({ path: filename, bytes: new Blob([content]).size, generatedAt: new Date().toISOString() }) as ActionResult<T>,
      );
    }

    return Promise.resolve(
      err(
        'action_not_found',
        `ブラウザ版では ${serviceId}/${action} は実行できません。Electron 版でお試しください。`,
      ),
    );
  },

  oauthSupported: (): Promise<boolean> => Promise.resolve(false),
  authorize: (): Promise<ActionResult<unknown>> =>
    Promise.resolve(err('not_supported', 'ブラウザ版では OAuth フローを実行しません')),
};

// Install only if no Electron preload has populated serviceHub already.
// `window.serviceHub` is typed in src/shared/bridge.d.ts as the Electron
// preload's bridge shape — our shim is assignable via duck-typing.
if (typeof window !== 'undefined' && !window.serviceHub) {
  (window as unknown as { serviceHub: typeof shim }).serviceHub = shim;
}
