import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * `chain:verify` の**外側の証人**。
 *
 * 2026-08-26 の実測: `cmdVerify()` の冒頭へ `console.log('✅ …'); return 0;` を
 * 差し込むだけで、**`chain:verify` も `chain self-test` も緑のまま**になった。
 * 自己テストは merkle / blockHash という純粋関数の性質しか見ておらず、
 * **検証の入口そのものは誰も通していなかった**。鎖は他の 54 ファイルの
 * 最後の錨なので、ここが黙ると全部の保護が同時に黙る。
 *
 * ここは**ゲートを呼ばない**。`PROTECTED` の一覧だけを借りて、
 * ハッシュ・Merkle・ブロック連結を**この検査自身で計算し直す**。
 * リポジトリが既に持つパリティ検査 (`proxyWorkerParity` /
 * `rfc2822Parity` / `atlassianSiteParity`) と同じ形である。
 *
 * **限界も書いておく (0-a-16)**: パリティは「両方に在る穴」を見つけられない。
 * 仕様 (葉 = `sha256(path\0filehash)` / 奇数は末尾複製 / ブロックは
 * `index\nprevHash\nmerkleRoot\nleafCount\nnote`) を**独立に書き直して**いるので
 * 実装の写し崩れは捕まるが、仕様そのものが誤っていれば両方とも誤る。
 */
const req = createRequire(import.meta.url);
const REPO_ROOT = resolve(__dirname, '../../..');
const chainModule = req('../../../scripts/integrity-chain.cjs') as { PROTECTED: string[] };
const chain = JSON.parse(
  readFileSync(join(REPO_ROOT, 'security/integrity-chain.json'), 'utf8'),
) as {
  genesisHash: string;
  protected: string[];
  tipManifest: Record<string, string>;
  blocks: { index: number; prevHash: string; merkleRoot: string; leafCount: number; note: string; hash: string }[];
};

const ZERO = '0'.repeat(64);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** 独立実装: マニフェスト → Merkle ルート。 */
function rootOf(manifest: Record<string, string>): string {
  let level = Object.keys(manifest)
    .sort()
    .map((p) => sha(`${p}\0${manifest[p]}`));
  if (level.length === 0) return sha('');
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as string;
      const right = (i + 1 < level.length ? level[i + 1] : left) as string;
      next.push(sha(left + right));
    }
    level = next;
  }
  return level[0] as string;
}

/** 独立実装: ブロック → ハッシュ。 */
const hashOf = (b: { index: number; prevHash: string; merkleRoot: string; leafCount: number; note: string }) =>
  sha(`${b.index}\n${b.prevHash}\n${b.merkleRoot}\n${b.leafCount}\n${b.note}`);

/** 独立実装: ディスク上の保護対象 → マニフェスト。 */
function manifestFromDisk(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of [...chainModule.PROTECTED].sort()) {
    out[rel] = sha(readFileSync(join(REPO_ROOT, rel)));
  }
  return out;
}

describe('chain:verify — 外側の証人 (ゲートを呼ばずに検証をやり直す)', () => {
  it('★ ディスク上の保護対象が tip の Merkle ルートと一致する', () => {
    const tip = chain.blocks[chain.blocks.length - 1];
    expect(tip).toBeDefined();
    expect(rootOf(manifestFromDisk())).toBe(tip?.merkleRoot);
  });

  it('★ 台帳の tipManifest が、ディスクの実物と 1 件ずつ一致する', () => {
    const disk = manifestFromDisk();
    expect(Object.keys(disk).sort()).toEqual(Object.keys(chain.tipManifest).sort());
    for (const [rel, h] of Object.entries(disk)) {
      expect(`${rel}=${h}`).toBe(`${rel}=${chain.tipManifest[rel]}`);
    }
  });

  it('★ ブロックのハッシュが再計算と一致する (履歴の偽造を弾く)', () => {
    for (const b of chain.blocks) expect(`#${b.index}:${hashOf(b)}`).toBe(`#${b.index}:${b.hash}`);
  });

  it('★ prevHash が途切れず連なっている', () => {
    chain.blocks.forEach((b, i) => {
      const want = i === 0 ? ZERO : (chain.blocks[i - 1]?.hash as string);
      expect(`#${b.index}:${b.prevHash}`).toBe(`#${b.index}:${want}`);
    });
  });

  it('genesisHash が先頭ブロックと一致する', () => {
    expect(chain.genesisHash).toBe(chain.blocks[0]?.hash);
  });

  it('台帳の protected 一覧が、ゲートの PROTECTED と一致する', () => {
    expect([...chain.protected].sort()).toEqual([...chainModule.PROTECTED].sort());
  });

  /*
   * 陽性対照 —— **この検査が本当に改竄を見つけられるか**を、同じ検査の中で示す。
   * これが無いと、上の一致はすべて「空の照合でも通る」形と区別がつかない
   * (CLAUDE.md「不在を主張する検査には、標本を添える」)。
   */
  it('陽性対照: 保護対象を 1 バイト変えると根が変わる', () => {
    const m = manifestFromDisk();
    const first = Object.keys(m).sort()[0] as string;
    const tampered = { ...m, [first]: sha('tampered') };
    expect(rootOf(tampered)).not.toBe(rootOf(m));
  });

  it('陽性対照: ブロックの note を変えるとハッシュが変わる', () => {
    const b = chain.blocks[chain.blocks.length - 1];
    expect(b).toBeDefined();
    expect(hashOf({ ...(b as NonNullable<typeof b>), note: 'x' })).not.toBe(b?.hash);
  });

  it('陽性対照: 保護対象が 0 件なら、実物との一致は成り立たない', () => {
    expect(rootOf({})).not.toBe(chain.blocks[chain.blocks.length - 1]?.merkleRoot);
  });
});

/*
 * 閉包検査の**言語ごとの守備範囲**。
 *
 * 2026-08-27 の実測: 閉包検査は `.ts|.tsx` 以外を丸ごと飛ばしていた ——
 * 当時の保護対象 55 件のうち 16 件 (`.cjs` 3 / `.sh` 6 / workflow 3 / `sw.js` ほか)。
 * 上の注記が約束している「材料の方も守らないと保護は素通し」が、その 29% に
 * 効いていなかった。実害は無かった (飛ばされていた側が読むリポジトリ内の
 * ファイルは 1 本だけで、たまたま保護対象だった) が、**偶然だった**。
 */
describe('閉包検査 — CommonJS も見ているか', () => {
  const chain = req('../../../scripts/integrity-chain.cjs') as {
    PROTECTED: string[];
    DEP_EXCLUSIONS: Record<string, string>;
    collectClosureProblems: (list: string[], excl: Record<string, string>) => string[];
    dependencySpecs: (text: string, kind: string) => string[];
    resolveRelativeImport: (fromRel: string, spec: string) => string | null;
  };

  it('実物の一覧では閉包の問題が 0 件', () => {
    expect(chain.collectClosureProblems(chain.PROTECTED, chain.DEP_EXCLUSIONS)).toEqual([]);
  });

  it('★ `require()` を依存として読む (以前は綴りごと見えていなかった)', () => {
    const text = "const { a } = require('./inline-html.cjs');\nrequire('node:fs');";
    expect(chain.dependencySpecs(text, 'cjs')).toContain('./inline-html.cjs');
  });

  it('★ 拡張子を含む綴りが解決できる', () => {
    // これが無いと `require('./x.cjs')` は解決に失敗し、**黙って飛ばされる**。
    expect(chain.resolveRelativeImport('scripts/inject-pwa.cjs', './inline-html.cjs')).toBe(
      'scripts/inline-html.cjs',
    );
  });

  it('ディレクトリを掴まない (末尾の空拡張子が効きすぎないこと)', () => {
    expect(chain.resolveRelativeImport('scripts/integrity-chain.cjs', '../src')).toBeNull();
  });

  it('★ 保護されていない CommonJS 依存があれば鳴る', () => {
    const without = chain.PROTECTED.filter((f) => f !== 'scripts/inline-html.cjs');
    const problems = chain.collectClosureProblems(without, chain.DEP_EXCLUSIONS);
    expect(problems.some((p) => p.includes('inject-pwa.cjs') && p.includes('inline-html.cjs'))).toBe(
      true,
    );
  });

  it('保管庫への書き込みを閉じ込める関門が保護対象に居る', () => {
    // exportPaths.ts と同じ役どころ (書き出し先の封じ込め) で、CI でも走る。
    expect(chain.PROTECTED).toContain('scripts/safe-vault-write.cjs');
    expect(chain.PROTECTED).toContain('src/main/clients/exportPaths.ts');
  });

  it('ESM 側の読み取りは変わっていない (対照)', () => {
    const text = "import { x } from './foo';\nexport { y } from './bar';";
    expect(chain.dependencySpecs(text, 'esm')).toEqual(['./foo', './bar']);
    expect(chain.dependencySpecs(text, 'cjs')).toEqual([]);
  });
});
