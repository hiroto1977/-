/** @vitest-environment jsdom */
/**
 * **ロードアベレージを提供しない OS で「0.00 / 0% (緑)」を刷らない。**
 *
 * Node の `os.loadavg()` は **Windows では OS に問い合わせず常に `[0, 0, 0]`** を
 * 返す (`@types/node/os.d.ts` が「on Windows it always returns `[0, 0, 0]`」と明記)。
 * 本アプリは `release.yml` で Windows インストーラを出荷しているので、これは
 * 「起こりうる」話ではなく **Windows 利用者の全員に必ず起きる**。
 *
 * 2026-09-09 まで、その既定値 0 は画面でこう出ていた:
 *
 * | 面 | 出方 |
 * | --- | --- |
 * | 「ロード (1分)」タイル | `0.00` を **緑** —— `positive={load.perCorePct < 100}` は `0 < 100` で真 |
 * | 表「コアあたり」 | `0%` を **緑・太字** (`>= 100` 赤 / `>= 70` 橙 / それ以外 緑) |
 * | 表 直近 5 分 / 15 分 | `0.00` |
 * | 状況メモ | 「表示中の live 値は本アプリを実行している OS の値です」 |
 *
 * 最後の行がこの欠陥の芯である —— **アプリは自分が埋めた既定値を「あなたの OS の
 * 実測値」として保証していた。** 0 は主張であり、緑はその主張への同意である
 * (パス 58 で不動産のイールドギャップに対して直したのと同じ形)。
 *
 * ここは**実物の live fetch** で win32 の payload を返し、画面の文字と色を見る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { SNAPSHOT } from '../../data/snapshot';
import { buildLinuxSnapshot } from '../../../main/clients/linux';

/**
 * `SNAPSHOT` は `as const` なので `typeof SNAPSHOT.linux` の多くの欄はリテラル型
 * になる。live fetch で届くのは任意の JSON なので、受け口は `unknown` にする
 * (パス 60 と同じ理由 —— `vitest` は型検査をしないので `tsc` だけが気づく)。
 */
function payload(platform: string, loadavg: readonly [number, number, number]): unknown {
  const sys = buildLinuxSnapshot({
    hostname: 'host-1',
    platform,
    kernel: '10.0.26100',
    arch: 'x64',
    uptimeSec: 90_061,
    loadavg,
    cpus: [
      { model: 'Intel Core i7', speedMhz: 2600 },
      { model: 'Intel Core i7', speedMhz: 2600 },
      { model: 'Intel Core i7', speedMhz: 2600 },
      { model: 'Intel Core i7', speedMhz: 2600 },
    ],
    totalMemBytes: 8 * 1024 * 1024 * 1024,
    freeMemBytes: 4 * 1024 * 1024 * 1024,
  });
  return { ...sys, devEnv: SNAPSHOT.linux.devEnv };
}

const hub = () =>
  (globalThis as unknown as { serviceHub: { fetchSnapshot: unknown; listConfigured: unknown } }).serviceHub;

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

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountWith(p: unknown): Promise<void> {
  hub().listConfigured = () => Promise.resolve(['linux']);
  hub().fetchSnapshot = (id: string) =>
    Promise.resolve(id === 'linux' ? { ok: true, data: p } : { ok: false, code: 'x', message: 'x' });
  const def = SERVICES.find((s) => s.id === 'linux');
  if (!def) throw new Error('linux service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 「区間」表の行を `{ 区間: [ロード, コアあたり] }` で読む。 */
function loadRows(): Record<string, readonly [string, string]> {
  const out: Record<string, readonly [string, string]> = {};
  for (const tr of Array.from(container.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('td'));
    if (cells.length !== 3) continue;
    const key = (cells[0]?.textContent ?? '').trim();
    if (!key.startsWith('直近')) continue;
    out[key] = [(cells[1]?.textContent ?? '').trim(), (cells[2]?.textContent ?? '').trim()];
  }
  return out;
}

/** 「コアあたり」セルに付いた文字色 (緑 = 健全という判定)。 */
function perCoreColor(): string {
  for (const tr of Array.from(container.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('td'));
    if (cells.length !== 3) continue;
    if (!(cells[0]?.textContent ?? '').trim().startsWith('直近 1 分')) continue;
    return (cells[2] as HTMLElement).style.color;
  }
  return '';
}

/** `Stat` タイルの値と色を読む。 */
function statValue(label: string): { value: string; color: string } | null {
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children);
    if (kids.length !== 2) continue;
    if ((kids[0]?.textContent ?? '').trim() !== label) continue;
    return {
      value: (kids[1]?.textContent ?? '').trim(),
      color: (kids[1] as HTMLElement).style.color,
    };
  }
  return null;
}

const scopeBand = (): string =>
  Array.from(container.querySelectorAll('[data-loadavg-scope]'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
    .join(' | ');

beforeEach(() => {
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

describe('Linux モニター — ロードアベレージを提供しない OS', () => {
  it('★ 対照: POSIX ホストでは 3 区間が数で出て、緑の判定も付く', async () => {
    await mountWith(payload('linux', [2, 1.5, 1]));
    const rows = loadRows();
    expect(rows['直近 1 分']).toEqual(['2.00', '50%']);
    expect(rows['直近 5 分']?.[0]).toBe('1.50');
    expect(rows['直近 15 分']?.[0]).toBe('1.00');
    expect(perCoreColor()).toBe('rgb(34, 197, 94)'); // 緑 = 余裕あり
    expect(statValue('ロード (1分)')?.value).toBe('2.00');
    expect(scopeBand()).toBe('');
  });

  it('★ Windows で「0.00」「0%」を刷らない', async () => {
    // Node が win32 で必ず返す値
    await mountWith(payload('win32', [0, 0, 0]));
    const rows = loadRows();
    // 直す前は ['0.00', '0%'] だった
    expect(rows['直近 1 分']).toEqual(['—', '—']);
    expect(rows['直近 5 分']?.[0]).toBe('—');
    expect(rows['直近 15 分']?.[0]).toBe('—');
    expect(statValue('ロード (1分)')?.value).toBe('—');
  });

  it('★ 算定不能に「健全」の色を付けない', async () => {
    await mountWith(payload('win32', [0, 0, 0]));
    // 直す前は緑 (rgb(34, 197, 94))。色を付けない = 判定しない。
    expect(perCoreColor()).toBe('');
    expect(statValue('ロード (1分)')?.color).toBe('');
  });

  it('★ 表の直下で理由を述べる (別の節を探させない)', async () => {
    await mountWith(payload('win32', [0, 0, 0]));
    const band = scopeBand();
    expect(band).toContain('ロードアベレージを提供しない');
    expect(band).toContain('Node は常に 0 を返します');
    // Windows でも実測できる値は実測だと述べる (全部を疑わせない)
    expect(band).toContain('メモリ・CPU・稼働時間は実測値です');
  });

  it('★ メモリ・CPU・稼働時間は Windows でも数で出る (巻き込んでいない)', async () => {
    await mountWith(payload('win32', [0, 0, 0]));
    expect(statValue('メモリ使用率')?.value).toBe('50.0%');
    expect(statValue('CPU コア')?.value).toBe('4 論理コア');
    expect(text()).toContain('1日 1時間 1分');
  });

  it('★ 状況メモにも同じ 1 本の理由が出る (文面を写していない)', async () => {
    await mountWith(payload('win32', [0, 0, 0]));
    const t = text();
    expect(t).toContain('状況メモ');
    // 表の直下と状況メモが同じ文を読んでいる → 全文が 2 回現れる
    const note = 'このプラットフォームはロードアベレージを提供しないため、算定していません';
    expect(t.split(note).length - 1).toBe(2);
  });
});
