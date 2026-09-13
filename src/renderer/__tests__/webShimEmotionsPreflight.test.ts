/** @vitest-environment jsdom */
/**
 * **ブラウザ版 emotions/analyze-text —— 保存できない保管値なら、送る前に断る。**
 *
 * 2026-09-05 まで、壊れた保管値の検査は保存の直前 (`recordAnalysis`) にしかなく、
 * 本文は Anthropic へ渡り API 呼び出しも済んだ後で捨てていた。main 側
 * (`clients/emotions.ts` の `analyzeText`) と同じ順に揃え、ここでは**送信の有無**を測る
 * (`data/__tests__/emotionsElementShape.test.ts` は関数単体、ここは invoke の経路)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMOTIONS_STORE_KEY } from '../data/emotionsWeb';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async (id: string) => (id === 'emotions' ? 'sk-ant-test-key' : null),
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['emotions'],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string; data?: unknown };
type Hub = { invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const fetchCalls: string[] = [];
const originalFetch = globalThis.fetch;
const anthropicOk = () =>
  new Response(
    JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ scores: { joy: 0.8 }, sentiment: 'positive', dominant: 'joy' }) }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

beforeEach(() => {
  localStorage.clear();
  fetchCalls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return anthropicOk();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const GOOD = { date: '2026-01-01', score: 4, note: '大事なメモ' };
const PAYLOAD = { text: '今日は落ち着いている' };
const stored = () => JSON.parse(localStorage.getItem(EMOTIONS_STORE_KEY) ?? 'null') as { moods: unknown[]; analyses: { dominant: string }[] };

describe('ブラウザ版 emotions/analyze-text — 保存できない保管値なら送る前に断る', () => {
  it('★ 形の違う要素が混じった保管値: 断り、Anthropic へは何も送らず、保管値もそのまま', async () => {
    const broken = JSON.stringify({ moods: [GOOD, null], analyses: [] });
    localStorage.setItem(EMOTIONS_STORE_KEY, broken);
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_failed');
    expect(r.message).toMatch(/記録を中止/);
    expect(fetchCalls).toEqual([]);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY)).toBe(broken);
  });

  it('★ 欄が在るのに配列でない (analyses: "x") も同じ: 送らない', async () => {
    const broken = JSON.stringify({ moods: [GOOD], analyses: 'x' });
    localStorage.setItem(EMOTIONS_STORE_KEY, broken);
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/記録を中止/);
    expect(fetchCalls).toEqual([]);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY)).toBe(broken);
  });

  it('対照: 合う保管値なら api.anthropic.com へ 1 回送って保存する (上 2 本が「何をしても通る」ものでない根拠)', async () => {
    localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify({ moods: [GOOD], analyses: [] }));
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', PAYLOAD);
    expect(r.ok, `${r.code ?? ''} ${r.message ?? ''}`).toBe(true);
    expect(fetchCalls).toEqual(['https://api.anthropic.com/v1/messages']);
    expect(stored().moods).toEqual([GOOD]);
    expect(stored().analyses.map((a) => a.dominant)).toEqual(['joy']);
  });

  it('対照: 保管値が無い (初回) なら普通に送って保存する', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', PAYLOAD);
    expect(r.ok, `${r.code ?? ''} ${r.message ?? ''}`).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(stored().analyses).toHaveLength(1);
  });
});
