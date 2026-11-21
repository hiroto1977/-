/**
 * **ゲートの床の台帳 —— 形は毎回の `npm test` が見る** (2026-09-25 · パス 468)。
 *
 * ## 何を測ったのか
 *
 * 「`verify:all` の 37 ゲートのうち、走査した件数を成功行に刷るのは何本で、
 * そのうち母集団が空になったとき exit 1 になるのは何本か」——
 * 綴りでは測れない。床の効き方は実測で **7 通り**あった:
 *
 * ```
 *   MIN_* の定数           lint:regex / lint:charset / lint:deps ほか
 *   台帳の双方向           lint:mcp-servers / lint:mutation-scope / lint:rate-freshness
 *   名指しの走査           lint:forbidden (MUST_SCAN)
 *   生成物の byte 一致     verify:graph / vault:check
 *   正典の値が計算不能     lint:docs
 *   保護対象の不一致       chain:verify
 *   副作用としての床       lint:data-origin (宣言 0 件なら 76 件すべて鳴る)
 * ```
 *
 * だから `npm run audit:gate-floors` が**空にして走らせる**。2026-09-25 の実測:
 *
 * | 測った物 | 実測 |
 * | --- | --- |
 * | 空にする母集団を持つゲート | **33 / 37** |
 * | 直す前に母集団を空にしても exit 0 だったゲート | **5** |
 * | 直した後 | **0** (33 / 33 が鳴る) |
 *
 * 黙っていた 5 本: `lint:url-encoding` (「Scanned 0 file(s)」)・`lint:sample-data`
 * (「ソース・スクリプト 0 ファイル」)・`lint:collection-time` (「Scanned 0
 * mutate-listed file(s)」)・`lint:test-coverage` (「Checked 0 services」)・
 * **`verify:knowledge`** —— 最後のがいちばん重い: コーパスの 85% (academic 3,417 件) が
 * 母集団から丸ごと消えても「確証ゲート検証: 622 項目」と刷って ✅ で通った。
 * 出典を確かめるのが仕事のゲートが、確かめる物が消えたことに黙っていた。
 *
 * ★ **2026-09-05 の注記は母集団を 2 本と書いていた** —— `lint:imports` の中の
 * 「走査数を表示するだけで床の無いゲートをここと lint:regex に見つけた」。
 * その日の掃除は 2 本を直したが、**何本在るかは数えていなかった**。
 *
 * ## ここが見る物
 *
 * 道具は走らせない (ソースを書き換えるので CI に置かない)。ここが見るのは**台帳の形**:
 *
 *   1. RECIPES ∪ NO_POPULATION が `verify:all` のゲートとちょうど一致する (双方向)
 *   2. `kind` は道具の docblock が説明している語だけ
 *   3. **針が実物に当たる** —— 綴りが変わったら `npm test` が鳴る
 *      (当たらないと道具は `not-emptied` を出すが、CI では走らないので誰も見ない)
 *   4. 「空にできなかった」を「床が在る」と混ぜない (道具自身の `count-has-floor`)
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);
const AUDIT = 'scripts/audit-gate-floors.cjs';

interface Recipe {
  readonly gate: string;
  readonly kind: string;
  readonly cmd: string;
  readonly expect: string;
  readonly why: string;
  readonly recipe: { readonly file?: string; readonly needle?: string; readonly rmdir?: string };
}
const tool = req(`../../../${AUDIT}`) as {
  RECIPES: readonly Recipe[];
  NO_POPULATION: Readonly<Record<string, string>>;
  KINDS: Set<string>;
  applyRecipe: (wt: string, recipe: unknown) => void;
};

const pkg = JSON.parse(readOriginalSource(join(REPO, 'package.json'))) as {
  scripts: Record<string, string>;
};
const verifyAllGates = (pkg.scripts['verify:all'] ?? '')
  .split('&&')
  .map((x) => x.trim().replace(/^npm run /, ''))
  .filter(Boolean);

describe('ゲートの床の台帳 (パス 468)', () => {
  it('★ 母集団を package.json から導けている (空の走査で通っていない)', () => {
    expect(verifyAllGates.length, 'verify:all のゲートを読めていない').toBeGreaterThanOrEqual(30);
    expect(tool.RECIPES.length, '台帳が空').toBeGreaterThanOrEqual(25);
    expect(Object.keys(tool.NO_POPULATION).length, '免除の台帳が空').toBeGreaterThanOrEqual(1);
  });

  it('★ RECIPES ∪ NO_POPULATION が verify:all のゲートとちょうど一致する (双方向)', () => {
    const covered = [...tool.RECIPES.map((r) => r.gate), ...Object.keys(tool.NO_POPULATION)].sort();
    expect(covered, 'ゲートの一覧と台帳が食い違う').toEqual([...verifyAllGates].sort());
  });

  it('★ 同じゲートが両方の台帳に居ない', () => {
    for (const r of tool.RECIPES) {
      expect(Object.hasOwn(tool.NO_POPULATION, r.gate), `${r.gate} が RECIPES と NO_POPULATION の両方に居る`).toBe(false);
    }
  });

  it('★ kind は既知の語で、道具の docblock がその語を説明している', () => {
    const audit = readOriginalSource(join(REPO, AUDIT));
    for (const r of tool.RECIPES) {
      expect([...tool.KINDS], `${r.gate}: ${r.kind}`).toContain(r.kind);
    }
    for (const k of tool.KINDS) {
      expect(audit.includes(k), `docblock が ${k} を説明していない`).toBe(true);
    }
    const used = new Set(tool.RECIPES.map((r) => r.kind));
    expect([...tool.KINDS].filter((k) => !used.has(k)), '説明だけ在って 1 行も使っていない kind').toEqual([]);
  });

  it('★ 針が実物に当たる (綴りが変わったらここが鳴る —— 道具は CI で走らない)', () => {
    for (const r of tool.RECIPES) {
      if (r.recipe.rmdir) {
        expect(existsSync(join(REPO, r.recipe.rmdir)), `${r.gate}: ${r.recipe.rmdir} が無い`).toBe(true);
        continue;
      }
      expect(r.recipe.file, `${r.gate}: 手にファイルが無い`).toBeTruthy();
      expect(r.recipe.needle, `${r.gate}: 手に針が無い`).toBeTruthy();
      const src = readOriginalSource(join(REPO, r.recipe.file!));
      expect(
        src.includes(r.recipe.needle!),
        `${r.gate}: 針 ${JSON.stringify(r.recipe.needle)} が ${r.recipe.file} に当たらない`,
      ).toBe(true);
    }
  });

  it('★ 台帳の行はどれも「なぜ鳴るか」を書いている (MIN_* を探して見つからず「床が無い」と誤読しないため)', () => {
    for (const r of tool.RECIPES) {
      expect(r.why.trim().length, `${r.gate}: why が短すぎる`).toBeGreaterThanOrEqual(8);
      expect(r.expect, `${r.gate}: expect は rings だけ`).toBe('rings');
      expect(r.cmd.startsWith('node scripts/'), `${r.gate}: cmd が実物のゲートを指していない`).toBe(true);
    }
    for (const [gate, why] of Object.entries(tool.NO_POPULATION)) {
      expect(why.trim().length, `${gate}: 免除の理由が短すぎる`).toBeGreaterThanOrEqual(10);
    }
  });

  it('★ 「空にできなかった」を「床が在る」と混ぜない (道具自身の count-has-floor)', () => {
    // 針が当たらない手は投げる。
    expect(() => tool.applyRecipe(REPO, { file: 'package.json', needle: 'NO-SUCH-NEEDLE', edit: (s: string) => s }))
      .toThrow(/針/);
    // 1 文字も変わらない手も投げる (書き換えたつもりで何もしていない形)。
    expect(() => tool.applyRecipe(REPO, { file: 'package.json', needle: 'scripts', edit: (s: string) => s }))
      .toThrow(/1 文字も/);
  });

  it('★ 道具は verify:all に入っていない (判定のためにソースを書き換えるので CI では走らせない)', () => {
    expect(pkg.scripts['audit:gate-floors'], '道具が登録されていない').toBeTruthy();
    expect(pkg.scripts['verify:all'] ?? '', 'verify:all に入っている').not.toContain('audit:gate-floors');
    expect(pkg.scripts['audit:gate-floors'] ?? '', '--self-test を走らせていない').toContain('--self-test');
  });

  it('★ パス 468 で足した床は 5 本 —— その 5 本が台帳に在って理由を名乗る', () => {
    const fixed = ['lint:url-encoding', 'lint:sample-data', 'lint:collection-time', 'lint:test-coverage', 'verify:knowledge'];
    for (const gate of fixed) {
      const row = tool.RECIPES.find((r) => r.gate === gate);
      expect(row, `${gate} が台帳に無い`).toBeTruthy();
      expect(row!.why, `${gate}: パス 468 で足したことが理由に無い`).toContain('パス 468');
    }
  });
});
