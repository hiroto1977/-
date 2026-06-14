/**
 * AIカウンセラーの確証済み知識ベース (出典つき)。
 *
 * カウンセリングが提示する相談窓口は人命に関わるため、**国・自治体・運営団体など
 * 複数の独立した媒体で裏が取れたものだけ**を載せる ({@link verifyClaim} の既定方針)。
 * 各窓口に裏付け出典 (URL) を添え、テストで「全窓口が確証済み」を不変条件化する。
 * 収集は Web 検索で人が行い、ここへの取り込みは PR レビューを通す (無検証の自動採用はしない)。
 *
 * 検証日: 2026-06 (再検証の手順は docs/COUNSELOR_KNOWLEDGE.md)。
 */

import type { SourcedClaim, EvidenceSource } from './sourceVerification';

/** 確証済みの相談窓口 (value は counseling.ts の SUPPORT_RESOURCES と対応)。 */
export interface VerifiedResource {
  readonly label: string;
  readonly detail: string;
}

// 出典 URL・名称は事実データ (文字列リテラルは表現)。Stryker から除外する。
// Stryker disable all
const MHLW_MAMOROU: EvidenceSource = {
  url: 'https://www.mhlw.go.jp/mamorouyokokoro/',
  type: 'government',
  label: '厚生労働省「まもろうよ こころ」',
};

/**
 * 各相談窓口と、その番号を裏付ける独立出典。2026-06 に Web 検索で多媒体照合済み:
 * いずれも 国(厚労省) + 運営団体 + 自治体 など 2 件以上・公的 1 件以上を満たす。
 */
export const VERIFIED_SUPPORT_RESOURCES: readonly SourcedClaim<VerifiedResource>[] = [
  {
    value: { label: 'いのちの電話 (ナビダイヤル)', detail: '0570-783-556（10:00〜22:00）' },
    sources: [
      { url: 'https://www.since2011.net/', type: 'operator', label: '日本いのちの電話連盟' },
      { url: 'https://web.pref.hyogo.lg.jp/kf09/denwasoudan.html', type: 'municipality', label: '兵庫県' },
      { url: 'https://nara-inochi.jp/m1_9.html', type: 'operator', label: '奈良いのちの電話協会' },
      MHLW_MAMOROU,
    ],
  },
  {
    value: { label: 'よりそいホットライン', detail: '0120-279-338（24時間・通話無料）' },
    sources: [
      MHLW_MAMOROU,
      { url: 'https://www.since2011.net/yorisoi/', type: 'operator', label: '社会的包摂サポートセンター' },
      { url: 'https://www.town.miyake.lg.jp/soshiki/10/1087.html', type: 'municipality', label: '三宅町' },
    ],
  },
  {
    value: { label: 'こころの健康相談統一ダイヤル', detail: '0570-064-556（公的機関の相談窓口へ接続）' },
    sources: [
      {
        url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/jisatsu/kokoro_dial.html',
        type: 'government',
        label: '厚生労働省 自殺対策',
      },
      { url: 'https://www.pref.yamanashi.jp/kenko-zsn/j-taisaku/kokoro.html', type: 'municipality', label: '山梨県' },
      { url: 'https://www.city.osaka.lg.jp/kenko/page/0000555283.html', type: 'municipality', label: '大阪市' },
    ],
  },
];
// Stryker restore all
