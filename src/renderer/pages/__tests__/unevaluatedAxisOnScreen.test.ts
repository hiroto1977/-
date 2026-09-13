/** @vitest-environment jsdom */
/**
 * **未評価の軸を 0 点として平均せず、未評価であることを画面が述べる。**
 *
 * `TeamMember.scores` は軸数より短いことがある —— 保存された下書き
 * (`servicehub.teamradar.draft.v1`) の受け口 `sanitizeTeamMember` は
 * **並びを崩さないために長さを揃えない**ので、軸が増えた後の下書き・古い版・
 * 手で直した localStorage はそのまま短い配列で入る。
 *
 * 2026-09-08 まで `skillEvaluation` は `scores[i] ?? 0` で読んでいたので、
 * 評点 1〜5 の外の **0** が「その軸は 0 点」として平均に入っていた:
 *
 * | 控え | average | level | 伸びしろ | 1on1 の焦点 |
 * | --- | ---: | --- | --- | --- |
 * | 4,4,4,4,4 | 4.0 | 良好 | 技術 (4) | — |
 * | **4,4,4,4** | **3.2** | **標準** | **品質 (0)** | **「品質」の伸ばし方を一緒に** |
 * | **3,3** | **1.2** | **要支援** | 推進 (0) | — |
 *
 * —— **誰も評価していない軸を、1on1 の育成テーマとして名指ししていた。**
 * しかも同じ欠測を画面が 3 通りに読んでいた: 入力スライダー `?? 3`・
 * レーダー `?? 0`・平均 0。ここは**実物の localStorage の下書き**を通して見る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';

const DRAFT_KEY = 'servicehub.teamradar.draft.v1';

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

/** 画面の文字 (改行・連続空白を畳んだもの)。 */
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const alerts = (): string =>
  Array.from(container.querySelectorAll('[data-unevaluated-axes]'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
    .join(' | ');

/** 下書きを 1 人分だけ置く (軸は既定のまま = 5 軸)。 */
function seedDraft(scores: number[]): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ members: [{ id: 'm1', name: '山田 太郎', scores }] }));
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
  container.remove();
  localStorage.clear();
});

describe('Team Radar — 未評価の軸', () => {
  it('★ 5 軸目が無い下書きでも、評価済み 4 軸の平均とレベルを出す', async () => {
    seedDraft([4, 4, 4, 4]);
    await mountPage();
    const t = text();
    // 直す前は「スキル 3.2/5 (標準)」
    expect(t).toContain('スキル 4/5 (良好)');
    expect(t).not.toContain('(標準)');
  });

  it('★ 未評価の軸を画面が名前で述べる', async () => {
    seedDraft([4, 4, 4, 4]);
    await mountPage();
    const a = alerts();
    expect(a).not.toBe('');
    expect(a).toContain('は評価が入っていないため');
    expect(a).toContain('評価済み 4 軸で出しています');
  });

  it('★ 未評価の軸を 1on1 の育成テーマとして名指ししない', async () => {
    seedDraft([4, 4, 4, 4]);
    await mountPage();
    // 未評価の軸名を、断り書きの帯以外の場所 (1on1 の文) では出さない。
    // 5 軸目の名前は帯にだけ出る (帯を除いた文字列に含まれないこと)。
    const box = container.querySelector('[data-unevaluated-axes]');
    const unevaluatedName = (box?.textContent ?? '').replace(/\s+/g, ' ').match(/⚠ ([^ ]+) は評価が入っていない/)?.[1];
    expect(unevaluatedName).toBeTruthy();
    const focus = Array.from(container.querySelectorAll('div'))
      .map((el) => el.textContent ?? '')
      .filter((s) => s.includes('🗣'))
      .join(' ');
    expect(focus).not.toBe('');
    expect(focus).not.toContain(`「${unevaluatedName}」`);
  });

  it('★ 1 軸も評価が無ければ「—」と出し、評価をそろえるよう促す', async () => {
    seedDraft([]);
    await mountPage();
    const t = text();
    expect(t).toContain('強み・伸びしろ: —（評価が入っていません）');
    expect(t).toContain('まだ評価が入っていません');
    expect(alerts()).toContain('評価が 1 軸も入っていません');
    // 空の鍵括弧を刷らない (旧実装は軸名 '' で「『』を活かし」になりえた)
    expect(t).not.toContain('「」');
  });

  it('★ 入力欄は未評価を「3」と刷らない (同じ欠測を 2 通りに見せない)', async () => {
    seedDraft([4, 4, 4, 4]);
    await mountPage();
    // 評点欄は 4 つの「4」と 1 つの「—」になる
    const cells = Array.from(container.querySelectorAll('div'))
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent ?? '').trim());
    expect(cells.filter((c) => c === '—').length).toBeGreaterThanOrEqual(1);
  });

  it('★ 対照: 5 軸そろった下書きなら断り書きは出ない', async () => {
    seedDraft([4, 4, 4, 4, 4]);
    await mountPage();
    expect(alerts()).toBe('');
    expect(text()).toContain('スキル 4/5 (良好)');
  });
});
