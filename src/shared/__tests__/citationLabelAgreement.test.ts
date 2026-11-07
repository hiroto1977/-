import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * `lint:citations` の「1 DOI = 1 著作」ラベル照合 (2026-09-05)。
 *
 * ゲートは年の矛盾しか見ていなかったので、**同じ年の別著作**に同じ DOI が付いていると
 * 黙った。実測 (統合パス 54 直後): 多重引用 135 件のうち 4 件がそれ —— Peteraf 1993 に
 * Levinthal & March 1993 の SMJ DOI、Weick et al. 2005 に Hackman & Wageman 2005 の AMR DOI、
 * Nardi 2010 の書籍に Gillespie 2010 の New Media & Society DOI、同じ Handbook の別章 2 件。
 *
 * 規則: 同じ DOI を引くラベルは著者姓を 1 つ以上、またはタイトル語を 2 つ以上共有する。
 * ここでは**鳴る標本**と**通る対照** (引用様式の違い) を両方留める —— 不在を主張する検査には
 * 標本を添える。
 */
const req = createRequire(import.meta.url);
const { labelTokens, labelSurnames, labelsAgree, findLabelConflicts } = req('../../../scripts/lint-citations.cjs') as {
  labelTokens: (label: string) => Set<string>;
  labelSurnames: (label: string) => Set<string>;
  labelsAgree: (a: string, b: string) => boolean;
  findLabelConflicts: (uses: Map<string, { id: string; label: string }[]>) => { doi: string; a: { id: string }; b: { id: string } }[];
};

const PETERAF = 'Peteraf, M. A. (1993) The Cornerstones of Competitive Advantage: A Resource-Based View — Strategic Management Journal 14(3)';
const LEVINTHAL = 'Levinthal, D. A. & March, J. G. (1993) The Myopia of Learning — Strategic Management Journal 14(S2)';

describe('labelTokens / labelSurnames', () => {
  it('照合語は小文字・3 文字以上で、数字と誌名・出版社・一般語は除く', () => {
    const t = labelTokens(PETERAF);
    expect(t.has('peteraf')).toBe(true);
    expect(t.has('cornerstones')).toBe(true);
    expect(t.has('1993')).toBe(false);
    expect(t.has('journal')).toBe(false);
    expect(t.has('management')).toBe(false);
  });

  it('姓は最初の年の手前の大文字始まりの語', () => {
    expect([...labelSurnames(LEVINTHAL)]).toEqual(['levinthal', 'march']);
    expect([...labelSurnames('Robert J. Barro, "Are Government Bonds Net Wealth?" JPE 82(6), 1974')]).toContain('barro');
  });

  it('誌名で始まるラベルの姓は空 (停止語)', () => {
    expect(labelSurnames('Journal of Political Economy (1977) — Rules Rather Than Discretion').size).toBe(0);
  });
});

describe('labelsAgree — 同じ DOI のラベル同士が同じ著作を指しているか', () => {
  it('★ 標本: 同年の別著作は別著作と判定する', () => {
    expect(labelsAgree(PETERAF, LEVINTHAL)).toBe(false);
    expect(
      labelsAgree(
        'Nardi, B. (2010) My Life as a Night Elf Priest — University of Michigan Press',
        'Gillespie, T. (2010) The Politics of "Platforms" — New Media & Society 12(3)',
      ),
    ).toBe(false);
    expect(
      labelsAgree(
        'Weick, Sutcliffe & Obstfeld, "Organizing and the Process of Sensemaking," AMR 30(4), 2005',
        'Hackman, J. R. & Wageman, R. (2005) A Theory of Team Coaching, Academy of Management Review 30(2): 269-287',
      ),
    ).toBe(false);
  });

  it('対照: 引用様式の違い (名・姓の順、イニシャル、誌名先頭、出版社先頭) は同じ著作と判定する', () => {
    expect(labelsAgree('Robert J. Barro, "Are Government Bonds Net Wealth?" JPE 82(6), 1974', 'Barro, R.J. (1974) Are Government Bonds Net Wealth? — JPE')).toBe(true);
    expect(
      labelsAgree(
        'Journal of Political Economy (1977) — Rules Rather Than Discretion: The Inconsistency of Optimal Plans',
        'Kydland, F. E. & Prescott, E. C. (1977) Rules Rather Than Discretion — JPE 85(3)',
      ),
    ).toBe(true);
    expect(labelsAgree('Ziad Obermeyer, Brian Powers (2019) Dissecting racial bias — Science', 'Obermeyer et al. (2019) Dissecting Racial Bias in an Algorithm — Science')).toBe(true);
    expect(labelsAgree('SAGE Journals — Cheney-Lippold (2011), Theory, Culture & Society', 'Cheney-Lippold, J. (2011) A New Algorithmic Identity — TCS')).toBe(true);
  });

  it('対照: ラテン文字の無いラベルは判定しない (同じ著作扱い)', () => {
    expect(labelsAgree('野中郁次郎（1994）組織的知識創造の動態理論', 'Nonaka, I. (1994) A Dynamic Theory — Organization Science')).toBe(true);
  });

  it('★ 誌名だけ共有しても同じ著作にはならない (停止語が効いている対照)', () => {
    expect(labelsAgree('Alpha, A. (1993) Cornerstones — Strategic Management Journal', 'Beta, B. (1993) Myopia — Strategic Management Journal')).toBe(false);
  });
});

describe('findLabelConflicts', () => {
  it('DOI ごとに最初の不一致ペアを 1 件返し、一致する DOI と単独引用は黙る', () => {
    const uses = new Map([
      ['10.1/agree', [{ id: 'x', label: PETERAF }, { id: 'y', label: 'Peteraf (1993) Cornerstones of Competitive Advantage' }]],
      ['10.1/conflict', [{ id: 'p', label: PETERAF }, { id: 'q', label: LEVINTHAL }]],
      ['10.1/single', [{ id: 'z', label: PETERAF }]],
    ]);
    const out = findLabelConflicts(uses);
    expect(out.map((c) => c.doi)).toEqual(['10.1/conflict']);
    expect(out[0]!.a.id).toBe('p');
    expect(out[0]!.b.id).toBe('q');
  });

  it('対照: 何も渡さなければ空', () => {
    expect(findLabelConflicts(new Map())).toEqual([]);
  });
});
