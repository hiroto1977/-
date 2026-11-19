/**
 * 税務試算の「利用できる試算メニュー」の台帳。
 *
 * 実際の数値はページ側で利用者の入力に対して `shared/taxCalc.ts` などの
 * 純粋計算がその場で出す。ここに在るのは **どの試算が使えるか** の一覧だけで、
 * 利用者の金額は 1 件も持たない。
 *
 * **組み立てはここに 1 つだけ置く** —— 主プロセスの fetcher
 * (`main/clients/tax.ts`) とブラウザ版の `web-shim.ts` が同じ関数を呼ぶ。
 * 片方だけに置くと、もう片方が別の物 (または未実装) を返すようになる
 * (水耕栽培 `shared/hydroponicsControl.ts` と同じ形・パス 118 の教訓)。
 *
 * 納付・申告の自動実行は行わない。e-Tax / 国税庁 / 会計ソフトは本人認証 +
 * 電子証明書が前提で、自動操作は規約・法令 (税理士法) 上不可。本サービスは
 * ローカルの純粋計算と公式サイトへの導線だけを提供する。
 */

export interface TaxSnapshot {
  items: { id: string; name: string }[];
}

export function buildTaxSnapshot(): TaxSnapshot {
  return {
    items: [
      { id: 'income', name: '所得税の概算 (累進課税 + 復興特別所得税 2.1%)' },
      { id: 'resident', name: '住民税の概算 (所得割 10% + 均等割)' },
      { id: 'consumption', name: '消費税の計算 (標準 10% / 軽減 8%)' },
      { id: 'net-salary', name: '給与手取りの概算 (社保・控除込み)' },
    ],
  };
}
