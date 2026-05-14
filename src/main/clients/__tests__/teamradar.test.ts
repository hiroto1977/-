import { describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ACTIONS,
  AXIS_COUNT,
  CANONICAL_AXES,
  DEFAULT_TEAM_RADAR,
  SCORE_MAX,
  SCORE_MIN,
  axisPoint,
  colorFor,
  defaultStatePath,
  defaultSvgExportPath,
  escapeXml,
  exportTeamRadarSvgImpl,
  fetchTeamRadarSnapshot,
  fetchTeamRadarSnapshotImpl,
  isSafeSvgExportPath,
  isValidMemberId,
  isValidScore,
  loadTeamRadarState,
  renderTeamRadarSvg,
  saveTeamRadarState,
  saveTeamRadarStateImpl,
  validateMembers,
  type TeamMember,
  type TeamRadarState,
} from '../teamradar';

// --- Constants ---------------------------------------------------------

describe('team-radar constants', () => {
  it('has exactly 5 canonical axes', () => {
    expect(AXIS_COUNT).toBe(5);
    expect(CANONICAL_AXES).toHaveLength(5);
  });

  it('pins the 5 axis labels (kills StringLiteral mutants)', () => {
    expect(CANONICAL_AXES[0]).toBe('営業力');
    expect(CANONICAL_AXES[1]).toBe('顧客対応力');
    expect(CANONICAL_AXES[2]).toBe('プレゼン力');
    expect(CANONICAL_AXES[3]).toBe('交渉力');
    expect(CANONICAL_AXES[4]).toBe('顧客管理力');
  });

  it('SCORE_MIN=1, SCORE_MAX=5', () => {
    expect(SCORE_MIN).toBe(1);
    expect(SCORE_MAX).toBe(5);
  });

  it('default team has 3 members matching the reference design', () => {
    expect(DEFAULT_TEAM_RADAR.members).toHaveLength(3);
    expect(DEFAULT_TEAM_RADAR.members[0]!.name).toBe('森田 拓也');
    expect(DEFAULT_TEAM_RADAR.members[1]!.name).toBe('葛西 美保');
    expect(DEFAULT_TEAM_RADAR.members[2]!.name).toBe('市村 紗良');
    expect(DEFAULT_TEAM_RADAR.department).toBe('営業部');
    expect(DEFAULT_TEAM_RADAR.evaluatedAt).toBe('2035-04-15');
  });
});

// --- isValidScore / isValidMemberId -----------------------------------

describe('isValidScore', () => {
  it('accepts integer 1..5 inclusive', () => {
    for (let i = 1; i <= 5; i++) expect(isValidScore(i)).toBe(true);
  });
  it('rejects values outside 1..5 (boundary 0 and 6)', () => {
    expect(isValidScore(0)).toBe(false);
    expect(isValidScore(6)).toBe(false);
  });
  it('rejects non-integer / non-number values', () => {
    expect(isValidScore(2.5)).toBe(false);
    expect(isValidScore('3')).toBe(false);
    expect(isValidScore(null)).toBe(false);
    expect(isValidScore(undefined)).toBe(false);
    expect(isValidScore(Number.NaN)).toBe(false);
    expect(isValidScore(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('isValidMemberId', () => {
  it('accepts kebab-case ids', () => {
    expect(isValidMemberId('morita-takuya')).toBe(true);
    expect(isValidMemberId('m1')).toBe(true);
    expect(isValidMemberId('abc-123')).toBe(true);
  });
  it('rejects uppercase / spaces / leading hyphen / empty', () => {
    expect(isValidMemberId('Morita')).toBe(false);
    expect(isValidMemberId('m m')).toBe(false);
    expect(isValidMemberId('-x')).toBe(false);
    expect(isValidMemberId('')).toBe(false);
  });
  it('rejects non-string', () => {
    expect(isValidMemberId(42)).toBe(false);
    expect(isValidMemberId(null)).toBe(false);
  });
  it('rejects > 64 chars', () => {
    expect(isValidMemberId('a' + '-b'.repeat(40))).toBe(false);
  });
});

// --- validateMembers ---------------------------------------------------

describe('validateMembers', () => {
  function good(): TeamMember {
    return { id: 'm1', name: 'Name', scores: [1, 2, 3, 4, 5] };
  }

  it('accepts a well-formed array', () => {
    const out = validateMembers([good(), { id: 'm2', name: 'X', scores: [3, 3, 3, 3, 3] }]);
    expect(out).toHaveLength(2);
  });

  it('rejects non-array', () => {
    expect(() => validateMembers(null)).toThrow(/must be an array/);
    expect(() => validateMembers({})).toThrow(/must be an array/);
  });

  it('rejects > 50 members', () => {
    const big = Array.from({ length: 51 }, (_, i) => ({ id: 'm' + i, name: 'x', scores: [1, 1, 1, 1, 1] }));
    expect(() => validateMembers(big)).toThrow(/exceeds 50/);
  });

  it('rejects null entry inside array', () => {
    expect(() => validateMembers([null])).toThrow(/not an object/);
  });

  it('rejects invalid id', () => {
    expect(() => validateMembers([{ ...good(), id: 'BAD' }])).toThrow(/id is invalid/);
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      validateMembers([good(), { ...good(), name: 'Other' }]),
    ).toThrow(/duplicate member id/);
  });

  it('rejects empty / oversize / non-string name', () => {
    expect(() => validateMembers([{ ...good(), name: '' }])).toThrow(/name must be/);
    expect(() => validateMembers([{ ...good(), name: 'x'.repeat(65) }])).toThrow(/name must be/);
    expect(() => validateMembers([{ ...good(), name: 42 }])).toThrow(/name must be/);
  });

  it('rejects scores not array / wrong length', () => {
    expect(() => validateMembers([{ ...good(), scores: 'x' }])).toThrow(/scores must be an array/);
    expect(() => validateMembers([{ ...good(), scores: [1, 2, 3] }])).toThrow(/array of length 5/);
    expect(() => validateMembers([{ ...good(), scores: [1, 2, 3, 4, 5, 6] }])).toThrow(/array of length 5/);
  });

  it('rejects out-of-range score', () => {
    expect(() => validateMembers([{ ...good(), scores: [1, 2, 3, 4, 6] }])).toThrow(/score must be integer/);
    expect(() => validateMembers([{ ...good(), scores: [0, 2, 3, 4, 5] }])).toThrow(/score must be integer/);
  });

  it('accepts notes with valid keys 0..4', () => {
    const out = validateMembers([{ ...good(), notes: { 0: 'note0', 4: 'note4' } }]);
    expect(out[0]!.notes).toEqual({ 0: 'note0', 4: 'note4' });
  });

  it('rejects notes object with non-object', () => {
    expect(() => validateMembers([{ ...good(), notes: null }])).toThrow(/notes must be an object/);
    expect(() => validateMembers([{ ...good(), notes: 'x' }])).toThrow(/notes must be an object/);
  });

  it('rejects note key outside 0..4', () => {
    expect(() => validateMembers([{ ...good(), notes: { 5: 'x' } }])).toThrow(/note key must be/);
    expect(() => validateMembers([{ ...good(), notes: { '-1': 'x' } }])).toThrow(/note key must be/);
    expect(() => validateMembers([{ ...good(), notes: { abc: 'x' } }])).toThrow(/note key must be/);
  });

  it('rejects oversized note value (> 200 chars)', () => {
    expect(() =>
      validateMembers([{ ...good(), notes: { 0: 'x'.repeat(201) } }]),
    ).toThrow(/note value must be/);
    expect(() =>
      validateMembers([{ ...good(), notes: { 0: 42 } }]),
    ).toThrow(/note value must be/);
  });

  it('accepts member without notes field', () => {
    const out = validateMembers([good()]);
    expect(out[0]!.notes).toBeUndefined();
  });
});

// --- colorFor + escapeXml + axisPoint ----------------------------------

describe('colorFor', () => {
  it('returns a stable color for index 0', () => {
    expect(colorFor(0).stroke).toBe('#5b8def');
  });
  it('wraps around the palette', () => {
    expect(colorFor(0)).toEqual(colorFor(8));
    expect(colorFor(1)).toEqual(colorFor(9));
  });
  it('handles negative indices', () => {
    expect(colorFor(-1)).toEqual(colorFor(7));
  });
});

describe('escapeXml', () => {
  it('escapes all 5 reserved characters', () => {
    expect(escapeXml('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
  it('passes plain unicode through', () => {
    expect(escapeXml('森田 拓也')).toBe('森田 拓也');
  });
});

describe('axisPoint', () => {
  it('axis 0 with full score points straight up (cy - radius)', () => {
    const p = axisPoint(100, 100, 50, 0, 5, 5);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it('axis 0 with score 0 is at center', () => {
    const p = axisPoint(100, 100, 50, 0, 5, 0);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });

  it('scales radius linearly with score', () => {
    const p2 = axisPoint(100, 100, 50, 0, 5, 2);
    expect(p2.y).toBeCloseTo(100 - (2 / 5) * 50, 5);
  });
});

// --- renderTeamRadarSvg ------------------------------------------------

describe('renderTeamRadarSvg', () => {
  it('emits a valid SVG with XML declaration', () => {
    const svg = renderTeamRadarSvg(DEFAULT_TEAM_RADAR);
    expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
  });

  it('includes each member name in the legend', () => {
    const svg = renderTeamRadarSvg(DEFAULT_TEAM_RADAR);
    expect(svg).toContain('森田 拓也');
    expect(svg).toContain('葛西 美保');
    expect(svg).toContain('市村 紗良');
  });

  it('includes each axis label', () => {
    const svg = renderTeamRadarSvg(DEFAULT_TEAM_RADAR);
    for (const axis of CANONICAL_AXES) {
      expect(svg).toContain(axis);
    }
  });

  it('produces one <polygon> per member (plus ring polygons)', () => {
    const svg = renderTeamRadarSvg(DEFAULT_TEAM_RADAR);
    const polygons = svg.match(/<polygon /g) ?? [];
    // 5 rings + 3 members = 8 polygons
    expect(polygons).toHaveLength(8);
  });

  it('escapes member names that contain HTML-significant characters', () => {
    const dangerous = {
      ...DEFAULT_TEAM_RADAR,
      members: [
        { id: 'x', name: '<script>alert("x")</script>', scores: [1, 1, 1, 1, 1] },
      ],
    };
    const svg = renderTeamRadarSvg(dangerous);
    expect(svg).not.toContain('<script>alert');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('honors custom title via options', () => {
    const svg = renderTeamRadarSvg(DEFAULT_TEAM_RADAR, { title: 'カスタムタイトル' });
    expect(svg).toContain('カスタムタイトル');
  });

  it('includes the dept + evaluatedAt header', () => {
    const svg = renderTeamRadarSvg(DEFAULT_TEAM_RADAR);
    expect(svg).toContain('部署: 営業部');
    expect(svg).toContain('評価時点: 2035-04-15');
  });

  it('escapes axis labels too (defense in depth)', () => {
    const tampered = {
      ...DEFAULT_TEAM_RADAR,
      axes: ['<x>', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'] as readonly string[],
    };
    const svg = renderTeamRadarSvg(tampered as typeof DEFAULT_TEAM_RADAR);
    expect(svg).toContain('&lt;x&gt;');
    expect(svg).not.toMatch(/<text[^>]*><x><\/text>/);
  });
});

// --- State persistence ------------------------------------------------

describe('defaultStatePath', () => {
  it('points under ~/.local/business-hub', () => {
    expect(defaultStatePath()).toBe(
      path.join(os.homedir(), '.local', 'business-hub', 'team-radar.json'),
    );
  });
});

describe('loadTeamRadarState', () => {
  it('returns defaults when file is missing', async () => {
    const state = await loadTeamRadarState({
      readFile: async () => {
        throw new Error('ENOENT');
      },
    });
    expect(state.department).toBe(DEFAULT_TEAM_RADAR.department);
    expect(state.members).toHaveLength(3);
  });

  it('returns defaults on malformed JSON', async () => {
    const state = await loadTeamRadarState({
      readFile: async () => 'not-json{',
    });
    expect(state.department).toBe(DEFAULT_TEAM_RADAR.department);
  });

  it('returns defaults when root is not an object', async () => {
    const state = await loadTeamRadarState({
      readFile: async () => JSON.stringify('hello'),
    });
    expect(state.department).toBe(DEFAULT_TEAM_RADAR.department);
  });

  it('loads a valid state file', async () => {
    const raw = JSON.stringify({
      department: '開発部',
      evaluatedAt: '2030-01-01',
      members: [{ id: 'a', name: 'A', scores: [1, 2, 3, 4, 5] }],
    });
    const state = await loadTeamRadarState({ readFile: async () => raw });
    expect(state.department).toBe('開発部');
    expect(state.evaluatedAt).toBe('2030-01-01');
    expect(state.members).toHaveLength(1);
  });

  it('falls back to "営業部" when department field is empty/missing', async () => {
    const raw = JSON.stringify({ members: [] });
    const state = await loadTeamRadarState({ readFile: async () => raw });
    expect(state.department).toBe('営業部');
  });

  it('truncates oversize department string at 64 chars', async () => {
    const raw = JSON.stringify({
      department: 'x'.repeat(200),
      evaluatedAt: '2030-01-01',
      members: [],
    });
    const state = await loadTeamRadarState({ readFile: async () => raw });
    expect(state.department).toHaveLength(64);
  });

  it('returns defaults when members payload fails validation', async () => {
    const raw = JSON.stringify({
      department: 'X',
      evaluatedAt: '2030-01-01',
      members: [{ id: 'BAD', name: 'Y', scores: [1, 2, 3, 4, 5] }],
    });
    const state = await loadTeamRadarState({ readFile: async () => raw });
    // Validation throws → caught → defaults returned
    expect(state.department).toBe(DEFAULT_TEAM_RADAR.department);
  });

  it('uses the custom statePath when provided', async () => {
    const captured: string[] = [];
    const state = await loadTeamRadarState({
      statePath: () => '/tmp/x.json',
      readFile: async (p) => {
        captured.push(p);
        throw new Error('boom');
      },
    });
    expect(captured).toEqual(['/tmp/x.json']);
    expect(state.department).toBe(DEFAULT_TEAM_RADAR.department);
  });
});

describe('saveTeamRadarState', () => {
  it('writes valid state atomically (tmp + rename)', async () => {
    const writes: { path: string; content: string }[] = [];
    let renamed: { from: string; to: string } | null = null;
    const mkdirs: string[] = [];
    await saveTeamRadarState(
      { department: '営業部', evaluatedAt: '2030-01-01', members: [{ id: 'a', name: 'A', scores: [1, 2, 3, 4, 5] }] },
      {
        statePath: () => '/tmp/team-radar.json',
        writeFile: async (p, c) => {
          writes.push({ path: p, content: c });
        },
        mkdir: async (p) => {
          mkdirs.push(p);
        },
        rename: async (a, b) => {
          renamed = { from: a, to: b };
        },
      },
    );
    expect(mkdirs).toEqual(['/tmp']);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe('/tmp/team-radar.json.tmp');
    expect(renamed).toEqual({ from: '/tmp/team-radar.json.tmp', to: '/tmp/team-radar.json' });
    // Round-trip the content
    const parsed = JSON.parse(writes[0]!.content) as TeamRadarState;
    expect(parsed.department).toBe('営業部');
  });

  it('rejects invalid department / evaluatedAt before writing', async () => {
    const writes: string[] = [];
    const deps = {
      writeFile: async (p: string) => {
        writes.push(p);
      },
      mkdir: async () => undefined,
      rename: async () => undefined,
    };
    await expect(
      saveTeamRadarState({ department: '', evaluatedAt: '2030', members: [] }, deps),
    ).rejects.toThrow(/department/);
    await expect(
      saveTeamRadarState({ department: 'X', evaluatedAt: '', members: [] }, deps),
    ).rejects.toThrow(/evaluatedAt/);
    expect(writes).toEqual([]);
  });

  it('rejects bad member payload before writing (validates first)', async () => {
    const writes: string[] = [];
    await expect(
      saveTeamRadarState(
        { department: 'X', evaluatedAt: '2030', members: [{ id: 'BAD', name: 'Y', scores: [1, 2, 3, 4, 5] }] },
        {
          writeFile: async (p) => {
            writes.push(p);
          },
          mkdir: async () => undefined,
          rename: async () => undefined,
        },
      ),
    ).rejects.toThrow(/id is invalid/);
    expect(writes).toEqual([]);
  });
});

// --- fetchTeamRadarSnapshot -------------------------------------------

describe('fetchTeamRadarSnapshot', () => {
  it('returns the loaded state with isMock=true and canonical axes', async () => {
    const snap = await fetchTeamRadarSnapshotImpl(
      { token: '' },
      {
        loadState: async () => ({
          department: '開発部',
          evaluatedAt: '2030-01-01',
          members: [{ id: 'a', name: 'A', scores: [1, 2, 3, 4, 5] }],
        }),
      },
    );
    expect(snap.department).toBe('開発部');
    expect(snap.axes).toEqual(CANONICAL_AXES);
    expect(snap.members).toHaveLength(1);
    expect(snap.isMock).toBe(true);
  });

  it('production wrapper delegates to impl', async () => {
    const snap = await fetchTeamRadarSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
    expect(snap.axes).toEqual(CANONICAL_AXES);
  });
});

// --- SVG export path safety + impl ------------------------------------

describe('defaultSvgExportPath', () => {
  it('points to ~/.local/business-hub/data/team-radar.svg', () => {
    expect(defaultSvgExportPath()).toBe(
      path.join(os.homedir(), '.local', 'business-hub', 'data', 'team-radar.svg'),
    );
  });
});

describe('isSafeSvgExportPath', () => {
  const home = '/home/user';
  it('accepts a .svg in home', () => {
    expect(isSafeSvgExportPath('/home/user/x.svg', home)).toBe(true);
  });
  it('rejects non-string / empty / oversized', () => {
    expect(isSafeSvgExportPath(42 as unknown as string, home)).toBe(false);
    expect(isSafeSvgExportPath('', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/' + 'x'.repeat(2000) + '.svg', home)).toBe(false);
  });
  it('rejects control characters', () => {
    expect(isSafeSvgExportPath('/home/user/x\0.svg', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/x\n.svg', home)).toBe(false);
  });
  it('rejects wrong extension', () => {
    expect(isSafeSvgExportPath('/home/user/x.png', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/x.html', home)).toBe(false);
  });
  it('rejects outside-home paths', () => {
    expect(isSafeSvgExportPath('/etc/x.svg', home)).toBe(false);
    expect(isSafeSvgExportPath('/home/user/../etc/x.svg', home)).toBe(false);
  });
});

describe('exportTeamRadarSvgImpl', () => {
  const fakeSnap = {
    department: '営業部',
    evaluatedAt: '2030-01-01',
    axes: CANONICAL_AXES,
    members: [{ id: 'a', name: 'A', scores: [1, 2, 3, 4, 5] as number[] }],
    fetchedAt: 'x',
    isMock: true,
  };

  it('writes SVG to the default path when none provided', async () => {
    const writes: { path: string; content: string }[] = [];
    const mkdirs: string[] = [];
    const result = await exportTeamRadarSvgImpl(
      { token: '', payload: {} },
      {
        fetchSnapshot: async () => fakeSnap,
        writeFile: async (p, c) => {
          writes.push({ path: p, content: c });
        },
        mkdir: async (p) => {
          mkdirs.push(p);
        },
        now: () => new Date('2030-01-01T00:00:00.000Z'),
      },
    );
    expect(result.path).toBe(defaultSvgExportPath());
    expect(writes).toHaveLength(1);
    expect(writes[0]!.content).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(result.bytes).toBe(Buffer.byteLength(writes[0]!.content, 'utf8'));
    expect(result.generatedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(mkdirs).toEqual([path.dirname(defaultSvgExportPath())]);
  });

  it('uses a custom title when provided', async () => {
    let svg = '';
    await exportTeamRadarSvgImpl(
      { token: '', payload: { title: '私のチーム' } },
      {
        fetchSnapshot: async () => fakeSnap,
        writeFile: async (_p, c) => {
          svg = c;
        },
        mkdir: async () => undefined,
        now: () => new Date('2030-01-01T00:00:00.000Z'),
      },
    );
    expect(svg).toContain('私のチーム');
  });

  it('throws when custom path is outside home', async () => {
    await expect(
      exportTeamRadarSvgImpl(
        { token: '', payload: { path: '/etc/x.svg' } },
        {
          fetchSnapshot: async () => fakeSnap,
          writeFile: async () => undefined,
          mkdir: async () => undefined,
        },
      ),
    ).rejects.toThrow(/must be a \.svg file under the user home directory/);
  });

  it('throws when custom path has wrong extension', async () => {
    await expect(
      exportTeamRadarSvgImpl(
        { token: '', payload: { path: path.join(os.homedir(), 'x.png') } },
        {
          fetchSnapshot: async () => fakeSnap,
          writeFile: async () => undefined,
          mkdir: async () => undefined,
        },
      ),
    ).rejects.toThrow(/must be a \.svg file/);
  });

  it('falls back to default title when title is empty / oversize / non-string', async () => {
    let svg = '';
    await exportTeamRadarSvgImpl(
      { token: '', payload: { title: '' } },
      {
        fetchSnapshot: async () => fakeSnap,
        writeFile: async (_p, c) => {
          svg = c;
        },
        mkdir: async () => undefined,
        now: () => new Date('2030-01-01T00:00:00.000Z'),
      },
    );
    expect(svg).toContain('チームレーダーチャート');
    await exportTeamRadarSvgImpl(
      { token: '', payload: { title: 'x'.repeat(121) } },
      {
        fetchSnapshot: async () => fakeSnap,
        writeFile: async (_p, c) => {
          svg = c;
        },
        mkdir: async () => undefined,
        now: () => new Date('2030-01-01T00:00:00.000Z'),
      },
    );
    expect(svg).toContain('チームレーダーチャート');
  });
});

// --- saveTeamRadarStateImpl + ACTIONS ---------------------------------

describe('saveTeamRadarStateImpl', () => {
  it('validates + saves via injected deps', async () => {
    const writes: string[] = [];
    const result = await saveTeamRadarStateImpl(
      {
        token: '',
        payload: {
          department: '営業部',
          evaluatedAt: '2030-01-01',
          members: [{ id: 'a', name: 'A', scores: [1, 2, 3, 4, 5] }],
        },
      },
      {
        statePath: () => '/tmp/team-radar.json',
        writeFile: async (p) => {
          writes.push(p);
        },
        mkdir: async () => undefined,
        rename: async () => undefined,
      },
    );
    expect(result.department).toBe('営業部');
    expect(writes[0]).toBe('/tmp/team-radar.json.tmp');
  });

  it('rejects bad department / evaluatedAt before saving', async () => {
    const writes: string[] = [];
    const deps = {
      writeFile: async (p: string) => {
        writes.push(p);
      },
      mkdir: async () => undefined,
      rename: async () => undefined,
    };
    await expect(
      saveTeamRadarStateImpl(
        { token: '', payload: { department: '', evaluatedAt: '2030', members: [] } },
        deps,
      ),
    ).rejects.toThrow(/department/);
    await expect(
      saveTeamRadarStateImpl(
        { token: '', payload: { department: 'X', evaluatedAt: '', members: [] } },
        deps,
      ),
    ).rejects.toThrow(/evaluatedAt/);
    expect(writes).toEqual([]);
  });
});

describe('ACTIONS', () => {
  it('exposes save-state and export-svg', () => {
    expect(typeof ACTIONS['save-state']).toBe('function');
    expect(typeof ACTIONS['export-svg']).toBe('function');
  });
});
