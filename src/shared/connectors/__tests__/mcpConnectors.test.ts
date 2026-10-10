import { describe, it, expect } from 'vitest';
import {
  MCP_CONNECTORS,
  MCP_CONNECTORS_FREE,
  MCP_CONNECTORS_AUTH,
  MCP_AGENT_BRIDGES,
  findMcpConnector,
  mcpConnectorCounts,
} from '../mcpConnectors';

describe('MCP connector registry', () => {
  it('matches docs/MCP_SETUP.md: 25 servers = 12 free + 13 auth', () => {
    expect(MCP_CONNECTORS_FREE.length).toBe(12);
    expect(MCP_CONNECTORS_AUTH.length).toBe(13);
    expect(MCP_CONNECTORS.length).toBe(25);
    expect(mcpConnectorCounts()).toEqual({ total: 25, free: 12, auth: 13 });
  });

  it('has unique, non-empty ids and labels', () => {
    const ids = MCP_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of MCP_CONNECTORS) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('free connectors need no env keys; api-key connectors list at least one', () => {
    for (const c of MCP_CONNECTORS_FREE) {
      expect(c.auth).toBe('none');
      expect(c.envKeys.length).toBe(0);
    }
    for (const c of MCP_CONNECTORS_AUTH) {
      expect(c.auth === 'api-key' || c.auth === 'oauth').toBe(true);
      if (c.auth === 'api-key') expect(c.envKeys.length).toBeGreaterThan(0);
    }
  });

  it('env key names are UPPER_SNAKE_CASE (match .env.mcp.example convention)', () => {
    for (const c of MCP_CONNECTORS_AUTH) {
      for (const k of c.envKeys) {
        expect(k).toMatch(/^[A-Z][A-Z0-9_]+$/);
      }
    }
  });

  it('findMcpConnector resolves known ids and returns null for unknown', () => {
    expect(findMcpConnector('github')?.label).toBe('GitHub');
    expect(findMcpConnector('obsidian')?.auth).toBe('none');
    expect(findMcpConnector('nope')).toBeNull();
  });

  it('agent bridges cover Claude, ChatGPT, and LiteLLM routes', () => {
    const ids = MCP_AGENT_BRIDGES.map((b) => b.id);
    expect(ids).toEqual(['claude-code', 'chatgpt-mcp-remote', 'litellm']);
    for (const b of MCP_AGENT_BRIDGES) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
    }
  });
});
