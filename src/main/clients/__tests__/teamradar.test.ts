import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
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
    expect(isSafeSvgExportPath('/home/user/.local/business-hub/data/x.svg', home)).toBe(true);
    expect(isSafeSvgExportPath('/home/user/x.svg', home)).toBe(false); // outside export root
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

  it('.svg 以外の拡張子を拒む（ラッパーの役目は拡張子の固定）', () => {
    const home = '/home/user';
    const root = '/home/user/.local/business-hub/data/';
    // 中身が SVG でも、書き出し先が別の拡張子なら通さない。
    expect(isSafeSvgExportPath(root + 'x.html', home)).toBe(false);
    expect(isSafeSvgExportPath(root + 'x.sh', home)).toBe(false);
    expect(isSafeSvgExportPath(root + 'x', home)).toBe(false);
    expect(isSafeSvgExportPath(root + 'x.svg.txt', home)).toBe(false);
    // 正しい拡張子は通る（上の否定が「何でも false」でないことの確認）
    expect(isSafeSvgExportPath(root + 'x.svg', home)).toBe(true);
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

// --- 入力の長さの境界 --------------------------------------------------
//
// どれも「ちょうど」が通るか弾かれるかで決まる。境界がずれても画面は
// 動くので、入力欄で気付くことはない。

const member = (over: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id: 'm1',
  name: '田中',
  scores: Array.from({ length: AXIS_COUNT }, () => 3),
  ...over,
});

describe('validateMembers — 長さの境界', () => {
  it('人数はちょうど 50 まで通し、51 で弾く', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => member({ id: `m${i}` }));
    expect(validateMembers(many(50))).toHaveLength(50);
    expect(() => validateMembers(many(51))).toThrow('members exceeds 50');
  });

  it('氏名はちょうど 64 文字まで通し、65 で弾く', () => {
    expect(validateMembers([member({ name: 'あ'.repeat(64) })])).toHaveLength(1);
    expect(() => validateMembers([member({ name: 'あ'.repeat(65) })])).toThrow();
  });

  it('メモはちょうど 200 文字まで通し、201 で弾く', () => {
    const withNote = (len: number) => [member({ notes: { 0: 'あ'.repeat(len) } })];
    expect(validateMembers(withNote(200))).toHaveLength(1);
    expect(() => validateMembers(withNote(201))).toThrow();
  });

  it('メモの軸番号は 0 から AXIS_COUNT-1 まで', () => {
    expect(validateMembers([member({ notes: { [AXIS_COUNT - 1]: 'ok' } })])).toHaveLength(1);
    expect(() => validateMembers([member({ notes: { [AXIS_COUNT]: 'ng' } })])).toThrow(
      `note key must be 0-${AXIS_COUNT - 1}`,
    );
  });

  it('要素がオブジェクトでなければ弾く（理由も添える）', () => {
    expect(() => validateMembers(['もじれつ'])).toThrow();
    expect(() => validateMembers([null])).toThrow();
    expect(() => validateMembers([42])).toThrow();
  });

  it('id が不正・重複していれば、どちらか分かる形で弾く', () => {
    expect(() => validateMembers([member({ id: '' })])).toThrow('member id is invalid');
    expect(() => validateMembers([member({ id: 'a' }), member({ id: 'a' })])).toThrow(
      'duplicate member id: a',
    );
  });

  it('id と氏名をそのまま持ち越す（取り違えない）', () => {
    const out = validateMembers([member({ id: 'x9', name: '佐藤' })]);
    expect(out[0]).toMatchObject({ id: 'x9', name: '佐藤' });
  });
});

describe('isValidScore — 型と範囲', () => {
  it('整数かつ範囲内だけを通す', () => {
    expect(isValidScore(SCORE_MIN)).toBe(true);
    expect(isValidScore(SCORE_MAX)).toBe(true);
    expect(isValidScore(SCORE_MIN - 1)).toBe(false);
    expect(isValidScore(SCORE_MAX + 1)).toBe(false);
    // 整数でない・数値でないものも弾く (画面から来る値は文字列のことがある)
    expect(isValidScore(3.5)).toBe(false);
    expect(isValidScore('3' as unknown as number)).toBe(false);
    expect(isValidScore(NaN)).toBe(false);
  });
});

describe('colorFor — 色の割り当て', () => {
  it('人数がパレットを超えても先頭から巡回する', () => {
    const first = colorFor(0);
    expect(colorFor(1)).not.toBe(first);
    // 剰余で巡回する。掛け算などに変わると 0 番だけを返し続ける。
    const cycle = [0, 1, 2].map(colorFor);
    expect(new Set(cycle).size).toBe(3);
    expect(colorFor(2)).not.toBe(colorFor(1));
  });
});

// --- 保存されている状態の読み込み --------------------------------------

describe('loadTeamRadarState — 壊れた保存内容', () => {
  const load = (raw: string) =>
    loadTeamRadarState({ statePath: () => '/x.json', readFile: () => Promise.resolve(raw) });

  it('オブジェクトでない JSON は既定値に落とす', async () => {
    for (const raw of ['null', '42', '"str"', '[1,2]']) {
      const s = await load(raw);
      // 配列は typeof 'object' なので通るが、members が無いので空になる
      expect(typeof s.department).toBe('string');
      expect(s.department.length).toBeGreaterThan(0);
    }
    expect((await load('null')).department).toBe(DEFAULT_TEAM_RADAR.department);
  });

  it('読めない JSON は既定値に落とす', async () => {
    const s = await load('not json');
    expect(s).toEqual({
      department: DEFAULT_TEAM_RADAR.department,
      evaluatedAt: DEFAULT_TEAM_RADAR.evaluatedAt,
      members: DEFAULT_TEAM_RADAR.members,
    });
  });

  it('部署名が空・文字列でなければ既定の部署名を使う', async () => {
    for (const dept of ['""', '123', 'null']) {
      const s = await load(`{"department":${dept},"evaluatedAt":"2026-05-01","members":[]}`);
      expect(s.department).toBe('営業部');
    }
  });

  it('部署名は 64 文字で切り、評価日は 32 文字で切る', async () => {
    const s = await load(
      JSON.stringify({ department: 'あ'.repeat(80), evaluatedAt: 'い'.repeat(40), members: [] }),
    );
    expect(s.department).toHaveLength(64);
    expect(s.evaluatedAt).toHaveLength(32);
  });

  it('評価日が空・文字列でなければ今日 (YYYY-MM-DD) を使う', async () => {
    const s = await load('{"department":"開発部","evaluatedAt":"","members":[]}');
    expect(s.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.evaluatedAt).toBe(new Date().toISOString().slice(0, 10));
  });

  it('members が無ければ空として読む', async () => {
    const s = await load('{"department":"開発部","evaluatedAt":"2026-05-01"}');
    expect(s.members).toEqual([]);
  });
});

// --- 保存前の検査 ------------------------------------------------------

describe('saveTeamRadarState / saveTeamRadarStateImpl — 保存前に弾く', () => {
  const deps = {
    statePath: () => '/x.json',
    mkdir: async () => {},
    writeFile: async () => {},
    rename: async () => {},
  };
  const okState = (over: Partial<TeamRadarState> = {}): TeamRadarState => ({
    department: '営業部',
    evaluatedAt: '2026-05-01',
    members: [],
    ...over,
  });

  it('部署名はちょうど 64 文字まで通し、0 と 65 で弾く', async () => {
    await expect(saveTeamRadarState(okState({ department: 'あ'.repeat(64) }), deps)).resolves.toBeUndefined();
    await expect(saveTeamRadarState(okState({ department: '' }), deps)).rejects.toThrow(
      'department must be a 1-64 char string',
    );
    await expect(saveTeamRadarState(okState({ department: 'あ'.repeat(65) }), deps)).rejects.toThrow();
    await expect(
      saveTeamRadarState(okState({ department: 1 as unknown as string }), deps),
    ).rejects.toThrow();
  });

  it('評価日はちょうど 32 文字まで通し、0 と 33 で弾く', async () => {
    await expect(saveTeamRadarState(okState({ evaluatedAt: 'い'.repeat(32) }), deps)).resolves.toBeUndefined();
    await expect(saveTeamRadarState(okState({ evaluatedAt: '' }), deps)).rejects.toThrow(
      'evaluatedAt must be a 1-32 char string',
    );
    await expect(saveTeamRadarState(okState({ evaluatedAt: 'い'.repeat(33) }), deps)).rejects.toThrow();
    await expect(
      saveTeamRadarState(okState({ evaluatedAt: 1 as unknown as string }), deps),
    ).rejects.toThrow();
  });

  it('action 側も同じ境界で弾く（画面から来る値の入口）', async () => {
    const call = (payload: Record<string, unknown>) =>
      saveTeamRadarStateImpl({ token: '', payload }, deps);

    await expect(call({ department: 'あ'.repeat(64), evaluatedAt: '2026-05-01' })).resolves.toMatchObject({
      department: 'あ'.repeat(64),
    });
    for (const bad of ['', 'あ'.repeat(65), 1, null, undefined]) {
      await expect(call({ department: bad, evaluatedAt: '2026-05-01' })).rejects.toThrow(
        'department must be a 1-64 char string',
      );
    }
    for (const bad of ['', 'い'.repeat(33), 1, null, undefined]) {
      await expect(call({ department: '営業部', evaluatedAt: bad })).rejects.toThrow(
        'evaluatedAt must be a 1-32 char string',
      );
    }
  });

  it('members を渡さなければ空として保存する', async () => {
    const r = await saveTeamRadarStateImpl(
      { token: '', payload: { department: '営業部', evaluatedAt: '2026-05-01' } },
      deps,
    );
    expect(r.members).toEqual([]);
  });
});

describe('teamradar — 残りの分岐', () => {
  it('要素がオブジェクトでない理由を文言で伝える', () => {
    expect(() => validateMembers([null])).toThrow('member entry is not an object');
    expect(() => validateMembers(['x'])).toThrow('member entry is not an object');
  });

  it('メモ付きの要素でも id と氏名を取り違えない', () => {
    const out = validateMembers([
      { id: 'z1', name: '鈴木', scores: Array.from({ length: AXIS_COUNT }, () => 4), notes: { 0: 'メモ' } },
    ]);
    expect(out[0]).toMatchObject({ id: 'z1', name: '鈴木' });
    expect(out[0]!.notes).toEqual({ 0: 'メモ' });
  });
});

describe('exportTeamRadarSvgImpl — 経路と題名', () => {
  const deps = {
    fetchSnapshot: undefined as unknown as undefined,
    writeFile: async () => {},
    mkdir: async () => {},
    now: () => new Date('2035-05-15T00:00:00.000Z'),
  };

  it('path が無い・空・文字列でなければ既定の書き出し先を使う', async () => {
    for (const p of [undefined, '', 123, null]) {
      const r = await exportTeamRadarSvgImpl({ token: '', payload: { path: p } }, deps);
      expect(r.path).toBe(defaultSvgExportPath());
    }
  });

  it('取得には呼び出し元の token と fetch をそのまま渡す', async () => {
    const seen: { token?: string; hasFetch?: boolean }[] = [];
    const fetchFn = (() => Promise.resolve(new Response(''))) as unknown as typeof fetch;
    await exportTeamRadarSvgImpl(
      { token: 'tok-1', fetch: fetchFn, payload: {} },
      {
        ...deps,
        fetchSnapshot: async (c) => {
          seen.push({ token: c.token, hasFetch: c.fetch !== undefined });
          return fetchTeamRadarSnapshotImpl(c);
        },
      },
    );
    // 空のオブジェクトを渡すと、認証の要る取得へ差し替えたときに黙って失敗する。
    expect(seen).toEqual([{ token: 'tok-1', hasFetch: true }]);
  });

  it('題名はちょうど 120 文字まで採用し、121 文字なら既定に戻す', async () => {
    const write: string[] = [];
    const d = { ...deps, writeFile: async (_p: string, c: string) => { write.push(c); } };

    await exportTeamRadarSvgImpl({ token: '', payload: { title: 'あ'.repeat(120) } }, d);
    expect(write[0]).toContain('あ'.repeat(120));

    await exportTeamRadarSvgImpl({ token: '', payload: { title: 'あ'.repeat(121) } }, d);
    expect(write[1]).toContain('チームレーダーチャート');
    expect(write[1]).not.toContain('あ'.repeat(121));
  });

  it('題名が空・文字列でなければ既定を使う', async () => {
    const write: string[] = [];
    const d = { ...deps, writeFile: async (_p: string, c: string) => { write.push(c); } };
    for (const t of ['', 42, null, undefined]) {
      await exportTeamRadarSvgImpl({ token: '', payload: { title: t } }, d);
    }
    for (const c of write) expect(c).toContain('チームレーダーチャート');
  });
});

// --- 図の構造 ----------------------------------------------------------
//
// 座標の数値は「そこに置くと収まりが良い」以上の意味を持たないので測らない。
// 一方で**何が何本描かれるか**は意味がある — 目盛りの輪が 4 本しか無い、
// 軸が 1 本足りない、人が 1 人描かれない、はどれも図として間違いだが、
// SVG は壊れないので目視でしか気付けない。

describe('renderTeamRadarSvg — 図の構造', () => {
  const snap = (members: TeamMember[]) => ({
    department: '開発部',
    evaluatedAt: '2026-05-01',
    axes: CANONICAL_AXES,
    members,
    fetchedAt: '2035-05-15T00:00:00.000Z',
    isMock: true,
  });
  const mem = (id: string, name: string, scores: number[]): TeamMember =>
    ({ id, name, scores } as TeamMember);
  const count = (svg: string, re: RegExp) => svg.match(re)?.length ?? 0;

  it('目盛りの輪は満点ぶん (SCORE_MAX 本) 描き、それぞれに数字を振る', () => {
    const svg = renderTeamRadarSvg(snap([]));
    expect(count(svg, /<polygon [^>]*stroke-dasharray/g)).toBe(SCORE_MAX);
    for (let lvl = SCORE_MIN; lvl <= SCORE_MAX; lvl++) {
      expect(svg).toContain(`text-anchor="start">${lvl}</text>`);
    }
    // 0 や SCORE_MAX+1 の輪は描かない
    expect(svg).not.toContain(`text-anchor="start">0</text>`);
    expect(svg).not.toContain(`text-anchor="start">${SCORE_MAX + 1}</text>`);
  });

  it('軸は本数ぶん引き、すべての軸名を出す', () => {
    const svg = renderTeamRadarSvg(snap([]));
    expect(count(svg, /<line /g)).toBe(CANONICAL_AXES.length);
    for (const axis of CANONICAL_AXES) expect(svg).toContain(axis);
  });

  it('人数ぶんの多角形・頂点の丸・凡例を描く', () => {
    const members = [
      mem('a', '田中', [5, 4, 3, 2, 1]),
      mem('b', '佐藤', [1, 2, 3, 4, 5]),
    ];
    const svg = renderTeamRadarSvg(snap(members));

    // 輪 (SCORE_MAX) + 人数ぶんの多角形
    expect(count(svg, /<polygon /g)).toBe(SCORE_MAX + members.length);
    // 頂点の丸 (人数 × 軸数) + 凡例の丸 (人数)
    expect(count(svg, /<circle /g)).toBe(members.length * CANONICAL_AXES.length + members.length);
    for (const m of members) expect(svg).toContain(m.name);
  });

  it('人が 0 人でも図として成立する', () => {
    const svg = renderTeamRadarSvg(snap([]));
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(count(svg, /<polygon /g)).toBe(SCORE_MAX); // 輪だけ
  });

  it('部署名・評価時点・題名を図の中に書く', () => {
    const svg = renderTeamRadarSvg(snap([]), { title: '第 2 四半期' });
    expect(svg).toContain('開発部');
    expect(svg).toContain('2026-05-01');
    expect(svg).toContain('第 2 四半期');
    // 題名を渡さなければ既定
    expect(renderTeamRadarSvg(snap([]))).toContain('チームレーダーチャート');
  });

  it('寸法は指定を反映し、viewBox と一致させる', () => {
    const svg = renderTeamRadarSvg(snap([]), { width: 400, height: 300 });
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="300"');
    expect(svg).toContain('viewBox="0 0 400 300"');
  });

  it('外部を読み込まない・スクリプトを含まない (Canva へ持ち込める形)', () => {
    const svg = renderTeamRadarSvg(snap([mem('a', '田中', [5, 5, 5, 5, 5])]), {
      title: '<script>alert(1)</script>',
    });
    expect(svg).not.toContain('<script');
    expect(svg).not.toMatch(/xlink:href|<image|<use\b|url\(/);
    // http:// が出るのは SVG の名前空間 (取得先ではない) の 1 回だけ
    expect(svg.match(/https?:\/\//g)).toEqual(['http://']);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // 題名も本文もエスケープして差し込む
    expect(svg).toContain('&lt;script&gt;');
  });

  it('スコアが欠けている軸は 0 として描く (落ちない)', () => {
    const svg = renderTeamRadarSvg(snap([mem('a', '田中', [5, 5])]));
    expect(count(svg, /<circle /g)).toBe(CANONICAL_AXES.length + 1);
    expect(svg).toContain('田中');
  });
});

describe('renderTeamRadarSvg — 形そのもの', () => {
  const snap = (members: TeamMember[]) => ({
    department: '開発部',
    evaluatedAt: '2026-05-01',
    axes: CANONICAL_AXES,
    members,
    fetchedAt: '2035-05-15T00:00:00.000Z',
    isMock: true,
  });
  const mem = (id: string, name: string, scores: number[]): TeamMember =>
    ({ id, name, scores } as TeamMember);
  const pointsOf = (svg: string): string[][] =>
    [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1]!.split(' '));

  it('多角形の頂点は軸の数だけある (輪も人も)', () => {
    const svg = renderTeamRadarSvg(snap([mem('a', '田中', [5, 4, 3, 2, 1])]));
    const polys = pointsOf(svg);
    expect(polys.length).toBe(SCORE_MAX + 1);
    // 頂点が 1 つ足りない多角形は、図としては開いた形になるが SVG は壊れない。
    for (const p of polys) expect(p).toHaveLength(CANONICAL_AXES.length);
  });

  it('スコアが違えば頂点の位置も違う (全部中心に寄らない)', () => {
    const svg = renderTeamRadarSvg(snap([mem('a', '田中', [5, 1, 5, 1, 5])]));
    const memberPoly = pointsOf(svg).at(-1)!;
    expect(new Set(memberPoly).size).toBe(memberPoly.length);
    // 中心に潰れていない = 半径 0 の点ばかりではない
    const distinctRadii = new Set(memberPoly.map((pt) => pt.split(',')[0]));
    expect(distinctRadii.size).toBeGreaterThan(1);
  });

  it('軸名の寄せ方を位置で変える (真上/右/左)', () => {
    const svg = renderTeamRadarSvg(snap([]));
    // 真上の軸は中央寄せ、右側は左端寄せ、左側は右端寄せ。
    // どれか 1 つに固定されると、ラベルが軸に重なる。
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain('text-anchor="end"');
  });

  it('縦長でも横長でも短いほうに収める', () => {
    const wide = renderTeamRadarSvg(snap([]), { width: 800, height: 300 });
    const xs = pointsOf(wide)
      .flat()
      .map((pt) => Number(pt.split(',')[0]));
    const ys = pointsOf(wide)
      .flat()
      .map((pt) => Number(pt.split(',')[1]));
    // 短い辺 (300) を基準に取るので、図は高さ内に収まる。
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(300);
    expect(Math.max(...xs)).toBeLessThanOrEqual(800);
  });

  it('図の中に地の文が混ざらない (要素だけを並べる)', () => {
    const svg = renderTeamRadarSvg(snap([mem('a', '田中', [3, 3, 3, 3, 3])]));
    const body = svg.split('\n').slice(2, -1); // xml 宣言と <svg> 開始、</svg> を除く
    for (const line of body) {
      const t = line.trim();
      if (t.length === 0) continue;
      expect(t.startsWith('<')).toBe(true);
    }
  });
});

describe('renderTeamRadarSvg — 座標の書式と重なり', () => {
  const snap = (members: TeamMember[]) => ({
    department: '開発部',
    evaluatedAt: '2026-05-01',
    axes: CANONICAL_AXES,
    members,
    fetchedAt: '2035-05-15T00:00:00.000Z',
    isMock: true,
  });
  const mem = (id: string, name: string, scores: number[]): TeamMember =>
    ({ id, name, scores } as TeamMember);

  it('points は "x,y" の形で書く (区切りが消えると図が出ない)', () => {
    const svg = renderTeamRadarSvg(snap([mem('a', '田中', [5, 4, 3, 2, 1])]));
    for (const m of svg.matchAll(/<polygon points="([^"]+)"/g)) {
      for (const pt of m[1]!.split(' ')) {
        expect(pt).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
      }
    }
  });

  it('頂点の丸は多角形の頂点に重ねる', () => {
    const svg = renderTeamRadarSvg(snap([mem('a', '田中', [5, 1, 5, 1, 5])]));
    const poly = [...svg.matchAll(/<polygon points="([^"]+)"/g)].at(-1)![1]!.split(' ');
    const dots = [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="3"/g)].map(
      (m) => `${m[1]},${m[2]}`,
    );
    // ずれると「点だけ中心に集まる」等の壊れ方をするが SVG は成立する。
    expect(new Set(dots)).toEqual(new Set(poly));
  });

  it('真上の軸は中央寄せ、左右は 2 本ずつに振り分ける', () => {
    const svg = renderTeamRadarSvg(snap([]));
    const anchors = [...svg.matchAll(/font-size="13" fill="#e6e8ec" text-anchor="(\w+)"/g)].map(
      (m) => m[1]!,
    );
    expect(anchors).toHaveLength(CANONICAL_AXES.length);
    expect(anchors[0]).toBe('middle'); // 1 本目は真上
    expect(anchors.filter((a) => a === 'start')).toHaveLength(2); // 右側
    expect(anchors.filter((a) => a === 'end')).toHaveLength(2); // 左側
  });
});

/*
 * **ここに入るのは他人の評価である。**
 *
 * `team-radar.json` は部署名・メンバーの氏名・軸ごとの 1〜5 評価・付箋コメント、
 * つまり人事評価そのもので、しかも利用者本人ではなく第三者の情報である。
 * 実測 (2026-08-23) では **644** で書かれており、同じ機械の他の利用者が
 * 同僚の評価を読める状態だった (`secrets.json` と `service-hub-emotions.json` は
 * どちらも 600)。
 *
 * `mode` は新規作成のときしか効かないが、この関数は tmp を新しく作って
 * rename で被せるので、**既にある緩いファイルも次の保存で直る**。
 * 下の 2 本目がそれを留めている。
 */
describe('saveTeamRadarState の権限', () => {
  let dir = '';
  const state = {
    department: '営業',
    evaluatedAt: '2026-08-23',
    members: [{ id: 'm1', name: '山田', scores: [3, 3, 3, 3, 3] }],
  };

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'teamradar-mode-'));
  });
  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  const modeOf = async (p: string) => ((await fsp.stat(p)).mode & 0o777).toString(8);

  it('新しく作るファイルは 0600', async () => {
    const target = path.join(dir, 'team-radar.json');
    await saveTeamRadarState(state as never, { statePath: () => target });
    expect(await modeOf(target)).toBe('600');
    // 中身も書けていること (権限だけ見て中身を見ないと、書けていなくても通る)。
    expect(JSON.parse(await fsp.readFile(target, 'utf8')).members[0].name).toBe('山田');
  });

  it('既にある 644 のファイルも、次の保存で締まる', async () => {
    const target = path.join(dir, 'team-radar.json');
    await fsp.writeFile(target, '{}');
    await fsp.chmod(target, 0o644);
    expect(await modeOf(target)).toBe('644');

    await saveTeamRadarState(state as never, { statePath: () => target });

    expect(await modeOf(target)).toBe('600');
  });
});
