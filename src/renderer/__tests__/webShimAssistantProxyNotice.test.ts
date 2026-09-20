/** @vitest-environment jsdom */
/**
 * **「読めなかった」を「未設定」と混ぜない —— AI の 2 経路にも同じ規則が在る** (2026-09-20 · パス 352)。
 *
 * ## 何が在ったか
 *
 * ブラウザ版 shim には、端末の保管先が**読めなかった**ときに
 * 「未設定です、登録してください」と言わないための分岐が **3 か所**在る:
 *
 * ```
 *   web-shim.ts  getProxyTransport        ← webShimProxyUnreadable.test.ts が走らせていた
 *   web-shim.ts  callAssistantChat        ← **誰も走らせていなかった**
 *   web-shim.ts  callAssistantChatAll     ← **誰も走らせていなかった**
 * ```
 *
 * 2026-09-20 の変異検査で、後の 2 つは `NoCoverage` だった。
 *
 * ## なぜ効くのか
 *
 * この分岐が壊れると、**プロキシを既に登録している利用者**が
 * 「プロキシを構成してください」と案内される。その人は Worker の URL と
 * **共有シークレットを打ち直し、同じ所で失敗する** —— 案内が、
 * 直しようのない作業へ誘導する形になる (パス 313 の `getProxyTransport` で
 * 一度直した当のこと)。しかも打ち直させる値の 1 つは秘密である。
 *
 * ## ここで測るもの
 *
 * `browserDirect: false` の提供者 (OpenAI) を指名し、保管先が
 *
 *   - **無い** (`unreadable: null`) → 「プロキシを構成してください」
 *   - **読めなかった** (`unreadable: Error`) → 端末の保管先が読めない旨
 *
 * を 2 経路 (`chat` / `chatAll`) とも言い分けることを、実際に invoke して確かめる。
 * 加えて**規則を持つ 3 か所の台帳**を両方向に留める。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join as joinPath } from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const h = vi.hoisted(() => ({ unreadable: null as unknown }));

vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: h.unreadable }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  isPrivateOrReservedTarget: () => false,
}));
vi.mock('../security/vault', () => ({
  getVault: () => ({
    // OpenAI だけを設定済みにする (browserDirect: false → プロキシが要る)。
    getToken: async (id: string) => (id === 'assistant' ? JSON.stringify({ openai: 'sk-test' }) : null),
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['assistant'],
    listConfigured: async () => ['assistant'],
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

type Result = {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { answers?: { provider: string; ok: boolean; error?: string }[] };
};
type Hub = { invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const ASK = { provider: 'openai', messages: [{ role: 'user', content: 'こんにちは' }] };

beforeEach(() => {
  h.unreadable = null;
  localStorage.clear();
});

describe('assistant/chat —— 未設定と「読めなかった」を言い分ける (パス 352)', () => {
  it('保管先が無いときは「プロキシを構成してください」', async () => {
    h.unreadable = null;
    const hub = await loadHub();
    const r = await hub.invoke('assistant', 'chat', ASK);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_configured');
    expect(r.message).toContain('プロキシ');
    expect(r.message).not.toContain('読み取れません');
  });

  it('★ 保管先が読めなかったときは、登録を促さずそう言う', async () => {
    h.unreadable = new Error('InvalidStateError: database is closed');
    const hub = await loadHub();
    const r = await hub.invoke('assistant', 'chat', ASK);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_configured');
    // 端末の保管先の話であることが分かる文面。
    expect(r.message).toMatch(/読み|端末|ブラウザ/);
    // **登録を促さない** —— 既に登録している人に打ち直させない。
    expect(r.message).not.toContain('構成してください');
    // 標本: この針は「未設定」側の文面に当たる (当たらなければ上の not は空の検査)。
    expect('「設定」ページでプロキシ (Cloudflare Worker) を構成してください').toContain('構成してください');
  });
});

describe('assistant/chatAll —— 1 社の失敗として同じ言い分けをする (パス 352)', () => {
  it('保管先が無いときは「プロキシ未設定」', async () => {
    h.unreadable = null;
    const hub = await loadHub();
    const r = await hub.invoke('assistant', 'chatAll', { messages: ASK.messages });
    expect(r.ok).toBe(true);
    const answers = r.data?.answers ?? [];
    const openai = answers.find((a) => a.provider === 'openai');
    expect(openai, JSON.stringify(answers)).toBeDefined();
    expect(openai!.ok).toBe(false);
    expect(openai!.error).toContain('プロキシ未設定');
  });

  it('★ 保管先が読めなかったときは、その旨を 1 社の理由として返す', async () => {
    h.unreadable = new Error('InvalidStateError: database is closed');
    const hub = await loadHub();
    const r = await hub.invoke('assistant', 'chatAll', { messages: ASK.messages });
    expect(r.ok).toBe(true);
    const openai = (r.data?.answers ?? []).find((a) => a.provider === 'openai');
    expect(openai!.ok).toBe(false);
    expect(openai!.error).toMatch(/読み|端末|ブラウザ/);
    expect(openai!.error).not.toContain('プロキシ未設定');
    // 標本: 針が「未設定」側の文面に当たる。
    expect('OpenAI はブラウザから直接呼び出せません (プロキシ未設定)').toContain('プロキシ未設定');
  });
});

describe('「読めなかった」を分ける規則を持つ所の母集団 (パス 352)', () => {
  const REPO = joinPath(__dirname, '..', '..', '..');

  /** `proxy.unreadable !== null ? deviceStoreFailureMessage(...)` を持つ関数。 */
  function sitesInShim(): string[] {
    const src = readOriginalSource(joinPath(REPO, 'src/renderer/web-shim.ts')).split('\n');
    const decls: [number, string][] = [];
    src.forEach((line, i) => {
      const m = /^(?:export )?(?:async )?function ([A-Za-z_$][\w$]*)\(/.exec(line);
      if (m) decls.push([i + 1, m[1]!]);
    });
    const fnOf = (line: number): string => {
      let name = '(top level)';
      for (const [ln, n] of decls) {
        if (ln <= line) name = n;
        else break;
      }
      return name;
    };
    const out = new Set<string>();
    src.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (/unreadable !== null/.test(t)) out.add(fnOf(i + 1));
    });
    return [...out].sort();
  }

  const LEDGER: Readonly<Record<string, { provenBy: string; why: string }>> = {
    getProxyTransport: {
      provenBy: 'src/renderer/__tests__/webShimProxyUnreadable.test.ts',
      why: 'CORS を塞がれた SaaS の読み書き全般が通る口。2026-09-06 に「登録してください」と言っていたのを直した最初の場所 (パス 313)。',
    },
    callAssistantChat: {
      provenBy: 'src/renderer/__tests__/webShimAssistantProxyNotice.test.ts',
      why: 'browserDirect でない提供者 (OpenAI ほか) を指名したときの口。2026-09-20 (パス 352) まで、この分岐に到達する検査が 1 つも無かった。',
    },
    callAssistantChatAll: {
      provenBy: 'src/renderer/__tests__/webShimAssistantProxyNotice.test.ts',
      why: '全 AI 合議。1 社ぶんの理由として返るので全体は ok:true のまま —— 文面が崩れても他社の回答に紛れて気付きにくい側である。',
    },
  };

  it('★ 台帳と実物が一致する (両方向)', () => {
    expect(sitesInShim()).toEqual(Object.keys(LEDGER).sort());
  });

  it('★ どの所も「走らせる検査」を名指しし、その検査は実在する', () => {
    for (const [fn, row] of Object.entries(LEDGER)) {
      expect(readOriginalSource(joinPath(REPO, row.provenBy)).length, fn).toBeGreaterThan(0);
      expect(row.why.length, fn).toBeGreaterThan(20);
    }
  });
});
