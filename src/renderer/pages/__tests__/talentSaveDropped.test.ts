/** @vitest-environment jsdom */
/**
 * **「保存しました」と言いながらメンバーを黙って捨てない。** (2026-09-08 · パス 89)
 *
 * `sanitizeTalentState` は上限で切り (`slice`)、形の合わない要素を落とす
 * (`filter`)。`saveTalentState` は書く前に同じ sanitizer を通すので、不適合な項目は
 * **保存時に消える**。それまで画面は `r.ok` だけを見て「保存しました」と出し、
 * `refresh()` が sanitize 済みの状態を読み直すので、**その人は一覧から消えていた**。
 *
 * 到達する経路: 滞留年数の入力は `<input type="number" min={0} max={60}>` だが
 * HTML の `max` は**助言的**で、form submit でもないので `e.target.value` は
 * `'61'` を返す。`isValidLadderMember` は `years > 60` を弾く。
 *
 * パス 74 は「保存の**失敗**を黙って捨てる」を直した。こちらは
 * **成功と言いながら一部を捨てている**形で、`save-state` が sanitize 後の状態を
 * 返しているので**言う手段は既に在った** (画面が返り値を捨てていた)。
 *
 * ここは IPC の 1 段だけを差し替え、**本物の `sanitizeTalentState` を通す** ——
 * 「main がこう返すはず」と私が書いた値ではなく、実際に落ちることを見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { sanitizeTalentState, buildTalentSnapshot, type TalentState } from '../../../shared/talent';

let container: HTMLDivElement;
let root: Root | null = null;
/** 画面が `save-state` に渡した payload (最後の 1 回)。 */
let lastSavePayload: unknown = null;

/** 実際に保存されている状態 (テストの中の「ディスク」)。 */
let stored: TalentState = sanitizeTalentState({
  reports: [],
  initiatives: [],
  members: [{ id: 'm1', name: '甲', step: 1, yearsInStep: 3 }],
  updatedAt: '2026-09-08',
});

function installHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['talent']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: buildTalentSnapshot(stored) }),
    invoke: (_id: string, action: string, payload: unknown) => {
      if (action !== 'save-state') return Promise.resolve({ ok: false, code: 'x', message: 'x' });
      lastSavePayload = payload;
      // **本物の sanitizer を通す** —— main の `saveTalentStateImpl` と同じ 1 行。
      stored = sanitizeTalentState(payload);
      return Promise.resolve({ ok: true, data: stored });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'talent');
  if (!def) throw new Error('talent service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** React の onChange を発火させる (native setter を通さないと React が拾わない)。 */
function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

function yearsInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('input[aria-label="メンバー 1 の滞留年数"]');
  if (!el) throw new Error('滞留年数 input not found');
  return el;
}

function saveButton(): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find(
    (el) => el.textContent === '入力を保存して判定し直す',
  );
  if (!b) throw new Error('save button not found');
  return b as HTMLButtonElement;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

beforeEach(() => {
  lastSavePayload = null;
  stored = sanitizeTalentState({
    reports: [],
    initiatives: [],
    members: [{ id: 'm1', name: '甲', step: 1, yearsInStep: 3 }],
    updatedAt: '2026-09-08',
  });
  installHub();
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
  document.body.removeChild(container);
});

describe('人材ページ — 保存で落ちた項目を言う', () => {
  it('★ 滞留年数 61 年で保存すると「保存されませんでした」と言う (「保存しました」だけで済ませない)', async () => {
    await mount();
    // 画面から本当に打てる値 (`max={60}` は助言的なので value に入る)
    await act(async () => {
      changeInput(yearsInput(), '61');
    });
    expect(yearsInput().value).toBe('61'); // max が値を止めていないことの標本
    await click(saveButton());

    const t = text();
    expect(t).toContain('保存しました'); // 保存自体は成功している
    expect(t).toContain('メンバー 1 件'); // ← 直す前はこれが出なかった
    expect(t).toContain('保存されませんでした');
    // 実際に落ちていること (「言うだけ」になっていないことの対照)
    expect(stored.members).toHaveLength(0);
    expect((lastSavePayload as { members: unknown[] }).members).toHaveLength(1);
  });

  it('★ 対照: 範囲内 (60 年) なら落ちず、断りも出ない', async () => {
    await mount();
    await act(async () => {
      changeInput(yearsInput(), '60');
    });
    await click(saveButton());

    const t = text();
    expect(t).toContain('保存しました');
    expect(t).not.toContain('保存されませんでした');
    expect(stored.members).toHaveLength(1);
    expect(stored.members[0]?.yearsInStep).toBe(60);
  });

  it('★ 対照: 何も編集せず保存しても断りは出ない (いつでも鳴る形になっていない)', async () => {
    await mount();
    await click(saveButton());
    expect(text()).toContain('保存しました');
    expect(text()).not.toContain('保存されませんでした');
  });
});
