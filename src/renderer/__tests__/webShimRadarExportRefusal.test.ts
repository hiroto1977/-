/** @vitest-environment jsdom */
/**
 * **書き出した SVG が、両ビルドで同じ物になる。** (パス 268)
 *
 * ## 実測した欠陥
 *
 * `export-svg` は 1 つの action だが実装が 2 つ在り、ブラウザ版は画面の `<svg>` を
 * `tryGrabSvgFromPage()` で掻き取っていた。掻き取れるのは `<svg>` 要素**だけ**で、
 * 標題・部署・評価時点・凡例 (誰の多角形がどの色か) はその**外側**の `<div>` に在る
 * (`TeamRadarPage.tsx`)。だからブラウザ版が渡していたのは**名前も部署も日付も無い
 * 裸の図**で、Canva に貼っても誰のチームの何年何月の図か分からなかった。
 * **これは端の場合ではなく、ブラウザ版の書き出し全件で起きていた。**
 *
 * もう 1 つ: 未評価の軸を持つ人が居るとき、デスクトップ版は保存と同じ検証
 * (`validateTeamRadarState`) に掛けて**断る**のに、ブラウザ版は検証を 1 度も通らず
 * **黙って成功し**、その人を落とした図を渡していた。同じボタンが片方で断り、
 * 片方で不完全な物を渡す —— どちらが正しいかの前に、揃っていなかった。
 *
 * パス 190 は `shared/radarPlot.ts` に「ブラウザ版は…既に正しい」と書いていた ——
 * 掻き取る範囲を確かめていなかった。**「そのまま」は「全部」ではない。**
 *
 * ## 対照の実測 (2026-09-15)
 *
 * 旧経路 (HEAD の `web-shim.ts`) に、画面の `<svg>` と ⚠ の `<div>` を置いた jsdom で
 * 未評価の軸を持つ人を含む `chart` を渡すと:
 *
 * ```
 *   { ok: true, bytes: 244,
 *     hasTitle: false, hasDept: false, hasDate: false, hasWarn: false, hasName: false }
 * ```
 *
 * **成功し**、244 バイトの**標題も部署も日付も断りも名前も無い図**を渡していた ——
 * デスクトップ版が同じ入力を `score must be integer 1-5: 0` で断るその横で。
 *
 * ## ここで測るもの
 *
 * ブラウザ版の invoke の口から、書き出しが**実際に保存する物**を読む
 * (SVG の中身は結果の欄に載らないので、ライブラリへ put された Blob から読む)。
 *
 * ## ⚠ の断りについて (実測した到達性)
 *
 * `renderTeamRadarSvg` は描けなかった人を ⚠ つきで図の中に書く (パス 41)。
 * ただし **`export-svg` の口からはその枝に到達しない** —— 上流の
 * `validateTeamRadarState` が「5 軸すべて整数 1-5」を要求するので、未評価の形
 * (`null` / `0` / 短い配列) は図に届く前に断られる (両ビルドで同じ)。
 * だからここでは枝そのものは**関数を直接呼んで**留め、action の口では
 * 「両ビルドが同じに断る」ことを留める。**到達しない物を到達するかのように
 * 書かない** (パス 247 の方針)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTeamRadarSvg } from '../../shared/teamRadarSvg';
import {
  buildTeamRadarSnapshot,
  validateTeamRadarState,
  type TeamRadarSnapshot,
} from '../../shared/teamRadarState';

/** put された Blob をここに溜める (書き出しが保存する物そのもの)。 */
const saved: { mime: string; text: string }[] = [];

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({
    put: async (_svc: string, _name: string, mime: string, blob: Blob) => {
      saved.push({ mime, text: await blob.text() });
    },
    list: async () => [],
  }),
}));
vi.mock('../fs/fsa', () => ({
  isFsaSupported: () => false,
  loadFolderHandle: async () => null,
  writeBlobToFolder: async () => {},
  pickFolder: async () => null,
  ensurePermission: async () => 'granted',
  clearFolderHandle: async () => {},
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; data?: Record<string, unknown>; message?: string };
type Hub = { invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const AXES = ['技術', '実行', '協働', '育成', '構想'] as const;

/** 全員が 5 軸そろっている (描ける)。 */
const ALL_DRAWABLE = {
  department: '開発部',
  evaluatedAt: '2026-09-15',
  axes: [...AXES],
  members: [
    { id: 'm1', name: '青山 みどり', scores: [4, 5, 3, 4, 4] },
    { id: 'm2', name: '井川 はるき', scores: [3, 3, 5, 2, 4] },
  ],
};

/**
 * 2 人が未評価の軸を持つ (描けない)。
 *
 * `0` は範囲 1-5 の外なので `isPlottableScore` が落とす —— 下書きの
 * `finiteOrZero` が数でない入力を 0 に倒した形 (パス 190 の表の 2 行目)。
 */
const TWO_OMITTED = {
  department: '開発部',
  evaluatedAt: '2026-09-15',
  axes: [...AXES],
  members: [
    { id: 'm1', name: '青山 みどり', scores: [4, 5, 3, 4, 4] },
    { id: 'm2', name: '井川 はるき', scores: [3, 3, 5, 2, 4] },
    { id: 'm3', name: '宇野 かなで', scores: [4, 0, 3, 4, 4] },
    { id: 'm4', name: '江藤 そら', scores: [2, 3, 3, 0, 5] },
  ],
};

async function exportSvg(chart: unknown, title: string): Promise<string> {
  const hub = await loadHub();
  const r = await hub.invoke('teamradar', 'export-svg', { title, chart });
  expect(r.ok, r.message).toBe(true);
  const svg = saved.find((s) => s.mime === 'image/svg+xml');
  expect(svg, 'SVG がライブラリへ保存されていない').toBeDefined();
  return svg!.text;
}

beforeEach(() => {
  saved.length = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:x';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ブラウザ版の SVG 書き出し: 渡す物が両ビルドで同じ (パス 268)', () => {
  it('★ 標題・部署・評価時点・凡例が乗る (掻き取りでは 4 つとも落ちていた)', async () => {
    const svg = await exportSvg(ALL_DRAWABLE, 'チーム分析｜開発部 (2026-09-15)');
    expect(svg).toContain('チーム分析｜開発部 (2026-09-15)');
    expect(svg).toContain('部署: 開発部');
    expect(svg).toContain('評価時点: 2026-09-15');
    // 凡例 —— どの色が誰かは名前が無いと分からない
    expect(svg).toContain('青山 みどり');
    expect(svg).toContain('井川 はるき');
    // 図そのものも出ている (空の SVG に対して通る検査ではない)
    expect(svg).toContain('<polygon');
  });

  it('★ デスクトップ版と同じ 1 つの関数を通る (出力が 1 バイトも違わない)', async () => {
    const title = 'チーム分析｜開発部 (2026-09-15)';
    const browser = await exportSvg(ALL_DRAWABLE, title);
    const direct = renderTeamRadarSvg(
      buildTeamRadarSnapshot({ kind: 'saved', state: validateTeamRadarState(ALL_DRAWABLE) }),
      { title },
    );
    expect(browser).toBe(direct);
  });

  it('★ 未評価の軸を持つ人が居たら断る —— デスクトップ版と同じ検証を通る', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('teamradar', 'export-svg', {
      title: 'チーム分析',
      chart: TWO_OMITTED,
    });
    // 2026-09-15 まではここが ok:true で、その 2 人を落とした裸の図を渡していた。
    expect(r.ok).toBe(false);
    expect(r.message).toContain('score must be integer 1-5');
    expect(saved).toHaveLength(0);
  });

  it('対照: 全員評価済みなら同じ口が通る (「必ず断る」検査ではない)', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('teamradar', 'export-svg', {
      title: 'チーム分析',
      chart: ALL_DRAWABLE,
    });
    expect(r.ok, r.message).toBe(true);
  });

  it('形の判定はブラウザ版でも効く —— 壊れた chart は action_failed で断る', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('teamradar', 'export-svg', {
      title: 'x',
      chart: { department: '', evaluatedAt: 'not-a-date', members: 'nope' },
    });
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
  });

  it('chart が無ければ保存済みを読む (fetchSnapshot と同じ 1 つの読み手)', async () => {
    localStorage.setItem('teamradar.state', JSON.stringify(ALL_DRAWABLE));
    const svg = await exportSvg(undefined, 'チーム分析');
    expect(svg).toContain('部署: 開発部');
    expect(svg).toContain('青山 みどり');
    localStorage.removeItem('teamradar.state');
  });
});

/**
 * ⚠ の枝は **`renderTeamRadarSvg` の側では生きている** —— action の口からは
 * 上流の検証に阻まれて到達しないが、関数としての約束はここで留める。
 * 画面 (`TeamRadarPage`) は下書きの 0 をそのまま `planRadarPlot` に渡すので、
 * **画面の ⚠ は今日も出る** (`pages/__tests__` 側が留めている)。
 */
describe('renderTeamRadarSvg: 描けなかった人は図の中で名指しする (パス 41)', () => {
  /*
   * `TeamMember.scores` は `readonly number[]` なので、未評価の `null` を型どおりに
   * 置けない —— **描けない形は保存の検証が通さない**から (実測: `validateMembers` は
   * 5 軸すべて整数 1-5 を要求する)。`planRadarPlot` はそれでも `null` / 短い配列 /
   * 範囲外を落とす契約を持つので、ここは**その契約を直接**測る。
   * 型の穴は 1 か所に閉じ、欄は 1 つも省かない (`stored` を落とすと tsc が鳴る)。
   */
  const snapOf = (
    members: readonly { id: string; name: string; scores: readonly (number | null)[] }[],
  ): TeamRadarSnapshot => ({
    department: '開発部',
    evaluatedAt: '2026-09-15',
    axes: [...AXES],
    members: members as unknown as TeamRadarSnapshot['members'],
    isMock: false,
    fetchedAt: '2026-09-15T00:00:00.000Z',
    stored: 'saved',
    storedNote: null,
  });

  it('★ 未評価の軸を持つ 2 人を ⚠ つきで名指しし、多角形は描かない', () => {
    const svg = renderTeamRadarSvg(
      snapOf([
        { id: 'm1', name: '青山 みどり', scores: [4, 5, 3, 4, 4] },
        { id: 'm3', name: '宇野 かなで', scores: [4, null, 3, 4, 4] },
        { id: 'm4', name: '江藤 そら', scores: [2, 3, 3, null, 5] },
      ]),
      { title: 'チーム分析' },
    );
    expect(svg).toContain('⚠');
    expect(svg).toContain('宇野 かなで');
    expect(svg).toContain('江藤 そら');
    // 断りは <svg> の中に在る (画面では外側の <div> に在り、掻き取ると落ちていた)
    expect(svg.slice(svg.indexOf('<svg'), svg.lastIndexOf('</svg>'))).toContain('⚠');
    // 描けたのは 1 人だけ (多角形 1 つ)
    expect(svg.match(/<polygon[^>]*fill="rgba/g) ?? []).toHaveLength(1);
  });

  it('★ 対照: 全員描けるなら ⚠ は出ない (「⚠ を含む」が常に真の検査ではない)', () => {
    const svg = renderTeamRadarSvg(
      snapOf([
        { id: 'm1', name: '青山 みどり', scores: [4, 5, 3, 4, 4] },
        { id: 'm2', name: '井川 はるき', scores: [3, 3, 5, 2, 4] },
      ]),
      { title: 'チーム分析' },
    );
    expect(svg).not.toContain('⚠');
    expect(svg.match(/<polygon[^>]*fill="rgba/g) ?? []).toHaveLength(2);
  });
});
