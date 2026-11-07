import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * 公式ではない Grok の MCP サーバ (`@joemccann/xai-mcp-server`) は、毎セッション自動で起動して
 * XAI_API_KEY を受け取っていた (PR #855)。2026-11-05 に「必要なときだけ繋ぐ」形へ変えた:
 * 既定では起動しない (settings.json に無い)・`claude --mcp-config .claude/mcp-on-demand/grok.json`
 * で明示したときだけ起動し、鍵もそのときだけ渡る。ここではその既定 OFF と明示 ON を実物で固定する。
 */
const req = createRequire(import.meta.url);
type Server = { name: string; pkg: string | null; env: string[] };
const gate = req('../../../scripts/lint-mcp-servers.cjs') as {
  readServers: (j: unknown) => Server[];
  checkOnDemand: (files: { file: string; json: unknown }[], settings: Server[]) => string[];
  readOnDemandFiles: () => { file: string; json: unknown }[];
  ON_DEMAND_LEDGER: Record<string, { pkg: string }>;
};
const ROOT = path.resolve(__dirname, '../../..');
const settings = JSON.parse(readOriginalSource(path.join(ROOT, '.claude/settings.json'))) as {
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
};
const grok = JSON.parse(readOriginalSource(path.join(ROOT, '.claude/mcp-on-demand/grok.json'))) as {
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
};

describe('Grok の MCP サーバは必要なときだけ繋ぐ', () => {
  it('既定 OFF: settings.json (自動起動) には grok も xai-mcp-server も XAI_API_KEY も無い', () => {
    expect(Object.keys(settings.mcpServers)).not.toContain('grok');
    const all = JSON.stringify(settings);
    expect(all).not.toContain('xai-mcp-server');
    expect(all).not.toContain('XAI_API_KEY');
  });

  it('明示 ON: 必要時の設定にだけ在り、版は固定・鍵は環境変数の参照だけ', () => {
    expect(Object.keys(grok)).toEqual(['mcpServers']);
    expect(Object.keys(grok.mcpServers)).toEqual(['grok']);
    const def = grok.mcpServers.grok!;
    expect(def.command).toBe('npx');
    expect(def.args).toEqual(['-y', '@joemccann/xai-mcp-server@1.0.7']);
    expect(def.env).toEqual({ XAI_API_KEY: '${XAI_API_KEY}' });
    expect(gate.ON_DEMAND_LEDGER.grok?.pkg).toBe('@joemccann/xai-mcp-server@1.0.7');
  });

  it('実物は門を 0 件で通る (対照)', () => {
    expect(gate.checkOnDemand(gate.readOnDemandFiles(), gate.readServers(settings))).toEqual([]);
  });

  it('★ settings.json へ戻すと門が鳴る (自動起動に戻る)', () => {
    const back = JSON.parse(JSON.stringify(settings)) as typeof settings;
    back.mcpServers.grok = grok.mcpServers.grok!;
    const p = gate.checkOnDemand(gate.readOnDemandFiles(), gate.readServers(back));
    expect(p.some((x) => x.includes('grok') && x.includes('settings.json'))).toBe(true);
  });
});
