/**
 * 経営ハイライトのしきい値設定 — 永続化レイヤ。
 *
 * `managementHighlights` の判定しきい値 (連続下落・労働分配率・単一チャネル依存) を
 * ユーザーが調整して保存するための型と検証。値はローカルの record store に
 * 単一レコードで保存する (最新の 1 件を採用)。本モジュールは IO を持たない。
 */
import { DEFAULT_HIGHLIGHT_THRESHOLDS, type HighlightThresholds } from './managementHighlights';

export const HIGHLIGHT_SETTINGS_COLLECTION = 'highlight-settings';

/** 保存用レコード (HighlightThresholds + record store 互換)。 */
export interface HighlightSettings extends Record<string, unknown>, HighlightThresholds {}

/**
 * 入力を検証して clean な HighlightSettings に整える。未入力/空は既定値で補完。
 * - 連続下落の警告/危険期数は 1 以上の整数、危険 ≥ 警告。
 * - 各 % しきい値は 0..100。
 */
export function parseHighlightSettings(input: {
  declineWarnStreak?: unknown;
  declineCriticalStreak?: unknown;
  laborShareWarnPct?: unknown;
  singleChannelWarnPct?: unknown;
}): HighlightSettings {
  const d = DEFAULT_HIGHLIGHT_THRESHOLDS;
  const intMin1 = (v: unknown, fallback: number, label: string): number => {
    if (v == null || v === '') return fallback;
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 1) throw new Error(`${label}は 1 以上の整数で入力してください`);
    return n;
  };
  const pct = (v: unknown, fallback: number, label: string): number => {
    if (v == null || v === '') return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${label}は 0〜100 の数値で入力してください`);
    return Math.round(n * 10) / 10;
  };

  const declineWarnStreak = intMin1(input.declineWarnStreak, d.declineWarnStreak, '連続下落(警告)期数');
  const declineCriticalStreak = intMin1(input.declineCriticalStreak, d.declineCriticalStreak, '連続下落(危険)期数');
  if (declineCriticalStreak < declineWarnStreak) {
    throw new Error('連続下落(危険)期数は警告期数以上で入力してください');
  }
  return {
    declineWarnStreak,
    declineCriticalStreak,
    laborShareWarnPct: pct(input.laborShareWarnPct, d.laborShareWarnPct, '労働分配率の警告しきい値'),
    singleChannelWarnPct: pct(input.singleChannelWarnPct, d.singleChannelWarnPct, '単一チャネル依存の警告しきい値'),
  };
}
