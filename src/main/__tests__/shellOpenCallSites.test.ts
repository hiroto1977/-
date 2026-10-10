import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readOriginalDir, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

/*
 * **OS に「開かせる」呼び出しは、全部 `shellOpenGate` を通る** (2026-09-25 · パス 465)。
 *
 * 法則 `shell-open-gate` の執行者は `exportSymlinkContainment` ただ 1 本で、それは
 * **関門そのものの中身** (realpath してから閉じ込めを見る) を見る。ところが
 * 「**新しい呼び出しが関門を飛ばす**」ときに鳴る物は 1 つも無かった ——
 * `lawCoverageLedger` はその穴を数えるために在るのに、`scansPopulation()` が
 * `exportSymlinkContainment.test.ts:49` の**注記 1 行** (`readOriginalSource` の綴り) で
 * 満たされており、しかもその注記は「一時の道に使うと的が外れる」と
 * **使っていないことを述べていた** (法則 `mention-vs-declaration`)。
 *
 * ここが母集団の側を持つ。`shell.openPath` / `shell.showItemInFolder` の呼び出しを
 * `src/main` の全件から拾い、1 つずつ次の 3 つを要求する:
 *
 * 1. 渡すのは**識別子**である (生のパスの式を直に渡さない)。
 * 2. その識別子は `await shellTargetOrNull(` の戻り値として束ねられている。
 * 3. 束ねた所と呼び出しの間に `=== null` の門が在る (関門が「駄目」と言ったら開かない)。
 *
 * **`shell.openExternal` は母集団ではない** —— あちらはファイルではなく URL の境界で、
 * 関門も別 (`externalUrlOrNull`)。混ぜると「どちらの関門を通ればよいか」が曖昧になる。
 *
 * 注記は `stripComments` で落とす —— この docblock 自身が綴りを並べているので、
 * 生のまま読むと**自分の説明文で母集団が膨らむ**。
 */

const MAIN = join(__dirname, '..');
const OPENERS = ['shell.openPath', 'shell.showItemInFolder'] as const;

function walk(dir: string, out: string[]): void {
  for (const name of readOriginalDir(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') walk(full, out);
      continue;
    }
    if (/\.ts$/.test(name)) out.push(full);
  }
}

interface Site {
  readonly file: string;
  readonly opener: string;
  readonly arg: string;
  readonly at: number;
}

/** `src/main` の出荷コードから、OS にファイルを開かせる呼び出しを全部拾う。 */
export function openCallSites(): Site[] {
  const files: string[] = [];
  walk(MAIN, files);
  const sites: Site[] = [];
  for (const f of files.sort()) {
    const code = stripComments(readOriginalSource(f));
    for (const opener of OPENERS) {
      const re = new RegExp(`${opener.replace('.', '\\.')}\\(([^)]*)\\)`, 'g');
      for (const m of code.matchAll(re)) {
        sites.push({
          file: relative(MAIN, f).split(/[\\/]/).join('/'),
          opener,
          arg: m[1]!.trim(),
          at: m.index,
        });
      }
    }
  }
  return sites;
}

/** その識別子が `shellTargetOrNull` に束ねられ、`=== null` の門を通っているか。 */
function guardedBefore(code: string, name: string, at: number): { bound: boolean; gated: boolean } {
  const bind = new RegExp(`const\\s+${name}\\s*=\\s*await\\s+shellTargetOrNull\\(`);
  const head = code.slice(0, at);
  const m = [...head.matchAll(new RegExp(bind.source, 'g'))].pop();
  if (m === undefined) return { bound: false, gated: false };
  const between = code.slice(m.index, at);
  return { bound: true, gated: new RegExp(`${name}\\s*===\\s*null`).test(between) };
}

describe('OS に開かせる呼び出しは全部 shellOpenGate を通る (パス 465)', () => {
  const sites = openCallSites();

  it('母集団が実物に届いている (空撃ちでない)', () => {
    expect(sites.length, '呼び出しが 1 つも見つからない — 針が死んでいる').toBeGreaterThanOrEqual(2);
    expect(sites.map((s) => s.opener).sort()).toEqual([...OPENERS].sort());
  });

  it('★ どの呼び出しも、関門の戻り値を null の門を通してから渡している', () => {
    for (const s of sites) {
      const code = stripComments(readOriginalSource(join(MAIN, s.file)));
      expect(/^[A-Za-z_$][\w$]*$/.test(s.arg), `${s.file}: ${s.opener}(${s.arg}) は識別子でない`).toBe(true);
      const g = guardedBefore(code, s.arg, s.at);
      expect(g.bound, `${s.file}: ${s.arg} は shellTargetOrNull の戻り値ではない`).toBe(true);
      expect(g.gated, `${s.file}: ${s.arg} === null の門が無い`).toBe(true);
    }
  });

  it('★ 関門の実装は 1 つだけ (写しが生えたら鳴る)', () => {
    const files: string[] = [];
    walk(MAIN, files);
    const impls = files.filter((f) => /export async function shellTargetOrNull\(/.test(stripComments(readOriginalSource(f))));
    expect(impls.map((f) => relative(MAIN, f).split(/[\\/]/).join('/'))).toEqual(['shellOpenGate.ts']);
  });

  it('標本: 針は当たり、注記の中の言及は数えない', () => {
    const call = `${OPENERS[0]}(target)`;
    expect(new RegExp(`${OPENERS[0].replace('.', '\\.')}\\(`).test(stripComments(`const x = 1;\n${call};\n`))).toBe(true);
    expect(new RegExp(`${OPENERS[0].replace('.', '\\.')}\\(`).test(stripComments(`// かつて ${call} と書いていた\n`))).toBe(false);
  });

  it('対照: 関門を通さない呼び出しは落ちる / 門を外した呼び出しも落ちる', () => {
    const bare = `const target = filePath;\n${OPENERS[0]}(target);\n`;
    const noGate = `const target = await shellTargetOrNull(filePath);\n${OPENERS[0]}(target);\n`;
    const good = `const target = await shellTargetOrNull(filePath);\nif (target === null) return null;\n${OPENERS[0]}(target);\n`;
    const at = (src: string): number => src.indexOf(OPENERS[0]);
    expect(guardedBefore(bare, 'target', at(bare))).toEqual({ bound: false, gated: false });
    expect(guardedBefore(noGate, 'target', at(noGate))).toEqual({ bound: true, gated: false });
    expect(guardedBefore(good, 'target', at(good))).toEqual({ bound: true, gated: true });
  });
});
