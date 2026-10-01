import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { escapeMarkdownInline } from '../escape';

// scripts/build-academic-md.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む。
// docs/ACADEMIC_KNOWLEDGE.md の概念表は 2026-09-05 まで手で追記していて、本体 (academicKnowledge.ts) と
// 942 行 / 909 項目ずれていた。表は本体から生成し、vault:check が同期を検証する。ここはその生成器と
// 検査の対照 —— 「ずれたら鳴る」を標本で留める。
const req = createRequire(import.meta.url);
type Entry = { id: string; discipline: string; title: string; keyFigures?: string };
const gen = req('../../../scripts/build-academic-md.cjs') as {
  BEGIN: string;
  END: string;
  HEADER: string;
  MAX_FIGURES: number;
  DISCIPLINE_LABELS: Record<string, string>;
  splitKeyFigures: (keyFigures: unknown) => string[];
  cell: (value: unknown) => string;
  renderRow: (entry: Entry) => string;
  renderTable: (entries: Entry[]) => string;
  applyTable: (doc: string, table: string) => string;
  staleReason: (doc: string, table: string) => string | null;
};

const econ: Entry = { id: 'econ-x', discipline: 'economics', title: 'X理論——要約', keyFigures: 'A（1977 甲／1984 乙）／B／C／D' };
const law: Entry = { id: 'bizlaw-y', discipline: 'business-law', title: 'Y | 縦棒', keyFigures: 'E' };
const RULE = '| --- | --- | --- |';

describe('splitKeyFigures — keyFigures を（…）を壊さずに ／ で分ける', () => {
  it('（…）の内側の ／ は区切りではない', () => {
    expect(gen.splitKeyFigures('A（1977 甲／1984 乙）／B／C／D')).toEqual(['A（1977 甲／1984 乙）', 'B', 'C', 'D']);
  });
  it('★ 対照: 素朴な split なら 5 分割になる (この関数が要る理由)', () => {
    expect('A（1977 甲／1984 乙）／B／C／D'.split('／')).toHaveLength(5);
  });
  it('半角括弧の内側も同じ扱い', () => {
    expect(gen.splitKeyFigures('A (x／y)／B')).toEqual(['A (x／y)', 'B']);
  });
  it('空・null は空配列', () => {
    expect(gen.splitKeyFigures('')).toEqual([]);
    expect(gen.splitKeyFigures(null)).toEqual([]);
  });
});

describe('cell — 共有実装 escapeMarkdownInline の写し (CJS からは読めない) がずれていない', () => {
  it.each([
    ['バックスラッシュ', 'a\\b'],
    ['縦棒', 'Y | 縦棒'],
    ['CR / LF / CRLF', 'a\nb\rc\r\nd'],
    ['山括弧 (生 HTML の入口)', '<script>x</script> と r>g'],
    ['全部入り', '\\ | <\n>'],
  ])('%s: 同じ標本で同じ結果', (_name, sample) => {
    expect(gen.cell(sample)).toBe(escapeMarkdownInline(sample));
  });
  it('★ 対照: 素の文字列とは違う (置換が実際に走っている)', () => {
    expect(gen.cell('\\ | <\n')).not.toBe('\\ | <\n');
    expect(gen.cell('\\ | <\n')).toBe('\\\\ \\| &lt; ');
  });
});

describe('renderRow — 1 項目 = 1 行', () => {
  it.each([
    ['economics', '経済学'],
    ['management', '経営学'],
    ['human-science', '人間科学'],
    ['business-law', 'ビジネス法務'],
    ['information-sociology', '情報社会学'],
  ])('discipline %s は「%s」(採録の原則 4 と同じ 1 通り)', (discipline, label) => {
    expect(gen.renderRow({ id: 'z', discipline, title: 'T', keyFigures: 'K' })).toBe(`| ${label} | T | K |`);
    expect(gen.DISCIPLINE_LABELS[discipline]).toBe(label);
  });
  it('提唱者・初出は先頭 MAX_FIGURES 件まで', () => {
    expect(gen.MAX_FIGURES).toBe(3);
    expect(gen.renderRow(econ)).toBe('| 経済学 | X理論——要約 | A（1977 甲／1984 乙） ／ B ／ C |');
  });
  it("題名の '|' はエスケープされ、表を壊さない", () => {
    expect(gen.renderRow(law)).toBe('| ビジネス法務 | Y \\| 縦棒 | E |');
  });
  it('未知の discipline と空の題名は例外 (黙って別ラベルを作らない)', () => {
    expect(() => gen.renderRow({ id: 'z', discipline: 'zoology', title: 'Z' })).toThrow(/zoology/);
    expect(() => gen.renderRow({ id: 'z', discipline: 'economics', title: '' })).toThrow(/title/);
  });
});

describe('renderTable — マーカーで囲んだ表', () => {
  it('BEGIN / ヘッダ / 罫線 / 各行 / END の順', () => {
    const lines = gen.renderTable([econ, law]).split('\n');
    expect(lines[0]).toBe(gen.BEGIN);
    expect(lines[1]).toBe(gen.HEADER);
    expect(lines[2]).toBe(RULE);
    expect(lines[3]).toBe(gen.renderRow(econ));
    expect(lines[4]).toBe(gen.renderRow(law));
    expect(lines[5]).toBe(gen.END);
    expect(lines).toHaveLength(6);
  });
});

describe('applyTable — 文書の表だけを差し替える', () => {
  const table = gen.renderTable([econ, law]);
  const legacy = ['# 見出し', '', gen.HEADER, RULE, '| 経済学 | 古い行 | 誰か |', '', '| 経営学 | 空行の後の古い行 | 誰か |', '', '脚注'].join('\n');
  it('マーカーの無い旧表はヘッダから最後の表行まで (途中の空行ごと) 置き換え、前後の手書きは残す', () => {
    expect(gen.applyTable(legacy, table)).toBe(['# 見出し', '', table, '', '脚注'].join('\n'));
  });
  it('マーカー付きの文書に再適用しても同じ (冪等)', () => {
    const once = gen.applyTable(legacy, table);
    expect(gen.applyTable(once, table)).toBe(once);
  });
  it('マーカー付きの表を別の表に差し替えられる', () => {
    const once = gen.applyTable(legacy, table);
    const smaller = gen.renderTable([econ]);
    expect(gen.applyTable(once, smaller)).toBe(['# 見出し', '', smaller, '', '脚注'].join('\n'));
  });
  it('旧表の途中に表でも空行でもない行があれば書き込まない (何を消すか分からない)', () => {
    const odd = ['# 見出し', gen.HEADER, RULE, '| 経済学 | 行 | 誰か |', '表でない文', '| 経営学 | 行 | 誰か |'].join('\n');
    expect(() => gen.applyTable(odd, table)).toThrow(/表でも空行でもない/);
  });
  it('表もマーカーも無い文書には書き込まない', () => {
    expect(() => gen.applyTable('# 表の無い文書', table)).toThrow(/表が見つかりません/);
  });
  it('開始マーカーだけで終端が無い文書は例外', () => {
    expect(() => gen.applyTable(`x\n${gen.BEGIN}\n| a |\n`, table)).toThrow(/終端マーカー/);
  });
});

describe('staleReason — 表が本体とずれたら鳴る (vault:check の中身)', () => {
  const table = gen.renderTable([econ, law]);
  const fresh = gen.applyTable(['# 見出し', gen.HEADER, RULE, '| 経済学 | 古い行 | 誰か |', '', '脚注'].join('\n'), table);
  it('再生成直後は null', () => {
    expect(gen.staleReason(fresh, table)).toBeNull();
  });
  it('★ 1 行の 1 文字が違えば鳴り、直し方 (npm run knowledge:md) を言う', () => {
    const tampered = fresh.replace('X理論——要約', 'X理論——改竄');
    expect(tampered).not.toBe(fresh);
    expect(gen.staleReason(tampered, table)).toMatch(/npm run knowledge:md/);
  });
  it('★ 本体に項目が増えた (表に行が足りない) ときも鳴る', () => {
    const grown = gen.renderTable([econ, law, { id: 'mgmt-z', discipline: 'management', title: 'Z', keyFigures: 'F' }]);
    const reason = gen.staleReason(fresh, grown);
    expect(reason).toMatch(/committed 3 行 \/ 再生成 4 行/);
    expect(reason).toMatch(/本体側 "\| 経営学 \| Z \| F \|"/);
  });
  it('★ 本体から項目が消えた (表に行が余る) ときも鳴る', () => {
    const reason = gen.staleReason(fresh, gen.renderTable([econ]));
    expect(reason).toMatch(/committed 3 行 \/ 再生成 2 行/);
    expect(reason).toMatch(/表側 "\| ビジネス法務 \| Y/);
  });
  it('★ マーカーの無い (未生成の) 文書は鳴る', () => {
    expect(gen.staleReason('# 表の無い文書', table)).toMatch(/マーカー付きの表がありません/);
  });
});
