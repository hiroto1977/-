import { describe, expect, it } from 'vitest';
import { ACCOUNTS } from '../statementAccounts';
import type { DocField } from '../docStudioData';
import {
  KESSAN_SHEETS,
  docIdOfSheet,
  fieldsForSheet,
  inheritedNote,
  sheetDef,
  sheetKeys,
  sheetOfDoc,
  type KessanSheet,
} from '../kessanSheets';

/*
 * 計算書類 4 点を個別に記載する切り分け (2026-09-05、依頼「計算書類4点を個別に記載出来る仕様にして」)。
 *
 * 守るのは 2 つ: (1) どの書面からも入力できる欄を落とさない —— 4 つの単独書面の欄を
 * 合わせると「まとめて」と同じ集合になる、(2) 書面に関係ない欄は見せない —— 損益計算書に
 * 貸借対照表の科目が出ない。
 */

/** 書類スタジオの KESSAN_FIELDS と同じ並び (会社名・事業年度・変動・科目・注記)。 */
const FIELDS: readonly DocField[] = [
  { k: 'company', req: true, label: '会社名' },
  { k: 'fyStart', label: '事業年度（自）' },
  { k: 'fyEnd', req: true, label: '事業年度（至）' },
  { k: 'retainedEarningsOpening', num: true, label: '繰越利益剰余金（期首残高）' },
  { k: 'dividends', num: true, label: '当期の剰余金の配当' },
  { k: 'reserveTransfer', num: true, label: '当期の利益準備金への積立額' },
  { k: 'newShares', num: true, label: '当期の新株発行（資本金の増加額）' },
  { k: 'newSharesSurplus', num: true, label: '当期の新株発行（資本剰余金の増加額）' },
  { k: 'sharesIssued', num: true, label: '発行済株式の総数（株）' },
  ...ACCOUNTS.map((a) => ({ k: a.k, num: true as const, label: a.name })),
  { k: 'inventoryPolicy', label: '注記: 資産の評価基準及び評価方法' },
  { k: 'depreciationPolicy', label: '注記: 固定資産の減価償却の方法' },
  { k: 'allowancePolicy', label: '注記: 引当金の計上基準' },
  { k: 'consumptionTaxPolicy', label: '注記: 消費税等の会計処理' },
  { k: 'contingent', label: '注記: 保証債務その他の偶発債務' },
  { k: 'otherNote', label: '注記: その他' },
];
const keysOf = (sheet: KessanSheet) => fieldsForSheet(sheet, FIELDS).map((f) => f.k);
const account = (k: string) => ACCOUNTS.find((a) => a.k === k)!;

describe('KESSAN_SHEETS — 4 点 + まとめて', () => {
  it('書面は 5 つで、書類 id と正式名が 1 対 1', () => {
    expect(KESSAN_SHEETS.map((s) => s.id)).toEqual(['all', 'pl', 'bs', 'equity', 'notes']);
    expect(KESSAN_SHEETS.map((s) => s.docId)).toEqual(['kessan', 'kessan-pl', 'kessan-bs', 'kessan-equity', 'kessan-notes']);
    expect(KESSAN_SHEETS.map((s) => s.title)).toEqual(['計算書類（4点）', '損益計算書', '貸借対照表', '株主資本等変動計算書', '個別注記表']);
    for (const s of KESSAN_SHEETS) {
      expect(sheetDef(s.id)).toBe(s);
      expect(docIdOfSheet(s.id)).toBe(s.docId);
      expect(sheetOfDoc(s.docId)).toBe(s.id);
      expect(s.note.length).toBeGreaterThan(10);
    }
  });

  it('対照: 知らない書類 id は null (就業規則や書式 id を計算書類と取り違えない)', () => {
    expect(sheetOfDoc('shugyo')).toBeNull();
    expect(sheetOfDoc('kessan-')).toBeNull();
    expect(sheetOfDoc('')).toBeNull();
  });
});

describe('fieldsForSheet — 書面ごとの入力欄', () => {
  it('「まとめて」は全欄をそのまま返す (同じ配列)', () => {
    expect(fieldsForSheet('all', FIELDS)).toBe(FIELDS);
    expect(sheetKeys('all')).toBeNull();
  });

  it('損益計算書: 会社名・事業年度と損益の科目だけ。貸借対照表の科目・注記・当期変動は出ない', () => {
    const keys = keysOf('pl');
    expect(keys.slice(0, 3)).toEqual(['company', 'fyStart', 'fyEnd']);
    expect(keys).toContain('sales');
    expect(keys).not.toContain('cash');
    expect(keys).not.toContain('dividends');
    expect(keys).not.toContain('otherNote');
    for (const k of keys.slice(3)) expect(['revenue', 'cogs', 'sga', 'non-op-income', 'non-op-expense', 'extra-income', 'extra-loss', 'tax'], k).toContain(account(k).section);
  });

  it('貸借対照表: 資産・負債・純資産の科目と当期の変動。損益の科目と注記は出ない', () => {
    const keys = keysOf('bs');
    expect(keys).toContain('cash');
    expect(keys).toContain('retainedEarningsOpening');
    expect(keys).toContain('dividends');
    expect(keys).not.toContain('sales');
    expect(keys).not.toContain('fyStart');
    expect(keys).not.toContain('otherNote');
    const accountsShown = keys.filter((k) => ACCOUNTS.some((a) => a.k === k));
    for (const k of accountsShown) expect(['current-asset', 'fixed-asset', 'deferred-asset', 'current-liability', 'fixed-liability', 'capital', 'capital-surplus', 'retained-earnings'], k).toContain(account(k).section);
  });

  it('株主資本等変動計算書: 純資産の科目と当期の変動・発行済株式数。資産・負債・損益の科目は出ない', () => {
    const keys = keysOf('equity');
    expect(keys).toContain('retainedEarningsOpening');
    expect(keys).toContain('newShares');
    expect(keys).toContain('sharesIssued');
    expect(keys).not.toContain('cash');
    expect(keys).not.toContain('sales');
    const accountsShown = keys.filter((k) => ACCOUNTS.some((a) => a.k === k));
    expect(accountsShown.length).toBeGreaterThan(0);
    for (const k of accountsShown) expect(['capital', 'capital-surplus', 'retained-earnings'], k).toContain(account(k).section);
  });

  it('個別注記表: 注記の文言と配当額・発行済株式数だけ。科目残高は出ない', () => {
    const keys = keysOf('notes');
    expect(keys).toEqual(['company', 'fyEnd', 'dividends', 'sharesIssued', 'inventoryPolicy', 'depreciationPolicy', 'allowancePolicy', 'consumptionTaxPolicy', 'contingent', 'otherNote']);
  });

  it('★ 4 つの単独書面の欄を合わせると「まとめて」と同じ集合 (個別にしたせいで入れられない欄が無い)', () => {
    const union = new Set([...keysOf('pl'), ...keysOf('bs'), ...keysOf('equity'), ...keysOf('notes')]);
    expect([...union].sort()).toEqual(FIELDS.map((f) => f.k).sort());
  });

  it('元の並び順を保つ (書面の表示順のまま入力できる)', () => {
    for (const sheet of ['pl', 'bs', 'equity', 'notes'] as const) {
      const keys = keysOf(sheet);
      const positions = keys.map((k) => FIELDS.findIndex((f) => f.k === k));
      expect(positions, sheet).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('対照: 欄の一覧に無いキーは返さない (書面の集合が欄を増やすことはない)', () => {
    const few: DocField[] = [{ k: 'company', label: '会社名' }, { k: 'sales', label: '売上高' }];
    expect(fieldsForSheet('bs', few).map((f) => f.k)).toEqual(['company']);
  });
});

describe('inheritedNote — 引き継ぎの説明', () => {
  it('貸借対照表・株主資本等変動計算書・個別注記表には引き継ぎの説明があり、損益計算書とまとめてには無い', () => {
    expect(inheritedNote('bs')).toContain('当期純利益');
    expect(inheritedNote('equity')).toContain('当期末残高');
    expect(inheritedNote('notes')).toContain('他の 3 点');
    expect(inheritedNote('pl')).toBeNull();
    expect(inheritedNote('all')).toBeNull();
  });
});
