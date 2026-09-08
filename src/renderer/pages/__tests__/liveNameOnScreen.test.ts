/** @vitest-environment jsdom */
/**
 * **`as const` で型が狭まると、live 取得だけが通る表示の枝が「型の上で死ぬ」。**
 *
 * `snapshot.ts` は末尾が `} as const;` なので、プレースホルダの `companyName: ''` /
 * `userName: ''` は**リテラル型 `""`** になる (実測: `Type '"x"' is not assignable
 * to type '""'`)。画面は `typeof SNAPSHOT.freee` のように**静的 snapshot から型を取る**ため、
 *
 * ```tsx
 * who={<>freee 会計連携{live.companyName ? ` · ${live.companyName}` : ''}</>}
 * ```
 *
 * の真の枝が `never` になり、**`tsc` はその中を一切検査しなくなる**。ところが
 * client (`main/clients/freee.ts:60`, `microsoft-365.ts:54`) は `companyName: string` /
 * `userName: string` を返すので、**live 取得ではその枝が実際に走る** ——
 * 本番で動く表示コードだけが型検査の外に置かれていた。
 *
 * 直しは同じファイルの**直下の行に既に在った**: 配列のプレースホルダは
 * `[] as { … }[]` で広げてある。文字列だけ `as string` が漏れていた。
 *
 * ここは**枝が実際に走ることを実物の画面で**留める (型が狭まれば `tsc` が鳴るが、
 * それは「枝が死んだ」ことしか言わない —— 走ることは画面で見る)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { SNAPSHOT } from '../../data/snapshot';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';

let container: HTMLDivElement;
let root: Root | null = null;

/**
 * live 取得が成功して payload を返す serviceHub。
 *
 * `listConfigured` にその id を入れないと画面は「未連携」で snapshot を出したままになり、
 * **live の枝を通らない** (最初に書いたときそれで空振りした)。
 */
function installHub(serviceId: string, payload: unknown): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([serviceId]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: payload }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`service missing: ${id}`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('live 取得の名前が見出しに出る (型の上で死んでいた枝)', () => {
  it('★ freee: live の companyName が「freee 会計連携 · 〜」に出る', async () => {
    installHub('freee', { ...SNAPSHOT.freee, companyName: 'サンプル商事株式会社', isMock: false });
    await mount('freee');
    expect(text()).toContain('freee 会計連携 · サンプル商事株式会社');
  });

  it('★ 対照: companyName が空なら区切りの「·」を足さない', async () => {
    installHub('freee', { ...SNAPSHOT.freee, companyName: '', isMock: false });
    await mount('freee');
    expect(text()).toContain('freee 会計連携');
    expect(text()).not.toContain('freee 会計連携 ·');
  });

  it('★ Microsoft 365: live の userName が「Microsoft 365 · 〜」に出る', async () => {
    installHub('microsoft-365', { ...SNAPSHOT.microsoft365, userName: '山田 太郎', isMock: false });
    await mount('microsoft-365');
    expect(text()).toContain('Microsoft 365 · 山田 太郎');
  });

  it('★ 対照: userName が空なら区切りの「·」を足さない', async () => {
    installHub('microsoft-365', { ...SNAPSHOT.microsoft365, userName: '', isMock: false });
    await mount('microsoft-365');
    expect(text()).toContain('Microsoft 365');
    expect(text()).not.toContain('Microsoft 365 ·');
  });

  /**
   * **型が狭まれば `tsc` が鳴る** —— この 2 行はその対照。`as string` を外すと
   * リテラル型 `""` に戻り、代入が型エラーになる (対照は `npx tsc` の exit code)。
   */
  it('★ プレースホルダの型は `string` であって `""` ではない', () => {
    const company: typeof SNAPSHOT.freee.companyName = 'サンプル商事株式会社';
    const user: typeof SNAPSHOT.microsoft365.userName = '山田 太郎';
    expect(company).not.toBe('');
    expect(user).not.toBe('');
  });
});
