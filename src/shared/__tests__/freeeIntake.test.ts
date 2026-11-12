/**
 * **落とした取引の文面** (2026-09-12 · パス 153)。
 *
 * 3 面 (freee の画面 / 銀行提出用書面 §6 / 資金繰り表の取り込み注記) が
 * 同じ事実を述べることを、同じ入力に対して確かめる。
 */
import { describe, expect, it } from 'vitest';
import {
  NO_DEAL_INTAKE,
  dealIntakeDropped,
  dealIntakeImportNote,
  dealIntakeNote,
  dealIntakeSheetNote,
  type FreeeDealIntake,
} from '../freeeIntake';

const NOTES = [dealIntakeNote, dealIntakeSheetNote, dealIntakeImportNote] as const;

function intake(over: Partial<FreeeDealIntake>): FreeeDealIntake {
  return { ...NO_DEAL_INTAKE, ...over };
}

describe('dealIntakeDropped', () => {
  it('3 つの欄を足す', () => {
    expect(dealIntakeDropped(intake({ deals: 9, skippedNoDate: 2, skippedBadAmount: 3, clampedNegative: 4 }))).toBe(9);
  });

  it('1 件も落ちていなければ 0', () => {
    expect(dealIntakeDropped(intake({ deals: 12 }))).toBe(0);
  });

  it('★ 欄を 1 つでも落とすと合計が合わない (この検査が何を留めているか)', () => {
    // 対照: 3 欄のうち 1 つを足し忘れた写しは、同じ入力で別の答えを出す。
    const twoOfThree = (i: FreeeDealIntake): number => i.skippedNoDate + i.clampedNegative;
    const i = intake({ deals: 5, skippedNoDate: 1, skippedBadAmount: 2, clampedNegative: 1 });
    expect(twoOfThree(i)).toBe(2);
    expect(dealIntakeDropped(i)).toBe(4);
  });
});

describe('3 面の文面: 落ちていなければ何も言わない', () => {
  it.each(NOTES.map((fn, i) => [i, fn] as const))('注記 %i は 0 件で null', (_i, fn) => {
    expect(fn(NO_DEAL_INTAKE)).toBeNull();
    expect(fn(intake({ deals: 40 }))).toBeNull();
  });
});

describe('3 面の文面: 落ちた欄だけを述べる', () => {
  const only = intake({ deals: 40, skippedNoDate: 3 });

  it('画面: 件数と影響を言う', () => {
    const note = dealIntakeNote(only);
    expect(note).toContain('取引 40 件');
    expect(note).toContain('取引日が読めない 3 件は集計から外しました。');
    expect(note).toContain('その分だけ実際と異なります');
    // **0 件の欄は句にしない。** 「0 件は金額が負のため」は出ない。
    expect(note).not.toContain('金額が負');
    expect(note).not.toContain('数として読めない');
  });

  it('書面: 何を除き何をどう数えたかを言い切る', () => {
    expect(dealIntakeSheetNote(only)).toBe(
      '上記の営業キャッシュフローは、会計連携で取得した取引 40 件から組んだものです。'
      + '取引日が読めない 3 件は集計から除いています。',
    );
  });

  it('取り込み注記: 確かめる先まで書く', () => {
    const note = dealIntakeImportNote(only);
    expect(note).toContain('取引日が読めない 3 件は集計から外れている。');
    expect(note).toContain('元帳と突き合わせること');
  });

  /**
   * **並び方で文法が壊れないこと。** 最初は句 (連用形) を並べて末尾に「た集計です」を
   * 足す形で書き、`除き` + `た` → **「除きた集計です」**という文を刷っていた。
   * 3 欄のどれが立つかは入力で変わるので、全 7 通り (空を除く) を読む。
   */
  it('★ 3 欄の全組み合わせで、文が終止形で終わる (「除きた」を作らない)', () => {
    const combos: readonly Partial<FreeeDealIntake>[] = [
      { skippedNoDate: 1 },
      { skippedBadAmount: 1 },
      { clampedNegative: 1 },
      { skippedNoDate: 1, skippedBadAmount: 1 },
      { skippedNoDate: 1, clampedNegative: 1 },
      { skippedBadAmount: 1, clampedNegative: 1 },
      { skippedNoDate: 1, skippedBadAmount: 1, clampedNegative: 1 },
    ];
    for (const over of combos) {
      for (const fn of NOTES) {
        const note = fn(intake({ deals: 9, ...over }));
        expect(note).not.toBeNull();
        // 文の終わりは「。」。連用形の句を末尾に置くと必ずここで落ちる。
        expect(note!.endsWith('。')).toBe(true);
        // 崩れた活用が 1 つでも出ていないこと (標本つき: 下で実際に当たることを見る)。
        for (const broken of ['除きた', '数えた集計', '外しました。ました', '外れ。']) {
          expect(note).not.toContain(broken);
        }
      }
    }
    // 走査が実物に当たる標本 —— 崩れた文を作れば規則は鳴る。
    expect('…3 件を除きた集計です。').toContain('除きた');
  });

  it('★ 標本: 「金額が負」だけのときは日付の句が出ない (走査が当たっている)', () => {
    // 不在の主張には標本を添える —— 規則が実際にその文面へ当たることを、
    // 同じテストの中で確かめる (CLAUDE.md の規約)。
    const negOnly = intake({ deals: 7, clampedNegative: 2 });
    expect(dealIntakeNote(negOnly)).toContain('金額が負の 2 件は 0 円として数えました。');
    expect(dealIntakeNote(negOnly)).not.toContain('取引日');
    // 逆向き: 日付だけのときは負の句が無い (上の it で確かめた文面と組になる)。
    expect(dealIntakeNote(only)).toContain('取引日');
  });

  it('金額が数として読めない欄も句になる (NaN を外した件数)', () => {
    const badOnly = intake({ deals: 4, skippedBadAmount: 4 });
    expect(dealIntakeNote(badOnly)).toContain('金額が数として読めない 4 件は集計から外しました。');
    expect(dealIntakeSheetNote(badOnly)).toContain('金額が数として読めない 4 件は集計から除いています。');
    expect(dealIntakeImportNote(badOnly)).toContain('金額が数として読めない 4 件は集計から外れている。');
  });
});

describe('3 面の文面: 3 つ落ちたら 3 つ並べる', () => {
  const all = intake({ deals: 100, skippedNoDate: 1, skippedBadAmount: 2, clampedNegative: 3 });

  it.each(NOTES.map((fn, i) => [i, fn] as const))('注記 %i は 3 つの件数を全部載せる', (_i, fn) => {
    const note = fn(all);
    expect(note).not.toBeNull();
    expect(note).toContain('100 件');
    expect(note).toContain('1 件');
    expect(note).toContain('2 件');
    expect(note).toContain('3 件');
  });

  it('句の順は 日付 → 金額が読めない → 負 (3 面で同じ)', () => {
    for (const fn of NOTES) {
      const note = fn(all)!;
      const d = note.indexOf('取引日');
      const b = note.indexOf('数として読めない');
      const n = note.indexOf('負');
      expect(d).toBeGreaterThan(-1);
      expect(b).toBeGreaterThan(d);
      expect(n).toBeGreaterThan(b);
    }
  });
});
