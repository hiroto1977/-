import type { ReactElement } from 'react';
import { refusalNote, saveRefusalNote } from '../data/inputGuards';

/**
 * **判定の代わりに出す断り。** ⛔ (`level: 'fatal'`) の欄を名指しして
 * 「この判定は算定していません」と述べる (パス 206 で敷地プランナー用に作り、
 * パス 209 で試算の段・投資信託にも使うので部品にした)。
 *
 * `labels` が空なら何も描かない —— 呼び手が分岐しなくていい。
 * 文面は `refusalNote` / `saveRefusalNote` が 1 か所で持つ (綴りを 2 か所に書かない)。
 *
 * `kind`: 既定は `'judgement'` (「この判定は算定していません」)。`'save'` は
 * **書かなかった**ことを述べる (パス 214) —— 判定は出し直せるが、保存した値は
 * 残って以後すべての集計と書面がそれを読むので、同じ文面では嘘になる。
 */
export function RefusedFieldsNote(
  { labels, kind = 'judgement' }: { labels: readonly string[]; kind?: 'judgement' | 'save' },
): ReactElement | null {
  const note = kind === 'save' ? saveRefusalNote(labels) : refusalNote(labels);
  if (note === null) return null;
  return (
    <div
      role="alert"
      data-refused-fields
      style={{ fontSize: 12, lineHeight: 1.6, color: '#f87171', marginBottom: 12 }}
    >
      {note}
    </div>
  );
}
