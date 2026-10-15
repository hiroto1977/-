import { existsSync } from 'node:fs';
import { readOriginalSource } from './originalSource';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **門の本体は `scripts/` (所有者レビュー必須) に在り、`package.json` はそこを指すだけ**
 * (threat: T-040 · パス 520)。
 *
 * `lint:docs` は「`verify:all` の各門が `ci.yml` で走る」を見るが、**門が何を走らせるか**は
 * 見ていなかった。`package.json` は CODEOWNERS にも整合性チェーンにも無い (全履歴で動きすぎる
 * ので安定資産の基準を満たさない · パス 371) ので、マージされた PR が
 * `"lint:forbidden": "echo ok"` と書き換えても、`ci.yml` には `npm run lint:forbidden` の行が
 * 残り**全ゲートが緑のまま門だけが消える**。`scripts/` の木は CODEOWNERS が覆う (T-003 の延長)
 * ので、門の本体がそこを指している限り、骨抜きには所有者のレビューが要る。
 *
 * 規則: `verify:all` が並べる各門の script は、`node scripts/<実在する .cjs>` の連なり
 * (引数は `--self-test` など) か、名指しの 3 つ (typecheck / lint / test) の固定の綴り。
 */
const ROOT = path.resolve(__dirname, '../../..');
const pkg = JSON.parse(readOriginalSource(path.join(ROOT, 'package.json'))) as { scripts: Record<string, string> };
const scripts = pkg.scripts;
/** package.json の全体 (T-043 / T-072 がキーの不在を見る)。 */
const pkgAll = JSON.parse(readOriginalSource(path.join(ROOT, 'package.json'))) as Record<string, unknown>;

/** 綴りを固定する 3 つ (外部ツールを直接呼ぶ門)。 */
const FIXED: Readonly<Record<string, RegExp>> = {
  typecheck: /^tsc -b --noEmit --force$/,
  lint: /^eslint \. --max-warnings 0$/,
  test: /^vitest run$/,
};

/** `node scripts/x.cjs [args] && node scripts/y.cjs [args] …` の各段から script の道を取る。 */
function scriptPaths(command: string): string[] | null {
  const out: string[] = [];
  for (const seg of command.split('&&').map((s) => s.trim())) {
    const m = /^node (scripts\/[\w./-]+\.cjs)(?: [^&]*)?$/.exec(seg);
    if (m === null) return null;
    out.push(m[1]!);
  }
  return out;
}

const gates = scripts['verify:all']!.split('&&').map((s) => s.trim().replace(/^npm run /, ''));

describe('verify:all の門の本体は scripts/ を指す (threat: T-040)', () => {
  it('走査が空虚でない (門は 30 以上・test も見る)', () => {
    expect(gates.length).toBeGreaterThan(30);
    expect(scripts['test']).toBeDefined();
  });

  it.each([...gates, 'test'])('★ %s の本体は scripts/ の実在する .cjs か、固定の綴り (threat: T-040)', (gate) => {
    const command = scripts[gate];
    expect(command, `${gate} が package.json に無い`).toBeDefined();
    const fixed = FIXED[gate];
    if (fixed !== undefined) {
      expect(command).toMatch(fixed);
      return;
    }
    const paths = scriptPaths(command!);
    expect(paths, `${gate} = "${command}" は node scripts/<file>.cjs の連なりではない`).not.toBeNull();
    expect(paths!.length).toBeGreaterThan(0);
    for (const p of paths!) expect(existsSync(path.join(ROOT, p)), `${gate}: ${p} が無い`).toBe(true);
  });

  it('対照: 門の本体を echo に替えた綴りは通らない (針が実物の形に当たる)', () => {
    expect(scriptPaths('echo ok')).toBeNull();
    expect(scriptPaths('node scripts/lint-forbidden-patterns.cjs && true')).toBeNull();
    expect(scriptPaths('node /tmp/evil.cjs')).toBeNull();
    expect(scriptPaths('node scripts/lint-forbidden-patterns.cjs && node scripts/lint-forbidden-patterns.cjs --self-test')).toEqual([
      'scripts/lint-forbidden-patterns.cjs',
      'scripts/lint-forbidden-patterns.cjs',
    ]);
    expect('tsc -b --noEmit').not.toMatch(FIXED['typecheck']!);
    expect('vitest run --passWithNoTests').not.toMatch(FIXED['test']!);
  });

  it('scripts/ の木は CODEOWNERS が覆う (門の本体の書き換えには所有者のレビューが要る)', () => {
    const owners = readOriginalSource(path.join(ROOT, '.github/CODEOWNERS'));
    expect(owners).toMatch(/^\/scripts\/ @[\w-]+$/m);
  });
});

/*
 * **署名鍵の下で走る `build` の本体と、builder の設定の在り処** (threat: T-043 · パス 521)。
 *
 * `release.yml` の Build ステップは `npm run build -- --publish never` を `CSC_LINK` /
 * `CSC_KEY_PASSWORD` / `APPLE_*` の env で走らせる。T-040 が留めたのは `verify:all` の門と
 * `test` だけで、**`build` の本体は誰も読んでいなかった** —— `package.json` は CODEOWNERS にも
 * 鎖にも無いので、`"build": "tsc -b && vite build && electron-builder && node -e …"` と足す PR は
 * 所有者のレビュー無しで入り、署名鍵を持つ環境で任意のシェルが走る (`lint:deps` の規則 8 は
 * `prebuild` / `postbuild` の自動発火フックしか見ず、`lint:malware` の母集団に `package.json` は
 * 無い —— AI 監査の再現で 4 門とも exit 0)。
 *
 * もう 1 つ: electron-builder は設定を **`package.json` の `build` キーから先に**読む
 * (`app-builder-lib/out/util/config/load.js` —— `packageMetadata["build"]` が在れば
 * `electron-builder.json` を**読まない**・実測)。鎖と CODEOWNERS で守った `electron-builder.json`
 * (`electronFuses` の `runAsNode: false` ほか) は、`package.json` に `"build": {…}` を足すだけで
 * **ハッシュが合ったまま死ぬ**。だから `build` キーが無いことも同じ検査で留める。
 */
describe('署名ビルドの本体と builder 設定の在り処 (threat: T-043)', () => {

  it('★ scripts.build は固定の綴り (release が署名鍵で走らせる唯一の script) (threat: T-043)', () => {
    // `--config electron-builder.json` は T-070 —— 名指ししないと app-builder-lib は
    // `electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}` をこの順に探し、最初に在った物を読む。
    expect(scripts['build']).toMatch(/^tsc -b && vite build && electron-builder --config electron-builder\.json$/);
    // 標本: 末尾に 1 手足した綴りは通らない。
    expect('tsc -b && vite build && electron-builder --config electron-builder.json && node -e "1"').not.toMatch(/^tsc -b && vite build && electron-builder --config electron-builder\.json$/);
  });

  it('★ package.json に build キーが無い —— electron-builder.json (鎖の保護対象) が唯一の設定 (threat: T-043)', () => {
    expect(Object.hasOwn(pkgAll, 'build')).toBe(false);
    expect(existsSync(path.join(ROOT, 'electron-builder.json'))).toBe(true);
    // 根拠 (実測): app-builder-lib は package.json の `build` を先に読み、在れば設定ファイルを探さない。
    const load = readOriginalSource(path.join(ROOT, 'node_modules/app-builder-lib/out/util/config/load.js'));
    expect(load).toMatch(/packageMetadata\[request\.packageKey\]/);
    expect(load).toMatch(/data == null \? findAndReadConfig\(request\)/);
  });

  it('release.yml が署名鍵の env で走らせる npm script は build だけ', () => {
    const rel = readOriginalSource(path.join(ROOT, '.github/workflows/release.yml'));
    const start = rel.indexOf('- name: Build');
    const buildStep = rel.slice(start, rel.indexOf('CSC_LINK', start));
    const runs = [...buildStep.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
    expect(new Set(runs)).toEqual(new Set(['build']));
    expect(buildStep).toMatch(/--publish never/);
  });
});

/*
 * **builder の設定を隣の綴りで影にできない (2026-10-15 · パス 523 · threat: T-070)。**
 *
 * app-builder-lib の `findAndReadConfig` は `electron-builder.yml` → `.yaml` → `.json` → `.json5` →
 * `.toml` → `.js` → `.cjs` → `.ts` の順に探し、**最初に在った物**を読む (実測: 2 行の `.yml` を
 * 置くと `appId` がそちらになり、鎖と CODEOWNERS で守った `.json` の `electronFuses` は消えて
 * Electron の既定へ戻った —— `chain:verify` は緑のまま)。T-043 は `package.json#build` だけを
 * 塞いでいた。`scripts.build` が `--config electron-builder.json` を名指しし (上の検査)、
 * 影になる綴りが 1 つも無いことをここで留める。
 */
describe('builder 設定の影 (threat: T-070)', () => {
  it('★ electron-builder.json の隣に、先に読まれる綴りの設定が 1 つも無い (threat: T-070)', () => {
    const shadows = ['yml', 'yaml', 'json5', 'toml', 'js', 'cjs', 'ts'].map((ext) => `electron-builder.${ext}`);
    const present = shadows.filter((name) => existsSync(path.join(ROOT, name)));
    expect(present, 'builder の設定は electron-builder.json ただ 1 つ (鎖と CODEOWNERS の保護対象)').toEqual([]);
    expect(existsSync(path.join(ROOT, 'electron-builder.json'))).toBe(true);
  });
});

/*
 * **PostCSS の設定ファイルは vite が探さない・1 本も無い (2026-10-15 · パス 523 · threat: T-072)。**
 *
 * vite は `css.postcss` がオブジェクトでないとき postcss-load-config で `postcss.config.{js,cjs,mjs,ts}` /
 * `.postcssrc*` / `package.json#postcss` を探し、**見つけた物を require して走らせる**。直下に
 * `postcss.config.cjs` を 1 本置くだけで `vite build` (= release.yml の署名鍵を持つ Build・pages.yml・
 * ci.yml) がそれを実行した (実測: 印が 1 度刷られ exit 0)。`vite.config.ts` 自身は鎖の保護対象だが、
 * PostCSS の設定はどの門も見ていなかった。
 */
describe('PostCSS の設定は探さない・無い (threat: T-072)', () => {
  const viteConfig = readOriginalSource(path.join(ROOT, 'vite.config.ts'));

  it('★ vite.config.ts は css.postcss をオブジェクトで固定する (探索を止める) (threat: T-072)', () => {
    expect(viteConfig).toMatch(/css:\s*\{\s*postcss:\s*\{\s*\}\s*\}/);
    // renderer + main + preload の 3 つの vite 設定すべてに在る (電子側の束ねは別の設定で走るので、
    // renderer 側だけだと postcss.config.cjs を読んだ —— 実測)。
    expect(viteConfig.match(/css:\s*\{\s*postcss:\s*\{\s*\}\s*\}/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // 標本: 探索を止めない形 (文字列 = 探索する root / 未指定) には当たらない。
    expect("css: { postcss: './' }").not.toMatch(/css:\s*\{\s*postcss:\s*\{\s*\}\s*\}/);
  });

  it('★ 直下に PostCSS の設定ファイルが 1 本も無く、package.json にも postcss キーが無い (threat: T-072)', () => {
    const names = [
      'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs', 'postcss.config.ts',
      '.postcssrc', '.postcssrc.json', '.postcssrc.yaml', '.postcssrc.yml', '.postcssrc.js', '.postcssrc.cjs', '.postcssrc.mjs', '.postcssrc.ts',
    ];
    expect(names.filter((n) => existsSync(path.join(ROOT, n)))).toEqual([]);
    expect(Object.hasOwn(pkgAll, 'postcss')).toBe(false);
  });
});
