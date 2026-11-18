import { describe, expect, it } from 'vitest';
import {
  NO_EXTRA_FIELDS,
  addFarmItem,
  farmItemIssues,
  farmListOrDefault,
  farmRefusalMessage,
  findFarmItem,
  isFarmBuiltinId,
  missingFarmBuiltins,
  nextCustomFarmId,
  removeFarmItem,
  restoreFarmBuiltins,
  sanitizeFarmItem,
  sanitizeFarmList,
  type FarmItem,
  type FarmListSpec,
} from '../farmProductList';
import { MAX_CROPS, MAX_CROP_LABEL_CHARS } from '../hydroponicCrops';

/**
 * 品目の一覧の純粋な処理 (2026-11-18)。検査用の小さな決まりを 1 つ置いて全経路を通す ——
 * 実物の決まり (養蜂・養殖) は、それぞれの検査が同じ関数へ渡す。
 */
type Field = 'low' | 'high' | 'days';
interface Extra {
  readonly tone: 'a' | 'b';
}
type Item = FarmItem<Field, Extra>;

const BUILTINS: readonly Item[] = [
  { id: 'one', label: 'いち', low: 1, high: 5, days: 10, tone: 'a' },
  { id: 'two', label: 'に', low: 2, high: 6, days: 20, tone: 'b' },
];

const SPEC: FarmListSpec<Field, Extra> = {
  noun: '品目',
  numericFields: ['low', 'high', 'days'],
  labels: { low: '下限', high: '上限', days: '日数' },
  bounds: {
    low: { min: 0, max: 10, integer: false },
    high: { min: 0, max: 10, integer: false },
    days: { min: 1, max: 100, integer: true },
  },
  orders: [{ low: 'low', high: 'high', message: '下限 ≦ 上限にしてください' }],
  extra: {
    issues: (raw) => (raw.tone === 'a' || raw.tone === 'b' ? [] : ['種類を選んでください']),
    pick: (raw) => ({ tone: raw.tone as 'a' | 'b' }),
  },
  builtins: BUILTINS,
};

const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'x1', label: 'なまえ', low: 1, high: 2, days: 3, tone: 'a', ...over,
});

describe('farmItemIssues — 1 件の形', () => {
  it('形の通った品目は指摘 0 件', () => {
    expect(farmItemIssues(SPEC, good())).toEqual([]);
  });

  it.each([null, undefined, 3, 'x', true])('物でない値 %j は「形が不正」の 1 件だけ', (raw) => {
    expect(farmItemIssues(SPEC, raw)).toEqual(['品目の形が不正です']);
  });

  it.each([
    ['数', 5],
    ['空文字', ''],
    ['大文字', 'ABC'],
    ['先頭がハイフン', '-a'],
    ['41 字', 'a'.repeat(41)],
  ])('id が %s なら断る', (_n, id) => {
    expect(farmItemIssues(SPEC, good({ id }))).toEqual(['品目の id が不正です']);
  });

  it('id は 40 字ちょうどまで通る', () => {
    expect(farmItemIssues(SPEC, good({ id: 'a'.repeat(40) }))).toEqual([]);
  });

  it.each([
    ['空文字', ''],
    ['空白だけ', '   '],
    ['文字列でない', 42],
  ])('名前が %s なら「名前を入力してください」', (_n, label) => {
    expect(farmItemIssues(SPEC, good({ label }))).toEqual(['品目の名前を入力してください']);
  });

  it('名前は上限ちょうどまで通り、1 文字超えると断る (文字で数える)', () => {
    expect(farmItemIssues(SPEC, good({ label: '😀'.repeat(MAX_CROP_LABEL_CHARS) }))).toEqual([]);
    expect(farmItemIssues(SPEC, good({ label: '😀'.repeat(MAX_CROP_LABEL_CHARS + 1) }))).toEqual([
      `品目の名前は ${MAX_CROP_LABEL_CHARS} 文字までです`,
    ]);
  });

  it('前後の空白は長さに数えない', () => {
    expect(farmItemIssues(SPEC, good({ label: `  ${'あ'.repeat(MAX_CROP_LABEL_CHARS)}  ` }))).toEqual([]);
  });

  it('名前に改行が在れば断る', () => {
    expect(farmItemIssues(SPEC, good({ label: 'あ\nい' }))).toEqual(['品目の名前に改行や制御文字は使えません']);
  });

  it.each([
    ['文字列の数', '5'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['下限より小さい', -0.1],
    ['上限より大きい', 10.1],
    ['欄が無い', undefined],
  ])('数値の欄が %s なら範囲の文で断る', (_n, v) => {
    expect(farmItemIssues(SPEC, good({ low: v, high: 10 }))).toEqual(['下限 は 0〜10 の数値で入力してください']);
  });

  it('範囲の端ちょうどは通る', () => {
    expect(farmItemIssues(SPEC, good({ low: 0, high: 10, days: 1 }))).toEqual([]);
    expect(farmItemIssues(SPEC, good({ low: 10, high: 10, days: 100 }))).toEqual([]);
  });

  it('整数の欄は小数を断り、「整数」と述べる', () => {
    expect(farmItemIssues(SPEC, good({ days: 1.5 }))).toEqual(['日数 は 1〜100 の整数で入力してください']);
  });

  it('整数でない欄は小数を通す', () => {
    expect(farmItemIssues(SPEC, good({ low: 1.5, high: 2.5 }))).toEqual([]);
  });

  it('下限 > 上限は、両方が範囲内のときだけ述べる', () => {
    expect(farmItemIssues(SPEC, good({ low: 5, high: 4 }))).toEqual(['下限 ≦ 上限にしてください']);
    // 等しいのは通る
    expect(farmItemIssues(SPEC, good({ low: 4, high: 4 }))).toEqual([]);
    // 片方が範囲外なら、範囲の指摘だけ (重ねない)
    expect(farmItemIssues(SPEC, good({ low: 5, high: 99 }))).toEqual(['上限 は 0〜10 の数値で入力してください']);
    expect(farmItemIssues(SPEC, good({ low: 99, high: 4 }))).toEqual(['下限 は 0〜10 の数値で入力してください']);
  });

  it('数値でない欄の指摘は最後に付く', () => {
    expect(farmItemIssues(SPEC, good({ tone: 'z', days: 0 }))).toEqual([
      '日数 は 1〜100 の整数で入力してください',
      '種類を選んでください',
    ]);
  });

  it('指摘は id → 名前 → 数値の順に並ぶ', () => {
    expect(farmItemIssues(SPEC, { id: 5, label: '', low: 'x', high: 1, days: 1, tone: 'a' })).toEqual([
      '品目の id が不正です',
      '品目の名前を入力してください',
      '下限 は 0〜10 の数値で入力してください',
    ]);
  });
});

describe('sanitizeFarmItem / sanitizeFarmList', () => {
  it('既知の欄だけを写し、名前は前後の空白を落とす', () => {
    expect(sanitizeFarmItem(SPEC, good({ label: '  なまえ  ', junk: 1 }))).toEqual({
      id: 'x1', label: 'なまえ', low: 1, high: 2, days: 3, tone: 'a',
    });
  });

  it('形の通らない品目は null', () => {
    expect(sanitizeFarmItem(SPEC, good({ days: 0 }))).toBeNull();
  });

  it('配列でなければ空', () => {
    expect(sanitizeFarmList(SPEC, { 0: good() })).toEqual([]);
    expect(sanitizeFarmList(SPEC, null)).toEqual([]);
  });

  it('通らない品目は捨て、id の重複は先勝ち', () => {
    const list = sanitizeFarmList(SPEC, [good({ label: '先' }), good({ days: 0, id: 'bad' }), good({ label: '後' }), good({ id: 'x2' })]);
    expect(list.map((c) => [c.id, c.label])).toEqual([['x1', '先'], ['x2', 'なまえ']]);
  });

  it(`件数は ${MAX_CROPS} で打ち切る`, () => {
    const many = Array.from({ length: MAX_CROPS + 5 }, (_, i) => good({ id: `n${i}`, label: `名${i}` }));
    const list = sanitizeFarmList(SPEC, many);
    expect(list).toHaveLength(MAX_CROPS);
    expect(list[MAX_CROPS - 1]!.id).toBe(`n${MAX_CROPS - 1}`);
  });

  it('保存が無い・壊れている・空なら参考の一覧、在ればその一覧', () => {
    expect(farmListOrDefault(SPEC, undefined)).toBe(BUILTINS);
    expect(farmListOrDefault(SPEC, [])).toBe(BUILTINS);
    expect(farmListOrDefault(SPEC, [good({ days: 0 })])).toBe(BUILTINS);
    expect(farmListOrDefault(SPEC, [good()])).toEqual([good()]);
  });
});

describe('一覧の増減', () => {
  it('空いている最小の custom-<n> を振る', () => {
    expect(nextCustomFarmId([])).toBe('custom-1');
    expect(nextCustomFarmId([{ id: 'custom-1', label: 'a' }, { id: 'custom-3', label: 'b' }])).toBe('custom-2');
    expect(nextCustomFarmId([{ id: 'custom-1', label: 'a' }, { id: 'custom-2', label: 'b' }])).toBe('custom-3');
  });

  it('足すと末尾に入り、id は機械が振る (入力の id は使わない)', () => {
    const r = addFarmItem(SPEC, BUILTINS, good({ id: 'injected' }));
    expect(r).toEqual({ ok: true, items: [...BUILTINS, { ...good(), id: 'custom-1' }] });
  });

  it('入力に誤りが在れば断り、指摘を添える', () => {
    const r = addFarmItem(SPEC, BUILTINS, good({ days: 0 }));
    expect(r).toEqual({
      ok: false,
      refusal: 'invalid',
      issues: ['品目の入力に誤りがあります', '日数 は 1〜100 の整数で入力してください'],
    });
  });

  it('同じ名前は断る (前後の空白を落として比べる)', () => {
    const r = addFarmItem(SPEC, BUILTINS, good({ label: ' いち ' }));
    expect(r).toEqual({ ok: false, refusal: 'duplicate-label', issues: ['同じ名前の品目が既にあります'] });
  });

  it(`${MAX_CROPS} 件在れば、入力を見る前に断る`, () => {
    const full = Array.from({ length: MAX_CROPS }, (_, i) => ({ ...BUILTINS[0]!, id: `n${i}`, label: `名${i}` }));
    const r = addFarmItem(SPEC, full, good({ days: 0 }));
    expect(r).toEqual({
      ok: false,
      refusal: 'full',
      issues: [`品目は ${MAX_CROPS} 件までです。使わない品目を消してから足してください`],
    });
    // 1 件少なければ足せる
    expect(addFarmItem(SPEC, full.slice(1), good()).ok).toBe(true);
  });

  it('消すとその 1 件だけが抜ける', () => {
    expect(removeFarmItem(SPEC, BUILTINS, 'one')).toEqual({ ok: true, items: [BUILTINS[1]] });
    expect(removeFarmItem(SPEC, BUILTINS, 'two')).toEqual({ ok: true, items: [BUILTINS[0]] });
  });

  it('一覧に無い id は断る (最後の 1 件の断りより先)', () => {
    expect(removeFarmItem(SPEC, [BUILTINS[0]!], 'nope')).toEqual({
      ok: false, refusal: 'not-found', issues: ['その品目は一覧にありません'],
    });
  });

  it('最後の 1 件は消せない', () => {
    expect(removeFarmItem(SPEC, [BUILTINS[0]!], 'one')).toEqual({
      ok: false, refusal: 'last-item', issues: ['最後の 1 件は消せません (一覧は空にできません)'],
    });
  });

  it('消えている参考の品目を数え、末尾に戻す', () => {
    const mine: Item = { ...good(), id: 'custom-1' } as Item;
    expect(missingFarmBuiltins(SPEC, [BUILTINS[1]!, mine])).toEqual([BUILTINS[0]]);
    expect(missingFarmBuiltins(SPEC, BUILTINS)).toEqual([]);
    expect(restoreFarmBuiltins(SPEC, [BUILTINS[1]!, mine])).toEqual({ ok: true, items: [BUILTINS[1], mine, BUILTINS[0]] });
  });

  it('戻すと上限を超えるなら断る (ちょうど上限なら戻せる)', () => {
    const fill = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ ...BUILTINS[0]!, id: `n${i}`, label: `名${i}` }));
    expect(restoreFarmBuiltins(SPEC, fill(MAX_CROPS - 1))).toEqual({
      ok: false, refusal: 'full', issues: [`品目は ${MAX_CROPS} 件までです。使わない品目を消してから足してください`],
    });
    expect(restoreFarmBuiltins(SPEC, fill(MAX_CROPS - 2)).ok).toBe(true);
  });

  it('参考の id かを答える', () => {
    expect(isFarmBuiltinId(SPEC, 'one')).toBe(true);
    expect(isFarmBuiltinId(SPEC, 'custom-1')).toBe(false);
  });

  it('id で探す (壊れた id でも投げない)', () => {
    expect(findFarmItem(BUILTINS, 'two')).toBe(BUILTINS[1]);
    expect(findFarmItem(BUILTINS, 'zzz')).toBeUndefined();
    expect(findFarmItem(BUILTINS, { id: 'two' })).toBeUndefined();
  });
});

describe('断りの文は呼び名から組む', () => {
  it.each([
    ['invalid', '魚種の入力に誤りがあります'],
    ['full', `魚種は ${MAX_CROPS} 件までです。使わない魚種を消してから足してください`],
    ['duplicate-label', '同じ名前の魚種が既にあります'],
    ['last-item', '最後の 1 件は消せません (一覧は空にできません)'],
    ['not-found', 'その魚種は一覧にありません'],
  ] as const)('%s', (refusal, text) => {
    expect(farmRefusalMessage('魚種', refusal)).toBe(text);
  });
});

describe('数値でない欄を持たない一覧', () => {
  it('NO_EXTRA_FIELDS は指摘を出さず、何も足さない', () => {
    expect(NO_EXTRA_FIELDS.issues({ anything: 1 })).toEqual([]);
    expect(NO_EXTRA_FIELDS.pick({ anything: 1 })).toEqual({});
  });
});
