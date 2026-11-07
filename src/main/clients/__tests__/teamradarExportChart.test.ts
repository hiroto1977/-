/**
 * **書き出す SVG は画面の図と同じか** (2026-09-12 · パス 190)。
 *
 * 実測した食い違い (直す前):
 *
 * ```
 *   svg title   編集したタイトル｜編集した部署 (2026-09-12)   ← 画面が送った値
 *   svg header  部署: 保存した部署 · 評価時点: 2026-01-01     ← 保存済み状態
 *   svg axes    営業力 | 顧客対応力 | …                      ← 常に CANONICAL_AXES
 * ```
 *
 * 1 枚のファイルが 2 つの部署・2 つの評価時点を名乗り、画面で付け直した軸名は
 * 1 文字も届かない。まだ保存していなければ**同梱の見本 3 人**が書き出される。
 * ブラウザ版は `tryGrabSvgFromPage()` で画面の SVG をそのまま出すので正しく、
 * **デスクトップ版だけ**が 2 つ目の実装で外れていた。
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', async () => (await import('../../__tests__/safeStorageMock')).electronSafeStorageMock());

import { exportTeamRadarSvgImpl, renderTeamRadarSvg, saveTeamRadarStateImpl } from '../teamradar';
import {
  CANONICAL_AXES,
  buildTeamRadarSnapshot,
  validateTeamRadarState,
  type TeamRadarSnapshot,
} from '../../../shared/teamRadarState';
import type { ActionContext, FetchContext } from '../types';
import { unsealForTest } from '../../__tests__/safeStorageMock';

const SAVED = {
  department: '保存した部署',
  evaluatedAt: '2026-01-01',
  members: [{ id: 'saved', name: '保存した人', scores: [5, 4, 3, 2, 1] }],
};
const savedSnap = buildTeamRadarSnapshot({ kind: 'saved', state: SAVED });

/** 画面が送ってくる形 (編集後の部署・評価時点・軸名・メンバー)。 */
const ON_SCREEN = {
  department: '編集した部署',
  evaluatedAt: '2026-09-12',
  axes: ['企画力', '実装力', '折衝力', '段取り力', '育成力'],
  members: [{ id: 'screen', name: '画面の人', scores: [1, 2, 3, 4, 5] }],
};

async function exportWith(payload: Record<string, unknown>): Promise<string> {
  let written = '';
  await exportTeamRadarSvgImpl(
    { payload, token: null } as unknown as ActionContext,
    {
      fetchSnapshot: async (_c: FetchContext) => savedSnap,
      writeFile: async (_p, c) => { written = c; },
      mkdir: async () => undefined,
      now: () => new Date(0),
    },
  );
  return written;
}

const headerOf = (svg: string) => /font-size="11"[^>]*>([^<]*)</.exec(svg)?.[1] ?? '';
const axisTextsOf = (svg: string) =>
  [...svg.matchAll(/font-size="13"[^>]*text-anchor="[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe('書き出しは画面の図を描く', () => {
  it('★ 画面が送った部署・評価時点をヘッダに刷る (保存済みの値ではない)', async () => {
    const svg = await exportWith({ title: 't', chart: ON_SCREEN });
    expect(headerOf(svg)).toBe('部署: 編集した部署 · 評価時点: 2026-09-12');
    // 標本: 直っていなければ出ていた値
    expect(svg).not.toContain('保存した部署');
    expect(svg).not.toContain('2026-01-01');
  });

  it('★ 画面が付け直した軸名が届く (CANONICAL_AXES を刷らない)', async () => {
    const svg = await exportWith({ title: 't', chart: ON_SCREEN });
    expect(axisTextsOf(svg)).toEqual(ON_SCREEN.axes);
    for (const canonical of CANONICAL_AXES) expect(svg).not.toContain(canonical);
  });

  it('★ 画面のメンバーを描く (同梱の見本でも保存済みでもない)', async () => {
    const svg = await exportWith({ title: 't', chart: ON_SCREEN });
    expect(svg).toContain('画面の人');
    expect(svg).not.toContain('保存した人');
    expect(svg).not.toContain('森田 拓也');
  });

  it('対照 — chart を送らなければ保存済み状態に落ちる (直接 action を叩く経路)', async () => {
    const svg = await exportWith({ title: 't' });
    expect(headerOf(svg)).toBe('部署: 保存した部署 · 評価時点: 2026-01-01');
    expect(svg).toContain('保存した人');
  });

  it('★ 送られた図は保存と同じ判定を通る (緩い値が書き出しの口から入らない)', async () => {
    await expect(exportWith({ title: 't', chart: { ...ON_SCREEN, department: '' } }))
      .rejects.toThrow(/department must be/);
    await expect(exportWith({ title: 't', chart: { ...ON_SCREEN, members: [{ id: 'BAD', name: 'x', scores: [1, 1, 1, 1, 1] }] } }))
      .rejects.toThrow(/id is invalid/);
    await expect(exportWith({ title: 't', chart: { ...ON_SCREEN, axes: ['a', 'b'] } }))
      .rejects.toThrow(/axes must be an array of length 5/);
    await expect(exportWith({ title: 't', chart: { ...ON_SCREEN, axes: ['a', 'b', 'c', 'd', ''] } }))
      .rejects.toThrow(/axis label must be/);
  });
});

describe('デスクトップの保存が軸名を落とさない', () => {
  /*
   * `verify:arch` の payload 台帳が教えてくれた —— `SaveStatePayload` に `axes` の欄が
   * 無い間、画面が送った軸名は `saveTeamRadarStateImpl` の分解で**黙って落ちていた**
   * (私がこのパスで直した経路の中に、同じ「口はあるが繋がっていない」が残っていた)。
   */
  it('★ save-state が受けた軸名を保存する', async () => {
    let saved: unknown = null;
    const out = await saveTeamRadarStateImpl(
      { payload: ON_SCREEN, token: null } as unknown as ActionContext,
      {
        readFile: async () => { throw new Error('ENOENT'); },
        // 保存は OS のキーチェーンで封緘される (パス 133) —— 開けてから中を見る。
        writeFile: async (_p, c) => { saved = JSON.parse(unsealForTest(c)); },
        mkdir: async () => undefined,
        rename: async () => undefined,
        statePath: () => '/tmp/teamradar-test.json',
      },
    );
    expect(out.axes).toEqual(ON_SCREEN.axes);
    expect(saved).toMatchObject({ axes: ON_SCREEN.axes });
  });

  it('★ 軸名を送らなければ欄を作らない (既存の保存値と同じ形)', async () => {
    const out = await saveTeamRadarStateImpl(
      { payload: SAVED, token: null } as unknown as ActionContext,
      {
        readFile: async () => { throw new Error('ENOENT'); },
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        rename: async () => undefined,
        statePath: () => '/tmp/teamradar-test.json',
      },
    );
    expect(out.axes).toBeUndefined();
  });

  it('★ 送られた軸名も判定を通る (5 本・1 文字以上)', async () => {
    const deps = {
      readFile: async () => { throw new Error('ENOENT'); },
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      rename: async () => undefined,
      statePath: () => '/tmp/teamradar-test.json',
    };
    await expect(saveTeamRadarStateImpl(
      { payload: { ...ON_SCREEN, axes: ['a', 'b'] }, token: null } as unknown as ActionContext,
      deps,
    )).rejects.toThrow(/axes must be an array of length 5/);
  });
});

describe('軸名が保存に乗る', () => {
  it('★ validateTeamRadarState が axes を通す', () => {
    const out = validateTeamRadarState(ON_SCREEN);
    expect(out.axes).toEqual(ON_SCREEN.axes);
  });

  it('★ axes の無い保存済み状態 (パス 190 より前の形) はそのまま読める', () => {
    const out = validateTeamRadarState(SAVED);
    expect(out.axes).toBeUndefined();
    expect(buildTeamRadarSnapshot({ kind: 'saved', state: out }).axes).toEqual(CANONICAL_AXES);
  });

  it('★ 保存された軸名がスナップショットに出る', () => {
    const snap: TeamRadarSnapshot = buildTeamRadarSnapshot({
      kind: 'saved',
      state: validateTeamRadarState(ON_SCREEN),
    });
    expect(snap.axes).toEqual(ON_SCREEN.axes);
    expect(renderTeamRadarSvg(snap, { title: 't' })).toContain('折衝力');
  });
});
