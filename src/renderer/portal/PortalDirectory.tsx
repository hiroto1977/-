/**
 * ポータルの一覧 (社内版の中の入口 · 2026-11-11)。
 *
 * 社内 / パートナー / カスタマーの 3 つを切り替え、**その対象者に出す画面だけ**を並べる。
 * - 社内: アプリのすべての画面を**業務マップ**として並べる (2026-11-23) —— 6 つの業務区分と共通基盤
 *   (`data/businessArea.ts`) ごとに、受け持つ業務・画面・人の確認が要る画面・外へ送る画面を 1 枚で見せる。
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
import { SERVICES } from '../services';
import {
  AREA_DUTY,
  AREA_EMOJI,
  AREA_LABEL,
  AREA_ORDER,
  LAYER_LABEL,
  areaOf,
  needsHumanApproval,
  sendsOutside,
} from '../data/businessArea';
import { ServiceName } from '../components/ServiceName';
import { PortalScreenView } from './PortalScreenView';

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
        <>
          <p style={{ ...MUTED, margin: '0 0 12px' }} data-business-map-legend>
            業務マップ —— 全社の業務を 6 つの区分と共通基盤に分けて並べています。
            👤 は外へ書き込む・消すなど<strong>人の確認が要る</strong>操作のある画面、
            📤 は端末の外 (外部サービス・AI) へ送る操作のある画面です。
          </p>
          {AREA_ORDER.map((area) => {
            const items = SERVICES.filter((s) => areaOf(s.id).area === area);
            if (items.length === 0) return null;
            const approvals = items.filter((s) => needsHumanApproval(s.id)).length;
            return (
              <section key={area} data-portal-area={area} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, margin: '0 0 2px' }}>
                  <span aria-hidden="true">{AREA_EMOJI[area]} </span>
                  {AREA_LABEL[area]} <span style={MUTED}>{items.length} 画面{approvals > 0 ? `・人の確認 ${approvals}` : ''}</span>
                </h3>
                <p style={{ ...MUTED, margin: '0 0 6px' }}>{AREA_DUTY[area]}</p>
                <div style={GRID}>
                  {items.map((s) => {
                    const placed = areaOf(s.id);
                    return (
                      <button key={s.id} type="button" data-portal-screen={s.id} style={CARD} onClick={() => open(s.id)}>
                        <span style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 13 }}>
                            <ServiceName label={s.label} english={s.english} />
                          </strong>
                          {needsHumanApproval(s.id) ? <span title="人の確認が要る操作がある" aria-label="人の確認が要る" data-needs-approval>👤</span> : null}
                          {sendsOutside(s.id) ? <span title="端末の外へ送る操作がある" aria-label="外へ送る" data-sends-outside>📤</span> : null}
                        </span>
                        <span style={MUTED}>
                          {placed.layer === undefined ? '' : `${LAYER_LABEL[placed.layer]} · `}
                          {placed.why}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
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
