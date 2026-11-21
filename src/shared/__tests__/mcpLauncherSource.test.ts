import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * `.claude/settings.json` の MCP サーバーは `npx -y` / `uvx` で「その時の最新」を取って走る。
 * 起動子への旗 (`--registry=…` / `--index-url …`) と取得元を変える env (`NPM_CONFIG_REGISTRY` ほか) は、
 * 台帳の「パッケージ名」と「env の鍵の名前」しか見ない門を素通りした (T-200・2026-10-25 に監査役が指摘し、
 * 防御側が実物の設定を書き換えて再現: 3 形とも 0 件)。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-mcp-servers.cjs') as {
  readServers: (j: unknown) => { name: string; pkg: string | null; env: string[]; launcherFlags: string[] }[];
  check: (servers: unknown[]) => string[];
};
const ROOT = path.resolve(__dirname, '../../..');
const base = JSON.parse(readOriginalSource(path.join(ROOT, '.claude/settings.json'))) as {
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
};
const first = Object.keys(base.mcpServers)[0]!;
const problemsAfter = (mutate: (d: { command: string; args: string[]; env?: Record<string, string> }) => void): string[] => {
  const j = JSON.parse(JSON.stringify(base)) as typeof base;
  mutate(j.mcpServers[first]!);
  return gate.check(gate.readServers(j));
};

describe('MCP サーバーの起動子への旗と取得元を差し替える env は、台帳の外では足せない (threat: T-200)', () => {
  it('実物の設定は 0 件 (対照)', () => {
    expect(gate.check(gate.readServers(base))).toEqual([]);
  });

  it('★ パッケージ名の前の --registry=… は落ちる (直す前は 0 件だった)', () => {
    const p = problemsAfter((d) => d.args.unshift('--registry=https://evil.example'));
    expect(p.some((x) => x.includes('起動子への旗') && x.includes('--registry'))).toBe(true);
  });

  it('★ 取得元・ローダ・TLS を変える env の鍵は落ちる', () => {
    for (const key of ['NPM_CONFIG_REGISTRY', 'npm_config_registry', 'NODE_OPTIONS', 'UV_INDEX_URL', 'HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS']) {
      const p = problemsAfter((d) => {
        d.env = { ...(d.env ?? {}), [key]: 'x' };
      });
      expect(p.some((x) => x.includes(`env "${key}"`)), key).toBe(true);
    }
  });

  it('資格情報の鍵と、パッケージ名より後ろの旗 (サーバ自身の引数) は止めない (過剰に止めない)', () => {
    expect(problemsAfter((d) => {
      d.env = { ...(d.env ?? {}), SOME_API_KEY: 'x' };
    })).toEqual([]);
    expect(problemsAfter((d) => d.args.push('--dir', '.'))).toEqual([]);
  });
});
