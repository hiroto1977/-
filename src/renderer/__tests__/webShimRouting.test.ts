/** @vitest-environment jsdom */
/**
 * **ブラウザ版の `invoke` は、どの操作をどの経路へ流すか。**
 *
 * `web-shim.ts` の `invoke` は 40 本ほどの `if (serviceId === … && action === …)`
 * の連鎖で、経路の分岐 (ConditionalExpression) が変異検査で一番多く生き残って
 * いた (2026-09-01 の実測: 241 件)。`webShimInvokeNeverRejects` は「reject
 * しない」しか見ないので、`serviceId === 'stocks'` が `true` に変わって別の
 * 経路へ落ちても通ってしまう。
 *
 * ここでは**同じ敵対的な環境** (金庫は閉・資格情報なし・通信なし・blob: 不可) で
 * 全組を叩き、**返る code と文言、ok のときは形**を組ごとに固定する。
 * 経路が 1 つずれれば、別の組の答えが返って落ちる。
 *
 * 文言まで固定するのは、`invoke` の返す message が画面にそのまま出る
 * **契約**だから (「PAT を設定」の案内が別サービスの案内に化けたら利用者は
 * 迷う)。画面の飾りの文言 (ボタンやラベル) はここでは見ない。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    status: async () => 'locked',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({
    put: async () => {
      throw new Error('QuotaExceededError');
    },
    list: async () => {
      throw new Error('blocked');
    },
  }),
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

const TOKEN_MISSING = (id: string) => `${id} のトークンが未設定です。設定から登録してください`;
const SYMBOL = 'symbol must be 1-16 chars from [A-Za-z0-9.-^]';
const NOTE = (id: string) => `${id}.record-entry: note は 1-2000 文字で指定してください`;
const NOT_FOUND = (svc: string, act: string) => `ブラウザ版では ${svc}/${act} は実行できません。Electron 版でお試しください。`;

/** 空の payload で叩いたときの、組ごとの答え。 */
type Route =
  | { readonly ok: false; readonly code: string; readonly message: string }
  | { readonly ok: true; readonly shape: (data: unknown) => void };

const ROUTES: readonly (readonly [string, string, Route])[] = [
  ['templates', 'export-template', { ok: false, code: 'action_failed', message: 'unknown template id: undefined' }],
  ['teamradar', 'export-svg', { ok: false, code: 'action_failed', message: 'チームレーダーページに切り替えてからもう一度お試しください' }],
  ['teamradar', 'save-state', { ok: true, shape: (d) => expect(d).toEqual({}) }],
  ['talent', 'judge-leader', { ok: true, shape: (d) => expect(d).toHaveProperty('fitness.eligible') }],
  ['talent', 'save-state', { ok: true, shape: (d) => expect(Object.keys(d as object)).toEqual(expect.arrayContaining(['reports', 'initiatives', 'members'])) }],
  ['ollama', 'chat', { ok: false, code: 'ollama_bad-model', message: 'モデル名が不正です: ' }],
  ['stocks', 'register-ticker', { ok: false, code: 'action_failed', message: SYMBOL }],
  ['stocks', 'unregister-ticker', { ok: false, code: 'action_failed', message: SYMBOL }],
  ['stocks', 'compare-strategies', { ok: false, code: 'action_failed', message: SYMBOL }],
  ['stocks', 'advise', { ok: false, code: 'action_failed', message: '質問を入力してください' }],
  ['stocks', 'export-dashboard', { ok: true, shape: (d) => expect((d as { path: string }).path).toMatch(/^stocks-dashboard-\d+\.html$/) }],
  ['stocks', 'export-dashboard-md', { ok: true, shape: (d) => expect((d as { path: string }).path).toMatch(/^stocks-dashboard-\d+\.md$/) }],
  ['emotions', 'log-mood', { ok: false, code: 'action_failed', message: 'score must be a number between 1 and 5' }],
  ['emotions', 'clear-history', { ok: true, shape: (d) => expect(d).toEqual({ moods: 0, analyses: 0 }) }],
  ['emotions', 'analyze-text', { ok: false, code: 'action_failed', message: 'text を入力してください' }],
  ['github', 'create-issue', { ok: false, code: 'not_configured', message: 'GitHub の PAT が未設定です。「PAT を設定」から登録してください' }],
  ['notion', 'create-page', { ok: false, code: 'not_configured', message: TOKEN_MISSING('notion') }],
  ['slack', 'send-message', { ok: false, code: 'not_configured', message: TOKEN_MISSING('slack') }],
  ['atlassian', 'create-issue', { ok: false, code: 'not_configured', message: 'Atlassian のトークン (email/token/site の JSON) が未設定です' }],
  ['calendar', 'create-event', { ok: false, code: 'not_configured', message: TOKEN_MISSING('calendar') }],
  ['gmail', 'create-draft', { ok: false, code: 'not_configured', message: TOKEN_MISSING('gmail') }],
  ['drive', 'create-folder', { ok: false, code: 'not_configured', message: TOKEN_MISSING('drive') }],
  ['wordpress', 'create-post-draft', { ok: false, code: 'not_configured', message: TOKEN_MISSING('wordpress') }],
  ['canva', 'create-folder', { ok: false, code: 'not_configured', message: TOKEN_MISSING('canva') }],
  ['cloudflare', 'create-dns-record', { ok: false, code: 'not_configured', message: TOKEN_MISSING('cloudflare') }],
  ['cloudflare', 'purge-cache', { ok: false, code: 'not_configured', message: TOKEN_MISSING('cloudflare') }],
  ['security', 'scan-url', { ok: false, code: 'not_configured', message: 'VirusTotal API キーが未設定です (設定に {"vt":"...","hibp":"..."} の JSON で保存)' }],
  ['security', 'check-email-breach', { ok: false, code: 'not_configured', message: 'HIBP API キーが未設定です (設定に {"hibp":"...","vt":"..."} の JSON で保存)' }],
  ['uber-eats', 'record-entry', { ok: false, code: 'action_failed', message: NOTE('uber-eats') }],
  ['demae-can', 'record-entry', { ok: false, code: 'action_failed', message: NOTE('demae-can') }],
  ['real-estate', 'record-entry', { ok: false, code: 'action_failed', message: NOTE('real-estate') }],
  ['mutual-funds', 'record-entry', { ok: false, code: 'action_failed', message: NOTE('mutual-funds') }],
  ['assistant', 'chat', { ok: false, code: 'action_failed', message: '最後の発話は user である必要があります' }],
  ['assistant', 'chatAll', { ok: false, code: 'action_failed', message: '最後の発話は user である必要があります' }],
  ['assistant', 'providers', { ok: true, shape: (d) => expect((d as { providers: { id: string }[] }).providers.map((p) => p.id)).toContain('anthropic') }],
  ['business', 'advise', { ok: false, code: 'action_failed', message: '質問を入力してください' }],
  ['business', 'export-dashboard', { ok: true, shape: (d) => expect((d as { path: string }).path).toMatch(/^business-dashboard-\d+\.html$/) }],
  ['business', 'export-dashboard-md', { ok: true, shape: (d) => expect((d as { path: string }).path).toMatch(/^business-dashboard-\d+\.md$/) }],
  // 経路が「無い」ほうも固定する: record-entry はその 4 サービスにしか無い、
  // 知っているサービスでも知らない action は無い、両方知らなければ無い。
  ['github', 'record-entry', { ok: false, code: 'action_not_found', message: NOT_FOUND('github', 'record-entry') }],
  ['stocks', 'nosuch', { ok: false, code: 'action_not_found', message: NOT_FOUND('stocks', 'nosuch') }],
  ['nosuch', 'nosuch', { ok: false, code: 'action_not_found', message: NOT_FOUND('nosuch', 'nosuch') }],
  ['nosuch', 'create-issue', { ok: false, code: 'action_not_found', message: NOT_FOUND('nosuch', 'create-issue') }],
];

describe('ブラウザ版の invoke — 組ごとの経路 (金庫は閉・資格情報なし・通信なし・blob: 不可)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => {
      throw new Error('createObjectURL blocked');
    };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  });

  it.each(ROUTES)('%s / %s', async (svc, act, route) => {
    const hub = await loadHub();
    const r = await hub.invoke(svc, act, {});
    if (route.ok) {
      expect(r.ok, `${svc}/${act}: ${r.code ?? ''} ${r.message ?? ''}`).toBe(true);
      route.shape(r.data);
    } else {
      expect(r.ok).toBe(false);
      expect(r.code).toBe(route.code);
      expect(r.message).toBe(route.message);
    }
  });

  it('表は 40 組以上を持ち、ok と err の両方を含む (空虚でない)', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(40);
    expect(ROUTES.filter(([, , r]) => r.ok).length).toBeGreaterThanOrEqual(8);
    expect(ROUTES.filter(([, , r]) => !r.ok).length).toBeGreaterThanOrEqual(30);
  });
});
