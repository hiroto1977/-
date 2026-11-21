/**
 * 画面の名前に添える英語の組み立て (2026-11-20)。
 *
 * 描く側 (`components/ServiceName.tsx`) と、字だけで出す側 (`title` 属性・読み上げ名) が
 * 同じ形を使うように、文字列の組み立てはここに 1 つ置く。
 */

/** 「(GitHub)」。英語が空か、日本語の名前と同じ綴りなら何も添えない (「ホーム (ホーム)」にしない)。 */
export function englishInParens(label: string, english: string): string {
  const en = english.trim();
  if (en === '' || en === label.trim()) return '';
  return `(${en})`;
}

/** 「ギットハブ (GitHub)」。字だけで出す所で使う。 */
export function nameWithEnglish(label: string, english: string): string {
  const en = englishInParens(label, english);
  return en === '' ? label : `${label} ${en}`;
}
