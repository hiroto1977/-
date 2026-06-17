import { describe, it, expect } from 'vitest';
import { parseInline, parseMarkdown, type Block } from '../assistantMarkdown';

describe('parseInline', () => {
  it('parses bold and inline code', () => {
    expect(parseInline('a **b** `c` d')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', code: true },
      { text: ' d' },
    ]);
  });

  it('returns a single plain token when there is no markup', () => {
    expect(parseInline('plain')).toEqual([{ text: 'plain' }]);
  });
});

describe('parseMarkdown', () => {
  it('parses headings', () => {
    const blocks = parseMarkdown('## 見出し');
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 });
  });

  it('parses a GFM table', () => {
    const md = ['| 項目 | 金額 |', '| --- | --- |', '| 売上 | 100 |', '| 費用 | 40 |'].join('\n');
    const blocks = parseMarkdown(md);
    const table = blocks.find((b): b is Extract<Block, { type: 'table' }> => b.type === 'table');
    expect(table).toBeDefined();
    expect(table!.headers.length).toBe(2);
    expect(table!.rows.length).toBe(2);
    expect(table!.rows[0]![0]![0]!.text).toBe('売上');
  });

  it('parses unordered and ordered lists', () => {
    const ul = parseMarkdown('- a\n- b');
    expect(ul[0]).toMatchObject({ type: 'list', ordered: false });
    expect((ul[0] as Extract<Block, { type: 'list' }>).items.length).toBe(2);

    const ol = parseMarkdown('1. first\n2. second');
    expect(ol[0]).toMatchObject({ type: 'list', ordered: true });
  });

  it('parses fenced code blocks verbatim', () => {
    const md = '```\nconst x = 1;\n```';
    const blocks = parseMarkdown(md);
    expect(blocks[0]).toEqual({ type: 'code', text: 'const x = 1;' });
  });

  it('groups consecutive text lines into a paragraph and splits on blank lines', () => {
    const blocks = parseMarkdown('line1\nline2\n\nline3');
    const paragraphs = blocks.filter((b) => b.type === 'paragraph');
    expect(paragraphs.length).toBe(2);
  });

  it('keeps bold inside table cells', () => {
    const md = ['| a | b |', '| --- | --- |', '| **x** | y |'].join('\n');
    const table = parseMarkdown(md).find(
      (b): b is Extract<Block, { type: 'table' }> => b.type === 'table',
    )!;
    expect(table.rows[0]![0]![0]).toEqual({ text: 'x', bold: true });
  });
});
