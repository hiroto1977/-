import { describe, expect, it } from 'vitest';
import {
  guardAll,
  guardCounts,
  guardNumber,
  hasUnitWord,
  readNumber,
  readNumberOr0,
  type NumSpec,
} from '../data/inputGuards';

const money = (over: Partial<NumSpec> = {}): NumSpec => ({ label: '金額', kind: 'money', ...over });

describe('readNumber — 計算と警告が同じ関数を使うための読み取り', () => {
  it('桁区切り・通貨記号・単位の飾りを外して読む', () => {
    expect(readNumber('30,000')).toBe(30_000);
    expect(readNumber('¥1,200,000')).toBe(1_200_000);
    expect(readNumber('500円')).toBe(500);
    expect(readNumber('5%')).toBe(5);
    expect(readNumber('300 ㎡')).toBe(300);
    expect(readNumber(' 42 ')).toBe(42);
    expect(readNumber('3.5')).toBe(3.5);
    expect(readNumber('-8')).toBe(-8);
  });

  it('全角で入力しても読む', () => {
    expect(readNumber('１２３４５')).toBe(12_345);
    expect(readNumber('１，０００')).toBe(1_000);
    expect(readNumber('３．５')).toBe(3.5);
  });

  it('空・未定義は null（未入力の扱いは呼び出し側に任せる）', () => {
    expect(readNumber('')).toBeNull();
    expect(readNumber('   ')).toBeNull();
    expect(readNumber(undefined)).toBeNull();
    expect(readNumber(null)).toBeNull();
  });

  it('数値に見えて数値でないものを読まない', () => {
    for (const bad of ['1e3', '0x10', 'Infinity', 'NaN', '1..2', '++5', '+-5', 'abc', '未定', '応相談', '-']) {
      expect(readNumber(bad), bad).toBeNull();
    }
  });

  it('単位語（万・億）は読まない — 誤解釈より未読を選ぶ', () => {
    expect(readNumber('4200万')).toBeNull();
    expect(readNumber('1億')).toBeNull();
    expect(readNumber('3千')).toBeNull();
    expect(hasUnitWord('4200万')).toBe(true);
    expect(hasUnitWord('42000000')).toBe(false);
  });

  it('readNumberOr0 は読めないものを 0 にする（計算側の既定）', () => {
    expect(readNumberOr0('30,000')).toBe(30_000);
    expect(readNumberOr0('4200万')).toBe(0);
    expect(readNumberOr0('')).toBe(0);
  });

  it('従来 Number() で壊れていた入力が読めるようになっている', () => {
    // MutualFundsPage は Number('30,000') || 0 で 0 に落ちていた
    expect(Number('30,000')).toBeNaN();
    expect(readNumberOr0('30,000')).toBe(30_000);
  });
});

describe('guardNumber — 黙って 0 にしない', () => {
  it('読めない入力は fatal で「0 として計算されている」と言う', () => {
    const issue = guardNumber('あああ', money());
    expect(issue?.level).toBe('fatal');
    expect(issue?.message).toContain('0 円 として計算');
  });

  it('単位付きは専用の文面で、単位を外すよう促す', () => {
    const issue = guardNumber('4,200万', money());
    expect(issue?.level).toBe('fatal');
    expect(issue?.message).toContain('単位付き');
    expect(issue?.message).toContain('円 の数値だけ');
  });

  it('未入力は warn。allowEmpty なら黙る', () => {
    expect(guardNumber('', money())?.level).toBe('warn');
    expect(guardNumber('', money({ allowEmpty: true }))).toBeNull();
  });

  it('正常な入力では何も言わない', () => {
    expect(guardNumber('1,200,000', money())).toBeNull();
    expect(guardNumber('¥300', money())).toBeNull();
  });

  it('マイナスは fatal（min を明示していれば通す）', () => {
    expect(guardNumber('-100', money())?.level).toBe('fatal');
    expect(guardNumber('-100', money({ min: -1000 }))).toBeNull();
  });

  it('area / length は 0 を fatal にする（0 で割る計算に流さない）', () => {
    expect(guardNumber('0', { label: '敷地面積', kind: 'area' })?.level).toBe('fatal');
    expect(guardNumber('0', { label: '道路幅員', kind: 'length' })?.level).toBe('fatal');
    // money は 0 が正常値
    expect(guardNumber('0', money())).toBeNull();
    // 明示的に許せば通る
    expect(guardNumber('0', { label: '敷地面積', kind: 'area', allowZero: true })).toBeNull();
  });

  it('min / max を外れたら fatal', () => {
    const cov: NumSpec = { label: '建ぺい率 (%)', kind: 'percent', min: 1, max: 100 };
    expect(guardNumber('120', cov)?.level).toBe('fatal');
    expect(guardNumber('0', cov)?.level).toBe('fatal');
    expect(guardNumber('60', cov)).toBeNull();
  });

  it('count は小数を warn（切り捨てられる旨を言う）', () => {
    const issue = guardNumber('2.5', { label: '賞与の回数', kind: 'count', max: 12 });
    expect(issue?.level).toBe('warn');
    expect(issue?.message).toContain('切り捨て');
  });

  it('桁を間違えていそうな大きさは warn で尋ねる', () => {
    const issue = guardNumber('150', { label: '保有年数', kind: 'years' });
    expect(issue?.level).toBe('warn');
    expect(issue?.message).toContain('桁を間違えて');
    expect(guardNumber('30', { label: '保有年数', kind: 'years' })).toBeNull();
  });

  it('sane を個別指定すると既定より優先される', () => {
    const spec: NumSpec = { label: '循環量 (L)', kind: 'ratio', sane: 1e6 };
    expect(guardNumber('500000', spec)).toBeNull();
    expect(guardNumber('2000000', spec)?.level).toBe('warn');
  });
});

describe('guardAll / guardCounts', () => {
  it('fatal → warn の順に並べ、問題のない欄は含めない', () => {
    const issues = guardAll([
      ['1000', money()],
      ['あ', money({ label: '取得価格' })],
      ['', money({ label: '自己資金' })],
      ['5000', money({ label: '経費' })],
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.level).toBe('fatal');
    expect(issues[0]!.label).toBe('取得価格');
    expect(issues[1]!.level).toBe('warn');
    expect(issues[1]!.label).toBe('自己資金');
  });

  it('すべて正常なら空配列（画面には何も出ない）', () => {
    expect(guardAll([['1', money()], ['2', money()]])).toEqual([]);
  });

  it('件数を数える', () => {
    const issues = guardAll([['あ', money()], ['い', money({ label: 'B' })], ['', money({ label: 'C' })]]);
    expect(guardCounts(issues)).toEqual({ fatal: 2, warn: 1 });
  });
});

/* ------------------------------------------------------------------ *
 * 以下は mutation testing で生き残った変異体を狙って足したケース。
 * 「呼べば通る」ではなく、値・分岐・文面を実際に固定する。
 * ------------------------------------------------------------------ */

describe('readNumber — 境界と実装の細部', () => {
  it('null / undefined は "null" "undefined" として正規表現に弾かれ null になる', () => {
    expect(readNumber(undefined)).toBeNull();
    expect(readNumber(null)).toBeNull();
  });

  it('桁があふれて Infinity になる入力も null にする', () => {
    expect(readNumber('9'.repeat(400))).toBeNull();
    expect(readNumber('9'.repeat(309))).toBeNull();
    // 有限に収まる長さなら読む
    expect(readNumber('1'.repeat(15))).toBe(111111111111111);
  });

  it('単位語の検出は 万・億・兆・千 と、数字直後の k/K/m/M/b/B に限る', () => {
    for (const s of ['1万', '1億', '1兆', '1千', '5k', '5K', '5m', '5M', '5b', '5B', '5 k']) {
      expect(readNumber(s), s).toBeNull();
      expect(hasUnitWord(s), s).toBe(true);
    }
    // 単位語でない文字は飾りとして落とすか、そのまま弾く
    expect(hasUnitWord('1000')).toBe(false);
    expect(hasUnitWord('1,000円')).toBe(false);
  });

  it('飾りとして落とすのは通貨記号・単位・区切りだけで、他の文字は弾く', () => {
    expect(readNumber('1,000㎡')).toBe(1000);
    expect(readNumber('3人')).toBe(3);
    expect(readNumber('5株')).toBe(5);
    expect(readNumber('12日')).toBe(12);
    expect(readNumber('1_000')).toBeNull();
    expect(readNumber('1/2')).toBeNull();
    expect(readNumber('1:2')).toBeNull();
  });

  it('符号と小数の形は厳格に判定する', () => {
    expect(readNumber('+5')).toBe(5);
    expect(readNumber('-5')).toBe(-5);
    expect(readNumber('.5')).toBeNull();
    expect(readNumber('5.')).toBeNull();
    expect(readNumber('5.0')).toBe(5);
  });

  it('hasUnitWord は空・null・undefined で false', () => {
    expect(hasUnitWord('')).toBe(false);
    expect(hasUnitWord(undefined)).toBe(false);
    expect(hasUnitWord(null)).toBe(false);
  });
});

describe('guardNumber — 種類ごとの既定と文面', () => {
  const at = (kind: NumSpec['kind'], raw: string, over: Partial<NumSpec> = {}) =>
    guardNumber(raw, { label: 'X', kind, ...over });

  it('未入力の文面に kind ごとの単位が入る', () => {
    expect(at('money', '')?.message).toBe('未入力です。0 円 として計算されています。');
    expect(at('percent', '')?.message).toBe('未入力です。0 % として計算されています。');
    expect(at('years', '')?.message).toBe('未入力です。0 年 として計算されています。');
    expect(at('months', '')?.message).toBe('未入力です。0 か月 として計算されています。');
    expect(at('count', '')?.message).toBe('未入力です。0 件 として計算されています。');
    expect(at('area', '')?.message).toBe('未入力です。0 ㎡ として計算されています。');
    expect(at('length', '')?.message).toBe('未入力です。0 m として計算されています。');
    expect(at('ratio', '')?.message).toBe('未入力です。0 倍 として計算されています。');
    expect(at('ppm', '')?.message).toBe('未入力です。0 mg/L として計算されています。');
  });

  it('null / undefined も未入力として扱う', () => {
    expect(guardNumber(undefined, { label: 'X', kind: 'money' })?.level).toBe('warn');
    expect(guardNumber(null, { label: 'X', kind: 'money' })?.level).toBe('warn');
    expect(guardNumber(undefined, { label: 'X', kind: 'money' })?.message).toContain('未入力');
  });

  it('percent だけはマイナスを fatal にしない（残高の減少率などを許す）', () => {
    expect(at('percent', '-5')).toBeNull();
    for (const k of ['money', 'years', 'months', 'count', 'area', 'length', 'ratio', 'ppm'] as const) {
      expect(at(k, '-5')?.level, k).toBe('fatal');
      expect(at(k, '-5')?.message, k).toBe('マイナスの値（-5）は指定できません。');
    }
  });

  it('0 を fatal にするのは area / length だけ', () => {
    expect(at('area', '0')?.message).toBe('0 ㎡ では計算できません。');
    expect(at('length', '0')?.message).toBe('0 m では計算できません。');
    for (const k of ['money', 'percent', 'years', 'months', 'count', 'ratio', 'ppm'] as const) {
      expect(at(k, '0'), k).toBeNull();
    }
  });

  it('整数を求めるのは count だけ', () => {
    expect(at('count', '2.5')?.message).toBe('整数で入力してください（現在 2.5）。小数は切り捨てられます。');
    for (const k of ['money', 'percent', 'years', 'months', 'area', 'length', 'ratio', 'ppm'] as const) {
      expect(at(k, '2.5'), k).toBeNull();
    }
  });

  it('percent の既定の上限は 1000%', () => {
    expect(at('percent', '1000')?.level).toBe('warn'); // sane 100 超だが max 内
    expect(at('percent', '1001')?.message).toBe('1000 % 以下で入力してください（現在 1001）。');
  });

  it('桁ミス警告の閾値は kind ごとに違う', () => {
    expect(at('years', '101')?.message).toBe('101 年 は想定の範囲を超えています。桁を間違えていないか確認してください。');
    expect(at('years', '100')).toBeNull();
    expect(at('months', '1201')?.level).toBe('warn');
    expect(at('months', '1200')).toBeNull();
    expect(at('count', '100001')?.level).toBe('warn');
    expect(at('length', '1001')?.level).toBe('warn');
    expect(at('ratio', '1001')?.level).toBe('warn');
    expect(at('ppm', '100001')?.level).toBe('warn');
    expect(at('area', '1000001')?.level).toBe('warn');
    expect(at('money', '10000000000001')?.level).toBe('warn');
    expect(at('money', '10000000000000')).toBeNull();
  });

  it('桁ミス警告の数値は 3 桁区切りで出す', () => {
    expect(at('money', '99999999999999')?.message).toContain('99,999,999,999,999 円');
  });

  it('min を下回る文面に単位と現在値が入る', () => {
    expect(guardNumber('3', { label: 'X', kind: 'percent', min: 5 })?.message)
      .toBe('5 % 以上で入力してください（現在 3）。');
  });

  it('max は spec が rule より優先される', () => {
    expect(guardNumber('50', { label: 'X', kind: 'percent', max: 30 })?.message)
      .toBe('30 % 以下で入力してください（現在 50）。');
  });

  it('min を負にすればマイナスを通す', () => {
    expect(guardNumber('-5', { label: 'X', kind: 'money', min: -10 })).toBeNull();
    expect(guardNumber('-20', { label: 'X', kind: 'money', min: -10 })?.message)
      .toBe('-10 円 以上で入力してください（現在 -20）。');
  });

  it('allowZero を明示すると kind の既定より優先される', () => {
    expect(guardNumber('0', { label: 'X', kind: 'area', allowZero: true })).toBeNull();
    expect(guardNumber('0', { label: 'X', kind: 'money', allowZero: false })?.level).toBe('fatal');
  });

  it('読み取れない入力の文面は単位付きかどうかで変わる', () => {
    expect(guardNumber('あ', { label: 'X', kind: 'area' })?.message)
      .toBe('「あ」を数値として読み取れません。0 ㎡ として計算されています。');
    expect(guardNumber('3万', { label: 'X', kind: 'area' })?.message)
      .toBe('「3万」は単位付きのため読み取れません。0 ㎡ として計算されています。単位を付けず ㎡ の数値だけを入力してください。');
  });

  it('label がそのまま issue に載る', () => {
    expect(guardNumber('', { label: '敷地面積', kind: 'area' })?.label).toBe('敷地面積');
  });
});

describe('guardAll — 並び順', () => {
  it('fatal → warn → info の順で、同じレベルは検出順を保つ', () => {
    const issues = guardAll([
      ['', { label: 'W1', kind: 'money' }],
      ['あ', { label: 'F1', kind: 'money' }],
      ['', { label: 'W2', kind: 'money' }],
      ['い', { label: 'F2', kind: 'money' }],
    ]);
    expect(issues.map((i) => i.label)).toEqual(['F1', 'F2', 'W1', 'W2']);
  });

  it('空の入力一覧では空配列', () => {
    expect(guardAll([])).toEqual([]);
    expect(guardCounts([])).toEqual({ fatal: 0, warn: 0 });
  });
});

describe('残った変異体を狙う — 観測できる差があるもの', () => {
  it('小数は 2 桁以上でも読む（正規表現の \\d+ が効いている）', () => {
    expect(readNumber('3.25')).toBe(3.25);
    expect(readNumber('0.001')).toBe(0.001);
    expect(readNumber('12.3456')).toBe(12.3456);
  });

  it('空白だけの入力は「未入力」であって「読み取れません」ではない', () => {
    const issue = guardNumber('   ', money());
    expect(issue?.level).toBe('warn');
    expect(issue?.message).toBe('未入力です。0 円 として計算されています。');
    expect(guardNumber('　', money())?.level).toBe('warn'); // 全角スペース
    expect(guardNumber(' \t ', money({ allowEmpty: true }))).toBeNull();
  });

  it('min が 0 以上のときのマイナス値は「マイナスは指定できません」を優先する', () => {
    // min=5 の欄に -3 → min 未満のメッセージではなく、マイナスの指摘が出る
    expect(guardNumber('-3', { label: 'X', kind: 'money', min: 5 })?.message)
      .toBe('マイナスの値（-3）は指定できません。');
    // min=0 でも同じ（>= 0 の判定）
    expect(guardNumber('-3', { label: 'X', kind: 'money', min: 0 })?.message)
      .toBe('マイナスの値（-3）は指定できません。');
    // min が負なら、マイナスを許して min 判定に回る
    expect(guardNumber('-30', { label: 'X', kind: 'money', min: -10 })?.message)
      .toBe('-10 円 以上で入力してください（現在 -30）。');
  });

  it('min ちょうどは通す（境界）', () => {
    expect(guardNumber('5', { label: 'X', kind: 'money', min: 5 })).toBeNull();
    expect(guardNumber('4.99', { label: 'X', kind: 'money', min: 5 })?.level).toBe('fatal');
  });

  it('同じレベルが 3 件以上でも検出順を保つ（並べ替えの安定性）', () => {
    const issues = guardAll([
      ['あ', { label: 'F1', kind: 'money' }],
      ['い', { label: 'F2', kind: 'money' }],
      ['う', { label: 'F3', kind: 'money' }],
      ['', { label: 'W1', kind: 'money' }],
      ['', { label: 'W2', kind: 'money' }],
      ['', { label: 'W3', kind: 'money' }],
    ]);
    expect(issues.map((i) => i.label)).toEqual(['F1', 'F2', 'F3', 'W1', 'W2', 'W3']);
  });

  it('warn が先に来ても fatal が前に出る（並べ替えが実際に効いている）', () => {
    const issues = guardAll([
      ['', { label: 'W1', kind: 'money' }],
      ['', { label: 'W2', kind: 'money' }],
      ['あ', { label: 'F1', kind: 'money' }],
    ]);
    expect(issues.map((i) => i.label)).toEqual(['F1', 'W1', 'W2']);
  });
});
