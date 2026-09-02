/** @vitest-environment jsdom */
/**
 * チームページの給与計算パネル (通勤手当の非課税限度・賞与の源泉徴収) — 入力欄が
 * 読めない値を黙って 0 にしないことを、実際に描画して確かめる。
 *
 * 以前は `Number(x) || 0` で、全角の「５００，０００」や「50万」を打つと賞与 0 のまま
 * 「源泉徴収税額 ¥0」と自信ありげに出た。税額の欄で黙って 0 になるのは重い。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamPage } from '../TeamPage';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { bonusWithholdingTax, publicTransportCommute } from '../../../shared/payroll';
import { jpy } from '../../../shared/formatters';

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

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

const q = {
  input: (label: string) => {
    const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (!el) throw new Error(`input "${label}" not found`);
    return el;
  },
  guardText: (label: string) => q.input(label).parentElement?.textContent ?? '',
  stat: (label: string) => {
    const tile = Array.from(container.querySelectorAll('div')).find(
      (d) => d.firstElementChild?.textContent === label && d.children.length === 2,
    );
    if (!tile) throw new Error(`stat "${label}" not found`);
    return tile.children[1]!.textContent ?? '';
  },
};

async function type(label: string, value: string): Promise<void> {
  await act(async () => { changeInput(q.input(label), value); });
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
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TeamPage));
  });
  await settle();
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  document.body.removeChild(container);
});

describe('チームページ — 給与計算の入力欄は黙って 0 にしない', () => {
  it('初期値の税額が、共有の計算と同じ数字で出る', () => {
    const bw = bonusWithholdingTax({ bonus: 500_000, socialInsurance: 75_000, prevMonthSalaryAfterSI: 300_000 });
    expect(q.stat('源泉徴収税額')).toBe(jpy(bw.tax));
    expect(q.stat('課税対象 (賞与−社保)')).toBe(jpy(bw.taxableBonus));
    expect(q.stat('公共交通: 非課税')).toBe(jpy(publicTransportCommute(160_000).nonTaxable));
  });

  it('読めない値は fatal の文言と aria-invalid で知らせ、税額は 0 になる', async () => {
    await type('賞与額 (円)', '百');
    expect(q.input('賞与額 (円)').getAttribute('aria-invalid')).toBe('true');
    expect(q.guardText('賞与額 (円)')).toContain('「百」を数値として読み取れません。0 円 として計算されています。');
    expect(q.stat('源泉徴収税額')).toBe(jpy(0));
  });

  it('単位語つき (50万) は単位を外すよう促す', async () => {
    await type('賞与額 (円)', '50万');
    expect(q.guardText('賞与額 (円)')).toContain('単位付きのため読み取れません');
  });

  it('全角の数字・桁区切りは読める (以前は Number() が NaN にして 0 だった)', async () => {
    await type('賞与額 (円)', '６００，０００');
    expect(q.input('賞与額 (円)').getAttribute('aria-invalid')).toBeNull();
    const bw = bonusWithholdingTax({ bonus: 600_000, socialInsurance: 75_000, prevMonthSalaryAfterSI: 300_000 });
    expect(q.stat('源泉徴収税額')).toBe(jpy(bw.tax));
    expect(q.stat('課税対象 (賞与−社保)')).toBe(jpy(bw.taxableBonus));
  });

  it('マイカー片道は km の単位で言い、0 km (マイカー通勤なし) は通す', async () => {
    await type('マイカー片道 (km)', 'abc');
    expect(q.guardText('マイカー片道 (km)')).toContain('0 km として計算されています。');
    await type('マイカー片道 (km)', '0');
    expect(q.input('マイカー片道 (km)').getAttribute('data-guard')).toBe('ok');
    expect(q.stat('マイカー: 非課税限度/月')).toBe(jpy(0));
  });

  it('通勤手当が 100 万円を超えると桁の確認を促す (warn・計算は続く)', async () => {
    await type('公共交通機関の月額 (円)', '1600000');
    expect(q.input('公共交通機関の月額 (円)').getAttribute('data-guard')).toBe('warn');
    expect(q.guardText('公共交通機関の月額 (円)')).toContain('桁を間違えていないか確認してください');
    expect(q.stat('公共交通: 課税(超過)')).toBe(jpy(publicTransportCommute(1_600_000).taxable));
  });
});
