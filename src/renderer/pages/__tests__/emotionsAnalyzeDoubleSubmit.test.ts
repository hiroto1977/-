/** @vitest-environment jsdom */
/**
 * **一覧から感情分析へ送るボタンを 2 度押しても、送るのは 1 回** (2026-09-27 · パス 493h)。
 *
 * `SlackPage` と `GmailPage` の「Emotions で分析」は、押すと一覧を 1 つの本文にまとめて
 * `emotions/analyze-text` へ送る。その action は **有料の Anthropic API を呼び**
 * (`main/clients/emotions.ts` の `analyzeText` —— `x-api-key` を載せた POST)、
 * 結果を **Emotions の履歴へ保存する** (`store.analyses.unshift(entry)`)。
 *
 * 2026-09-27 まで、この 2 つのボタンは **押している間の関門を 1 つも持たなかった** ——
 * `onClick={async () => { … await invoke(…) … }}` を素で書き、`disabled` は
 * 「送る物が 1 件も無い」ときだけだった。実測 (jsdom · 直す前):
 *
 * | 押し方 | invoke の回数 |
 * | --- | ---: |
 * | 押す → 描き直す → もう 1 度押す (人のダブルクリック) | **2** |
 * | 同じ tick に 2 度 (キーの連打・自動化) | **2** |
 *
 * どちらも**同じ本文で 2 回課金され、履歴に同じ分析が 2 件残る**。
 * 同じアプリの他の送信口 (Slack の投稿・Gmail の下書き・GitHub の issue …) は
 * どれも「押している間は押せない」状態を持っており、この 2 つだけが持っていなかった
 * (パス 124 の `submitGuardCensus` は record store に触るファイルだけを数え、
 * 外へ送る入口を「規則の外」として残していた —— その外側の測定で出た)。
 *
 * 母集団は `renderer/__tests__/clickSendGuardCensus.test.ts` が持つ。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

interface Call {
  readonly service: string;
  readonly action: string;
}

type Reply = { ok: true; data: unknown } | { ok: false; code: string; message: string };

let invoked: Call[];
let pending: Array<(r: Reply) => void>;
let alerts: string[];
let container: HTMLDivElement;
let root: Root | null = null;

/** 一覧に 1 件だけ在る、この検査だけの印 (見本の一覧と区別して「生の一覧が届いた」を待つ)。 */
const LIVE_MARK = 'zz-live-row-493h';

function liveSnapshot(serviceId: 'slack' | 'gmail'): Record<string, unknown> {
  return serviceId === 'slack'
    ? {
        channels: [
          { id: 'C1', name: LIVE_MARK, purpose: 'p', isArchived: false, permalink: 'https://example.slack.com/archives/C1' },
        ],
      }
    : {
        threads: [
          { id: 't1', subject: LIVE_MARK, sender: 'a@example.com', snippet: 's', date: '2026-09-01', unread: false },
        ],
        profile: { emailAddress: 'me@example.com' },
      };
}

function stubHub(serviceId: 'slack' | 'gmail'): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([serviceId]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: liveSnapshot(serviceId) }),
    // **返事を保留する** —— 飛行中にもう 1 度押す形を作るため。
    invoke: (service: string, action: string) => {
      invoked.push({ service, action });
      return new Promise<Reply>((resolve) => {
        pending.push(resolve);
      });
    },
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(false),
    authorize: () => Promise.resolve({ ok: true, data: {} }),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

function analyzeButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Emotions で分析'),
  ) as HTMLButtonElement | undefined;
}

/** 生の一覧が届き、分析ボタンが押せるところまで待つ。 */
async function mount(serviceId: 'slack' | 'gmail'): Promise<HTMLButtonElement> {
  stubHub(serviceId);
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing from the sidebar`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settleUntil(() => (container.textContent ?? '').includes(LIVE_MARK), `${serviceId} の生の一覧が届く`);
  return waitForElement(() => {
    const b = analyzeButton();
    return b && !b.disabled ? b : null;
  }, `${serviceId} の「Emotions で分析」が押せる`);
}

function click(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  indexedDB.deleteDatabase('business-hub-data');
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  invoked = [];
  pending = [];
  alerts = [];
  (globalThis as unknown as { alert: (m?: string) => void }).alert = (m) => {
    alerts.push(m ?? '');
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  // 保留したままの返事を解いてから外す (unmount 後の setState を残さない)。
  for (const resolve of pending.splice(0)) resolve({ ok: false, code: 'x', message: 'teardown' });
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe.each(['slack', 'gmail'] as const)('%s の「Emotions で分析」は押している間 1 回しか送らない', (serviceId) => {
  it('★ 押す → 描き直す → もう 1 度押す (人のダブルクリック) で、送るのは 1 回', async () => {
    const button = await mount(serviceId);
    await act(async () => {
      click(button);
    });
    // 1 度目の描き直しが済んだ後の 2 度目 —— 人の 2 回目のクリックはこの位置に来る。
    await act(async () => {
      click(analyzeButton()!);
    });
    expect(invoked.filter((c) => c.action === 'analyze-text')).toHaveLength(1);
    expect(invoked[0]).toEqual({ service: 'emotions', action: 'analyze-text' });
    // 押せない見た目も揃っている (関門が画面に見える)。
    expect(analyzeButton()!.disabled).toBe(true);
  });

  it('★ 同じ tick に 2 度押しても、送るのは 1 回 (描き直しを待たない関門)', async () => {
    const button = await mount(serviceId);
    await act(async () => {
      click(button);
      click(button);
    });
    expect(invoked.filter((c) => c.action === 'analyze-text')).toHaveLength(1);
  });

  it('返事が来たら、もう 1 度押せる (関門は閉じっぱなしにならない)', async () => {
    const button = await mount(serviceId);
    await act(async () => {
      click(button);
    });
    expect(invoked).toHaveLength(1);
    await act(async () => {
      pending.shift()!({ ok: true, data: { id: 'a1', sentiment: 'neutral' } });
    });
    const again = await waitForElement(() => {
      const b = analyzeButton();
      return b && !b.disabled ? b : null;
    }, '返事の後に「Emotions で分析」がまた押せる');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('Emotions タブに結果を保存しました');
    await act(async () => {
      click(again);
    });
    expect(invoked).toHaveLength(2);
  });

  it('失敗の返事でも、もう 1 度押せる (失敗で関門が固まらない)', async () => {
    const button = await mount(serviceId);
    await act(async () => {
      click(button);
    });
    await act(async () => {
      pending.shift()!({ ok: false, code: 'upstream', message: '一時的に失敗' });
    });
    await waitForElement(() => {
      const b = analyzeButton();
      return b && !b.disabled ? b : null;
    }, '失敗の後に「Emotions で分析」がまた押せる');
    expect(alerts).toEqual(['感情分析失敗: 一時的に失敗']);
  });
});
