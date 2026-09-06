/** @vitest-environment jsdom */
/**
 * 計算書類 4 点を 1 点ずつ記載・出力する (2026-09-05、依頼「計算書類4点を個別に記載出来る仕様にして」)。
 *
 * 確かめること: 書面のタブで入力欄と書面が絞られる / 値の入れ物は 1 つで、損益計算書の
 * タブで入れた売上高が「まとめて」の書面にも出る / 遷移の指示 `kessan-bs` で貸借対照表が
 * 開く / 選んだ書面は localStorage に残り、開き直しても続きから。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests, navigateTo } from '../../navigate';

const LS_KEY = 'servicehub.docstudio.v1';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'docstudio');
  if (!def) throw new Error('docstudio service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function unmount(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

const q = {
  tab: (sheet: string) => container.querySelector<HTMLButtonElement>(`button[data-kessan-sheet="${sheet}"]`),
  tabs: () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-kessan-sheet]')).map((b) => b.dataset['kessanSheet']),
  sheets: () => container.querySelector<HTMLElement>('[data-kessan-sheets]'),
  statement: (title: string) => container.querySelector(`table[data-statement="${title}"]`),
  input: (label: string) =>
    Array.from(container.querySelectorAll('input')).find(
      (i) => i.getAttribute('aria-label') === label || (i.closest('label')?.textContent ?? '').includes(label),
    ) ?? null,
  inherited: () => container.querySelector('[data-kessan-inherited]'),
  legalCaveat: () => container.querySelector('[data-legal-panel]')?.textContent ?? '',
  store: (): { kessan?: Record<string, string>; kessanSheet?: string } =>
    JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as { kessan?: Record<string, string>; kessanSheet?: string },
  paperText: () => container.querySelector('.ds-paper')?.textContent ?? '',
};

async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await unmount();
  document.body.removeChild(container);
});

describe('書類スタジオ — 計算書類を 1 点ずつ', () => {
  it('既定は「4点まとめて」: 5 つのタブがあり、4 つの書面と決算公告の要旨が全部出る', async () => {
    navigateTo('docstudio', { doc: 'kessan' });
    await mount();
    expect(q.tabs()).toEqual(['all', 'pl', 'bs', 'equity', 'notes']);
    expect(q.tab('all')?.className).toBe('primary');
    expect(q.sheets()?.dataset['kessanSheets']).toBe('all');
    for (const t of ['損益計算書', '資産の部', '負債・純資産の部', '貸借対照表の要旨']) expect(q.statement(t), t).not.toBeNull();
    expect(q.paperText()).toContain('株主資本等変動計算書');
    expect(q.paperText()).toContain('個別注記表');
    expect(q.inherited()).toBeNull();
    // 入力欄は全欄 (損益の科目も貸借対照表の科目も注記も)
    expect(q.input('売上高')).not.toBeNull();
    expect(q.input('現金及び預金')).not.toBeNull();
    expect(q.input('注記: その他')).not.toBeNull();
  });

  it('遷移の指示 kessan-bs で貸借対照表が開く: 入力欄も書面も貸借対照表のものだけ、引き継ぎの説明つき', async () => {
    navigateTo('docstudio', { doc: 'kessan-bs' });
    await mount();
    expect(q.tab('bs')?.className).toBe('primary');
    expect(q.tab('all')?.className).toBe('');
    expect(q.sheets()?.dataset['kessanSheets']).toBe('bs');
    expect(q.statement('資産の部')).not.toBeNull();
    expect(q.statement('貸借対照表の要旨')).not.toBeNull();
    expect(q.statement('損益計算書')).toBeNull();
    expect(q.paperText()).not.toContain('株主資本等変動計算書');
    expect(q.paperText()).not.toContain('個別注記表');
    expect(q.input('現金及び預金')).not.toBeNull();
    expect(q.input('繰越利益剰余金（期首残高）')).not.toBeNull();
    expect(q.input('売上高')).toBeNull();
    expect(q.input('注記: その他')).toBeNull();
    expect(q.inherited()?.textContent).toContain('当期純利益は損益計算書の入力から引き継ぎ');
    expect(q.legalCaveat()).toContain('貸借対照表は計算書類 4 点の 1 つ');
    expect(q.store().kessanSheet).toBe('bs');
  });

  it('タブで切り替える: 損益計算書は損益の科目だけ、個別注記表は注記の文言だけ', async () => {
    navigateTo('docstudio', { doc: 'kessan' });
    await mount();
    await click(q.tab('pl')!);
    expect(q.sheets()?.dataset['kessanSheets']).toBe('pl');
    expect(q.statement('損益計算書')).not.toBeNull();
    expect(q.statement('資産の部')).toBeNull();
    expect(q.input('売上高')).not.toBeNull();
    expect(q.input('現金及び預金')).toBeNull();
    expect(q.inherited()).toBeNull();

    await click(q.tab('notes')!);
    expect(q.sheets()?.dataset['kessanSheets']).toBe('notes');
    expect(q.paperText()).toContain('個別注記表');
    expect(q.statement('損益計算書')).toBeNull();
    expect(q.input('注記: その他')).not.toBeNull();
    expect(q.input('発行済株式の総数（株）')).not.toBeNull();
    expect(q.input('売上高')).toBeNull();
    expect(q.inherited()?.textContent).toContain('他の 3 点');
  });

  it('★ 値の入れ物は 1 つ: 損益計算書のタブで入れた売上高が「まとめて」の書面と localStorage の kessan に出る', async () => {
    navigateTo('docstudio', { doc: 'kessan-pl' });
    await mount();
    await type(q.input('売上高') as HTMLInputElement, '1234567');
    expect(q.store().kessan?.['sales']).toBe('1234567');
    expect(q.statement('損益計算書')?.textContent).toContain('1,234,567');
    await click(q.tab('all')!);
    expect(q.statement('損益計算書')?.textContent).toContain('1,234,567');
    // 貸借対照表側にも同じ値から当期純利益が流れる (別の入れ物ではない)
    expect(q.statement('負債・純資産の部')?.textContent).toContain('1,234,567');
  });

  it('★ 対照: 端末に残った値が知らない書面 id でも壊れず「まとめて」で開く (保存値は型が守らない)', async () => {
    // 遷移の指示なしで書式一覧から開く (指示 `kessan` は書面を「まとめて」に上書きするので、保存値の経路を見るならこちら)
    const openFromList = async () => {
      _resetNavigationIntentForTests();
      await mount();
      await click(container.querySelector<HTMLButtonElement>('button[data-doc-id="kessan"]') ?? (Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').startsWith('📊 計算書類')) as HTMLButtonElement));
    };
    localStorage.setItem(LS_KEY, JSON.stringify({ kessanSheet: 'foo', kessan: { company: '壊れた保存値株式会社' } }));
    await openFromList();
    expect(q.tab('all')?.className).toBe('primary');
    expect(q.sheets()?.dataset['kessanSheets']).toBe('all');
    expect(q.paperText()).toContain('壊れた保存値株式会社');
    await unmount();
    // 標本: 同じ経路で有効な保存値 'bs' なら貸借対照表が開く (上の検査が「開く」を本当に見ている対照)
    localStorage.setItem(LS_KEY, JSON.stringify({ kessanSheet: 'bs' }));
    await openFromList();
    expect(q.tab('bs')?.className).toBe('primary');
    expect(q.sheets()?.dataset['kessanSheets']).toBe('bs');
  });

  it('対照: 端末に残った「最近使った書式」が配列でなくても壊れず開く (同じ型の穴の 2 つ目)', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ recent: 'not-an-array', kessanSheet: 'pl' }));
    _resetNavigationIntentForTests();
    await mount();
    expect(container.querySelector('button[data-doc-id="kessan"]') ?? Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').startsWith('📊 計算書類'))).toBeTruthy();
    expect(container.textContent).not.toContain('最近使った書類');
    await unmount();
    // 標本: 配列なら (数値や null を飛ばして) 最近使った書類に並ぶ —— 上の not.toContain が本当にその見出しを見ている対照
    const firstTemplate = (await import('../../data/docStudioData')).STUDIO_TEMPLATES[0]!;
    localStorage.setItem(LS_KEY, JSON.stringify({ recent: [firstTemplate.id, 42, null] }));
    _resetNavigationIntentForTests();
    await mount();
    expect(container.textContent).toContain('最近使った書類');
    const recentBlock = Array.from(container.querySelectorAll('div')).find((d) => d.textContent === '最近使った書類')?.parentElement;
    expect(recentBlock?.querySelectorAll('button').length).toBe(1);
    expect(recentBlock?.textContent).toContain(firstTemplate.label);
  });

  it('選んだ書面は端末に残り、開き直しても同じ書面から続く', async () => {
    navigateTo('docstudio', { doc: 'kessan' });
    await mount();
    await click(q.tab('equity')!);
    expect(q.store().kessanSheet).toBe('equity');
    await unmount();
    navigateTo('docstudio', { doc: 'kessan' });
    await mount();
    // 遷移の指示 `kessan` は「まとめて」を指すので、指示があればそちらが勝つ
    expect(q.tab('all')?.className).toBe('primary');
    await unmount();
    localStorage.setItem(LS_KEY, JSON.stringify({ kessanSheet: 'equity' }));
    _resetNavigationIntentForTests();
    await mount();
    await click(container.querySelector<HTMLButtonElement>('button[data-doc-id="kessan"]') ?? (Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').startsWith('📊 計算書類')) as HTMLButtonElement));
    expect(q.tab('equity')?.className).toBe('primary');
    expect(q.sheets()?.dataset['kessanSheets']).toBe('equity');
  });
});

/**
 * **畳んだまま印刷させない。** 計算書類の検算パネルは画面の下にあり、
 * 「印刷 / PDF 保存」の隣の件数だけが上にある。2026-09-06 まで、その件数は
 * `collection === 'studio'` の指摘しか数えていなかったので、**貸借が一致して
 * いない計算書類でもボタンの隣は無言**だった (検算パネル自身は数えていた)。
 * 貸借の合わない書面は「貸借対照表として成立しない」ので、そのまま印刷して
 * 提出されるのが一番痛い。
 */
describe('印刷の隣は計算書類の検算も数える', () => {
  const seed = (kessan: Record<string, string>): void => {
    localStorage.setItem(LS_KEY, JSON.stringify({ kessan, kessanSheet: 'all' }));
  };

  it('★ 貸借が一致していないと、印刷ボタンの隣に件数が出る', async () => {
    seed({ cash: '1000000' }); // 資産だけ = 負債・純資産と一致しない
    navigateTo('docstudio', { doc: 'kessan' });
    await mount();

    // 検算パネルは fatal を数えている (下にある)
    const panel = container.querySelector('[data-kessan-check]');
    expect(Number(panel?.getAttribute('data-fatal') ?? '0')).toBeGreaterThanOrEqual(1);

    // 印刷ボタンの隣にも出る (上にある)
    const badge = container.querySelector('[data-fatal-badge]');
    expect(badge?.textContent).toContain('検算の合わない指摘');
  });

  it('対照: 貸借が一致していれば件数は出ない', async () => {
    seed({ cash: '1000000', capitalStock: '1000000' });
    navigateTo('docstudio', { doc: 'kessan' });
    await mount();

    expect(container.querySelector('[data-kessan-check]')?.getAttribute('data-fatal')).toBe('0');
    expect(container.querySelector('[data-fatal-badge]')).toBeNull();
  });

  it('対照: 書式 (studio) 側の文面は変わっていない', async () => {
    // 極度額を空にした身元保証書は fatal (民法465条の2)。文面は書式側のまま。
    localStorage.setItem(LS_KEY, JSON.stringify({ docId: 'mimoto-hosho', values: {} }));
    await mount();
    const badge = container.querySelector('[data-fatal-badge]');
    if (badge !== null) expect(badge.textContent).toContain('このままでは無効になる指摘');
  });
});
