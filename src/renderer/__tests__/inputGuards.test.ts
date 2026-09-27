import { describe, expect, it, vi } from 'vitest';
import {
  guardAll,
  guardCounts,
  guardNumber,
  hasUnitWord,
  hasInteriorNoise,
  readNumber,
  readNumberOr0,
  readNumberOrNull,
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

  /**
   * **未入力に対する答えは 2 つではなく 3 つ — 値 / 0 / 「分からない」。**
   * `allowZero` を持たない欄 (`area` / `length` / `count` は 0 が fatal) では
   * 空欄を 0 に倒すと**画面が受け付けない値**が計算に入り、算定できていない結果が
   * 「0 という測定値」として出る (パス 77 で用途地域プランナーがそうなっていた)。
   */
  it('readNumberOrNull は読めないものを null にする（0 が意味を持つ欄と分ける）', () => {
    expect(readNumberOrNull('30,000')).toBe(30_000);
    // 0 と入力されたら 0 —— 「0 を打った」と「打っていない」は別。
    expect(readNumberOrNull('0')).toBe(0);
    expect(readNumberOrNull('')).toBeNull();
    expect(readNumberOrNull('   ')).toBeNull();
    expect(readNumberOrNull(undefined)).toBeNull();
    expect(readNumberOrNull(null)).toBeNull();
    expect(readNumberOrNull('abc')).toBeNull();
    expect(readNumberOrNull('4200万')).toBeNull(); // 単位語は解釈しない (readNumberOr0 は 0)
  });

  it('★ 同じ入力で 2 つの読み取りが分かれる (どちらを使うかが設計判断である)', () => {
    // 空欄: `Or0` は「0 という値」、`OrNull` は「値が無い」。
    expect(readNumberOr0('')).toBe(0);
    expect(readNumberOrNull('')).toBeNull();
    // 読めない入力でも同じ分岐。
    expect(readNumberOr0('4200万')).toBe(0);
    expect(readNumberOrNull('4200万')).toBeNull();
    // 読める入力では一致する (床が読みを歪めていない)。
    for (const raw of ['0', '1', '30,000', '¥1,200,000', '5%']) {
      expect(readNumberOrNull(raw), raw).toBe(readNumberOr0(raw));
    }
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

  it('回数は小数を warn —— 小数をどう扱うかは言わない (扱いは欄を読む側が決める・パス 493p)', () => {
    const issue = guardNumber('2.5', { label: '賞与の回数', kind: 'times', max: 12 });
    expect(issue?.level).toBe('warn');
    expect(issue?.message).toBe('整数で入力してください（現在 2.5）。');
    // 直す前は「小数は切り捨てられます」と続けていた —— 従業者数・決算月・終了年は丸め、
    // 自治体数・棚の段数はそのまま使い、水耕の日数は保存で断るので、どの欄でも真ではなかった。
    // 標本が的に当たる: 直す前の文はこの綴りを持つ
    expect('整数で入力してください（現在 2.5）。小数は切り捨てられます。').toContain('切り捨て');
    expect(issue?.message).not.toContain('切り捨て');
  });

  it('桁を間違えていそうな大きさは warn で尋ねる', () => {
    const issue = guardNumber('150', { label: '保有年数', kind: 'years' });
    expect(issue?.level).toBe('warn');
    expect(issue?.message).toContain('桁を間違えて');
    expect(guardNumber('30', { label: '保有年数', kind: 'years' })).toBeNull();
  });

  it('sane を個別指定すると既定より優先される', () => {
    const spec: NumSpec = { label: '循環量 (L)', kind: 'liters', sane: 1e6 };
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

/**
 * **飾りの位置 —— 「読めている」のに別の数だった入力の台帳。**
 *
 * 2026-09-06 まで `readNumber` は飾り (通貨記号・単位・桁区切り) を
 * **位置を見ずに**落としていた。飾りが数字の**間**にあると離れた桁が
 * つながって別の数になり、しかも `readNumber` が値を返すので
 * `guardNumber` は何も言わない —— このモジュールが潰したはずの
 * 「黙って間違った数で計算する」が、0 ではなく**別の数**の形で残っていた。
 *
 * 下の表は、そのとき**実際に返っていた数**を第 2 欄に持つ。
 * 各行について
 *   (1) 旧実装なら数として読めた   ← 対照。表が「元から弾いていた入力」に
 *                                  すり替わったら落ちる
 *   (2) 今は読まない
 *   (3) 指摘は「数字の間に…」の文面で出る (単位語の文面と混ざらない)
 * を見る。
 */
const POSITION_CENSUS: [string, number][] = [
  ['100m2', 1002], // 面積 100 ㎡ → 1002 ㎡
  ['100㎡2', 1002],
  ['0.5m3', 0.53], // 小数が壊れる
  ['3年6月', 36], // 3 年 6 か月 → 36 年
  ['1月2日', 12],
  ['2024年12月31日', 20241231], // 日付を金額欄に貼ると 2,024 万円
  ['30 000', 30000], // 空白区切りは区別できないので読まない
  ['1 2 3', 123],
  ['12%3', 123],
  ['3人4', 34],
  ['5株6', 56],
  ['1,5', 15],
  ['1,23', 123],
  ['12,3456', 123456],
  ['1,000,00', 100000],
  ['1,000,000,00', 100000000],
  ['¥1,2', 12],
  ['5%5', 55],
  ['1ｍ2', 12],
  ['１００ｍ２', 1002],
];

/** 2026-09-06 までの読み取り (飾りを位置を見ずに全部落とす)。対照に使う。 */
function readIgnoringPosition(raw: string): number | null {
  const half = raw.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/[万億兆千]|[０-９0-9]\s*[kKmMbB]\b/.test(half)) return null;
  const bare = half.replace(/[¥￥$,\s円％%人年月日個株㎡ｍm]/g, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(bare)) return null;
  const n = Number(bare);
  return Number.isFinite(n) ? n : null;
}

describe('readNumber — 飾りの位置 (数字の間の単位・区切り)', () => {
  it.each(POSITION_CENSUS)('対照: 「%s」は旧実装なら %d と読めていた', (raw, was) => {
    // これが落ちるなら、台帳の行が「元から弾いていた入力」になっている
    // (= 検査が何も守っていない)。
    expect(readIgnoringPosition(raw)).toBe(was);
  });

  it.each(POSITION_CENSUS)('★ 「%s」は読まない (別の数として通していた)', (raw) => {
    expect(readNumber(raw)).toBeNull();
    expect(hasInteriorNoise(raw)).toBe(true);
  });

  it.each(POSITION_CENSUS)('★ 「%s」の指摘は位置の話として出る', (raw) => {
    const issue = guardNumber(raw, { label: '面積', kind: 'area' });
    expect(issue?.level).toBe('fatal');
    expect(issue?.message).toContain('数字の間に単位や区切りが入っている');
    // 何 ㎡ として計算されているかは、これまでどおり書く。
    expect(issue?.message).toContain('0 ㎡ として計算されています');
  });

  it('★ 単位語 (万・億) は今までの文面のまま (位置の文面に飲まれない)', () => {
    const issue = guardNumber('4200万', { label: '取得価格', kind: 'money' });
    expect(issue?.message).toContain('単位付きのため読み取れません');
    expect(issue?.message).not.toContain('数字の間に');
    expect(hasInteriorNoise('4200万')).toBe(false);
  });

  it('★ 元から数値でない入力は「数値として読み取れません」のまま', () => {
    for (const raw of ['abc', '未定', '1/2', '1_000', '1e3', '0x10', '-']) {
      expect(hasInteriorNoise(raw), raw).toBe(false);
      const issue = guardNumber(raw, { label: '取得価格', kind: 'money' });
      expect(issue?.message, raw).toContain('を数値として読み取れません');
      expect(issue?.message, raw).not.toContain('数字の間に');
    }
  });

  it('対照: 飾りが正しい位置にある入力は今までどおり読める', () => {
    // 位置を見る前と後で**同じ値**になること (KEEP 集合)。
    const keep: [string, number][] = [
      ['30,000', 30_000],
      ['¥1,200,000', 1_200_000],
      ['500円', 500],
      ['5%', 5],
      ['300 ㎡', 300],
      [' 42 ', 42],
      ['3.5', 3.5],
      ['-8', -8],
      ['+5', 5],
      ['5.0', 5],
      ['１２３４５', 12_345],
      ['１，０００', 1_000],
      ['３．５', 3.5],
      ['1,000㎡', 1000],
      ['3人', 3],
      ['12日', 12],
      ['¥ 1,000 円', 1000],
      ['-¥500', -500],
      ['¥-500', -500],
    ];
    for (const [raw, value] of keep) {
      expect(readNumber(raw), raw).toBe(value);
      expect(readIgnoringPosition(raw), raw).toBe(value);
      expect(hasInteriorNoise(raw), raw).toBe(false);
      // 負数も許す spec で見る (符号は「位置」の話ではない)。
      expect(
        guardNumber(raw, { label: '任意', kind: 'money', allowZero: true, min: -1_000_000 }),
        raw,
      ).toBeNull();
    }
  });

  it('桁区切りは 3 桁ごとでなければ読まない (境界)', () => {
    expect(readNumber('1,000')).toBe(1000);
    expect(readNumber('12,000')).toBe(12_000);
    expect(readNumber('123,000')).toBe(123_000);
    expect(readNumber('1,234,567')).toBe(1_234_567);
    expect(readNumber('1234,567')).toBeNull();
    expect(readNumber('1,2345')).toBeNull();
    expect(readNumber(',000')).toBeNull();
    expect(readNumber('1,')).toBeNull();
  });
});

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
    // 人数 (パス 493k)。総称の `count` (件) を借りると扶養親族の欄で「20 件 以下で入力してください」と言った。
    expect(at('people', '')?.message).toBe('未入力です。0 人 として計算されています。');
    expect(at('people', '21', { max: 20 })?.message).toBe('20 人 以下で入力してください（現在 21）。');
    // パス 493n: `count` (件) と `ratio` (倍) を消し、欄の実物の単位語を持つ種類へ。
    expect(at('hours', '25', { max: 24 })?.message).toBe('24 h 以下で入力してください（現在 25）。');
    expect(at('tiers', '31', { sane: 30 })?.message).toBe('31 段 は想定の範囲を超えています。桁を間違えていないか確認してください。');
    expect(at('times', '13', { max: 12 })?.message).toBe('12 回 以下で入力してください（現在 13）。');
    expect(at('municipalities', '101', { max: 100 })?.message).toBe('100 団体 以下で入力してください（現在 101）。');
    expect(at('dwellings', '1001', { max: 1000 })?.message).toBe('1000 戸 以下で入力してください（現在 1001）。');
    expect(at('calendarMonth', '13', { min: 1, max: 12 })?.message).toBe('12 月 以下で入力してください（現在 13）。');
    expect(at('calendarYear', '1999', { min: 2000, max: 2100 })?.message).toBe('2000 年 以上で入力してください（現在 1999）。');
    expect(at('currencyUnits', '0', { allowZero: false })?.message).toBe('0 通貨 では計算できません。');
    expect(at('area', '')?.message).toBe('未入力です。0 ㎡ として計算されています。');
    expect(at('length', '')?.message).toBe('未入力です。0 m として計算されています。');
    expect(at('ppm', '')?.message).toBe('未入力です。0 mg/L として計算されています。');
    // 水耕栽培の入力欄が足した 3 種。近い kind を借りると「0 倍」「0 mg/L」と嘘の単位を言う。
    expect(at('days', '')?.message).toBe('未入力です。0 日 として計算されています。');
    expect(at('energy', '')?.message).toBe('未入力です。0 kWh/kg として計算されています。');
    expect(at('mgPer100g', '')?.message).toBe('未入力です。0 mg/100g として計算されています。');
    // 通勤距離。`length` (m・0 を断る) を借りるとマイカー通勤なし = 0 km を断ってしまう。
    expect(at('km', '')?.message).toBe('未入力です。0 km として計算されています。');
  });

  it('null / undefined も未入力として扱う', () => {
    expect(guardNumber(undefined, { label: 'X', kind: 'money' })?.level).toBe('warn');
    expect(guardNumber(null, { label: 'X', kind: 'money' })?.level).toBe('warn');
    expect(guardNumber(undefined, { label: 'X', kind: 'money' })?.message).toContain('未入力');
  });

  it('percent と celsius はマイナスを fatal にしない（残高の減少率・氷点下の気温を許す）', () => {
    expect(at('percent', '-5')).toBeNull();
    // 温度 (パス 493k): 下限を持たない spec でも -5 ℃ を断らない。下限を持てばそちらで断る
    expect(at('celsius', '-5')).toBeNull();
    expect(at('celsius', '-25', { min: -20 })?.message).toBe('-20 ℃ 以上で入力してください（現在 -25）。');
    for (const k of ['money', 'years', 'months', 'people', 'hours', 'tiers', 'times', 'municipalities', 'dwellings', 'calendarMonth', 'calendarYear', 'currencyUnits', 'area', 'length', 'ppm', 'days', 'energy', 'mgPer100g', 'km'] as const) {
      expect(at(k, '-5')?.level, k).toBe('fatal');
      expect(at(k, '-5')?.message, k).toBe('マイナスの値（-5）は指定できません。');
    }
  });

  it('0 を fatal にするのは area / length だけ', () => {
    expect(at('area', '0')?.message).toBe('0 ㎡ では計算できません。');
    expect(at('length', '0')?.message).toBe('0 m では計算できません。');
    for (const k of ['money', 'percent', 'years', 'months', 'people', 'hours', 'tiers', 'times', 'municipalities', 'dwellings', 'calendarMonth', 'calendarYear', 'currencyUnits', 'ppm', 'days', 'energy', 'mgPer100g', 'km'] as const) {
      expect(at(k, '0'), k).toBeNull();
    }
  });

  it('整数を求めるのは数えられる物の種類だけ (人・日・段・回・団体・戸・暦の月と年)', () => {
    for (const k of ['people', 'days', 'tiers', 'times', 'municipalities', 'dwellings', 'calendarMonth', 'calendarYear'] as const) {
      expect(at(k, '2.5')?.message, k).toBe('整数で入力してください（現在 2.5）。');
    }
    // 時間は小数を許す (RO 処理目標 8.5 h は正当)。外貨の額も同じ。
    for (const k of ['money', 'percent', 'years', 'months', 'hours', 'currencyUnits', 'area', 'length', 'ppm', 'energy', 'mgPer100g', 'km'] as const) {
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
    expect(at('tiers', '101')?.level).toBe('warn');
    expect(at('tiers', '100')).toBeNull();
    expect(at('length', '1001')?.level).toBe('warn');
    expect(at('hours', '8761')?.level).toBe('warn');
    expect(at('hours', '8760')).toBeNull();
    expect(at('ppm', '100001')?.level).toBe('warn');
    expect(at('days', '3651')?.level).toBe('warn');
    expect(at('days', '3650')).toBeNull();
    expect(at('energy', '101')?.message).toBe('101 kWh/kg は想定の範囲を超えています。桁を間違えていないか確認してください。');
    expect(at('energy', '100')).toBeNull();
    expect(at('mgPer100g', '10001')?.level).toBe('warn');
    expect(at('mgPer100g', '10000')).toBeNull();
    expect(at('km', '1001')?.level).toBe('warn');
    expect(at('km', '1000')).toBeNull();
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

/**
 * `KIND` 表と読み取りの正規表現 (全角・単位語・飾り) はモジュール読み込み時に
 * 確定する static な値で、上の検査では Stryker が「static 変異体」として測らずに
 * 無視する (2026-09-02 の実測で 202 件中 61 件)。`vi.resetModules()` の後に動的
 * import で読み直すと、この it の中で表が組み立て直されて変異体が測られる。
 * 上と同じ主張を、測られる形でもう 1 度置く (hydroponicCrops / assistant と同じ手)。
 */
describe('KIND 表と正規表現の static 変異体を測る (動的 import で読み直す)', () => {
  // ★ `satisfies Record<NumSpec['kind'], …>` —— 種類を足して、この写しに行を書き忘れると
  // typecheck が落ちる (パス 493k で `people` を足したとき、この表は種類の一覧を
  // 型で縛っておらず、書き忘れても全件が緑のままだった)。
  const UNITS = {
    money: '円', percent: '%', years: '年', months: 'か月', people: '人',
    // パス 493n: 総称の `count` (件) / `ratio` (倍) の代わりに、欄の実物の単位語を持つ 8 種
    hours: 'h', tiers: '段', times: '回', municipalities: '団体', dwellings: '戸',
    calendarMonth: '月', calendarYear: '年', currencyUnits: '通貨',
    area: '㎡', length: 'm', ppm: 'mg/L', days: '日', energy: 'kWh/kg', mgPer100g: 'mg/100g', km: 'km',
    // ★ 水耕栽培の 5 種 (パス 373) は、型で縛るまでこの写しから**漏れていた** (パス 493k で捕まえた)
    celsius: '℃', liters: 'L', ppmAir: 'ppm', normality: 'N', ecRise: 'mS/cm',
  } as const satisfies Record<NumSpec['kind'], string>;
  /** 桁を尋ねる既定。`null` は**種類としては尋ねない** —— 上限は欄の spec が持つ (暦の月・年・団体・戸)。 */
  const SANE = {
    money: 1e13, percent: 100, years: 100, months: 1200, people: 100000,
    hours: 8760, tiers: 100, times: 1000, municipalities: null, dwellings: null,
    calendarMonth: null, calendarYear: null, currencyUnits: 1e13,
    area: 1e6, length: 1000, ppm: 100000, days: 3650, energy: 100, mgPer100g: 10000, km: 1000,
    celsius: 60, liters: 100000, ppmAir: 50000, normality: 40, ecRise: 5,
  } as const satisfies Record<NumSpec['kind'], number | null>;
  type Kind = keyof typeof UNITS;
  const KINDS = Object.keys(UNITS) as Kind[];
  /** 整数を求める種類 (数えられる物)。 */
  const INTEGER: ReadonlySet<Kind> = new Set<Kind>([
    'people', 'days', 'tiers', 'times', 'municipalities', 'dwellings', 'calendarMonth', 'calendarYear',
  ]);

  it('kind ごとの単位・マイナス・0・整数・上限・桁ミスの既定が写しと一致する', async () => {
    vi.resetModules();
    const m = await import('../data/inputGuards');
    const at = (kind: Kind, raw: string) => m.guardNumber(raw, { label: 'X', kind });
    for (const k of KINDS) {
      expect(at(k, '')?.message, k).toBe(`未入力です。0 ${UNITS[k]} として計算されています。`);
      expect(at(k, '-5')?.level, k).toBe(k === 'percent' || k === 'celsius' ? undefined : 'fatal');
      expect(at(k, '0')?.message, k).toBe(k === 'area' || k === 'length' ? `0 ${UNITS[k]} では計算できません。` : undefined);
      expect(at(k, '2.5')?.level, k).toBe(INTEGER.has(k) ? 'warn' : undefined);
      const sane = SANE[k];
      if (sane === null) {
        // 桁を尋ねない種類 —— 大きな整数でも種類としては何も言わない (欄の spec の上限が断る)
        expect(at(k, '1000000000000'), k).toBeNull();
        continue;
      }
      expect(at(k, String(sane)), k).toBeNull();
      expect(at(k, String(sane + 1))?.message, k).toBe(
        `${(sane + 1).toLocaleString('ja-JP')} ${UNITS[k]} は想定の範囲を超えています。桁を間違えていないか確認してください。`,
      );
    }
    // 上限 (max) を持つのは percent だけ: 1001 は fatal、他の kind の 1001 は fatal にならない。
    expect(at('percent', '1001')?.message).toBe('1000 % 以下で入力してください（現在 1001）。');
    for (const k of KINDS.filter((k) => k !== 'percent')) expect(at(k, '1001')?.level, k).not.toBe('fatal');
  });

  it('全角の半角化・単位語・飾りの正規表現が効く', async () => {
    vi.resetModules();
    const m = await import('../data/inputGuards');
    expect(m.readNumber('１，０００')).toBe(1000);
    expect(m.readNumber('¥1,000円')).toBe(1000);
    expect(m.readNumber('50％')).toBe(50);
    expect(m.readNumber(' 10人 ')).toBe(10);
    expect(m.readNumber('3株')).toBe(3);
    expect(m.readNumber('20㎡')).toBe(20);
    expect(m.readNumber('12個')).toBe(12);
    for (const unitWord of ['1万', '2億', '3兆', '4千', '5k', '6 M', '7b']) {
      expect(m.readNumber(unitWord), unitWord).toBeNull();
      expect(m.hasUnitWord(unitWord), unitWord).toBe(true);
    }
    expect(m.hasUnitWord('1000')).toBe(false);
    expect(m.readNumber('abc')).toBeNull();
  });
});
