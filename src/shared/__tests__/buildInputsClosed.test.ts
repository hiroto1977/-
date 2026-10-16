import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **ビルド・梱包・インストールが「勝手に拾う入力」を閉じる** (パス 526 · supply-chain の狩り)。
 *
 * どれも「コードではなくデータ」なので `lint:malware` / `lint:forbidden` に映らず、CODEOWNERS にも無かった。
 * 追跡されたファイル 1 つ・lockfile の 1 行・設定の 1 つで、署名鍵を env に持つ release.yml の Build や、
 * 全 workflow の `npm ci` に届く。実物は今日すべて 0 件 (偽陽性は無い)。
 *
 *   T-105 electron-builder は cwd の `electron-builder.env` を無条件に読み、process.env に無い鍵
 *         (ELECTRON_MIRROR / HTTPS_PROXY / WIN_CSC_* ほか) を注入する。細工した Electron 本体が所有者の証明書で署名されうる。
 *   T-106 `build/` に置いたファイルを electron-builder が自動採用する (`installer.nsh` はビルド時に走り、
 *         署名済みインストーラの一部として全 Windows 端末で走る・`entitlements.mac.plist` は公証される権限を決める)。
 *   T-107 `workspaces` / `file:` 依存は `npm ci` で lifecycle script を走らせるが、lint:deps の規則 3・8 には映らない。
 *   T-108 lockfile の `resolved` は「registry.npmjs.org で始まるか」しか見ていなかった。別 package の tarball へ
 *         差し替えても (名前 ↔ tarball の対応が崩れても) 全門が緑。
 *   T-109 `.gitignore` 済みの `release/` へ force-add した物が、公式 Release に載る。
 *   T-110 `eslint.config.*` が入れ子で置かれると ESLint 10 が読み、そのコードが走り、その部分木の規則が消える。
 *   T-111 `stryker.conf.*` が `stryker.config.json` を影にして `thresholds.break` を 0 にできる。
 */
const ROOT = path.resolve(__dirname, '../../..');
const git = (...args: string[]): string[] =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((l) => l !== '');
const tracked = git('ls-files');
const src = (rel: string): string => readOriginalSource(path.join(ROOT, rel));
const pkg = JSON.parse(src('package.json')) as Record<string, unknown> & {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
type LockEntry = { resolved?: string; link?: boolean; name?: string };
const lock = JSON.parse(src('package-lock.json')) as { packages: Record<string, LockEntry> };

describe('勝手に拾われる入力を追跡しない (threat: T-105 / T-106 / T-109)', () => {
  it('★ electron-builder.env と root の .env* (例示を除く) は追跡されない (threat: T-105)', () => {
    const bad = tracked.filter((f) => /(^|\/)electron-builder\.env$/.test(f) || (/^\.env/.test(f) && !/\.example$/.test(f)));
    expect(bad).toEqual([]);
    // 標本: 針が的に当たる (例示は許し、本物の名前は拾う)。
    const pick = (f: string) => /(^|\/)electron-builder\.env$/.test(f) || (/^\.env/.test(f) && !/\.example$/.test(f));
    expect(['electron-builder.env', '.env', '.env.local', 'sub/electron-builder.env'].every(pick)).toBe(true);
    expect(pick('.env.mcp.example')).toBe(false);
    expect(src('.gitignore')).toMatch(/^electron-builder\.env$/m);
  });

  it('★ build/ の追跡ファイルはアイコン 2 本だけ (installer.nsh・plist・NSIS プラグインを置けない) (threat: T-106)', () => {
    expect(tracked.filter((f) => f.startsWith('build/')).sort()).toEqual(['build/icon.png', 'build/icon.svg']);
    expect(src('.github/CODEOWNERS')).toMatch(/^\/build\/ @hiroto1977$/m);
  });

  it('★ .gitignore 済みなのに追跡されている物は無い (release/ への force-add を含む) (threat: T-109)', () => {
    expect(git('ls-files', '-ci', '--exclude-standard')).toEqual([]);
  });
});

describe('インストール時に走るコードの入口を閉じる (threat: T-107 / T-108)', () => {
  it('★ workspaces が無く、依存の指定は semver だけ (file: / link: / git / http / npm: を持ち込めない) (threat: T-107)', () => {
    expect('workspaces' in pkg).toBe(false);
    const specs = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
    const odd = Object.entries(specs).filter(([, s]) => !/^[\^~]?\d+\.\d+\.\d+(-[\w.]+)?$/.test(s));
    expect(odd).toEqual([]);
    expect(Object.keys(specs).length).toBeGreaterThan(20); // 走査が空虚でない
    // 標本: 針は危ない綴りを拾う。
    const isSemver = (s: string) => /^[\^~]?\d+\.\d+\.\d+(-[\w.]+)?$/.test(s);
    for (const bad of ['file:vendor/x', 'link:../x', 'git+https://x/y.git', 'https://x/y.tgz', 'npm:other@1.0.0', '*', 'latest']) expect(isSemver(bad), bad).toBe(false);
    expect(isSemver('^1.2.3')).toBe(true);
    expect(Object.values(lock.packages).filter((e) => e.link === true)).toEqual([]);
  });

  it('★ lockfile の各行は、名前の package の tarball を指す (別 package への差し替えを許さない) (threat: T-108)', () => {
    const mismatch = (key: string, e: LockEntry): boolean => {
      if (key === '' || e.resolved === undefined) return false;
      const name = e.name ?? key.split('node_modules/').pop()!;
      return !new URL(e.resolved).pathname.startsWith(`/${name}/-/`);
    };
    const rows = Object.entries(lock.packages);
    expect(rows.length).toBeGreaterThan(400);
    expect(rows.filter(([k, e]) => mismatch(k, e)).map(([k]) => k)).toEqual([]);
    // 標本: fast-check の行を ms の tarball へ替えた形 (報告の再現そのもの) は拾う・本物は拾わない。
    expect(mismatch('node_modules/fast-check', { resolved: 'https://registry.npmjs.org/ms/-/ms-2.1.3.tgz' })).toBe(true);
    expect(mismatch('node_modules/@scope/pkg', { resolved: 'https://registry.npmjs.org/@scope/pkg/-/pkg-1.0.0.tgz' })).toBe(false);
  });
});

describe('設定の探索を固定する (threat: T-110 / T-111)', () => {
  it('★ lint は ESLint の設定ファイルを明示し、入れ子の設定を読ませない (threat: T-110)', () => {
    expect(pkg.scripts['lint']).toBe('eslint --config eslint.config.js . --max-warnings 0');
    expect(tracked.filter((f) => /(^|\/)eslint\.config\.[cm]?[jt]s$/.test(f))).toEqual(['eslint.config.js']);
  });

  it('★ Stryker は設定ファイルを明示し、stryker.conf.* で影にされない (threat: T-111)', () => {
    expect(tracked.filter((f) => /(^|\/)stryker\.conf\.[\w]+$/.test(f))).toEqual([]);
    const yml = src('.github/workflows/mutation.yml');
    const runs = yml.split('\n').filter((l) => /npx stryker run/.test(l));
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (const l of runs) expect(l, l).toContain('--configFile stryker.config.json');
  });
});
