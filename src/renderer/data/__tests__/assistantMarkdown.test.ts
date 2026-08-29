import { describe, it, expect } from 'vitest';
import {
  BLOCKS_TRUNCATED_NOTICE,
  MAX_RENDER_BLOCKS,
  parseInline,
  parseMarkdown,
  type Block,
  type InlineToken,
} from '../assistantMarkdown';

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

/*
 * ここから下は 2026-08-24 の追加。
 *
 * このモジュールは **モデルの応答をそのまま構文解析する** —— 画面に出る表や
 * 箇条書きは全部ここを通る。ところが検査は「機能ごとに 1 例ずつ」の幸せな道
 * だけで、変異検査に掛けると **67.30%・生存 66** だった (2026-08-23 実測)。
 * 安全性は構造が担保している (HTML を作らず型付き AST を返す) が、
 * **数字の表が崩れて見える**のは業務の道具として実害がある。境界を固定する。
 */

const asTable = (b: Block[]): Extract<Block, { type: 'table' }> =>
  b.find((x): x is Extract<Block, { type: 'table' }> => x.type === 'table')!;
const asList = (b: Block[]): Extract<Block, { type: 'list' }> =>
  b.find((x): x is Extract<Block, { type: 'list' }> => x.type === 'list')!;
const texts = (t: InlineToken[]): string => t.map((x) => x.text).join('|');

describe('parseInline — 境界', () => {
  it('空文字は空のトークン 1 つになる (呼び出し側が undefined を踏まない)', () => {
    expect(parseInline('')).toEqual([{ text: '' }]);
  });

  it('記法が末尾で終わっても空トークンを足さない', () => {
    expect(parseInline('a **b**')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }]);
    expect(parseInline('**b**')).toEqual([{ text: 'b', bold: true }]);
  });

  it('記法のあとの残りは必ず残る', () => {
    expect(parseInline('**b** tail')).toEqual([{ text: 'b', bold: true }, { text: ' tail' }]);
  });

  it('太字と コード を取り違えない', () => {
    expect(parseInline('`c`')).toEqual([{ text: 'c', code: true }]);
    expect(parseInline('**b**')).toEqual([{ text: 'b', bold: true }]);
  });

  it('中身が空の記法は記法として扱わない', () => {
    expect(parseInline('****')).toEqual([{ text: '****' }]);
    expect(parseInline('``')).toEqual([{ text: '``' }]);
  });

  it('同じ行に複数あっても順に切り出す', () => {
    expect(texts(parseInline('**a** x `b` y **c**'))).toBe('a| x |b| y |c');
  });
});

describe('parseMarkdown — 見出し', () => {
  it('# は 1〜6 段まで', () => {
    for (let n = 1; n <= 6; n++) {
      const b = parseMarkdown('#'.repeat(n) + ' t');
      expect(b[0], `${n} 段`).toMatchObject({ type: 'heading', level: n });
    }
  });

  it('7 段は見出しにしない (段落へ落とす)', () => {
    expect(parseMarkdown('####### t')[0]!.type).toBe('paragraph');
  });

  it('# のあとに空白が無ければ見出しにしない', () => {
    expect(parseMarkdown('#見出し')[0]!.type).toBe('paragraph');
  });

  it('見出しの中の記法も解析する', () => {
    const h = parseMarkdown('## **強調**')[0] as Extract<Block, { type: 'heading' }>;
    expect(h.spans).toEqual([{ text: '強調', bold: true }]);
  });
});

describe('parseMarkdown — 段落', () => {
  it('連続行は空白 1 つで繋ぐ', () => {
    const p = parseMarkdown('a\nb')[0] as Extract<Block, { type: 'paragraph' }>;
    expect(p.spans).toEqual([{ text: 'a b' }]);
  });

  it('空行だけの入力では段落を作らない', () => {
    expect(parseMarkdown('\n\n\n')).toEqual([]);
    expect(parseMarkdown('')).toEqual([]);
  });

  it('CRLF でも LF と同じに読む', () => {
    expect(parseMarkdown('a\r\nb')).toEqual(parseMarkdown('a\nb'));
    expect(parseMarkdown('# t\r\n')).toEqual(parseMarkdown('# t\n'));
  });

  it('行頭行末の空白は落として繋ぐ', () => {
    const p = parseMarkdown('  a  \n  b  ')[0] as Extract<Block, { type: 'paragraph' }>;
    expect(p.spans).toEqual([{ text: 'a b' }]);
  });
});

describe('parseMarkdown — 表', () => {
  const md = (...l: string[]): string => l.join('\n');

  it('区切り行が無ければ表にしない (縦棒を含むだけの段落)', () => {
    expect(parseMarkdown('a | b')[0]!.type).toBe('paragraph');
  });

  it('最終行が縦棒でも、次の行が無ければ表にしない', () => {
    expect(parseMarkdown('| a | b |')[0]!.type).toBe('paragraph');
  });

  it('区切り行は揃え記法も受ける', () => {
    for (const sep of ['| --- | --- |', '| :-- | --: |', '| :-: | - |']) {
      const t = asTable(parseMarkdown(md('| a | b |', sep, '| 1 | 2 |')));
      expect(t, sep).toBeDefined();
      expect(t.rows.length, sep).toBe(1);
    }
  });

  it('区切りに見えない行は区切りにしない', () => {
    for (const sep of ['| --- | x |', '| abc |', '| :: | :: |']) {
      expect(parseMarkdown(md('| a | b |', sep, '| 1 | 2 |'))[0]!.type, sep).toBe('paragraph');
    }
  });

  it('前後の縦棒が無い行も読む', () => {
    const t = asTable(parseMarkdown(md('a | b', '--- | ---', '1 | 2')));
    expect(t.headers.length).toBe(2);
    expect(texts(t.rows[0]![0]!)).toBe('1');
    expect(texts(t.rows[0]![1]!)).toBe('2');
  });

  it('セルの前後空白は落とす', () => {
    const t = asTable(parseMarkdown(md('|  a  |  b  |', '| --- | --- |', '|  1  |  2  |')));
    expect(texts(t.headers[0]!)).toBe('a');
    expect(texts(t.rows[0]![0]!)).toBe('1');
  });

  it('空行で表が終わる (後続の段落を巻き込まない)', () => {
    const b = parseMarkdown(md('| a |', '| --- |', '| 1 |', '', 'あとの段落'));
    expect(asTable(b).rows.length).toBe(1);
    expect(b.filter((x) => x.type === 'paragraph').length).toBe(1);
  });

  it('縦棒の無い行で表が終わる', () => {
    const b = parseMarkdown(md('| a |', '| --- |', '| 1 |', 'ただの行'));
    expect(asTable(b).rows.length).toBe(1);
    expect(b.filter((x) => x.type === 'paragraph').length).toBe(1);
  });

  it('表の前の段落は表より先に確定する', () => {
    const b = parseMarkdown(md('まえがき', '| a |', '| --- |', '| 1 |'));
    expect(b[0]!.type).toBe('paragraph');
    expect(b[1]!.type).toBe('table');
  });
});

describe('parseMarkdown — 箇条書き', () => {
  const md = (...l: string[]): string => l.join('\n');

  it('- と * のどちらも印になる', () => {
    expect(asList(parseMarkdown('- a\n* b')).items.length).toBe(2);
  });

  it('印のあとに空白が要る', () => {
    expect(parseMarkdown('-a')[0]!.type).toBe('paragraph');
    expect(parseMarkdown('1.a')[0]!.type).toBe('paragraph');
  });

  it('番号付きは数字が続く限り読む (番号の値は問わない)', () => {
    const l = asList(parseMarkdown(md('1. a', '5. b', '99. c')));
    expect(l.ordered).toBe(true);
    expect(l.items.length).toBe(3);
  });

  it('番号付きの途中に印付きが来たら、そこで区切る', () => {
    const b = parseMarkdown(md('1. a', '- b'));
    expect(asList(b).ordered).toBe(true);
    expect(asList(b).items.length).toBe(1);
    expect(b.filter((x) => x.type === 'list').length).toBe(2);
  });

  it('印付きの途中に番号付きが来たら、そこで区切る', () => {
    const b = parseMarkdown(md('- a', '1. b'));
    expect(b.filter((x) => x.type === 'list').length).toBe(2);
    expect((b[0] as Extract<Block, { type: 'list' }>).ordered).toBe(false);
    expect((b[1] as Extract<Block, { type: 'list' }>).ordered).toBe(true);
  });

  it('項目の中の記法も解析する', () => {
    const l = asList(parseMarkdown('- **a** b'));
    expect(l.items[0]).toEqual([{ text: 'a', bold: true }, { text: ' b' }]);
  });

  it('箇条書きの前の段落は先に確定する', () => {
    const b = parseMarkdown(md('まえがき', '- a'));
    expect(b[0]!.type).toBe('paragraph');
    expect(b[1]!.type).toBe('list');
  });
});

describe('parseMarkdown — コードフェンス', () => {
  const md = (...l: string[]): string => l.join('\n');

  it('複数行を改行込みでそのまま保つ', () => {
    const b = parseMarkdown(md('```', 'a', '', 'b', '```'));
    expect(b[0]).toEqual({ type: 'code', text: 'a\n\nb' });
  });

  it('中身の字下げを潰さない', () => {
    const b = parseMarkdown(md('```', '  indented', '```'));
    expect(b[0]).toEqual({ type: 'code', text: '  indented' });
  });

  it('言語指定つきのフェンスも開始とみなす', () => {
    const b = parseMarkdown(md('```ts', 'const x = 1;', '```'));
    expect(b[0]).toEqual({ type: 'code', text: 'const x = 1;' });
  });

  it('閉じ忘れても最後まで読んで落ちない', () => {
    const b = parseMarkdown(md('```', 'a', 'b'));
    expect(b[0]).toEqual({ type: 'code', text: 'a\nb' });
  });

  it('中身が空でもコードブロックにする', () => {
    expect(parseMarkdown(md('```', '```'))[0]).toEqual({ type: 'code', text: '' });
  });

  it('フェンスの中の記法は解析しない (そのままの字面)', () => {
    const b = parseMarkdown(md('```', '**not bold** | a |', '```'));
    expect(b[0]).toEqual({ type: 'code', text: '**not bold** | a |' });
  });

  it('フェンスの前の段落は先に確定する', () => {
    const b = parseMarkdown(md('まえがき', '```', 'x', '```'));
    expect(b[0]!.type).toBe('paragraph');
    expect(b[1]!.type).toBe('code');
  });

  it('フェンスのあとも読み続ける', () => {
    const b = parseMarkdown(md('```', 'x', '```', 'あと'));
    expect(b.map((x) => x.type)).toEqual(['code', 'paragraph']);
  });
});

/*
 * 変異検査で残った境界を 1 つずつ。どれも「一見どうでもよい」書き方の違いだが、
 * 崩れると**表の桁がずれる / 箇条書きが途中で切れる**という形で画面に出る。
 */
describe('parseMarkdown — 変異検査で見つかった境界', () => {
  const md = (...l: string[]): string => l.join('\n');

  it('記法の中身は 2 文字以上でも読む', () => {
    expect(parseInline('**bold**')).toEqual([{ text: 'bold', bold: true }]);
    expect(parseInline('`code`')).toEqual([{ text: 'code', code: true }]);
  });

  it('表の行の外側の空白を落としてから縦棒を数える', () => {
    const t = asTable(parseMarkdown(md('  | a | b |  ', '| --- | --- |', '  | 1 | 2 |  ')));
    expect(t.headers.length).toBe(2);
    expect(t.rows[0]!.length).toBe(2);
  });

  it('先頭の縦棒が無く末尾だけある行を取り違えない', () => {
    const t = asTable(parseMarkdown(md('a | b |', '--- | --- |', '1 | 2 |')));
    expect(texts(t.headers[0]!)).toBe('a');
    expect(texts(t.rows[0]![0]!)).toBe('1');
  });

  it('区切り行は前後にゴミが付いていたら区切りにしない', () => {
    for (const sep of ['| x--- | --- |', '| ---x | --- |']) {
      expect(parseMarkdown(md('| a | b |', sep, '| 1 | 2 |'))[0]!.type, sep).toBe('paragraph');
    }
  });

  it('縦棒の無い行は、次が区切りに見えても表にしない', () => {
    expect(parseMarkdown(md('abc', '| --- |', '| 1 |'))[0]!.type).toBe('paragraph');
  });

  it('字下げされた表の行も表の一部として読む', () => {
    const t = asTable(parseMarkdown(md('| a |', '| --- |', '  | 1 |', '  | 2 |')));
    expect(t.rows.length).toBe(2);
  });

  it('フェンスの閉じは字下げされていても閉じとみなす', () => {
    const b = parseMarkdown(md('```', 'x', '  ```', 'あと'));
    expect(b[0]).toEqual({ type: 'code', text: 'x' });
    expect(b[1]!.type).toBe('paragraph');
  });

  it('フェンスの中の「末尾がバッククォートの行」で閉じない', () => {
    const b = parseMarkdown(md('```', 'x```', 'y', '```'));
    expect(b[0]).toEqual({ type: 'code', text: 'x```\ny' });
  });

  it('見出しの # のあとの空白が複数でも本文だけを取る', () => {
    const h = parseMarkdown('##   t')[0] as Extract<Block, { type: 'heading' }>;
    expect(h.spans).toEqual([{ text: 't' }]);
  });

  it('箇条書きの印のあとの空白が複数でも本文だけを取る', () => {
    expect(asList(parseMarkdown('-   a')).items[0]).toEqual([{ text: 'a' }]);
    expect(asList(parseMarkdown('1.   a')).items[0]).toEqual([{ text: 'a' }]);
  });

  it('行頭以外の印は箇条書きにしない', () => {
    expect(parseMarkdown('x - a')[0]!.type).toBe('paragraph');
    expect(parseMarkdown('x1. a')[0]!.type).toBe('paragraph');
  });

  it('2 桁以上の番号から始まる箇条書きも読む', () => {
    const l = asList(parseMarkdown(md('10. a', '11. b')));
    expect(l.ordered).toBe(true);
    expect(l.items.length).toBe(2);
  });

  it('字下げされた箇条書きも 1 つの塊として読む', () => {
    expect(asList(parseMarkdown(md('- a', '  - b'))).items.length).toBe(2);
  });

  // `para` の作り直しを忘れると、区切ったはずの文が次の段落へ混ざる。
  it('フェンス・見出し・表・箇条書きのあと、前の段落が混ざらない', () => {
    for (const [label, src] of [
      ['フェンス', md('まえ', '```', 'x', '```', 'あと')],
      ['見出し', md('まえ', '# h', 'あと')],
      ['表', md('まえ', '| a |', '| --- |', '| 1 |', '', 'あと')],
      ['箇条書き', md('まえ', '- a', 'あと')],
    ] as const) {
      const ps = parseMarkdown(src).filter(
        (b): b is Extract<Block, { type: 'paragraph' }> => b.type === 'paragraph',
      );
      expect(ps.map((p) => texts(p.spans)), label).toEqual(['まえ', 'あと']);
    }
  });
});

/*
 * 項目を集めるループ側の `^`。検出は行頭でしか始まらないが、**ループの中**の
 * 判定から `^` が落ちると「行の途中に印がある行」まで項目として飲み込み、
 * 箇条書きが本来終わるべき所で終わらなくなる。検出側の検査 (行頭以外は
 * 箇条書きにしない) では、ループへ入る前に弾かれるので捕まえられない。
 */
describe('parseMarkdown — 箇条書きの終わり方', () => {
  const md = (...l: string[]): string => l.join('\n');

  it('行の途中に印がある行で終わる (印付き)', () => {
    const b = parseMarkdown(md('- a', 'x - b'));
    expect(asList(b).items.length).toBe(1);
    expect(b.filter((x) => x.type === 'paragraph').length).toBe(1);
  });

  it('行の途中に番号がある行で終わる (番号付き)', () => {
    const b = parseMarkdown(md('1. a', 'x 2. b'));
    expect(asList(b).items.length).toBe(1);
    expect(b.filter((x) => x.type === 'paragraph').length).toBe(1);
  });
});

/**
 * **描く量の上限。** 固まる原因は正規表現ではなく量だった。
 *
 * `lint:regex` はこのファイルを名指しで見張っているが、見ているのは
 * *指数時間の式*である。実測すると式は全部線形で、それでも 10MiB の応答は
 * 150 万ブロックになり **描画に 15.6 秒**掛かった (`renderToString` 実測。
 * 実 DOM はもっと重い)。レンダラーは 1 スレッドなので画面ごと止まる。
 *
 * 上限は沈み先に置いてある —— 応答を作る口は `shared/ai/chat.ts` と
 * `chatOllama` (main / ブラウザ) に分かれており、産地ごとに書くと
 * **口が増えた日に片方だけ守られる**。
 */
describe('描く量の上限 — 量で画面を止めさせない', () => {
  it('★ 上限を超えるとブロック数が頭打ちになる', () => {
    const blocks = parseMarkdown('#### x\n'.repeat(MAX_RENDER_BLOCKS * 2));
    // 上限ぶん + 注記 1 つ
    expect(blocks).toHaveLength(MAX_RENDER_BLOCKS + 1);
  });

  it('★ 打ち切ったことが見える形で残る', () => {
    const blocks = parseMarkdown('#### x\n'.repeat(MAX_RENDER_BLOCKS * 2));
    const last = blocks[blocks.length - 1]!;
    expect(last.type).toBe('paragraph');
    expect(JSON.stringify(last)).toContain(BLOCKS_TRUNCATED_NOTICE);
  });

  /*
   * **対照。** 上 2 件は「切られること」しか見ないので、実装が何でも切る
   * ようになっても気付けない。上限**ちょうど**が 1 つも欠けずに通ることを
   * 確かめる —— 境界を 1 つ間違えれば (`>=` にすれば) ここが鳴る。
   */
  it('★ 上限ちょうどは 1 つも欠けず、注記も付かない (対照)', () => {
    const blocks = parseMarkdown('#### x\n'.repeat(MAX_RENDER_BLOCKS));
    expect(blocks).toHaveLength(MAX_RENDER_BLOCKS);
    expect(JSON.stringify(blocks)).not.toContain(BLOCKS_TRUNCATED_NOTICE);
  });

  it('★ 普通の長さの応答は素通し (正当な応答では発火しない)', () => {
    const blocks = parseMarkdown('# 見出し\n\n本文です。\n\n- a\n- b\n');
    expect(blocks.length).toBeLessThan(10);
    expect(JSON.stringify(blocks)).not.toContain(BLOCKS_TRUNCATED_NOTICE);
  });
});
