import { describe, expect, it, vi } from 'vitest';

/**
 * **テンプレート表は 2 つある。突き合わせる者が居なかった。**
 *
 * ```
 *   main/clients/templates.ts   TEMPLATE_CATALOG          ← デスクトップ版
 *   renderer/web-templates.ts   TEMPLATE_CATALOG_FOR_WEB  ← ブラウザ版
 * ```
 *
 * 同じ id で同じ成果物を出すはずの表が別々に手で保たれていて、
 * **突き合わせる検査が無かった** (2026-08-30 実測。`templateParamsParity`
 * は `validateParams` の振る舞いを見ており、表そのものは見ていない)。
 * ずれれば、同じテンプレートがデスクトップとブラウザで**違う寸法・違う
 * 既定文言**で出る。
 *
 * ## 2 つの表の正しい関係 (実測して直した)
 *
 * ```
 *   web  : id, width, height, defaults
 *   main : id, width, height, defaults + label, description
 * ```
 *
 * **完全に同じではない。** main だけが画面表示用の `label` /
 * `description` を持つ。共通の 4 項目は**完全に一致していた**。
 *
 * 最初「完全に一致」と書いた。**照合が片側だけだったため**である ——
 * web の項目を回して main と比べており、**main にしか無い項目を見ていな
 * かった**。deep-equal に変えた瞬間に落ちて分かった。
 * 片側からの照合は「相手にしか無い物」を構造的に見つけられない。
 *
 * ## なぜ読み直すのか
 *
 * どちらもモジュール直下の配列リテラルで、**読み込み時に 1 度だけ評価される**。
 * 静的 import のままだと変異が有効になる前に評価が済んでおり、
 * `web-templates.ts` では **73 件すべてが生存**していた (71.71%)。
 * 既存の `web-templates.test.ts` は id を字面で留めているのに、
 * **その検査でも殺せていなかった**のはこのためである。
 *
 * 本 PR で 5 度目の同じ手当て (`MEMBER_ID_RE` / `preload` の橋 /
 * `INTERNAL_TLDS` / `EMPTY_TALENT_STATE` / ここ)。
 *
 * ## 何を留めて、何を留めないか
 *
 * - **寸法**は字面で留める。間違えば成果物が壊れるし、両方を同時に
 *   書き換えられても鳴る (パリティ検査は「両方に在る穴」を見つけられない ——
 *   SESSION_HANDOFF 0-a-16)
 * - **既定の文言**は字面で留めない。`山田 太郎` / `Acme Corp.` のような
 *   **見本のための placeholder** であって、社内基準として配る文言ではない。
 *   60 行の見本文を検査に写しても、読む人の目を滑らせるだけで何も守らない
 *   (`checksum-release.cjs` の `INTERMEDIATE` で同じ判断をしている)。
 *   こちらはパリティが守る —— 片方だけ変われば鳴る。
 */

interface TemplateLike {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly defaults: Record<string, unknown>;
}

/** 表は**読み直して**取る。静的 import では変異が届かない。 */
async function freshWeb(): Promise<readonly TemplateLike[]> {
  vi.resetModules();
  const m = await import('../../renderer/web-templates');
  return m.TEMPLATE_CATALOG_FOR_WEB as unknown as readonly TemplateLike[];
}

async function freshMain(): Promise<readonly TemplateLike[]> {
  vi.resetModules();
  const m = await import('../../main/clients/templates');
  return m.TEMPLATE_CATALOG as unknown as readonly TemplateLike[];
}

/** 実測した時点の寸法。**成果物の大きさそのもの**なので字面で留める。 */
const DIMENSIONS: readonly [string, number, number][] = [
  ['presentation-cover', 1920, 1080],
  ['business-card', 1075, 650],
  ['social-square', 1080, 1080],
  ['social-story', 1080, 1920],
  ['flyer-a4', 1240, 1754],
  ['certificate', 1754, 1240],
  ['invoice-header', 1240, 350],
  ['resume-header', 1240, 600],
];

describe('テンプレート表 — 2 つの版が一致すること', () => {
  /** 共通の 4 項目だけを取り出す。main はこれに表示用の 2 項目を足して持つ。 */
  const shared = (t: TemplateLike) => ({
    id: t.id,
    width: t.width,
    height: t.height,
    defaults: t.defaults,
  });

  it('★ 共通項目 (id/寸法/既定値) が両版で完全に一致する', async () => {
    const web = await freshWeb();
    const main = await freshMain();
    expect(web.map(shared)).toEqual(main.map(shared));
  });

  /*
   * **項目の集合そのものを両側から留める。** 最初この検査を全体の
   * deep-equal で書いて落ちた —— main だけが `label` / `description` を
   * 持つのに、片側からの照合ではそれが見えていなかった。
   * 「相手にしか無い物」は、両方向を見ないと見つからない。
   */
  it('★ 項目の集合 —— web は 4 つ、main はそれに表示用の 2 つを足す', async () => {
    const web = await freshWeb();
    const main = await freshMain();
    for (const t of web) {
      expect(Object.keys(t).sort(), t.id).toEqual(['defaults', 'height', 'id', 'width']);
    }
    for (const t of main) {
      expect(Object.keys(t).sort(), t.id).toEqual([
        'defaults',
        'description',
        'height',
        'id',
        'label',
        'width',
      ]);
    }
  });

  it('★ main だけが持つ表示用の文言は空でない', async () => {
    const main = await freshMain();
    for (const t of main as readonly (TemplateLike & { label: string; description: string })[]) {
      expect(t.label.length, t.id).toBeGreaterThan(0);
      expect(t.description.length, t.id).toBeGreaterThan(0);
    }
  });

  it('★ 件数と並び順が両方で同じ', async () => {
    const web = await freshWeb();
    const main = await freshMain();
    expect(web.map((t) => t.id)).toEqual(main.map((t) => t.id));
    expect(web).toHaveLength(DIMENSIONS.length);
  });

  it('★ 寸法を字面で留める (ブラウザ版)', async () => {
    const web = await freshWeb();
    expect(web.map((t) => [t.id, t.width, t.height])).toEqual(
      DIMENSIONS.map(([id, w, h]) => [id, w, h]),
    );
  });

  /*
   * **両方を同時に書き換えられた場合の備え。** パリティだけでは
   * 「両方に在る穴」が見つからないので、デスクトップ版にも同じ字面を当てる。
   */
  it('★ 寸法を字面で留める (デスクトップ版)', async () => {
    const main = await freshMain();
    expect(main.map((t) => [t.id, t.width, t.height])).toEqual(
      DIMENSIONS.map(([id, w, h]) => [id, w, h]),
    );
  });

  /*
   * 既定値の**鍵の集合**は留める (文面は留めない —— 上の注記の通り)。
   * 鍵が減れば描画側が `undefined` を埋め込むので、そこは見ておく。
   */
  it('★ 既定値の項目が両版で揃っている', async () => {
    const web = await freshWeb();
    for (const t of web) {
      expect(Object.keys(t.defaults).sort(), t.id).toEqual([
        'accentColor',
        'body',
        'brandText',
        'secondaryColor',
        'subtitle',
        'title',
      ]);
    }
  });
});
