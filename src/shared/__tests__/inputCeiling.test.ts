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
import {
  charsOverCeiling,
  clampToCeiling,
  clampedCeilingNote,
  countChars,
  refusedCeilingNote,
} from '../inputCeiling';

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
    expect(refusedCeilingNote('本文', 'x'.repeat(2001), 2000)).toContain('送りません');
  });

  it('ラベルを写さず引数から出す (画面ごとに違う名前を付けられる)', () => {
    expect(clampedCeilingNote('気分のメモ', 1, 5)).toContain('気分のメモ');
    expect(clampedCeilingNote('業務メモ', 1, 5)).toContain('業務メモ');
  });
});

describe('refusedCeilingNote — 送らなかったとき', () => {
  it('★ 今の字数と超過分の両方を述べる (どれだけ削れば送れるかが読める)', () => {
    const note = refusedCeilingNote('分析するテキスト', 'x'.repeat(7300), 5000);
    expect(note).toContain('5000');
    expect(note).toContain('7300');
    expect(note).toContain('2300');
    expect(note).toContain('送りません');
    expect(note).toContain('短くして');
  });

  it('★ 「入っていません」とは言わない (切ったのではなく、送っていない)', () => {
    const note = refusedCeilingNote('本文', 'x'.repeat(6000), 5000);
    expect(note).not.toContain('入っていません');
    // 対照: 切った側の文はそう言う。
    expect(clampedCeilingNote('メモ', 1, 5)).toContain('入っていません');
  });

  it('超えていない長さで呼んでも超過分を負にしない', () => {
    expect(refusedCeilingNote('本文', 'x'.repeat(10), 5000)).toContain('0 字超えています');
  });
});

describe('2 つの文は互いに別物', () => {
  it('同じ引数でも別の文になる (片方に畳まれていない)', () => {
    expect(clampedCeilingNote('x', 5, 100)).not.toBe(refusedCeilingNote('x', 'y'.repeat(105), 100));
  });

  it('どちらも終止形で終わる (帯に並べて読める)', () => {
    for (const n of [clampedCeilingNote('x', 1, 10), refusedCeilingNote('x', 'y'.repeat(11), 10)]) {
      expect(n.endsWith('。'), n).toBe(true);
    }
  });
});

/*
 * **「1 字」の単位** (2026-09-13 · パス 195)
 *
 * 2026-09-13 まで、数える・切る・突き合わせるのはすべて `String.length`
 * (UTF-16 コード単位) だった。画面は「N 字まで」と刷るので、BMP の外の文字
 * (絵文字・JIS 2004 の漢字) を含む入力で 2 つの害が同時に出ていた ——
 * 下の ★ が実測した形をそのまま持つ。
 */
/*
 * **孤立サロゲートを自分で判定する。**
 *
 * `String.prototype.isWellFormed()` (ES2024) はこの tsconfig の `lib` に無く、
 * 出荷先のブラウザにも在るとは限らない。**「割れていない」の意味をここで書く** ——
 * 上位半分 (U+D800–U+DBFF) の直後は必ず下位半分 (U+DC00–U+DFFF)、
 * 下位半分が単独で現れてはいけない。
 */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i++; // 対で消費する
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true; // 下位半分が単独で来た
    }
  }
  return false;
}

describe('hasLoneSurrogate — 判定そのものが効いている (この検査の道具を先に留める)', () => {
  it('対になっていれば false / 割れていれば true', () => {
    expect(hasLoneSurrogate('abc')).toBe(false);
    expect(hasLoneSurrogate('😀')).toBe(false);
    expect(hasLoneSurrogate('あ😀い')).toBe(false);
    expect(hasLoneSurrogate('😀'[0]!)).toBe(true); // 上位半分だけ
    expect(hasLoneSurrogate('😀'[1]!)).toBe(true); // 下位半分だけ
    expect(hasLoneSurrogate('a' + '😀'[0]!)).toBe(true);
    expect(hasLoneSurrogate('😀'[1]! + 'a')).toBe(true);
  });
});

describe('countChars — 数える単位は文字 (コードポイント)', () => {
  it('ASCII と BMP は長さと同じ', () => {
    expect(countChars('')).toBe(0);
    expect(countChars('abc')).toBe(3);
    expect(countChars('売上記録')).toBe(4); // CJK は BMP = 1 コード単位
  });

  it('★ BMP の外の文字は 1 文字として数える (length は 2 と数える)', () => {
    expect('😀'.length).toBe(2); // 実行環境の事実 (この差が欠陥の素)
    expect(countChars('😀')).toBe(1);
    expect('𠮟'.length).toBe(2); // JIS 2004 の漢字 (叱の異体字)
    expect(countChars('𠮟る')).toBe(2);
    expect(countChars('a' + '😀'.repeat(1000))).toBe(1001);
  });

  it('結合文字は多く数える (安全側 — 天井を越えさせない)', () => {
    // 「か」+ 濁点 は人には 1 字だが 2 コードポイント。多く数える側は害にならない
    // (`Intl.Segmenter` は環境差があり、天井は環境で変わってはいけない)。
    expect(countChars('か\u3099')).toBe(2);
  });
});

describe('clampToCeiling — 切るのは文字境界', () => {
  it('天井までなら何も落とさない', () => {
    expect(clampToCeiling('abc', 3)).toBe('abc');
    expect(clampToCeiling('abc', 10)).toBe('abc');
  });

  it('超えた分だけを落とす', () => {
    expect(clampToCeiling('abcde', 3)).toBe('abc');
    expect(countChars(clampToCeiling('あ'.repeat(50), 20))).toBe(20);
  });

  it('★ サロゲート対を割らない (孤立サロゲートを残さない)', () => {
    const raw = 'a' + '😀'.repeat(1000); // 2001 コード単位 / 1001 文字
    const cut = clampToCeiling(raw, 1000);
    expect(countChars(cut)).toBe(1000);
    expect(hasLoneSurrogate(cut)).toBe(false);
    // 対照 —— コード単位で切ると壊れる (これが直す前の振る舞い)。
    expect(hasLoneSurrogate(raw.slice(0, 2000))).toBe(true);
  });

  it('★ 切った結果は UTF-8 を往復しても変わらない (送った物と届く物が同じ)', () => {
    const raw = 'a' + '😀'.repeat(1000);
    const cut = clampToCeiling(raw, 1000);
    const roundTrip = new TextDecoder().decode(new TextEncoder().encode(cut));
    expect(roundTrip).toBe(cut);
    // 対照 —— コード単位で切った物は末尾が U+FFFD に化ける。
    const broken = raw.slice(0, 2000);
    expect(new TextDecoder().decode(new TextEncoder().encode(broken))).not.toBe(broken);
  });

  it('天井 0 以下は空文字 (投げない —— 入力中の画面を落とさない)', () => {
    expect(clampToCeiling('abc', 0)).toBe('');
    expect(clampToCeiling('abc', -1)).toBe('');
  });
});

describe('★ 述べる数と、守る数と、切る位置が同じ単位である', () => {
  const MAX = 2000;

  it('★ 実測した形: 絵文字 1000 個 + 1 字は天井の中なので、断りが出ない', () => {
    const raw = 'a' + '😀'.repeat(1000); // 1001 文字 (2001 コード単位)
    expect(charsOverCeiling(raw, MAX)).toBe(0);
    // 対照 —— コード単位で数えると「1 字超えた」と言っていた (実際は 999 字下回る)。
    expect(Math.max(0, raw.length - MAX)).toBe(1);
  });

  it('★ 天井をちょうど超えたときだけ、超えた字数を文字で述べる', () => {
    const over1 = '😀'.repeat(MAX + 1);
    expect(charsOverCeiling(over1, MAX)).toBe(1);
    expect(refusedCeilingNote('メモ', over1, MAX)).toContain(`いま ${MAX + 1} 字あり、1 字超えています`);
  });

  it('★ 断りが述べた字数まで切れば、必ず天井の中に入る (文が自己矛盾しない)', () => {
    for (const raw of ['😀'.repeat(3000), 'あ'.repeat(3000), 'a'.repeat(3000), '𠮟'.repeat(3000)]) {
      const cut = clampToCeiling(raw, MAX);
      expect(countChars(cut), raw.slice(0, 2)).toBe(MAX);
      expect(charsOverCeiling(cut, MAX)).toBe(0);
      expect(hasLoneSurrogate(cut)).toBe(false);
    }
  });
});
