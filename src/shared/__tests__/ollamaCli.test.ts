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

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/api/version') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ version: '0.5.4' }));
        return;
      }
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              {
                name: 'llama3.2:latest',
                size: 2 * 1024 ** 3,
                modified_at: '2026-07-01T00:00:00Z',
                details: { family: 'llama', parameter_size: '3B', quantization_level: 'Q4_K_M' },
              },
            ],
          }),
        );
        return;
      }
      if (req.url === '/api/chat') {
        const parsed = JSON.parse(body || '{}') as {
          model?: string;
          messages?: { role: string; content: string }[];
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: `echo:${parsed.model}:${parsed.messages?.at(-1)?.content ?? ''}`,
            },
          }),
        );
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
