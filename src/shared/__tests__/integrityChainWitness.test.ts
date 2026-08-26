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
