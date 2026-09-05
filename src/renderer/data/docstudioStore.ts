/**
 * 書類スタジオの下書き (localStorage `servicehub.docstudio.v1`) の形。
 * 保存値は型が守らない —— 2026-09-05 に `kessanSheet: 'foo'` で画面が開くたびに落ちた。
 * 読むときは `sanitizeDocstudioStore` を通し、値の辞書は文字列の値だけを残す
 * (数値が紛れると `.trim()` で落ちる)。
 */
import { isKessanSheet, type KessanSheet } from './kessanSheets';
import { isRecord, stringRecord } from './persistedShape';

export type Values = Record<string, string>;

export interface StoreShape {
  studio?: Record<string, Values>;
  teikan?: { kk?: Values; gk?: Values };
  shugyo?: Values;
  kessan?: Values;
  /** 計算書類で選んでいる書面（4点まとめて / 1 点ずつ）。値の入れ物は kessan の 1 つのまま。 */
  kessanSheet?: KessanSheet;
  /** 最近使った書式 id（新しい順）。書式が増えたので探す手間を減らす。 */
  recent?: string[];
}

/** 形の合う欄だけを持つ下書き。オブジェクトでなければ空。 */
export function sanitizeDocstudioStore(value: unknown): StoreShape {
  if (!isRecord(value)) return {};
  const out: StoreShape = {};
  if (isRecord(value.studio)) {
    const studio: Record<string, Values> = {};
    for (const [id, v] of Object.entries(value.studio)) if (isRecord(v)) studio[id] = stringRecord(v);
    out.studio = studio;
  }
  if (isRecord(value.teikan)) {
    const teikan: { kk?: Values; gk?: Values } = {};
    if (isRecord(value.teikan.kk)) teikan.kk = stringRecord(value.teikan.kk);
    if (isRecord(value.teikan.gk)) teikan.gk = stringRecord(value.teikan.gk);
    out.teikan = teikan;
  }
  if (isRecord(value.shugyo)) out.shugyo = stringRecord(value.shugyo);
  if (isRecord(value.kessan)) out.kessan = stringRecord(value.kessan);
  if (isKessanSheet(value.kessanSheet)) out.kessanSheet = value.kessanSheet;
  if (Array.isArray(value.recent)) out.recent = value.recent.filter((id): id is string => typeof id === 'string');
  return out;
}
