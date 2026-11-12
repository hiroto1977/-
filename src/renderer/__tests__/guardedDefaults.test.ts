/** @vitest-environment jsdom */
/**
 * **アプリが自分で入れた値に、アプリ自身の関門が印を付けてはいけない。** (パス 206)
 *
 * `GuardedNumber` の ⚠️ / ⛔ は**利用者の入力**についての報せである。既定値に付くと
 * 言っていることが逆になる —— 「あなたの入力を確認してください」と言いながら、
 * 確認すべき入力は**この画面が用意した値**なのだから、利用者には直す先が無い。
 * そして消せない警告は、消せる警告を読まなくさせる: パス 206 が ⛔ を
 * 「判定を出さない根拠」にした直後なので、印の信用は荷を負っている。
 *
 * 全画面を描いて実測した (2026-09-13): 関門つきの欄 **89**、うち**値が入っている
 * のに `ok` でない欄は 1 件** —— `real-estate` の `容積率 (%)` が既定 200% で
 * `⚠️ 200 % は想定の範囲を超えています。桁を間違えていないか確認してください。`
 * を出していた。`KIND.percent` の `sane: 100` を継いでいたためで、
 * 用途地域プリセット 3 つ (200 / 400 / 200%) と初期状態がすべて該当する。
 * つまり**この画面は開いた瞬間からずっと⚠️を出していた**。
 * 同じ節の散文が「容積率は 100〜500% から都市計画で指定」と述べ、欄の `max` は
 * 1300% なので、100% 超は疑う対象ではない。
 *
 * **空欄は対象外。** 「未入力です。0 円 として計算されています」は意図した報せで
 * (パス 77 の家系)、既定値ではない。ここで見るのは「値が入っている欄」だけ。
 *
 * 走査は `SERVICES` (サイドバーの唯一の真実) から回すので、画面が増えれば自動で
 * 対象に入る。件数の床は「走査が痩せたら落ちる」ための物。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';

/** 実測 2026-09-13: 全画面あわせて関門つきの欄は 89。減ったら走査が痩せた。 */
const GUARDED_FIELD_FLOOR = 89;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'), // Electron 扱い (ロック画面を出さない)
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ available: false, plaintextCount: 0 }),
    eraseAll: () => Promise.resolve({ ok: true, erased: [], failed: [] }),
  };
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  host.remove();
});

interface GuardedField {
  readonly service: string;
  readonly label: string;
  readonly guard: string;
  readonly value: string;
}

/** 1 画面を描いて、関門つきの欄をすべて読む (描画が投げたら空)。 */
async function guardedFieldsOf(service: string, page: unknown): Promise<readonly GuardedField[]> {
  root = createRoot(host);
  const r = root;
  await act(async () => {
    r.render(createElement(page as never));
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
  return Array.from(host.querySelectorAll<HTMLInputElement>('input[data-guard]')).map((el) => ({
    service,
    label: el.getAttribute('aria-label') ?? '(ラベル無し)',
    guard: el.getAttribute('data-guard') ?? '(属性無し)',
    value: el.value,
  }));
}

describe('既定値は、その画面自身の関門を通る (パス 206)', () => {
  // 1 件ずつ `it` にすると、どの画面のどの欄かが名前で分かる。
  // **1 回の実行で全画面ぶん挙がる** —— 最初の 1 件で止めない。
  const seen: GuardedField[] = [];

  for (const svc of SERVICES) {
    it(`既定値に印が付かない: ${svc.id} (${svc.label})`, async () => {
      const fields = await guardedFieldsOf(svc.id, svc.page);
      seen.push(...fields);
      const flagged = fields
        .filter((f) => f.value.trim() !== '' && f.guard !== 'ok')
        .map((f) => `${f.label} = ${f.value} → ${f.guard}`);
      expect(flagged, `${svc.id} の既定値に関門が印を付けている`).toEqual([]);
    });
  }

  it('★ 走査が実物に当たる (関門つきの欄の数が床を下回らない)', () => {
    // **標本つきの対照。** 上の検査は「無いこと」を見るので、走査が
    // 1 つも欄を拾えなくても全件通ってしまう。実際に拾えていることを確かめる。
    expect(seen.length).toBeGreaterThanOrEqual(GUARDED_FIELD_FLOOR);
    expect(seen.filter((f) => f.guard === 'ok').length).toBeGreaterThan(0);
    // 空欄の ⚠️ は意図した報せなので、走査はそれを**拾っているが落としている**
    // ことも確かめる (落とす規則そのものが死んでいないか)。
    expect(seen.filter((f) => f.value.trim() === '' && f.guard === 'warn').length).toBeGreaterThan(0);
  });
});
