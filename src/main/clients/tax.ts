import { buildTaxSnapshot, type TaxSnapshot } from '../../shared/taxSnapshot';
import type { FetchContext } from './types';

/**
 * 税務試算 — 所得税 / 住民税 / 消費税 / 給与手取りの概算シミュレーション
 * + 節税制度の案内 + 公式ツールへの導線。
 *
 * **納付・申告の自動実行は行わない。** e-Tax / 国税庁 / 会計ソフトは本人認証 +
 * 電子証明書が前提で、自動操作は規約・法令 (税理士法) 上不可。本サービスは
 * ローカルの純粋計算 (`src/shared/taxCalc.ts` など) と公式サイトへの
 * openExternal リンクのみを提供する。計算結果は概算で、確定申告は
 * 税理士 / 公式ツールで。
 *
 * 本 fetcher が返すのは「利用できる試算メニュー」の一覧だけ。実際の数値は
 * ページ側でユーザー入力に対して純粋計算がその場で計算する。メニューの
 * 組み立ては `shared/taxSnapshot.ts` の `buildTaxSnapshot` (ブラウザ版の
 * web-shim も同じ関数を呼ぶ)。資格情報も通信も使わないので
 * `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */
export type { TaxSnapshot };

export async function fetchTaxSnapshot(_ctx: FetchContext): Promise<TaxSnapshot> {
  return buildTaxSnapshot();
}
