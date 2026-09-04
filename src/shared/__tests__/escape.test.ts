import { describe, expect, it } from 'vitest';
import { escapeXml, safeColor, isHexColor, escapeMarkdownInline, escapeMarkdownText } from '../escape';

describe('escapeXml', () => {
  it('マークアップで意味を持つ 5 文字を落とす', () => {
    expect(escapeXml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('& を最初に置換する（実体参照の & を二重変換しない）', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });

  it('普通の文字列は変えない', () => {
    expect(escapeXml('株式会社サンプル 123')).toBe('株式会社サンプル 123');
    expect(escapeXml('')).toBe('');
  });

  // 個々の文字ではなく「素通りするマークアップ文字が 1 つも残らない」ことを見る。
  // 置換が 1 つ落ちたときに、どの文字が落ちたかに依らず落ちる。
  it('XSS を狙った入力から、素通りするマークアップ文字が 1 つも残らない', () => {
    const out = escapeXml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('"');
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).toContain('&quot;');
  });
});

describe('safeColor', () => {
  const FB = '#5b8def';

  it('16進の色を通す（3/6/8 桁）', () => {
    for (const c of ['#fff', '#FFF', '#0f5fac', '#0F5FAC', '#0f5facff']) {
      expect(safeColor(c, FB), c).toBe(c);
    }
  });

  it('名前つきの色を通す', () => {
    for (const c of ['red', 'rebeccapurple', 'transparent']) {
      expect(safeColor(c, FB), c).toBe(c);
    }
  });

  it('属性を抜ける文字を含むものは既定値に落とす', () => {
    const attacks = [
      '"/><script>alert(1)</script><rect fill="#000',
      '" onload="alert(1)',
      "' onload='alert(1)",
      '#000" onmouseover="x',
      'url(javascript:alert(1))',
      'red;background:url(x)',
      '#0f5fac ',
      ' #0f5fac',
      '#00ff',
      '#0f5fa',
      // アンカーが片方でも欠けると、これらが「色」として通ってしまう。
      '#0f5facff" onload="x',
      '#0f5facffff',
      'x#0f5facff',
      '#000" x',
      'x#000',
      '#0f5fac" x',
      '#gggggg',
      'rgb(1,2,3)',
      '',
      'a'.repeat(21),
      'ab',
    ];
    for (const a of attacks) {
      expect(safeColor(a, FB), JSON.stringify(a)).toBe(FB);
    }
  });

  it('既定値をそのまま返す（呼び出し側が用意した安全な値）', () => {
    expect(safeColor('!!', '#123456')).toBe('#123456');
  });

  it('通した値は引用符・山括弧・空白を含まない（属性から抜けられない）', () => {
    for (const c of ['#fff', '#0f5facff', 'rebeccapurple']) {
      const out = safeColor(c, FB);
      expect(/["'<>\s]/.test(out), c).toBe(false);
    }
  });
});

describe('isHexColor', () => {
  it('#RRGGBB を通す（大文字小文字どちらも）', () => {
    expect(isHexColor('#abcdef')).toBe(true);
    expect(isHexColor('#012345')).toBe(true);
    expect(isHexColor('#ABCDEF')).toBe(true);
    expect(isHexColor('#000000')).toBe(true);
  });

  it('桁数が 6 でないものは弾く', () => {
    expect(isHexColor('#abc')).toBe(false);
    expect(isHexColor('#abcde')).toBe(false);
    expect(isHexColor('#abcdef0')).toBe(false);
    expect(isHexColor('#abcdefab')).toBe(false);
  });

  it('16進でない文字は弾く', () => {
    expect(isHexColor('#zzzzzz')).toBe(false);
    expect(isHexColor('#abcdeg')).toBe(false);
    expect(isHexColor('red')).toBe(false);
  });

  it('# が無い / 空 は弾く', () => {
    expect(isHexColor('abcdef')).toBe(false);
    expect(isHexColor('')).toBe(false);
    expect(isHexColor('#')).toBe(false);
  });

  // アンカーが片方でも外れると、属性を抜ける文字列が通る。
  it('前後に何か付いていれば弾く（属性から抜けられない）', () => {
    expect(isHexColor(' #abcdef')).toBe(false);
    expect(isHexColor('#abcdef ')).toBe(false);
    expect(isHexColor('x#abcdef')).toBe(false);
    expect(isHexColor('#abcdef" onload="alert(1)')).toBe(false);
    expect(isHexColor('#abcdef\n<script>alert(1)</script>')).toBe(false);
  });
});

/*
 * Markdown のエスケープ。
 *
 * ここに埋まるのは利用者が打った文字だけではなく **AI アドバイザーの応答**
 * (`rationale` / `riskFactors` / `actionItems`) で、検証は「空でない文字列」
 * しか見ていない。したがって「壊れた入力」ではなく「敵対的な入力」を置く。
 */
describe('escapeMarkdownInline — 1 行に収まる場所', () => {
  it('セルの区切りを落とす', () => {
    expect(escapeMarkdownInline('A|B')).toBe('A\\|B');
  });

  it('エスケープ文字を先に逃がす (末尾の \\ が次の区切りを打ち消さない)', () => {
    // 先に `|` を処理すると `A\|` の `\` がそのまま残り、
    // 直後の区切りを打ち消して隣のセルと融合する。
    expect(escapeMarkdownInline('A\\')).toBe('A\\\\');
    expect(escapeMarkdownInline('A\\|B')).toBe('A\\\\\\|B');
  });

  it('改行を空白へ潰す (行から抜けさせない)', () => {
    expect(escapeMarkdownInline('A\nB')).toBe('A B');
    expect(escapeMarkdownInline('A\r\nB')).toBe('A B');
    expect(escapeMarkdownInline('A\rB')).toBe('A B');
    // CRLF を 1 つとして数える。2 回置換すると空白が 2 つになる。
    expect(escapeMarkdownInline('A\r\nB')).not.toBe('A  B');
  });

  it('生 HTML の入口を塞ぐ', () => {
    expect(escapeMarkdownInline('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)>',
    );
  });

  it('表を作り直す入力を無力化する (改行 + 区切り行)', () => {
    // 「壊れる」ではなく「差し替わる」形。行が終われば以降は新しい構造。
    const evil = 'AAPL\n\n| 偽の見出し |\n|---|\n| 偽の値 |';
    const got = escapeMarkdownInline(evil);
    expect(got).not.toContain('\n');
    expect(got).not.toContain('|---|');
    expect(got).toBe('AAPL  \\| 偽の見出し \\| \\|---\\| \\| 偽の値 \\|');
  });

  it('見出し・箇条書き・引用から抜けさせない', () => {
    expect(`### ${escapeMarkdownInline('銘柄\n## 乗っ取り')}`).toBe('### 銘柄 ## 乗っ取り');
    expect(`- ${escapeMarkdownInline('risk\n- 偽')}`).toBe('- risk - 偽');
    expect(`> ${escapeMarkdownInline('免責\n本文')}`).toBe('> 免責 本文');
  });

  it('普通の文字は変えない', () => {
    expect(escapeMarkdownInline('AAPL アップル 100円 (+1.5%)')).toBe('AAPL アップル 100円 (+1.5%)');
    expect(escapeMarkdownInline('')).toBe('');
  });

  it('置換はすべての出現に及ぶ (最初の 1 つで止まらない)', () => {
    expect(escapeMarkdownInline('a|b|c')).toBe('a\\|b\\|c');
    expect(escapeMarkdownInline('<a<b')).toBe('&lt;a&lt;b');
    expect(escapeMarkdownInline('a\nb\nc')).toBe('a b c');
  });
});

describe('escapeMarkdownText — 段落', () => {
  it('生 HTML の入口を塞ぐ', () => {
    expect(escapeMarkdownText('<script>alert(1)</script>')).toBe(
      '&lt;script>alert(1)&lt;/script>',
    );
  });

  it('改行は残す (段落や箇条書きは地の文に正当に現れる)', () => {
    expect(escapeMarkdownText('一行目\n二行目')).toBe('一行目\n二行目');
  });

  it('`|` は落とさない (段落では区切りではない)', () => {
    expect(escapeMarkdownText('A|B')).toBe('A|B');
  });

  it('& は落とさない — 実体参照は CommonMark §2.5 で「文字」であり markup にならない', () => {
    // `&lt;script&gt;` と書かれても描画結果は文字列 `<script>` であって
    // タグにはならない。落とすと素の viewer で `&amp;` が見えるだけ損。
    expect(escapeMarkdownText('&lt;script&gt;')).toBe('&lt;script&gt;');
    expect(escapeMarkdownText('A & B')).toBe('A & B');
  });

  it('普通の文字は変えない', () => {
    expect(escapeMarkdownText('売上が伸びています。')).toBe('売上が伸びています。');
    expect(escapeMarkdownText('')).toBe('');
  });
});
