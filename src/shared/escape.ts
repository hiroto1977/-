/**
 * マークアップに文字列を埋めるときのエスケープ — アプリ全体で 1 つだけ持つ。
 *
 * 同じ実装が main の 3 モジュールと renderer の 1 画面に写経されていた。
 * この種の関数を複数持つのは危険で、片方だけ文字を足し忘れると「その画面だけ
 * エスケープが漏れている」という状態になり、しかも見た目には現れない。
 *
 * 5 文字（& < > " '）を落とす。HTML にも XML にも同じ集合で足りる。
 * & を最初に置換するのは、後から置換した実体参照の & をもう一度置換しないため。
 */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
