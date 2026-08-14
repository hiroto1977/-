import { describe, expect, it } from 'vitest';
import { escapeXml, safeColor } from '../escape';

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
