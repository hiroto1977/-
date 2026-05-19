import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ACTIONS,
  TEMPLATE_CATALOG,
  TEMPLATE_IDS,
  defaultExportDir,
  defaultExportPath,
  escapeXml,
  exportTemplateImpl,
  fetchTemplatesSnapshot,
  fetchTemplatesSnapshotImpl,
  getTemplateDef,
  isSafeSvgExportPath,
  isTemplateId,
  renderTemplate,
  validateParams,
  wrapLines,
  type TemplateId,
  type TemplateParams,
} from '../templates';

// --- Catalog ----------------------------------------------------------

describe('TEMPLATE_CATALOG', () => {
  it('contains exactly 8 templates', () => {
    expect(TEMPLATE_CATALOG).toHaveLength(8);
    expect(TEMPLATE_IDS).toHaveLength(8);
  });

  it('declares all expected template ids in order', () => {
    expect(TEMPLATE_IDS).toEqual([
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

  it('every template has positive width/height and non-empty label', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('every template has #RRGGBB defaults for both colors', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.defaults.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.defaults.secondaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('pins canonical dimensions (kills numeric mutants on dim-only categories)', () => {
    const dimById = Object.fromEntries(
      TEMPLATE_CATALOG.map((t) => [t.id, { w: t.width, h: t.height }]),
    );
    expect(dimById['presentation-cover']).toEqual({ w: 1920, h: 1080 });
    expect(dimById['business-card']).toEqual({ w: 1075, h: 650 });
    expect(dimById['social-square']).toEqual({ w: 1080, h: 1080 });
    expect(dimById['social-story']).toEqual({ w: 1080, h: 1920 });
    expect(dimById['flyer-a4']).toEqual({ w: 1240, h: 1754 });
    expect(dimById['certificate']).toEqual({ w: 1754, h: 1240 });
    expect(dimById['invoice-header']).toEqual({ w: 1240, h: 350 });
    expect(dimById['resume-header']).toEqual({ w: 1240, h: 600 });
  });
});

// --- isTemplateId / getTemplateDef ------------------------------------

describe('isTemplateId', () => {
  it('accepts known ids', () => {
    for (const id of TEMPLATE_IDS) {
      expect(isTemplateId(id)).toBe(true);
    }
  });
  it('rejects unknown / non-string', () => {
    expect(isTemplateId('unknown')).toBe(false);
    expect(isTemplateId('')).toBe(false);
    expect(isTemplateId(42)).toBe(false);
    expect(isTemplateId(null)).toBe(false);
    expect(isTemplateId(undefined)).toBe(false);
  });
  it('rejects __proto__ / constructor (no prototype-chain leaks)', () => {
    expect(isTemplateId('__proto__')).toBe(false);
    expect(isTemplateId('constructor')).toBe(false);
    expect(isTemplateId('toString')).toBe(false);
  });
});

describe('getTemplateDef', () => {
  it('returns the def for each id', () => {
    for (const id of TEMPLATE_IDS) {
      const def = getTemplateDef(id);
      expect(def.id).toBe(id);
    }
  });
});

// --- escapeXml --------------------------------------------------------

describe('escapeXml', () => {
  it('escapes 5 reserved chars', () => {
    expect(escapeXml('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
  it('passes plain text unchanged', () => {
    expect(escapeXml('hello 日本語')).toBe('hello 日本語');
  });
});

// --- wrapLines --------------------------------------------------------

describe('wrapLines', () => {
  it('wraps at maxChars boundary', () => {
    expect(wrapLines('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
  it('preserves explicit newlines as line breaks', () => {
    expect(wrapLines('ab\ncd', 10)).toEqual(['ab', 'cd']);
  });
  it('handles empty paragraphs', () => {
    expect(wrapLines('a\n\nb', 10)).toEqual(['a', '', 'b']);
  });
  it('returns single-line for short text', () => {
    expect(wrapLines('hi', 100)).toEqual(['hi']);
  });
});

// --- validateParams ---------------------------------------------------

describe('validateParams', () => {
  const defaults: TemplateParams = {
    title: 'T',
    subtitle: 'S',
    body: 'B',
    accentColor: '#000000',
    secondaryColor: '#ffffff',
    brandText: 'BR',
  };

  it('returns defaults for null / non-object', () => {
    expect(validateParams(null, defaults)).toEqual(defaults);
    expect(validateParams('x', defaults)).toEqual(defaults);
    expect(validateParams(42, defaults)).toEqual(defaults);
  });

  it('overrides string fields when provided', () => {
    const out = validateParams({ title: 'NEW', subtitle: 'X', brandText: 'B' }, defaults);
    expect(out.title).toBe('NEW');
    expect(out.subtitle).toBe('X');
    expect(out.brandText).toBe('B');
    expect(out.body).toBe('B');
  });

  it('rejects oversize title (>80) / subtitle (>120) / body (>400) / brandText (>48)', () => {
    expect(() => validateParams({ title: 'x'.repeat(81) }, defaults)).toThrow(/title exceeds 80/);
    expect(() => validateParams({ subtitle: 'x'.repeat(121) }, defaults)).toThrow(/subtitle exceeds 120/);
    expect(() => validateParams({ body: 'x'.repeat(401) }, defaults)).toThrow(/body exceeds 400/);
    expect(() => validateParams({ brandText: 'x'.repeat(49) }, defaults)).toThrow(/brandText exceeds 48/);
  });

  it('accepts boundary lengths (80/120/400/48 chars exactly)', () => {
    const out = validateParams(
      {
        title: 'x'.repeat(80),
        subtitle: 'x'.repeat(120),
        body: 'x'.repeat(400),
        brandText: 'x'.repeat(48),
      },
      defaults,
    );
    expect(out.title).toHaveLength(80);
    expect(out.subtitle).toHaveLength(120);
    expect(out.body).toHaveLength(400);
    expect(out.brandText).toHaveLength(48);
  });

  it('rejects null bytes in any text field', () => {
    expect(() => validateParams({ title: 'a\0b' }, defaults)).toThrow(/null byte/);
    expect(() => validateParams({ subtitle: 'a\0b' }, defaults)).toThrow(/null byte/);
    expect(() => validateParams({ body: 'a\0b' }, defaults)).toThrow(/null byte/);
    expect(() => validateParams({ brandText: 'a\0b' }, defaults)).toThrow(/null byte/);
  });

  it('rejects non-hex color', () => {
    expect(() => validateParams({ accentColor: 'red' }, defaults)).toThrow(/accentColor must be #RRGGBB/);
    expect(() => validateParams({ accentColor: '#abc' }, defaults)).toThrow(/accentColor must be/);
    expect(() => validateParams({ secondaryColor: '#zzzzzz' }, defaults)).toThrow(/secondaryColor must be/);
  });

  it('accepts both 3-digit-no and 6-digit hex (only 6-digit per regex)', () => {
    const out = validateParams({ accentColor: '#abcdef', secondaryColor: '#012345' }, defaults);
    expect(out.accentColor).toBe('#abcdef');
    expect(out.secondaryColor).toBe('#012345');
  });

  it('ignores non-string values for text fields (keeps default)', () => {
    const out = validateParams({ title: 42, subtitle: null }, defaults);
    expect(out.title).toBe('T');
    expect(out.subtitle).toBe('S');
  });
});

// --- renderTemplate ---------------------------------------------------

describe('renderTemplate', () => {
  for (const id of [
    'presentation-cover',
    'business-card',
    'social-square',
    'social-story',
    'flyer-a4',
    'certificate',
    'invoice-header',
    'resume-header',
  ] as const) {
    it('produces valid SVG for template "' + id + '"', () => {
      const def = getTemplateDef(id);
      const svg = renderTemplate(id, def.defaults);
      expect(svg.startsWith('<?xml')).toBe(true);
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain(`width="${def.width}"`);
      expect(svg).toContain(`height="${def.height}"`);
      expect(svg).toContain('</svg>');
      // Title appears somewhere in the rendered output
      expect(svg).toContain(escapeXml(def.defaults.title.slice(0, 4)));
    });
  }

  it('applies user-supplied params over defaults', () => {
    const svg = renderTemplate('business-card', { title: 'OVERRIDE_NAME', brandText: 'OVERRIDE_BRAND' });
    expect(svg).toContain('OVERRIDE_NAME');
    expect(svg).toContain('OVERRIDE_BRAND');
  });

  it('escapes HTML-significant chars in title (anti-XSS)', () => {
    const svg = renderTemplate('presentation-cover', { title: '<script>alert(1)</script>' });
    expect(svg).not.toContain('<script>alert');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('flyer body is wrapped + escaped in tspan blocks', () => {
    const svg = renderTemplate('flyer-a4', { body: 'line1\nline2' });
    expect(svg).toContain('<tspan');
    expect(svg).toContain('line1');
    expect(svg).toContain('line2');
  });

  it('certificate splits body into two lines via newline', () => {
    const svg = renderTemplate('certificate', { body: 'first\nsecond' });
    expect(svg).toContain('first');
    expect(svg).toContain('second');
  });
});

// --- defaultExportDir / defaultExportPath -----------------------------

describe('defaultExportDir / defaultExportPath', () => {
  it('exportDir = ~/.local/business-hub/data/templates', () => {
    expect(defaultExportDir()).toBe(
      path.join(os.homedir(), '.local', 'business-hub', 'data', 'templates'),
    );
  });
  it('exportPath suffixes <id>.svg', () => {
    expect(defaultExportPath('presentation-cover')).toBe(
      path.join(defaultExportDir(), 'presentation-cover.svg'),
    );
    expect(defaultExportPath('business-card' as TemplateId)).toBe(
      path.join(defaultExportDir(), 'business-card.svg'),
    );
  });
});

// --- isSafeSvgExportPath ----------------------------------------------

describe('isSafeSvgExportPath', () => {
  const home = '/home/user';

  it('accepts .svg in home', () => {
    expect(isSafeSvgExportPath('/home/user/.local/business-hub/data/templates/x.svg', home)).toBe(true);
  });

  it('rejects non-string / empty / oversize', () => {
    expect(isSafeSvgExportPath(42 as unknown as string, home)).toBe(false);
    expect(isSafeSvgExportPath('', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/' + 'x'.repeat(2000) + '.svg', home)).toBe(false);
  });

  it('rejects control chars (null / CR / LF)', () => {
    expect(isSafeSvgExportPath('/home/user/x\0.svg', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/x\n.svg', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/x\r.svg', home)).toBe(false);
  });

  it('rejects wrong extension', () => {
    expect(isSafeSvgExportPath('/home/user/x.png', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/x.html', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/x', home)).toBe(false);
  });

  it('rejects outside-home', () => {
    expect(isSafeSvgExportPath('/etc/x.svg', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/other/x.svg', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/../etc/x.svg', home)).toBe(false);
  });
});

// --- fetchTemplatesSnapshot -------------------------------------------

describe('fetchTemplatesSnapshot', () => {
  it('returns the catalog with isMock=true', async () => {
    const snap = await fetchTemplatesSnapshotImpl({ token: '' });
    expect(snap.templates).toHaveLength(8);
    expect(snap.isMock).toBe(true);
  });

  it('production wrapper delegates to impl', async () => {
    const snap = await fetchTemplatesSnapshot({ token: '' });
    expect(snap.templates).toHaveLength(8);
    expect(snap.isMock).toBe(true);
  });
});

// --- exportTemplateImpl -----------------------------------------------

describe('exportTemplateImpl', () => {
  it('writes SVG to the default path for a known template', async () => {
    const writes: { path: string; content: string }[] = [];
    const mkdirs: string[] = [];
    const result = await exportTemplateImpl(
      { token: '', payload: { templateId: 'presentation-cover' } },
      {
        writeFile: async (p, c) => {
          writes.push({ path: p, content: c });
        },
        mkdir: async (p) => {
          mkdirs.push(p);
        },
        now: () => new Date('2035-05-15T00:00:00.000Z'),
      },
    );
    expect(result.path).toBe(defaultExportPath('presentation-cover'));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.content.startsWith('<?xml')).toBe(true);
    expect(result.bytes).toBe(Buffer.byteLength(writes[0]!.content, 'utf8'));
    expect(result.generatedAt).toBe('2035-05-15T00:00:00.000Z');
    expect(mkdirs).toEqual([defaultExportDir()]);
  });

  it('rejects unknown template id', async () => {
    await expect(
      exportTemplateImpl(
        { token: '', payload: { templateId: 'not-a-template' } },
        { writeFile: async () => undefined, mkdir: async () => undefined },
      ),
    ).rejects.toThrow(/unknown template id/);
  });

  it('rejects custom path outside home directory', async () => {
    await expect(
      exportTemplateImpl(
        { token: '', payload: { templateId: 'business-card', path: '/etc/x.svg' } },
        { writeFile: async () => undefined, mkdir: async () => undefined },
      ),
    ).rejects.toThrow(/must be a \.svg file under the user home directory/);
  });

  it('rejects custom path with wrong extension', async () => {
    await expect(
      exportTemplateImpl(
        { token: '', payload: { templateId: 'business-card', path: path.join(os.homedir(), 'x.png') } },
        { writeFile: async () => undefined, mkdir: async () => undefined },
      ),
    ).rejects.toThrow(/must be a \.svg file/);
  });

  it('uses custom safe path when provided', async () => {
    const customPath = path.join(os.homedir(), 'custom.svg');
    let writtenPath = '';
    const result = await exportTemplateImpl(
      { token: '', payload: { templateId: 'business-card', path: customPath } },
      {
        writeFile: async (p) => {
          writtenPath = p;
        },
        mkdir: async () => undefined,
        now: () => new Date('2035-05-15T00:00:00.000Z'),
      },
    );
    expect(writtenPath).toBe(customPath);
    expect(result.path).toBe(customPath);
  });

  it('applies custom params to the rendered SVG', async () => {
    let svg = '';
    await exportTemplateImpl(
      {
        token: '',
        payload: {
          templateId: 'business-card',
          params: { title: 'CUSTOM_NAME', brandText: 'CUSTOM_BRAND' },
        },
      },
      {
        writeFile: async (_p, c) => {
          svg = c;
        },
        mkdir: async () => undefined,
        now: () => new Date('2035-05-15T00:00:00.000Z'),
      },
    );
    expect(svg).toContain('CUSTOM_NAME');
    expect(svg).toContain('CUSTOM_BRAND');
  });

  it('propagates validateParams errors (oversize title)', async () => {
    await expect(
      exportTemplateImpl(
        {
          token: '',
          payload: {
            templateId: 'business-card',
            params: { title: 'x'.repeat(200) },
          },
        },
        { writeFile: async () => undefined, mkdir: async () => undefined },
      ),
    ).rejects.toThrow(/title exceeds 80/);
  });
});

// --- ACTIONS ----------------------------------------------------------

describe('ACTIONS', () => {
  it('exposes export-template', () => {
    expect(typeof ACTIONS['export-template']).toBe('function');
  });
});
