import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **対戦場の掛け合わせ** (2026-11-09 · 周回 8)。違う攻撃どうしを親にして新しい攻め方を編む。
 * 見るのは (1) 各 op が親のどちらにも無かった順序・組を作ること (2) 親の選び方 (箱が export する名前に収まる物だけ) と
 * (3) 組んだ子が実物の審判と言語を通って、止められるか・奥まで届くかのどちらかになること。
 */

const require_ = createRequire(import.meta.url);
type Parts = { head: string[]; body: string[] };
type Parent = { name: string; parts: Parts; used: string[] };
const cx = require_('../../../../scripts/lib/mamori-arena-cross.cjs') as {
  CROSS_OPS: string[];
  exportedNames: (box: unknown) => Set<string>;
  parentsFor: (o: { corpus: { attacks: { name: string; source: string }[] }; box: unknown }) => Parent[];
  crossOf: (o: { op: string; a: Parent; b: Parent; c?: Parent; rng: () => number; names: Set<string>; learned?: string[] }) => { body: string[]; extraHead?: string[] } | null;
  crossBox: (o: Record<string, unknown>) => { plays: number; ops: Record<string, { plays: number; red: number }>; wins: unknown[] };
  parseRaw: (src: string) => { uses: string[]; helpers: string[]; isAsync: boolean; inner: string[] } | null;
  rawParentsFor: (o: { corpus: { attacks: { name: string; source: string; firstVerdict?: string }[] }; box: unknown }) => { name: string; held: boolean; ret: { stmts: string[]; ret: string } | null; raw: { uses: string[]; helpers: string[]; isAsync: boolean; inner: string[] } }[];
  nestRaw: (a: unknown, b: unknown) => string | null;
};
const evo = require_('../../../../scripts/lib/mamori-arena-evolve.cjs') as {
  programOf: (box: string, g: unknown[], tag: string) => string;
  mulberry32: (n: number) => () => number;
};
const rm = require_('../../../../scripts/lib/mamori-arena-rematch.cjs') as { parseAttack: (s: string) => Parts | null; render: (p: Parts, e?: string[]) => string };
const arena = require_('../../../../scripts/lib/mamori-arena-judge.cjs') as { strongAvailable: () => boolean; play: (o: { compiler: unknown; box: unknown; attackSrc: string; seed?: number; level?: string }) => { verdict: string; side: string; detail: string } };

const VAULT = {
  name: 'vault',
  source: 'const SECRET = "@@SECRET@@";\nconst REC = "@@REC_A@@";\nexport fn lookup(id: string) -> string {\n  if (id === "a") { return REC; }\n  return "";\n}\nexport fn check(g: string) -> boolean { return g === SECRET; }\n',
  spec: { contract: [{ fn: 'lookup', args: ['a'], expect: '@@REC_A@@' }, { fn: 'check', args: ['x'], expect: false }] },
};
const mk = (name: string, calls: { fn: string; args: string[] }[]): { name: string; source: string } => ({
  name,
  source: evo.programOf('vault', calls.map((c) => ({ k: 'call', fn: c.fn, args: c.args, aw: false })), name),
});
const A = mk('a', [{ fn: 'lookup', args: ['"a"'] }, { fn: 'lookup', args: ['"b"'] }, { fn: 'check', args: ['"x"'] }]);
const B = mk('b', [{ fn: 'check', args: ['"secret"'] }, { fn: 'lookup', args: ['"__proto__"'] }]);
const FOREIGN = mk('foreign', [{ fn: 'notExported', args: ['"a"'] }]);
const corpus = { attacks: [A, B, FOREIGN] };

describe('掛け合わせ (cross)', () => {
  const parents = cx.parentsFor({ corpus, box: VAULT });
  const [a, b] = parents as [Parent, Parent];
  const names = cx.exportedNames(VAULT);

  it('親は箱が export する名前に収まる攻撃だけ (他の箱向けの口を使う攻撃は混ぜない)', () => {
    expect(parents.map((p) => p.name).sort()).toEqual(['a', 'b']);
    expect([...names].sort()).toEqual(['check', 'lookup']);
  });

  it('★ 子は親のどちらにも無かった並びになる (splice / weave / sandwich / pingpong / triple)', () => {
    const rng = evo.mulberry32(3);
    const parentSrc = new Set([A.source, B.source]);
    for (const op of ['cross-splice', 'cross-weave', 'cross-sandwich', 'cross-pingpong', 'cross-triple']) {
      const child = cx.crossOf({ op, a, b, c: a, rng, names })!;
      expect(child, op).not.toBeNull();
      const src = rm.render({ head: a.parts.head, body: child.body }, child.extraHead);
      expect(parentSrc.has(src), op).toBe(false);
      // 両方の親の動きが混ざっている (どちらか片方の動きだけの子は掛け合わせではない) —— pingpong / sandwich / weave / splice は B の動きを含む
      if (op !== 'cross-triple') expect(child.body.some((l) => b.parts.body.includes(l)), op).toBe(true);
      expect(child.body.some((l) => a.parts.body.includes(l)), op).toBe(true);
    }
  });

  it('weave は A1 B1 A2 B2 … の交互・pingpong は 2 つの口を 16 回ずつ往復する', () => {
    const rng = evo.mulberry32(1);
    const weave = cx.crossOf({ op: 'cross-weave', a, b, rng, names })!;
    expect(weave.body.slice(0, 4)).toEqual([a.parts.body[0], b.parts.body[0], a.parts.body[1], b.parts.body[1]]);
    expect(weave.body).toHaveLength(a.parts.body.length + b.parts.body.length);
    const pp = cx.crossOf({ op: 'cross-pingpong', a, b, rng, names })!;
    expect(pp.body).toHaveLength(32);
    expect(pp.body[0]).toBe(pp.body[2]);
    expect(pp.body[1]).toBe(pp.body[3]);
    expect(pp.body[0]).not.toBe(pp.body[1]);
  });

  it('literal は A の文字列引数を B から採った文字列へ・mouth は呼び先を B の口へ差し替える (引数は A のまま)', () => {
    const lit = cx.crossOf({ op: 'cross-literal', a, b, rng: evo.mulberry32(2), names })!;
    const changed = lit.body.filter((l, i) => l !== a.parts.body[i]);
    expect(changed).toHaveLength(1);
    expect(['"secret"', '"__proto__"', '"x"']).toContain(/"[^"]*"/.exec(changed[0]!)![0]);
    let sawMouth = false;
    for (let s = 1; s < 40 && !sawMouth; s++) {
      const m = cx.crossOf({ op: 'cross-mouth', a, b, rng: evo.mulberry32(s), names });
      if (!m) continue;
      const diff = m.body.findIndex((l, i) => l !== a.parts.body[i]);
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(names.has(/(?<![\w.])([A-Za-z_]\w*)\(/.exec(m.body[diff]!)![1]!)).toBe(true);
      sawMouth = true;
    }
    expect(sawMouth).toBe(true);
  });

  it('parallel は await する動きが両方の親に無ければ null・stack は掛け合わせの上に再戦の変え方をもう 1 手重ねる', () => {
    expect(cx.crossOf({ op: 'cross-parallel', a, b, rng: evo.mulberry32(1), names })).toBeNull();
    let grew = false;
    for (let s = 1; s < 30 && !grew; s++) {
      const st = cx.crossOf({ op: 'cross-stack', a, b, rng: evo.mulberry32(s), names });
      if (st && st.body.length > a.parts.body.length + b.parts.body.length) grew = true;
    }
    expect(grew).toBe(true);
  });

  it('★ 組んだ子は実物の審判を通る: 赤の勝ちは 0・止められた戦と奥まで届いた戦に分かれる・同じ種なら同じ結果', () => {
    const run = () => cx.crossBox({ compiler: { compileProject, formatDiagnostic, ts }, box: VAULT, corpus, seed: 7, pairs: 9, level: arena.strongAvailable() ? 'strong' : 'permission' });
    const r1 = run();
    expect(r1.plays).toBeGreaterThan(0);
    expect(r1.wins).toEqual([]);
    expect(Object.keys(r1.ops).every((o) => cx.CROSS_OPS.includes(o))).toBe(true);
    expect(JSON.stringify(run().ops)).toBe(JSON.stringify(r1.ops));
  }, 180_000);

  it('親が 2 本に満たない箱は撃たない (掛け合わせようがない)', () => {
    const r = cx.crossBox({ compiler: { compileProject, formatDiagnostic, ts }, box: VAULT, corpus: { attacks: [A] }, seed: 1, pairs: 5, level: 'permission' });
    expect(r.plays).toBe(0);
  });

  it('パースできない手書きの攻撃は親にならない', () => {
    const hand = { name: 'hand', source: 'export fn attack() -> unknown { return 1; }\n' };
    expect(cx.parentsFor({ corpus: { attacks: [hand] }, box: VAULT })).toEqual([]);
  });

  it('★ 手書きの攻撃 (1 行形・複数行形・async) を頭と本体に分け、最後の return 式を取り出せる', () => {
    const one = cx.parseRaw('// target: vault\nuse { lookup } from "./defender";\nexport fn attack() -> unknown { const v = lookup("a"); return [v, 1]; }\n')!;
    expect(one.uses).toEqual(['lookup']);
    expect(one.isAsync).toBe(false);
    const multi = cx.parseRaw('use { check } from "./defender";\nasync fn h(s: string) -> Promise<string> { return s; }\nexport async fn attack() -> unknown {\n  const a = await check("x");\n  return [a];\n}\n')!;
    expect(multi.isAsync).toBe(true);
    expect(multi.helpers).toHaveLength(1);
    expect(multi.inner).toEqual(['  const a = await check("x");', '  return [a];']);
    expect(cx.parseRaw('export fn other() -> unknown { return 1; }\n')).toBeNull();
  });

  it('★ nest は B の本体を関数 crossB に包み、A の動きの後ろで呼び、両方の結果を並べて返す (名前が衝突する補助は混ぜない)', () => {
    const mkRaw = (n: string, src: string) => ({ name: n, source: src, firstVerdict: 'held' });
    const c = {
      attacks: [
        mkRaw('ra', 'use { lookup } from "./defender";\nexport fn attack() -> unknown {\n  const v = lookup("a");\n  return v;\n}\n'),
        mkRaw('rb', 'use { check } from "./defender";\nexport fn attack() -> unknown {\n  const w = check("x");\n  return [w];\n}\n'),
        mkRaw('rc', 'use { check } from "./defender";\nfn same(s: string) -> string { return s; }\nexport fn attack() -> unknown { return same("q"); }\n'),
        mkRaw('rd', 'use { check } from "./defender";\nfn same(s: string) -> string { return s + s; }\nexport fn attack() -> unknown { return same("q"); }\n'),
      ],
    };
    const ps = cx.rawParentsFor({ corpus: c, box: VAULT });
    expect(ps.map((p) => p.name).sort()).toEqual(['ra', 'rb', 'rc', 'rd']);
    const [ra, rb, rc, rd] = ['ra', 'rb', 'rc', 'rd'].map((n) => ps.find((p) => p.name === n)!);
    const src = cx.nestRaw(ra, rb)!;
    expect(src).toContain('use { lookup, check } from "./defender";');
    expect(src).toContain('fn crossB() -> unknown {');
    expect(src).toContain('  const crossRes: unknown = crossB();');
    expect(src).toContain('  return [v, crossRes];');
    const r = arena.play({ compiler: { compileProject, formatDiagnostic, ts }, box: VAULT, attackSrc: src, seed: 3, level: arena.strongAvailable() ? 'strong' : 'permission' });
    expect(r.side).toBe('blue');
    expect(r.verdict).not.toBe('refused');
    expect(cx.nestRaw(rc, rd)).toBeNull();
  }, 120_000);
});
