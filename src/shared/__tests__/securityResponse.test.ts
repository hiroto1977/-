/** パス 261 — 安全の判定を作る応答 (HIBP / VirusTotal) は欄を 1 つずつ要求する。 */
import { describe, expect, it } from 'vitest';
import { hibpBreaches, vtScanStats } from '../securityResponse';

const GOOD = {
  Name: 'Adobe',
  Title: 'Adobe',
  BreachDate: '2013-10-04',
  PwnCount: 152445165,
  DataClasses: ['Email addresses', 'Password hints'],
};

describe('hibpBreaches — 通す', () => {
  it('形の合った 1 件を写す', () => {
    expect(hibpBreaches([GOOD])).toEqual([
      {
        name: 'Adobe',
        title: 'Adobe',
        date: '2013-10-04',
        pwnCount: 152445165,
        dataClasses: ['Email addresses', 'Password hints'],
      },
    ]);
  });

  it('空の配列は通す (404 を 200+[] に正規化するプロキシが在り得る)', () => {
    expect(hibpBreaches([])).toEqual([]);
  });

  it('DataClasses が無い / 型違いなら空の配列にする (欄は落とすが件は通す)', () => {
    expect(hibpBreaches([{ ...GOOD, DataClasses: undefined }])[0]?.dataClasses).toEqual([]);
    expect(hibpBreaches([{ ...GOOD, DataClasses: 'nope' }])[0]?.dataClasses).toEqual([]);
    expect(hibpBreaches([{ ...GOOD, DataClasses: ['ok', 7] }])[0]?.dataClasses).toEqual(['ok']);
  });
});

describe('hibpBreaches — 断る', () => {
  /**
   * ★ パス 261 の本体。直す前は `as […]` だったので、この 4 つが
   * **「名前も日付も件数も空の漏洩 1 件」**として画面の一覧に並んだ。
   */
  it.each([
    ['文字列の要素', ['x']],
    ['null の要素', [null]],
    ['空のオブジェクト', [{}]],
    ['Name だけ', [{ Name: 'A' }]],
    ['欄の型が全部違う', [{ Name: 123, Title: {}, BreachDate: [], PwnCount: 'many', DataClasses: 'nope' }]],
  ])('%s はでっち上げずに断る', (_label, raw) => {
    expect(() => hibpBreaches(raw)).toThrow(/HIBP API の応答/);
    // 対照: 直す前の式はここで「1 件の漏洩」を作っていた。
    const naive = (raw as { Name?: unknown }[]).map((b) => ({ name: b?.Name }));
    expect(naive).toHaveLength(1);
  });

  it.each([
    ['オブジェクト', {}],
    ['null', null],
    ['文字列', 'hello'],
    ['数値', 3],
  ])('配列でない応答 (%s) は断る', (_label, raw) => {
    expect(() => hibpBreaches(raw)).toThrow('HIBP API の応答が JSON の配列ではありません');
  });

  it('★ 1 件でも形が合わなければ全体を断る (部分的に読めた一覧は安全の判断にならない)', () => {
    expect(() => hibpBreaches([GOOD, {}, GOOD])).toThrow('HIBP API の応答に Name');
  });
});

describe('vtScanStats', () => {
  const STATS = { harmless: 70, malicious: 2, suspicious: 1, undetected: 5 };
  const wrap = (stats: unknown) => ({ data: { attributes: { last_analysis_stats: stats } } });

  it('4 つの内訳を読む (0 も通す)', () => {
    expect(vtScanStats(wrap(STATS))).toEqual(STATS);
    expect(vtScanStats(wrap({ harmless: 0, malicious: 0, suspicious: 0, undetected: 0 }))).toEqual({
      harmless: 0,
      malicious: 0,
      suspicious: 0,
      undetected: 0,
    });
  });

  /**
   * ★ 直す前は `as {…}` だったので、この 4 つから **NaN の「検出数」**が出来た。
   * 危険な URL を安全に見せうるので、数えられないなら数え上げない。
   */
  it.each([
    ['malicious が無い', { harmless: 70, suspicious: 1, undetected: 5 }],
    ['suspicious が文字列', { ...STATS, suspicious: '1' }],
    ['undetected が null', { ...STATS, undetected: null }],
    ['harmless が NaN', { ...STATS, harmless: NaN }],
  ])('%s → 断る (NaN を作らない)', (_label, stats) => {
    expect(() => vtScanStats(wrap(stats))).toThrow(/VirusTotal API の応答に/);
    /*
     * 対照: 直す前の読み方は**この 4 つを黙って受けた**。何が出来たかは欄によって
     * 違う —— `NaN` (欄が無い)・文字列連結 `'21'` (`2 + '1'`)・そして
     * **finite だが嘘の数** (`null` は 0 に化けるので 78 が 73 になる)。
     * 「非数になる」と一括りにすると誤りなので、対照は**断らなかったこと**に当てる。
     */
    const n = (k: string) => (stats as Record<string, number>)[k] as number;
    const naive = () => ({
      positives: n('malicious') + n('suspicious'),
      total: n('harmless') + n('malicious') + n('suspicious') + n('undetected'),
    });
    expect(naive).not.toThrow();
  });

  it.each([
    ['data が無い', {}],
    ['attributes が無い', { data: {} }],
    ['last_analysis_stats が無い', { data: { attributes: {} } }],
    ['本文が null', null],
    ['本文が配列', []],
  ])('入れ子が欠けた応答 (%s) は相手先を名指して断る', (_label, raw) => {
    expect(() => vtScanStats(raw)).toThrow(/VirusTotal API の応答/);
  });
});
