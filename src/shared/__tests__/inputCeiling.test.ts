/**
 * **天井を超えた入力について述べる 1 文** (2026-09-12 · パス 168)。
 *
 * パス 167 は業務メモで「黙って落とす」を直したが、文面を JSX の中に直接書いた。
 * 同じ形の欄は他にも在り (気分のメモ・分析するテキスト)、そのままだと文面が
 * 画面の数だけ増える。ここは**寄せた 1 か所**を留める。
 *
 * 2 つの文を分けるのは、**利用者に起きたことが違う**から ——
 * 切ったのか (保存する短い欄)、送らなかったのか (AI へ渡す本文)。
 */
import { describe, expect, it } from 'vitest';
import { charsOverCeiling, clampedCeilingNote, refusedCeilingNote } from '../inputCeiling';

describe('charsOverCeiling', () => {
  it('超えていなければ 0 (境界ちょうども 0)', () => {
    expect(charsOverCeiling('', 10)).toBe(0);
    expect(charsOverCeiling('abc', 10)).toBe(0);
    expect(charsOverCeiling('a'.repeat(10), 10)).toBe(0);
  });

  it('超えた分だけを返す', () => {
    expect(charsOverCeiling('a'.repeat(11), 10)).toBe(1);
    expect(charsOverCeiling('a'.repeat(5000), 2000)).toBe(3000);
  });

  it('★ 前後の空白を落として数えない (画面の字数と違う数を言わないため)', () => {
    // `trim()` してから数えると 0 になるが、欄には 12 文字入っている。
    expect(charsOverCeiling('  ' + 'a'.repeat(10) + '  ', 10)).toBe(4);
  });

  it('負の天井でも負を返さない (呼び違えても壊れた文を作らない)', () => {
    expect(charsOverCeiling('abc', -5)).toBeGreaterThanOrEqual(0);
  });
});

describe('clampedCeilingNote — 切ったとき', () => {
  it('★ 天井・超過分・次の手を述べる', () => {
    const note = clampedCeilingNote('メモ', 412, 2000);
    expect(note).toContain('メモ');
    expect(note).toContain('2000');
    expect(note).toContain('412');
    expect(note).toContain('入っていません');
    expect(note).toContain('短くして');
  });

  it('★ 「送らない」とは言わない (実際には天井までは入っている)', () => {
    const note = clampedCeilingNote('メモ', 1, 2000);
    expect(note).not.toContain('送りません');
    // 対照: 送らない側の文はそう言う (規則が空振りしていない)。
    expect(refusedCeilingNote('本文', 2001, 2000)).toContain('送りません');
  });

  it('ラベルを写さず引数から出す (画面ごとに違う名前を付けられる)', () => {
    expect(clampedCeilingNote('気分のメモ', 1, 5)).toContain('気分のメモ');
    expect(clampedCeilingNote('業務メモ', 1, 5)).toContain('業務メモ');
  });
});

describe('refusedCeilingNote — 送らなかったとき', () => {
  it('★ 今の字数と超過分の両方を述べる (どれだけ削れば送れるかが読める)', () => {
    const note = refusedCeilingNote('分析するテキスト', 7300, 5000);
    expect(note).toContain('5000');
    expect(note).toContain('7300');
    expect(note).toContain('2300');
    expect(note).toContain('送りません');
    expect(note).toContain('短くして');
  });

  it('★ 「入っていません」とは言わない (切ったのではなく、送っていない)', () => {
    const note = refusedCeilingNote('本文', 6000, 5000);
    expect(note).not.toContain('入っていません');
    // 対照: 切った側の文はそう言う。
    expect(clampedCeilingNote('メモ', 1, 5)).toContain('入っていません');
  });

  it('超えていない長さで呼んでも超過分を負にしない', () => {
    expect(refusedCeilingNote('本文', 10, 5000)).toContain('0 字超えています');
  });
});

describe('2 つの文は互いに別物', () => {
  it('同じ引数でも別の文になる (片方に畳まれていない)', () => {
    expect(clampedCeilingNote('x', 5, 100)).not.toBe(refusedCeilingNote('x', 105, 100));
  });

  it('どちらも終止形で終わる (帯に並べて読める)', () => {
    for (const n of [clampedCeilingNote('x', 1, 10), refusedCeilingNote('x', 11, 10)]) {
      expect(n.endsWith('。'), n).toBe(true);
    }
  });
});
