/** @vitest-environment jsdom */
/**
 * **売上集計の画面 —— 「スプレッドシートに書き出す」** (2026-11-22)。
 *
 * 実物の `SalesPage` を実物の保管層 (fake-indexeddb) で描き、橋 (`window.serviceHub`) だけを偽物にして押す:
 *
 * - 送る前に、受け手 (Google) と中身 (売上の記録) を言う断りが**ボタンより前**に在る
 * - 押すと確認の窓が出て、件数と表題を言う。やめれば何も送らない
 * - 送る物は読める行だけ (日付が読めない行は落とし、件数を言う)・日付の古い順・見出しつき
 * - 作れたら「スプレッドシートを開く」のリンクが出て、押すと外へ開く関門 (`openExternal`) を通る (window.open は使わない)
 * - Google ドライブの資格情報が無いと分かっているときは、押せず、「グーグルドライブ」の画面を名指しする
 * - 天井 (500 件) を超えるときは送らずに断り、CSV の書き出しを名指しする
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../../data/sales';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { MAX_SHEET_ROWS } from '../../../shared/writeFieldLimits';

const TODAY = new Date(2026, 10, 22, 12, 0, 0); // 2026-11-22 (端末の時刻)

interface Bridge {
  invoke: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
  listConfigured: ReturnType<typeof vi.fn>;
}

function installBridge(configured: readonly string[]): Bridge {
  const bridge = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: vi.fn(() => Promise.resolve([...configured])),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: { id: 's1', title: '売上の記録 (2026-11-22)', url: 'https://docs.google.com/spreadsheets/d/s1/edit' },
      }),
    ),
    openExternal: vi.fn(() => Promise.resolve()),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = bridge;
  return bridge;
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function seed(rows: readonly SalesEntry[]): Promise<void> {
  for (const r of rows) await getRecordStore().insert(SALES_COLLECTION, r);
}

async function mount(waitFor: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SalesPage));
  });
  await waitForText(text, waitFor);
}

const button = (): HTMLButtonElement => {
  const b = container.querySelector<HTMLButtonElement>('[data-sheet-export-button]');
  if (b === null) throw new Error('書き出しのボタンが無い');
  return b;
};

async function press(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
}

const ROWS: readonly SalesEntry[] = [
  { date: '2026-11-03', channel: 'rakuten', amount: 5000, orders: 1, note: '=HYPERLINK("https://evil.example")' },
  { date: '2026-11-01', channel: 'amazon', amount: 12000, orders: 3 },
  // 暦に無い日 —— 読めない行として落ちる (合計・月別の集計と同じ部分集合)。
  { date: '2026-02-31', channel: 'base', amount: 999, orders: 1 },
];

describe('スプレッドシートに書き出す', () => {
  it('★ 断りは受け手と中身を言い、ボタンより前に在る', async () => {
    installBridge(['drive']);
    await seed(ROWS);
    await mount('12,000');
    const block = container.querySelector('[data-sheet-export]');
    expect(block).not.toBeNull();
    const html = block!.innerHTML;
    const notice = html.indexOf('Google に送信します');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(html.indexOf('data-sheet-export-button'));
    expect(block!.textContent).toContain('売上の記録');
  });

  it('★ 押すと確認し、読める行だけを日付の古い順に送り、リンクは openExternal で開く', async () => {
    const bridge = installBridge(['drive']);
    await seed(ROWS);
    await mount('12,000');
    await settleUntil(() => !button().disabled, '書き出しのボタンが押せる');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const open = vi.spyOn(window, 'open');
    await press(button());
    await waitForElement(() => container.querySelector('[data-sheet-export-done]'), '書き出した知らせ');

    expect(confirm).toHaveBeenCalledTimes(1);
    const asked = String(confirm.mock.calls[0]![0]);
    expect(asked).toContain('売上の記録 2 件');
    expect(asked).toContain('Google に送信し');
    expect(asked).toContain('売上の記録 (2026-11-22)');
    expect(asked).toContain('読めない 1 件は書き出しません');

    expect(bridge.invoke).toHaveBeenCalledTimes(1);
    const [service, action, payload] = bridge.invoke.mock.calls[0]! as [string, string, Record<string, unknown>];
    expect(service).toBe('drive');
    expect(action).toBe('export-sheet');
    expect(payload).toStrictEqual({
      title: '売上の記録 (2026-11-22)',
      columns: ['日付', '販売先', '金額', '注文の数', 'メモ'],
      rows: [
        ['2026-11-01', 'Amazon', 12000, 3, null],
        ['2026-11-03', '楽天市場', 5000, 1, '=HYPERLINK("https://evil.example")'],
      ],
    });

    expect(text()).toContain('スプレッドシートを作りました (2 件)');
    const link = Array.from(container.querySelectorAll('[data-sheet-export-done] a')).find(
      (a) => a.textContent === 'スプレッドシートを開く',
    ) as HTMLAnchorElement | undefined;
    expect(link).toBeDefined();
    await press(link!);
    expect(bridge.openExternal).toHaveBeenCalledWith('https://docs.google.com/spreadsheets/d/s1/edit');
    expect(open).not.toHaveBeenCalled();
  });

  it('★ 確認でやめれば何も送らない', async () => {
    const bridge = installBridge(['drive']);
    await seed(ROWS);
    await mount('12,000');
    await settleUntil(() => !button().disabled, '書き出しのボタンが押せる');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await press(button());
    expect(bridge.invoke).not.toHaveBeenCalled();
    expect(container.querySelector('[data-sheet-export-done]')).toBeNull();
  });

  it('★ 送れなかったときは理由を 1 行で言い、リンクは出さない', async () => {
    const bridge = installBridge(['drive']);
    bridge.invoke.mockResolvedValueOnce({ ok: false, code: 'http_403', message: 'Sheets API 403\nforbidden' });
    await seed(ROWS);
    await mount('12,000');
    await settleUntil(() => !button().disabled, '書き出しのボタンが押せる');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await press(button());
    const err = await waitForElement(() => container.querySelector('[data-sheet-export-error]'), '断りの文');
    expect(err.textContent).toContain('Sheets API 403');
    expect(err.textContent).not.toContain('\n');
    expect(container.querySelector('[data-sheet-export-done]')).toBeNull();
  });

  it('★ Google ドライブに接続していなければ押せず、「グーグルドライブ」の画面を名指しする', async () => {
    const bridge = installBridge([]);
    await seed(ROWS);
    await mount('12,000');
    await waitForElement(() => container.querySelector('[data-sheet-export-needs-drive]'), '接続していない知らせ');
    expect(text()).toContain('「グーグルドライブ」の画面');
    expect(button().disabled).toBe(true);
    expect(bridge.invoke).not.toHaveBeenCalled();
  });

  it(`★ ${MAX_SHEET_ROWS} 件を超えるときは送らずに断り、CSV の書き出しを名指しする`, async () => {
    const bridge = installBridge(['drive']);
    const many: SalesEntry[] = Array.from({ length: MAX_SHEET_ROWS + 1 }, (_, i) => ({
      date: '2026-10-01',
      channel: 'amazon',
      amount: 100 + i,
      orders: 1,
    }));
    await getRecordStore().insertMany(SALES_COLLECTION, many);
    await mount('総売上');
    await settleUntil(() => !button().disabled, '書き出しのボタンが押せる');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await press(button());
    const err = await waitForElement(() => container.querySelector('[data-sheet-export-error]'), '断りの文');
    expect(err.textContent).toContain(`${MAX_SHEET_ROWS} 件まで`);
    expect(err.textContent).toContain('CSV エクスポート');
    expect(confirm).not.toHaveBeenCalled();
    expect(bridge.invoke).not.toHaveBeenCalled();
  });
});
