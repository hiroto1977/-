import { aiEgressNoticeLines, type AiEgressSubject } from '../../shared/aiEgressNotice';

/**
 * **AI へ何を送るかの断り (画面側)。**
 *
 * 文面は `shared/aiEgressNotice.ts` が 1 か所で持つ。ここは並べるだけ ——
 * 5 つの画面が同じ物を刷るので、CLAUDE.md の
 * 「視覚的な部品が 2 つ以上の画面で要るなら `components/` へ」に従う
 * (2026-09-09 · パス 106)。
 *
 * `data-ai-egress` を付けるのは、**送る画面すべてに断りが在ること**を検査が
 * 走査するための印。新しい AI の画面が黙って増えたら、その走査が鳴る。
 */
export function AiEgressNotice({ subject }: { readonly subject: AiEgressSubject }) {
  const lines = aiEgressNoticeLines(subject);
  return (
    <div
      data-ai-egress
      style={{
        fontSize: 12,
        lineHeight: 1.7,
        padding: '8px 10px',
        marginBottom: 12,
        border: '1px solid var(--border)',
        borderRadius: 6,
        color: 'var(--text-mute)',
      }}
    >
      {lines.map((line, i) => (
        <div key={line}>{i === 0 ? <strong style={{ color: 'var(--text)' }}>{line}</strong> : line}</div>
      ))}
    </div>
  );
}
