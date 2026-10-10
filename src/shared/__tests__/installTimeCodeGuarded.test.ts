/**
 * **`npm ci` の時点で走るコードは、門の中に在る** (2026-09-21 · パス 371)。
 *
 * ## 見つけた物 (実測)
 *
 * `lint:deps` の規則 3 は「`npm ci` の時点で任意のコードが動くので危険度は高い」と
 * 正しく述べている。ところが見ていたのは lockfile の `hasInstallScript` ——
 * つまり**依存の側**だけで、**このリポジトリ自身の `package.json` の
 * lifecycle script** は誰も見ていなかった。
 *
 * 実測 (2026-09-21): 空の package.json に `postinstall` と `prepare` を置いて
 * `npm ci` を回すと**どちらも走った** (印のファイルが残る)。つまり 1 行足せば、
 * それは **CI の `npm ci`・`release.yml` の梱包ジョブ (署名鍵と `GH_TOKEN` を
 * env に持つ)・全員の手元**で走る。
 *
 * 対照 (同日実測): `"postinstall": "node -e …"` を足し、`.npmrc` に
 * `registry=https://evil.example/` を書いて回すと ——
 *
 * ```
 *   npm run verify:all (37 ゲート)   exit 0
 *   npm run chain:verify             exit 0
 * ```
 *
 * パス 370 (`.claude/settings.json` の hooks) と同じ法則
 * `config-that-picks-code-is-guarded` の **2 件目**である。
 *
 * ## ここが見る物
 *
 * 門の関数を借りて (`artifactCspCensus` / `sessionStartCodeGuarded` と同じ形)、
 * **実物**が規則 8 / 9 の下に居ることを毎回の `npm test` で留める。
 * `lint:deps` が CI から外れても鳴る。
 *
 * **`package.json` は整合性チェーンには入れない** —— 全履歴 12 コミットで
 * 「安定資産」の基準 (パス 347) を満たさない。門で形を見るのが正しい道具である。
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);

const gate = req('../../../scripts/lint-dependencies.cjs') as {
  checkOwnLifecycle: (pkg: unknown, ledger?: Record<string, string>) => string[];
  checkInstallConfigs: (present: readonly string[], ledger?: Record<string, string>) => string[];
  presentInstallConfigs: (root?: string) => string[];
  OWN_INSTALL_SCRIPTS: Record<string, string>;
  INSTALL_CONFIG_ALLOW: Record<string, string>;
  INSTALL_CONFIG_FILES: readonly string[];
  LIFECYCLE_KEYS: readonly string[];
};

const pkg = JSON.parse(readOriginalSource(join(REPO, 'package.json'))) as {
  scripts: Record<string, string>;
};

describe('npm ci の時点で走るコードは門の中に在る (パス 371)', () => {
  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(Object.keys(pkg.scripts).length, 'package.json の scripts を読めていない').toBeGreaterThan(50);
    expect(gate.LIFECYCLE_KEYS, 'npm ci が走らせる postinstall を見ていない').toContain('postinstall');
    expect(gate.LIFECYCLE_KEYS, 'npm ci が走らせる prepare を見ていない').toContain('prepare');
    expect(gate.INSTALL_CONFIG_FILES, '.npmrc を見ていない').toContain('.npmrc');
  });

  it('★ 実物の package.json は規則 8 を通る (lifecycle は台帳どおり)', () => {
    expect(gate.checkOwnLifecycle(pkg), '実物の lifecycle が台帳と合っていない').toEqual([]);
  });

  it('★ 実物のインストール時設定は規則 9 を通る', () => {
    expect(gate.checkInstallConfigs(gate.presentInstallConfigs()), '実物の設定が台帳と合っていない').toEqual([]);
  });

  it('★ 標本: postinstall を足すと鳴る (針が死んでいない)', () => {
    const planted = { ...pkg, scripts: { ...pkg.scripts, postinstall: 'node -e "1"' } };
    expect(gate.checkOwnLifecycle(planted).length, 'postinstall を見逃している').toBe(1);
    // lifecycle でない script は増えても鳴らない (針が広すぎない)。
    const benign = { ...pkg, scripts: { ...pkg.scripts, 'some:new:task': 'node x.cjs' } };
    expect(gate.checkOwnLifecycle(benign), '普通の script を lifecycle と数えている').toEqual([]);
  });

  it('★ 標本: .npmrc / .pnpmfile.cjs を置くと鳴る', () => {
    expect(gate.checkInstallConfigs(['.npmrc']).length, '.npmrc を見逃している').toBe(1);
    expect(gate.checkInstallConfigs(['.pnpmfile.cjs']).length, '.pnpmfile.cjs を見逃している').toBe(1);
  });

  it('★ 今日はどちらも 0 件である (この検査が守っている事実)', () => {
    const lifecycle = gate.LIFECYCLE_KEYS.filter((k) => Object.hasOwn(pkg.scripts, k));
    expect(lifecycle, 'lifecycle script が増えた — 台帳に理由を書くこと').toEqual([]);
    expect(gate.presentInstallConfigs(), 'インストール時設定が増えた — 台帳に理由を書くこと').toEqual([]);
  });
});
