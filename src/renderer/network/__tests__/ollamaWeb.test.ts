import { describe, expect, it, vi } from 'vitest';
import {
  chatOllama,
  createCspWatcher,
  desktopSetupCommands,
  originsSetupSteps,
  probeOllama,
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
