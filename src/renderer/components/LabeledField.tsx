import type { ReactNode } from 'react';

/**
 * 入力欄 1 つと、その上に出す名前。
 *
 * 欄の名前を欄の中の薄い字 (placeholder) だけで出すと、打った瞬間に名前が消える ——
 * 何の欄だったかを確かめるには消して読み直すほか無い。名前は欄の外 (上) に置く。
 * `<label>` で包むので、名前を押しても欄に入れる (読み上げにもその名前で出る)。
 */
export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>{label}</span>
      {children}
    </label>
  );
}
