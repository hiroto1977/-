/**
 * 計算書類 4 点を**個別に**記載・出力するための切り分け。
 *
 * 会社法435条2項の計算書類は 貸借対照表・損益計算書・株主資本等変動計算書・個別注記表 の
 * 4 点。書類スタジオはこれまで 4 点を 1 つの書式として扱い、入力欄も書面もまとめて
 * 出していた。実務では「公告用に貸借対照表だけ」「注記表の文言だけ直す」のように
 * 1 点ずつ扱う場面が多いので、書面ごとに入力欄と書面を切り替えられるようにする。
 *
 * **値の入れ物は 1 つのまま。** 損益計算書の当期純利益は貸借対照表の繰越利益剰余金と
 * 株主資本等変動計算書の当期変動額に流れ、株主資本等変動計算書の当期末残高は
 * 貸借対照表の純資産の部と一致しなければならない。書面ごとに別々の入力を持たせると
 * この連結が切れ、貸借だけ合っていて利益が反映されていない書面が出来上がる。
 * ここでやるのは「どの欄を見せるか・どの書面を出すか」の切り分けだけで、
 * 値はどの書面から入れても同じ 1 つの科目残高に入る。
 */

import { ACCOUNTS, type Section } from './statementAccounts';
import type { DocField } from './docStudioData';

/** 書面の選択。`all` は従来どおり 4 点（＋決算公告の要旨）をまとめて出す。 */
export type KessanSheet = 'all' | 'pl' | 'bs' | 'equity' | 'notes';

export interface KessanSheetDef {
  readonly id: KessanSheet;
  /** タブに出す短い名前。 */
  readonly label: string;
  /** 他の画面から開くときの書類 id（`navigateTo('docstudio', { doc })`）。 */
  readonly docId: string;
  /** 書面の正式名（法定の呼び名）。 */
  readonly title: string;
  /** 印刷 / PDF の説明に使う一言。 */
  readonly note: string;
}

export const KESSAN_SHEETS: readonly KessanSheetDef[] = [
  { id: 'all', label: '4点まとめて', docId: 'kessan', title: '計算書類（4点）', note: '4 点と決算公告の要旨をまとめて出力します。' },
  { id: 'pl', label: '損益計算書', docId: 'kessan-pl', title: '損益計算書', note: '損益計算書だけを出力します。当期純利益は貸借対照表と株主資本等変動計算書へ引き継がれます。' },
  { id: 'bs', label: '貸借対照表', docId: 'kessan-bs', title: '貸借対照表', note: '貸借対照表と決算公告の要旨を出力します。繰越利益剰余金には損益計算書の当期純利益を含めます。' },
  { id: 'equity', label: '株主資本等変動計算書', docId: 'kessan-equity', title: '株主資本等変動計算書', note: '株主資本等変動計算書だけを出力します。当期末残高は貸借対照表の純資産の部と一致します。' },
  { id: 'notes', label: '個別注記表', docId: 'kessan-notes', title: '個別注記表', note: '個別注記表だけを出力します。金額は他の 3 点から引きます。' },
];

/** 書類 id → 書面。`kessan` は 4 点まとめて。知らない id は null。 */
export function sheetOfDoc(docId: string): KessanSheet | null {
  const def = KESSAN_SHEETS.find((s) => s.docId === docId);
  return def ? def.id : null;
}

/** 書面 → 書類 id（法的区分・事業仕分け・遷移で使う）。 */
export function docIdOfSheet(sheet: KessanSheet): string {
  return KESSAN_SHEETS.find((s) => s.id === sheet)!.docId;
}

export function sheetDef(sheet: KessanSheet): KessanSheetDef {
  return KESSAN_SHEETS.find((s) => s.id === sheet)!;
}

/** 損益計算書に載る区分。 */
const PL_SECTIONS: readonly Section[] = ['revenue', 'cogs', 'sga', 'non-op-income', 'non-op-expense', 'extra-income', 'extra-loss', 'tax'];
/** 貸借対照表に載る区分。 */
const BS_SECTIONS: readonly Section[] = [
  'current-asset', 'fixed-asset', 'deferred-asset', 'current-liability', 'fixed-liability',
  'capital', 'capital-surplus', 'retained-earnings',
];
/** 株主資本等変動計算書に載る区分（純資産の部）。 */
const EQUITY_SECTIONS: readonly Section[] = ['capital', 'capital-surplus', 'retained-earnings'];

const accountKeys = (sections: readonly Section[]): string[] =>
  ACCOUNTS.filter((a) => sections.includes(a.section)).map((a) => a.k);

/** 当期の株主資本の変動を表す入力（株主資本等変動計算書の中身）。 */
const EQUITY_MOVEMENT_KEYS = ['retainedEarningsOpening', 'dividends', 'reserveTransfer', 'newShares', 'newSharesSurplus'] as const;
/** 個別注記表の文言。 */
const NOTE_KEYS = ['inventoryPolicy', 'depreciationPolicy', 'allowancePolicy', 'consumptionTaxPolicy', 'contingent', 'otherNote'] as const;

/**
 * 書面ごとに見せる入力欄のキー。`all` は null（すべて）。
 *
 * 貸借対照表は繰越利益剰余金の期首残高と当期の変動（配当・積立・増資）で期末の純資産を
 * 組むので、変動の入力も貸借対照表側に含める。個別注記表は配当額と発行済株式数を
 * 注記に書くので、その 2 つも含める。
 */
export function sheetKeys(sheet: KessanSheet): ReadonlySet<string> | null {
  switch (sheet) {
    case 'all':
      return null;
    case 'pl':
      return new Set(['company', 'fyStart', 'fyEnd', ...accountKeys(PL_SECTIONS)]);
    case 'bs':
      return new Set(['company', 'fyEnd', ...EQUITY_MOVEMENT_KEYS, ...accountKeys(BS_SECTIONS)]);
    case 'equity':
      return new Set(['company', 'fyStart', 'fyEnd', ...EQUITY_MOVEMENT_KEYS, 'sharesIssued', ...accountKeys(EQUITY_SECTIONS)]);
    case 'notes':
      return new Set(['company', 'fyEnd', 'dividends', 'sharesIssued', ...NOTE_KEYS]);
  }
}

/** 書面に見せる入力欄（元の並び順を保つ）。 */
export function fieldsForSheet(sheet: KessanSheet, fields: readonly DocField[]): readonly DocField[] {
  const keys = sheetKeys(sheet);
  if (keys === null) return fields;
  return fields.filter((f) => keys.has(f.k));
}

/**
 * その書面で「他の書面の入力から引き継ぐ」値の説明。書面を 1 点ずつ扱っても連結が
 * 切れていないことを、入力欄の上で言葉にしておく（黙って引き継ぐと、なぜ合計が
 * 動くのか分からない）。
 */
export function inheritedNote(sheet: KessanSheet): string | null {
  switch (sheet) {
    case 'all':
    case 'pl':
      return null;
    case 'bs':
      return '当期純利益は損益計算書の入力から引き継ぎ、繰越利益剰余金（期末）に含めます。損益計算書の科目はそのタブで入力してください。';
    case 'equity':
      return '当期純利益は損益計算書から、当期末残高は貸借対照表と同じ科目残高から引き継ぎます。';
    case 'notes':
      return '減価償却累計額・配当額などの金額は他の 3 点の入力から引きます。ここでは会計方針の文言と発行済株式数を入れます。';
  }
}
