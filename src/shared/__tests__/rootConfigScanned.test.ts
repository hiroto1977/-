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

describe('リポジトリ直下の設定 (パス 347)', () => {
  it('★ 直下のコードは全部 SCAN_FILES に載っている (両方向)', () => {
    expect([...forbidden.SCAN_FILES].sort()).toEqual(rootLevelCode());
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
    // realVisited() 側と main() 側の両方に SCAN_FILES のループが在る。
    expect(gate.match(/for \(const rel of SCAN_FILES\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // 名乗る内訳に直下の分が並ぶ (合計と内訳が合わない印字にしない)。
    expect(gate).toContain("'(直下)'");
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
