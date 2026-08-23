import { describe, expect, it, vi } from 'vitest';
import { MAX_ANALYZE_TEXT_CHARS, MAX_MOOD_NOTE_CHARS } from '../../../shared/emotionsLimits';
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
    // 記録は userData に置く約束なので、別の名前を訊かれたら別の場所を
    // 返す。引数を無視すると「どの Electron パスへ置くか」を測れない
    // (temp や downloads は寿命も権限も違う)。
    getPath: (name: string) => (name === 'userData' ? tmpDir : path.join(tmpDir, `not-${name}`)),
  },
}));

// Imported after vi.mock so the mocked electron is in scope.
const { ACTIONS, fetchEmotionsSnapshot } = await import('../emotions');

const STORE_FILE = 'service-hub-emotions.json';
const storeFile = (): string => path.join(tmpDir, STORE_FILE);
const readStored = async (): Promise<{ moods: unknown[]; analyses: unknown[] }> =>
  JSON.parse(await fs.readFile(storeFile(), 'utf8'));
const seed = async (store: unknown): Promise<void> => {
  await fs.writeFile(storeFile(), JSON.stringify(store));
};
const noFetch = (): ReturnType<typeof vi.fn<typeof fetch>> => vi.fn<typeof fetch>();

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

// --- 保存そのもの ------------------------------------------------------
//
// 気分の日記と感情解析は、その人の私的な記録そのものである。
// userData 配下に平文の JSON で置くので、せめて本人以外が読めない
// 権限で書く。ここは今まで 1 度も確かめられていなかった。

describe('保存ファイルの権限と読み出しの頑健さ', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-store-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it.skipIf(process.platform === 'win32')(
    '日記は本人だけが読み書きできる権限 (0600) で保存する',
    async () => {
      await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 3 } });
      const st = await fs.stat(storeFile());
      // 既定 (0644) に戻ると、同じ端末の別ユーザーから日記が読める。
      expect(st.mode & 0o777).toBe(0o600);
    },
  );

  it('保存先がまだ無いときは空の記録として始める', async () => {
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 3 } });
    const stored = await readStored();
    expect(stored.moods).toHaveLength(1);
    // 解析側にゴミが入っていないこと (空配列で始まっている根拠)
    expect(stored.analyses).toEqual([]);
  });

  it('読めない記録を「まだ無い」と誤解して上書きしない', async () => {
    // 同名のディレクトリを置くと readFile は EISDIR で失敗する。
    // ENOENT 以外を握り潰すと、壊れた記録を空で上書きしてしまう。
    await fs.mkdir(storeFile());
    await expect(
      ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 3 } }),
    ).rejects.toThrow();
  });
});

// --- 画面へ返す量 ------------------------------------------------------

describe('fetchEmotionsSnapshot', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-snap-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('気分は直近 30 日ぶん、解析は新しい 10 件だけ返す', async () => {
    const moods = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      score: 3,
      note: `m${i}`,
    }));
    const analyses = Array.from({ length: 15 }, (_, i) => ({ id: `a${i}` }));
    await seed({ moods, analyses });

    const snap = await fetchEmotionsSnapshot({ token: '' });

    expect(snap.moods).toHaveLength(30);
    // 末尾 30 件 = 新しいほう。先頭から取ると古い順になり中身が変わる。
    expect(snap.moods[0]!.note).toBe('m10');
    expect(snap.moods[29]!.note).toBe('m39');

    expect(snap.analyses).toHaveLength(10);
    expect(snap.analyses[0]!.id).toBe('a0');
    expect(snap.analyses[9]!.id).toBe('a9');
  });

  it('鍵の有無をそのまま伝える', async () => {
    await seed({ moods: [], analyses: [] });
    expect((await fetchEmotionsSnapshot({ token: '' })).keyConfigured).toBe(false);
    expect((await fetchEmotionsSnapshot({ token: 'sk-ant-xxx' })).keyConfigured).toBe(true);
  });
});

// --- 日付と点数 --------------------------------------------------------

describe('ACTIONS["log-mood"] — 日付と点数', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-date-'));
  });
  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('日付を渡さなければ端末の今日 (ローカル) を使う', async () => {
    // 1 桁の月日を選んでいるのは、0 詰めが効いていることまで見るため。
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 3, 12, 0, 0));

    const result = (await ACTIONS['log-mood']!({
      token: '',
      fetch: noFetch(),
      payload: { score: 4 },
    })) as { date: string };

    expect(result.date).toBe('2026-05-03');
  });

  it('日付の形が違えば今日として扱う', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 3, 12, 0, 0));
    for (const bad of ['not-a-date', 'xx2026-05-01', '2026-05-01junk', '2026-5-1']) {
      const r = (await ACTIONS['log-mood']!({
        token: '',
        fetch: noFetch(),
        payload: { date: bad, score: 4 },
      })) as { date: string };
      expect(r.date).toBe('2026-05-03');
    }
  });

  it('点数の境界 — 1 と 5 は通し、0 と 6 と数値でないものは拒む', async () => {
    for (const ok of [1, 5]) {
      const r = (await ACTIONS['log-mood']!({
        token: '',
        fetch: noFetch(),
        payload: { date: '2026-05-01', score: ok },
      })) as { score: number };
      expect(r.score).toBe(ok);
    }
    for (const bad of [0, 6, 'abc', NaN, Infinity]) {
      await expect(
        ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: bad } }),
      ).rejects.toThrow(/between 1 and 5/);
    }
  });

  it('日付ごとに 1 件 — 別の日を足しても既存を置き換えない', async () => {
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 1 } });
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-02', score: 2 } });
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-03', score: 3 } });
    const stored = await readStored();
    expect(stored.moods).toHaveLength(3);
  });

  it('入れた順に関わらず日付順に並べて保存する', async () => {
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-03', score: 3 } });
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 1 } });
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-02', score: 2 } });
    const stored = (await readStored()).moods as { date: string }[];
    expect(stored.map((m) => m.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });

  it('メモを渡さなければ空文字にする（undefined を保存しない）', async () => {
    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 3 } });
    const stored = (await readStored()).moods as { note: string }[];
    expect(stored[0]!.note).toBe('');
  });

  it('365 日を超えたら古いほうから捨てる', async () => {
    const moods = Array.from({ length: 366 }, (_, i) => ({
      date: `2025-01-01T${String(i).padStart(4, '0')}`,
      score: 3,
      note: `old${i}`,
    }));
    await seed({ moods, analyses: [] });

    await ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 5 } });

    const stored = (await readStored()).moods as { note?: string; date: string }[];
    expect(stored).toHaveLength(365);
    // 新しいほう (今入れた分) が残り、いちばん古い 2 件が落ちる。
    expect(stored[stored.length - 1]!.date).toBe('2026-05-01');
    expect(stored.some((m) => m.note === 'old0')).toBe(false);
    expect(stored.some((m) => m.note === 'old1')).toBe(false);
    expect(stored.some((m) => m.note === 'old2')).toBe(true);
  });
});

// --- Anthropic への送り方 ----------------------------------------------
//
// この動作だけが外部へ本文を送る。何を・どこへ・どの鍵で送るかが
// 変わったら落ちるようにしておく。

function anthropicOk(json: unknown) {
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ACTIONS["analyze-text"] — 送り先と中身', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-send-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const okBody = { scores: { joy: 0.9 }, sentiment: 'positive', dominant: 'joy' };

  it('Anthropic の messages へ POST し、鍵は x-api-key だけに載せる', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicOk(okBody));
    await ACTIONS['analyze-text']!({
      token: 'sk-ant-secret',
      fetch: fetchMock,
      payload: { text: '今日はいい日だった' },
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(url).not.toContain('sk-ant-secret');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-secret');
    // 版を名乗らないと Anthropic は 400 を返す。
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.max_tokens).toBe(512);
    expect(typeof body.system).toBe('string');
    expect(body.system.length).toBeGreaterThan(0);
    expect(body.messages).toEqual([{ role: 'user', content: '今日はいい日だった' }]);
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('over quota', { status: 429 }));
    await expect(
      ACTIONS['analyze-text']!({ token: 'sk-ant-x', fetch: fetchMock, payload: { text: 'あ' } }),
    ).rejects.toMatchObject({ serviceId: 'emotions', status: 429 });
  });

  it('本文が空・空白だけ・文字列でなければ送らない', async () => {
    for (const bad of ['', '   ', '\n\t ', 123, null]) {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        ACTIONS['analyze-text']!({ token: 'sk-ant-x', fetch: fetchMock, payload: { text: bad } }),
      ).rejects.toThrow('text is required');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('鍵が無ければ送らない', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['analyze-text']!({ token: '', fetch: fetchMock, payload: { text: 'あ' } }),
    ).rejects.toThrow(/Anthropic API key required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('text 以外のブロックが混ざっていても text を選ぶ', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            { type: 'thinking', text: 'これは JSON ではない' },
            { type: 'text', text: JSON.stringify(okBody) },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const entry = (await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: 'あ' },
    })) as { sentiment: string };
    expect(entry.sentiment).toBe('positive');
  });

  it('content ごと無い応答でも落ちずに「JSON ではない」と言う', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    // toThrow は部分一致なので、末尾に何か付いていても通る。
    // 本文が空だったことまで見るには全文で比べる。
    const err = await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: 'あ' },
    }).then(
      () => null,
      (e: Error) => e,
    );
    expect((err as Error).message).toBe('Anthropic returned a non-JSON response: ');
  });

  it('text ブロックが 1 つも無い応答でも落ちない', async () => {
    // content はあるが text 型が無い。ここで空文字へ落とせないと
    // `undefined.text` を読んで別の例外になり、原因が分からなくなる。
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'thinking', text: 'x' }, { type: 'image' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    // toThrow は部分一致なので、末尾に何か付いていても通る。
    // 本文が空だったことまで見るには全文で比べる。
    const err = await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: 'あ' },
    }).then(
      () => null,
      (e: Error) => e,
    );
    expect((err as Error).message).toBe('Anthropic returned a non-JSON response: ');
  });

  it('JSON でない応答は 80 文字までに切り、鍵らしき文字列は伏せる', async () => {
    // モデルが鍵を復唱して返してくることが実際にある。そのまま例外
    // メッセージへ入れるとログや画面へ流れる。
    const leak = 'sorry, your key sk-ant-abcdefghijklmnop is invalid. ';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: leak + 'x'.repeat(200) }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const err = await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: 'あ' },
    }).then(
      () => null,
      (e: Error) => e,
    );

    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain('non-JSON response');
    expect(msg).toContain('sk-ant-[REDACTED]');
    expect(msg).not.toContain('sk-ant-abcdefghijklmnop');
    // 200 文字の 'x' がそのまま入っていない = 80 文字で切れている
    expect(msg).not.toContain('x'.repeat(100));
  });

  it('記録の id は毎回変わり、小数点を含まない', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(anthropicOk(okBody))
      .mockResolvedValueOnce(anthropicOk(okBody));
    const first = (await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: 'あ' },
    })) as { id: string };
    const second = (await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: 'い' },
    })) as { id: string };

    expect(first.id).not.toBe(second.id);
    expect(first.id.length).toBeGreaterThan(0);
    // `Math.random().toString(36)` をそのまま使うと "0.xxxx" が入る
    expect(first.id).not.toContain('.');
    expect(first.id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });

  it('抜粋は 80 文字まで。source があれば頭に付ける', async () => {
    const long = 'あ'.repeat(200);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(anthropicOk(okBody))
      .mockResolvedValueOnce(anthropicOk(okBody));

    const plain = (await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: long },
    })) as { excerpt: string };
    expect(plain.excerpt).toBe('あ'.repeat(80));

    const tagged = (await ACTIONS['analyze-text']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { text: long, source: 'Slack #general' },
    })) as { excerpt: string };
    expect(tagged.excerpt).toBe(`[Slack #general] ${'あ'.repeat(80)}`);
  });

  it('50 件を超えたら古い解析から捨てる', async () => {
    const analyses = Array.from({ length: 50 }, (_, i) => ({ id: `old${i}` }));
    await seed({ moods: [], analyses });

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicOk(okBody));
    await ACTIONS['analyze-text']!({ token: 'sk-ant-x', fetch: fetchMock, payload: { text: 'あ' } });

    const stored = (await readStored()).analyses as { id: string }[];
    expect(stored).toHaveLength(50);
    // 新しいものが先頭、いちばん古い old49 が落ちる
    expect(stored[0]!.id).not.toBe('old0');
    expect(stored[1]!.id).toBe('old0');
    expect(stored.some((a) => a.id === 'old49')).toBe(false);
  });
});

// --- 消去 --------------------------------------------------------------
//
// 消す動作は取り返しがつかない。「頼んでいないほうまで消える」は
// 画面には出ないので、ここは 1 通りずつ確かめる。

describe('ACTIONS["clear-history"] — 何が消えて何が残るか', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-clear-'));
    await seed({
      moods: [{ date: '2026-05-01', score: 3, note: 'm' }],
      analyses: [{ id: 'a1' }, { id: 'a2' }],
    });
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const clear = async (payload: Record<string, unknown>) =>
    (await ACTIONS['clear-history']!({ token: '', fetch: noFetch(), payload })) as {
      moods: number;
      analyses: number;
    };

  it('kind="moods" — 気分だけ消し、解析は残す', async () => {
    const before = await clear({ kind: 'moods' });
    expect(before).toEqual({ moods: 1, analyses: 2 });
    const stored = await readStored();
    expect(stored.moods).toEqual([]);
    expect(stored.analyses).toHaveLength(2);
  });

  it('kind="analyses" — 解析だけ消し、気分は残す', async () => {
    await clear({ kind: 'analyses' });
    const stored = await readStored();
    expect(stored.moods).toHaveLength(1);
    expect(stored.analyses).toEqual([]);
  });

  it('kind="all" — 両方消す', async () => {
    await clear({ kind: 'all' });
    const stored = await readStored();
    expect(stored.moods).toEqual([]);
    expect(stored.analyses).toEqual([]);
  });

  it('kind 未指定 — 気分だけ消す (解析は巻き添えにしない)', async () => {
    await clear({});
    const stored = await readStored();
    expect(stored.moods).toEqual([]);
    expect(stored.analyses).toHaveLength(2);
  });

  it('知らない kind なら何も消さない', async () => {
    const before = await clear({ kind: 'everything' });
    expect(before).toEqual({ moods: 1, analyses: 2 });
    const stored = await readStored();
    expect(stored.moods).toHaveLength(1);
    expect(stored.analyses).toHaveLength(2);
  });
});

// --- 壊れた記録を握り潰さない ------------------------------------------

describe('壊れた記録の扱い', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emotions-broken-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('JSON として読めない記録を空で上書きしない', async () => {
    // ENOENT (まだ無い) 以外の失敗を「まだ無い」と同じ扱いにすると、
    // 読めなかった日記が次の書き込みで空に置き換わる。
    await fs.writeFile(storeFile(), 'not json at all');

    await expect(
      ACTIONS['log-mood']!({ token: '', fetch: noFetch(), payload: { date: '2026-05-01', score: 3 } }),
    ).rejects.toThrow();

    // 壊れたままのほうがまし — 消えていないことを確かめる
    expect(await fs.readFile(storeFile(), 'utf8')).toBe('not json at all');
  });

  it('moods / analyses が配列でなければ空として読む', async () => {
    await fs.writeFile(storeFile(), JSON.stringify({ moods: 'nope', analyses: { a: 1 } }));
    const snap = await fetchEmotionsSnapshot({ token: '' });
    expect(snap.moods).toEqual([]);
    expect(snap.analyses).toEqual([]);
  });

  it('日付が文字列に化ける値でも今日として扱う', async () => {
    // `toString` が正しい形を返すオブジェクトは、正規表現には通るが
    // 文字列ではない。先に typeof を見ていないと保存に紛れ込む。
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 3, 12, 0, 0));
    try {
      const r = (await ACTIONS['log-mood']!({
        token: '',
        fetch: noFetch(),
        payload: { date: { toString: () => '2026-05-01' }, score: 3 },
      })) as { date: string };
      expect(r.date).toBe('2026-05-03');
    } finally {
      vi.useRealTimers();
    }
  });
});

// --- コードフェンスの剥がし方 ------------------------------------------

describe('extractJson — フェンスの形', () => {
  it('言語タグの後ろに空白があっても剥がす', () => {
    expect(extractJson('```json   \n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('複数行の JSON も丸ごと取り出す', () => {
    expect(extractJson('```json\n{\n  "x": 1\n}\n```')).toBe('{\n  "x": 1\n}');
  });

  it('フェンスの中身の前後の空白は落とす', () => {
    expect(extractJson('```json\n   {"x":1}   \n```')).toBe('{"x":1}');
  });
});

// --- どの感情を代表にするか --------------------------------------------

describe('normalizeAnalysis — dominant の決め方', () => {
  it('モデルの申告が妥当ならスコア最大と違っていても尊重する', () => {
    const n = normalizeAnalysis({ scores: { joy: 0.9, anger: 0.1 }, dominant: 'anger' });
    expect(n.dominant).toBe('anger');
  });

  it('"mixed" も妥当な申告として扱う', () => {
    const n = normalizeAnalysis({ scores: { joy: 0.9 }, dominant: 'mixed' });
    expect(n.dominant).toBe('mixed');
  });

  it('申告が文字列でなければスコアから決め直す', () => {
    expect(normalizeAnalysis({ scores: { joy: 0.9 }, dominant: 123 }).dominant).toBe('joy');
    expect(normalizeAnalysis({ scores: { anger: 0.9 }, dominant: ['joy'] }).dominant).toBe('anger');
  });

  it('同点なら先に並んでいるほうを採る', () => {
    // joy / sadness / anger / fear / surprise / disgust の順。
    const n = normalizeAnalysis({ scores: { sadness: 0.5, anger: 0.5 } });
    expect(n.dominant).toBe('sadness');
  });
});

/*
 * **入力の上限は、IPC の信頼境界にも在ること。**
 *
 * 2026-08-23 まで、上限を持っていたのは**ブラウザ版だけ**だった:
 *
 *              analyze-text の text     log-mood の note
 *   ブラウザ   5000 字で断る             2000 字で断る
 *   main       空でなければ通す          検査なし
 *
 * **向きが逆である。** `main` はレンダラーから来た payload を最初に受ける
 * 側なのに、そこだけ上限が無かった。`text` は Anthropic の要求本文へ
 * そのまま載り、`note` は保存される。
 */
describe('emotions の入力上限 (両ビルドで同じ値)', () => {
  it('analyze-text: 上限ちょうどは通す (境界)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: '{"scores":{"joy":1}}' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      ACTIONS['analyze-text']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { text: 'a'.repeat(MAX_ANALYZE_TEXT_CHARS) },
      }),
    ).resolves.toBeDefined();
  });

  it('analyze-text: 上限 +1 は断る (境界)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['analyze-text']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { text: 'a'.repeat(MAX_ANALYZE_TEXT_CHARS + 1) },
      }),
    ).rejects.toThrow(/exceeds/);
    expect(fetchMock, '断る前に API を呼んでいる').not.toHaveBeenCalled();
  });

  it('log-mood: 上限ちょうどは通す (境界)', async () => {
    await expect(
      ACTIONS['log-mood']!({
        token: '',
        payload: { score: 3, note: 'n'.repeat(MAX_MOOD_NOTE_CHARS) },
      }),
    ).resolves.toBeDefined();
  });

  it('log-mood: 上限 +1 は断る (境界)', async () => {
    await expect(
      ACTIONS['log-mood']!({
        token: '',
        payload: { score: 3, note: 'n'.repeat(MAX_MOOD_NOTE_CHARS + 1) },
      }),
    ).rejects.toThrow(/exceeds/);
  });

  it('上限は共有の定数から来ている (2 か所に数字を持たない)', () => {
    expect(MAX_ANALYZE_TEXT_CHARS).toBe(5000);
    expect(MAX_MOOD_NOTE_CHARS).toBe(2000);
  });
});
