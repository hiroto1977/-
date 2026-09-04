import type { ReactNode } from 'react';
import { safeImageSrc } from '../../shared/imageUrlGate';

export interface DataListItem {
  key: string;
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  href?: string;
  thumbnailUrl?: string;
}

interface Props {
  items: DataListItem[];
  empty?: ReactNode;
}

/**
 * **一覧に描く件数の上限** (2026-08-29)。
 *
 * ## なぜ要るか
 *
 * `DataList` は 35 ページが共有する一覧の沈み先で、**そのうち 31 ページが
 * 件数を絞らずに渡している**。件数は第三者 API の応答が決め、上限は本文の
 * byte 上限 (10MiB) しか無い。
 *
 * 実測 (2026-08-29、`renderToString`):
 *
 * ```
 *      100 件   render     8ms   html  0.0MiB
 *   10,000 件   render   222ms   html  1.8MiB
 *  200,000 件   render 3,917ms   html 36.1MiB
 * ```
 *
 * レンダラーは 1 スレッドなので、これは**画面が 4 秒死ぬ**ということである。
 * ブラウザ版の一部サービスは**利用者が用意した Cloudflare Worker** を経由する
 * (`network/proxy.ts`)。このリポジトリは「乗っ取られた proxy」を攻撃者として
 * 既に数えている (`lint:regex` の頭) ので、応答の件数は信用できる量ではない。
 *
 * 同じ形を同日に `data/assistantMarkdown.ts` (描くブロック数) でも閉じた。
 * どちらも**産地ではなく沈み先**に置いてある —— 産地は 75 サービスあり、
 * 増えた日に片方だけ守られる。
 *
 * ## 値の決め方 (判断であって、典拠のある数字ではない)
 *
 * 出荷しているスナップショット全体で**最も長い一覧は 10 件**だった (実測)。
 * 生の API 応答も 1 ページぶんで数十件である。2,000 はその **2 桁上**で、
 * 正当な一覧では決して発火しない。当たっても上の表で 50ms 前後に収まる。
 */
export const MAX_LIST_ITEMS = 2000;

/** 打ち切ったことを黙らせない。件数ごと見える形で残す。 */
export function listTruncatedNotice(total: number): string {
  return `他 ${total - MAX_LIST_ITEMS} 件は表示していません（一覧は ${MAX_LIST_ITEMS} 件までです）`;
}

export function DataList({ items, empty }: Props) {
  if (items.length === 0) {
    return <div className="empty">{empty ?? 'データがありません'}</div>;
  }

  /*
   * 条件は書かない。`slice(0, n)` は**長さが n 以下なら全部返す**ので、
   * `items.length > MAX_LIST_ITEMS ? slice : items` の三項は結果を変えない
   * (違うのは配列の同一性だけで、誰も見ていない)。
   *
   * 実際に対照で確かめた —— 三項の `>` を `>=` にずらしても検査は**全部
   * 通った**。等価変異である。このリポジトリの規律どおり、pragma で黙らせる
   * より簡素にするほうを採る。打ち切りの有無は下の `shown.length` が持つ。
   */
  const shown = items.slice(0, MAX_LIST_ITEMS);

  return (
    <ul className="data-list">
      {shown.map((item) => {
        const thumbSrc = safeImageSrc(item.thumbnailUrl);
        return (
          <li key={item.key} className="data-list-item">
            {thumbSrc ? (
              <img className="data-list-thumb" src={thumbSrc} alt="" loading="lazy" />
            ) : null}
            <div className="data-list-body">
              <div className="data-list-title">{item.title}</div>
              {item.meta ? <div className="data-list-meta">{item.meta}</div> : null}
            </div>
            {item.badge ? <span className="badge">{item.badge}</span> : null}
            {item.href ? (
              <button
                className="data-list-open"
                onClick={() => window.serviceHub?.openExternal(item.href!)}
              >
                開く
              </button>
            ) : null}
          </li>
        );
      })}
      {shown.length < items.length ? (
        <li className="data-list-item data-list-truncated">
          <div className="data-list-body">
            <div className="data-list-meta">{listTruncatedNotice(items.length)}</div>
          </div>
        </li>
      ) : null}
    </ul>
  );
}
