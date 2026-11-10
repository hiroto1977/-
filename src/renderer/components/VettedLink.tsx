import type { CSSProperties, ReactNode } from 'react';
import type { VettedExternalUrl } from '../../shared/vetted';
import { linkSpoofWarning } from '../../shared/linkSpoof';

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
 * ★ **見かけと行き先の食い違いは押す前に見せる** (乗っ取り防止): 表示に書いたドメインと行き先が違う・
 * 行き先が似た文字 (punycode) のドメイン、のとき警告の 1 文をリンクの横に出す (`linkSpoofWarning`)。
 * **リンクは今までどおり開ける** —— 関門が見るのは行き先の形で、利用者が読む表示との整合ではないので、
 * 止めずに手がかりを見せる側を足した。表示が文字列でない子 (画像など) は食い違いを判定しない。
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
  const spoof = linkSpoofWarning(href, labelText(children) ?? '');
  const link = (
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
  if (spoof === null) return link;
  return (
    <>
      {link}
      <span
        role="note"
        data-link-spoof={spoof.kind}
        style={{ marginLeft: 6, fontSize: '0.85em', color: 'var(--text-muted)' }}
      >
        ⚠ {spoof.message}
      </span>
    </>
  );
}

/** 子が文字列 (の並び) のときだけ表示文字として読む。要素・画像が混ざれば `null` (食い違いは判定しない)。 */
function labelText(children: ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    let out = '';
    for (const c of children) {
      if (typeof c === 'string') out += c;
      else if (typeof c === 'number') out += String(c);
      else return null;
    }
    return out;
  }
  return null;
}
