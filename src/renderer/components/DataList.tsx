import type { ReactNode } from 'react';

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
      {items.map((item) => (
        <li key={item.key} className="data-list-item">
          {item.thumbnailUrl ? (
            <img className="data-list-thumb" src={item.thumbnailUrl} alt="" loading="lazy" />
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
      ))}
    </ul>
  );
}
