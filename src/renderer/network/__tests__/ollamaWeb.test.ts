import { describe, expect, it, vi } from 'vitest';
import { originsSetupSteps, probeOllama } from '../ollamaWeb';
import { MIN_SAFE_VERSION } from '../../../shared/ollama';

/*
 * probeOllama の要点は **失敗理由の切り分け**。利用者から見ると「未起動」と
 * 「起動しているが CORS で拒否」は同じ『つながらない』に見えるが、後者は
 * OLLAMA_ORIGINS を足せば直る。ここを取り違えると「壊れている」と誤解される
 * ので、通常 fetch と no-cors フォールバックの組み合わせを固定する。
 */

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 通常 fetch は CORS で失敗し、no-cors だけ通る = 起動しているが未許可。 */
function corsBlockedFetch(): typeof fetch {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    // 実ブラウザの opaque レスポンスは status 0 だが、new Response(null, {status: 0})
    // は構築時に例外になるため 204 で代用する。probe 側は「例外を投げずに解決するか」
    // だけを見ているので、到達性の再現としては等価。
    if (init?.mode === 'no-cors') return new Response(null, { status: 204 });
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
}

/** どちらも失敗 = サーバに到達できない。 */
function unreachableFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
}

/** 正常応答。/api/version と /api/tags を返す。 */
function healthyFetch(version: string, models: unknown[]): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/api/version')) return json({ version });
    if (u.endsWith('/api/tags')) return json({ models });
    throw new Error(`unexpected url: ${u}`);
  }) as unknown as typeof fetch;
}

describe('probeOllama — 接続成功', () => {
  it('バージョンとモデルを読み、running:true のスナップショットを返す', async () => {
    const r = await probeOllama(
      11434,
      healthyFetch('0.5.4', [
        {
          name: 'llama3.2:latest',
          size: 1024 * 1024 * 1024,
          modified_at: '2026-07-01T00:00:00Z',
          details: { family: 'llama', parameter_size: '3B', quantization_level: 'Q4_0' },
        },
      ]),
    );
    expect(r.status).toBe('ok');
    expect(r.snapshot.running).toBe(true);
    expect(r.snapshot.version).toBe('0.5.4');
    expect(r.snapshot.versionSafe).toBe(true);
    expect(r.snapshot.models).toHaveLength(1);
    expect(r.snapshot.models[0]?.name).toBe('llama3.2:latest');
    expect(r.message).toContain('0.5.4');
    expect(r.message).toContain('1 件');
  });

  it('古いバージョンでは versionSafe:false と更新警告を載せる', async () => {
    const r = await probeOllama(11434, healthyFetch('0.1.30', []));
    expect(r.status).toBe('ok');
    expect(r.snapshot.versionSafe).toBe(false);
    expect(r.snapshot.warnings[0]).toContain(MIN_SAFE_VERSION);
  });

  it('モデル一覧だけ失敗しても接続成功として扱う (バージョンが読めている)', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/version')) return json({ version: '0.5.4' });
      throw new TypeError('tags failed');
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f);
    expect(r.status).toBe('ok');
    expect(r.snapshot.models).toEqual([]);
  });

  it('読み取り 3 エンドポイント以外は叩かない', async () => {
    const spy = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    await probeOllama(11434, spy);
    const urls = (spy as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) =>
      String(c[0]),
    );
    for (const u of urls) {
      expect(u).toMatch(/\/api\/(version|tags)$/);
      expect(u).not.toMatch(/\/api\/(pull|create|push|delete|copy|blobs)/);
    }
  });
});

describe('probeOllama — 失敗理由の切り分け', () => {
  it('起動しているが CORS 未許可 → cors-blocked と設定手順の案内', async () => {
    const r = await probeOllama(11434, corsBlockedFetch());
    expect(r.status).toBe('cors-blocked');
    expect(r.message).toContain('OLLAMA_ORIGINS');
    expect(r.snapshot.running).toBe(false);
  });

  it('到達不能 → not-running (未起動 / ポート違いの案内)', async () => {
    const r = await probeOllama(11434, unreachableFetch());
    expect(r.status).toBe('not-running');
    expect(r.message).toContain('11434');
    expect(r.snapshot.running).toBe(false);
  });

  it('cors-blocked と not-running を取り違えない (no-cors の成否だけで決まる)', async () => {
    const blocked = await probeOllama(11434, corsBlockedFetch());
    const down = await probeOllama(11434, unreachableFetch());
    expect(blocked.status).not.toBe(down.status);
  });

  it('HTTP エラー応答は error', async () => {
    const f = vi.fn(async () => json({}, 500)) as unknown as typeof fetch;
    const r = await probeOllama(11434, f);
    expect(r.status).toBe('error');
    expect(r.message).toContain('500');
  });

  it('不正なポートは接続を試みずに bad-port', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    for (const bad of ['0', '70000', 'abc', '0x2b', '']) {
      const r = await probeOllama(bad, f);
      expect(r.status, bad).toBe('bad-port');
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('JSON でない応答でもクラッシュせず、バージョン不明として接続成功にする', async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/api/version')
        ? new Response('not json', { status: 200 })
        : json({ models: [] }),
    ) as unknown as typeof fetch;
    const r = await probeOllama(11434, f);
    expect(r.status).toBe('ok');
    expect(r.snapshot.version).toBe('');
    expect(r.snapshot.versionSafe).toBe(false);
  });
});

describe('originsSetupSteps', () => {
  it('実行中の origin を各 OS のコマンドへ埋め込む', () => {
    const steps = originsSetupSteps('https://hiroto1977.github.io');
    expect(steps.map((s) => s.os)).toEqual([
      'macOS',
      'Linux (systemd)',
      'Windows (PowerShell)',
      '手元で試すだけ',
    ]);
    for (const s of steps) expect(s.command).toContain('https://hiroto1977.github.io');
  });

  it('file:// (origin が null) では * を使う — 単一ファイル配布でも設定できるように', () => {
    for (const origin of ['null', '']) {
      for (const s of originsSetupSteps(origin)) {
        expect(s.command).toContain('*');
        expect(s.command).not.toContain('null');
      }
    }
  });
});
