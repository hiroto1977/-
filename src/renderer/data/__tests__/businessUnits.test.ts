import { describe, expect, it } from 'vitest';
import {
  BUSINESS_AMOUNT_MAX,
  BUSINESS_CATEGORY_MAX,
  BUSINESS_NAME_MAX,
  BUSINESS_NOTE_MAX,
  BUSINESS_UNITS_COLLECTION,
  financialUnitsFromBusinessUnits,
  findBusinessName,
  parseBusinessUnit,
  sortBusinessUnits,
  type BusinessUnitInput,
  type BusinessUnitRecord,
} from '../businessUnits';

/** 通ったときの中身だけ取り出す（弾かれたら null）。 */
function entryOf(input: Parameters<typeof parseBusinessUnit>[0]): BusinessUnitInput | null {
  const r = parseBusinessUnit(input);
  return r.ok ? r.entry : null;
}

/** 弾かれた理由だけ取り出す（通ったら null）。 */
function reasonOf(input: Parameters<typeof parseBusinessUnit>[0]): string | null {
  const r = parseBusinessUnit(input);
  return r.ok ? null : r.reason;
}

const rec = (id: string, data: BusinessUnitInput): BusinessUnitRecord => ({ id, data });

describe('parseBusinessUnit — 通すもの', () => {
  it('事業名だけで通る', () => {
    expect(entryOf({ name: '物販' })).toEqual({ name: '物販' });
  });

  it('前後の空白は落とす', () => {
    expect(entryOf({ name: '  受託開発  ' })).toEqual({ name: '受託開発' });
  });

  it('区分・開始時期・メモを保持する', () => {
    expect(
      entryOf({ name: '店舗A', category: '小売', startedOn: '2024-04', note: '駅前' }),
    ).toEqual({ name: '店舗A', category: '小売', startedOn: '2024-04', note: '駅前' });
  });

  it('開始時期は年月と年月日の両方を受ける', () => {
    expect(entryOf({ name: 'x', startedOn: '2024-04' })?.startedOn).toBe('2024-04');
    expect(entryOf({ name: 'x', startedOn: '2024-04-01' })?.startedOn).toBe('2024-04-01');
  });

  it('月と日の境界を受ける', () => {
    // 10 番台・20 番台の日 (`[12]\d`) も通ることを含める。境界だけだと
    // その枝を通らないまま「境界は見た」になる。
    for (const d of [
      '2024-01', '2024-12',
      '2024-01-01', '2024-01-09', '2024-01-10', '2024-01-15',
      '2024-01-19', '2024-01-20', '2024-01-29', '2024-01-30', '2024-01-31',
    ]) {
      expect(reasonOf({ name: 'x', startedOn: d }), d).toBeNull();
    }
  });

  it('開始時期の前後の空白は落とす', () => {
    expect(entryOf({ name: 'x', startedOn: '  2024-04  ' })?.startedOn).toBe('2024-04');
  });

  // 空文字を保存すると「未入力」と「空と入力した」の区別が付かなくなる。
  it('空の任意項目は持たせない', () => {
    const e = entryOf({ name: 'x', category: '  ', startedOn: '', note: '   ' });
    expect(e).toEqual({ name: 'x' });
    expect(Object.hasOwn(e ?? {}, 'category')).toBe(false);
    expect(Object.hasOwn(e ?? {}, 'startedOn')).toBe(false);
    expect(Object.hasOwn(e ?? {}, 'note')).toBe(false);
  });

  it('長さの上限ちょうどは通る', () => {
    expect(reasonOf({ name: 'あ'.repeat(BUSINESS_NAME_MAX) })).toBeNull();
    expect(
      reasonOf({ name: 'x', category: 'あ'.repeat(BUSINESS_CATEGORY_MAX) }),
    ).toBeNull();
    expect(reasonOf({ name: 'x', note: 'あ'.repeat(BUSINESS_NOTE_MAX) })).toBeNull();
  });
});

describe('parseBusinessUnit — 断るもの', () => {
  it('事業名が無い・空白だけなら断る', () => {
    expect(reasonOf({})).toBe('事業名を入力してください。');
    expect(reasonOf({ name: '' })).toBe('事業名を入力してください。');
    expect(reasonOf({ name: '   ' })).toBe('事業名を入力してください。');
  });

  it('長さの上限を 1 文字超えたら断る', () => {
    expect(reasonOf({ name: 'あ'.repeat(BUSINESS_NAME_MAX + 1) })).toBe(
      `事業名は ${BUSINESS_NAME_MAX} 文字までです。`,
    );
    expect(reasonOf({ name: 'x', category: 'あ'.repeat(BUSINESS_CATEGORY_MAX + 1) })).toBe(
      `区分は ${BUSINESS_CATEGORY_MAX} 文字までです。`,
    );
    expect(reasonOf({ name: 'x', note: 'あ'.repeat(BUSINESS_NOTE_MAX + 1) })).toBe(
      `メモは ${BUSINESS_NOTE_MAX} 文字までです。`,
    );
  });

  it('事業名の制御文字を断る', () => {
    expect(reasonOf({ name: 'a\u0000b' })).toBe('事業名に制御文字は使えません。');
    expect(reasonOf({ name: 'a\u007fb' })).toBe('事業名に制御文字は使えません。');
  });

  it('曖昧な開始時期は断る（推測して解釈しない）', () => {
    for (const d of [
      '2024/04', '令和6年4月', '2024-4', '24-04',
      '2024-13', '2024-00', '2024-04-32', '2024-04-00', 'あ',
      // 前後に何か付いた形も断る（部分一致で通さない）。
      'x2024-04', '2024-04x', '2024-04-01x', 'a2024-04-01',
    ]) {
      expect(reasonOf({ name: 'x', startedOn: d }), d).toBe(
        '開始時期は YYYY-MM か YYYY-MM-DD で入力してください。',
      );
    }
  });

  it('断る理由は場合ごとに違う文言になる', () => {
    const reasons = [
      reasonOf({}),
      reasonOf({ name: 'あ'.repeat(BUSINESS_NAME_MAX + 1) }),
      reasonOf({ name: 'a\u0000' }),
      reasonOf({ name: 'x', category: 'あ'.repeat(BUSINESS_CATEGORY_MAX + 1) }),
      reasonOf({ name: 'x', startedOn: '2024/04' }),
      reasonOf({ name: 'x', note: 'あ'.repeat(BUSINESS_NOTE_MAX + 1) }),
    ];
    for (const r of reasons) expect(r).not.toBeNull();
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  // 名前が駄目なら、後ろの項目が駄目でも名前の理由が出る（先に見るため）。
  it('複数の違反があるときは、先に見る規則の理由を返す', () => {
    expect(reasonOf({ name: '', startedOn: 'bad', note: 'あ'.repeat(BUSINESS_NOTE_MAX + 1) })).toBe(
      '事業名を入力してください。',
    );
    expect(reasonOf({ name: 'x', category: 'あ'.repeat(BUSINESS_CATEGORY_MAX + 1), startedOn: 'bad' })).toBe(
      `区分は ${BUSINESS_CATEGORY_MAX} 文字までです。`,
    );
    expect(reasonOf({ name: 'x', startedOn: 'bad', note: 'あ'.repeat(BUSINESS_NOTE_MAX + 1) })).toBe(
      '開始時期は YYYY-MM か YYYY-MM-DD で入力してください。',
    );
  });
});

describe('findBusinessName', () => {
  const units = [rec('a', { name: '物販' }), rec('b', { name: '受託' })];

  it('登録されている事業の名前を返す', () => {
    expect(findBusinessName(units, 'a')).toBe('物販');
    expect(findBusinessName(units, 'b')).toBe('受託');
  });

  it('指定なしは null', () => {
    expect(findBusinessName(units, undefined)).toBeNull();
  });

  // 事業を消しても数値は残す方針なので、消えた id を渡されても落ちない。
  it('消えた事業の id は null（数値は残す方針）', () => {
    expect(findBusinessName(units, 'gone')).toBeNull();
    expect(findBusinessName([], 'a')).toBeNull();
  });
});

describe('sortBusinessUnits', () => {
  it('開始時期のあるものを古い順に、その後へ未設定を名前順で並べる', () => {
    const units = [
      rec('1', { name: 'ぶ' }),
      rec('2', { name: 'B', startedOn: '2025-01' }),
      rec('3', { name: 'あ' }),
      rec('4', { name: 'A', startedOn: '2023-06' }),
    ];
    expect(sortBusinessUnits(units).map((u) => u.id)).toEqual(['4', '2', '3', '1']);
  });

  it('全部に開始時期があれば全部が日付順', () => {
    const units = [
      rec('1', { name: 'x', startedOn: '2024-12' }),
      rec('2', { name: 'y', startedOn: '2024-01-15' }),
      rec('3', { name: 'z', startedOn: '2024-01' }),
    ];
    expect(sortBusinessUnits(units).map((u) => u.id)).toEqual(['3', '2', '1']);
  });

  it('全部が未設定なら名前順', () => {
    const units = [rec('1', { name: 'C' }), rec('2', { name: 'A' }), rec('3', { name: 'B' })];
    expect(sortBusinessUnits(units).map((u) => u.id)).toEqual(['2', '3', '1']);
  });

  // 日本語の名前も並べ替えの対象なので、ロケールを指定して比べている。
  it('日本語の名前も並ぶ', () => {
    const units = [rec('1', { name: 'さ' }), rec('2', { name: 'あ' }), rec('3', { name: 'か' })];
    expect(sortBusinessUnits(units).map((u) => u.id)).toEqual(['2', '3', '1']);
  });

  it('空でも落ちない', () => {
    expect(sortBusinessUnits([])).toEqual([]);
  });

  it('元の配列を書き換えない', () => {
    const units = [rec('1', { name: 'C' }), rec('2', { name: 'A' })];
    const before = units.map((u) => u.id);
    sortBusinessUnits(units);
    expect(units.map((u) => u.id)).toEqual(before);
  });

  it('件数は増えも減りもしない', () => {
    const units = [
      rec('1', { name: 'x' }),
      rec('2', { name: 'y', startedOn: '2024-01' }),
      rec('3', { name: 'z' }),
    ];
    expect(sortBusinessUnits(units).length).toBe(3);
  });
});

describe('保存先の名前', () => {
  it('collection 名は決め打ち（変わると登録済みの事業が読めなくなる）', () => {
    expect(BUSINESS_UNITS_COLLECTION).toBe('business-units');
  });

  it('長さの上限は決め打ちの値', () => {
    expect(BUSINESS_NAME_MAX).toBe(60);
    expect(BUSINESS_CATEGORY_MAX).toBe(30);
    expect(BUSINESS_NOTE_MAX).toBe(200);
  });
});

describe('parseBusinessUnit — 月次の金額', () => {
  /**
   * 事業間比較のグラフは同梱の模擬データ 10 件に固定されていて、利用者が
   * 登録した事業は金額を持てないため出られなかった。売上を持てるようにして
   * 合流させる。
   */
  it('売上・変動費・固定費を数値として保存する', () => {
    const r = parseBusinessUnit({ name: '物販', revenue: '1200000', variableCost: '400000', fixedCost: '300000' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.entry.revenue).toBe(1_200_000);
    expect(r.entry.variableCost).toBe(400_000);
    expect(r.entry.fixedCost).toBe(300_000);
  });

  it('桁区切りと全角数字を受ける (貼り付けを断らない)', () => {
    const r = parseBusinessUnit({ name: '受託', revenue: '1,200,000' });
    expect(r.ok && r.entry.revenue).toBe(1_200_000);
    const z = parseBusinessUnit({ name: '受託', revenue: '１２００' });
    expect(z.ok && z.entry.revenue).toBe(1200);
  });

  it('金額を入れなければ持たせない (未入力と 0 を区別する)', () => {
    const r = parseBusinessUnit({ name: '名前だけ' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect('revenue' in r.entry).toBe(false);
    expect('variableCost' in r.entry).toBe(false);
    expect('fixedCost' in r.entry).toBe(false);
  });

  it('0 は入力として受ける (売上 0 の月はありうる)', () => {
    const r = parseBusinessUnit({ name: '休止中', revenue: '0' });
    expect(r.ok && r.entry.revenue).toBe(0);
  });

  it('費用だけの入力は断る (どの指標にも乗らないため)', () => {
    const r = parseBusinessUnit({ name: '費用のみ', variableCost: '100' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toContain('売上高も入力してください');
  });

  it('空白だけの欄は「未入力」として扱う (0 円と保存しない)', () => {
    const r = parseBusinessUnit({ name: 'x', revenue: '   ', variableCost: '\t' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect('revenue' in r.entry).toBe(false);
    expect('variableCost' in r.entry).toBe(false);
  });

  it('固定費の欄も名指しでエラーを返す', () => {
    const r = parseBusinessUnit({ name: 'x', revenue: '100', fixedCost: 'abc' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toContain('固定費');
  });

  it('数値にならない入力を断る', () => {
    const r = parseBusinessUnit({ name: 'x', revenue: '百万円' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toContain('売上高');
  });

  it('マイナスを断る', () => {
    const r = parseBusinessUnit({ name: 'x', revenue: '100', variableCost: '-1' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toContain('変動費');
    expect(r.reason).toContain('マイナス');
  });

  it('上限ちょうどは受け、超えたら断る (丸めない)', () => {
    expect(parseBusinessUnit({ name: 'x', revenue: String(BUSINESS_AMOUNT_MAX) }).ok).toBe(true);
    const over = parseBusinessUnit({ name: 'x', revenue: String(BUSINESS_AMOUNT_MAX + 1) });
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error('unreachable');
    expect(over.reason).toContain('大きすぎます');
  });
});

describe('financialUnitsFromBusinessUnits', () => {
  const rec = (id: string, data: Record<string, unknown>) => ({ id, data: data as never });

  it('売上のある事業だけを出す (未入力を 0% として並べない)', () => {
    const out = financialUnitsFromBusinessUnits([
      rec('a', { name: '物販', revenue: 1000, variableCost: 300, fixedCost: 200 }),
      rec('b', { name: '名前だけ' }),
    ]);
    expect(out.map((u) => u.id)).toEqual(['a']);
  });

  it('利益と利益率を売上・費用から導く', () => {
    const [u] = financialUnitsFromBusinessUnits([
      rec('a', { name: '物販', revenue: 1000, variableCost: 300, fixedCost: 200 }),
    ]);
    expect(u!.current.profit).toBe(500);
    expect(u!.current.profitMargin).toBe(50);
  });

  it('費用の未入力は 0 として扱う (売上があるので比較はできる)', () => {
    const [u] = financialUnitsFromBusinessUnits([rec('a', { name: '粗利のみ', revenue: 800 })]);
    expect(u!.current.variableCost).toBe(0);
    expect(u!.current.fixedCost).toBe(0);
    expect(u!.current.profit).toBe(800);
    expect(u!.current.profitMargin).toBe(100);
  });

  it('赤字は負の利益率として出す (隠さない)', () => {
    const [u] = financialUnitsFromBusinessUnits([
      rec('a', { name: '赤字', revenue: 1000, variableCost: 900, fixedCost: 300 }),
    ]);
    expect(u!.current.profit).toBe(-200);
    expect(u!.current.profitMargin).toBe(-20);
  });

  it('売上 0 は率を 0 にする (0 除算を出さない)', () => {
    const [u] = financialUnitsFromBusinessUnits([rec('a', { name: '休止', revenue: 0, fixedCost: 50 })]);
    expect(u!.current.profitMargin).toBe(0);
    expect(Number.isFinite(u!.current.profitMargin)).toBe(true);
  });

  it('利益率は小数第 1 位まで', () => {
    const [u] = financialUnitsFromBusinessUnits([rec('a', { name: 'x', revenue: 3000, variableCost: 1000 })]);
    expect(u!.current.profitMargin).toBe(66.7);
  });

  it('履歴は空にする (1 点を横ばいの傾向に見せない)', () => {
    const [u] = financialUnitsFromBusinessUnits([rec('a', { name: 'x', revenue: 100 })]);
    expect(u!.history).toEqual([]);
  });

  it('事業名をラベルにする', () => {
    const [u] = financialUnitsFromBusinessUnits([rec('a', { name: '店舗A', revenue: 100 })]);
    expect(u!.label).toBe('店舗A');
  });
});
