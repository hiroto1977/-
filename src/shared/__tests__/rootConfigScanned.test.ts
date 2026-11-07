import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * **リポジトリ直下の設定も走査と封緘の中に在る** (2026-09-20 · パス 347)。
 *
 * `lint:forbidden` の `SCAN_ROOTS` は**ディレクトリの一覧**なので、
 * リポジトリ直下のファイルはどの根にも入らない。2026-09-20 まで 3 本が外に居た:
 *
 * ```
 *   vite.config.ts     出荷 HTML の中身を決める (plugin・define・inline)
 *   vitest.config.ts   検査の走り方を決める (環境・除外・カバレッジ)
 *   eslint.config.js   lint の規則を決める
 * ```
 *
 * 対照 (実測): `vite.config.ts` に `eval(` を植えると `lint:forbidden` /
 * `lint:imports` / `lint:network-targets` / `chain:verify` が**すべて exit 0**。
 * **梱包設定 `electron-builder.json` は 2026-08 から鎖の保護対象なのに、
 * 束ねる側の設定は走査も封緘もされていなかった。**
 *
 * 根を `'.'` にはしない —— 木全体 (`knowledge-vault/` 7,000 本ほか) を歩くことになる。
 * 単体の名前で数えるほうが、**増えたときに気付ける**側でもある。
 */
const req = createRequire(import.meta.url);
const REPO_ROOT = join(__dirname, '../../..');

const forbidden = req('../../../scripts/lint-forbidden-patterns.cjs') as {
  SCAN_FILES: string[];
  MUST_SCAN: string[];
  SCAN_ROOTS: { dir: string; min: number }[];
  rootCodeFiles: (tracked?: string[] | null, opts?: { requireExists?: boolean }) => string[];
  isWalkedSourceName: (name: string) => boolean;
};

const malware = req('../../../scripts/lint-malware.cjs') as {
  isScannedPath: (f: string) => boolean;
};

/** 追跡されている「リポジトリ直下のコード」を git から数える。 */
function rootLevelCode(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return [...new Set(out.split('\n').filter(Boolean))]
    .filter((f) => !f.includes('/'))
    .filter((f) => /\.(tsx?|(?:c|m)?js)$/.test(f))
    .sort();
}

describe('リポジトリ直下の設定 (パス 347 → 514)', () => {
  it('★ 直下の追跡コードは全部走査される (両方向・動的 —— 固定リストでない)', () => {
    // パス 514 (T-016): 走査する直下の集合は `rootCodeFiles()` が git ls-files から
    // 導く。固定の SCAN_FILES ではないので、新しく足した直下の .cjs も必ず入る。
    expect([...forbidden.rootCodeFiles()].sort()).toEqual(rootLevelCode());
  });

  it('★ SCAN_FILES (名前の錨) は走査される直下コードの部分集合', () => {
    // SCAN_FILES は「名前で在ることを確かめる」錨 (MUST_SCAN) 兼 git 無し環境の fallback。
    // 走査の母集団そのものは rootCodeFiles() —— SCAN_FILES はその中に居なければならない。
    const scanned = new Set(forbidden.rootCodeFiles());
    for (const f of forbidden.SCAN_FILES) expect(scanned, f).toContain(f);
  });

  it('★ SCAN_ROOTS はディレクトリだけなので、直下は原理的に入らない', () => {
    // 「なぜ別立てなのか」を留める —— 根の一覧に `.` が生えたら気付く。
    for (const r of forbidden.SCAN_ROOTS) expect(r.dir).not.toBe('.');
    expect(forbidden.SCAN_ROOTS.map((r) => r.dir)).toContain('src');
  });

  it('★ SCAN_FILES は名前でも留める (歩き忘れを別に捕まえる)', () => {
    for (const f of forbidden.SCAN_FILES) expect(forbidden.MUST_SCAN).toContain(f);
    expect(forbidden.MUST_SCAN).toContain('assets/sw.js'); // 先に在った 1 本も残っている
  });

  it('★ 本体と self-test が同じ物を歩く (片方だけに足すと「走査した」と嘘をつく)', () => {
    const gate = readOriginalSource(join(REPO_ROOT, 'scripts/lint-forbidden-patterns.cjs'));
    // realVisited() 側と main() 側の両方に rootCodeFiles() のループが在る。
    expect(gate.match(/for \(const rel of rootCodeFiles\(\)\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // 名乗る内訳に直下の分が並ぶ (合計と内訳が合わない印字にしない)。
    expect(gate).toContain("'(直下)'");
  });

  it('★ 新しく足した直下の実行コードが走査母集団に入る (threat: T-016)', () => {
    // 合成した追跡一覧を注入: 直下の .cjs は入り、入れ子は入らず、巨大なデータ JSON は外す。
    // 直す前は SCAN_FILES の固定 4 本だけで、postbuild.cjs は走査されず release の署名鍵まで通った。
    const synthetic = ['postbuild.cjs', 'tools.mjs', 'a/b.cjs', 'package-lock.json', 'tsconfig.json', 'setup.ts'];
    const got = forbidden.rootCodeFiles(synthetic, { requireExists: false }).sort();
    expect(got).toEqual(['postbuild.cjs', 'setup.ts', 'tools.mjs']);
    // 入れ子 (scripts/ などは SCAN_ROOTS が別に歩く) と直下のデータ JSON は直下走査に入れない。
    expect(got).not.toContain('a/b.cjs');
    expect(got).not.toContain('package-lock.json');
    expect(got).not.toContain('tsconfig.json');
  });

  it('★ walk は .mjs を走査する —— ESM の実行コードが child_process census に入る (threat: T-018)', () => {
    // 直す前: walk の正規表現が `.mjs` を含まず、scripts/ci/x.mjs に child_process を
    // 書いても exit 0 (同じ中身の .cjs は exit 1)。既知 gap が頼る census の穴。
    expect(forbidden.isWalkedSourceName('x.mjs'), '.mjs が走査されない').toBe(true);
    // 兄弟の拡張子も通る (回帰で狭めない)。
    for (const ext of ['ts', 'tsx', 'cjs', 'js', 'jsx', 'html']) {
      expect(forbidden.isWalkedSourceName(`x.${ext}`), ext).toBe(true);
    }
    // 対照: コードでない物・主張していない拡張子は走査しない (網が広がりすぎない)。
    for (const name of ['README.md', 'data.json', 'style.css', 'x.mts', 'x.txt']) {
      expect(forbidden.isWalkedSourceName(name), name).toBe(false);
    }
  });

  it('★ forbidden と malware が .mjs について対称 (2 つの supply-chain 検出器がずれない)', () => {
    // malware の isScannedPath は元から .mjs を含む。forbidden の walk が外していたので
    // 「malware は走査するが forbidden は見ない」非対称だった。両方が見ることを留める。
    expect(forbidden.isWalkedSourceName('scripts/ci/x.mjs'.split('/').pop()!)).toBe(true);
    expect(malware.isScannedPath('scripts/ci/x.mjs')).toBe(true);
    expect(malware.isScannedPath('x.mjs')).toBe(true); // 直下も
  });

  it('★ git が無い環境では既知の SCAN_FILES へ落ちる (黙って 0 件にしない)', () => {
    expect([...forbidden.rootCodeFiles(null, { requireExists: false })].sort()).toEqual(
      [...forbidden.SCAN_FILES].sort(),
    );
  });

  it('★ 3 本とも整合性チェーンの保護対象 (梱包設定だけが守られている形をやめた)', () => {
    const chain = readOriginalSource(join(REPO_ROOT, 'scripts/integrity-chain.cjs'));
    const protectedBlock = /const PROTECTED = \[([\s\S]*?)\n\];/.exec(chain);
    expect(protectedBlock).not.toBeNull();
    const names = [...protectedBlock![1]!.matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]!);
    for (const f of forbidden.SCAN_FILES) expect(names, f).toContain(f);
    expect(names).toContain('electron-builder.json'); // 先に在った兄弟
    // 針の標本: 在らない名前は当たらない。
    expect(names).not.toContain('no-such-config.ts');
  });
});
