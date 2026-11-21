import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * **CLI は、相手の文の端末制御列をそのまま端末へ刷らない** (threat: T-134)
 *
 * `npm run ollama` が向ける Ollama は LAN やトンネル先でありうるし、モデルの返信は敵性でありうる。
 * 返信・版・エラーの本文に ESC 列 (タイトル書き換え・行消し)・BEL・RLO が入っていると、
 * 素のまま刷れば端末で効く (CWE-150)。台帳の取り込み口 (パス 484) が直した家系の残りだった。
 * 偽の Ollama を立てて**実際に CLI を起動**し、標準出力・標準エラーの生のバイトを見る。
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = path.join(ROOT, 'scripts', 'ollama-cli.cjs');
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const RLO = String.fromCharCode(0x202e);
const EVIL = `${ESC}]0;PWNED${BEL}${ESC}[2K隠す${RLO}逆`;

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function evilOllama(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer((rq, rs) => {
      rs.setHeader('content-type', 'application/json');
      if (rq.url === '/api/version') return void rs.end(JSON.stringify({ version: `0.12.0${EVIL}` }));
      if (rq.url === '/api/tags') return void rs.end(JSON.stringify({ models: [{ name: 'llama3.2:latest', size: 1e9, details: { family: EVIL, parameter_size: '3B', quantization_level: 'Q4' } }] }));
      if (rq.url === '/api/chat') return void rs.end(JSON.stringify({ message: { role: 'assistant', content: `返信${EVIL}` } }));
      rs.statusCode = 500;
      rs.end(JSON.stringify({ error: `壊れた${EVIL}` }));
    });
    servers.push(s);
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => resolve((s.address() as { port: number }).port));
  });
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], { cwd: ROOT, timeout: 30_000 }, (_err, stdout, stderr) => resolve(`${stdout}\n${stderr}`));
  });
}

const RAW = [ESC, BEL, RLO];
const hasRaw = (s: string): boolean => RAW.some((c) => s.includes(c));

describe('ollama CLI — 端末制御列を素で刷らない (threat: T-134)', () => {
  it('標本: この偽 Ollama は ESC / BEL / RLO を実際に返している', () => {
    expect(hasRaw(EVIL)).toBe(true);
  });

  it('★ status: 版・モデルの詳細に混ざった制御列は見える形になる', async () => {
    const port = await evilOllama();
    const out = await run(['--port', String(port)]);
    expect(hasRaw(out)).toBe(false);
    expect(out).toContain('に接続しました'); // 針が生きている
  });

  it('★ chat: モデルの返信に混ざった制御列は見える形になる', async () => {
    const port = await evilOllama();
    const out = await run(['--port', String(port), 'chat', 'llama3.2:latest', 'こんにちは']);
    expect(hasRaw(out)).toBe(false);
    expect(out).toContain('返信');
    expect(out).toContain('\\u{001B}'); // 置き換えられて見える (消えてはいない)
  });

  it('★ --json: 値は変えずに \\uXXXX へ逃がす (JSON.parse すれば元の値に戻る)', async () => {
    const port = await evilOllama();
    const out = await run(['--port', String(port), '--json']);
    expect(hasRaw(out)).toBe(false);
    const parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as { version: string };
    expect(parsed.version).toBe(`0.12.0${EVIL}`);
  });
});
