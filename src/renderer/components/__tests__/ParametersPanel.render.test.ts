/** @vitest-environment jsdom */
/**
 * 数値パラメータの設定画面 — 実物の record store (fake-indexeddb) を通して
 * 「入れて保存すると残り、既定に戻すと消え、通らない値は保存できない」を見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ParametersPanel, matchesParameterQuery } from '../ParametersPanel';
import { PARAMETER_OVERRIDES_COLLECTION, type ParameterOverrideRecord } from '../../data/parameterOverrides';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { PARAMETERS, PARAMETER_BY_ID, parameterFeatures } from '../../../shared/parameters';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

const DAYS = '年間の稼働日数';
const STD = '消費税率 (標準)';

const q = {
  rows: () => Array.from(container.querySelectorAll<HTMLElement>('[data-parameter]')),
  row: (id: string) => {
    const el = container.querySelector<HTMLElement>(`[data-parameter="${id}"]`);
    if (!el) throw new Error(`row ${id} not found`);
    return el;
  },
  input: (label: string) => {
    const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (!el) throw new Error(`input "${label}" not found`);
    return el;
  },
  button: (label: string) => {
    const el = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!el) throw new Error(`button "${label}" not found`);
    return el;
  },
  buttonByText: (text: string) => {
    const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === text);
    if (!b) throw new Error(`button "${text}" not found`);
    return b;
  },
  header: () => container.querySelector('[data-overridden-count]')?.textContent ?? '',
  alertIn: (id: string) => q.row(id).querySelector('[role="alert"]')?.textContent ?? '',
};

async function type(label: string, value: string): Promise<void> {
  await act(async () => {
    changeInput(q.input(label), value);
  });
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

async function stored(): Promise<readonly ParameterOverrideRecord[]> {
  const list = await getRecordStore().list<ParameterOverrideRecord>(PARAMETER_OVERRIDES_COLLECTION);
  return list.map((r) => r.data);
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ParametersPanel));
  });
  await settle();
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  await mount();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe('数値パラメータの設定画面', () => {
  it('台帳の全件を機能ごとに並べ、既定を画面の値で見せる', () => {
    expect(q.rows().map((r) => r.dataset.parameter)).toEqual(PARAMETERS.map((p) => p.id));
    const text = container.textContent ?? '';
    for (const f of parameterFeatures()) expect(text).toContain(f);
    expect(q.input(DAYS).value).toBe('365');
    expect(q.input(STD).value).toBe('10'); // 0.1 ではなく %
    expect(q.header()).toBe(`上書き 0 / ${PARAMETERS.length} 件`);
    // 既定値と出典が行に出る。
    expect(q.row('payroll.commutePublicTransportCap').textContent).toContain('既定 150000円');
    expect(q.row('payroll.commutePublicTransportCap').textContent).toContain('所得税法施行令');
    expect(q.row('hydroponics.daysPerYear').textContent).toContain('前提');
  });

  it('変えていなければ保存は押せず、上書きが無ければ既定に戻すも押せない', () => {
    expect(q.button(`${DAYS} を保存`).disabled).toBe(true);
    expect(q.button(`${DAYS} を既定に戻す`).disabled).toBe(true);
    expect(q.buttonByText('すべて既定に戻す').disabled).toBe(true);
  });

  it('値を入れて保存すると残り、上書き中の印と件数が出る', async () => {
    await type(DAYS, '300');
    expect(q.button(`${DAYS} を保存`).disabled).toBe(false);
    await click(q.button(`${DAYS} を保存`));
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 300 } }]);
    expect(q.row('hydroponics.daysPerYear').dataset.overridden).toBe('true');
    expect(q.row('hydroponics.daysPerYear').textContent).toContain('上書き中');
    expect(q.header()).toBe(`上書き 1 / ${PARAMETERS.length} 件`);
    expect(q.input(DAYS).value).toBe('300');
    // 保存した値と同じなので、もう一度は押せない。
    expect(q.button(`${DAYS} を保存`).disabled).toBe(true);
    expect(q.button(`${DAYS} を既定に戻す`).disabled).toBe(false);
  });

  it('% の欄は画面の値で入れて内部値で保存する (12 → 0.12)', async () => {
    await type(STD, '12');
    await click(q.button(`${STD} を保存`));
    expect(await stored()).toEqual([{ values: { 'tax.consumptionStandardRate': 0.12 } }]);
    expect(q.input(STD).value).toBe('12');
  });

  it('通らない値は指摘を出し、保存できない (範囲外・数でない・整数でない)', async () => {
    await type(DAYS, '0');
    expect(q.alertIn('hydroponics.daysPerYear')).toBe('1日 以上で入力してください');
    expect(q.input(DAYS).getAttribute('aria-invalid')).toBe('true');
    expect(q.button(`${DAYS} を保存`).disabled).toBe(true);

    await type(DAYS, 'abc');
    expect(q.alertIn('hydroponics.daysPerYear')).toBe('数値で入力してください');
    expect(q.button(`${DAYS} を保存`).disabled).toBe(true);

    await type(DAYS, '10.5');
    expect(q.alertIn('hydroponics.daysPerYear')).toBe('整数で入力してください');

    await type(DAYS, '367');
    expect(q.alertIn('hydroponics.daysPerYear')).toBe('366日 以下で入力してください');

    // 全角は読める (黙って 0 にしない)。
    await type(DAYS, '３００');
    expect(q.alertIn('hydroponics.daysPerYear')).toBe('');
    expect(q.input(DAYS).getAttribute('aria-invalid')).toBe('false');
    expect(q.button(`${DAYS} を保存`).disabled).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it('既定に戻すと保存から消え、入力欄も既定の表示へ戻る', async () => {
    await type(DAYS, '300');
    await click(q.button(`${DAYS} を保存`));
    await click(q.button(`${DAYS} を既定に戻す`));
    expect(await stored()).toEqual([{ values: {} }]);
    expect(q.row('hydroponics.daysPerYear').dataset.overridden).toBe('false');
    expect(q.input(DAYS).value).toBe('365');
    expect(q.header()).toBe(`上書き 0 / ${PARAMETERS.length} 件`);
  });

  it('既定と同じ値を保存しても「上書き」として残る (既定が改正で動いても置いた値は動かない)', async () => {
    await type(DAYS, '360');
    await click(q.button(`${DAYS} を保存`));
    await type(DAYS, '365');
    await click(q.button(`${DAYS} を保存`));
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 365 } }]);
    expect(q.row('hydroponics.daysPerYear').dataset.overridden).toBe('true');
  });

  it('すべて既定に戻すは確認してから消し、断れば何も変えない', async () => {
    await type(DAYS, '300');
    await click(q.button(`${DAYS} を保存`));
    await type(STD, '12');
    await click(q.button(`${STD} を保存`));
    expect(q.header()).toBe(`上書き 2 / ${PARAMETERS.length} 件`);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click(q.buttonByText('すべて既定に戻す'));
    expect(confirm).toHaveBeenCalledWith('上書きした 2 件をすべて既定に戻します。よろしいですか？');
    expect(q.header()).toBe(`上書き 2 / ${PARAMETERS.length} 件`);
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 300, 'tax.consumptionStandardRate': 0.12 } }]);

    confirm.mockReturnValue(true);
    await click(q.buttonByText('すべて既定に戻す'));
    expect(q.header()).toBe(`上書き 0 / ${PARAMETERS.length} 件`);
    expect(await stored()).toEqual([{ values: {} }]);
    expect(q.input(DAYS).value).toBe('365');
    expect(q.input(STD).value).toBe('10');
    expect(q.buttonByText('すべて既定に戻す').disabled).toBe(true);
  });

  it('検索で絞り込める (名前・機能・出典・id)。当たらなければその旨', async () => {
    await type('パラメータを検索', 'DSCR');
    expect(q.rows().map((r) => r.dataset.parameter)).toEqual([
      'realEstate.dscrDangerThreshold',
      'realEstate.dscrCautionThreshold',
    ]);
    expect(container.textContent).toContain('不動産');
    expect(container.textContent).not.toContain('水耕栽培');

    await type('パラメータを検索', '所得税法');
    expect(q.rows().map((r) => r.dataset.parameter)).toEqual(['payroll.commutePublicTransportCap']);

    await type('パラメータを検索', 'zzz');
    expect(q.rows()).toEqual([]);
    expect(container.textContent).toContain('該当するパラメータはありません');

    await type('パラメータを検索', '');
    expect(q.rows().length).toBe(PARAMETERS.length);
  });

  it('保存の失敗は例外のまま上がらず、ボタンが戻る (busy が解ける)', async () => {
    // 保存中は両方のボタンが無効になり、終われば戻る。
    await type(DAYS, '300');
    const save = q.button(`${DAYS} を保存`);
    await act(async () => {
      save.click();
    });
    await settle();
    expect(q.button(`${DAYS} を既定に戻す`).disabled).toBe(false);
  });
});

describe('matchesParameterQuery', () => {
  const def = PARAMETER_BY_ID.get('payroll.commutePublicTransportCap')!;
  it('空の検索語は全件', () => {
    expect(matchesParameterQuery(def, '')).toBe(true);
    expect(matchesParameterQuery(def, '   ')).toBe(true);
  });
  it('id・名前・機能・出典・注記のどれかに、大文字小文字を無視して当たる', () => {
    expect(matchesParameterQuery(def, 'PAYROLL')).toBe(true); // id
    expect(matchesParameterQuery(def, '通勤手当')).toBe(true); // label
    expect(matchesParameterQuery(def, '給与')).toBe(true); // feature
    expect(matchesParameterQuery(def, '施行令')).toBe(true); // source
    expect(matchesParameterQuery(PARAMETER_BY_ID.get('hydroponics.daysPerYear')!, '休業日')).toBe(true); // note
    expect(matchesParameterQuery(def, 'DSCR')).toBe(false);
  });
  it('出典も注記も無い定義でも落ちない', () => {
    expect(matchesParameterQuery({ ...def, source: undefined, note: undefined }, '通勤')).toBe(true);
    expect(matchesParameterQuery({ ...def, source: undefined, note: undefined }, '施行令')).toBe(false);
  });
});
