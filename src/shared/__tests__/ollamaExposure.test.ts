import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * **Ollama が LAN などへ公開されていないかを CLI が教える** (threat: T-129)
 *
 * Ollama には認証が無い。`OLLAMA_HOST=0.0.0.0` で起動した PC は、同じ網の誰にでも
 * モデルの実行・取得・削除を許す。アプリは 127.0.0.1 にしか繋がないので、公開されていても
 * 利用者は気付かない。`npm run ollama` が状態確認のついでに外向きのアドレスへ繋がるかを測り、
 * 繋がれば警告する。**実際に待ち受けて**確かめる (判定の写しではなく振る舞いで)。
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI = path.join(ROOT, 'scripts', 'ollama-cli.cjs');
const req = createRequire(import.meta.url);
const exposure = req('../../../scripts/lib/ollama-exposure.cjs') as {
  candidateAddresses: (i: unknown) => string[];
  findExposed: (i: unknown, port: number, c?: (h: string, p: number) => Promise<boolean>) => Promise<string[]>;
  exposureWarning: (e: string[], port: number) => string | null;
  MAX_ADDRESSES: number;
};

const realCandidates = exposure.candidateAddresses(os.networkInterfaces());
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function listen(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer((rq, rs) => {
      rs.setHeader('content-type', 'application/json');
      rs.end(rq.url === '/api/version' ? '{"version":"0.12.0"}' : '{"models":[]}');
    });
    servers.push(s);
    s.once('error', reject);
    s.listen(0, host, () => resolve((s.address() as { port: number }).port));
  });
}

function runCli(port: number): Promise<{ out: string; json?: { exposedOn?: unknown } }> {
  return new Promise((resolve, reject) => {
    execFile('node', [CLI, '--port', String(port)], { cwd: ROOT, timeout: 30_000 }, (err, stdout) => {
      if (err && (err as { code?: number }).code !== 0) return reject(err);
      resolve({ out: stdout });
    });
  });
}

describe('Ollama の公開の自己点検 (threat: T-129)', () => {
  it('candidateAddresses: 外向きの IPv4 だけを重複なしで返す (loopback・リンクローカル・IPv6・内部は除く)', () => {
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [
        { address: '192.168.1.5', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
        { address: '169.254.9.9', family: 'IPv4', internal: false },
        { address: '192.168.1.5', family: 'IPv4', internal: false },
      ],
      weird: null,
    };
    expect(exposure.candidateAddresses(ifaces)).toEqual(['192.168.1.5']);
    expect(exposure.candidateAddresses(null)).toEqual([]);
    expect(exposure.candidateAddresses('x')).toEqual([]);
    // 針が的に当たる標本: 数値の family (古い Node) も IPv4 と読む。
    expect(exposure.candidateAddresses({ e: [{ address: '10.0.0.2', family: 4, internal: false }] })).toEqual(['10.0.0.2']);
  });

  it('candidateAddresses: 検査するアドレス数に上限がある', () => {
    const many = { e: Array.from({ length: 50 }, (_, i) => ({ address: `10.0.0.${i + 1}`, family: 'IPv4', internal: false })) };
    expect(exposure.candidateAddresses(many)).toHaveLength(exposure.MAX_ADDRESSES);
  });

  it('findExposed: 繋がったアドレスだけを返す (接続は差し替えられる)', async () => {
    const ifaces = { e: [{ address: '10.0.0.1', family: 'IPv4', internal: false }, { address: '10.0.0.2', family: 'IPv4', internal: false }] };
    const got = await exposure.findExposed(ifaces, 11434, async (h) => h === '10.0.0.2');
    expect(got).toEqual(['10.0.0.2']);
    expect(await exposure.findExposed(ifaces, 11434, async () => false)).toEqual([]);
  });

  it('exposureWarning: 公開が無ければ null、有れば認証が無いことと戻し方を言う', () => {
    expect(exposure.exposureWarning([], 11434)).toBeNull();
    const w = exposure.exposureWarning(['192.168.1.5'], 11434) ?? '';
    expect(w).toContain('192.168.1.5');
    expect(w).toContain('認証が無い');
    expect(w).toContain('OLLAMA_HOST');
  });

  // この環境に外向きのアドレスが無いと実測できない。その場合は下の 2 件が走らないので、
  // 走ったかどうかを名指しで見られるよう、前提を別の it で表に出す。
  it('前提: 実測の対象になる外向きのアドレスが少なくとも 1 つある', () => {
    expect(realCandidates.length).toBeGreaterThan(0);
  });

  it('実測: 0.0.0.0 で待ち受けると、外向きのアドレスで繋がると判定される', async () => {
    const port = await listen('0.0.0.0');
    const exposed = await exposure.findExposed(os.networkInterfaces(), port);
    expect(exposed).toEqual(expect.arrayContaining(realCandidates));
  });

  it('実測: 127.0.0.1 だけで待ち受けるなら、公開されていないと判定される', async () => {
    const port = await listen('127.0.0.1');
    expect(await exposure.findExposed(os.networkInterfaces(), port)).toEqual([]);
  });

  it('CLI: 公開されていれば警告を出し、loopback だけなら出さない', async () => {
    const open = await runCli(await listen('0.0.0.0'));
    expect(open.out).toContain('外から届くアドレスで待ち受けています');
    const closed = await runCli(await listen('127.0.0.1'));
    expect(closed.out).not.toContain('待ち受けています');
    expect(closed.out).toContain('に接続しました'); // 針が生きている (接続自体は成功している)
  });
});
