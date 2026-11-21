import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETUP_MODEL } from '../ollama';

/*
 * scripts/ollama-setup.sh の統合テスト。
 *
 * このスクリプトの存在理由は「つながらない原因が 1 つではない」こと —— 未導入 /
 * 未起動 / モデル無し / 読み取り未許可 —— のうち **足りないものだけを埋める**。
 * よって検証すべきは「どの段階を検出し、何をしたか」であって、出力の見た目ではない。
 *
 * 本物の Ollama はこの環境に導入できない (公式配布もリリースもプロキシが遮断) ため、
 * ①実物と同じ形で応答するスタブサーバ ②呼ばれた引数を記録する偽 `ollama` バイナリ
 * を用意して、スクリプトを実際に子プロセスとして走らせる。
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'ollama-setup.sh');

let port = 0;
let server: Server;
/** /api/tags が返すモデル。テストごとに差し替えて「モデル無し」を再現する。 */
let installed: string[] = [DEFAULT_SETUP_MODEL];
/** /api/chat がエラー封筒を返すかどうか。 */
let chatFails = false;
/** 偽 `ollama` バイナリを置く一時ディレクトリ (PATH の先頭に差し込む)。 */
let binDir = '';
/** 偽バイナリが呼ばれた記録 (1 行 1 呼び出し)。 */
let logFile = '';

beforeAll(async () => {
  server = createServer((req, res) => {
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
        res.end(JSON.stringify({ models: installed.map((name) => ({ name, size: 1024 ** 3 })) }));
        return;
      }
      if (req.url === '/api/chat') {
        if (chatFails) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'model requires more system memory' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: { role: 'assistant', content: '2' } }));
        return;
      }
      res.writeHead(404);
      res.end('nf');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  port = typeof addr === 'object' && addr !== null ? addr.port : 0;

  // 偽 `ollama`: 呼ばれた引数を記録するだけ。実際の取得はしない。
  binDir = mkdtempSync(path.join(tmpdir(), 'servicehub-fake-ollama-'));
  logFile = path.join(binDir, 'calls.log');
  const fake = path.join(binDir, 'ollama');
  writeFileSync(fake, `#!/usr/bin/env bash\necho "$*" >> "${logFile}"\nexit 0\n`, { mode: 0o755 });
});

afterEach(() => {
  installed = [DEFAULT_SETUP_MODEL];
  chatFails = false;
  if (logFile !== '' && existsSync(logFile)) rmSync(logFile);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (binDir !== '') rmSync(binDir, { recursive: true, force: true });
});

function calls(): string[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
}

function run(
  args: string[],
  opts: { withOllama?: boolean } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const withOllama = opts.withOllama ?? true;
  return new Promise((resolve) => {
    execFile(
      'bash',
      [SCRIPT, ...args],
      {
        cwd: ROOT,
        timeout: 60_000,
        env: {
          ...process.env,
          // 偽バイナリを見せる / 見せないで「未導入」を再現する。
          // 「見せない」側を '/usr/bin:/bin' に固定すると Windows (Git Bash) では
          // bash.exe 自体が見つからず、スクリプトが 1 行も出力せずに死ぬ —
          // リリースビルドの windows-latest で実際に踏んだ。CI ランナーに本物の
          // ollama は居ないため、Windows では元の PATH のままで「未導入」になる。
          PATH: withOllama
            ? `${binDir}${path.delimiter}${process.env['PATH'] ?? ''}`
            : process.platform === 'win32'
              ? (process.env['PATH'] ?? '')
              : '/usr/bin:/bin',
        },
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

describe('ollama-setup.sh — 既に整っている場合', () => {
  it('何も変更せず、1 往復して「使える状態」と報告する', async () => {
    const r = await run(['--no-install', '--port', String(port)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('使える状態です');
    expect(r.stdout).toContain('応答が返りました');
    // モデルがあるので pull は呼ばない。
    expect(calls().some((c) => c.startsWith('pull'))).toBe(false);
  });

  it('サーバが応答しているなら serve を起こさない (二重起動しない)', async () => {
    const r = await run(['--no-install', '--port', String(port)]);
    expect(r.code).toBe(0);
    expect(calls().some((c) => c.startsWith('serve'))).toBe(false);
    expect(r.stdout).not.toContain('起動しました');
  });
});

describe('ollama-setup.sh — 足りないものだけを埋める', () => {
  it('モデルが無ければ pull する', async () => {
    installed = [];
    const r = await run(['--no-install', '--port', String(port)]);
    expect(r.code).toBe(0);
    expect(calls()).toContain(`pull ${DEFAULT_SETUP_MODEL}`);
    expect(r.stdout).toContain('取得しました');
  });

  it('--model で入れるモデルを変えられる', async () => {
    installed = [];
    const r = await run(['--no-install', '--port', String(port), '--model', 'qwen2.5:0.5b']);
    expect(r.code).toBe(0);
    expect(calls()).toContain('pull qwen2.5:0.5b');
  });

  it('--check は現状を報告するだけで、pull も送信もしない', async () => {
    installed = [];
    const r = await run(['--check', '--port', String(port)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('確認のみ');
    expect(calls()).toEqual([]);
    expect(r.stdout).not.toContain('応答が返りました');
  });
});

describe('ollama-setup.sh — 失敗を隠さない', () => {
  it('生成が失敗したら成功と言わない (エラー封筒を検出する)', async () => {
    chatFails = true;
    const r = await run(['--no-install', '--port', String(port)]);
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain('使える状態です');
    expect(r.stderr).toContain('エラーを返しました');
  });

  // このケースだけは「起動を待つループ」(最大10周) を必ず一周しきるので遅い。
  // Windows ランナーではプロセス起動が重く既定の 30 秒を超えたため、明示的に伸ばす。
  it(
    'サーバが居ないポートでは、起動を試みたうえで失敗として終わる',
    async () => {
      const r = await run(['--no-install', '--port', String(port + 1)]);
      expect(r.code).toBe(1);
      expect(r.stdout).not.toContain('使える状態です');
    },
    120_000,
  );

  it('Ollama が未導入で --no-install なら、導入せずに失敗する', async () => {
    const r = await run(['--no-install', '--port', String(port + 1)], { withOllama: false });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('見つかりません');
  });

  it('不正なポートは引数エラー (終了コード 2)', async () => {
    for (const bad of ['abc', '', '12a']) {
      const r = await run(['--no-install', '--port', bad]);
      expect(r.code, bad).toBe(2);
    }
  });

  it('不明な引数は使い方を出して終了コード 2', async () => {
    const r = await run(['--nope']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('不明な引数');
  });

  it('--help は使い方を出して終了コード 0', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('npm run ollama:setup');
  });
});

describe('ollama-setup.sh — 設定の重複を防ぐ', () => {
  it('既定モデルが shared の DEFAULT_SETUP_MODEL と一致している', () => {
    // スクリプトは TS を読めないので値を持たざるを得ない。ズレると
    // 「UI が案内したモデルと、スクリプトが入れるモデルが違う」事故になる。
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain(`MODEL="${DEFAULT_SETUP_MODEL}"`);
  });

  it('--origin を渡すと、その値を含む永続化手順を出す', async () => {
    const r = await run(['--no-install', '--port', String(port), '--origin', 'https://claude.ai']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OLLAMA_ORIGINS');
    expect(r.stdout).toContain('https://claude.ai');
    // ターミナル利用では不要であることも伝える (無用な設定を促さない)。
    expect(r.stdout).toContain('ターミナルから使うだけならこの設定は不要');
  });
});
