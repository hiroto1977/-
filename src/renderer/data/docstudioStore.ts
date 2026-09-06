/**
 * 書類スタジオの下書き (localStorage `servicehub.docstudio.v1`) の形。
 * 保存値は型が守らない —— 2026-09-05 に `kessanSheet: 'foo'` で画面が開くたびに落ちた。
 * 読むときは `sanitizeDocstudioStore` を通し、値の辞書は文字列の値だけを残す
 * (数値が紛れると `.trim()` で落ちる)。
 */
import { isKessanSheet, type KessanSheet } from './kessanSheets';
import { isRecord, stringRecord } from './persistedShape';

export type Values = Record<string, string>;

/**
 * 書類スタジオの書類の群れ。**型はここに置く** —— 保存値として書き戻すので、
 * 画面側だけが知っている union だと保存の検査 (`sanitizeDocstudioStore`) が書けない。
 */
export type DocstudioCollection = 'studio' | 'teikan' | 'shugyo' | 'kessan';

const COLLECTION_IDS: readonly DocstudioCollection[] = ['studio', 'teikan', 'shugyo', 'kessan'];

/** 端末に残した値が書類の群れか (`isKessanSheet` と同じ理由・同じ形)。 */
export function isDocstudioCollection(value: unknown): value is DocstudioCollection {
  return typeof value === 'string' && COLLECTION_IDS.some((id) => id === value);
}

export interface StoreShape {
  studio?: Record<string, Values>;
  teikan?: { kk?: Values; gk?: Values };
  shugyo?: Values;
  kessan?: Values;
  /**
   * 最後に開いていた書類の群れ。
   *
   * 2026-09-06 に計算書類 4 点を一覧の**独立したエントリ**にしたので、
   * 「どの書面か」(`kessanSheet`) だけでは開き直したときに戻れなくなった ——
   * 一覧のどのボタンを押していたかは群れの側が持っている。片方だけ保存すると
   * このファイルが `kessanSheet` について書いている「開き直しても同じ書面から
   * 続けられる」が**嘘になる**ので、対で保存する。
   */
  collection?: DocstudioCollection;
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
  if (isDocstudioCollection(value.collection)) out.collection = value.collection;
  if (isKessanSheet(value.kessanSheet)) out.kessanSheet = value.kessanSheet;
  if (Array.isArray(value.recent)) out.recent = value.recent.filter((id): id is string => typeof id === 'string');
  return out;
}
