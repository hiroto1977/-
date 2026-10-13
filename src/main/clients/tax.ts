import { createSnapshotStub } from './snapshotStub';

/**
 * 税務試算 — 所得税 / 住民税 / 消費税 / 給与手取りの概算シミュレーション
 * + 節税制度の案内 + 公式ツールへの導線 (snapshot 専用)。
 *
 * **納付・申告の自動実行は行わない。** e-Tax / 国税庁 / 会計ソフトは本人認証 +
 * 電子証明書が前提で、自動操作は規約・法令 (税理士法) 上不可。本サービスは
 * ローカルの純粋計算 (`src/shared/taxCalc.ts`) と公式サイトへの openExternal
 * リンクのみを提供する。計算結果は概算で、確定申告は税理士 / 公式ツールで。
 *
 * snapshot は「利用できる試算メニュー」の一覧 (静的)。実際の数値はページ側で
 * ユーザー入力に対して `taxCalc` がその場で計算する。
 */

export interface TaxSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: TaxSnapshot = {
  items: [
    { id: 'income', name: '所得税の概算 (累進課税 + 復興特別所得税 2.1%)' },
    { id: 'resident', name: '住民税の概算 (所得割 10% + 均等割)' },
    { id: 'consumption', name: '消費税の計算 (標準 10% / 軽減 8%)' },
    { id: 'net-salary', name: '給与手取りの概算 (社保・控除込み)' },
  ],
};

export const fetchTaxSnapshot = createSnapshotStub<TaxSnapshot>(STUB);
