import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compileProject, formatDiagnostic } from '../compile';
import { readOriginalSource } from '../../__tests__/originalSource';

/*
 * **Mamori の対戦場の審判と、戦いの記録の再生** (2026-11-08 · 対戦)。
 *
 * 対戦場 (`scripts/lib/mamori-arena-judge.cjs`) は、守る側 (仮想データを持つ Mamori の箱) と攻める側 (Mamori の攻撃) を
 * 外側の箱 (`unshare -rn node --permission` の子プロセス) の中の vm で戦わせる。この検査は 3 つを見る:
 *
 * 1. **審判の物差し** —— わざと秘密を返す箱は `stolen`、正直な呼び出しは `held`、`.constructor` は `refused` (M0)、
 *    箱が自分の約束を破っていれば `bad-box`。物差しが鳴らなければ、戦いの結果を信用できない (対照)。
 * 2. **箱の閉じ方** —— Mamori を通さない生の JS で内側の箱から host の Function へ届いても (最悪の攻め)、
 *    ファイルの読み書き・子プロセス・ワーカーは閉じていて、host の canary / process に触れれば `escaped` と判定される。
 * 3. **戦いの記録の再生** —— `security/mamori-arena/corpus.json` に残した攻撃 (過去に破れた物は直した後の姿) を、
 *    すべての箱に当てて、攻める側の得点が 0 のままであること。**新しい穴が塞がれたあとの回帰の網**で、戦いのデータが
 *    言語の学習 (規則の追加の根拠) になる出口である。
 *
 * ネットワークまで閉じる箱 (`strong`) はこの環境に `unshare` が無いと使えない。CI で使えないときは `permission` の箱で
 * 同じ検査を行い、どちらの強さで走ったかを題名に出す (弱い箱で黙って強い箱の結果を名乗らない)。
 */

const require_ = createRequire(import.meta.url);
const arena = require_('../../../../scripts/lib/mamori-arena-judge.cjs') as {
  play: (o: { compiler: unknown; box: unknown; attackSrc: string; seed?: number; level?: string }) => { verdict: string; side: string; detail: string; rules?: string[] };
  runBox: (payload: unknown, level: string) => { verdict: string; detail: string };
  strongAvailable: () => boolean;
  REPO_ROOT: string;
};

const compiler = { compileProject, formatDiagnostic, ts };
const LEVEL = arena.strongAvailable() ? 'strong' : 'permission';

const VAULT = {
  name: 'vault',
  source: 'const SECRET = "@@SECRET@@";\nconst REC = "@@REC_A@@";\nexport fn lookup(id: string) -> string {\n  if (id === "a") { return REC; }\n  return "";\n}\nexport fn check(g: string) -> boolean { return g === SECRET; }\n',
  spec: { contract: [{ fn: 'lookup', args: ['a'], expect: '@@REC_A@@' }, { fn: 'check', args: ['x'], expect: false }] },
};
const LEAKY = {
  name: 'leaky',
  source: 'const SECRET = "@@SECRET@@";\nexport const shared = { a: "@@REC_A@@" };\nexport fn lookup(id: string) -> string { return shared.a; }\nexport fn dump() -> string { return SECRET; }\n',
  spec: { contract: [{ fn: 'lookup', args: ['a'], expect: '@@REC_A@@' }] },
};

const play = (box: unknown, attackSrc: string, seed = 11) => arena.play({ compiler, box, attackSrc, seed, level: LEVEL });

describe(`対戦場の審判 (${LEVEL} の箱)`, () => {
  it('★ 正直な呼び出しは held (青の得点)', () => {
    const r = play(VAULT, 'use { lookup } from "./defender";\nexport fn attack() -> unknown { return lookup("a"); }\n');
    expect(r.verdict).toBe('held');
    expect(r.side).toBe('blue');
  });

  it('★ 秘密を返す箱は stolen (赤の得点) —— 物差しが鳴る対照', () => {
    const r = play(LEAKY, 'use { dump } from "./defender";\nexport fn attack() -> unknown { return dump(); }\n');
    expect(r.verdict).toBe('stolen');
    expect(r.side).toBe('red');
    expect(r.detail).not.toContain('sec_'); // 判定の文に秘密そのものを刷らない
  });

  it('★ 秘密を 1 字ずつ・逆順・文字コードで返しても stolen (断片・変形も数える)', () => {
    const dump = 'use { dump } from "./defender";\n';
    const rev = play(LEAKY, dump + 'export fn attack() -> unknown {\n  const s = dump();\n  const out: string[] = [];\n  for (const c of s) { out.push(c); }\n  return out.reverse();\n}\n');
    expect(rev.verdict).toBe('stolen');
    const codes = play(LEAKY, dump + 'export fn attack() -> unknown {\n  const s = dump();\n  const out: number[] = [];\n  for (const c of s) { out.push(c.charCodeAt(0)); }\n  return out;\n}\n');
    expect(codes.verdict).toBe('stolen');
  });

  it('★ .constructor はコンパイラが断る (M0) —— 青の得点', () => {
    const r = play(VAULT, 'use { lookup } from "./defender";\nexport fn attack() -> unknown { return lookup.constructor("return 1"); }\n');
    expect(r.verdict).toBe('refused');
    expect(r.rules).toContain('M0');
  });

  it('この箱に無い名前を引く攻撃は採点しない (n/a)', () => {
    const r = play(VAULT, 'use { dump } from "./defender";\nexport fn attack() -> unknown { return dump(); }\n');
    expect(r.verdict).toBe('n/a');
    expect(r.side).toBe('void');
  });

  it('箱が自分の約束を破っていれば bad-box (採点しない)', () => {
    const broken = { ...VAULT, spec: { contract: [{ fn: 'lookup', args: ['a'], expect: 'this-is-not-the-record' }] } };
    const r = play(broken, 'use { lookup } from "./defender";\nexport fn attack() -> unknown { return 1; }\n');
    expect(r.verdict).toBe('bad-box');
    expect(r.side).toBe('void');
  });
});

describe(`箱の閉じ方 (${LEVEL})`, () => {
  const hostEscape = (body: string) => ({
    contract: [],
    secrets: [['SECRET', 'sec_zzzzzzzzzzzzzzzzzzzzzzzz']],
    hostCanary: 'HOSTCANARY-test0000',
    timeoutMs: 3000,
    modules: [{ name: 'defender', js: 'exports.f = function () { return 1; };' }, { name: 'attack', js: 'exports.attack = function () {' + body + '};' }],
  });

  it('★ 内側の箱から host の Function に届いても、host の canary を読めば escaped と判定する', () => {
    const r = arena.runBox(hostEscape('return URL.constructor("return globalThis.__ARENA_HOST_CANARY__")();'), LEVEL);
    expect(r.verdict).toBe('escaped');
  });

  it('★ 守る側が正当に使う host の URL 由来の値 (searchParams・URL のエラー) は escaped にしない', () => {
    const r = arena.runBox(hostEscape('const u = new URL("https://example.com/?a=1"); let e = ""; try { new URL("::bad"); } catch (x) { e = x; } return [u.searchParams, e, u.href];'), LEVEL);
    expect(r.verdict).toBe('held');
  });

  it('★ host の組み込みのコンストラクタ (URL.constructor) を返しても escaped と判定する', () => {
    const r = arena.runBox(hostEscape('return URL.constructor;'), LEVEL);
    expect(r.verdict).toBe('escaped');
  });

  it('★ host の process を返しても escaped と判定する', () => {
    const r = arena.runBox(hostEscape('return URL.constructor("return process")();'), LEVEL);
    expect(r.verdict).toBe('escaped');
  });

  it('★ host の Function に届いても、ファイルの読み書き・子プロセス・ワーカーは閉じている (外側の箱)', () => {
    const probe =
      'const F = URL.constructor; const out = {};\n' +
      'const t = (k, f) => { try { f(); out[k] = "REACHED"; } catch (e) { out[k] = "DENIED:" + (e && e.code); } };\n' +
      't("fsRead", () => F("return require(\\"fs\\").readFileSync(\\"/etc/hostname\\", \\"utf8\\")")());\n' +
      't("fsWrite", () => F("require(\\"fs\\").writeFileSync(\\"/tmp/mamori-arena-escape-proof\\", \\"x\\")")());\n' +
      't("child", () => F("return require(\\"child_process\\").execSync(\\"id\\")")());\n' +
      't("worker", () => F("new (require(\\"worker_threads\\").Worker)(\\"1\\", { eval: true })")());\n' +
      'return JSON.stringify(out);';
    const r = arena.runBox(hostEscape(probe), LEVEL);
    expect(r.verdict).toBe('held'); // 秘密も canary も返していない
    for (const k of ['fsRead', 'fsWrite', 'child', 'worker']) expect(r.detail).toContain('"' + k + '":"DENIED:ERR_ACCESS_DENIED"');
    expect(r.detail).not.toContain('REACHED');
    expect(existsSync('/tmp/mamori-arena-escape-proof')).toBe(false);
  });

  it('無限ループは外側で打ち切る (hang・採点しない)', () => {
    const r = arena.runBox(hostEscape('for (;;) {}'), LEVEL);
    expect(r.verdict).toBe('hang');
  });
});

interface CorpusFile {
  boxes: { name: string; source: string; spec: { contract: unknown[] } }[];
  attacks: { name: string; source: string; firstVerdict: string }[];
}

describe(`自律学習・自律進化 (${LEVEL})`, () => {
  const evo = require_('../../../../scripts/lib/mamori-arena-evolve.cjs') as {
    parseExports: (src: string) => { fns: { name: string; params: string[]; returns: string }[]; consts: string[] };
    programOf: (box: string, genome: unknown[], tag: string) => string;
    weaken: (src: string) => { op: string; source: string }[];
    evolveRed: (o: Record<string, unknown>) => { elites: unknown[]; wins: { verdict: string }[]; plays: number; skipped?: string };
    evolveBlue: (o: Record<string, unknown>) => { op: string; caught: boolean }[];
    fitnessOf: (res: Record<string, unknown>, seen: Set<string>) => number;
    mutate: (g: unknown[], api: unknown, rng: () => number) => unknown[];
    mulberry32: (a: number) => () => number;
  };

  it('箱の API (関数と定数・引数が string / number / boolean か string を取るコールバック) を読み取る', () => {
    const api = evo.parseExports('export const T = 1;\nexport fn a(x: string, n: number) -> string { return x; }\nexport fn cb(f: (s: string) => string) -> string { return ""; }\nfn hidden() -> string { return ""; }\n');
    expect(api.consts).toEqual(['T']);
    expect(api.fns.map((f) => f.name)).toEqual(['a', 'cb']);
    expect(api.fns[0]?.params).toEqual(['string', 'number']);
    expect(api.fns[1]?.params).toEqual(['cb:string']);
  });

  it('★ 点の順序: 型で止まる < 実行まで通る < 新しい出力 < 赤の勝ち・同じ出力に新しさの褒美は出ない (対照)', () => {
    const seen = new Set<string>();
    const refused = evo.fitnessOf({ side: 'blue', verdict: 'refused', rules: ['M6'], detail: '' }, seen);
    const tscStop = evo.fitnessOf({ side: 'blue', verdict: 'refused', rules: ['tsc'], detail: '' }, seen);
    const first = evo.fitnessOf({ side: 'blue', verdict: 'held', detail: 'returned | alpha-token beta-token' }, seen);
    const again = evo.fitnessOf({ side: 'blue', verdict: 'held', detail: 'returned | alpha-token beta-token' }, seen);
    const win = evo.fitnessOf({ side: 'red', verdict: 'stolen', detail: '' }, seen);
    expect(refused).toBeLessThan(tscStop);
    expect(tscStop).toBeLessThan(again);
    expect(again).toBe(2);
    expect(first).toBeGreaterThan(again);
    expect(win).toBeGreaterThan(first);
    expect(evo.fitnessOf({ side: 'void', verdict: 'n/a', detail: '' }, seen)).toBe(-1);
  });

  it('同じ種なら同じ進化になる (再現できる)・突然変異は元の遺伝子を壊さない', () => {
    const api = evo.parseExports(VAULT.source);
    const g0 = [{ k: 'call', fn: 'lookup', args: ['"a"'] }];
    const a = evo.mutate(g0, api, evo.mulberry32(5));
    const b = evo.mutate(g0, api, evo.mulberry32(5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(g0).toEqual([{ k: 'call', fn: 'lookup', args: ['"a"'] }]);
  });

  it('★ 赤の進化: 約束を守る箱からは奪えず、箱の奥まで届く精鋭が育つ', () => {
    const r = evo.evolveRed({ compiler, box: VAULT, gens: 2, pop: 6, seed: 3, level: LEVEL });
    expect(r.wins).toEqual([]);
    expect(r.plays).toBeGreaterThan(5);
    expect(r.elites.length).toBeGreaterThan(0);
    for (const g of r.elites) expect(evo.programOf('vault', g as unknown[], 't')).toContain('export fn attack()');
  });

  it('★ 青の弱体化 (対照): 秘密を返す関数を足した箱・秘密を export した箱を、赤が必ず捕まえる (物差しと赤の目が生きている)', () => {
    const ops = evo.weaken(VAULT.source).map((w) => w.op);
    expect(ops).toEqual(expect.arrayContaining(['export-secret', 'leak-fn', 'leak-prefix', 'leak-hook']));
    const blue = evo.evolveBlue({ compiler, box: VAULT, seed: 3, level: LEVEL });
    expect(blue.length).toBeGreaterThan(0);
    for (const b of blue) expect(b.caught, `${b.op} を赤が捕まえられなかった`).toBe(true);
  });

  it('★ 関数が多い箱でも、足された最後の漏えい口を探り役が見逃さない (盲点の回帰: 探り役の長さを 6 で切っていた)', () => {
    const fns = Array.from({ length: 9 }, (_, i) => `export fn f${i}() -> string { return "@@REC_A@@"; }`).join('\n');
    const wide = { name: 'wide', source: `const SECRET = "@@SECRET@@";\n${fns}\n`, spec: { contract: [{ fn: 'f0', args: [], expect: '@@REC_A@@' }] } };
    const blue = evo.evolveBlue({ compiler, box: wide, seed: 2, level: LEVEL });
    expect(blue.length).toBeGreaterThan(0);
    for (const b of blue) expect(b.caught, `${b.op} を赤が捕まえられなかった`).toBe(true);
  });

  it('★ 1 つの呼び出しが例外を投げても、後ろの動きは走る (盲点の回帰: 投げる関数が先にある箱の漏えい口を見逃した)', () => {
    const throwing = { name: 'throwing', source: 'const SECRET = "@@SECRET@@";\nexport fn boom() -> string { throw new Error("denied"); }\nexport fn ok() -> string { return "@@REC_A@@"; }\n', spec: { contract: [{ fn: 'ok', args: [], expect: '@@REC_A@@' }] } };
    const blue = evo.evolveBlue({ compiler, box: throwing, seed: 2, level: LEVEL });
    for (const b of blue) expect(b.caught, `${b.op} を赤が捕まえられなかった`).toBe(true);
  });

  it('★ 関数を引数に取る口 (コールバック) も動きに入る: 秘密を呼び出し側の関数へ渡す口を赤が捕まえる (2 周目の進化: 青の新手 leak-hook に赤が追いついた)', () => {
    const api = evo.parseExports('export fn withSecret(f: (s: string) => string) -> string { return f("x"); }\n');
    expect(api.fns[0]?.params).toEqual(['cb:string']);
    const hook = { name: 'hook', source: 'const SECRET = "@@SECRET@@";\nexport fn ok() -> string { return "@@REC_A@@"; }\nexport fn withSecret(f: (s: string) => string) -> string { return f(SECRET); }\n', spec: { contract: [{ fn: 'ok', args: [], expect: '@@REC_A@@' }] } };
    const r = evo.evolveRed({ compiler, box: hook, gens: 1, pop: 6, seed: 4, level: LEVEL });
    expect(r.wins.length).toBeGreaterThan(0);
  });

  it('API の無い箱は進化させない (空の進化が緑にならない)', () => {
    const r = evo.evolveRed({ compiler, box: { name: 'empty', source: 'const X = 1;\n', spec: { contract: [] } }, gens: 1, pop: 4, seed: 1, level: LEVEL });
    expect(r.skipped).toBeTruthy();
  });

  it('進化の記録 (evolution.json) がある・赤の勝ちは 0・青の弱体化の教訓が残っている', () => {
    const p = `${arena.REPO_ROOT}/security/mamori-arena/evolution.json`;
    expect(existsSync(p)).toBe(true);
    const e = JSON.parse(readOriginalSource(p)) as { wins: unknown[]; lessons: { box: string; op: string }[]; history: unknown[]; boxes: Record<string, { elites: unknown[] }> };
    expect(e.wins).toEqual([]);
    expect(e.history.length).toBeGreaterThan(0);
    expect(e.lessons.length).toBeGreaterThan(0);
    expect(Object.keys(e.boxes).length).toBeGreaterThanOrEqual(10);
  });
});

describe(`戦いの記録の再生 (${LEVEL})`, () => {
  const path = `${arena.REPO_ROOT}/security/mamori-arena/corpus.json`;
  const corpus: CorpusFile | null = existsSync(path) ? (JSON.parse(readOriginalSource(path)) as CorpusFile) : null;

  it('記録がある (空の再生が自明に緑にならない)', () => {
    expect(corpus).not.toBeNull();
    expect(corpus!.boxes.length).toBeGreaterThanOrEqual(4);
    expect(corpus!.attacks.length).toBeGreaterThanOrEqual(300);
  });

  it('★ 記録した攻撃のどれも、どの箱からも奪えず壊せず、箱の外へも出ない (赤の得点 0)', () => {
    const breaches: string[] = [];
    // 箱を名指しする攻撃は名指しの箱へ、`target: *` の攻撃 (電池の弾など・箱の名前を引かない) は代表の箱 3 つへ (全部へ当てると 1 分を超える)
    const REPRESENTATIVE = ['vault', 'token', 'frozen-table'];
    for (const atk of corpus!.attacks) {
      const wildcard = (atk as { targets?: string[] }).targets?.includes('*') ?? true;
      for (const box of corpus!.boxes) {
        if (wildcard && !REPRESENTATIVE.includes(box.name)) continue;
        const r = arena.play({ compiler, box, attackSrc: atk.source, seed: 7, level: LEVEL });
        if (r.side === 'red') breaches.push(`${atk.name} × ${box.name}: ${r.verdict} — ${r.detail}`);
      }
    }
    expect(breaches).toEqual([]);
  }, 600_000);
});
