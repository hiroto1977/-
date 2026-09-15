import { voiceEgressNoticeLines, type VoiceEgressSubject } from '../../shared/voiceEgressNotice';

/**
 * **マイクの声についての断り (画面側)。**
 *
 * 文面は `shared/voiceEgressNotice.ts` が 1 か所で持つ。ここは並べるだけ ——
 * マイクの入口は 2 つ (全画面の `VoiceCommandBar` と `VillagePage`) なので、
 * CLAUDE.md の「視覚的な部品が 2 つ以上の画面で要るなら `components/` へ」に従う
 * (2026-09-09 · パス 108)。
 *
 * `data-voice-egress` を付けるのは、**マイクを開く入口すべてに断りが在ること**を
 * 検査が走査するための印。3 つ目の入口が黙って増えたら、その走査が鳴る。
 *
 * `compact` は見出し行の帯 (`VoiceCommandBar` は画面上端の細い列に居るので、
 * 文字を小さくして詰める)。文面は変えない —— 場所で言うことを変えない。
 */
export function VoiceEgressNotice({
  subject,
  compact = false,
}: {
  readonly subject: VoiceEgressSubject;
  readonly compact?: boolean;
}) {
  const lines = voiceEgressNoticeLines(subject);
  return (
    <div
      data-voice-egress
      style={{
        fontSize: compact ? 11 : 12,
        lineHeight: 1.6,
        padding: compact ? '4px 6px' : '8px 10px',
        marginBottom: compact ? 0 : 12,
        border: '1px solid var(--border)',
        borderRadius: 6,
        color: 'var(--text-mute)',
        maxWidth: compact ? 520 : undefined,
      }}
    >
      {lines.map((line, i) => (
        <div key={line}>
          {i === 0 ? <strong style={{ color: 'var(--text)' }}>{line}</strong> : line}
        </div>
      ))}
    </div>
  );
}
