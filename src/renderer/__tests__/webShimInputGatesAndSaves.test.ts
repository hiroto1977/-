/** @vitest-environment jsdom */
/**
 * **残っていた入口 4 つ —— 受け取らない値、保存できないとき、更新の有無。**
 *
 * 実測 (2026-09-06) で最後まで未到達だった塊を、経路ごとに留める:
 *
 *   `checkUpdate`                更新の有無。ブラウザ版は自分を更新できないが、
 *                                「配っている HTML が古い」ことは伝えられる。
 *                                通信・本文が壊れているときに**嘘をつかず unknown** に倒す。
 *   `stocks/compare-strategies`  symbol と初期資金の門。
 *   `talent|teamradar/save-state` 保存できないときに `action_failed` を返す (画面が出す)。
 *   `talent/judge-leader`         入力を絞る (文字列以外を落とし、候補者名は 64 字で切る)。
 *   `templates/export-template`   知らない書式 id を弾く。
 *   `teamradar/export-svg`        画面に図が無いときは、その旨を返す。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  // 読み出しの新しい入口 (「未設定」と「読めない」を分ける)。既定は「読めた・未設定」。
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: null }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string; data?: Record<string, unknown> };
type Verdict = { status: string; current: string; latest: string | null; url: string | null };
type Hub = {
  invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result>;
  checkUpdate: () => Promise<Verdict>;
};

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const originalFetch = globalThis.fetch;
let fetchImpl: () => Promise<Response>;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  fetchImpl = async () => new Response('{}', { status: 200 });
  globalThis.fetch = (async () => fetchImpl()) as typeof fetch;
  // ダウンロードの経路 (jsdom には無い)
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:x';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('checkUpdate — 分からないときは分からないと言う', () => {
  const release = (tag: string): Response =>
    new Response(JSON.stringify({ tag_name: tag, html_url: `https://github.com/hiroto1977/-/releases/tag/${tag}` }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('★ 新しい版があれば update-available と、その版・URL を返す', async () => {
    fetchImpl = async () => release('v9.9.9');
    const v = await (await loadHub()).checkUpdate();
    expect(v.status).toBe('update-available');
    expect(v.latest).toBe('v9.9.9');
    expect(v.url).toContain('/releases/tag/v9.9.9');
  });

  it('★ 同じ版なら up-to-date', async () => {
    fetchImpl = async () => release('v0.1.0');
    const v = await (await loadHub()).checkUpdate();
    expect(v.status).toBe('up-to-date');
  });

  it('★ 通信が失敗したら unknown (更新の確認の失敗でアプリを使えなくしない)', async () => {
    fetchImpl = async () => {
      throw new Error('offline');
    };
    const v = await (await loadHub()).checkUpdate();
    expect(v.status).toBe('unknown');
    expect(v.latest).toBeNull();
  });

  it('★ HTTP エラーでも unknown', async () => {
    fetchImpl = async () => new Response('rate limited', { status: 403 });
    const v = await (await loadHub()).checkUpdate();
    expect(v.status).toBe('unknown');
  });

  it('★ 本文が JSON でなければ unknown', async () => {
    fetchImpl = async () => new Response('<html>', { status: 200 });
    const v = await (await loadHub()).checkUpdate();
    expect(v.status).toBe('unknown');
  });

  it('★ tag が版数でない / URL が GitHub のリリースでないなら unknown', async () => {
    fetchImpl = async () =>
      new Response(JSON.stringify({ tag_name: 'nightly', html_url: 'https://evil.example/releases/tag/x' }), {
        status: 200,
      });
    const v = await (await loadHub()).checkUpdate();
    expect(v.status).toBe('unknown');
  });
});

describe('stocks/compare-strategies — 入口の門', () => {
  it('★ symbol が規則外なら弾く', async () => {
    const hub = await loadHub();
    for (const bad of ['', '   ', 'toooooooooooooolong', 'A;B', 42, null]) {
      const r = await hub.invoke('stocks', 'compare-strategies', { symbol: bad });
      expect(r.ok, `symbol=${String(bad)}`).toBe(false);
      expect(r.message).toContain('symbol must be');
    }
  });

  it('★ initialCash が正の有限値でないなら弾く', async () => {
    const hub = await loadHub();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await hub.invoke('stocks', 'compare-strategies', { symbol: 'AAPL', initialCash: bad });
      expect(r.ok, `initialCash=${String(bad)}`).toBe(false);
      expect(r.message).toContain('initialCash must be');
    }
  });

  it('対照: 正しい入力は通り、symbol は大文字に揃う', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('stocks', 'compare-strategies', { symbol: 'aapl', initialCash: 500_000 });
    expect(r.ok, r.message).toBe(true);
    expect(JSON.stringify(r.data)).toContain('AAPL');
  });

  it('initialCash を省略すると既定値で通る', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('stocks', 'compare-strategies', { symbol: 'MSFT' });
    expect(r.ok, r.message).toBe(true);
  });
});

describe('save-state — 保存できないときは失敗を返す', () => {
  /** 保存を禁じる (jsdom の setItem はプロトタイプ側)。 */
  function blockWrites(): void {
    const err = new Error('QuotaExceededError');
    err.name = 'QuotaExceededError';
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw err;
    });
  }

  it('★ talent: 保存できなければ action_failed (画面が「保存できませんでした」を出す)', async () => {
    const hub = await loadHub();
    blockWrites();
    const r = await hub.invoke('talent', 'save-state', { reports: [], initiatives: [], members: [] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_failed');
    expect(r.message).toContain('localStorage');
  });

  it('★ teamradar: 同じく action_failed', async () => {
    const hub = await loadHub();
    blockWrites();
    const r = await hub.invoke('teamradar', 'save-state', { department: '営業' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_failed');
  });

  it('対照: 書ける端末では ok を返し、正規化した値が返る', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('talent', 'save-state', {
      reports: [{ department: '営業', diseases: ['imprint'] }],
      initiatives: [{ name: 'a', probability: 999 }],
      members: [],
    });
    expect(r.ok, r.message).toBe(true);
    // 上限外の確率は保存前に落ちる (main と同じ正規化を通る)
    expect(JSON.stringify(r.data)).not.toContain('999');
  });
});

describe('talent/judge-leader — 入力を絞る', () => {
  it('★ flagged の文字列以外は落とし、配列でなければ空として扱う', async () => {
    const hub = await loadHub();
    const a = await hub.invoke('talent', 'judge-leader', { flagged: ['imprint', 42, null], candidate: '山田' });
    expect(a.ok, a.message).toBe(true);
    const b = await hub.invoke('talent', 'judge-leader', { flagged: 'imprint', candidate: '山田' });
    expect(b.ok, b.message).toBe(true);
    // 配列でない flagged は「申告なし」と同じ判定になる
    const none = await hub.invoke('talent', 'judge-leader', { flagged: [], candidate: '山田' });
    expect(JSON.stringify(b.data?.fitness)).toBe(JSON.stringify(none.data?.fitness));
  });

  it('★ 候補者名は 64 字で切り、文字列でなければ空にする', async () => {
    const hub = await loadHub();
    const long = await hub.invoke('talent', 'judge-leader', { flagged: [], candidate: 'あ'.repeat(100) });
    expect((long.data?.candidate as string).length).toBe(64);
    const notString = await hub.invoke('talent', 'judge-leader', { flagged: [], candidate: 42 });
    expect(notString.data?.candidate).toBe('');
  });
});

describe('書き出しの入口', () => {
  it('★ 知らない書式 id は弾く (id を文面に出す)', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('templates', 'export-template', { templateId: 'no-such-template' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no-such-template');
  });

  it('★ teamradar: 画面に図が無ければ、切り替えてから試すよう返す', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('teamradar', 'export-svg', { title: 'x' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('チームレーダー');
  });

  it('対照: 画面に図が在れば書き出せる (xmlns を補う)', async () => {
    document.body.innerHTML = '<svg role="img" aria-label="チームレーダー"><text>x</text></svg>';
    const hub = await loadHub();
    const r = await hub.invoke('teamradar', 'export-svg', { title: 'チーム' });
    expect(r.ok, r.message).toBe(true);
    expect(r.data?.path).toMatch(/\.svg$/);
    expect((r.data?.bytes as number) > 0).toBe(true);
  });
});
