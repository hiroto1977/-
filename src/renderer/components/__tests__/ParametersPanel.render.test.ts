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
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
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

/** 押すだけ。**待つのは呼び手が、自分が見たい物で待つ**。 */
async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
}

/**
 * 上書きの件数が `n` になるまで待つ (見出しの `[data-overridden-count]`)。
 *
 * 見出しは**保存された上書き**から出るので、これは「書き込みが解決した」印である
 * (打っただけでは動かない —— この検査自身が下でそう主張している)。
 */
async function waitForOverrides(n: number): Promise<void> {
  await settleUntil(
    () => q.header() === `上書き ${n} / ${PARAMETERS.length} 件`,
    `上書きが ${n} 件になる (いま ${JSON.stringify(q.header())})`,
  );
}

/**
 * 保存を押して、**保存が済んだ印**が出るまで待つ。
 *
 * 印は「同じ値になったので保存ボタンが押せなくなる」 —— 件数が変わらない保存
 * (既定と同じ値を置き直す等) でも効くので、見出しの件数より広く使える。
 */
async function save(label: string): Promise<void> {
  await click(q.button(`${label} を保存`));
  await settleUntil(
    () => q.button(`${label} を保存`).disabled,
    `「${label} を保存」が押せなくなる (保存が済んだ印)`,
  );
}

async function stored(): Promise<readonly ParameterOverrideRecord[]> {
  const list = await getRecordStore().list<ParameterOverrideRecord>(PARAMETER_OVERRIDES_COLLECTION);
  return list.map((r) => r.data);
}

/**
 * 台帳を読み終えるまで**条件で**待って描く (2026-09-21 · パス 380)。
 *
 * ここは 2026-09-21 まで固定 8 周の `settle()` だった —— 周回数を 0 にすると
 * 見出しが「読み込み中…」のままで 11 件落ちる
 * (`npm run audit:tick-sensitivity` の実測)。後ろに在るのは IndexedDB の読みである。
 */
async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ParametersPanel));
  });
  await settleUntil(() => q.header().startsWith('上書き'), '台帳を読み終えて件数が出る');
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
    await save(DAYS);
    await waitForOverrides(1);
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
    await save(STD);
    await waitForOverrides(1);
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

  it('★ 数字の間に区切りが入った値は保存できない (2026-09-06 まで別の数として通っていた)', async () => {
    // 台帳の値は画面全体の計算に効く。'3,00' は旧実装では 300 と読めていたので、
    // 「入れたつもりの数」と「保存された数」が黙って食い違う経路だった。
    await type(DAYS, '3,00');
    expect(q.alertIn('hydroponics.daysPerYear')).toBe('数値で入力してください');
    expect(q.input(DAYS).getAttribute('aria-invalid')).toBe('true');
    expect(q.button(`${DAYS} を保存`).disabled).toBe(true);

    // 対照: 3 桁区切りが正しい値は読める (桁区切り自体を拒んだのではない)
    await type(DAYS, '300');
    expect(q.alertIn('hydroponics.daysPerYear')).toBe('');
    expect(q.input(DAYS).getAttribute('aria-invalid')).toBe('false');
    expect(q.button(`${DAYS} を保存`).disabled).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it('既定に戻すと保存から消え、入力欄も既定の表示へ戻る', async () => {
    await type(DAYS, '300');
    await save(DAYS);
    await waitForOverrides(1);
    await click(q.button(`${DAYS} を既定に戻す`));
    await waitForOverrides(0);
    expect(await stored()).toEqual([{ values: {} }]);
    expect(q.row('hydroponics.daysPerYear').dataset.overridden).toBe('false');
    expect(q.input(DAYS).value).toBe('365');
    expect(q.header()).toBe(`上書き 0 / ${PARAMETERS.length} 件`);
  });

  it('既定と同じ値を保存しても「上書き」として残る (既定が改正で動いても置いた値は動かない)', async () => {
    await type(DAYS, '360');
    await save(DAYS);
    await waitForOverrides(1);
    await type(DAYS, '365');
    // **件数は 1 のままなので、見出しでは待てない** —— 保存が済んだ印で待つ。
    await save(DAYS);
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 365 } }]);
    expect(q.row('hydroponics.daysPerYear').dataset.overridden).toBe('true');
  });

  it('すべて既定に戻すは確認してから消し、断れば何も変えない', async () => {
    await type(DAYS, '300');
    await save(DAYS);
    await type(STD, '12');
    await save(STD);
    await waitForOverrides(2);
    expect(q.header()).toBe(`上書き 2 / ${PARAMETERS.length} 件`);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click(q.buttonByText('すべて既定に戻す'));
    expect(confirm).toHaveBeenCalledWith('上書きした 2 件をすべて既定に戻します。よろしいですか？');
    expect(q.header()).toBe(`上書き 2 / ${PARAMETERS.length} 件`);
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 300, 'tax.consumptionStandardRate': 0.12 } }]);

    confirm.mockReturnValue(true);
    await click(q.buttonByText('すべて既定に戻す'));
    await waitForOverrides(0);
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
    await waitForText(() => container.textContent ?? '', '不動産');
    expect(container.textContent).not.toContain('水耕栽培');

    await type('パラメータを検索', '所得税法施行令');
    expect(q.rows().map((r) => r.dataset.parameter)).toEqual(['payroll.commutePublicTransportCap']);

    await type('パラメータを検索', 'zzz');
    expect(q.rows()).toEqual([]);
    await waitForText(() => container.textContent ?? '', '該当するパラメータはありません');

    await type('パラメータを検索', '');
    expect(q.rows().length).toBe(PARAMETERS.length);
  });

  it('保存の失敗は例外のまま上がらず、ボタンが戻る (busy が解ける)', async () => {
    // 保存中は両方のボタンが無効になり、終われば戻る。
    await type(DAYS, '300');
    const button = q.button(`${DAYS} を保存`);
    await act(async () => {
      button.click();
    });
    // 保存が済んだ印を先に待つ —— 「戻すボタンが押せる」は主張の側。
    await settleUntil(
      () => q.button(`${DAYS} を保存`).disabled,
      `「${DAYS} を保存」が押せなくなる (保存が済んだ印)`,
    );
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

/**
 * 欄と欄の順序 (パス 221)。
 *
 * `parameterIssue` は 1 欄ずつしか見ないので、2026-09-13 まで「良好の下限 40 /
 * 注意の下限 60」はそのまま保存でき、45 点の軸が「良好」として刷られていた。
 */
describe('隣の欄と矛盾する値は保存させない (パス 221)', () => {
  const GOOD = '軸の評価「良好」の下限';
  const WARN = '軸の評価「注意」の下限';
  const T1 = '法人事業税の所得段階の境目 (下)';
  const T2 = '法人事業税の所得段階の境目 (上)';

  it('「良好」の下限を「注意」の下限より下げると保存が押せず、理由が出る', async () => {
    await type(GOOD, '40'); // 既定の「注意」の下限は 45
    expect(q.button(`${GOOD} を保存`).disabled).toBe(true);
    const alert = q.alertIn('financeHealth.levelGoodMin');
    expect(alert).toContain(WARN);
    expect(alert).toContain('注意の帯が空になり');
    expect(await stored()).toEqual([]);
  });

  it('逆側の欄でも鳴る (「注意」の下限を「良好」の下限より上げる)', async () => {
    await type(WARN, '80'); // 既定の「良好」の下限は 70
    expect(q.button(`${WARN} を保存`).disabled).toBe(true);
    expect(q.alertIn('financeHealth.levelWarnMin')).toContain('注意の帯が空になり');
  });

  it('順序を保つ値なら保存できる (対照 — 断りが全部を止めていないこと)', async () => {
    await type(GOOD, '60'); // 「注意」の下限 45 以上なので通る
    expect(q.button(`${GOOD} を保存`).disabled).toBe(false);
    await save(GOOD);
    await waitForOverrides(1);
    expect(await stored()).toEqual([{ values: { 'financeHealth.levelGoodMin': 60 } }]);
  });

  it('法人事業税の段の境目も同じ関門を通る (負の課税標準を作らせない)', async () => {
    await type(T2, '4000000');
    expect(q.button(`${T2} を保存`).disabled).toBe(false); // 既定の下は 400 万 → 等しいので通る
    await type(T2, '3000000');
    expect(q.button(`${T2} を保存`).disabled).toBe(true);
    expect(q.alertIn('corporate.businessTaxTier2Limit')).toContain('マイナス');
  });

  it('範囲の断りが先に出る (順序の断りで上書きしない)', async () => {
    await type(T1, '-1');
    expect(q.alertIn('corporate.businessTaxTier1Limit')).toContain('以上で入力してください');
  });

  it('順序を持たない欄は今までどおり保存できる (対照)', async () => {
    await type(DAYS, '300');
    expect(q.button(`${DAYS} を保存`).disabled).toBe(false);
  });
});

describe('すでに保存されている矛盾を画面上部で言う (パス 221)', () => {
  /**
   * 関門を通らずに上書きを置く (古い版で保存した記録・復元したバックアップと
   * 同じ形)。画面の `set` を通すと `parameterOrderIssueFor` に止められるので、
   * ここは record store へ直に書く。
   */
  async function seed(values: Record<string, number>): Promise<void> {
    await act(async () => {
      root!.unmount();
    });
    root = null;
    await getRecordStore().insert<ParameterOverrideRecord>(PARAMETER_OVERRIDES_COLLECTION, { values });
    await mount();
  }

  it('矛盾が無ければ断りを出さない (対照)', () => {
    expect(container.querySelector('[data-parameter-order-issues]')).toBeNull();
  });

  it('逆順の上書きが保存されていたら、件数と理由を刷る', async () => {
    await seed({ 'financeHealth.levelWarnMin': 60, 'financeHealth.levelGoodMin': 40 });
    const el = container.querySelector<HTMLElement>('[data-parameter-order-issues]');
    expect(el).not.toBeNull();
    expect(el!.dataset.parameterOrderIssues).toBe('1');
    expect(el!.getAttribute('role')).toBe('alert');
    expect(el!.textContent).toContain('保存されている値が矛盾しています');
    expect(el!.textContent).toContain('(60点)');
    expect(el!.textContent).toContain('(40点)');
  });

  it('検索で絞っても消えない (直す欄が画面外に在るときこそ要る)', async () => {
    await seed({ 'financeHealth.levelWarnMin': 60, 'financeHealth.levelGoodMin': 40 });
    await type('パラメータを検索', '通勤手当');
    expect(q.rows().length).toBe(1);
    expect(container.querySelector('[data-parameter-order-issues]')).not.toBeNull();
  });
});

/**
 * 0 点の水準と 100 点の水準が同じ組 (パス 222)。
 *
 * 等しいと `financialRatios.axisBand` が既定の帯へ黙って倒すので、**上書きが
 * 1 度も効かない**。2026-09-13 まで画面のどこにもその事実が出ていなかった。
 */
describe('0 点と 100 点の水準が同じ上書きを保存させない (パス 222)', () => {
  const BAD = '自己資本比率: 0 点の水準';
  const GOOD = '自己資本比率: 100 点の水準';

  it('0 点の水準を 100 点の水準と同じにすると保存が押せず、効かない理由が出る', async () => {
    await type(BAD, '50'); // 既定の 100 点の水準は 50
    expect(q.button(`${BAD} を保存`).disabled).toBe(true);
    const alert = q.alertIn('financeHealth.equityRatioBad');
    expect(alert).toContain(GOOD);
    expect(alert).toContain('既定の水準で採点されます');
    expect(alert).toContain('効きません');
    expect(await stored()).toEqual([]);
  });

  it('逆側の欄でも鳴る', async () => {
    await type(GOOD, '0'); // 既定の 0 点の水準は 0
    expect(q.button(`${GOOD} を保存`).disabled).toBe(true);
    expect(q.alertIn('financeHealth.equityRatioGood')).toContain('効きません');
  });

  it('向きを逆にするのは通す (軸ごとに高い方が良い / 低い方が良いが変わる)', async () => {
    await type(BAD, '99');
    expect(q.button(`${BAD} を保存`).disabled).toBe(false);
    await save(BAD);
    await waitForOverrides(1);
    expect(await stored()).toEqual([{ values: { 'financeHealth.equityRatioBad': 99 } }]);
  });

  it('等しくない値は今までどおり保存できる (対照)', async () => {
    await type(BAD, '10');
    expect(q.button(`${BAD} を保存`).disabled).toBe(false);
  });
});
