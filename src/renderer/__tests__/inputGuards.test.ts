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
