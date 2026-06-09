import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_CATALOG_FOR_WEB,
  renderTemplateForWeb,
  type TemplateDef,
} from '../web-templates';

describe('TEMPLATE_CATALOG_FOR_WEB', () => {
  it('contains 8 templates with matching backend ids', () => {
    expect(TEMPLATE_CATALOG_FOR_WEB).toHaveLength(8);
    expect(TEMPLATE_CATALOG_FOR_WEB.map((t) => t.id)).toEqual([
      'presentation-cover',
      'business-card',
      'social-square',
      'social-story',
      'flyer-a4',
      'certificate',
      'invoice-header',
      'resume-header',
    ]);
  });

  it('every template has positive width / height', () => {
    for (const t of TEMPLATE_CATALOG_FOR_WEB) {
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
    }
  });

  it('every template has hex defaults', () => {
    for (const t of TEMPLATE_CATALOG_FOR_WEB) {
      expect(t.defaults.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.defaults.secondaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('pins canonical dimensions per template (kills numeric mutants)', () => {
    const dim = Object.fromEntries(TEMPLATE_CATALOG_FOR_WEB.map((t) => [t.id, { w: t.width, h: t.height }]));
    expect(dim['presentation-cover']).toEqual({ w: 1920, h: 1080 });
    expect(dim['business-card']).toEqual({ w: 1075, h: 650 });
    expect(dim['social-square']).toEqual({ w: 1080, h: 1080 });
    expect(dim['social-story']).toEqual({ w: 1080, h: 1920 });
    expect(dim['flyer-a4']).toEqual({ w: 1240, h: 1754 });
    expect(dim['certificate']).toEqual({ w: 1754, h: 1240 });
    expect(dim['invoice-header']).toEqual({ w: 1240, h: 350 });
    expect(dim['resume-header']).toEqual({ w: 1240, h: 600 });
  });
});

describe('renderTemplateForWeb — structural invariants', () => {
  for (const def of TEMPLATE_CATALOG_FOR_WEB) {
    it(`renders valid SVG for ${def.id} with defaults`, () => {
      const svg = renderTemplateForWeb(def, {});
      expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain(`width="${def.width}"`);
      expect(svg).toContain(`height="${def.height}"`);
      expect(svg).toContain('</svg>');
    });

    it(`renders ${def.id} with user-supplied title`, () => {
      // Short title (≤ 10 chars) so social-square/story `wrap(title, 14|11)`
      // does not split it across tspan boundaries.
      const svg = renderTemplateForWeb(def, { title: 'UNIQ-TITLE' });
      expect(svg).toContain('UNIQ-TITLE');
    });
  }

  it('escapes HTML-significant characters in title (anti-XSS)', () => {
    const def = TEMPLATE_CATALOG_FOR_WEB[0]!;
    const svg = renderTemplateForWeb(def, { title: '<script>alert("xss")</script>' });
    expect(svg).not.toContain('<script>alert');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('escapes HTML-significant characters in body', () => {
    const def = TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === 'flyer-a4')!;
    const svg = renderTemplateForWeb(def, { body: '<b>hello</b>' });
    expect(svg).not.toContain('<b>hello</b>');
    expect(svg).toContain('&lt;b&gt;');
  });

  it('renders certificate with two-line body split', () => {
    const def = TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === 'certificate')!;
    const svg = renderTemplateForWeb(def, { body: 'first-line\nsecond-line' });
    expect(svg).toContain('first-line');
    expect(svg).toContain('second-line');
  });

  it('wraps flyer body lines via tspan elements', () => {
    const def = TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === 'flyer-a4')!;
    const svg = renderTemplateForWeb(def, { body: 'a\nb\nc' });
    expect((svg.match(/<tspan/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('falls back to def.defaults for non-string params', () => {
    const def = TEMPLATE_CATALOG_FOR_WEB[1]!; // business-card
    // accentColor not provided → should use def.defaults.accentColor
    const svg = renderTemplateForWeb(def, { title: 'X' });
    expect(svg).toContain(def.defaults.accentColor);
  });

  it('renders an unknown template id with a placeholder svg', () => {
    const fakeDef: TemplateDef = {
      id: 'no-such-template',
      width: 100,
      height: 50,
      defaults: {
        title: 'x',
        subtitle: 'x',
        body: 'x',
        accentColor: '#000000',
        secondaryColor: '#ffffff',
        brandText: 'x',
      },
    };
    const svg = renderTemplateForWeb(fakeDef, {});
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
  });

  it('honors caller-supplied brandText override', () => {
    for (const def of TEMPLATE_CATALOG_FOR_WEB) {
      const svg = renderTemplateForWeb(def, { brandText: 'OVERRIDE_BRAND' });
      // certificate / social-story uses brandText in fixed position;
      // verify it appears somewhere in the output
      if (def.id === 'resume-header' && def.defaults.brandText === '') {
        // resume-header default brand is empty; still should accept override
        expect(svg).toContain('OVERRIDE_BRAND');
      } else {
        expect(svg).toContain('OVERRIDE_BRAND');
      }
    }
  });
});

/**
 * Golden 完全一致テスト。SVG は決定論的に生成されるため、座標・色・フォント・opacity
 * などのリテラルと W/2・H-80 等の算術、`i === 0 ? 0 : dy` の条件、`typeof === 'string'`
 * の param ガードを一括で撃墜する。esc(特殊文字) と wrap(長い多段落) を必ず通す入力にする。
 */
describe('renderTemplateForWeb — golden output (exact SVG)', () => {
  // 特殊文字 (esc) + 長いタイトル/本文 (wrap: 24/14/11/36 折返し境界と空行) を含む。
  const CUSTOM: Record<string, string> = {
    title: '限定<&>"\'セール2035 — 全社員むけ特別企画 ABCDEFGHIJKLMNOP',
    subtitle: 'Q2 <レビュー> & "まとめ"',
    body: '一行目 <a&b>\n\n三行目 "quoted" \'apos\' これは長めの本文で flyer の36文字折返しを十分に超える内容です ABCDEFGHIJK',
    accentColor: '#123abc',
    secondaryColor: '#fedcba',
    brandText: 'Brand<&>',
  };

  for (const def of TEMPLATE_CATALOG_FOR_WEB) {
    it(`matches the golden SVG for ${def.id} (custom params)`, () => {
      expect(renderTemplateForWeb(def, CUSTOM)).toMatchSnapshot();
    });
    it(`matches the golden SVG for ${def.id} (defaults)`, () => {
      // 空 params → 各 typeof ガードが false 側 (def.defaults) を採る。
      expect(renderTemplateForWeb(def, {})).toMatchSnapshot();
    });
  }

  it('matches the golden placeholder SVG for an unknown template id', () => {
    const fakeDef: TemplateDef = {
      id: 'no-such-template',
      width: 320,
      height: 240,
      defaults: { title: 'x', subtitle: 'x', body: 'x', accentColor: '#000000', secondaryColor: '#ffffff', brandText: 'x' },
    };
    expect(renderTemplateForWeb(fakeDef, CUSTOM)).toMatchSnapshot();
  });
});

describe('renderTemplateForWeb — esc / wrap edge behaviour', () => {
  const pres = TEMPLATE_CATALOG_FOR_WEB[0]!; // presentation-cover, wrap(title, 24)

  it('escapes all five HTML-significant characters in order', () => {
    const svg = renderTemplateForWeb(pres, { title: `&<>"'` });
    // & は最初に置換されるので二重エスケープしない。
    expect(svg).toContain('&amp;&lt;&gt;&quot;&#39;');
  });

  it('wraps a title exactly at the 24-char boundary (>= strict)', () => {
    // 24 文字ちょうど → 1 行。25 文字目で 2 行目へ割れる (buf.length >= maxChars)。
    const at24 = 'あ'.repeat(24);
    const svg24 = renderTemplateForWeb(pres, { title: at24 });
    expect((svg24.match(/<tspan/g) ?? []).length).toBe(1);
    const at25 = 'あ'.repeat(25);
    const svg25 = renderTemplateForWeb(pres, { title: at25 });
    expect((svg25.match(/<tspan/g) ?? []).length).toBe(2);
    // 2 行目は dy=100 (i !== 0)、1 行目は dy=0。
    expect(svg25).toContain('dy="0"');
    expect(svg25).toContain('dy="100"');
  });

  it('certificate with a single-line body leaves the 2nd line blank ([1] ?? "" fallback)', () => {
    const cert = TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === 'certificate')!;
    // 1 行のみ → split[1] が undefined → `?? ''` で空文字。"Stryker" 化変異を撃墜。
    const svg = renderTemplateForWeb(cert, { body: 'ONLY-ONE-LINE' });
    expect(svg).toContain('ONLY-ONE-LINE');
    expect(svg).not.toContain('Stryker');
    // 2 番目の body text 要素は空 (中身なし)。
    expect(svg).toContain('font-size="34" fill="#374151" text-anchor="middle"></text>');
  });

  it('preserves blank paragraphs from newlines (empty-para branch)', () => {
    const flyer = TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === 'flyer-a4')!;
    // a\n\nb → 3 行 (空行を含む)。空行は空 tspan になる。
    const svg = renderTemplateForWeb(flyer, { body: 'a\n\nb' });
    expect((svg.match(/<tspan/g) ?? []).length).toBe(3);
  });
});
