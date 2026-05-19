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
