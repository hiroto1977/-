/**
 * ポータルの一覧 (社内版の中の入口 · 2026-11-11)。
 *
 * 社内 / パートナー / カスタマーの 3 つを切り替え、**その対象者に出す画面だけ**を並べる。
 * - 社内: アプリのすべての画面 (分類ごと)。
 * - パートナー / カスタマー: 台帳 `shared/portal.mamori` に名指しした画面だけ。ここで見えるのは、
 *   配る単一 HTML (`dist/portal-partner.html` / `dist/portal-customer.html`) に入る画面の下見である。
 *
 * 画面を開くときは必ず関門 `portalScreenOrNull` を通す —— 一覧に並べた id であっても、開く口が受けるのは
 * 印つきの値だけ (`PortalScreenView`)。アプリの画面は村の窓へ渡し (`onOpenService`)、会社が載せる頁は
 * この一覧の中に開く。
 */
import { useEffect, useState } from 'react';
import {
  externalPortalScreens,
  PORTALS,
  portalScreenOrNull,
  portalScreenRef,
  type PortalId,
  type VettedPortalScreen,
} from '../../shared/portal';
import { isServiceId, type ServiceId } from '../../shared/serviceId';
import { CATEGORY_LABEL, SERVICES, type ServiceCategory } from '../services';
import { PortalScreenView } from './PortalScreenView';

const CATEGORY_ORDER: readonly ServiceCategory[] = ['featured', 'professionals', 'tools', 'integrations'];

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 } as const;
const CARD = { textAlign: 'left', padding: '10px 12px', minHeight: 44, display: 'grid', gap: 2 } as const;
const MUTED = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 } as const;

export function PortalDirectory({
  portal,
  onSelectPortal,
  onOpenService,
}: {
  portal: PortalId;
  onSelectPortal: (portal: PortalId) => void;
  onOpenService: (id: ServiceId) => void;
}) {
  // 一覧の中に開いている「会社が載せる頁」。ポータルを切り替えたら閉じる。
  const [published, setPublished] = useState<VettedPortalScreen | null>(null);
  useEffect(() => setPublished(null), [portal]);

  const def = PORTALS.find((p) => p.id === portal);

  function open(screen: string) {
    const vetted = portalScreenOrNull(portal, screen);
    if (vetted === null) return;
    const ref = portalScreenRef(vetted);
    if (ref.kind === 'published') {
      setPublished(vetted);
      return;
    }
    if (isServiceId(ref.screen)) onOpenService(ref.screen);
  }

  return (
    <div data-portal-directory={portal}>
      <div role="group" aria-label="ポータルの切り替え" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
        {PORTALS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip"
            data-portal-tab={p.id}
            aria-pressed={p.id === portal}
            onClick={() => onSelectPortal(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {def !== undefined && (
        <div data-portal-about style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{def.label}</h2>
          <p style={{ ...MUTED, margin: 0 }}>
            対象: {def.audience} ／ {def.summary}
          </p>
          <p style={{ ...MUTED, margin: 0 }}>届け方: {def.delivery}</p>
        </div>
      )}

      {portal === 'internal' ? (
        CATEGORY_ORDER.map((cat) => {
          const items = SERVICES.filter((s) => s.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} data-portal-category={cat} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>
                {CATEGORY_LABEL[cat]} <span style={MUTED}>{items.length} 画面</span>
              </h3>
              <div style={GRID}>
                {items.map((s) => (
                  <button key={s.id} type="button" data-portal-screen={s.id} style={CARD} onClick={() => open(s.id)}>
                    <strong style={{ fontSize: 13 }}>{s.label}</strong>
                    <span style={MUTED}>{s.description}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <>
          <p style={{ ...MUTED, margin: '0 0 8px' }}>
            ここに並ぶ画面だけが、配る HTML に入ります。社内の画面・保管庫・外部サービスへの接続は入りません。
          </p>
          <div style={GRID}>
            {externalPortalScreens(portal).map((s) => (
              <button key={s.id} type="button" data-portal-screen={s.id} style={CARD} onClick={() => open(s.id)}>
                <strong style={{ fontSize: 13 }}>{s.label}</strong>
                <span style={MUTED}>{s.why}</span>
              </button>
            ))}
          </div>
          {published !== null && (
            <div data-portal-preview style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <PortalScreenView screen={published} pages={{}} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
