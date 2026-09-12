/** @vitest-environment jsdom */
/**
 * **業務メモの天井を、画面が述べる** (2026-09-12 · パス 167)。
 *
 * ## 実測した欠陥
 *
 * `ServiceActionPanel` の メモ欄は `maxLength={2000}` を持っていた。走査した結果、
 * この部品には `文字` / `残り` / `上限` / `length` を含む表示が**1 つも無かった**
 * (在ったのは `cleanNote.length === 0` と `note.length === 0` という判定だけ)。
 * つまり:
 *
 * - 天井が **2,000 字だと画面のどこにも書いていない**
 * - 2,000 字を超える文章を貼ると、**ブラウザが超えた分を黙って落とす**
 *
 * 落ちた分は戻らず、利用者は全文を記録したと思う。そのメモは `record-entry` の
 * 業務記録として保存される側 (Phase 6 で永続化) なので、**記録の中身が黙って
 * 短くなる**。パス 112 が AI の入力で決めた「黙って切らない」と同じ主題である。
 *
 * ## 直したあと
 *
 * `maxLength` を使わず、同じ天井 (`MAX_RECORD_NOTE_CHARS`) を `onChange` で掛け、
 * **超えた字数を述べる**。天井そのものも常に画面に出す。
 *
 * ここでは実物の画面 (`RealEstatePage` が載せる `ServiceActionPanel`) を jsdom で
 * 描き、**欄に値を入れて**確かめる —— 部品を単体で呼ぶのではなく、載っている
 * 画面から見る (「載っているのは 2 画面」という実測もここで留める)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MAX_RECORD_NOTE_CHARS } from '../../../shared/recordEntryLimits';

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
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPage(serviceId: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** メモ欄 —— placeholder で引く (この部品の中で唯一の「メモ」の入力欄)。 */
function noteInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('input[placeholder^="メモ"]');
  if (!el) throw new Error('メモ欄が無い');
  return el;
}

/**
 * 実際の入力として値を流す (React の `onChange` を通す)。
 *
 * **`el.value = v` では通らない。** React は input の `value` を node ごとに
 * 上書きして最後の値を覚えているので、素で代入すると React の控えも一緒に
 * 更新され、`input` を投げても「変わっていない」と見なして `onChange` を飛ばす。
 * prototype の**素のセッター**で書けば控えは古いままになり、変化として届く。
 * (この harness を素の代入で書いて 3 件落とした —— リポジトリには既に
 *  `StatusBar.credentials.test.ts` ほか 5 件が同じ形を持っていた。)
 */
async function type(value: string): Promise<void> {
  const el = noteInput();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const overflowBox = (): HTMLElement | null => container.querySelector('[data-note-overflow]');

beforeEach(() => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('メモの天井 — 不動産投資の画面 (パス 167)', () => {
  it('★ 天井を画面が述べる (2026-09-12 まで数字は画面のどこにも無かった)', async () => {
    await mountPage('real-estate');
    const cap = container.querySelector('[data-note-cap]');
    expect(cap, '天井を述べる帯が無い').not.toBeNull();
    expect(cap!.textContent).toContain(String(MAX_RECORD_NOTE_CHARS));
    expect(cap!.textContent).toContain('字まで');
  });

  it('★ 天井を使い切っただけでは警告を出さない (正当な入力を責めない)', async () => {
    await mountPage('real-estate');
    await type('あ'.repeat(MAX_RECORD_NOTE_CHARS));
    expect(noteInput().value).toHaveLength(MAX_RECORD_NOTE_CHARS);
    expect(overflowBox(), '天井ちょうどで警告が出ている').toBeNull();
  });

  it('★ 天井を超えた入力は、超えた字数を述べる (黙って落とさない)', async () => {
    await mountPage('real-estate');
    await type('あ'.repeat(MAX_RECORD_NOTE_CHARS + 412));
    // 欄は天井で止まる (DOM に無制限の値を持たない)。
    expect(noteInput().value).toHaveLength(MAX_RECORD_NOTE_CHARS);
    const box = overflowBox();
    expect(box, '超えたのに何も言っていない').not.toBeNull();
    expect(box!.getAttribute('data-note-overflow')).toBe('412');
    expect(box!.textContent).toContain('412');
    expect(box!.textContent).toContain(String(MAX_RECORD_NOTE_CHARS));
    // 読み上げにも乗る (見落とさない)。
    expect(box!.getAttribute('role')).toBe('alert');
  });

  it('★ 短くし直したら警告は消える (残り続けて混乱させない)', async () => {
    await mountPage('real-estate');
    await type('あ'.repeat(MAX_RECORD_NOTE_CHARS + 1));
    expect(overflowBox()).not.toBeNull();
    await type('修繕費発生');
    expect(overflowBox(), '短くしたのに警告が残っている').toBeNull();
    expect(noteInput().value).toBe('修繕費発生');
  });

  it('★ `maxLength` に任せていない (任せるとブラウザが黙って落とす)', async () => {
    await mountPage('real-estate');
    // 属性が無いこと —— 在ると `onChange` は切られた後の値しか見えず、
    // 「何字落ちたか」を述べられない (これが 2026-09-12 までの形)。
    expect(noteInput().hasAttribute('maxlength'), 'maxLength が戻っている').toBe(false);
  });

  it('投資信託の画面も同じ天井を述べる (1 画面だけ直して満足しない)', async () => {
    await mountPage('mutual-funds');
    const cap = container.querySelector('[data-note-cap]');
    expect(cap).not.toBeNull();
    expect(cap!.textContent).toContain(String(MAX_RECORD_NOTE_CHARS));
    await type('あ'.repeat(MAX_RECORD_NOTE_CHARS + 7));
    expect(overflowBox()!.getAttribute('data-note-overflow')).toBe('7');
  });

  it('対照: 天井の文は既定の描画で出ている (探し方が空振りしていない)', async () => {
    await mountPage('real-estate');
    expect(text()).toContain('業務操作');
    expect(text()).toContain('メモを記録');
  });
});
