import { describe, expect, it } from 'vitest';
import { escapeXml, safeColor, isHexColor } from '../escape';

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
