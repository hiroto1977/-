// @vitest-environment jsdom
/**
 * グーグルアナリティクスの画面 (2026-11-22) —— 実物の client に応答を食わせ、その戻りで画面を描く。
 *
 * 算定の正しさは `shared/api/__tests__/googleAnalytics.test.ts` が持つ。ここが見るのは**配線**:
 * 見本が見本と名乗ること・一覧の先頭のプロパティで実物の `run-report` が走ること・読めない数が「不明」と出ること・
 * 打ったプロパティ ID が関門を通って照会と端末の記憶へ届くこと・期間の選び直しが照会に届くこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GoogleAnalyticsPage } from '../GoogleAnalyticsPage';
import { ACTIONS, fetchGoogleAnalyticsSnapshot } from '../../../main/clients/google-analytics';
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';
import { GA_PROPERTY_KEY } from '../../data/googleAnalyticsProperty';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const SUMMARIES = {
  accountSummaries: [
    {
      displayName: '本物のアカウント',
      propertySummaries: [
        { property: 'properties/111', displayName: '会社のサイト' },
        { property: 'properties/222', displayName: 'お店のサイト' },
      ],
    },
  ],
};

const DAILY = {
  dimensionHeaders: [{ name: 'date' }],
  rows: [
    { dimensionValues: [{ value: '20261120' }], metricValues: [{ value: '40' }] },
    { dimensionValues: [{ value: '20261121' }], metricValues: [{ value: 'abc' }] },
  ],
  totals: [{ metricValues: [{ value: '57' }] }],
};

const CHANNELS = {
  dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }],
  rows: [
    { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '60' }, { value: '40' }] },
    { dimensionValues: [{ value: 'Organic Social' }], metricValues: [{ value: '20' }, { value: '15' }] },
  ],
  totals: [{ metricValues: [{ value: '80' }, { value: '57' }] }],
};

let container: HTMLDivElement;
let root: Root | null = null;
let reportFetch: ReturnType<typeof vi.fn<typeof fetch>>;
let invoke: ReturnType<typeof vi.fn>;

async function mount(configured: boolean): Promise<void> {
  const snapshot = configured
    ? await fetchGoogleAnalyticsSnapshot({ token: 'ya29.example', fetch: vi.fn<typeof fetch>().mockResolvedValue(json(SUMMARIES)) })
    : null;
  reportFetch = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { dimensions: { name: string }[] };
    return json(body.dimensions[0]!.name === 'date' ? DAILY : CHANNELS);
  });
  invoke = vi.fn(async (service: string, action: string, payload: Record<string, unknown>) => {
    if (service !== 'google-analytics' || action !== 'run-report') return { ok: false, code: 'action_not_found', message: 'x' };
    try {
      return { ok: true, data: await ACTIONS['run-report']!({ token: 'ya29.example', fetch: reportFetch, payload }) };
    } catch (e) {
      return { ok: false, code: 'action_failed', message: (e as Error).message };
    }
  });
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve(configured ? ['google-analytics'] : []),
    fetchSnapshot: () =>
      Promise.resolve(configured ? { ok: true, data: snapshot } : { ok: false, code: 'not_configured', message: '未設定' }),
    invoke,
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GoogleAnalyticsPage));
  });
}

const text = (): string => container.textContent ?? '';

async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function chooseSelect(label: string, value: string): Promise<void> {
  const el = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!el) throw new Error(`選択欄「${label}」が無い`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function clickButton(label: string): Promise<void> {
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent === label);
  if (!b) throw new Error(`ボタン「${label}」が無い`);
  await act(async () => {
    b.click();
  });
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('グーグルアナリティクスの画面: 連携する前 (同梱の見本)', () => {
  it('見本の訪問者数と流入元を出し、見本だと名乗る。照会は走らない', async () => {
    await mount(false);
    await waitForText(text, '訪問者数 (直近 28 日)');
    expect(container.querySelector('[data-ga-sample-note]')?.textContent).toContain('同梱の見本 (架空)');
    expect(text()).toContain('1,830 人');
    expect(text()).toContain('自然検索 (Organic Search)');
    expect(text()).toContain('45.7%');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('グーグルアナリティクスの画面: 連携した後', () => {
  it('★ 一覧の先頭のプロパティで run-report が走り、実データ・読めない数は「不明」', async () => {
    await mount(true);
    await waitForText(text, '57 人');
    expect(invoke).toHaveBeenCalledWith('google-analytics', 'run-report', { propertyId: '111', days: 28 });
    expect(String(reportFetch.mock.calls[0]![0])).toBe('https://analyticsdata.googleapis.com/v1beta/properties/111:runReport');
    expect(container.querySelector('[data-ga-sample-note]')).toBeNull();
    expect(text()).toContain('訪問者 不明 人');
    expect(text()).toContain('ソーシャル (Organic Social)');
    expect(text()).toContain('75%');
    expect(text()).toContain('会社のサイト · 本物のアカウント · ID 111');
  });

  it('打ったプロパティ ID は関門を通ってから照会し、端末に覚える', async () => {
    await mount(true);
    await waitForText(text, '57 人');
    const input = container.querySelector<HTMLInputElement>('input[aria-label="プロパティ ID"]')!;
    await typeInto(input, '12/../34');
    await clickButton('表示');
    expect(container.querySelector('[data-ga-form-error]')?.textContent).toContain('数字だけ');
    expect(localStorage.getItem(GA_PROPERTY_KEY)).toBeNull();

    await typeInto(input, ' properties/333 ');
    await clickButton('表示');
    await settleUntil(
      () => invoke.mock.calls.some((c) => (c[2] as { propertyId: string }).propertyId === '333'),
      '333 で照会する',
    );
    expect(localStorage.getItem(GA_PROPERTY_KEY)).toBe('333');
  });

  it('期間を選び直すと、その日数で照会し直す', async () => {
    await mount(true);
    await waitForText(text, '57 人');
    await chooseSelect('期間', '90');
    await settleUntil(
      () => invoke.mock.calls.some((c) => (c[2] as { days: number }).days === 90),
      '90 日で照会する',
    );
    await waitForText(text, '訪問者数 (直近 90 日)');
  });

  it('覚えたプロパティ ID は次に開いたときに使う (一覧の先頭より優先)', async () => {
    localStorage.setItem(GA_PROPERTY_KEY, '222');
    await mount(true);
    await waitForText(text, '57 人');
    expect(invoke.mock.calls[0]![2]).toEqual({ propertyId: '222', days: 28 });
  });

  it('壊れた応答でも画面は落ちず、読めなかった表を名指しする', async () => {
    await mount(true);
    reportFetch.mockImplementation(async () => json({ unexpected: true }));
    await chooseSelect('期間', '7');
    await waitForText(text, '日ごとの訪問者数と流入元を読み取れませんでした');
    expect(text()).toContain('期間の訪問者数');
    expect(text()).toContain('不明 人');
  });
});
