// @vitest-environment jsdom
/**
 * **「連携をまとめて取り直す」を押すと、開いている画面の数字まで新しくなる。** (2026-11-27)
 *
 * 実物のボタン (`RefreshAllPanel`) と、同じ root に `useServiceData('freee')` を読む画面の代役を並べ、
 * 押したあとに代役の表示が取れた内容 (`live`) へ替わることを見る。結果の文・取れなかった連携先の文・
 * 鍵の一覧が読めないときの断りも見る。
 */
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchResult, ServiceId } from '../../../preload/bridgeTypes';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { waitForText } from '../../__tests__/jsdomWait';
import { RefreshAllPanel } from '../RefreshAllPanel';
import { useServiceData } from '../../hooks/useServiceData';
import { SNAPSHOT } from '../../data/snapshot';
import { forgetAllFetches } from '../../data/lastGoodFetch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

/** 画面の代役: freee の取得元と、月次の件数を出す。 */
function FreeeProbe() {
  const { source, data } = useServiceData('freee', SNAPSHOT.freee);
  return createElement('p', { 'data-probe': source }, `freee:${source}:${data.monthly.length}`);
}

function hubWith(over: Record<string, unknown>): void {
  const h = (globalThis as unknown as { serviceHub: Record<string, unknown> }).serviceHub;
  Object.assign(h, over);
}

beforeEach(() => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  forgetAllFetches();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function mount(): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(Fragment, null, createElement(RefreshAllPanel), createElement(FreeeProbe)));
  });
}

const text = (): string => host.textContent ?? '';

async function press(): Promise<void> {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.includes('連携をまとめて取り直す'));
  if (!b) throw new Error('ボタンが無い');
  await act(async () => {
    b.click();
  });
}

describe('連携をまとめて取り直す (画面)', () => {
  it('★ 押すと取り直し、開いている画面の表示が取れた内容に替わる', async () => {
    const monthly = [{ month: '2026-10', net: 1 }, { month: '2026-11', net: 2 }, { month: '2026-12', net: 3 }];
    // 画面を描いた時点では鍵が無い (自動の取得は走らない)。押す前に鍵を登録した形にする。
    hubWith({ listConfigured: () => Promise.resolve([]) });
    await mount();
    await waitForText(text, 'freee:snapshot');
    hubWith({
      listConfigured: () => Promise.resolve(['freee', 'github'] as ServiceId[]),
      fetchSnapshot: (id: ServiceId): Promise<FetchResult> =>
        Promise.resolve(
          id === 'freee'
            ? { ok: true, data: { ...SNAPSHOT.freee, monthly } }
            : { ok: false, code: 'fetch_failed', message: '401 Unauthorized ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
        ),
    });
    await press();
    await waitForText(text, '取り直した 1 件・取れなかった 1 件');
    expect(text()).toContain('freee:live:3');
    // 取れなかった連携先は名前と理由を言い、鍵の形の文字列は伏せる
    const failed = host.querySelector('[data-refresh-all-failed]')?.textContent ?? '';
    expect(failed).toContain('ギットハブ');
    expect(failed).toContain('401');
    expect(failed).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    // 鍵がまだの連携先は数と名前を出す
    expect(text()).toMatch(/鍵がまだの連携先 \d+ 件/);
  });

  it('★ 鍵の一覧が読めなければ断り、何も取らない', async () => {
    const fetchSnapshot = vi.fn();
    hubWith({ listConfigured: () => Promise.resolve([]) });
    await mount();
    await waitForText(text, 'freee:snapshot');
    hubWith({ listConfigured: () => Promise.reject(new Error('store unreadable')), fetchSnapshot });
    await press();
    await waitForText(text, '連携先の一覧を読めませんでした');
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(text()).toContain('freee:snapshot');
  });

  it('鍵がどれも無ければ、そう言う', async () => {
    hubWith({ listConfigured: () => Promise.resolve([]) });
    await mount();
    await press();
    await waitForText(text, '鍵を登録済みの連携先がまだありません');
  });

  it('★ 先に始まっていた取得が遅れて返っても、まとめて取った内容を上書きしない', async () => {
    let releaseOld: (r: FetchResult) => void = () => undefined;
    // 画面の自動の取得 (鍵あり) は遅く返る
    hubWith({
      listConfigured: () => Promise.resolve(['freee'] as ServiceId[]),
      fetchSnapshot: () => new Promise<FetchResult>((r) => (releaseOld = r)),
    });
    await mount();
    hubWith({
      fetchSnapshot: () =>
        Promise.resolve({ ok: true, data: { ...SNAPSHOT.freee, monthly: [{ month: '2026-12', net: 9 }] } }),
    });
    await press();
    await waitForText(text, 'freee:live:1');
    await act(async () => {
      releaseOld({ ok: true, data: { ...SNAPSHOT.freee, monthly: [] } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(text()).toContain('freee:live:1');
  });
});
