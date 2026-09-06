/**
 * 品目一覧の増減の検査。
 *
 * 守るのは 3 つの不変条件 (一覧は空にならない / id は一意 / 数値は範囲内) と、
 * 断るときに投げずに理由を返すこと。範囲の数字は表 (`BOUNDS`) に**写して**
 * 持つ —— 実装の表から導くと、表が `{}` に変異しても検査が一緒に変わって黙る。
 */
import { describe, expect, it, vi } from 'vitest';
import { HYDROPONIC_CROPS, type HydroponicCrop } from '../hydroponics';
import {
  MAX_CROP_LABEL_CHARS,
  MAX_CROPS,
  CROP_ID_RE,
  CUSTOM_CROP_ID_PREFIX,
  CROP_NUMERIC_FIELDS,
  CROP_FIELD_LABELS,
  HYDROPONIC_CROP_BOUNDS,
  DEFAULT_CROP_LIST,
  CROP_REFUSAL_MESSAGES,
  isBuiltinCropId,
  cropIssues,
  sanitizeCrop,
  sanitizeCropList,
  cropListOrDefault,
  nextCustomCropId,
  parseCropNumber,
  addCrop,
  removeCrop,
  missingBuiltinCrops,
  restoreBuiltinCrops,
  findCrop,
  resolveCropFrom,
  type CropDraft,
  type CropNumericField,
} from '../hydroponicCrops';

/** 形の通る品目。範囲の端に掛からない値を選んである。 */
const VALID: HydroponicCrop = {
  id: 'mizuna',
  label: 'ミズナ',
  nurseryDays: 14,
  growOutDays: 20,
  harvestWeightG: 80,
  ecLow: 1,
  ecHigh: 1.6,
  phLow: 5.8,
  phHigh: 6.4,
  plantsPerPanel: 10,
};

/** 範囲の写し。実装の `HYDROPONIC_CROP_BOUNDS` から導かない (冒頭の理由)。 */
const BOUNDS: Record<CropNumericField, { min: number; max: number; integer: boolean }> = {
  nurseryDays: { min: 0, max: 365, integer: true },
  growOutDays: { min: 1, max: 365, integer: true },
  harvestWeightG: { min: 1, max: 10_000, integer: false },
  ecLow: { min: 0, max: 10, integer: false },
  ecHigh: { min: 0, max: 10, integer: false },
  phLow: { min: 0, max: 14, integer: false },
  phHigh: { min: 0, max: 14, integer: false },
  plantsPerPanel: { min: 1, max: 1_000, integer: true },
};

const LABELS: Record<CropNumericField, string> = {
  nurseryDays: '育苗日数 (日)',
  growOutDays: '定植後日数 (日)',
  harvestWeightG: '収穫重量 (g/株)',
  ecLow: '養液 EC 下限 (mS/cm)',
  ecHigh: '養液 EC 上限 (mS/cm)',
  phLow: '養液 pH 下限',
  phHigh: '養液 pH 上限',
  plantsPerPanel: 'パネル穴数 (株/枚)',
};

const FIELDS = Object.keys(BOUNDS) as CropNumericField[];

/** 制御文字の標本。字面に置くと編集器や差分で見えないので、コードで作る。 */
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(0x7f);

function rangeMessage(field: CropNumericField): string {
  const b = BOUNDS[field];
  return `${LABELS[field]} は ${b.min}〜${b.max} の${b.integer ? '整数' : '数値'}で入力してください`;
}

/**
 * 1 欄だけ差し替えた品目。EC / pH は下限 ≦ 上限の関係があるので、範囲内の
 * 値を試すときは対になる欄も同じ値にして、範囲の検査だけを見る。
 */
function withField(field: CropNumericField, v: number, pairToo = false): Record<string, unknown> {
  const c: Record<string, unknown> = { ...VALID, [field]: v };
  if (pairToo && field.startsWith('ec')) { c.ecLow = v; c.ecHigh = v; }
  if (pairToo && field.startsWith('ph')) { c.phLow = v; c.phHigh = v; }
  return c;
}

function custom(n: number, label = `品目${n}`): HydroponicCrop {
  return { ...VALID, id: `custom-${n}`, label };
}
function customs(count: number): HydroponicCrop[] {
  return Array.from({ length: count }, (_, i) => custom(i + 1));
}
function draftOf(c: HydroponicCrop): CropDraft {
  const { id: _drop, ...rest } = c;
  return rest;
}

describe('定数', () => {
  it('上限と接頭辞', () => {
    expect(MAX_CROP_LABEL_CHARS).toBe(40);
    expect(MAX_CROPS).toBe(50);
    expect(CUSTOM_CROP_ID_PREFIX).toBe('custom-');
  });

  it('数値の欄は 8 つ、この並び (画面・検査・保存が同じ順で回る)', () => {
    expect([...CROP_NUMERIC_FIELDS]).toEqual([
      'nurseryDays', 'growOutDays', 'harvestWeightG', 'ecLow', 'ecHigh', 'phLow', 'phHigh', 'plantsPerPanel',
    ]);
  });

  it('見出しと範囲は写しと一致する', () => {
    expect(CROP_FIELD_LABELS).toEqual(LABELS);
    expect(HYDROPONIC_CROP_BOUNDS).toEqual(BOUNDS);
  });

  it('参考値の一覧は HYDROPONIC_CROPS の 5 品目そのもの (同じ実体・凍結済み)', () => {
    expect(DEFAULT_CROP_LIST).toHaveLength(5);
    expect(DEFAULT_CROP_LIST.map((c) => c.id)).toEqual(['leaf-lettuce', 'frill-lettuce', 'romaine', 'baby-leaf', 'basil']);
    for (const c of DEFAULT_CROP_LIST) expect(c).toBe(HYDROPONIC_CROPS[c.id as keyof typeof HYDROPONIC_CROPS]);
    expect(Object.isFrozen(DEFAULT_CROP_LIST)).toBe(true);
  });

  it('参考値の id だけが builtin', () => {
    for (const c of DEFAULT_CROP_LIST) expect(isBuiltinCropId(c.id)).toBe(true);
    expect(isBuiltinCropId('custom-1')).toBe(false);
    expect(isBuiltinCropId('mizuna')).toBe(false);
    expect(isBuiltinCropId('')).toBe(false);
  });

  it('id の形: 小文字英数とハイフン、先頭は英数、40 文字まで', () => {
    for (const ok of ['leaf-lettuce', 'baby-leaf', 'custom-1', 'a', 'a1-b2', 'a'.repeat(40)]) {
      expect(CROP_ID_RE.test(ok), ok).toBe(true);
    }
    for (const bad of ['', 'Custom-1', '-a', 'a b', 'a_b', 'ミズナ', 'a'.repeat(41)]) {
      expect(CROP_ID_RE.test(bad), bad).toBe(false);
    }
  });

  it('断る理由の文言', () => {
    expect(CROP_REFUSAL_MESSAGES).toEqual({
      invalid: '品目の入力に誤りがあります',
      full: '品目は 50 件までです。使わない品目を消してから足してください',
      'duplicate-label': '同じ名前の品目が既にあります',
      'last-crop': '最後の 1 品目は消せません (一覧は空にできません)',
      'not-found': 'その品目は一覧にありません',
    });
  });
});

describe('cropIssues — 形の検査', () => {
  it('形の通る品目は指摘なし。参考値の 5 品目も自分の門を通る', () => {
    expect(cropIssues(VALID)).toEqual([]);
    for (const c of DEFAULT_CROP_LIST) expect(cropIssues(c), c.id).toEqual([]);
  });

  it('オブジェクトでなければ 1 件で断る (数・null・文字列・undefined)', () => {
    for (const raw of [42, null, 'mizuna', undefined, true]) {
      expect(cropIssues(raw), String(raw)).toEqual(['品目の形が不正です']);
    }
  });

  it('id: 無い・大文字・先頭ハイフン・空・41 文字は不正、40 文字と custom-<n> は通る', () => {
    const { id: _drop, ...noId } = VALID;
    expect(cropIssues(noId)).toEqual(['品目の id が不正です']);
    for (const bad of ['Leaf', '-x', '', 'a'.repeat(41), 7]) {
      expect(cropIssues({ ...VALID, id: bad }), String(bad)).toEqual(['品目の id が不正です']);
    }
    expect(cropIssues({ ...VALID, id: 'a'.repeat(40) })).toEqual([]);
    expect(cropIssues({ ...VALID, id: 'custom-12' })).toEqual([]);
  });

  it('品目名: 空・空白のみ・無い・文字列でない は「入力してください」', () => {
    const { label: _drop, ...noLabel } = VALID;
    expect(cropIssues(noLabel)).toEqual(['品目名を入力してください']);
    for (const bad of ['', '   ', TAB + LF, 42]) {
      expect(cropIssues({ ...VALID, label: bad }), JSON.stringify(bad)).toEqual(['品目名を入力してください']);
    }
  });

  it('品目名: 40 文字まで。前後の空白は数えない', () => {
    expect(cropIssues({ ...VALID, label: 'あ'.repeat(40) })).toEqual([]);
    expect(cropIssues({ ...VALID, label: ` ${'あ'.repeat(40)} ` })).toEqual([]);
    expect(cropIssues({ ...VALID, label: 'あ'.repeat(41) })).toEqual(['品目名は 40 文字までです']);
  });

  it('品目名: 改行・タブ・NUL・DEL は不正、空白と記号は通る', () => {
    for (const bad of [`a${TAB}b`, `a${LF}b`, `a${NUL}b`, `a${DEL}b`]) {
      expect(cropIssues({ ...VALID, label: bad }), JSON.stringify(bad)).toEqual(['品目名に改行や制御文字は使えません']);
    }
    for (const ok of ['a b', 'a~b', 'レタス (自家採種)', 'Ｌｅｔｔｕｃｅ']) {
      expect(cropIssues({ ...VALID, label: ok }), ok).toEqual([]);
    }
  });

  it('品目名の指摘は 1 件だけ (長すぎて制御文字も含むなら長さだけ言う)', () => {
    expect(cropIssues({ ...VALID, label: `${'a'.repeat(20)}${TAB}${'a'.repeat(21)}` })).toEqual(['品目名は 40 文字までです']);
  });

  describe.each(FIELDS)('数値の欄 %s', (field) => {
    const b = BOUNDS[field];

    it('下限と上限は含む', () => {
      expect(cropIssues(withField(field, b.min, true))).toEqual([]);
      expect(cropIssues(withField(field, b.max, true))).toEqual([]);
    });

    it('下限未満・上限超過は範囲の文言で断る', () => {
      expect(cropIssues(withField(field, b.min - 1))).toEqual([rangeMessage(field)]);
      expect(cropIssues(withField(field, b.max + 1))).toEqual([rangeMessage(field)]);
      expect(cropIssues(withField(field, b.min - 0.5))).toEqual([rangeMessage(field)]);
    });

    it('数でなければ断る (文字列の数字・NaN・±Infinity・null・未指定)', () => {
      for (const bad of ['5', NaN, Infinity, -Infinity, null, undefined, true]) {
        expect(cropIssues({ ...VALID, [field]: bad }), String(bad)).toEqual([rangeMessage(field)]);
      }
    });

    it(b.integer ? '整数の欄: 小数は断る' : '小数の欄: 小数は通る', () => {
      // 上限側の欄 (ecHigh / phHigh) は上限から、他は下限から 0.5 ずらす。
      const v = field.endsWith('High') ? b.max - 0.5 : b.min + 0.5;
      expect(cropIssues(withField(field, v))).toEqual(b.integer ? [rangeMessage(field)] : []);
    });
  });

  it('EC / pH は下限 ≦ 上限 (等しいのは可)', () => {
    expect(cropIssues({ ...VALID, ecLow: 1.6, ecHigh: 1 })).toEqual(['養液 EC は下限 ≦ 上限にしてください']);
    expect(cropIssues({ ...VALID, ecLow: 1.6, ecHigh: 1.6 })).toEqual([]);
    expect(cropIssues({ ...VALID, phLow: 6.4, phHigh: 5.8 })).toEqual(['養液 pH は下限 ≦ 上限にしてください']);
    expect(cropIssues({ ...VALID, phLow: 6.4, phHigh: 6.4 })).toEqual([]);
  });

  it('片方が範囲外なら範囲の指摘だけ (下限 ≦ 上限は重ねて言わない)', () => {
    expect(cropIssues({ ...VALID, ecLow: 99, ecHigh: 1 })).toEqual([rangeMessage('ecLow')]);
    expect(cropIssues({ ...VALID, ecLow: 1, ecHigh: -1 })).toEqual([rangeMessage('ecHigh')]);
    expect(cropIssues({ ...VALID, phLow: 99, phHigh: 6 })).toEqual([rangeMessage('phLow')]);
    expect(cropIssues({ ...VALID, phLow: 6, phHigh: -1 })).toEqual([rangeMessage('phHigh')]);
  });

  it('空の品目は id・品目名・8 欄の 10 件を、この順に全部言う', () => {
    expect(cropIssues({})).toEqual([
      '品目の id が不正です',
      '品目名を入力してください',
      ...FIELDS.map(rangeMessage),
    ]);
  });
});

describe('sanitizeCrop', () => {
  it('通る品目は既知の欄だけを写した新しい実体 (余分なキーを持ち込まない)', () => {
    const out = sanitizeCrop({ ...VALID, evil: '__proto__', label: '  ミズナ  ' });
    expect(out).toEqual(VALID);
    expect(out).not.toBe(VALID);
    expect(Object.keys(out!)).toEqual(Object.keys(VALID));
  });

  it('通らなければ null', () => {
    expect(sanitizeCrop({ ...VALID, growOutDays: 0 })).toBeNull();
    expect(sanitizeCrop(null)).toBeNull();
  });
});

describe('sanitizeCropList / cropListOrDefault', () => {
  it('配列でなければ空', () => {
    for (const raw of [null, undefined, {}, 'x', 42]) expect(sanitizeCropList(raw), String(raw)).toEqual([]);
  });

  it('形の通らない品目だけ捨てて順序は保つ', () => {
    const out = sanitizeCropList([custom(1), { ...custom(2), phHigh: 99 }, 'junk', custom(3)]);
    expect(out.map((c) => c.id)).toEqual(['custom-1', 'custom-3']);
  });

  it('id の重複は先勝ち', () => {
    const out = sanitizeCropList([custom(1, '先'), custom(1, '後')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('先');
  });

  it('件数は 50 で打ち切る (先頭 50)', () => {
    const out = sanitizeCropList(customs(51));
    expect(out).toHaveLength(50);
    expect(out[49]!.id).toBe('custom-50');
    expect(sanitizeCropList(customs(50))).toHaveLength(50);
  });

  it('cropListOrDefault: 無い・壊れている・空 は参考値の一覧、通る一覧はそのまま', () => {
    expect(cropListOrDefault(undefined)).toBe(DEFAULT_CROP_LIST);
    expect(cropListOrDefault('junk')).toBe(DEFAULT_CROP_LIST);
    expect(cropListOrDefault([])).toBe(DEFAULT_CROP_LIST);
    expect(cropListOrDefault([{ ...VALID, id: 'BAD' }])).toBe(DEFAULT_CROP_LIST);
    const mine = cropListOrDefault([custom(1)]);
    expect(mine).toEqual([custom(1)]);
    expect(mine).not.toBe(DEFAULT_CROP_LIST);
  });
});

describe('nextCustomCropId — 空いている最小の番号', () => {
  it('参考値だけなら custom-1、空でも custom-1', () => {
    expect(nextCustomCropId(DEFAULT_CROP_LIST)).toBe('custom-1');
    expect(nextCustomCropId([])).toBe('custom-1');
  });

  it('使われている番号は飛ばし、空いた番号は埋める', () => {
    expect(nextCustomCropId([custom(1)])).toBe('custom-2');
    expect(nextCustomCropId([custom(1), custom(3)])).toBe('custom-2');
    expect(nextCustomCropId([custom(2)])).toBe('custom-1');
    expect(nextCustomCropId(customs(50))).toBe('custom-51');
  });
});

describe('parseCropNumber — 入力欄の文字列', () => {
  it('数・桁区切り・前後の空白を読む', () => {
    expect(parseCropNumber('12')).toBe(12);
    expect(parseCropNumber('1,000.5')).toBe(1000.5);
    expect(parseCropNumber(' 7 ')).toBe(7);
    expect(parseCropNumber('0')).toBe(0);
  });

  it('空欄・空白だけ・数でない は NaN (0 に落とさない — EC 0 が「入力した値」になる)', () => {
    expect(parseCropNumber('')).toBeNaN();
    expect(parseCropNumber('   ')).toBeNaN();
    expect(parseCropNumber('abc')).toBeNaN();
  });

  it('★ 数字の間に区切りが入った値は読まない (2026-09-06 まで別の数として通っていた)', () => {
    // pH 1.2 と打ったつもりの '1,2' が 12 になり、範囲 (0〜14) を通っていた。
    expect(parseCropNumber('1,2')).toBeNaN();
    // 株数 (整数の欄) では 2.4 の指摘が出ずに 24 になっていた。
    expect(parseCropNumber('2,4')).toBeNaN();
    expect(parseCropNumber('1,5')).toBeNaN();
    expect(parseCropNumber('1 2')).toBeNaN();
  });

  it('★ 16 進・指数は読まない (画面の入力欄と同じ方針)', () => {
    expect(parseCropNumber('0x10')).toBeNaN(); // 旧: 16
    expect(parseCropNumber('1e3')).toBeNaN(); // 旧: 1000
    expect(parseCropNumber('Infinity')).toBeNaN(); // 旧: Infinity
  });

  it('単位の付いた値は飾りとして落とす (画面と同じ)', () => {
    expect(parseCropNumber('5日')).toBe(5);
    expect(parseCropNumber('1,000㎡')).toBe(1000);
    // 単位語は解釈しない
    expect(parseCropNumber('1万')).toBeNaN();
  });
});

describe('addCrop', () => {
  it('末尾に足し、id は機械が振る (custom-1)。元の一覧は変えない', () => {
    const r = addCrop(DEFAULT_CROP_LIST, draftOf({ ...VALID, label: '  ミズナ ' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crops).toHaveLength(6);
    expect(r.crops.slice(0, 5)).toEqual([...DEFAULT_CROP_LIST]);
    expect(r.crops[5]).toEqual({ ...VALID, id: 'custom-1', label: 'ミズナ' });
    expect(DEFAULT_CROP_LIST).toHaveLength(5);
  });

  it('入力に id が混ざっていても使わない', () => {
    const r = addCrop(DEFAULT_CROP_LIST, { ...draftOf(VALID), id: 'leaf-lettuce' } as CropDraft);
    expect(r.ok && r.crops[5]!.id).toBe('custom-1');
  });

  it('形が通らなければ invalid — 見出しの文言に欄ごとの指摘が続く', () => {
    const r = addCrop(DEFAULT_CROP_LIST, { ...draftOf(VALID), growOutDays: NaN, label: '' });
    expect(r).toEqual({
      ok: false,
      refusal: 'invalid',
      issues: [
        '品目の入力に誤りがあります',
        '品目名を入力してください',
        '定植後日数 (日) は 1〜365 の整数で入力してください',
      ],
    });
  });

  it('同じ品目名は duplicate-label (文言 1 件)', () => {
    const r = addCrop(DEFAULT_CROP_LIST, draftOf({ ...VALID, label: 'リーフレタス' }));
    expect(r).toEqual({ ok: false, refusal: 'duplicate-label', issues: ['同じ名前の品目が既にあります'] });
  });

  it('50 件で満杯 — 49 件なら 50 件目として足せる', () => {
    expect(addCrop(customs(50), draftOf({ ...VALID, label: '51 件目' }))).toEqual({
      ok: false,
      refusal: 'full',
      issues: ['品目は 50 件までです。使わない品目を消してから足してください'],
    });
    const r = addCrop(customs(49), draftOf({ ...VALID, label: '50 件目' }));
    expect(r.ok && r.crops.length).toBe(50);
    expect(r.ok && r.crops[49]!.id).toBe('custom-50');
  });

  it('壊れた入力でも投げない', () => {
    expect(addCrop(DEFAULT_CROP_LIST, null as unknown as CropDraft).ok).toBe(false);
    expect(addCrop(DEFAULT_CROP_LIST, 'x' as unknown as CropDraft).ok).toBe(false);
  });
});

describe('removeCrop', () => {
  it('先頭・中ほどを消せる。順序は保ち、元の一覧は変えない', () => {
    const first = removeCrop(DEFAULT_CROP_LIST, 'leaf-lettuce');
    expect(first.ok && first.crops.map((c) => c.id)).toEqual(['frill-lettuce', 'romaine', 'baby-leaf', 'basil']);
    const mid = removeCrop(DEFAULT_CROP_LIST, 'romaine');
    expect(mid.ok && mid.crops.map((c) => c.id)).toEqual(['leaf-lettuce', 'frill-lettuce', 'baby-leaf', 'basil']);
    expect(DEFAULT_CROP_LIST).toHaveLength(5);
  });

  it('無い id は not-found', () => {
    expect(removeCrop(DEFAULT_CROP_LIST, 'custom-9')).toEqual({
      ok: false, refusal: 'not-found', issues: ['その品目は一覧にありません'],
    });
  });

  it('最後の 1 品目は消せない (一覧は空にならない)', () => {
    expect(removeCrop([custom(1)], 'custom-1')).toEqual({
      ok: false, refusal: 'last-crop', issues: ['最後の 1 品目は消せません (一覧は空にできません)'],
    });
    // 1 件の一覧でも、無い id は not-found が先。
    expect(removeCrop([custom(1)], 'custom-2')).toMatchObject({ ok: false, refusal: 'not-found' });
  });
});

describe('missingBuiltinCrops / restoreBuiltinCrops', () => {
  it('参考値が揃っていれば無い。戻しても同じ一覧', () => {
    expect(missingBuiltinCrops(DEFAULT_CROP_LIST)).toEqual([]);
    const r = restoreBuiltinCrops(DEFAULT_CROP_LIST);
    expect(r.ok && r.crops).toEqual([...DEFAULT_CROP_LIST]);
  });

  it('消した参考値を末尾に戻す。利用者の品目はそのまま', () => {
    const list = [custom(1), HYDROPONIC_CROPS.basil];
    expect(missingBuiltinCrops(list).map((c) => c.id)).toEqual(['leaf-lettuce', 'frill-lettuce', 'romaine', 'baby-leaf']);
    const r = restoreBuiltinCrops(list);
    expect(r.ok && r.crops.map((c) => c.id)).toEqual([
      'custom-1', 'basil', 'leaf-lettuce', 'frill-lettuce', 'romaine', 'baby-leaf',
    ]);
  });

  it('戻すと 50 件を超えるなら full (45 件なら 50 件ちょうどで通る)', () => {
    expect(restoreBuiltinCrops(customs(46))).toMatchObject({ ok: false, refusal: 'full' });
    const r = restoreBuiltinCrops(customs(45));
    expect(r.ok && r.crops.length).toBe(50);
  });
});

describe('findCrop / resolveCropFrom', () => {
  it('findCrop は同じ実体を返し、無ければ undefined (壊れた id でも投げない)', () => {
    expect(findCrop(DEFAULT_CROP_LIST, 'basil')).toBe(HYDROPONIC_CROPS.basil);
    for (const bad of ['mizuna', undefined, null, 42, {}]) {
      expect(findCrop(DEFAULT_CROP_LIST, bad), String(bad)).toBeUndefined();
    }
  });

  it('resolveCropFrom は無ければ一覧の先頭、一覧が空なら参考値の先頭', () => {
    expect(resolveCropFrom(DEFAULT_CROP_LIST, 'basil')).toBe(HYDROPONIC_CROPS.basil);
    expect(resolveCropFrom(DEFAULT_CROP_LIST, 'mizuna')).toBe(HYDROPONIC_CROPS['leaf-lettuce']);
    const mine = [custom(1), HYDROPONIC_CROPS.basil];
    expect(resolveCropFrom(mine, 'basil')).toBe(HYDROPONIC_CROPS.basil);
    expect(resolveCropFrom(mine, 'leaf-lettuce')).toBe(mine[0]);
    expect(resolveCropFrom([], 'basil')).toBe(HYDROPONIC_CROPS['leaf-lettuce']);
  });
});

/**
 * 表 (見出し・範囲・文言・id の形) はモジュール読み込み時に確定する static な
 * 値なので、通常の検査では Stryker が「static 変異体」として**測らずに無視する**。
 * `vi.resetModules()` の後に動的 import で読み直すと、その it の中で表が
 * 組み立て直されるので変異体が覆われ、測られる (assistant.ts と同じ手)。
 * 上の `toEqual` と同じ主張を、測られる形でもう 1 度置く。
 */
describe('表の static 変異体を測る (動的 import で読み直す)', () => {
  it('見出し・範囲・文言・接頭辞・id の形が写しと一致する', async () => {
    vi.resetModules();
    const m = await import('../hydroponicCrops');
    expect(m.CROP_FIELD_LABELS).toEqual(LABELS);
    expect(m.HYDROPONIC_CROP_BOUNDS).toEqual(BOUNDS);
    expect(m.CROP_REFUSAL_MESSAGES).toEqual({
      invalid: '品目の入力に誤りがあります',
      full: '品目は 50 件までです。使わない品目を消してから足してください',
      'duplicate-label': '同じ名前の品目が既にあります',
      'last-crop': '最後の 1 品目は消せません (一覧は空にできません)',
      'not-found': 'その品目は一覧にありません',
    });
    expect(m.CUSTOM_CROP_ID_PREFIX).toBe('custom-');
    for (const ok of ['leaf-lettuce', 'custom-1', 'a', 'a1-b2', 'a'.repeat(40)]) {
      expect(m.CROP_ID_RE.test(ok), ok).toBe(true);
    }
    for (const bad of ['', 'Custom-1', '-a', 'a b', 'a_b', 'ミズナ', 'a'.repeat(41)]) {
      expect(m.CROP_ID_RE.test(bad), bad).toBe(false);
    }
    // 読み直した表で実際に断る (表が空なら範囲の指摘が出ない)。
    expect(m.cropIssues({ ...VALID, growOutDays: 0 })).toEqual(['定植後日数 (日) は 1〜365 の整数で入力してください']);
    expect(m.cropIssues({ ...VALID, nurseryDays: 1.5 })).toEqual(['育苗日数 (日) は 0〜365 の整数で入力してください']);
    expect(m.cropIssues({ ...VALID, harvestWeightG: 0.5 })).toEqual(['収穫重量 (g/株) は 1〜10000 の数値で入力してください']);
    expect(m.cropIssues({ ...VALID, ecLow: -1 })).toEqual(['養液 EC 下限 (mS/cm) は 0〜10 の数値で入力してください']);
    expect(m.cropIssues({ ...VALID, ecHigh: 11 })).toEqual(['養液 EC 上限 (mS/cm) は 0〜10 の数値で入力してください']);
    expect(m.cropIssues({ ...VALID, phLow: -1 })).toEqual(['養液 pH 下限 は 0〜14 の数値で入力してください']);
    expect(m.cropIssues({ ...VALID, phHigh: 15 })).toEqual(['養液 pH 上限 は 0〜14 の数値で入力してください']);
    expect(m.cropIssues({ ...VALID, plantsPerPanel: 1.5 })).toEqual(['パネル穴数 (株/枚) は 1〜1000 の整数で入力してください']);
    expect(m.removeCrop([VALID], 'mizuna')).toMatchObject({ issues: ['最後の 1 品目は消せません (一覧は空にできません)'] });
    expect(m.nextCustomCropId([])).toBe('custom-1');
  });
});
