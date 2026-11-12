/**
 * **関門は、読む側の扱いどおりの結果を 1 つ述べる** (2026-09-27 · パス 493l)。
 *
 * それまで読めない値の 3 枝と空欄の枝は、欄を問わず「0 X として計算されています」と
 * 述べていた。実測 (全画面の関門つき 91 欄): `abc` で 76 欄・空欄で 38 欄がその文と
 * 違うことをしていた (段ごと断る・保存を断る・「—」にする・既定へ倒す)。
 * 宣言が扱いを持ち (`refusedBy` / `absent`)、関門は結果を選んで文と `outcome` を返す。
 *
 * ここは**関門そのもの**を枝ごとに留める。画面の振る舞いとの一致は
 * `guardClaimsOnScreen.test.ts` (全画面の走査) と `data/__tests__/guardVsWriter.test.ts`
 * (物件フォームの書き手との総当たり) が持つ。
 */
import { describe, expect, it } from 'vitest';
import {
  guardNumber,
  outcomeSentence,
  refusalLabels,
  refusalNote,
  refusedFields,
  refusingSpecs,
  saveRefusalNote,
  type NumSpec,
} from '../data/inputGuards';

const money: NumSpec = { label: '金額', kind: 'money' };
const moneyNoZero: NumSpec = { label: '取得価格', kind: 'money', allowZero: false };
const years1: NumSpec = { label: '耐用年数', kind: 'years', min: 1, max: 100 };
const area: NumSpec = { label: '床面積', kind: 'area' };

describe('outcomeSentence — 結果の句は 1 か所', () => {
  it('5 つの結果の文面 (単位語は種類から)', () => {
    expect(outcomeSentence('computedAsZero', '円', undefined, '直すまで')).toBe('0 円 として計算されています。');
    expect(outcomeSentence('savedAsZero', '㎡', 'save', '入力するまで')).toBe('保存すると 0 ㎡ として記録されます。');
    expect(outcomeSentence('notComputed', 'm', undefined, '入力するまで')).toBe('この欄を使う値は算定していません。');
    expect(outcomeSentence('asIfEmpty', '円', undefined, '直すまで')).toBe('空欄と同じ扱いで計算しています。');
  });

  it('断る句は「保存」と「判定」を分け、「直すまで」と「入力するまで」を差し込む', () => {
    expect(outcomeSentence('refused', '円', 'save', '直すまで')).toBe('直すまで保存できません。');
    expect(outcomeSentence('refused', '円', 'save', '入力するまで')).toBe('入力するまで保存できません。');
    expect(outcomeSentence('refused', '円', 'judgement', '直すまで')).toBe('直すまで、この欄を使う判定は出していません。');
    expect(outcomeSentence('refused', '円', 'judgement', '入力するまで')).toBe('入力するまで、この欄を使う判定は出していません。');
    // 断る側が宣言されていなければ判定の文 (保存の文は保存を断る欄だけが言う)
    expect(outcomeSentence('refused', '円', undefined, '直すまで')).toBe('直すまで、この欄を使う判定は出していません。');
  });
});

describe('guardNumber — 空欄の結果', () => {
  it('断らない欄は今までどおり「0 として計算」(warn)', () => {
    const g = guardNumber('', money);
    expect(g).toEqual({ level: 'warn', label: '金額', message: '未入力です。0 円 として計算されています。', outcome: 'computedAsZero' });
  });

  it('allowEmpty の欄は何も言わない', () => {
    expect(guardNumber('', { ...money, allowEmpty: true })).toBeNull();
    expect(guardNumber('', { ...money, allowEmpty: true, refusedBy: 'save' })).toBeNull();
  });

  it('「無い」として読む欄は「算定していない」(断る表の中でも)', () => {
    for (const spec of [{ ...area, absent: 'null' as const }, { ...area, absent: 'null' as const, refusedBy: 'judgement' as const }]) {
      const g = guardNumber('   ', spec);
      expect(g?.outcome).toBe('notComputed');
      expect(g?.level).toBe('warn');
      expect(g?.message).toBe('未入力です。この欄を使う値は算定していません。');
    }
  });

  it('★ 断る表の欄で 0 を受け付けない欄の空欄は断る (0 で判定を作らない)', () => {
    const judged = guardNumber('', { ...moneyNoZero, refusedBy: 'judgement' });
    expect(judged).toEqual({
      level: 'warn',
      label: '取得価格',
      message: '未入力です。入力するまで、この欄を使う判定は出していません。',
      outcome: 'refused',
    });
    expect(guardNumber('', { ...moneyNoZero, refusedBy: 'save' })?.message).toBe('未入力です。入力するまで保存できません。');
    // 下限が 0 より上 (耐用年数 1 年〜) も「0 を受け付けない」
    expect(guardNumber('', { ...years1, refusedBy: 'judgement' })?.outcome).toBe('refused');
    // 種類が 0 を断る (面積) のも同じ
    expect(guardNumber('', { ...area, refusedBy: 'save' })?.outcome).toBe('refused');
  });

  it('★ 断る表でも 0 を受け付ける欄の空欄は 0 として扱う (判定は計算・保存は 0 を書く)', () => {
    expect(guardNumber('', { ...money, refusedBy: 'judgement' })?.outcome).toBe('computedAsZero');
    const saved = guardNumber('', { ...money, refusedBy: 'save' });
    expect(saved?.outcome).toBe('savedAsZero');
    expect(saved?.message).toBe('未入力です。保存すると 0 円 として記録されます。');
    // allowZero を明示すれば、種類が 0 を断っても受け付ける
    expect(guardNumber('', { ...area, allowZero: true, refusedBy: 'save' })?.outcome).toBe('savedAsZero');
    // 下限が 0 以下なら受け付ける (境界)
    expect(guardNumber('', { ...money, min: 0, refusedBy: 'judgement' })?.outcome).toBe('computedAsZero');
    expect(guardNumber('', { ...money, min: -5, refusedBy: 'judgement' })?.outcome).toBe('computedAsZero');
    // 断らない欄は 0 を受け付けなくても 0 として計算 (読む側は `readNumberOr0` のまま)
    expect(guardNumber('', moneyNoZero)?.outcome).toBe('computedAsZero');
  });
});

describe('guardNumber — 読めない値の結果', () => {
  it('断らない欄は「0 として計算」、断る欄は断る句、「無い」として読む欄は「空欄と同じ」', () => {
    expect(guardNumber('abc', money)).toEqual({
      level: 'fatal',
      label: '金額',
      message: '「abc」を数値として読み取れません。0 円 として計算されています。',
      outcome: 'computedAsZero',
    });
    expect(guardNumber('abc', { ...money, refusedBy: 'judgement' })?.message).toBe(
      '「abc」を数値として読み取れません。直すまで、この欄を使う判定は出していません。',
    );
    expect(guardNumber('abc', { ...money, refusedBy: 'save' })?.message).toBe('「abc」を数値として読み取れません。直すまで保存できません。');
    const empty = guardNumber('abc', { ...money, absent: 'null' });
    expect(empty?.outcome).toBe('asIfEmpty');
    expect(empty?.message).toBe('「abc」を数値として読み取れません。空欄と同じ扱いで計算しています。');
    // 断る表なら「無い」として読む欄でも断る (段が断るので「空欄と同じ」は偽になる)
    expect(guardNumber('abc', { ...area, absent: 'null', refusedBy: 'judgement' })?.outcome).toBe('refused');
  });

  it('単位語つき・途中の記号つきの文も結果の句を真ん中に挟む', () => {
    expect(guardNumber('3万', { ...area, refusedBy: 'save' })?.message).toBe(
      '「3万」は単位付きのため読み取れません。直すまで保存できません。単位を付けず ㎡ の数値だけを入力してください。',
    );
    expect(guardNumber('1,0,0', { ...money, refusedBy: 'judgement' })?.message).toBe(
      '「1,0,0」は数字の間に単位や区切りが入っているため読み取れません。直すまで、この欄を使う判定は出していません。3 桁区切り以外の記号を外し、円 の数値だけを入力してください。',
    );
    expect(guardNumber('3万', area)?.outcome).toBe('computedAsZero');
    expect(guardNumber('1,0,0', money)?.outcome).toBe('computedAsZero');
  });
});

describe('guardNumber — 範囲の断り', () => {
  it('断らない欄の範囲の断りは結果を述べない (扱いは読む側ごとに違う)', () => {
    expect(guardNumber('-1', money)).toEqual({ level: 'fatal', label: '金額', message: 'マイナスの値（-1）は指定できません。', outcome: null });
    expect(guardNumber('0', area)).toEqual({ level: 'fatal', label: '床面積', message: '0 ㎡ では計算できません。', outcome: null });
    expect(guardNumber('0.5', years1)?.message).toBe('1 年 以上で入力してください（現在 0.5）。');
    expect(guardNumber('101', years1)?.outcome).toBeNull();
  });

  it('★ 断る表の欄の範囲の断りは「直すまで」の句を足し、断ると述べる', () => {
    const neg = guardNumber('-1', { ...money, refusedBy: 'judgement' });
    expect(neg).toEqual({
      level: 'fatal',
      label: '金額',
      message: 'マイナスの値（-1）は指定できません。直すまで、この欄を使う判定は出していません。',
      outcome: 'refused',
    });
    expect(guardNumber('0', { ...area, refusedBy: 'save' })?.message).toBe('0 ㎡ では計算できません。直すまで保存できません。');
    expect(guardNumber('0.5', { ...years1, refusedBy: 'judgement' })?.message).toBe(
      '1 年 以上で入力してください（現在 0.5）。直すまで、この欄を使う判定は出していません。',
    );
    expect(guardNumber('101', { ...years1, refusedBy: 'save' })?.message).toBe('100 年 以下で入力してください（現在 101）。直すまで保存できません。');
  });

  it('整数の問いと桁の問いは (断る表でも) 結果を述べない —— 保存も判定も断らない', () => {
    const tiers: NumSpec = { label: '段数', kind: 'tiers', refusedBy: 'save' };
    expect(guardNumber('2.5', tiers)).toEqual({ level: 'warn', label: '段数', message: '整数で入力してください（現在 2.5）。', outcome: null });
    const sane = guardNumber('20000000000000', { ...money, refusedBy: 'judgement' });
    expect(sane?.level).toBe('warn');
    expect(sane?.outcome).toBeNull();
    expect(sane?.message).not.toContain('直すまで');
  });
});

describe('refusingSpecs / refusedFields — 断る表', () => {
  const TABLE = refusingSpecs('judgement', {
    a: { label: '甲', kind: 'money' },
    b: { label: '乙 (㎡)', kind: 'area' },
    c: { label: '丙', kind: 'money', allowEmpty: true },
  } as const satisfies Record<string, NumSpec>);

  it('表の欄すべてに断る側を付け、他の宣言は変えない (元の表も書き換えない)', () => {
    const plain = { x: { label: 'X', kind: 'money', allowZero: false } } as const satisfies Record<string, NumSpec>;
    const wrapped = refusingSpecs('save', plain);
    expect(wrapped).toEqual({ x: { label: 'X', kind: 'money', allowZero: false, refusedBy: 'save' } });
    expect(plain).toEqual({ x: { label: 'X', kind: 'money', allowZero: false } });
    expect(Object.keys(TABLE)).toEqual(['a', 'b', 'c']);
    expect(Object.values(TABLE).every((s) => s.refusedBy === 'judgement')).toBe(true);
  });

  it('★ 断ると述べた欄だけを数える (⛔ と、0 を受け付けない欄の空欄)', () => {
    // 甲 = 読めない (⛔)・乙 = 空欄だが 0 を受け付けない (⚠️ で断る)・丙 = 空欄を許す
    expect(refusedFields(TABLE, { a: 'abc', b: '', c: '' })).toEqual(['a', 'b']);
    // 甲 = 空欄は 0 として計算 (断らない)・乙 = 正しい値・丙 = 負値 (⛔)
    expect(refusedFields(TABLE, { a: '', b: '10', c: '-1' })).toEqual(['c']);
    // 桁の問い (⚠️) は断らない
    expect(refusedFields(TABLE, { a: '20000000000000', b: '10', c: '' })).toEqual([]);
    // 並びは表の順 (値の順でも名前の順でもない)
    expect(refusedFields(TABLE, { c: '-1', b: '0', a: '-1' })).toEqual(['a', 'b', 'c']);
  });

  it('名指しは宣言のラベルから、その段が読む欄だけ', () => {
    expect(refusalLabels(TABLE, ['a', 'b'], ['b', 'c'])).toEqual(['乙 (㎡)']);
    expect(refusalLabels(TABLE, [], ['a', 'b', 'c'])).toEqual([]);
  });

  it('★ 断りの文は原因を言わず結果を言う (範囲外だけが原因ではない)', () => {
    expect(refusalNote([])).toBeNull();
    expect(refusalNote(['甲', '乙'])).toBe('甲・乙を直すまで、この判定は算定していません（欄の下の指摘どおりに直すと判定が出ます）。');
    expect(saveRefusalNote([])).toBeNull();
    expect(saveRefusalNote(['床面積 (m²)'])).toBe('床面積 (m²)を直すまで、保存していません（欄の下の指摘どおりに直すと保存できます）。');
    // 直す前の文面は「入力できる範囲の外」と原因を言い、読めない値と空欄について偽だった
    for (const note of [refusalNote(['甲']), saveRefusalNote(['甲'])]) {
      expect(note).not.toContain('範囲の外');
      expect(note).not.toContain('赤い欄');
    }
    // 標本: 針は直す前の文そのものに当たる (綴りが外れて空の検査になっていない)
    const BEFORE = '甲が入力できる範囲の外なので、この判定は算定していません（赤い欄を範囲内に直すと判定が出ます）。';
    expect(BEFORE).toContain('範囲の外');
    expect(BEFORE).toContain('赤い欄');
  });
});
