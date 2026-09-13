/** @vitest-environment jsdom */
/**
 * **保存した物を「同梱データ」と言わず、読めなかった保存を黙って見本に化けさせない** (2026-09-09 · パス 120)。
 *
 * `buildTeamRadarSnapshot` は常に `isMock: true` で組んでいた (main は 2026-08 から、パス 118 はそれを shared へ
 * 移しただけ)。`StatusBar` は `source === 'live' && payloadIsMock` で「同梱データ」を出す (パス 91) ので、
 * 利用者が保存した自分のチームが、更新の直後に「同梱データ」と刷られていた。壊れた保存値は黙って見本の 3 人に化け、
 * 誰も何も言わなかった (パス 88 の形)。ここは画面の側 —— バッジと注記が 3 つの状態を言い分けることを見る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { DEFAULT_TEAM_RADAR_STATE, buildTeamRadarSnapshot, type StoredTeamRadar } from '../../../shared/teamRadarState';

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
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'teamradar');
  if (!def) throw new Error('teamradar service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

beforeEach(() => {
  localStorage.clear();
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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/**
 * 保存先を読むのは「更新」(と保存の直後の refresh)。マウント時の自動取得は資格情報のある
 * サービスだけなので (`useServiceData`)、この画面は開いた直後は同梱の snapshot を刷る。
 * 実際の利用者と同じ順で「更新」を押す。
 */
async function clickRefresh(): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '更新');
  if (!button) throw new Error('更新 button not found');
  await act(async () => {
    button.click();
  });
  await settle();
}

describe('チームレーダー — 保存先の 3 状態を画面が言い分ける (パス 120)', () => {
  it('対照: まだ保存していない → バッジは「同梱データ」、注記は無い', async () => {
    stored = { kind: 'none' };
    await mountPage();
    // 開いた直後は同梱の snapshot (バッジ「スナップショット」)。読むのは「更新」から。
    expect(text()).toContain('スナップショット');
    await clickRefresh();
    expect(text()).toContain('同梱データ');
    expect(text()).not.toContain('読めませんでした');
  });

  it('★ 保存した状態 → バッジは「ローカル」(「同梱データ」ではない)。パス 120 までは常に「同梱データ」だった', async () => {
    stored = { kind: 'saved', state: { department: '開発部', evaluatedAt: '2026-09-09', members: DEFAULT_TEAM_RADAR_STATE.members } };
    await mountPage();
    await clickRefresh();
    expect(text()).toContain('ローカル');
    expect(text()).not.toContain('同梱データ');
    expect(text()).not.toContain('読めませんでした');
  });

  it('★ 読めなかった保存 → 見本を表示しつつ、理由つきの注記を出す (黙って見本に化けない)', async () => {
    stored = { kind: 'unreadable', reason: 'JSON として読めません' };
    await mountPage();
    expect(text()).not.toContain('読めませんでした');
    await clickRefresh();
    expect(text()).toContain('保存したチームの状態を読めませんでした (JSON として読めません)');
    expect(text()).toContain('元の保存値は戻りません');
    expect(text()).toContain('同梱データ');
  });
});
