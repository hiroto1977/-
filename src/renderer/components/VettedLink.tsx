import type { CSSProperties, ReactNode } from 'react';
import type { VettedExternalUrl } from '../../shared/vetted';

/**
 * **外へ出る `<a href>` の唯一の口** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * `<a href>` は素の `string` を受けるので、関門 (`externalUrlOrNull`) を飛ばした値を渡しても `tsc` は何も言わない。
 * しかも左クリックを `onClick` で `openExternal` へ回しても、**中クリック・右クリックの「新しいタブで開く」・
 * ドラッグは `click` を起こさず、素の属性をそのまま辿る** (パス 298 が実測した形)。だから `href` に載る値そのものが
 * 関門を通っていなければならない。ここは `href` を**関門が作る印つきの型 `VettedExternalUrl` だけ**で受ける:
 *
 * ```
 *   <VettedLink href={src.url}>…</VettedLink>                 // error TS2322: 'string' is not assignable to 'VettedExternalUrl'
 *   <VettedLink href={externalUrlOrNull(u)!}>…</VettedLink>   // 関門の戻り値だけが渡せる
 * ```
 *
 * 左クリックは今までどおり `serviceHub.openExternal` (OS のブラウザ) へ回す。`rel="noopener noreferrer"` は
 * ここで固定する —— 素の属性で開かれた頁が `window.opener` 経由でこの頁 (保管庫と同じオリジン) を
 * 書き換えられないように (reverse tabnabbing)。
 *
 * 関門は Mamori で書いてある (`src/shared/externalUrlGate.mamori`)。この部品は JSX なので Mamori の外で、
 * 型の守りは TypeScript が持つ。動的な `href={…}` が**このファイルの外に 1 つも無い**ことは
 * `src/shared/__tests__/vettedTypes.test.ts` が見る。
 */
export function VettedLink({
  href,
  children,
  style,
  className,
}: {
  readonly href: VettedExternalUrl;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        void window.serviceHub?.openExternal(href);
      }}
      style={style}
      className={className}
    >
      {children}
    </a>
  );
}
