import { describe, expect, it, vi } from 'vitest';
import { extractJson, normalizeAnalysis } from '../emotions';

describe('extractJson', () => {
  it('returns the raw text when no fences are present', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('strips bare ``` fences (no lang tag)', () => {
    expect(extractJson('```\n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('trims surrounding whitespace', () => {
    expect(extractJson('   {"a":1}   ')).toBe('{"a":1}');
  });
});

describe('normalizeAnalysis', () => {
  it('produces all six emotion keys even when input is missing them', () => {
    const n = normalizeAnalysis({ scores: { joy: 0.7 } });
    expect(Object.keys(n.scores).sort()).toEqual(
      ['anger', 'disgust', 'fear', 'joy', 'sadness', 'surprise'],
    );
    expect(n.scores.joy).toBe(0.7);
    expect(n.scores.sadness).toBe(0);
  });

  it('clamps out-of-range scores into [0, 1]', () => {
    const n = normalizeAnalysis({ scores: { joy: 5, sadness: -3, anger: 0.5 } });
    expect(n.scores.joy).toBe(1);
    expect(n.scores.sadness).toBe(0);
    expect(n.scores.anger).toBe(0.5);
  });

  it('falls back to neutral sentiment when value is unknown', () => {
    expect(normalizeAnalysis({ sentiment: 'amazing' }).sentiment).toBe('neutral');
    expect(normalizeAnalysis({}).sentiment).toBe('neutral');
  });

  it('passes through valid sentiment values', () => {
    expect(normalizeAnalysis({ sentiment: 'positive' }).sentiment).toBe('positive');
    expect(normalizeAnalysis({ sentiment: 'negative' }).sentiment).toBe('negative');
  });

  it('uses the model-provided dominant when it is a known label', () => {
    const n = normalizeAnalysis({
      scores: { joy: 0.1, anger: 0.9 },
      dominant: 'anger',
    });
    expect(n.dominant).toBe('anger');
  });

  it('computes dominant from scores when the model omits the field', () => {
    const n = normalizeAnalysis({ scores: { joy: 0.1, sadness: 0.8, anger: 0.3 } });
    expect(n.dominant).toBe('sadness');
  });

  it('returns "mixed" when no score is positive', () => {
    const n = normalizeAnalysis({ scores: { joy: 0, sadness: 0, anger: 0 } });
    expect(n.dominant).toBe('mixed');
  });

  it('handles entirely empty/null input', () => {
    const n = normalizeAnalysis(null);
    expect(n.sentiment).toBe('neutral');
    expect(n.scores.joy).toBe(0);
  });

  it('rejects an invalid dominant label and recomputes from scores', () => {
    const n = normalizeAnalysis({
      scores: { joy: 0.9 },
      dominant: 'something-weird',
    });
    expect(n.dominant).toBe('joy');
  });
});

// --- write-side actions ------------------------------------------------
// Actions touch the disk via app.getPath('userData'). We mock the
// electron app module to point at a temp directory so each action
// can be exercised end-to-end without disturbing user data.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';

 
let tmpDir: string;
vi.mock('electron', () => ({
  app: {
    // tmpDir is mutated per test, so read it lazily.
    getPath: (_: string) => tmpDir,
  },
}));

// Imported after vi.mock so the mocked electron is in scope.
const { ACTIONS } = await import('../emotions');

describe('ACTIONS["log-mood"]', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-log-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists a mood entry and returns the stored shape', async () => {
    const result = (await ACTIONS['log-mood']!({
      token: '',
      fetch: vi.fn<typeof fetch>(),
      payload: { date: '2026-05-01', score: 4, note: 'ok' },
    })) as { date: string; score: number };

    expect(result).toEqual({ date: '2026-05-01', score: 4 });
    const raw = await fs.readFile(path.join(tmpDir, 'service-hub-emotions.json'), 'utf8');
    const stored = JSON.parse(raw);
    expect(stored.moods).toHaveLength(1);
    expect(stored.moods[0]).toMatchObject({ date: '2026-05-01', score: 4, note: 'ok' });
  });

  it('rejects an out-of-range score (kills `score < 1 || score > 5` weakening)', async () => {
    await expect(
      ACTIONS['log-mood']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { score: 10 },
      }),
    ).rejects.toThrow(/between 1 and 5/);
  });

  it('replaces same-date entry rather than appending', async () => {
    await ACTIONS['log-mood']!({ token: '', fetch: vi.fn<typeof fetch>(), payload: { date: '2026-05-01', score: 3 } });
    await ACTIONS['log-mood']!({ token: '', fetch: vi.fn<typeof fetch>(), payload: { date: '2026-05-01', score: 5 } });
    const stored = JSON.parse(await fs.readFile(path.join(tmpDir, 'service-hub-emotions.json'), 'utf8'));
    expect(stored.moods).toHaveLength(1);
    expect(stored.moods[0].score).toBe(5);
  });
});

describe('ACTIONS["analyze-text"]', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-an-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('POSTs to Anthropic, parses JSON, and stores the analysis', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                scores: { joy: 0.8 },
                sentiment: 'positive',
                dominant: 'joy',
              }),
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = (await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: '今日は最高だった', source: 'journal' },
    })) as { sentiment: string; dominant: string; excerpt: string };

    expect(result.sentiment).toBe('positive');
    expect(result.dominant).toBe('joy');
    expect(result.excerpt).toContain('[journal]');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('rejects when text is missing', async () => {
    await expect(
      ACTIONS['analyze-text']!({
        token: 'sk-ant-x',
        fetch: vi.fn<typeof fetch>(),
        payload: { text: '' },
      }),
    ).rejects.toThrow(/text is required/);
  });

  it('rejects when API key (ctx.token) is empty', async () => {
    await expect(
      ACTIONS['analyze-text']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { text: 'hello' },
      }),
    ).rejects.toThrow(/Anthropic API key required/);
  });
});

describe('ACTIONS["clear-history"]', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-cl-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('clears moods by default (kind undefined)', async () => {
    await ACTIONS['log-mood']!({ token: '', fetch: vi.fn<typeof fetch>(), payload: { date: '2026-05-01', score: 3 } });
    const before = (await ACTIONS['clear-history']!({
      token: '',
      fetch: vi.fn<typeof fetch>(),
      payload: {},
    })) as { moods: number; analyses: number };
    expect(before.moods).toBe(1);
    const stored = JSON.parse(await fs.readFile(path.join(tmpDir, 'service-hub-emotions.json'), 'utf8'));
    expect(stored.moods).toEqual([]);
  });

  it('clears only analyses when kind="analyses"', async () => {
    await ACTIONS['log-mood']!({ token: '', fetch: vi.fn<typeof fetch>(), payload: { date: '2026-05-01', score: 3 } });
    await ACTIONS['clear-history']!({
      token: '',
      fetch: vi.fn<typeof fetch>(),
      payload: { kind: 'analyses' },
    });
    const stored = JSON.parse(await fs.readFile(path.join(tmpDir, 'service-hub-emotions.json'), 'utf8'));
    expect(stored.moods).toHaveLength(1); // moods untouched
  });
});
