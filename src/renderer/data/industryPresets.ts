/**
 * 業種別のハイライトしきい値プリセット。
 *
 * round 33 のしきい値設定 (HighlightThresholds) を、業種ごとの一般的な水準で
 * ワンクリック適用できるよう用意したプリセット集。ユーザーは手動調整の代わりに
 * 業種を選ぶだけで妥当な初期値を得られる。純粋データ + 取得関数のみで IO を持たない。
 *
 * **重要 — 数値は中小企業の一般的な目安で、業種・規模・地域で適正値は異なります。**
 * 財務・税務助言ではありません。
 */
import { DEFAULT_HIGHLIGHT_THRESHOLDS, type HighlightThresholds } from './managementHighlights';

/** プリセットの識別子。 */
export type IndustryPresetId = 'default' | 'retail' | 'manufacturing' | 'saas' | 'service';

/** 1 つの業種プリセット。 */
export interface IndustryPreset {
  readonly id: IndustryPresetId;
  readonly label: string;
  readonly note: string;
  readonly thresholds: HighlightThresholds;
}

export const INDUSTRY_PRESETS: readonly IndustryPreset[] = [
  {
    id: 'default',
    label: '汎用 (既定)',
    note: '業種を問わない標準的な目安。',
    thresholds: DEFAULT_HIGHLIGHT_THRESHOLDS,
  },
  {
    id: 'retail',
    label: '小売・EC',
    note: '原価率が高く労働分配率は低め。季節変動があるため連続下落は長めに見る。',
    thresholds: {
      declineWarnStreak: 3,
      declineCriticalStreak: 4,
      laborShareWarnPct: 45,
      singleChannelWarnPct: 55,
    },
  },
  {
    id: 'manufacturing',
    label: '製造',
    note: '設備・原価の比重が大きく、特定取引先への依存が起きやすい。',
    thresholds: {
      declineWarnStreak: 2,
      declineCriticalStreak: 3,
      laborShareWarnPct: 50,
      singleChannelWarnPct: 50,
    },
  },
  {
    id: 'saas',
    label: 'SaaS・IT',
    note: '人件費比率が高く、解約は早期に効くため連続下落を短く検知。',
    thresholds: {
      declineWarnStreak: 2,
      declineCriticalStreak: 3,
      laborShareWarnPct: 70,
      singleChannelWarnPct: 60,
    },
  },
  {
    id: 'service',
    label: 'サービス・士業',
    note: '労働集約的で人件費比率が高い。少数顧客への依存に注意。',
    thresholds: {
      declineWarnStreak: 2,
      declineCriticalStreak: 3,
      laborShareWarnPct: 75,
      singleChannelWarnPct: 50,
    },
  },
];

/** id からプリセットを取得 (未知は default)。 */
export function getIndustryPreset(id: IndustryPresetId | string): IndustryPreset {
  return INDUSTRY_PRESETS.find((p) => p.id === id) ?? INDUSTRY_PRESETS[0]!;
}
