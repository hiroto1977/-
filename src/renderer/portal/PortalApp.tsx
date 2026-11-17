/**
 * 社外向けポータルの殻 (パートナー / カスタマーへ配る単一 HTML の画面 · 2026-11-11)。
 *
 * 並ぶのは台帳 `shared/portal.mamori` に名指しした画面だけ。画面を開く道は 1 本 ——
 * 上の並び (ボタン) も URL のハッシュも、関門 `portalScreenOrNull` を通ってから `PortalScreenView` へ渡る。
 * 関門が断ったハッシュ (社内の画面の id・知らない綴り) は、今の画面のまま無視する。
 *
 * `pages` はこの HTML に入っているアプリの画面の表 (入口のファイルが組む)。保管庫・設定・AI・外部サービス
 * 連携はここに無い。資格情報を預からないので、ロック画面も無い。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { externalPortalScreens, PORTALS, portalScreenOrNull, portalScreenRef, type VettedPortalScreen } from '../../shared/portal';
import { portalContentFor } from './portalContent';
import { PortalScreenView, type PortalPageRegistry } from './PortalScreenView';
import type { ExternalPortalId } from './portalShim';

/** URL のハッシュ (`#docstudio` / `#/docstudio`) → 画面の綴り。 */
function screenFromHash(hash: string): string {
  return hash.replace(/^#\/?/, '').trim();
}

function currentHash(): string {
  return typeof location !== 'undefined' ? location.hash : '';
}

/** このポータルの先頭の画面。台帳が空なら組めない (配る物が無い)。 */
function firstScreen(portal: ExternalPortalId): VettedPortalScreen {
  const first = externalPortalScreens(portal)[0];
  const vetted = first === undefined ? null : portalScreenOrNull(portal, first.id);
  if (vetted === null) throw new Error('ポータルの台帳に画面が 1 つも無い: ' + portal);
  return vetted;
}

export function PortalApp({
  portal,
  pages,
  footer,
}: {
  portal: ExternalPortalId;
  pages: PortalPageRegistry;
  /** 画面の下に置く物 (この端末に残した入力を消す口など)。入口のファイルが渡す。 */
  footer?: ReactNode;
}) {
  const [screen, setScreen] = useState<VettedPortalScreen>(
    () => portalScreenOrNull(portal, screenFromHash(currentHash())) ?? firstScreen(portal),
  );
  const ref = portalScreenRef(screen);
  const def = PORTALS.find((p) => p.id === portal);
  const label = def?.label ?? 'ポータル';
  const company = portalContentFor(portal).company;
  const screens = externalPortalScreens(portal);
  const current = screens.find((s) => s.id === ref.screen);

  // 画面 → URL ハッシュ (戻る / 進む・直リンク)。
  useEffect(() => {
    try {
      const h = '#' + ref.screen;
      if (location.hash !== h) location.hash = h;
    } catch {
      /* location 不在環境 */
    }
  }, [ref.screen]);

  // URL ハッシュ → 画面。関門が断った綴りは無視する (今の画面のまま)。
  useEffect(() => {
    function onHash() {
      const next = portalScreenOrNull(portal, screenFromHash(currentHash()));
      if (next !== null) setScreen(next);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [portal]);

  useEffect(() => {
    try {
      document.title = label + ' — ' + company;
    } catch {
      /* document 不在環境 */
    }
  }, [label, company]);

  function open(id: string) {
    const next = portalScreenOrNull(portal, id);
    if (next !== null) setScreen(next);
  }

  return (
    <div data-portal-app={portal} style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <header
        style={{
          background: 'var(--panel)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 16px',
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>{label}</h1>
          <span data-portal-company style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {company}
          </span>
        </div>
        <nav aria-label={label + 'の画面'} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {screens.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              data-portal-nav={s.id}
              aria-current={s.id === ref.screen ? 'page' : undefined}
              onClick={() => open(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      <main style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
        <h2 data-portal-screen-title style={{ fontSize: 16, margin: '0 0 12px' }}>
          {current?.label ?? label}
        </h2>
        <PageErrorBoundary label={current?.label ?? label} key={ref.screen}>
          <PortalScreenView screen={screen} pages={pages} />
        </PageErrorBoundary>
      </main>
      <footer
        style={{
          padding: '12px 16px 24px',
          maxWidth: 1100,
          margin: '0 auto',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.7,
        }}
      >
        <p data-portal-footnote style={{ margin: '0 0 8px' }}>
          この頁はお使いの端末の中だけで動きます。入力した内容が {company} へ自動で送られることはありません。
        </p>
        {footer}
      </footer>
    </div>
  );
}
