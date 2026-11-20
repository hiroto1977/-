/**
 * 画面の名前を「日本語 (英語)」で描く (2026-11-20 · 利用者の依頼「全て日本語と英語を併記して」)。
 *
 * 名前は日本語 (`label`) で、英語 (`english`) はその後ろにかっこで添える —— 「ギットハブ (GitHub)」。
 * 英語の側は少し小さく描く (`.name-en`)。色は周りの字と同じ物を継ぐ: 名前は塗りの上 (選択中の項・
 * 上部の帯) にも載るので、薄い色にすると塗りごとに対比を測り直すことになる。
 *
 * 文の中で画面を名指しするとき (「ギットハブ」の画面) は `label` だけを書く。ここを使うのは、
 * 名前そのものを見出しや一覧の項として出す所である。
 */
import { englishInParens } from '../serviceName';

export function ServiceName({ label, english }: { label: string; english: string }) {
  const en = englishInParens(label, english);
  return (
    <>
      {label}
      {en === '' ? null : <span className="name-en"> {en}</span>}
    </>
  );
}
