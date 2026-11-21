/** @vitest-environment jsdom */
/**
 * **チームレーダーの下書きの保存値も、読むときに天井を掛ける。** (2026-10-31 · パス 569)
 *
 * パス 419 / 568 と同じ家系 —— 入口 (TeamRadarPage の `fieldsOverCeiling`) と snapshot の
 * `validateMembers` はチャート名・部署・評価時点・軸名・メンバー名・付箋を上限で断るのに、
 * **下書き (localStorage `servicehub.teamradar.draft.v1`) の読み** (`sanitizeRadarDraft` /
 * `sanitizeTeamMember`) は長さを 1 つも見ていなかった。手で直した localStorage・旧版が書いた
 * 下書きは入口を通らずに入る (`typeof === 'string'` だけで素通し)。
 *
 * ## 実測 (2026-10-31 · 直す前・実物の TeamRadarPage を jsdom で描く · 各欄 200,000 字)
 *
 * 画面の総文字数 **2,201,386**・1 欄の最長 200,000・編集欄 (`<input>`) の値も 6 欄 ×
 * 200,000。直した後は総文字数 **1,503** で、どの欄も自分の上限 (名前 64 / チャート名 120 /
 * 部署 64 / 評価時点 32 / 軸 24 / 付箋 200) に収まる。
 *
 * ## 直し —— 入力欄の付箋の clamp と同じ `clampToCeiling` で、読むときに畳む
 *
 * `name` / 付箋 / チャート名 / 部署 / 評価時点 / 軸名は**表示専用** (結合は `id` でする) なので、
 * 入力欄が使う `clampToCeiling` (末尾 '…' を付けず上限ちょうどで切る) で読むときに畳む。
 * **`id` は同一性の鍵なので畳まない** (切ると別のメンバーを指す · パス 420)。正当な値
 * (≤ 上限) は 1 字も変わらない (round-trip しても上限を越えない)。
 *
 * 背骨は振る舞い —— sanitizer の単体 (欄ごとの clamp) と、実物の画面を長い下書きで描いて
 * 総文字数が収まることの両方。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { sanitizeRadarDraft, sanitizeTeamMember } from '../../data/teamRadarDraft';
import {
  MAX_AXIS_LABEL_CHARS,
  MAX_CHART_TITLE_CHARS,
  MAX_DEPARTMENT_CHARS,
  MAX_EVALUATED_AT_CHARS,
  MAX_MEMBER_NAME_CHARS,
  MAX_MEMBER_NOTE_CHARS,
  buildTeamRadarSnapshot,
  type StoredTeamRadar,
} from '../../../shared/teamRadarState';
import { countChars } from '../../../shared/inputCeiling';

const DRAFT_KEY = 'servicehub.teamradar.draft.v1';
const LONG = 'z'.repeat(200000);

const stored: StoredTeamRadar = { kind: 'none' };
beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: buildTeamRadarSnapshot(stored) }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

describe('チームレーダーの下書き — sanitizer が保管した自由文に天井を掛ける (パス 569)', () => {
  it('sanitizeTeamMember: 名前を MAX_MEMBER_NAME_CHARS で畳む', () => {
    const m = sanitizeTeamMember({ id: 'm1', name: LONG, scores: [3, 3, 3, 3, 3] });
    expect(m).not.toBeNull();
    expect(countChars(m!.name)).toBe(MAX_MEMBER_NAME_CHARS);
  });

  it('sanitizeTeamMember: 付箋を MAX_MEMBER_NOTE_CHARS で畳む', () => {
    const m = sanitizeTeamMember({ id: 'm1', name: '田中', scores: [3, 3, 3, 3, 3], notes: { 0: LONG } });
    expect(m).not.toBeNull();
    expect(countChars(m!.notes![0]!)).toBe(MAX_MEMBER_NOTE_CHARS);
  });

  it('sanitizeTeamMember: id は同一性の鍵なので畳まない (全文のまま)', () => {
    // 復元で入った長い id を切ると、moods / plot の結合が別のメンバーを指す。
    const longId = 'a'.repeat(5000);
    const m = sanitizeTeamMember({ id: longId, name: '田中', scores: [3, 3, 3, 3, 3] });
    expect(m!.id).toBe(longId);
  });

  it('sanitizeRadarDraft: チャート名・部署・評価時点・軸名を各上限で畳む', () => {
    const d = sanitizeRadarDraft({
      title: LONG,
      department: LONG,
      evaluatedAt: LONG,
      axes: [LONG, '顧客対応力'],
      members: [{ id: 'm1', name: LONG, scores: [3, 3, 3, 3, 3] }],
    });
    expect(countChars(d.title!)).toBe(MAX_CHART_TITLE_CHARS);
    expect(countChars(d.department!)).toBe(MAX_DEPARTMENT_CHARS);
    expect(countChars(d.evaluatedAt!)).toBe(MAX_EVALUATED_AT_CHARS);
    expect(countChars(d.axes![0]!)).toBe(MAX_AXIS_LABEL_CHARS);
    expect(countChars(d.members![0]!.name)).toBe(MAX_MEMBER_NAME_CHARS);
  });

  it('正当な値 (≤ 上限) は 1 字も変わらない', () => {
    const name = '鈴木 一郎';
    const title = '2026 年度 第 2 四半期 営業チーム評価';
    const note = '顧客対応が丁寧。来期はプレゼンの数をこなしたい。';
    const d = sanitizeRadarDraft({
      title,
      department: '営業部',
      evaluatedAt: '2026-10-31',
      axes: ['営業力', '顧客対応力'],
      members: [{ id: 'm1', name, scores: [3, 3, 3, 3, 3], notes: { 0: note } }],
    });
    expect(d.title).toBe(title);
    expect(d.department).toBe('営業部');
    expect(d.evaluatedAt).toBe('2026-10-31');
    expect(d.axes).toEqual(['営業力', '顧客対応力']);
    expect(d.members![0]!.name).toBe(name);
    expect(d.members![0]!.notes![0]).toBe(note);
  });

  describe('実物の画面を長い下書きで描くと、総文字数が天井に収まる', () => {
    let container: HTMLDivElement;
    let root: Root | null = null;
    async function settle(): Promise<void> {
      for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
    }
    beforeEach(() => {
      localStorage.clear();
      container = document.createElement('div');
      document.body.appendChild(container);
    });
    afterEach(async () => {
      if (root) { await act(async () => { root!.unmount(); }); root = null; }
      document.body.removeChild(container);
    });

    it('下書きの全欄が 200,000 字でも、画面と編集欄は上限に収まる', async () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        title: LONG,
        department: LONG,
        evaluatedAt: LONG,
        axes: [LONG, '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'],
        members: [{ id: 'm1', name: LONG, scores: [3, 3, 3, 3, 3], notes: { 0: LONG } }],
      }));
      const def = SERVICES.find((s) => s.id === 'teamradar')!;
      root = createRoot(container);
      await act(async () => { root!.render(createElement(def.page)); });
      await settle();

      // 直す前は総文字数 2,201,386。天井に収まれば 1 万字未満 (実測 1,503)。
      expect((container.textContent ?? '').length).toBeLessThan(10000);
      // どの入力欄の値も、いちばん大きい上限 (付箋 200) の 2 倍を超えない。
      for (const el of Array.from(container.querySelectorAll('input, textarea'))) {
        expect((el as HTMLInputElement).value.length).toBeLessThanOrEqual(MAX_MEMBER_NOTE_CHARS * 2);
      }
    });
  });
});
