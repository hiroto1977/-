/** @vitest-environment jsdom */
/**
 * **ブラウザ版が合成した形も、同梱と同じでなければならない。**
 *
 * デスクトップ側は `src/main/clients/__tests__/snapshotShapeParity.test.ts` が
 * 51 サービス分を突き合わせた。ブラウザ版 (`web-shim.ts`) は別実装で
 * **4 サービスだけ**自前に合成する (stocks / emotions / talent / security)。
 * 残りは `not_implemented` を返して画面が同梱を見続けるか、`liveRead` 経由で
 * **shared の実装**を通る (`LIVE_READERS` は今 cursor 1 件で、main と同じ
 * `fetchCursorSnapshotWith` を呼ぶので形はずれようがない)。
 *
 * 合成の 4 件は**ブラウザ版だけの道**なので、ここがずれると
 * `hiroto1977.github.io/-/app.html` でだけ画面が壊れる —— 同梱にしか無い欄は
 * 「取得できた瞬間に」消え、合成にしか無い欄は未取得のあいだ出ない。
 * 物差し (`shapeDiff`) はデスクトップ側と同じ物を使う。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shapeDiff } from '../../shared/__tests__/shapeDiff';

const tokens = new Map<string, string>();

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async (id: string) => tokens.get(id) ?? null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [...tokens.keys()],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: null }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string; data?: Record<string, unknown> };
type Hub = { fetchSnapshot: (s?: string) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  tokens.clear();
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** ブラウザ版が自前に合成するサービスと、同梱スナップショットの鍵。 */
const SYNTHESIZED: readonly { readonly id: string; readonly snapshotKey: string; readonly why: string }[] = [
  { id: 'stocks', snapshotKey: 'stocks', why: 'ウォッチリストを localStorage から読み、モック価格で合成する' },
  { id: 'emotions', snapshotKey: 'emotions', why: '気分ログ・分析履歴を localStorage から読んで組み直す' },
  { id: 'talent', snapshotKey: 'talent', why: '保存した申告・施策から判定し直す (main と同じ buildTalentSnapshot)' },
  { id: 'security', snapshotKey: 'security', why: '同梱を広げて keysConfigured だけ金庫の実態に差し替える' },
];

describe('ブラウザ版が合成した形 vs 同梱スナップショット', () => {
  it('走査が生きている (合成するサービスが 4 件以上ある)', () => {
    expect(SYNTHESIZED.length).toBeGreaterThanOrEqual(4);
    for (const s of SYNTHESIZED) expect(s.why.length, s.id).toBeGreaterThanOrEqual(20);
  });

  it('★ 4 サービスすべてで、合成と同梱の欄が一致する', async () => {
    const hub = await loadHub();
    const { SNAPSHOT } = await import('../data/snapshot');
    const snap = SNAPSHOT as unknown as Record<string, unknown>;
    const bad: string[] = [];
    for (const { id, snapshotKey } of SYNTHESIZED) {
      const res = await hub.fetchSnapshot(id);
      if (!res.ok) {
        bad.push(`${id}: 合成されなかった (${res.code ?? '?'} ${res.message ?? ''})`);
        continue;
      }
      const d = shapeDiff(snap[snapshotKey], res.data);
      if (d.snapshotOnly.length || d.fetchedOnly.length) {
        bad.push(`${id}: 同梱だけ=[${d.snapshotOnly.join(',')}] 合成だけ=[${d.fetchedOnly.join(',')}]`);
      }
    }
    expect(bad, 'ブラウザ版でだけ画面が壊れる形のずれ').toEqual([]);
  });

  it('合成しないサービスは同梱のまま (not_implemented を返し、形をいじらない)', async () => {
    const hub = await loadHub();
    // github は資格情報が無く liveRead の一覧にも無いので、ブラウザ版では同梱のまま。
    const res = await hub.fetchSnapshot('github');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('not_implemented');
  });

  it('標本: 物差しは欄の差を実際に拾う (この検査が空振りしていない)', () => {
    expect(shapeDiff({ a: { b: 1, c: 2 } }, { a: { b: 1 } })).toEqual({ snapshotOnly: ['a.c'], fetchedOnly: [] });
  });

  it('標本: **拾えない形**も書いておく —— 中身が全部消えた物は「分からない」側に落ちる', () => {
    // 空の物は Map 相当 (talent の byStep) と区別できないので比べない、という
    // 決めごとの裏側。ここを勘違いして「全部見ている」と思わないために標本で残す。
    expect(shapeDiff({ a: { b: 1 } }, { a: {} })).toEqual({ snapshotOnly: [], fetchedOnly: [] });
  });
});
