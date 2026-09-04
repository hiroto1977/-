import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * scripts/ollama-cli.cjs の統合テスト。
 *
 * この CLI の存在理由は「ブラウザを介さないので CORS も mixed content も無い」こと。
 * 実際にスタブ Ollama を立てて **子プロセスとして CLI を起動**し、出力と終了コードを
 * 固定する。UI 版と同じ制約 (ループバック限定・読み取り 3 エンドポイント・モデル名検証)
 * が CLI でも効いていることが要点。
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = path.join(ROOT, 'scripts', 'ollama-cli.cjs');

/** 実 Ollama とポートが衝突しないよう、既定 11434 ではなく空きポートを使う。 */
let port = 0;
let server: Server;
/** CLI が叩いた URL を記録して、書き込み系を呼んでいないことを検証する。 */
const hits: string[] = [];

/**
 * インストール済みモデル。実 Ollama と同じく **タグ付き** で持つ
 * (`llama3.2` と入力しても実体は `llama3.2:latest` — この食い違いが実運用で
 * 最初に踏む壁なので、スタブ側も同じ形にしておく)。
 */
const INSTALLED = ['llama3.2:latest'];

/**
 * 実 Ollama のエラー封筒を再現する。本物は失敗時に
 * `HTTP 404 {"error":"model \"x\" not found, try pulling it first"}` を返し、
 * メモリ不足なら `HTTP 500 {"error":"model requires more system memory ..."}`。
 * ここを 200/簡易メッセージで済ませると、スタブでだけ通るコードになる。
 */
function chatResponse(body: string): { status: number; json: unknown } {
  const parsed = JSON.parse(body || '{}') as {
    model?: string;
    messages?: { role: string; content: string }[];
  };
  const model = parsed.model ?? '';
  if (model === 'huge-model:70b') {
    return {
      status: 500,
      json: { error: 'model requires more system memory (37.9 GiB) than is available (14.2 GiB)' },
    };
  }
  if (model === 'broken:latest') {
    return { status: 500, json: { error: 'llama runner process has terminated: exit status 2' } };
  }
  if (!INSTALLED.includes(model)) {
    return { status: 404, json: { error: `model "${model}" not found, try pulling it first` } };
  }
  return {
    status: 200,
    json: {
      message: {
        role: 'assistant',
        content: `echo:${model}:${parsed.messages?.at(-1)?.content ?? ''}`,
      },
    },
  };
}

/** /api/version を持たない古い Ollama を再現するときに立てる。 */
let hideVersion = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/api/version') {
        if (hideVersion) {
          // 0.1.14 未満には /api/version が無く、gin が 404 を返す。
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('404 page not found');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ version: '0.5.4' }));
        return;
      }
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            models: INSTALLED.map((name) => ({
              name,
              size: 2 * 1024 ** 3,
              modified_at: '2026-07-01T00:00:00Z',
              details: { family: 'llama', parameter_size: '3B', quantization_level: 'Q4_K_M' },
            })),
          }),
        );
        return;
      }
      if (req.url === '/api/chat') {
        const { status, json } = chatResponse(body);
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
        return;
      }
      res.writeHead(404);
      res.end('nf');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  port = typeof addr === 'object' && addr !== null ? addr.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { cwd: ROOT, timeout: 60_000 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? ((err as { code: number }).code)
            : err
              ? 1
              : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

describe('ollama CLI — 状態確認', () => {
  it('接続してバージョンとモデル一覧を出す (終了コード 0)', async () => {
    const r = await runCli(['--port', String(port)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('接続しました');
    expect(r.stdout).toContain('0.5.4');
    expect(r.stdout).toContain('llama3.2:latest');
    expect(r.stdout).toContain('2048 MB');
  });

  it('--json で機械可読な出力を返す', async () => {
    const r = await runCli(['--port', String(port), '--json']);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      running: boolean;
      version: string;
      versionSafe: boolean;
      models: { name: string }[];
    };
    expect(parsed.running).toBe(true);
    expect(parsed.version).toBe('0.5.4');
    expect(parsed.versionSafe).toBe(true);
    expect(parsed.models.map((m) => m.name)).toEqual(['llama3.2:latest']);
  });

  it('読み取り以外のエンドポイントを叩かない', () => {
    // ここまでのテストで CLI が実際に叩いた URL の記録を検証する。
    expect(hits.length).toBeGreaterThan(0);
    for (const u of hits) {
      expect(u).toMatch(/^\/api\/(version|tags|chat)$/);
    }
  });
});

describe('ollama CLI — チャット', () => {
  it('モデルとプロンプトを渡すと応答を出す', async () => {
    const r = await runCli(['--port', String(port), 'chat', 'llama3.2:latest', 'テスト']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('echo:llama3.2:latest:テスト');
  });

  it('--system でシステムプロンプトを付けられる', async () => {
    const r = await runCli([
      '--port',
      String(port),
      '--system',
      'あなたは要約器です',
      'chat',
      'llama3.2:latest',
      '本文',
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('echo:llama3.2:latest:本文');
  });

  it('--json でチャット結果を JSON で返す', async () => {
    const r = await runCli(['--port', String(port), '--json', 'chat', 'llama3.2:latest', 'q']);
    const parsed = JSON.parse(r.stdout) as { model: string; reply: string; durationMs: number };
    expect(parsed.model).toBe('llama3.2:latest');
    expect(parsed.reply).toContain('echo:');
    expect(typeof parsed.durationMs).toBe('number');
  });
});

describe('ollama CLI — 実 Ollama のエラー応答', () => {
  /*
   * ここが「スタブでだけ動く」を防ぐ肝。実 Ollama は失敗を HTTP ステータス +
   * {"error": "…"} の封筒で返す。その本文をそのまま出すのではなく、種類を
   * 判定して次の一手まで案内できているかを固定する。
   */

  it('未取得のモデルは、pull コマンドと実際にあるモデルを案内する', async () => {
    const r = await runCli(['--port', String(port), 'chat', 'mistral', 'やあ']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('モデル「mistral」がまだ取得されていません');
    expect(r.stderr).toContain('ollama pull mistral');
    // 「今あるモデル」を出さないと、利用者は何を指定すればいいか分からない。
    expect(r.stderr).toContain('llama3.2:latest');
    // 生の英語エラーを唯一の説明にしない。
    expect(r.stderr).not.toMatch(/^❌ Ollama が HTTP 404 を返しました: /m);
  });

  it('タグ違い (llama3.2 と llama3.2:latest) は近いモデルを提案する', async () => {
    const r = await runCli(['--port', String(port), 'chat', 'llama3.2', 'やあ']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('インストール済みの「llama3.2:latest」を指定すると動きます');
  });

  it('メモリ不足は「小さいモデルを試す」へ誘導する (pull を勧めない)', async () => {
    const r = await runCli(['--port', String(port), 'chat', 'huge-model:70b', 'やあ']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('空きメモリに載りません');
    expect(r.stderr).toContain('より小さいモデル');
    expect(r.stderr).not.toContain('ollama pull huge-model:70b');
  });

  it('推論プロセスの異常終了はモデル再取得と再起動を案内する', async () => {
    const r = await runCli(['--port', String(port), 'chat', 'broken:latest', 'やあ']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('推論プロセスが起動できませんでした');
    expect(r.stderr).toContain('broken:latest');
  });

  it('--json ではエラーも構造化して返す (kind / hints つき)', async () => {
    const r = await runCli(['--port', String(port), '--json', 'chat', 'mistral', 'やあ']);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout) as {
      ok: boolean;
      kind: string;
      message: string;
      detail: string;
      hints: string[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.kind).toBe('model-not-found');
    expect(parsed.detail).toContain('not found, try pulling it first');
    expect(parsed.hints.some((h) => h.includes('ollama pull mistral'))).toBe(true);
  });

  it('/api/version が無い古い Ollama でも、モデル一覧が読めれば接続成功にする', async () => {
    hideVersion = true;
    try {
      const r = await runCli(['--port', String(port)]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('接続しました');
      expect(r.stdout).toContain('(不明)');
      expect(r.stdout).toContain('llama3.2:latest');
      // バージョンが読めないだけで「脆弱」と断定しない。
      expect(r.stdout).not.toContain('⚠ 推奨');
    } finally {
      hideVersion = false;
    }
  });
});

describe('ollama CLI — 異常系', () => {
  it('危険なモデル名は送信せず終了コード 1', async () => {
    const before = hits.length;
    const r = await runCli(['--port', String(port), 'chat', '../../etc/passwd', 'x']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('モデル名が不正');
    expect(hits.length).toBe(before); // リクエストを 1 本も出していない
  });

  it('プロンプト無しは使い方を出して終了コード 1', async () => {
    const r = await runCli(['--port', String(port), 'chat', 'llama3.2:latest']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('使い方');
  });

  it('不正なポートは接続を試みず終了コード 1', async () => {
    for (const bad of ['0x2b', '70000', 'abc']) {
      const r = await runCli(['--port', bad]);
      expect(r.code, bad).toBe(1);
      expect(r.stderr).toContain('ポート番号が不正');
    }
  });

  it('到達できないときは終了コード 2 と、同じマシンで実行する必要がある旨を出す', async () => {
    // 未使用ポート (listen していない) を指定する。
    const r = await runCli(['--port', String(port + 1)]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('接続できませんでした');
    expect(r.stderr).toContain('同じマシン');
  });

  it('--help は使い方を出して終了コード 0', async () => {
    const r = await runCli(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('npm run ollama');
    expect(r.stdout).toContain('/api/version');
  });
});
