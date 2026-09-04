/**
 * 書面だけを印刷する。
 *
 * アプリの UI (サイドバー・上部バー・チャット) は `styles.css` の
 * `@media print` が `body.ds-printing` の間だけ隠す。印刷が終わったら
 * (`afterprint`) 印を外して画面へ戻す。書類スタジオと金融機関提出用の
 * 書面が同じ入口を使う — 同じ判断を 2 か所に書かない。
 */
export function printDocument(doc: Document = document, win: Window = window): void {
  doc.body.classList.add('ds-printing');
  const cleanup = (): void => {
    doc.body.classList.remove('ds-printing');
    win.removeEventListener('afterprint', cleanup);
  };
  win.addEventListener('afterprint', cleanup);
  win.print();
}
