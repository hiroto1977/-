/**
 * record store の中身の形 (`data/collectionShapes.ts`) —— 復元が封筒しか見ていなかった穴。
 *
 * collection ごとに「書く側の形の標本」を置き、必須の欄は壊す/消すと落ち、任意の欄は
 * 消すと通り・型違いと null は落ちる、を機械的に回す。列挙値は書く側の一覧を参照するので
 * 一覧の外の値を 1 つずつ当てる。既知の collection が台帳から漏れていないことは
 * `*_COLLECTION` 定数の走査で留める (走査が 0 件なら空振りとして落とす)。
 *
 * **走査は原文を読むので `readOriginalSource` を通す。** 変異検査は台帳のファイルを
 * 書き換えてから走らせるので、sandbox の中の文字に当てると 0 件になる —— 実際に
 * 2026-09-07 の全件走査で、この床が変異検査の初回実行を落として教えてくれた
 * (経緯は `src/shared/__tests__/originalSource.ts`)。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLLECTION_SHAPES, NESTED_PERSONAL_DATA, PERSONAL_DATA_FIELDS, hasCollectionShape, personalDataCollections } from '../collectionShapes';
import { readOriginalDir, readOriginalSource } from '../../../shared/__tests__/originalSource';
import { SAMPLES } from './collectionSamples';


/** 同じ欄に「型の違う値」を作る。 */
function wrongTyped(value: unknown): unknown {
  if (typeof value === 'string') return 123;
  if (typeof value === 'number') return 'x';
  if (typeof value === 'boolean') return 'yes';
  return 'x'; // object / array
}

const without = (rec: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...rec };
  delete copy[key];
  return copy;
};

describe('collection ごとの中身の形', () => {
  it('標本は 23 collection ぶんある (空振りでない)', () => {
    expect(Object.keys(SAMPLES).length).toBeGreaterThanOrEqual(23);
    expect(Object.keys(COLLECTION_SHAPES).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  for (const [collection, sample] of Object.entries(SAMPLES)) {
    describe(collection, () => {
      it('書く側の形は通る', () => {
        expect(hasCollectionShape(collection, sample.good)).toBe(true);
      });

      it('知らない欄が足されていても通る (新しい版の記録)', () => {
        expect(hasCollectionShape(collection, { ...sample.good, futureField: { deep: true } })).toBe(true);
      });

      for (const key of sample.required) {
        it(`必須 ${key}: 型が違えば落ち、無くても落ちる`, () => {
          expect(hasCollectionShape(collection, { ...sample.good, [key]: wrongTyped(sample.good[key]) })).toBe(false);
          expect(hasCollectionShape(collection, without(sample.good, key))).toBe(false);
        });
      }

      for (const key of sample.optional) {
        const nullable = (sample.nullable ?? []).includes(key);
        it(`任意 ${key}: 無ければ通り、型が違えば落ち、null は${nullable ? '「未入力」として通る (台帳 nullable)' : '落ちる'}`, () => {
          expect(hasCollectionShape(collection, without(sample.good, key))).toBe(true);
          expect(hasCollectionShape(collection, { ...sample.good, [key]: wrongTyped(sample.good[key]) })).toBe(false);
          // 台帳に無い欄の null は「在るのに違う」。台帳の欄だけ null = 未入力 (パス 122)。
          expect(hasCollectionShape(collection, { ...sample.good, [key]: null })).toBe(nullable);
        });
      }

      for (const [key, out] of sample.enumOut ?? []) {
        it(`列挙 ${key}: 一覧の外の値 '${out}' は落ちる`, () => {
          expect(hasCollectionShape(collection, { ...sample.good, [key]: out })).toBe(false);
        });
      }
    });
  }

  it('数値の欄は NaN / Infinity も落ちる (Number.isFinite)', () => {
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, amount: NaN })).toBe(false);
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, amount: Infinity })).toBe(false);
  });

  it('列挙は一覧の**全部**が通る (1 つだけ通る形に縮んでいないこと)', () => {
    for (const mode of ['auto', 'manual']) expect(hasCollectionShape('mutualfund-holdings', { ...SAMPLES['mutualfund-holdings']!.good, valuationMode: mode }), mode).toBe(true);
    for (const unit of ['yen', 'pct', 'count', 'days', 'months']) expect(hasCollectionShape('manual-metrics', { ...SAMPLES['manual-metrics']!.good, unit }), unit).toBe(true);
    for (const role of ['member', 'admin', 'owner']) expect(hasCollectionShape('team-members', { ...SAMPLES['team-members']!.good, role }), role).toBe(true);
    for (const status of ['相談予約', '相談中', '対応中', '完了']) expect(hasCollectionShape('shigyo-consultations', { ...SAMPLES['shigyo-consultations']!.good, status }), status).toBe(true);
    // 列挙の欄に文字列以外 (数値・null) が来ても投げずに落ちる
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, channel: 1 })).toBe(false);
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, channel: null })).toBe(false);
  });

  it('★ 日付の欄は暦に在る綴りだけ (型だけ見て 2026-02-30 を通していた —— パス 115)', () => {
    const sales = SAMPLES['sales-entries']!.good;
    const consult = SAMPLES['shigyo-consultations']!.good;
    const bs = SAMPLES['balance-sheet']!.good;
    const unit = SAMPLES['business-units']!.good;
    for (const bad of ['2026-02-30', '2026-13-01', '2026/04/01', '2026-04', '']) {
      expect(hasCollectionShape('sales-entries', { ...sales, date: bad }), `sales ${bad}`).toBe(false);
      expect(hasCollectionShape('shigyo-consultations', { ...consult, date: bad }), `consult ${bad}`).toBe(false);
    }
    // 基準日と開始時期は月だけでもよく、未入力 ('') も許す。
    for (const ok of ['', '2026-03', '2026-03-31']) {
      expect(hasCollectionShape('balance-sheet', { ...bs, asOf: ok }), `asOf ${ok}`).toBe(true);
      expect(hasCollectionShape('business-units', { ...unit, startedOn: ok }), `startedOn ${ok}`).toBe(true);
    }
    for (const bad of ['2026-02-30', '2026-13', '2026/03']) {
      expect(hasCollectionShape('balance-sheet', { ...bs, asOf: bad }), `asOf ${bad}`).toBe(false);
      expect(hasCollectionShape('business-units', { ...unit, startedOn: bad }), `startedOn ${bad}`).toBe(false);
    }
    // 運転管理 (パス 194)。測定日と播種日は日まで必要 (月だけは不可)。
    const reading = SAMPLES['hydroponics-readings']!.good;
    const batch = SAMPLES['hydroponics-batches']!.good;
    for (const bad of ['2026-02-30', '2026-13-01', '2026-09', '2026/09/13', '']) {
      expect(hasCollectionShape('hydroponics-readings', { ...reading, at: bad }), `at ${bad}`).toBe(false);
      expect(hasCollectionShape('hydroponics-batches', { ...batch, sowDate: bad }), `sowDate ${bad}`).toBe(false);
      // 定植日は **null (まだ) か、暦に在る日** —— 読めない綻りは落とす。
      expect(
        hasCollectionShape('hydroponics-batches', { ...batch, transplantedDate: bad }),
        `transplantedDate ${bad}`,
      ).toBe(false);
    }
    expect(hasCollectionShape('hydroponics-batches', { ...batch, transplantedDate: null })).toBe(true);
    expect(hasCollectionShape('hydroponics-batches', { ...batch, transplantedDate: '2026-09-25' })).toBe(true);
  });

  it('parameter-overrides.values は値が全部数値のときだけ通る', () => {
    expect(hasCollectionShape('parameter-overrides', { values: { a: 1, b: 2.5 } })).toBe(true);
    expect(hasCollectionShape('parameter-overrides', { values: { a: 1, b: '2' } })).toBe(false);
    expect(hasCollectionShape('parameter-overrides', { values: [1, 2] })).toBe(false);
  });

  it('知らない collection は通す (前方互換)。`constructor` も名前として合法で、判定関数扱いにならない', () => {
    expect(hasCollectionShape('some-future-collection', { anything: 1 })).toBe(true);
    expect(hasCollectionShape('constructor', { anything: 1 })).toBe(true);
    expect(hasCollectionShape('hasOwnProperty', {})).toBe(true);
  });
});

describe('台帳の網羅 — `*_COLLECTION` 定数はすべて登録されている', () => {
  it('src/renderer/data/*.ts の定数を走査する (0 件なら走査の死)', () => {
    const dir = path.resolve(__dirname, '..');
    const names = new Set<string>();
    for (const file of readOriginalDir(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readOriginalSource(path.join(dir, file));
      for (const m of src.matchAll(/^export const [A-Z_]*COLLECTION[A-Z_]* = '([a-z0-9-]+)'/gm)) names.add(m[1]!);
    }
    expect(names.size).toBeGreaterThanOrEqual(20);
    const missing = [...names].filter((n) => !Object.hasOwn(COLLECTION_SHAPES, n));
    expect(missing, `台帳に無い collection: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('mutualfund-holdings.ytdReturnPct — null は「未入力」として通す (パス 122)', () => {
  it('★ null は通り、無い欄も通り、数でない値は落ちる', () => {
    const good = SAMPLES['mutualfund-holdings']!.good;
    expect(hasCollectionShape('mutualfund-holdings', { ...good, ytdReturnPct: null })).toBe(true);
    const { ytdReturnPct: _drop, ...without } = good;
    expect(hasCollectionShape('mutualfund-holdings', without)).toBe(true);
    expect(hasCollectionShape('mutualfund-holdings', { ...good, ytdReturnPct: 'abc' })).toBe(false);
    expect(hasCollectionShape('mutualfund-holdings', { ...good, ytdReturnPct: Number.NaN })).toBe(false);
    // 取得額も null = 未入力 (パス 123)。対照: 銘柄コードの null は今までどおり「在るのに違う」
    expect(hasCollectionShape('mutualfund-holdings', { ...good, acquisitionCost: null })).toBe(true);
    expect(hasCollectionShape('mutualfund-holdings', { ...good, code: null })).toBe(false);
  });
});

describe('個人情報を持つ collection は欄の名前から導く (パス 130)', () => {
  it('★ email / phone の欄を持つ collection が走査で出る (チームメンバー・士業の連絡先)', () => {
    const found = Object.fromEntries(personalDataCollections().map((p) => [p.collection, p.fields]));
    expect(found['team-members']).toEqual(['email']);
    expect(found['shigyo-contacts']).toEqual(['phone', 'email']);
  });

  it('対照: 個人情報の欄を持たない collection は出ない (売上・KPI・貸借対照表・投信)', () => {
    const names = personalDataCollections().map((p) => p.collection);
    for (const c of ['sales-entries', 'kpi-actuals', 'balance-sheet', 'mutualfund-holdings']) expect(names).not.toContain(c);
    expect(names.length).toBeGreaterThanOrEqual(3);
  });

  it('入れ子の台帳は、実在する collection で、走査で既に出る物ではなく、理由と欄が空でない', () => {
    const scanned = new Set(
      Object.entries(COLLECTION_SHAPES)
        .filter(([, s]) => s.fields.some((f) => PERSONAL_DATA_FIELDS.includes(f)))
        .map(([c]) => c),
    );
    for (const [collection, entry] of Object.entries(NESTED_PERSONAL_DATA)) {
      expect(Object.hasOwn(COLLECTION_SHAPES, collection), `${collection} が台帳に無い`).toBe(true);
      expect(scanned.has(collection), `${collection} は走査で出るので台帳は要らない`).toBe(false);
      expect(entry.why.trim().length).toBeGreaterThan(0);
      expect(entry.fields.length).toBeGreaterThan(0);
    }
    expect(personalDataCollections().map((p) => p.collection)).toContain('bank-submission-settings');
  });

  it('形は欄の名前を添えている (fields) —— 判定は今までどおり', () => {
    const s = COLLECTION_SHAPES['team-members']!;
    expect(s.fields).toEqual(['name', 'email', 'role']);
    expect(s(SAMPLES['team-members']!.good)).toBe(true);
    expect(s({ ...SAMPLES['team-members']!.good, email: 7 })).toBe(false);
  });
});
