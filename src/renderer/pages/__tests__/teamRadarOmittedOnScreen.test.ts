/** @vitest-environment jsdom */
/**
 * **チームレーダーの画面で、未評価の軸がどう描かれるか** (2026-09-12 · パス 190)。
 *
 * 評点の欄は `isEvaluatedScore` を見て「—」と刷るのに、**同じ画面の多角形は
 * 未評価の 0 を中心に置いていた** —— 数字は「無い」と言い、図は「最低」と言う。
 * `RadarChart` の「値の無い軸が 1 つでもあれば描かない」は `null` しか見ておらず、
 * 0 はすり抜けていた (パス 66 と同じ「1 か所しか直していない」形)。
 *
 * 0 が入る道は下書き —— `sanitizeRadarDraft` の `finiteOrZero` が、数でない値
 * (古い版・手で直した localStorage) を 0 に倒す。評点の入力は 1-5 の range なので
 * 画面から 0 は書けない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamRadarPage } from '../TeamRadarPage';
import { SNAPSHOT } from '../../data/snapshot';

const DRAFT_KEY = 'servicehub.teamradar.draft.v1';
const AXES = ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'];

/** 中心の座標 (size=520 → cx = 260, cy = 260 + 8)。 */
const CENTER = '260.0,268.0';

let container: HTMLDivElement;
let root: Root | null = null;

function seedDraft(members: unknown): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    title: 'T', axes: AXES, department: '開発部', evaluatedAt: '2026-09-12', members,
  }));
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'not_implemented', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'action_failed', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
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

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TeamRadarPage));
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

const marker = (name: string): string | null => {
  const el = container.querySelector(`[${name}]`);
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
};

/** 最初の SVG (才能レーダー) の、メンバーの多角形の points。 */
function memberPolygons(): string[] {
  const svg = container.querySelector('svg');
  if (svg === null) return [];
  return [...svg.querySelectorAll('polygon')]
    .filter((p) => p.getAttribute('fill') !== 'none')
    .map((p) => p.getAttribute('points') ?? '');
}

describe('未評価の軸が在る人は、才能レーダーに描かない', () => {
  it('★ 未評価の 0 を中心に描かない', async () => {
    seedDraft([{ id: 'a', name: '田中', scores: [5, 4, 0, 2, 1] }]);
    await mount();
    expect(memberPolygons()).toEqual([]);
    const svg = container.querySelector('svg')!.outerHTML;
    expect(svg).not.toContain(CENTER);
  });

  it('★ 誰のどの軸が欠けているかを図の下に書く', async () => {
    seedDraft([{ id: 'a', name: '田中', scores: [5, 4, 0, 2, 1] }]);
    await mount();
    const note = marker('data-skill-radar-omitted');
    expect(note).not.toBeNull();
    expect(note).toContain('1 名を図に描いていません');
    expect(note).toContain('田中 (プレゼン力)');
  });

  it('★ 凡例は描いた人だけ (色の丸だけが残らない)', async () => {
    seedDraft([
      { id: 'a', name: '描ける人', scores: [5, 4, 3, 2, 1] },
      { id: 'b', name: '描けない人', scores: [5, 4, 0, 2, 1] },
    ]);
    await mount();
    expect(memberPolygons()).toHaveLength(1);
    expect(container.querySelectorAll('[data-skill-radar-omitted]')).toHaveLength(1);
    // 描けない人は凡例から消えるが、注記で名指しされる (黙って落とさない)
    expect(marker('data-skill-radar-omitted')).toContain('描けない人');
  });

  it('対照 — 全軸に評点が在れば描き、注記は出ない', async () => {
    seedDraft([{ id: 'a', name: '田中', scores: [5, 4, 3, 2, 1] }]);
    await mount();
    expect(memberPolygons()).toHaveLength(1);
    expect(marker('data-skill-radar-omitted')).toBeNull();
  });

  it('対照 — 同梱の見本 (全軸 1-5) はそのまま描かれる', async () => {
    await mount();
    expect(memberPolygons()).toHaveLength(SNAPSHOT.teamradar.members.length);
    expect(marker('data-skill-radar-omitted')).toBeNull();
  });

  it('★ 下書きの数でない評点は 0 に倒れる → その人は描かない (入り口の実測)', async () => {
    seedDraft([{ id: 'a', name: '田中', scores: [5, 'x', 3, 2, 1] }]);
    await mount();
    expect(memberPolygons()).toEqual([]);
    expect(marker('data-skill-radar-omitted')).toContain('顧客対応力');
  });
});
