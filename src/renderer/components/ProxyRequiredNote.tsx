import { proxyRequiredNote } from '../../shared/buildDestinations';
import { useBuildKind } from '../hooks/useBuildKind';

/**
 * **この書き込みは、ブラウザ版ではプロキシの登録が要る** (2026-09-25 · パス 459)。
 *
 * 文面と「いつ言うか」の判断は `shared/buildDestinations.ts` の
 * `proxyRequiredNote` が 1 か所で持つ (`.tsx` は変異検査の母集団の外)。
 * ここは**並べるだけ** —— 部品にしたのは同じ断りが 7 画面で要るためで、
 * CLAUDE.md の「視覚的な部品が 2 つ以上の画面で要るなら `components/` へ」に従う。
 *
 * `data-proxy-required` は、**プロキシを通る書き込みを持つ画面すべてに
 * 断りが在ること**を検査が走査するための印
 * (`__tests__/proxyRequiredNoticeCensus.test.ts` が母集団を実装から導く)。
 *
 * **置く所はフォームの中の先頭** —— 押した後ではなく、打ち始める前に読ませる。
 */
export function ProxyRequiredNote({ what }: { readonly what: string }) {
  const kind = useBuildKind();
  const note = proxyRequiredNote(kind, what);
  if (note === null) return null;
  return (
    <div
      data-proxy-required
      role="note"
      style={{
        fontSize: 12,
        lineHeight: 1.6,
        padding: '8px 10px',
        border: '1px solid var(--border)',
        borderRadius: 6,
        color: 'var(--text-mute)',
      }}
    >
      {note}
    </div>
  );
}
