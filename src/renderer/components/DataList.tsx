import type { ReactNode } from 'react';

/**
 * 第三者 API 由来の画像 URL を `https:` / `http:` / `data:image/*` に限定する。
 * 許可スキーム以外は `undefined` を返し、呼び出し側は `<img>` を描画しない。
 *
 * 2026-07 セキュリティ監査（多層防御 / 予防的）: 現在の呼び出し元は `<img src>` だけで、
 * `<img src="javascript:…">` からスクリプトは実行されないため既存の実害はない。
 * ただし同じ値が将来 `<a href>` / CSS `url()` / SVG `<use href>` / `openExternal` に
 * 流れた瞬間に `javascript:` や `data:text/html` が実行プリミティブになる。検証は
 * 描画箇所ごとではなく値の入口（このヘルパー）に置き、リファクタで守りが消えないようにする。
 *
 * 実装メモ:
 *  - 空文字ではなく `undefined` を返す。`src=""` はページ自身を再取得してしまうため、
 *    「属性を付けない」ことが正しい失敗形。
 *  - HTML の URL 属性はパース前に tab/LF/CR を除去するので、検証側でも同じ正規化を
 *    しないと `java\tscript:` 型でスキーム判定を回避できる。検証した文字列をそのまま返す。
 *  - `data:image/svg+xml` は `<img>` 内ではスクリプト無効だが、`<use>` / `<object>` では
 *    有効になる。本ヘルパーは `<img>` 用であり、他要素へ流用する免罪符ではない。
 *  - 許可スキームは main / web-shim の `openExternal`（http(s) allowlist）と同じ方針。
 */
export function safeImageSrc(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const normalized = url.replace(/[\t\n\r]/g, '').trim();
  if (/^https?:\/\//i.test(normalized)) return normalized;
  // `data:image/<subtype>` のみ。`;base64,` でも `,` 直結でも可。
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(normalized)) return normalized;
  return undefined;
}

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

export function DataList({ items, empty }: Props) {
  if (items.length === 0) {
    return <div className="empty">{empty ?? 'データがありません'}</div>;
  }

  return (
    <ul className="data-list">
      {items.map((item) => {
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
    </ul>
  );
}
