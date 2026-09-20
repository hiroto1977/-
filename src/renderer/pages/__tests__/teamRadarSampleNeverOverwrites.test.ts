/** @vitest-environment jsdom */
/**
 * **見本は、利用者の編集中の内容を置き換えない** (2026-09-20 · パス 335)。
 *
 * チームレーダーの画面は 2 つの効果を持つ:
 *
 *   1. `data` が変わったら画面の状態をその内容へ揃える (更新ボタンの取得し直し)
 *   2. 画面の状態が変わったら `servicehub.teamradar.draft.v1` へ書く (自動保存)
 *
 * 1 に「取ってきた物が利用者の保存した物か」の判定が無かったので、**保存値が無い /
 * 読めないときに返る同梱の見本が 1 を通って 2 へ流れ**、利用者が何も押していなくても
 * 端末に残っていた編集内容が見本 3 人で上書きされていた。実測 (この検査が下で示す表):
 *
 * ```
 *   stored='saved'      → 下書きは保存した物になる       (筋が通る・対照)
 *   stored='none'       → 下書きが**同梱の見本**になる    ← パス 335 で閉じた
 *   stored='unreadable' → 下書きが**同梱の見本**になる    ← パス 335 で閉じた
 * ```
 *
 * パス 120 (バッジと注記)・パス 121 (人材育成)・パス 309 (銘柄) と同じ家系。
 * この画面は「3 つを言い分ける」ところまでは直っていて、**書き戻す側**が残っていた。
 *
 * **対照**: `saved` の行は「見本でなければ今も揃える」を押さえる ——
 * 1 を丸ごと殺す直し方 (`return` を無条件にする) ならこの行が落ちる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamRadarPage } from '../TeamRadarPage';
import {
  DEFAULT_TEAM_RADAR_STATE,
  buildTeamRadarSnapshot,
  type StoredTeamRadar,
} from '../../../shared/teamRadarState';

const DRAFT_KEY = 'servicehub.teamradar.draft.v1';
const AXES = ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'];

/** 利用者が端末に持っている編集中の内容 (この検査で守りたい物)。 */
const MINE = { id: 'mine', name: '私が入れた人', scores: [5, 4, 3, 2, 1] };
/** 保存済みの状態 (`stored: 'saved'` のときに返る物)。 */
const SAVED: StoredTeamRadar = {
  kind: 'saved',
  state: {
    department: '保存部',
    evaluatedAt: '2026-01-01',
    members: [{ id: 'saved', name: '保存した人', scores: [1, 1, 1, 1, 1] }],
  },
};

let stored: StoredTeamRadar = { kind: 'none' };

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    // 両ビルドの fetchSnapshot が返す物と同じ形 (shared の組み立てをそのまま通す)。
    fetchSnapshot: () => Promise.resolve({ ok: true, data: buildTeamRadarSnapshot(stored) }),
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

beforeEach(() => {
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
  localStorage.clear();
});

function seedMyDraft(): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    title: '私のチーム', axes: AXES, department: '開発部', evaluatedAt: '2026-09-12', members: [MINE],
  }));
}

function draftMemberNames(): string[] {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (raw === null) return [];
  const members = (JSON.parse(raw) as { members?: { name: string }[] }).members ?? [];
  return members.map((m) => m.name);
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TeamRadarPage));
  });
  await settle();
}

/** 画面の「更新」を 1 回押す (取得し直し → `data` が変わる)。 */
async function pressRefresh(): Promise<void> {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').includes('更新'),
  );
  expect(btn, '画面に「更新」ボタンが在る').toBeDefined();
  await act(async () => {
    btn!.click();
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

describe('更新ボタン 1 回で、端末の編集内容が見本に置き換わらない', () => {
  it('★ 保存値が読めないとき、下書きは利用者の物のまま', async () => {
    seedMyDraft();
    stored = { kind: 'unreadable', reason: 'JSON として読めません' };
    await mount();
    expect(draftMemberNames()).toEqual(['私が入れた人']);
    await pressRefresh();
    expect(draftMemberNames()).toEqual(['私が入れた人']);
    // 画面も見本に化けていない。
    expect(text()).toContain('私が入れた人');
  });

  it('★ 保存値がまだ無いときも、下書きは利用者の物のまま', async () => {
    seedMyDraft();
    stored = { kind: 'none' };
    await mount();
    await pressRefresh();
    expect(draftMemberNames()).toEqual(['私が入れた人']);
  });

  it('★ 見本の氏名が下書きへ 1 つも流れ込まない (標本 — 見本は実在する 3 人)', async () => {
    // 見本が空なら上の 2 件はどんな実装でも通る。見本が実在することを先に示す。
    const sample = DEFAULT_TEAM_RADAR_STATE.members.map((m) => m.name);
    expect(sample.length).toBeGreaterThan(0);
    seedMyDraft();
    stored = { kind: 'unreadable', reason: 'r' };
    await mount();
    await pressRefresh();
    const after = draftMemberNames();
    for (const name of sample) expect(after).not.toContain(name);
  });

  it('対照 — 保存した物を取り直したときは、今も画面と下書きが揃う', async () => {
    seedMyDraft();
    stored = SAVED;
    await mount();
    expect(draftMemberNames()).toEqual(['私が入れた人']);
    await pressRefresh();
    expect(draftMemberNames()).toEqual(['保存した人']);
    expect(text()).toContain('保存した人');
  });

  it('対照 — 下書きが無ければマウント時は見本から始まる (この検査の前提)', async () => {
    stored = { kind: 'none' };
    await mount();
    expect(draftMemberNames()).toEqual(DEFAULT_TEAM_RADAR_STATE.members.map((m) => m.name));
  });
});

/**
 * 注記は**取得し直した後**にしか出ない —— マウント時の `data` は同梱の静的
 * スナップショット (`storedNote: null`) で、この画面は資格情報を持たないので
 * 自動取得もしない。実機 (e2e) も「更新」を押してから注記を待っている。
 */
describe('読めなかったときの注記は、画面に何が出ているかを正しく言う', () => {
  it('★ 下書きが在るときは「見本を表示しています」と言わない', async () => {
    seedMyDraft();
    stored = { kind: 'unreadable', reason: 'JSON として読めません' };
    await mount();
    await pressRefresh();
    const note = container.querySelector('[data-stored-fallback]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('この端末に残っていた編集中の内容は、そのままにしています。');
    expect(text()).not.toContain('見本を表示しています');
  });

  it('★ 下書きが無いときは「見本を表示しています」と言う', async () => {
    stored = { kind: 'unreadable', reason: 'JSON として読めません' };
    await mount();
    await pressRefresh();
    expect(container.querySelector('[data-stored-fallback]')!.textContent)
      .toContain('見本を表示しています。');
  });

  it('★ 読めなかった事実と、保存で戻らないことは、どちらの場合も言う', async () => {
    for (const withDraft of [true, false]) {
      localStorage.clear();
      if (withDraft) seedMyDraft();
      stored = { kind: 'unreadable', reason: 'JSON として読めません' };
      await mount();
      await pressRefresh();
      expect(text()).toContain('保存したチームの状態を読めませんでした (JSON として読めません)');
      expect(text()).toContain('元の保存値は戻りません');
      if (root) {
        const r = root;
        root = null;
        await act(async () => {
          r.unmount();
        });
      }
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  it('対照 — 読めているときは注記も札も出ない', async () => {
    stored = SAVED;
    await mount();
    await pressRefresh();
    expect(container.querySelector('[data-stored-fallback]')).toBeNull();
    expect(text()).not.toContain('保存したチームの状態を読めませんでした');
  });
});
