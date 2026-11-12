/**
 * **ポータルの画面を開く唯一の口** (2026-11-11)。
 *
 * 受けるのは関門 `portalScreenOrNull` (`shared/portal.mamori`) が作る印つきの値だけ ——
 * URL のハッシュ・保存値・会話の出力などの素の文字列を渡すと `tsc` が断る:
 *
 * ```
 *   <PortalScreenView screen={location.hash.slice(1)} … />            // error TS2322: 'string' is not assignable to 'VettedPortalScreen'
 *   <PortalScreenView screen={portalScreenOrNull(portal, id)!} … />   // 関門の戻り値だけが渡せる
 * ```
 *
 * `pages` は**その出荷物に入っている画面**の表。社内版は全画面、社外向けの単一 HTML は台帳に名指しした
 * 画面だけを持つ (入口ごとに別の表を渡すので、社外向けの HTML は社内の画面を import しない)。
 * 表に無い画面は「入っていません」と述べる —— 関門が通しても、入っていない物は開けない。
 */
import type { ComponentType } from 'react';
import { lookup } from '../../shared/lookup';
import { portalScreenRef, type VettedPortalScreen } from '../../shared/portal';
import { isPublishedScreenId, PublishedScreen } from './PublishedScreen';

/** 画面の id → 部品。出荷物ごとに中身が違う。 */
export type PortalPageRegistry = Readonly<Record<string, ComponentType>>;

function Missing({ screen }: { screen: string }) {
  return (
    <p role="alert" data-portal-missing={screen} style={{ fontSize: 13, padding: 16 }}>
      この画面はこのポータルに入っていません。
    </p>
  );
}

export function PortalScreenView({ screen, pages }: { screen: VettedPortalScreen; pages: PortalPageRegistry }) {
  const ref = portalScreenRef(screen);
  if (ref.kind === 'published') {
    if (ref.portal === 'internal' || !isPublishedScreenId(ref.screen)) return <Missing screen={ref.screen} />;
    return <PublishedScreen portal={ref.portal} screen={ref.screen} />;
  }
  const Page = lookup(pages, ref.screen);
  if (Page === undefined) return <Missing screen={ref.screen} />;
  return <Page />;
}
