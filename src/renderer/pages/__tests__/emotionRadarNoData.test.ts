/** @vitest-environment jsdom */
/**
 * **気分を記録していない人を「中立の 3」として測定値に混ぜない。**
 *
 * `TeamRadarPage` は 2026-09-09 まで、感情レーダーへ渡す気分を
 * `moods[m.id] ?? 3` と書いていた —— 気分を**一度も入れていないメンバー**が
 * 「3 と記録した人」と**区別できない形**でチーム平均に入っていた。
 * パス 64 で直した「中立を測定値として出す」と同じ形で、対象が**人のメンタル**
 * である分だけ重い。
 *
 * ## 値の層で分かったこと (実測)
 *
 * `analyzeProfile([], [])` の 5 軸は `[1, 3, 5, 1, 3]` になる ——
 * `clamp1to5(0)` が 1 に、`5 - 0*2` が 5 になるので、**同じ「データが無い」から
 * 最低点 (活力・余裕) と最高点 (安定) が同時に出る**。一貫した偏りですらない。
 *
 * ## 軸ごとに分母が違う
 *
 * 4 軸は気分の記録から、前向きだけは本文解析から来る。この画面は解析を
 * 渡していないので、前向きは**どのメンバーも値を持たない** ——
 * `buildTeamEmotionRadar` はそういう軸を**結果から落とす** (入力の無い軸を
 * 描かない)。解析が配線されれば 5 軸目が自動で戻る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { buildTeamEmotionRadar, teamEmotionSummary, type MemberEmotion } from '../../data/teamEmotionRadar';

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

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'teamradar');
  if (!def) throw new Error('teamradar service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

const missingBand = (): string =>
  Array.from(container.querySelectorAll('[data-emotion-missing]'))
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

describe('感情ウェルビーイング — 記録が無い人を測定値にしない (値の層)', () => {
  it('★ 記録ゼロの人は全軸 null (1/5 でも 5/5 でもない)', () => {
    const r = buildTeamEmotionRadar([{ id: 'a', name: '未記録', moods: [], analyses: [] }]);
    // 直す前: scores は [1, 3, 5, 1, 3] —— 最低点と最高点が同時に出ていた
    expect(r.members[0]!.scores.every((v) => v === null)).toBe(true);
    expect(r.teamAverage.every((v) => v === null)).toBe(true);
  });

  it('★ 記録が無い人はチーム平均の分母に入らない', () => {
    const withData: MemberEmotion = {
      id: 'a', name: '記録あり',
      moods: [{ score: 4, note: '' }, { score: 4, note: '' }],
      analyses: [],
    };
    const without: MemberEmotion = { id: 'b', name: '未記録', moods: [], analyses: [] };
    const both = buildTeamEmotionRadar([withData, without]);
    const alone = buildTeamEmotionRadar([withData]);
    // **記録していない人を足しても平均は動かない。** 旧実装は (4+1)/2 = 2.5 に
    // 落ちていた —— 平均が感情ではなく「参加率」の関数になっていた。
    expect(both.teamAverage[0]).toBe(alone.teamAverage[0]);
    expect(both.teamAverage[0]).toBe(4);
  });

  it('★ サマリ文が「活力 0/5」と言わない (算定不能をそう述べる)', () => {
    const empty = buildTeamEmotionRadar([{ id: 'a', name: '未記録', moods: [], analyses: [] }]);
    const s = teamEmotionSummary(empty);
    expect(s).not.toContain('0/5');
    expect(s).not.toContain('1/5');
    expect(s).toContain('算定していません');
  });

  it('★ 入力の無い軸は結果から落ちる (前向きは解析が無いので描かない)', () => {
    const r = buildTeamEmotionRadar([
      { id: 'a', name: '記録あり', moods: [{ score: 4, note: '' }], analyses: [] },
    ]);
    expect(r.axes).not.toContain('前向き');
    expect(r.axes).toEqual(['活力', '安定', '余裕', '回復力']);
    // 落とした軸を「この人は欠測」と名指ししない (誰も持っていない軸なので)
    expect(r.missingData).toEqual([]);
  });

  it('★ 対照: 解析が在れば前向きの軸は戻る (自己調整になっている)', () => {
    const r = buildTeamEmotionRadar([
      {
        id: 'a', name: '記録あり',
        moods: [{ score: 4, note: '' }],
        analyses: [{ dominant: 'joy', sentiment: 'positive' }],
      },
    ]);
    expect(r.axes).toContain('前向き');
    expect(r.axes).toHaveLength(5);
  });
});

describe('感情ウェルビーイング — 画面', () => {
  it('★ 既定の画面が描け、レーダーの軸が出る', async () => {
    await mountPage();
    expect(text()).toContain('感情ウェルビーイング');
    expect(text()).toContain('活力');
  });

  it('★ 既定状態 (気分の記録が 1 件も無い) で数を刷らない', async () => {
    // `useState<Record<string, number>>({})` —— **初期状態では全員が未記録**。
    // 直す前は `moods[m.id] ?? 3` で全員に 3 を代入していたので、画面は
    // **「活力 3/5」**を刷っていた (誰も気分を入れていないのに)。
    //
    // ★ 対照 3 が鳴らなかったのは、ここで `0/5` と `1/5` の不在だけを見て
    //   いたからである —— **実際に出ていた文字列は `3/5` だった。**
    //   「不在を主張する検査には標本を添える」(CLAUDE.md) の実例。
    await mountPage();
    const t = text();
    expect(t).toContain('算定していません');
    expect(t).not.toContain('活力 3/5'); // ← 直す前に実際に出ていた文面
    expect(t).not.toMatch(/活力 \d/);
  });

  it('★ 図から外した人を名指しし、低評価ではないと述べる', async () => {
    await mountPage();
    const band = missingBand();
    // 既定状態では全員が未記録なので、帯は必ず出る。
    expect(band).not.toBe('');
    expect(band).toContain('低い評価ではありません');
    expect(band).toContain('レーダーに描いていません');
  });

  it('★ 対照: 図に多角形が描かれていない (欠けた頂点を中心に置いていない)', async () => {
    await mountPage();
    // 記録ゼロなので、感情レーダーにメンバーの多角形は 1 つも無い。
    // `?? 0` に戻すと全員が中心に落ちた多角形として描かれる。
    const svgs = Array.from(container.querySelectorAll('svg'));
    const emotionSvg = svgs[svgs.length - 1];
    expect(emotionSvg).toBeTruthy();
    const filled = Array.from(emotionSvg!.querySelectorAll('polygon')).filter(
      (p) => (p.getAttribute('fill') ?? 'none') !== 'none',
    );
    expect(filled).toHaveLength(0);
  });
});
