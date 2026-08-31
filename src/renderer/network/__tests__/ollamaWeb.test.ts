import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chatOllama,
  createCspWatcher,
  pageHost,
  parseJsonOrNull,
  readTextOrEmpty,
  loadEndpointSetting,
  OLLAMA_ENDPOINT_KEY,
  OLLAMA_PORT_KEY,
  desktopSetupCommands,
  originsSetupSteps,
  MAX_RESPONSE_BYTES,
  probeOllama,
  REQUEST_TIMEOUT_MS,
  setupCommands,
} from '../ollamaWeb';
import { DEFAULT_SETUP_MODEL, MIN_SAFE_VERSION } from '../../../shared/ollama';

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
    const r = await probeOllama(11434, healthyFetch('0.1.30', []), '');
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
    const r = await probeOllama(11434, f, '');
    expect(r.status).toBe('ok');
    expect(r.snapshot.models).toEqual([]);
  });

  it('読み取り 3 エンドポイント以外は叩かない', async () => {
    const spy = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    await probeOllama(11434, spy, '');
    const urls = (spy as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) =>
      String(c[0]),
    );
    for (const u of urls) {
      expect(u).toMatch(/\/api\/(version|tags)$/);
      expect(u).not.toMatch(/\/api\/(pull|create|push|delete|copy|blobs)/);
    }
  });
});

describe('probeOllama — 別端末から使う経路', () => {
  it('ページと同じホストの http は接続できる (PC配信ページをスマホから開く構成)', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      expect(u.startsWith('http://192.168.1.10:11434/')).toBe(true);
      if (u.endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama('http://192.168.1.10:11434', f, '192.168.1.10');
    expect(r.status).toBe('ok');
  });

  it('https のトンネル URL は任意ホストでも接続できる', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      expect(u.startsWith('https://abc.trycloudflare.com/')).toBe(true);
      if (u.endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama('https://abc.trycloudflare.com', f, 'hiroto1977.github.io');
    expect(r.status).toBe('ok');
  });
});

describe('probeOllama — 失敗理由の切り分け', () => {
  it('起動しているが CORS 未許可 → cors-blocked と設定手順の案内', async () => {
    const r = await probeOllama(11434, corsBlockedFetch(), '');
    expect(r.status).toBe('cors-blocked');
    expect(r.message).toContain('OLLAMA_ORIGINS');
    expect(r.snapshot.running).toBe(false);
  });

  it('到達不能 → not-running (未起動 / ポート違いの案内)', async () => {
    const r = await probeOllama(11434, unreachableFetch(), '');
    expect(r.status).toBe('not-running');
    expect(r.message).toContain('11434');
    expect(r.snapshot.running).toBe(false);
  });

  it('cors-blocked と not-running を取り違えない (no-cors の成否だけで決まる)', async () => {
    const blocked = await probeOllama(11434, corsBlockedFetch(), '');
    const down = await probeOllama(11434, unreachableFetch(), '');
    expect(blocked.status).not.toBe(down.status);
  });

  it('HTTP エラー応答は error', async () => {
    const f = vi.fn(async () => json({}, 500)) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '');
    expect(r.status).toBe('error');
    expect(r.message).toContain('500');
  });

  it('/api/version が無い古い Ollama でも、/api/tags が読めれば接続成功にする', async () => {
    // 0.1.14 未満には /api/version が無く、gin が 404 を返す。ここで打ち切ると
    // 「動いているのに使えない」と誤診してしまう。
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/api/version')
        ? new Response('404 page not found', { status: 404 })
        : json({ models: [] }),
    ) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '');
    expect(r.status).toBe('ok');
    expect(r.snapshot.running).toBe(true);
    expect(r.snapshot.version).toBe('');
    expect(r.message).toContain('バージョン不明');
  });

  it('/api/version も /api/tags も 404 なら error (Ollama ではない何かが応答している)', async () => {
    const f = vi.fn(async () => new Response('404 page not found', { status: 404 })) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '');
    expect(r.status).toBe('error');
    expect(r.message).toContain('404');
    expect(r.snapshot.running).toBe(false);
  });

  it('403 は cors-blocked として扱う (直し方が OLLAMA_ORIGINS 設定で同じため)', async () => {
    const f = vi.fn(async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '');
    expect(r.status).toBe('cors-blocked');
    expect(r.message).toContain('OLLAMA_ORIGINS');
  });

  it('エラー封筒の内容を説明に反映する (生の英語だけで終わらせない)', async () => {
    const f = vi.fn(async () =>
      json({ error: 'model requires more system memory (37.9 GiB) than is available (14.2 GiB)' }, 500),
    ) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '');
    expect(r.status).toBe('error');
    expect(r.message).toContain('空きメモリに載りません');
  });

  it('許可外の接続先は接続を試みずに bad-endpoint', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    for (const bad of ['0', '70000', 'abc', '0x2b', 'file:///etc/passwd']) {
      const r = await probeOllama(bad, f, '');
      expect(r.status, bad).toBe('bad-endpoint');
    }
    // 平文 http で「ページと違うホスト」も拒否 (内部探索の踏み台化を防ぐ)
    const r = await probeOllama('http://192.168.1.99:11434', f, '192.168.1.10');
    expect(r.status).toBe('bad-endpoint');
    expect(f).not.toHaveBeenCalled();
  });

  it('空文字は既定のループバックとして扱う (bad-endpoint にしない)', async () => {
    const r = await probeOllama('', healthyFetch('0.5.4', []), '');
    expect(r.status).toBe('ok');
  });

  it('JSON でない応答でもクラッシュせず、バージョン不明として接続成功にする', async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/api/version')
        ? new Response('not json', { status: 200 })
        : json({ models: [] }),
    ) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '');
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

/*
 * chatOllama — ブラウザ版の送信経路。
 *
 * ここが無いと「画面にチャット欄はあるのに送信だけ動かない」状態になる。
 * Electron 版 (main/clients/ollama.ts) と同じ制約が効いていること、そして
 * 実 Ollama のエラー応答を「次の一手」まで翻訳できることを固定する。
 */
describe('chatOllama — 送信', () => {
  /** 実 Ollama と同じ形で応答するスタブ。未取得モデルは 404 + エラー封筒。 */
  function chatServer(installed: string[] = ['llama3.2:latest']): typeof fetch {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/api/tags')) {
        return json({ models: installed.map((name) => ({ name, size: 1024 ** 3 })) });
      }
      if (!u.endsWith('/api/chat')) throw new Error(`unexpected url: ${u}`);
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        model?: string;
        messages?: { role: string; content: string }[];
        stream?: boolean;
      };
      if (!installed.includes(body.model ?? '')) {
        return json({ error: `model "${body.model}" not found, try pulling it first` }, 404);
      }
      return json({
        message: { role: 'assistant', content: `echo:${body.messages?.at(-1)?.content ?? ''}` },
      });
    }) as unknown as typeof fetch;
  }

  it('応答本文を返す', async () => {
    const r = await chatOllama({ model: 'llama3.2:latest', prompt: 'やあ' }, chatServer(), '');
    expect(r.ok).toBe(true);
    expect(r.ok && r.reply).toBe('echo:やあ');
    expect(r.ok && typeof r.durationMs).toBe('number');
  });

  it('stream:false で送る (逐次応答は未対応 — 部分応答を確定扱いしないため)', async () => {
    const f = chatServer();
    await chatOllama({ model: 'llama3.2:latest', prompt: 'x' }, f, '');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.at(-1);
    const sent = JSON.parse(String(call?.[1].body ?? '{}')) as { stream?: boolean };
    expect(sent.stream).toBe(false);
    expect(call?.[1].method).toBe('POST');
  });

  it('system プロンプトを先頭メッセージとして送る', async () => {
    const f = chatServer();
    await chatOllama({ model: 'llama3.2:latest', prompt: '本文', system: '要約器' }, f, '');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.at(-1);
    const sent = JSON.parse(String(call?.[1].body ?? '{}')) as {
      messages: { role: string; content: string }[];
    };
    expect(sent.messages[0]).toEqual({ role: 'system', content: '要約器' });
    expect(sent.messages[1]).toEqual({ role: 'user', content: '本文' });
  });

  it('未取得モデルは pull コマンドと実際にあるモデルを案内する', async () => {
    const r = await chatOllama({ model: 'mistral', prompt: 'やあ' }, chatServer(), '');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe('model-not-found');
    expect(!r.ok && r.message).toContain('ollama pull mistral');
    expect(!r.ok && r.message).toContain('llama3.2:latest');
  });

  it('モデル名の検証は送信前に行う (不正なら 1 本もリクエストを出さない)', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    for (const bad of ['../../etc/passwd', 'http://x/y', 'model name', '']) {
      const r = await chatOllama({ model: bad, prompt: 'x' }, f, '');
      expect(r.ok, bad).toBe(false);
      expect(!r.ok && r.kind).toBe('bad-model');
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('空のプロンプト・NUL 入りは送信しない', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const empty = await chatOllama({ model: 'llama3.2:latest', prompt: '  ' }, f, '');
    expect(!empty.ok && empty.kind).toBe('empty-prompt');
    const nul = await chatOllama({ model: 'llama3.2:latest', prompt: 'a\0b' }, f, '');
    expect(!nul.ok && nul.kind).toBe('bad-input');
    expect(f).not.toHaveBeenCalled();
  });

  it('許可外の接続先へは送らない', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const r = await chatOllama(
      { model: 'llama3.2:latest', prompt: 'x', endpoint: 'http://192.168.1.99:11434' },
      f,
      '192.168.1.10',
    );
    expect(!r.ok && r.kind).toBe('bad-endpoint');
    expect(f).not.toHaveBeenCalled();
  });

  it('叩くのは /api/chat と /api/tags だけ (書き込み系を呼ばない)', async () => {
    const f = chatServer();
    await chatOllama({ model: 'mistral', prompt: 'x' }, f, ''); // 404 → tags も引く経路
    const urls = (f as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThan(1);
    for (const u of urls) expect(u).toMatch(/\/api\/(chat|tags)$/);
  });

  it('到達不能と CORS 拒否を取り違えない', async () => {
    const down = await chatOllama({ model: 'llama3.2:latest', prompt: 'x' }, unreachableFetch(), '');
    expect(!down.ok && down.kind).toBe('not-running');
    const blocked = await chatOllama(
      { model: 'llama3.2:latest', prompt: 'x' },
      corsBlockedFetch(),
      '',
    );
    expect(!blocked.ok && blocked.kind).toBe('cors-blocked');
    expect(!blocked.ok && blocked.message).toContain('OLLAMA_ORIGINS');
  });

  it('HTTP 200 でも本文にエラーが載っていれば失敗として扱う', async () => {
    const f = vi.fn(async () =>
      json({ error: 'model requires more system memory (37.9 GiB) than is available (14.2 GiB)' }),
    ) as unknown as typeof fetch;
    const r = await chatOllama({ model: 'llama3.2:latest', prompt: 'x' }, f, '');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe('out-of-memory');
  });

  it('JSON でない応答は bad-response', async () => {
    const f = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
    const r = await chatOllama({ model: 'llama3.2:latest', prompt: 'x' }, f, '');
    expect(!r.ok && r.kind).toBe('bad-response');
  });

  it('https トンネル経由でも送れる', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://abc.trycloudflare.com/api/chat');
      return json({ message: { role: 'assistant', content: 'ok' } });
    }) as unknown as typeof fetch;
    const r = await chatOllama(
      { model: 'llama3.2:latest', prompt: 'x', endpoint: 'https://abc.trycloudflare.com' },
      f,
      'hiroto1977.github.io',
    );
    expect(r.ok && r.reply).toBe('ok');
  });
});

/*
 * setupCommands — 「はじめて使う人」に出す通し手順。
 *
 * originsSetupSteps は「Ollama は入っていて、あとは許可だけ」の人向け。実際に
 * 詰まるのはその手前 (未導入 / モデルが無い) なので、こちらは導入からモデル取得・
 * 許可・再起動・確認までを 1 ブロックにまとめる。**貼れば終わる**ことが要件なので、
 * 「段が抜けていない」ことをここで固定する。
 */
describe('setupCommands', () => {
  const OSES = ['macOS', 'Linux (systemd)', 'Windows (PowerShell)'];

  it('主要 OS ＋「1 回だけ試す」の 4 ブロックを返す', () => {
    const cmds = setupCommands('https://claude.ai');
    expect(cmds.map((c) => c.os).slice(0, 3)).toEqual(OSES);
    expect(cmds).toHaveLength(4);
  });

  it('どのブロックにも モデル取得・許可・確認 が入っている (段抜けを防ぐ)', () => {
    for (const c of setupCommands('https://claude.ai')) {
      expect(c.command, c.os).toContain(`ollama pull ${DEFAULT_SETUP_MODEL}`);
      expect(c.command, c.os).toContain('OLLAMA_ORIGINS');
      expect(c.command, c.os).toContain('https://claude.ai');
    }
    // 確認コマンドは常駐設定を伴う 3 OS 向け (「1回だけ試す」は serve が前面で走る)。
    for (const c of setupCommands('https://claude.ai').slice(0, 3)) {
      expect(c.command, c.os).toContain('/api/version');
    }
  });

  it('導入手順を含む — ただし macOS は公式スクリプトが Linux 向けなのでアプリ導入を案内', () => {
    const [mac, linux, win] = setupCommands('https://claude.ai');
    expect(mac?.command).toContain('ollama.com/download');
    expect(mac?.command).not.toContain('install.sh');
    expect(linux?.command).toContain('install.sh');
    expect(win?.command).toContain('winget install');
  });

  it('既に入っている人には何もしない形にする (command -v での分岐)', () => {
    const [, linux, win] = setupCommands('https://claude.ai');
    expect(linux?.command).toContain('command -v ollama >/dev/null ||');
    expect(win?.command).toContain('Get-Command ollama');
  });

  it('origin が特定できない場合のみ * を使う (file:// や sandbox)', () => {
    for (const origin of ['null', '']) {
      for (const c of setupCommands(origin)) {
        expect(c.command).toContain('OLLAMA_ORIGINS');
        expect(c.command).toContain('*');
        expect(c.command).not.toContain('"null"');
      }
    }
  });

  it('モデルは差し替えられる', () => {
    for (const c of setupCommands('https://claude.ai', 'qwen2.5:0.5b')) {
      expect(c.command).toContain('ollama pull qwen2.5:0.5b');
    }
  });

  it('取得・削除系の API は一切出てこない (利用者にも叩かせない)', () => {
    for (const c of setupCommands('https://claude.ai')) {
      expect(c.command).not.toMatch(/\/api\/(pull|create|push|copy|delete|blobs|upload)/);
    }
  });
});

/*
 * 配信元 CSP による遮断の切り分け。
 *
 * claude.ai のアーティファクトは `connect-src 'self'` で配信されるため、
 * ローカルへの fetch はサーバに届く前にブラウザが落とす。この失敗は「Ollama が
 * 起動していない」ときと **まったく同じ形** で観測される (通常 fetch も no-cors も
 * 失敗する)。素直に判定すると not-running と誤診し、利用者を「Ollama を入れて
 * 起動する」という **絶対に解決しない作業** へ送り込む。
 * securitypolicyviolation の有無で確定できることをここで固定する。
 */
describe('probeOllama — 配信元 CSP による遮断', () => {
  /** CSP 違反が観測された状態の watcher。 */
  const hitWatcher = () => ({ hit: () => true, stop: () => undefined });
  /** 違反なしの watcher。 */
  const missWatcher = () => ({ hit: () => false, stop: () => undefined });

  it('CSP 違反が出ていれば csp-blocked (未起動と混同しない)', async () => {
    const r = await probeOllama(11434, unreachableFetch(), '', hitWatcher);
    expect(r.status).toBe('csp-blocked');
    expect(r.message).toContain('CSP');
    expect(r.snapshot.running).toBe(false);
  });

  it('csp-blocked のときは Ollama 側の設定を促さない (解決しないため)', async () => {
    const r = await probeOllama(11434, unreachableFetch(), '', hitWatcher);
    expect(r.message).not.toContain('OLLAMA_ORIGINS');
    expect(r.message).toContain('解決しません');
  });

  it('同じ失敗でも違反が無ければ not-running のまま', async () => {
    const r = await probeOllama(11434, unreachableFetch(), '', missWatcher);
    expect(r.status).toBe('not-running');
  });

  it('CORS 拒否 (no-cors は通る) より CSP を優先する — 送信すらできていないため', async () => {
    const r = await probeOllama(11434, corsBlockedFetch(), '', hitWatcher);
    expect(r.status).toBe('csp-blocked');
  });

  it('接続できている場合は watcher を見ない', async () => {
    const r = await probeOllama(11434, healthyFetch('0.5.4', []), '', hitWatcher);
    expect(r.status).toBe('ok');
  });

  it('違反イベントが遅れて届いても取りこぼさない', async () => {
    // 実ブラウザでは securitypolicyviolation は **タスク** として配送されるため、
    // fetch の reject 直後に読むとまだ届いていない。実際にこれで not-running と
    // 誤診するのを E2E で踏んだので、遅延到着を再現して固定する。
    const late = () => {
      let seen = false;
      setTimeout(() => (seen = true), 10);
      return { hit: () => seen, stop: () => undefined };
    };
    const r = await probeOllama(11434, unreachableFetch(), '', late);
    expect(r.status).toBe('csp-blocked');
  });

  it('監視は必ず解除する (リスナを積み残さない)', async () => {
    let stopped = 0;
    const counting = () => ({ hit: () => false, stop: () => void stopped++ });
    await probeOllama(11434, healthyFetch('0.5.4', []), '', counting);
    await probeOllama(11434, unreachableFetch(), '', counting);
    expect(stopped).toBe(2);
  });
});

describe('createCspWatcher', () => {
  it('document が無い環境 (Node) でも安全に動く', () => {
    const w = createCspWatcher('http://127.0.0.1:11434/api/version');
    expect(w.hit()).toBe(false);
    expect(() => w.stop()).not.toThrow();
  });
});

/*
 * desktopSetupCommands — デスクトップ (Electron) 版向けの簡略手順。
 *
 * main プロセスが直接叩くため CORS が存在せず、OLLAMA_ORIGINS は一切不要。
 * ブラウザ版の通し手順をそのまま出すと、やらなくていい sudo / launchctl 作業を
 * 初心者に課すことになる。「不要な段を出さない」ことが要件。
 */
describe('desktopSetupCommands', () => {
  it('導入とモデル取得だけで、許可設定 (OLLAMA_ORIGINS) を含まない', () => {
    for (const c of desktopSetupCommands()) {
      expect(c.command, c.os).toContain(`ollama pull ${DEFAULT_SETUP_MODEL}`);
      expect(c.command, c.os).not.toContain('OLLAMA_ORIGINS');
      expect(c.command, c.os).not.toContain('sudo');
      expect(c.command, c.os).not.toContain('launchctl');
    }
  });

  it('3 OS ぶんを返し、既導入なら何もしない形にする', () => {
    const cmds = desktopSetupCommands();
    expect(cmds.map((c) => c.os)).toEqual(['Linux', 'macOS', 'Windows (PowerShell)']);
    expect(cmds[0]?.command).toContain('command -v ollama >/dev/null ||');
    expect(cmds[2]?.command).toContain('Get-Command ollama');
  });

  it('モデルは差し替えられる', () => {
    for (const c of desktopSetupCommands('qwen2.5:0.5b')) {
      expect(c.command).toContain('ollama pull qwen2.5:0.5b');
    }
  });

  it('取得・削除系の API は出てこない', () => {
    for (const c of desktopSetupCommands()) {
      expect(c.command).not.toMatch(/\/api\/(pull|create|push|copy|delete|blobs|upload)/);
    }
  });
});

// --- 貼り付けるコマンドを 1 文字ずつ固定する ------------------------------
//
// ここで出しているのは **利用者がそのまま端末へ貼り付ける文字列** である。
// 行が 1 本落ちても「含む/含まない」の検査は通ってしまい、利用者は
// 途中で止まる手順を渡される。文言そのものが成果物なので golden で固定する。

describe('セットアップ手順の golden', () => {
  it('setupCommands — 4 ブロックすべて', () => {
    expect(setupCommands('https://claude.ai')).toMatchSnapshot('origin-claude-ai');
  });

  it('setupCommands — origin が特定できないとき (file:// / sandbox)', () => {
    expect(setupCommands('null')).toMatchSnapshot('origin-null');
    expect(setupCommands('')).toMatchSnapshot('origin-empty');
  });

  it('setupCommands — モデルを差し替えたとき', () => {
    expect(setupCommands('https://claude.ai', 'qwen2.5:0.5b')).toMatchSnapshot('model-qwen');
  });

  it('desktopSetupCommands — 既定モデルと差し替え', () => {
    expect(desktopSetupCommands()).toMatchSnapshot('desktop-default');
    expect(desktopSetupCommands('qwen2.5:0.5b')).toMatchSnapshot('desktop-qwen');
  });

  it('originsSetupSteps — 許可だけを足す手順', () => {
    expect(originsSetupSteps('https://claude.ai')).toMatchSnapshot('origins-claude-ai');
    expect(originsSetupSteps('null')).toMatchSnapshot('origins-null');
  });

  it('貼り付ける文字列に空行だけの段が無い (行が落ちた形を検出する)', () => {
    for (const c of setupCommands('https://claude.ai')) {
      // 連続する改行 3 つ以上 = 段が抜けた跡
      expect(c.command, c.os).not.toMatch(/\n\s*\n\s*\n/);
      expect(c.command.trim(), c.os).not.toBe('');
      expect(c.os.trim(), 'os ラベル').not.toBe('');
    }
    for (const s of originsSetupSteps('https://claude.ai')) {
      expect(s.command.trim(), s.os).not.toBe('');
      expect(s.os.trim(), 'os ラベル').not.toBe('');
    }
  });
});

// --- ブラウザの器を差し替えて通す ----------------------------------------
//
// このテストは node 環境で走るので `localStorage` も `document` も無い。
// 無いままだと該当の関数は 1 行も実行されず、「検査がある」ように見えて
// 中身は測られていない状態になる。器を差し替えて実際に通す。

describe('loadEndpointSetting — 保存済みの接続先を読む', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  function useStore(get: (k: string) => string | null) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: get },
      configurable: true,
    });
  }
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('新キーがあれば新キー', () => {
    useStore((k) => (k === OLLAMA_ENDPOINT_KEY ? 'https://tunnel.example' : '11434'));
    expect(loadEndpointSetting()).toBe('https://tunnel.example');
  });

  it('新キーが無ければ旧キー (ポート番号のみ保存していた頃の互換)', () => {
    useStore((k) => (k === OLLAMA_PORT_KEY ? '11434' : null));
    expect(loadEndpointSetting()).toBe('11434');
  });

  it('どちらも無ければ空文字', () => {
    useStore(() => null);
    expect(loadEndpointSetting()).toBe('');
  });

  it('localStorage が使えない環境 (プライベートモード等) でも空文字を返す', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
    expect(loadEndpointSetting()).toBe('');
  });

  it('キー名は固定 (変わると保存済みの設定が読めなくなる)', () => {
    expect(OLLAMA_ENDPOINT_KEY).toBe('servicehub.ollama.endpoint');
    expect(OLLAMA_PORT_KEY).toBe('servicehub.ollama.port');
  });
});

describe('createCspWatcher — CSP 遮断を「未起動」と誤診しないための材料', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let listeners: ((e: unknown) => void)[] = [];

  beforeEach(() => {
    listeners = [];
    Object.defineProperty(globalThis, 'document', {
      value: {
        addEventListener: (_type: string, fn: (e: unknown) => void) => listeners.push(fn),
        removeEventListener: (_type: string, fn: (e: unknown) => void) => {
          listeners = listeners.filter((f) => f !== fn);
        },
      },
      configurable: true,
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as { document?: unknown }).document;
  });

  const fire = (e: unknown) => listeners.forEach((f) => f(e));
  const URL_ = 'http://127.0.0.1:11434/api/version';

  it('登録直後は何も見ていない', () => {
    expect(createCspWatcher(URL_).hit()).toBe(false);
  });

  it('blockedURI が対象 URL の前方一致なら遮断とみなす (オリジンまで切り詰められる)', () => {
    const w = createCspWatcher(URL_);
    fire({ blockedURI: 'http://127.0.0.1:11434', violatedDirective: '' });
    expect(w.hit()).toBe(true);
  });

  it('blockedURI が別の宛先なら遮断とみなさない', () => {
    const w = createCspWatcher(URL_);
    fire({ blockedURI: 'https://evil.example', violatedDirective: 'img-src' });
    expect(w.hit()).toBe(false);
  });

  it('blockedURI が取れなくても connect-src 違反なら遮断とみなす', () => {
    const w = createCspWatcher(URL_);
    fire({ blockedURI: '', violatedDirective: 'connect-src' });
    expect(w.hit()).toBe(true);
  });

  it('別のディレクティブ違反は拾わない', () => {
    const w = createCspWatcher(URL_);
    fire({ blockedURI: '', violatedDirective: 'script-src' });
    expect(w.hit()).toBe(false);
  });

  it('文字列でない値が来ても落ちない', () => {
    const w = createCspWatcher(URL_);
    expect(() => fire({ blockedURI: 42, violatedDirective: null })).not.toThrow();
    expect(w.hit()).toBe(false);
  });

  it('stop すると以後の違反を拾わない', () => {
    const w = createCspWatcher(URL_);
    w.stop();
    fire({ blockedURI: '', violatedDirective: 'connect-src' });
    expect(w.hit()).toBe(false);
    expect(listeners).toHaveLength(0);
  });
});

// --- 利用者に出す文言を 1 文字ずつ固定する --------------------------------
//
// probe / chat の `message` は「つながらない理由と次の一手」そのもので、
// これが空や別物になると、利用者は解決しない作業へ送られる。status だけを
// 見る検査では文言が落ちても通るので、結果を丸ごと golden で固定する。

describe('つながらない理由の文言 golden', () => {
  const noCsp = () => ({ hit: () => false, stop: () => undefined });

  it('接続先が不正 (許可されない宛先)', async () => {
    expect(await probeOllama('http://evil.example:11434', unreachableFetch(), '', noCsp))
      .toMatchSnapshot('bad-endpoint');
  });

  it('未起動 (通常 fetch も no-cors も失敗)', async () => {
    expect(await probeOllama(11434, unreachableFetch(), '', noCsp)).toMatchSnapshot('not-running');
  });

  it('起動しているが CORS 未許可', async () => {
    expect(await probeOllama(11434, corsBlockedFetch(), '', noCsp)).toMatchSnapshot('cors-blocked');
  });

  it('配信元 CSP が塞いでいる (未起動と区別する)', async () => {
    const csp = () => ({ hit: () => true, stop: () => undefined });
    expect(await probeOllama(11434, unreachableFetch(), '', csp)).toMatchSnapshot('csp-blocked');
  });

  it('接続成功', async () => {
    expect(await probeOllama(11434, healthyFetch('0.5.4', []), '', noCsp)).toMatchSnapshot('ok');
  });

  it('古い版は警告つきで返す', async () => {
    expect(await probeOllama(11434, healthyFetch('0.1.45', []), '', noCsp)).toMatchSnapshot('outdated');
  });
});

describe('chatOllama の失敗文言 golden', () => {
  const base = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };

  it('接続先が不正', async () => {
    expect(await chatOllama({ ...base, endpoint: 'http://evil.example' }, unreachableFetch(), ''))
      .toMatchSnapshot('bad-endpoint');
  });

  it('モデル名が不正', async () => {
    expect(await chatOllama({ ...base, model: '../evil' }, unreachableFetch(), ''))
      .toMatchSnapshot('bad-model');
  });

  it('プロンプトが空', async () => {
    expect(await chatOllama({ ...base, prompt: '   ' }, unreachableFetch(), ''))
      .toMatchSnapshot('empty-prompt');
  });

  it('未起動', async () => {
    expect(await chatOllama(base, unreachableFetch(), '')).toMatchSnapshot('not-running');
  });

  it('CORS 未許可', async () => {
    expect(await chatOllama(base, corsBlockedFetch(), '')).toMatchSnapshot('cors-blocked');
  });

  it('文言が空になっていない (段が落ちた形を検出する)', async () => {
    const outcomes = [
      await chatOllama({ ...base, endpoint: 'http://evil.example' }, unreachableFetch(), ''),
      await chatOllama({ ...base, model: '../evil' }, unreachableFetch(), ''),
      await chatOllama({ ...base, prompt: '   ' }, unreachableFetch(), ''),
      await chatOllama(base, unreachableFetch(), ''),
    ];
    for (const o of outcomes) {
      expect(o.ok).toBe(false);
      if (!o.ok) {
        expect(o.message.trim(), o.kind).not.toBe('');
        expect(o.kind.trim()).not.toBe('');
      }
    }
  });
});

// --- chat の応答を実際に通す ----------------------------------------------
//
// これまで chat は失敗経路しか通っておらず、**成功したときに何を返すかを
// 誰も見ていなかった**。返信の取り出し・200 でも本文にエラーが載る経路・
// 大きすぎる応答・JSON でない応答は、どれも利用者の画面に直接出る。

describe('chatOllama — 応答の解釈', () => {
  const base = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };
  /** /api/chat に応答を返す fetch。 */
  const chatFetch = (body: unknown, status = 200, tags?: unknown) =>
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/tags')) return json(tags ?? { models: [] });
      if (u.endsWith('/api/chat')) {
        return typeof body === 'string' ? new Response(body, { status }) : json(body, status);
      }
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof fetch;
  const sentBody = (f: typeof fetch) => {
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find(
      (c) => String(c[0]).endsWith('/api/chat'),
    )!;
    return { init: call[1], json: JSON.parse(String(call[1].body)) as Record<string, unknown> };
  };

  it('返信を取り出し、前後の空白を落とす', async () => {
    const r = await chatOllama(base, chatFetch({ message: { content: '  はい  ' } }), '');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reply).toBe('はい');
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.durationMs)).toBe(true);
    }
  });

  it('返信が文字列でなければ空文字 (undefined を画面へ流さない)', async () => {
    for (const body of [{ message: {} }, { message: { content: 42 } }, {}, null]) {
      const r = await chatOllama(base, chatFetch(body), '');
      expect(r.ok, JSON.stringify(body)).toBe(true);
      if (r.ok) expect(r.reply).toBe('');
    }
  });

  it('system を渡すと messages の先頭に載る', async () => {
    const f = chatFetch({ message: { content: 'ok' } });
    await chatOllama({ ...base, system: '簡潔に' }, f, '');
    const sent = sentBody(f).json as { messages: unknown[]; stream: boolean };
    expect(sent.messages).toEqual([
      { role: 'system', content: '簡潔に' },
      { role: 'user', content: 'こんにちは' },
    ]);
    // 逐次応答は使わない (この画面は 1 往復で完結させる)
    expect(sent.stream).toBe(false);
  });

  it('system が空なら user だけ', async () => {
    const f = chatFetch({ message: { content: 'ok' } });
    await chatOllama({ ...base, system: '   ' }, f, '');
    const { init, json: sent } = sentBody(f);
    expect((sent as { messages: unknown[] }).messages).toEqual([
      { role: 'user', content: 'こんにちは' },
    ]);
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.method).toBe('POST');
  });

  it('HTTP 200 でも本文にエラーが載っていれば失敗として扱う', async () => {
    const r = await chatOllama(base, chatFetch({ error: 'no such model' }), '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('model-not-found');
      expect(r.message).toContain('llama3.2:1b');
    }
  });

  it('JSON でない応答は bad-response', async () => {
    const r = await chatOllama(base, chatFetch('not json'), '');
    expect(r).toEqual({
      ok: false,
      kind: 'bad-response',
      message: 'Ollama が JSON 以外を返しました。',
    });
  });

  it('大きすぎる応答は途中で切って too-large', async () => {
    const huge = JSON.stringify({ message: { content: 'x'.repeat(3 * 1024 * 1024) } });
    const r = await chatOllama(base, chatFetch(huge), '');
    expect(r).toEqual({
      ok: false,
      kind: 'too-large',
      message: '応答が大きすぎたため中断しました。',
    });
  });

  /*
   * **上限超過「だけ」を too-large にする。**
   *
   * 本 PR で `isOverCap` を足したのは、打ち切りや接続断まで「大きすぎます」と
   * 報せないためだった。ところが**その区別を確かめる検査を書いていなかった**
   * —— 変異検査で `isOverCap(e)` を `true` に潰しても鳴らなかった
   * (2026-08-31 実測)。自分で足した分岐の穴である。
   *
   * 本文の途中で壊れる応答を作る。読み出しは上限とは無関係に失敗するので、
   * `too-large` ではない種別で返らなければならない。
   */
  it('★ 上限とは無関係な読み出し失敗は too-large にしない', async () => {
    const broken = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"message":'));
            c.error(new Error('stream broke'));
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/tags')) return json({ models: [] });
      if (u.endsWith('/api/chat')) return broken();
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof fetch;

    const r = await chatOllama(base, f, '').catch((e: Error) => ({ thrown: e.message }));
    expect(JSON.stringify(r), '大きすぎる扱いにしない').not.toContain('too-large');
  });

  it('HTTP エラーは分類して「次の一手」まで返す', async () => {
    const r = await chatOllama(base, chatFetch({ error: 'no such model' }, 404), '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('ollama pull llama3.2:1b');
  });

  it('未取得モデルのときだけ、実際にあるモデルを添える', async () => {
    const tags = { models: [{ name: 'llama3.2:latest' }] };
    const r = await chatOllama(base, chatFetch({ error: 'no such model' }, 404, tags), '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('llama3.2:latest');

    // モデル未取得以外では一覧を引きに行かない
    const other = await chatOllama(base, chatFetch({ error: 'boom' }, 500, tags), '');
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.message).not.toContain('llama3.2:latest');
  });

  it('本文が読めない HTTP エラーでも落ちない', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/chat')) {
        return {
          ok: false,
          status: 500,
          text: () => Promise.reject(new Error('boom')),
        } as unknown as Response;
      }
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.trim()).not.toBe('');
  });

  it('NUL を含む入力は bad-input で弾く (制御文字は通さない)', async () => {
    const r = await chatOllama({ ...base, prompt: 'a\u0000b' }, chatFetch({}), '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('bad-input');
  });
});

// --- 通信の枠 (中断・上限・no-cors) --------------------------------------
//
// タイムアウトとサイズ上限は、相手が壊れているときにこちらを巻き込まれない
// ための枠である。枠が外れても正常系は素通りするので、枠そのものを見る。

describe('通信の枠', () => {
  it('中断シグナルを渡している (相手が黙り込んでも待ち続けない)', async () => {
    let signal: AbortSignal | undefined;
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/api/version')) {
        signal = init?.signal ?? undefined;
        return json({ version: '0.5.4' });
      }
      return json({ models: [] });
    }) as unknown as typeof fetch;
    await probeOllama(11434, f, '', () => ({ hit: () => false, stop: () => undefined }));
    expect(signal).toBeInstanceOf(AbortSignal);
    // 正常終了後は中断されていない (finally の clearTimeout が効いている)
    expect(signal?.aborted).toBe(false);
  });

  it('到達確認は no-cors で行う (中身は読めなくても届いたことは分かる)', async () => {
    const modes: (string | undefined)[] = [];
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      modes.push(init?.mode);
      if (init?.mode === 'no-cors') return new Response(null, { status: 204 });
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', () => ({ hit: () => false, stop: () => undefined }));
    expect(r.status).toBe('cors-blocked');
    expect(modes).toContain('no-cors');
  });

  it('大きすぎる応答は読み捨てる (診断が丸ごと落ちない)', async () => {
    const huge = 'x'.repeat(3 * 1024 * 1024);
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return new Response(huge, { status: 200 });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', () => ({ hit: () => false, stop: () => undefined }));
    // 読めなかったのでバージョンは空のまま。落ちないことが要件。
    expect(r.snapshot.version).toBe('');
  });

  it('HTTP エラーには最初の「次の一手」まで添える', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return json({ error: 'no such model' }, 500);
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', () => ({ hit: () => false, stop: () => undefined }));
    expect(r.status).toBe('error');
    expect(r.message).toContain('HTTP 500');
    // 手順が無ければ利用者は動けない
    expect(r.message).toContain('ollama pull');
  });

  it('手順が無いエラーでは余計な空白を足さない', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return json({}, 500);
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', () => ({ hit: () => false, stop: () => undefined }));
    expect(r.message).toBe('Ollama が HTTP 500 を返しました。Ollama が HTTP 500 を返しました。');
    expect(r.message.endsWith(' ')).toBe(false);
  });
});

describe('モデル一覧の取得が失敗しても案内は出す', () => {
  const base = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };

  it('一覧が HTTP エラーでも chat の案内は返る', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) return json({}, 500);
      return json({ error: 'no such model' }, 404);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('model-not-found');
      expect(r.message).toContain('ollama pull llama3.2:1b');
      expect(r.message).toContain('まだ 1 つもモデルがありません');
    }
  });

  it('一覧の取得が例外でも落ちない', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) throw new TypeError('Failed to fetch');
      return json({ error: 'no such model' }, 404);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('ollama pull llama3.2:1b');
  });

  it('一覧が読めない形でも落ちない', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) return new Response('not json', { status: 200 });
      return json({ error: 'no such model' }, 404);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('ollama pull llama3.2:1b');
  });
});

// --- 残りの経路 ------------------------------------------------------------

describe('chatOllama — 配信元 CSP が塞いでいるとき', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as { document?: unknown }).document;
  });

  it('未起動ではなく csp-blocked として返す (Ollama 側では解決しないと言う)', async () => {
    // 違反イベントを即座に発火させる document を置く。
    Object.defineProperty(globalThis, 'document', {
      value: {
        addEventListener: (_t: string, fn: (e: unknown) => void) => {
          setTimeout(() => fn({ blockedURI: '', violatedDirective: 'connect-src' }), 0);
        },
        removeEventListener: () => undefined,
      },
      configurable: true,
    });
    const r = await chatOllama(
      { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' },
      unreachableFetch(),
      '',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('csp-blocked');
      expect(r.message).toBe(
        'このページの配信元が CSP でローカルへの接続を禁止しているため送信できません。' +
          'Ollama 側の設定では解決しません。',
      );
    }
  });
});

describe('createCspWatcher — 監視の配線', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let added: [string, unknown][] = [];
  let removed: [string, unknown][] = [];

  beforeEach(() => {
    added = [];
    removed = [];
    Object.defineProperty(globalThis, 'document', {
      value: {
        addEventListener: (t: string, fn: unknown) => added.push([t, fn]),
        removeEventListener: (t: string, fn: unknown) => removed.push([t, fn]),
      },
      configurable: true,
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as { document?: unknown }).document;
  });

  it('securitypolicyviolation を購読し、stop で同じものを外す', () => {
    const w = createCspWatcher('http://127.0.0.1:11434/api/version');
    expect(added.map((a) => a[0])).toEqual(['securitypolicyviolation']);
    w.stop();
    expect(removed.map((r) => r[0])).toEqual(['securitypolicyviolation']);
    // 登録したものと同じ関数を外している (別物だと解除できずに溜まる)
    expect(removed[0]![1]).toBe(added[0]![1]);
  });
});

describe('診断の問い合わせ方', () => {
  const noCsp = () => ({ hit: () => false, stop: () => undefined });

  it('キャッシュを使わない (古い応答で「動いている」と誤診しない)', async () => {
    const inits: RequestInit[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      inits.push(init ?? {});
      if (String(url).endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    await probeOllama(11434, f, '', noCsp);
    expect(inits).toHaveLength(2);
    for (const i of inits) expect(i.cache).toBe('no-store');
  });

  it('404 以外の版問い合わせ失敗はそこで返す (tags を試さない)', async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return json({ error: 'boom' }, 500);
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.status).toBe('error');
    expect(urls.filter((u) => u.endsWith('/api/tags'))).toHaveLength(0);
  });
});

describe('所要時間', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'performance', original);
    else delete (globalThis as { performance?: unknown }).performance;
  });

  const okFetch = () =>
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/chat')) return json({ message: { content: 'ok' } });
      return json({ models: [] });
    }) as unknown as typeof fetch;
  const input = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };

  it('performance があれば使う', async () => {
    let calls = 0;
    Object.defineProperty(globalThis, 'performance', {
      value: { now: () => (calls++ === 0 ? 1000 : 1250) },
      configurable: true,
    });
    const r = await chatOllama(input, okFetch(), '');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.durationMs).toBe(250);
  });

  it('performance が無い環境でも所要時間を出す', async () => {
    delete (globalThis as { performance?: unknown }).performance;
    const r = await chatOllama(input, okFetch(), '');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(r.durationMs)).toBe(true);
    }
  });

  it('時計が巻き戻っても負の時間を出さない', async () => {
    let calls = 0;
    Object.defineProperty(globalThis, 'performance', {
      value: { now: () => (calls++ === 0 ? 5000 : 1000) },
      configurable: true,
    });
    const r = await chatOllama(input, okFetch(), '');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.durationMs).toBe(0);
  });
});

// --- 「読めなかった」を null で言い切る -------------------------------------

describe('parseJsonOrNull', () => {
  it('読める JSON はそのまま', () => {
    expect(parseJsonOrNull('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonOrNull('null')).toBeNull();
  });

  it('読めなければ null を返す (undefined ではない)', () => {
    // 呼び出し側では null と undefined がどちらも「詳細なし」に潰れるため、
    // ここで区別を固定しておかないと約束が確かめられない。
    const r = parseJsonOrNull('not json');
    expect(r).toBeNull();
    expect(r).not.toBeUndefined();
  });
});

describe('pageHost', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'location', original);
    else delete (globalThis as { location?: unknown }).location;
  });

  it('location が無ければ空文字 (何も許さない側に倒す)', () => {
    delete (globalThis as { location?: unknown }).location;
    expect(pageHost()).toBe('');
  });

  it('location があればそのホスト名', () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: '192.168.1.10' },
      configurable: true,
    });
    expect(pageHost()).toBe('192.168.1.10');
  });
});

describe('配信ホストの既定値', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'location', original);
    else delete (globalThis as { location?: unknown }).location;
  });

  it('省略すると配信ホストが使われ、同じホストの http が通る', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: '192.168.1.10' },
      configurable: true,
    });
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    // 第 3 引数を渡さない = 既定値の経路。同じホストなので許可される。
    const r = await probeOllama('http://192.168.1.10:11434', f);
    expect(r.status).toBe('ok');
  });

  it('location が無ければ別ホストの http は通らない', async () => {
    delete (globalThis as { location?: unknown }).location;
    const r = await probeOllama('http://192.168.1.10:11434', unreachableFetch());
    expect(r.status).toBe('bad-endpoint');
  });

  it('接続先を省略すると既定のループバックを見る', async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(undefined, f, '');
    expect(r.status).toBe('ok');
    expect(urls[0]).toBe('http://127.0.0.1:11434/api/version');
  });
});

// --- 違反イベントの読み方 ---------------------------------------------------

describe('createCspWatcher — 違反イベントの照合', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let fire: (e: unknown) => void = () => undefined;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: {
        addEventListener: (_t: string, fn: (e: unknown) => void) => {
          fire = fn;
        },
        removeEventListener: () => undefined,
      },
      configurable: true,
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as { document?: unknown }).document;
  });

  const URL_UNDER_TEST = 'http://127.0.0.1:11434/api/version';

  it('blockedURI がオリジンまで切り詰められていても前方一致で拾う', () => {
    const w = createCspWatcher(URL_UNDER_TEST);
    fire({ blockedURI: 'http://127.0.0.1:11434', violatedDirective: '' });
    expect(w.hit()).toBe(true);
  });

  it('別の宛先の違反は拾わない', () => {
    const w = createCspWatcher(URL_UNDER_TEST);
    fire({ blockedURI: 'https://example.com', violatedDirective: 'img-src' });
    expect(w.hit()).toBe(false);
  });

  it('blockedURI が空でも全件一致にしない (空文字は誰にでも前方一致する)', () => {
    const w = createCspWatcher(URL_UNDER_TEST);
    fire({ blockedURI: '', violatedDirective: 'img-src' });
    expect(w.hit()).toBe(false);
  });

  it('blockedURI が文字列でなくても落ちず、拾わない', () => {
    const w = createCspWatcher(URL_UNDER_TEST);
    fire({ blockedURI: 42, violatedDirective: 'img-src' });
    expect(w.hit()).toBe(false);
  });

  it('ディレクティブ名だけでも connect-src なら拾う (前方一致)', () => {
    const w = createCspWatcher(URL_UNDER_TEST);
    // 実ブラウザは 'connect-src' の後ろに違反元を足すことがある。
    fire({ blockedURI: 'https://other.example', violatedDirective: 'connect-src blob:' });
    expect(w.hit()).toBe(true);
  });

  it('ディレクティブが文字列でなくても落ちず、拾わない', () => {
    const w = createCspWatcher(URL_UNDER_TEST);
    fire({ blockedURI: 'https://other.example', violatedDirective: null });
    expect(w.hit()).toBe(false);
  });

  it('末尾一致では拾わない (別ディレクティブの巻き添えを避ける)', () => {
    const w = createCspWatcher(URL_UNDER_TEST);
    fire({ blockedURI: 'https://other.example', violatedDirective: 'default-src connect-src' });
    expect(w.hit()).toBe(false);
  });
});

describe('CSP 判定の待ち方', () => {
  it('すでに違反を検知していれば待たずに答える', async () => {
    let hits = 0;
    const watcher = () => ({
      hit: () => {
        hits += 1;
        return true;
      },
      stop: () => undefined,
    });
    const r = await probeOllama(11434, unreachableFetch(), '', watcher);
    expect(r.status).toBe('csp-blocked');
    // 1 回目で true なら猶予を挟まない。挟むと hit() は 2 回呼ばれる。
    expect(hits).toBe(1);
  });

  it('猶予のあとに違反が届いた場合も拾う', async () => {
    let hits = 0;
    const watcher = () => ({
      hit: () => {
        hits += 1;
        return hits > 1;
      },
      stop: () => undefined,
    });
    const r = await probeOllama(11434, unreachableFetch(), '', watcher);
    expect(r.status).toBe('csp-blocked');
    expect(hits).toBe(2);
  });
});

// --- 通信の枠 (時間切れ・後始末・上限) --------------------------------------

describe('時間切れと後始末', () => {
  const noCsp = () => ({ hit: () => false, stop: () => undefined });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('黙り込んだ相手は時間切れで打ち切る', async () => {
    vi.useFakeTimers();
    const f = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    const p = probeOllama(11434, f, '', noCsp);
    await vi.advanceTimersByTimeAsync(120_000);
    const r = await p;
    // 打ち切られなければこの await は解決しない (テストが時間切れになる)。
    expect(r.status).toBe('not-running');
  });

  /*
   * **この検査は 2026-08-29 に約束を差し替えた。** 経緯を残す。
   *
   * 元は「応答が済んだ時点で timer が 0 本」を見ていた (`getTimerCount() === 0`)。
   * 解除し忘れを捕まえるための検査で、意図は正しかった。**ところがその
   * 「解除」自体が欠陥だった** —— `fetch` はヘッダーで解決するので、
   * 解除した時点で**本文はまだ流れていない**。ヘッダーだけ返して黙る相手には
   * 打ち切りが掛からず、レンダラーは 1 スレッドなので画面ごと止まる。
   *
   * つまり旧い約束は「画面が止まらないこと」と**両立しない**。
   * `withBodyDeadline` は本文を読み終えるまで timer を生かす道具で、
   * ブラウザ版では既に 3 経路 (`web-shim.ts` の `timedFetch` ほか) が
   * 同じ代償を払っている。
   *
   * そこで見る物を「0 本であること」から**「溜まらないこと」**へ移す。
   * 残った timer が締切とともに自分で消えることを実際に進めて確かめる ——
   * こちらのほうが強い検査でもある。**締切の窓の間、見張りが実際に
   * 起きていること**まで言えるからで、旧い検査はそれを言えなかった。
   */
  it('★ 見張りは本文の間だけ残り、締切とともに自分で消える', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return json({ version: '0.5.4' });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.status).toBe('ok');
    // 応答が済んでも見張りは**わざと**残っている。本文がまだ流れている
    // かもしれないため —— ここが 0 なら、黙る相手を打ち切れない。
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    // そして締切が過ぎれば自分で消える (要求ごとに溜まり続けない)。
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('上限ちょうどの応答は読む', async () => {
    const pad = 'y'.repeat(2 * 1024 * 1024 - JSON.stringify({ version: '' }).length);
    const body = JSON.stringify({ version: pad });
    expect(body.length).toBe(2 * 1024 * 1024);
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return new Response(body, { status: 200 });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.snapshot.version).toBe(pad);
  });

  it('上限を 1 バイト超えたら、読める JSON でも読まない', async () => {
    const pad = 'y'.repeat(2 * 1024 * 1024 - JSON.stringify({ version: '' }).length + 1);
    const body = JSON.stringify({ version: pad });
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return new Response(body, { status: 200 });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.snapshot.version).toBe('');
  });

  /*
   * **上限は byte で数える。以前は文字で数えていた。**
   *
   * 定数の名前は `MAX_RESPONSE_BYTES` で、画面の「セキュリティポリシー」欄にも
   * byte として出ている。ところが実装は `res.text()` の結果に `.length` を
   * 当てており、これは **UTF-16 の符号単位の数**であって byte ではない。
   * 日本語は 1 文字 3 byte なので、**名乗っている上限の約 3 倍**が通っていた。
   *
   * 上の 2 件 (ちょうど / 1 超え) が気付けなかったのは、標本が `'y'` の
   * 繰り返し —— **ASCII では文字数と byte 数が一致する**ため。境界の検査は
   * 在ったが、境界が何の境界かを分ける標本が無かった。
   *
   * `readBodyWithCap` へ移して byte で数えるようにした。**厳しくなる側**の
   * 変化で、名前と実体が揃う。
   */
  it('★ 上限は byte で数える (日本語で 3 倍通っていた)', async () => {
    const pad = 'あ'.repeat(1_000_000);
    const body = JSON.stringify({ version: pad });
    // 文字数は上限以下だが、byte 数は上限を超える —— ここが分かれ目。
    expect(body.length).toBeLessThan(MAX_RESPONSE_BYTES);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(MAX_RESPONSE_BYTES);
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return new Response(body, { status: 200 });
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.snapshot.version).toBe('');
  });

  it('到達確認もキャッシュを使わない', async () => {
    const inits: RequestInit[] = [];
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      inits.push(init ?? {});
      if (init?.mode === 'no-cors') return new Response(null, { status: 204 });
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.status).toBe('cors-blocked');
    const noCors = inits.filter((i) => i.mode === 'no-cors');
    expect(noCors).toHaveLength(1);
    expect(noCors[0]!.cache).toBe('no-store');
  });
});

// --- 版問い合わせの失敗経路 -------------------------------------------------

describe('版の問い合わせが失敗したとき', () => {
  const noCsp = () => ({ hit: () => false, stop: () => undefined });
  const versionFails = (body: string, status: number) =>
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/version')) return new Response(body, { status });
      return json({ models: [] });
    }) as unknown as typeof fetch;

  it('403 は CORS 未設定と同じ直し方なので、その手順へ寄せる', async () => {
    const f = versionFails(JSON.stringify({ error: 'Forbidden' }), 403);
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.status).toBe('cors-blocked');
    expect(r.message).toBe(
      'Ollama は http://127.0.0.1:11434 で動作していますが、このページからの読み取りが拒否されました (HTTP 403)。' +
        'Ollama 側に OLLAMA_ORIGINS を設定して再起動してください (下の手順を参照)。',
    );
  });

  it('JSON ですらない本文は詳細として持ち出さない', async () => {
    // 本文は読み捨て済みで手元に無い。無い物を「詳細」として足すと、
    // 画面に出るのは中身のない繰り返しになる。
    const f = versionFails('<html>Internal Server Error</html>', 500);
    const r = await probeOllama(11434, f, '', noCsp);
    expect(r.message).toBe('Ollama が HTTP 500 を返しました。Ollama が HTTP 500 を返しました。');
    expect(r.message).not.toContain('html');
  });
});

// --- 送る前に整える --------------------------------------------------------
//
// 上限も trim も「相手が壊れているときにこちらを巻き込まれない」ための枠。
// 枠が外れても正常系は素通りするので、枠そのものを見る。

describe('chatOllama — 送る前の整形と上限', () => {
  const okChat = () =>
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/chat')) return json({ message: { content: 'ok' } });
      return json({ models: [] });
    }) as unknown as typeof fetch;
  const sent = (f: typeof fetch) => {
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find(
      (c) => String(c[0]).endsWith('/api/chat'),
    )!;
    return JSON.parse(String(call[1].body)) as {
      model: string;
      messages: { role: string; content: string }[];
    };
  };

  it('モデル名の前後の空白は落としてから検証する', async () => {
    const f = okChat();
    const r = await chatOllama(
      { endpoint: '11434', model: '  llama3.2:1b  ', prompt: 'こんにちは' },
      f,
      '',
    );
    expect(r.ok).toBe(true);
    expect(sent(f).model).toBe('llama3.2:1b');
  });

  it('モデル名が無ければ、余計な文字を足さずに不正として返す', async () => {
    const r = await chatOllama(
      { endpoint: '11434', model: undefined as unknown as string, prompt: 'こんにちは' },
      okChat(),
      '',
    );
    expect(r).toEqual({ ok: false, kind: 'bad-model', message: 'モデル名が不正です: ' });
  });

  it('長すぎるモデル名は 32 字で切って返す (画面を壊さない)', async () => {
    const long = `${'z'.repeat(200)} 不正`;
    const r = await chatOllama({ endpoint: '11434', model: long, prompt: 'こんにちは' }, okChat(), '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('bad-model');
      expect(r.message).toBe(`モデル名が不正です: ${'z'.repeat(32)}`);
      expect(r.message.length).toBe('モデル名が不正です: '.length + 32);
    }
  });

  it('プロンプトが無ければ空扱い (何かを代わりに送らない)', async () => {
    const f = okChat();
    const r = await chatOllama(
      { endpoint: '11434', model: 'llama3.2:1b', prompt: undefined as unknown as string },
      f,
      '',
    );
    expect(r).toEqual({
      ok: false,
      kind: 'empty-prompt',
      message: 'プロンプトを入力してください。',
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('system が無ければ system の行を作らない', async () => {
    const f = okChat();
    await chatOllama(
      { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは', system: undefined },
      f,
      '',
    );
    expect(sent(f).messages).toEqual([{ role: 'user', content: 'こんにちは' }]);
  });

  it('system は 8192 字で切る', async () => {
    const f = okChat();
    await chatOllama(
      { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは', system: 'あ'.repeat(9000) },
      f,
      '',
    );
    const [sys] = sent(f).messages;
    expect(sys!.role).toBe('system');
    expect(sys!.content.length).toBe(8192);
  });

  it('プロンプトは 32768 字で切る', async () => {
    const f = okChat();
    await chatOllama(
      { endpoint: '11434', model: 'llama3.2:1b', prompt: 'い'.repeat(40_000) },
      f,
      '',
    );
    const msgs = sent(f).messages;
    expect(msgs[msgs.length - 1]!.content.length).toBe(32_768);
  });
});

// --- モデル一覧を引くとき ---------------------------------------------------

describe('モデル一覧の引き方', () => {
  const base = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };

  it('一覧もキャッシュを使わない', async () => {
    const inits: Record<string, RequestInit> = {};
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      inits[String(url)] = init ?? {};
      if (String(url).endsWith('/api/tags')) return json({ models: [{ name: 'llama3.2:latest' }] });
      return json({ error: 'no such model' }, 404);
    }) as unknown as typeof fetch;
    await chatOllama(base, f, '');
    expect(inits['http://127.0.0.1:11434/api/tags']!.cache).toBe('no-store');
  });

  it('一覧が HTTP エラーなら、その本文にモデルが載っていても使わない', async () => {
    // 200 以外の本文は Ollama の応答とは限らない (プロキシのエラーページなど)。
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) {
        return json({ models: [{ name: 'にせ:latest' }] }, 500);
      }
      return json({ error: 'no such model' }, 404);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain('にせ');
      expect(r.message).toContain('まだ 1 つもモデルがありません');
    }
  });

  it('一覧が取れないときの文言を固定する (架空のモデル名を出さない)', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) throw new TypeError('Failed to fetch');
      return json({ error: 'no such model' }, 404);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe(
        'モデル「llama3.2:1b」がまだ取得されていません。 取得する: ollama pull llama3.2:1b' +
          ' まだ 1 つもモデルがありません。例: ollama pull llama3.2',
      );
    }
  });

  it('未取得モデル以外では一覧を引かず、文言も固定する', async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).endsWith('/api/tags')) return json({ models: [{ name: 'llama3.2:latest' }] });
      return json({ error: 'boom' }, 500);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(urls.filter((u) => u.endsWith('/api/tags'))).toHaveLength(0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Ollama が HTTP 500 を返しました。 boom');
  });

  it('本文が読めない HTTP エラーは、本文なしとして分類する', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/chat')) {
        return {
          ok: false,
          status: 500,
          text: () => Promise.reject(new Error('boom')),
        } as unknown as Response;
      }
      return json({ models: [] });
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r).toEqual({
      ok: false,
      kind: 'unknown',
      message: 'Ollama が HTTP 500 を返しました。',
    });
  });
});

// --- 最後の詰め ------------------------------------------------------------

describe('createCspWatcher — 型の確認は本物か', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let fire: (e: unknown) => void = () => undefined;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: {
        addEventListener: (_t: string, fn: (e: unknown) => void) => {
          fire = fn;
        },
        removeEventListener: () => undefined,
      },
      configurable: true,
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as { document?: unknown }).document;
  });

  it('文字列に化ける値でも、文字列でなければ照合しない', () => {
    // `url.startsWith(x)` は x を暗黙に文字列化するので、型の確認を外すと
    // 「文字列ではないが文字列にすると前方一致する」値が通ってしまう。
    const w = createCspWatcher('http://127.0.0.1:11434/api/version');
    fire({
      blockedURI: { toString: () => 'http://127.0.0.1:11434' },
      violatedDirective: 'img-src',
    });
    expect(w.hit()).toBe(false);
  });
});

describe('chat の失敗案内 — 文言を固定する', () => {
  const base = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };
  const chatFails = (body: unknown, status: number) =>
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) return json({ models: [] });
      return typeof body === 'string'
        ? new Response(body, { status })
        : json(body, status);
    }) as unknown as typeof fetch;

  it('推論プロセスの失敗では、モデル名入りの取り直し手順を出す', async () => {
    // ここが model を渡している唯一の効き所。渡さないとモデル名が
    // `<モデル>` のままになり、貼って実行できる手順にならない。
    const r = await chatOllama(base, chatFails({ error: 'llama runner process has terminated' }, 500), '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('runner-failed');
      expect(r.message).toContain('ollama rm llama3.2:1b && ollama pull llama3.2:1b');
      expect(r.message).not.toContain('<モデル>');
    }
  });

  it('HTTP 200 に載ったエラーも、説明と手順を空白で継ぐ', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) return json({ models: [] });
      return json({ error: 'model requires more system memory' });
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe(
        'モデルが大きすぎて、この端末の空きメモリに載りませんでした。' +
          ' より小さいモデルを試す (例: llama3.2:1b / qwen2.5:0.5b)' +
          ' 量子化の強い版を選ぶ (Q4_K_M など)' +
          ' 他のアプリを閉じて空きメモリを増やす',
      );
    }
  });

  it('NUL は送らずに弾き、そう言う', async () => {
    const r = await chatOllama({ ...base, system: 'a\u0000b' }, chatFails({}, 200), '');
    expect(r).toEqual({
      ok: false,
      kind: 'bad-input',
      message: '入力に NUL 文字が含まれています。',
    });
  });
});

describe('chat の応答サイズの境界', () => {
  const base = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };
  const LIMIT = 2 * 1024 * 1024;

  const chatBody = (body: string) =>
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/tags')) return json({ models: [] });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

  it('上限ちょうどは読む', async () => {
    const pad = 'z'.repeat(LIMIT - JSON.stringify({ message: { content: '' } }).length);
    const body = JSON.stringify({ message: { content: pad } });
    expect(body.length).toBe(LIMIT);
    const r = await chatOllama(base, chatBody(body), '');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reply).toBe(pad);
  });

  it('上限を 1 バイト超えたら読まない', async () => {
    const pad = 'z'.repeat(LIMIT - JSON.stringify({ message: { content: '' } }).length + 1);
    const body = JSON.stringify({ message: { content: pad } });
    expect(body.length).toBe(LIMIT + 1);
    const r = await chatOllama(base, chatBody(body), '');
    expect(r).toEqual({
      ok: false,
      kind: 'too-large',
      message: '応答が大きすぎたため中断しました。',
    });
  });
});

describe('readTextOrEmpty', () => {
  it('読める本文はそのまま', async () => {
    expect(await readTextOrEmpty(new Response('boom', { status: 500 }))).toBe('boom');
  });

  it('読めなければ空文字を返す (undefined ではない)', async () => {
    // undefined を下流へ流すと「詳細なし」に潰れて見分けが付かなくなるので、
    // ここで空文字に揃えていることを固定する。
    const broken = { text: () => Promise.reject(new Error('boom')) } as unknown as Response;
    const r = await readTextOrEmpty(broken);
    expect(r).toBe('');
    expect(typeof r).toBe('string');
  });
});

/**
 * **モジュール直下の値を、読み直して留める。**
 *
 * 保存キー・上限・空スナップショットは上の検査群が既に字面で見ているが、
 * **静的 import なので変異が届いていなかった** (2026-08-31 実測で 5 件生存)。
 * `vi.resetModules()` + 動的 `import()` で読み直す。
 * 本 PR で 7 度目の同じ手当てである。
 */
describe('モジュール直下の値 — 読み直して static 変異体を届かせる', () => {
  const fresh = async () => {
    vi.resetModules();
    return import('../ollamaWeb');
  };

  /*
   * 保存キーが変われば、**利用者が前の版で保存した接続先が読めなくなる**。
   * 旧キー (`…ollama.port`) は後方互換のためだけに残っているので、
   * 綴りが崩れると移行が静かに壊れる。`lint:storage` の台帳とも対になる。
   */
  it('★ localStorage の保存キー (新・旧)', async () => {
    const m = await fresh();
    expect(m.OLLAMA_ENDPOINT_KEY).toBe('servicehub.ollama.endpoint');
    expect(m.OLLAMA_PORT_KEY).toBe('servicehub.ollama.port');
  });

  /*
   * 上限は掛け算で書いてあるので、`*` が `/` に変わると **2 バイト**になる
   * (`2 * 1024 / 1024`)。そうなると正常な応答まで全部 too-large で弾かれる。
   * 画面の「セキュリティポリシー」欄にも出る値なので、実寸で留める。
   */
  /*
   * 繋がらないときに返す**空のスナップショット**。中身が `undefined` に
   * なると、画面は「Ollama の状態」欄を描けずに落ちる。4 か所から返るので
   * 形そのものを留める。
   */
  it('★ 繋がらないときの空スナップショットの形', async () => {
    const m = await fresh();
    const f = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const noCspLocal = () => ({ hit: () => false, stop: () => undefined });
    const r = await m.probeOllama(11434, f, '', noCspLocal);
    expect(r.snapshot).toEqual({
      running: false,
      version: '',
      versionSafe: false,
      versionMinRecommended: MIN_SAFE_VERSION,
      models: [],
      warnings: [],
    });
  });

  it('★ 応答の上限は 2MiB ちょうど', async () => {
    const m = await fresh();
    expect(m.MAX_RESPONSE_BYTES).toBe(2 * 1024 * 1024);
    expect(m.MAX_RESPONSE_BYTES).toBe(2097152);
  });
});

/**
 * **モデル一覧が取れなくても、助言まで辿り着く。**
 *
 * `chatOllama` は「モデルが無い」と分かったとき、実在するモデルを添えるために
 * 一覧を取りに行く (`listInstalledModels`)。その一覧の取得が失敗しても
 * **助言そのものは返らなければならない** —— ここで投げると、利用者は
 * 「モデル名が違う」という肝心の案内を受け取れないまま例外を見る。
 *
 * `res === null || !res.ok` を `false` に潰しても鳴っていなかった。
 * 潰すと失敗した応答をそのまま読みに行き、実際には例外になる。
 * 一覧の取得口は export されていないので、**本物の経路 (chatOllama) から**
 * 当てる。
 */
describe('モデル一覧が取れなくても助言は返る', () => {
  const base = { endpoint: '11434', model: 'llama3.2:1b', prompt: 'こんにちは' };
  const notFound = { error: 'model "llama9" not found, try pulling it first' };

  it('★ 一覧の取得が失敗しても、助言を返す (投げない)', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/tags')) throw new Error('ECONNREFUSED');
      if (u.endsWith('/api/chat')) return json(notFound, 404);
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.kind).toBe('model-not-found');
  });

  it('★ 一覧が HTTP エラーでも、助言を返す', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/tags')) return new Response('nope', { status: 500 });
      if (u.endsWith('/api/chat')) return json(notFound, 404);
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof fetch;
    const r = await chatOllama(base, f, '');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.kind).toBe('model-not-found');
  });
});
