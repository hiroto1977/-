/** @vitest-environment jsdom */
/**
 * **画面の図と書き出す図は、同じ関数で描く** (2026-09-27 · パス 493g)。
 *
 * それまで `TeamRadarPage` は色 (PALETTE) と頂点の位置 (axisPoint) の**写し**を持ち、
 * 書き出す SVG (`shared/teamRadarSvg.ts`) は別に持っていた。片方の色を変えると、画面で見た
 * 図と書き出して人に渡す図でメンバーの色が食い違う (凡例の色で人を読み分けるので、取り違えになる)。
 * ここは実物の画面を描き、**メンバーの多角形の色が、書き出す SVG と同じ並び**であることを見る。
 *
 * 併せて、画面で足したメンバーの評点が保存の関門 (`validateMembers`) を通る形であることを見る ——
 * 画面は `[3, 3, 3, 3, 3]` を字面で書いており、軸を 1 つ足した日に画面で足したメンバーだけが
 * 保存で断られる形だった。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamRadarPage } from '../TeamRadarPage';
import { SNAPSHOT } from '../../data/snapshot';
import { newMemberScores } from '../../data/teamRadarDraft';
import { colorFor, renderTeamRadarSvg } from '../../../shared/teamRadarSvg';
import { AXIS_COUNT, SCORE_MAX, SCORE_MIN, validateMembers } from '../../../shared/teamRadarState';
import { waitForElement } from '../../__tests__/jsdomWait';

const DRAFT_KEY = 'servicehub.teamradar.draft.v1';
const AXES = ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'];
const MEMBERS = [
  { id: 'a', name: '青木', scores: [3, 4, 2, 5, 1] },
  { id: 'b', name: '馬場', scores: [2, 2, 2, 2, 2] },
  { id: 'c', name: '千葉', scores: [5, 5, 4, 4, 3] },
];

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ title: 'T', axes: AXES, department: '開発部', evaluatedAt: '2026-09-27', members: MEMBERS }),
  );
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

/** メンバーの多角形 (塗りが半透明の rgba) の線の色を、並びどおりに。 */
function memberStrokes(scope: ParentNode): string[] {
  return [...scope.querySelectorAll('polygon')]
    .filter((p) => (p.getAttribute('fill') ?? '').startsWith('rgba('))
    .map((p) => p.getAttribute('stroke') ?? '');
}

describe('★ 画面の図と書き出す図は同じ色で人を描く (パス 493g)', () => {
  it('★ 画面のメンバーの多角形の色 = 書き出す SVG の色 = colorFor(並び)', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(TeamRadarPage));
    });
    const skillSvg = await waitForElement(
      () => [...container.querySelectorAll('svg')].find((s) => memberStrokes(s).length === MEMBERS.length) ?? null,
      'スキルのレーダーにメンバー 3 人の多角形',
    );
    const onScreen = memberStrokes(skillSvg);
    const expected = MEMBERS.map((_, i) => colorFor(i).stroke);
    expect(onScreen).toEqual(expected);

    const svg = renderTeamRadarSvg({ ...SNAPSHOT.teamradar, axes: AXES, members: MEMBERS });
    const exported = memberStrokes(new DOMParser().parseFromString(svg, 'image/svg+xml'));
    expect(exported, '書き出す SVG の多角形を拾えていない (走査が死んでいる)').toHaveLength(MEMBERS.length);
    expect(onScreen).toEqual(exported);
  });
});

describe('★ 評点の入力欄の範囲は保存の関門と同じ物 (パス 493g)', () => {
  /*
   * `data/memberCare.ts` が別の `SCORE_MIN` / `SCORE_MAX` を持っていた間、入力欄の min / max は
   * そちらを読み、保存の関門は shared を読んでいた。**入力欄の属性を実物で読む**。
   */
  it('★ range の min / max = shared/teamRadarState の SCORE_MIN / SCORE_MAX', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(TeamRadarPage));
    });
    await waitForElement(() => container.querySelector('input[type="range"]'), '評点の入力欄');
    const ranges = [...container.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    expect(ranges.length).toBe(MEMBERS.length * AXES.length);
    for (const r of ranges) {
      expect(Number(r.min)).toBe(SCORE_MIN);
      expect(Number(r.max)).toBe(SCORE_MAX);
    }
  });
});

describe('★ 画面で足したメンバーの評点は保存の関門を通る (パス 493g)', () => {
  it('軸の数だけ、範囲の真ん中で', () => {
    const scores = newMemberScores();
    expect(scores).toHaveLength(AXIS_COUNT);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(SCORE_MIN);
      expect(s).toBeLessThanOrEqual(SCORE_MAX);
    }
    expect(scores.every((s) => s === Math.round((SCORE_MIN + SCORE_MAX) / 2))).toBe(true);
  });

  it('★ そのまま保存の関門 (validateMembers) に渡しても断られない', () => {
    expect(() => validateMembers([{ id: 'm1', name: 'メンバー1', scores: newMemberScores(), notes: {} }])).not.toThrow();
  });
});
