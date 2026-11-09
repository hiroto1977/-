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
    parseExports: (src: string) => { fns: { name: string; params: string[]; returns: string; async?: boolean }[]; consts: string[] };
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
    expect(ops).toEqual(expect.arrayContaining(['export-secret', 'leak-fn', 'leak-prefix', 'leak-hook', 'leak-ticks', 'leak-redos', 'leak-hang']));
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

describe(`観点 (レンズ) × 多層の津波 (${LEVEL})`, () => {
  type Win = { lens: string; verdict: string; detail: string; program: string };
  const lenses = require_('../../../../scripts/lib/mamori-arena-lenses.cjs') as {
    LENSES: { id: string; ja: string; note: string }[];
    waveGenomes: (o: Record<string, unknown>) => { lens: string; genome: { k: string }[] }[];
    variantsFor: (id: string, intensity: number, w: Record<string, number> | null) => number;
    BREAKOUTS: string[];
    LEGAL_LOOKALIKES: string[];
  };
  const wave = require_('../../../../scripts/lib/mamori-arena-wave.cjs') as {
    runBoxWave: (o: Record<string, unknown>) => { box: string; plays: number; stats: Record<string, { plays: number; refused: number; held: number; red: number; rules: Record<string, number> }>; wins: Win[]; near: Record<string, { fresh: number; program: string }>; tokens: string[] };
    blueCalibrate: (o: Record<string, unknown>) => { op: string; caught: boolean; lenses: string[] }[];
    analyzeStats: (s: Record<string, unknown>) => { lens: string; reach: number; topRule: string | null }[];
    countermeasureOf: (w: { lens: string; verdict: string }) => { cause: string; hardening: string; lens: string };
    applyWaveResults: (o: Record<string, unknown>) => { tally: { red: number; near: number; caught: number; uncaught: number }; table: unknown[]; weights: Record<string, number> };
    weightsFrom: (s: Record<string, unknown>) => Record<string, number>;
    mergeStat: (a: unknown, b: unknown) => { plays: number; rules: Record<string, number> };
  };
  const evo = require_('../../../../scripts/lib/mamori-arena-evolve.cjs') as { programOf: (box: string, g: unknown[], tag: string) => string; parseExports: (src: string) => { fns: { name: string; async?: boolean; params: string[] }[] } };

  it('観点は 12 ・それぞれ日本語の名と狙いを持つ (思考の視点が欠けない)', () => {
    expect(lenses.LENSES.map((l) => l.ja)).toEqual(['逆算', '俯瞰', '批判', '合理', '客観', '抽象', '妄想', '心理的不安', '時間', '瞬間移動', '悪夢', '越境']);
    for (const l of lenses.LENSES) { expect(l.id).toMatch(/^[a-z]+$/); expect(l.note.length).toBeGreaterThan(10); }
  });

  it('★ 同じ種は同じ波・種を変えると別の波・多層 (layered) は別々の観点を重ねる', () => {
    const a = lenses.waveGenomes({ box: VAULT, seed: 5, intensity: 3 });
    const b = lenses.waveGenomes({ box: VAULT, seed: 5, intensity: 3 });
    const c = lenses.waveGenomes({ box: VAULT, seed: 6, intensity: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    const layered = a.filter((x) => x.lens.startsWith('layered:'));
    expect(layered.length).toBeGreaterThan(0);
    for (const l of layered) { expect(l.lens.split(':')[1]?.split('+').length ?? 0).toBeGreaterThanOrEqual(2); expect(l.lens).not.toContain('breakout'); }
    for (const lens of lenses.LENSES) expect(a.some((x) => x.lens === lens.id), `観点 ${lens.id} の攻めが出ない`).toBe(true);
  });

  it('重みは届く観点へ多く撃つ・重みが無ければ均等 (学習が次の波の配分を変える)', () => {
    expect(lenses.variantsFor('reverse', 6, { reverse: 0.9 })).toBeGreaterThan(lenses.variantsFor('reverse', 6, { reverse: 0.1 }));
    expect(lenses.variantsFor('reverse', 6, null)).toBe(6);
    expect(lenses.variantsFor('reverse', 1, { reverse: 0 })).toBeGreaterThanOrEqual(1);
    const w = wave.weightsFrom({ reverse: { plays: 10, held: 9 }, breakout: { plays: 10, held: 0 } });
    expect(w.reverse).toBeGreaterThan(w.breakout ?? 1);
  });

  it('★ 津波を VAULT に当てる: 赤の勝ちは 0 ・越境は言語の規則 (M6) で全部止まる・他の観点は箱の奥まで届く', () => {
    const r = wave.runBoxWave({ compiler, box: VAULT, seed: 3, waves: 1, intensity: 2, level: LEVEL });
    expect(r.wins).toEqual([]);
    const s = r.stats;
    expect((s.breakout?.refused ?? 0)).toBe(s.breakout?.plays);
    expect(Object.keys(s.breakout?.rules ?? {})).toContain('M6');
    for (const id of ['reverse', 'overview', 'paranoid', 'anxious', 'temporal']) expect(s[id]?.held ?? 0, `観点 ${id} が箱の奥まで届かない`).toBeGreaterThan(0);
    expect(r.plays).toBeGreaterThanOrEqual(30);
    const table = wave.analyzeStats(s);
    expect(table.find((t) => t.lens === 'breakout')?.reach).toBe(0);
    expect(table.find((t) => t.lens === 'breakout')?.topRule).toBeTruthy();
  }, 120_000);

  it('★ 瞬間移動: 相手のエリアの内部の名前へ飛ぶ攻めは門前で跳ね返され (bounced)・形の違う物を持ち込む攻めは箱の奥まで届く・赤の勝ちは 0', () => {
    const r = wave.runBoxWave({ compiler, box: VAULT, seed: 3, waves: 1, intensity: 3, level: LEVEL });
    expect(r.wins).toEqual([]);
    expect((r.stats.teleport as { bounced?: number } | undefined)?.bounced ?? 0).toBeGreaterThan(0);
    const distrust = { name: 'distrust', source: 'const SECRET = "@@SECRET@@";\nexport fn joinSafe(xs: string[]) -> string {\n  const out: string[] = [];\n  for (const x of xs.slice(0, 10)) { out.push(x); }\n  return out.join(",");\n}\nexport fn rec() -> string { return "@@REC_A@@"; }\n', spec: { contract: [{ fn: 'rec', args: [], expect: '@@REC_A@@' }] } };
    const d = wave.runBoxWave({ compiler, box: distrust, seed: 3, waves: 1, intensity: 3, level: LEVEL });
    expect(d.wins).toEqual([]);
    expect((d.stats.teleport as { held?: number } | undefined)?.held ?? 0, '配列を持ち込む攻めが箱の奥まで届かない').toBeGreaterThan(0);
    // ghost (内部の名前へ飛ぶだけ) の攻めは多層の重ねに入らない: 入ると重ね全体が門前で返され他の層が見えなくなる
    for (const x of lenses.waveGenomes({ box: distrust, seed: 8, intensity: 4 }).filter((y) => y.lens.startsWith('layered'))) expect(x.genome.some((m) => (m as { ghost?: boolean }).ghost)).toBe(false);
  }, 120_000);

  it('瞬間移動は箱の源から内部の名前 (export していない const・fn) を読み取って指名する (SECRET / REC を含む)', () => {
    const names = lenses.waveGenomes({ box: VAULT, seed: 3, intensity: 8 }).filter((x) => x.lens === 'teleport').flatMap((x) => x.genome.map((m) => (m as { e?: string }).e));
    expect(names).toContain('SECRET');
  });

  it('★ 悪夢 (防ぎようが無いと守る側が思う攻め): await の回数を時計にした計時の盗み聞きが、先頭一致で await が増える口から秘密を 1 文字ずつ復元する', () => {
    const naive = { name: 'naive-async', source: 'const SECRET = "@@SECRET@@";\nexport fn rec() -> string { return "@@REC_A@@"; }\nexport async fn probeSlow(g: string) -> Promise<boolean> {\n  let i = 0;\n  while (i < 40) {\n    if (g.length > i && g.slice(i, i + 1) === SECRET.slice(i, i + 1)) { await Promise.resolve(0); } else { return false; }\n    i = i + 1;\n  }\n  return true;\n}\n', spec: { contract: [{ fn: 'rec', args: [], expect: '@@REC_A@@' }] } };
    const r = wave.runBoxWave({ compiler, box: naive, seed: 3, waves: 1, intensity: 1, level: LEVEL });
    const win = r.wins.find((w) => w.lens === 'nightmare');
    expect(win, '計時の盗み聞きが秘密を復元できない (攻めが壊れている)').toBeTruthy();
    expect(win?.verdict).toBe('stolen');
  }, 120_000);

  it('★ 悪夢への対策: await の回数を入力に依らず一定にした箱 (async-compare) は、同じ攻めで秘密を復元されない', () => {
    const p = `${arena.REPO_ROOT}/security/mamori-arena/corpus.json`;
    const box = (JSON.parse(readOriginalSource(p)) as { boxes: { name: string; source: string; spec: unknown }[] }).boxes.find((b) => b.name === 'async-compare');
    expect(box, 'async-compare の箱が記録に無い').toBeTruthy();
    const r = wave.runBoxWave({ compiler, box, seed: 3, waves: 1, intensity: 1, level: LEVEL });
    expect(r.wins).toEqual([]);
    expect((r.stats.nightmare as { held?: number } | undefined)?.held ?? 0, '計時の攻めが箱の奥まで届かない (対照が空になる)').toBeGreaterThan(0);
  }, 120_000);

  it('★ 悪夢 2 (戻らなくさせる): 数十文字の入力で戻らなくなる口 (破滅的な正規表現) と、戻らない関数を無期限に待つ口は、速く終わる攻めで stalled (口の欠陥) として破られる', () => {
    const redos = { name: 'redos', source: 'const SECRET = "@@SECRET@@";\nexport fn matchEvil(s: string) -> boolean { return /^(a+)+$/.test(s); }\nexport fn rec() -> string { return "@@REC_A@@"; }\n', spec: { contract: [{ fn: 'rec', args: [], expect: '@@REC_A@@' }] } };
    const hang = { name: 'hang', source: 'const SECRET = "@@SECRET@@";\nexport async fn hangOn(cb: (s: string) => Promise<string>) -> Promise<string> { return await cb("x"); }\nexport fn rec() -> string { return "@@REC_A@@"; }\n', spec: { contract: [{ fn: 'rec', args: [], expect: '@@REC_A@@' }] } };
    for (const box of [redos, hang]) {
      const r = wave.runBoxWave({ compiler, box, seed: 3, waves: 1, intensity: 1, level: LEVEL });
      expect(r.wins.some((w) => w.verdict === 'stalled' && w.lens.includes('nightmare')), `${box.name}: 戻らない口を stalled として捕まえられない`).toBe(true);
    }
  }, 180_000);

  it('★ 悪夢 2 への対策: 入力の長さを縛り線形に走査する箱 (redos-guard)・戻らない関数を有限回の tick で打ち切る箱 (bounded-await と直した async-vault) は stalled にならない', () => {
    const p = `${arena.REPO_ROOT}/security/mamori-arena/corpus.json`;
    const boxes = (JSON.parse(readOriginalSource(p)) as { boxes: { name: string; source: string; spec: unknown }[] }).boxes;
    for (const name of ['redos-guard', 'bounded-await', 'async-vault']) {
      const box = boxes.find((b) => b.name === name);
      expect(box, `${name} の箱が記録に無い`).toBeTruthy();
      const r = wave.runBoxWave({ compiler, box, seed: 3, waves: 1, intensity: 1, level: LEVEL });
      expect(r.wins, name).toEqual([]);
    }
  }, 240_000);

  it('async の口 (export async fn と Promise を返すコールバック) も API に入る (盲点の回帰: async-vault は今まで一度も撃たれていなかった)', () => {
    const api = evo.parseExports('export async fn a(k: string) -> Promise<string> { return k; }\nexport async fn m(cb: (s: string) => Promise<string>) -> Promise<string> { return ""; }\n');
    expect(api.fns.map((f) => f.name)).toEqual(['a', 'm']);
    expect(api.fns[0]?.async).toBe(true);
    expect(api.fns[1]?.params).toEqual(['acb:string']);
  });

  it('資源枯渇 (打ち切られた攻め) は exhausted に数える・赤の勝ちには数えない (同居者の資源枯渇を止めるのは箱の外の期限)', () => {
    const src = evo.programOf('vault', [{ k: 'block', code: 'let i = 0; while (true) { i = i + 1; }' }], 'burn');
    const r = play(VAULT, src, 31);
    expect(r.verdict).toBe('hang');
    expect(r.side).toBe('void');
  }, 60_000);

  it('★ 青の較正: 守りを外した箱 (秘密を返す口を足した) を、観点のどれかが捕まえる (レンズ全体の目が利いている)', () => {
    const blue = wave.blueCalibrate({ compiler, box: VAULT, seed: 4, level: LEVEL });
    expect(blue.length).toBeGreaterThan(0);
    for (const b of blue) { expect(b.caught, `${b.op} を観点のどれも捕まえられなかった`).toBe(true); expect(b.lenses.length).toBeGreaterThan(0); }
  }, 120_000);

  it('★ 対策: 破られた攻めは原因と直し方に分類され、回帰の攻撃として corpus へ・赤の勝ちは記録へ入る (捕獲 → 解析 → 対策 → 学習)', () => {
    for (const verdict of ['stolen', 'destroyed', 'escaped']) {
      const cm = wave.countermeasureOf({ lens: 'layered:anxious+reverse', verdict });
      expect(cm.cause.length).toBeGreaterThan(5); expect(cm.hardening.length).toBeGreaterThan(5); expect(cm.lens).toBe('layered');
    }
    const state = { boxes: {} as Record<string, unknown>, history: [], lessons: [] as unknown[], gaps: [] as unknown[], wins: [] as unknown[], lenses: undefined, waves: undefined };
    const corpus = { boxes: [], attacks: [] as { name: string }[], history: [] };
    const win = { lens: 'reverse', verdict: 'stolen', detail: 'x', program: 'p' };
    const out = wave.applyWaveResults({
      state, corpus, seed: 9, waves: 1, intensity: 2,
      results: [{ box: 'vault', wave: { plays: 3, stats: { reverse: { plays: 3, refused: 0, held: 2, red: 1, void: 0, fresh: 4, rules: {} } }, wins: [win], near: { reverse: { fresh: 4, program: 'q' } }, tokens: ['alpha-token'] }, blue: [{ box: 'vault', op: 'unfreeze', caught: false, lenses: [] }, { box: 'vault', op: 'leak-fn', caught: true, lenses: ['reverse'], verdict: 'stolen', program: 'z' }] }],
    });
    expect(out.tally).toMatchObject({ red: 1, near: 1, caught: 1, uncaught: 1 });
    expect(state.wins.length).toBe(1);
    expect(corpus.attacks.map((a) => a.name).sort()).toEqual(['wave-reverse-vault', 'wave-win-reverse-vault-9']);
    expect(state.gaps).toHaveLength(1);
    expect(state.lessons.length).toBeGreaterThanOrEqual(2);
    expect(out.weights.reverse).toBeGreaterThan(0);
    // 統計の合算 (次の波へ積む)
    const m = wave.mergeStat({ plays: 2, rules: { M6: 1 } }, { plays: 3, rules: { M6: 2, tsc: 1 } });
    expect(m.plays).toBe(5); expect(m.rules).toEqual({ M6: 3, tsc: 1 });
  });

  it('越境の弾 (言語が断るはずの構文) は全部が言語の規則で止まる・合法に通る見かけだけ危ない形は通っても箱の外へ出ない', () => {
    const accepted: string[] = [];
    for (const e of lenses.BREAKOUTS) {
      const r = play(VAULT, evo.programOf('vault', [{ k: 'raw', e }], 'breakout-check'), 21);
      if (r.verdict !== 'refused') accepted.push(e);
    }
    expect(accepted).toEqual([]);
    for (const e of lenses.LEGAL_LOOKALIKES) {
      const r = play(VAULT, evo.programOf('vault', [{ k: 'raw', e }], 'legal-check'), 21);
      expect(r.verdict, e).toBe('held');
    }
  }, 120_000);

  it('進化の記録に観点の成績・波の履歴がある (津波が学習に残っている)', () => {
    const p = `${arena.REPO_ROOT}/security/mamori-arena/evolution.json`;
    const e = JSON.parse(readOriginalSource(p)) as { wins: unknown[]; lenses?: Record<string, { plays: number; red: number }>; waves?: { red: number }[] };
    expect(e.wins).toEqual([]);
    expect(Object.keys(e.lenses ?? {}).length).toBeGreaterThanOrEqual(10);
    for (const l of lenses.LENSES) expect(e.lenses?.[l.id]?.plays ?? 0, `観点 ${l.id} の戦が記録に無い`).toBeGreaterThan(0);
    expect((e.waves ?? []).length).toBeGreaterThan(0);
    for (const w of e.waves ?? []) expect(w.red).toBe(0);
  });
});

describe(`再戦と連打 (${LEVEL})`, () => {
  type Parts = { head: string[]; body: string[] };
  const rm = require_('../../../../scripts/lib/mamori-arena-rematch.cjs') as {
    OPS: string[];
    parseAttack: (src: string) => Parts | null;
    render: (p: Parts, extraHead?: string[]) => string;
    variantOf: (o: { parts: Parts; op: string; rng: () => number; donors?: Parts[]; learned?: string[] }) => { body: string[]; extraHead?: string[] } | null;
    opWeights: (s: Record<string, unknown> | null) => Record<string, number>;
    pickSeeds: (o: { corpus: { attacks: { name: string; targets: string[]; firstVerdict: string; source: string }[] }; boxName: string; per?: number }) => { name: string }[];
    rematchBox: (o: Record<string, unknown>) => { plays: number; ops: Record<string, { plays: number; red: number; held: number }>; wins: { op: string; verdict: string; program: string; from: string }[]; near: Record<string, { fresh: number; program: string; from: string }> };
    hammerRepeat: (o: Record<string, unknown>) => { red: boolean; plays: number; wobble: { kind: string } | null };
    applyRematchResults: (o: Record<string, unknown>) => { tally: { red: number; near: number; wobbles: number; plays: number } };
  };
  const evo = require_('../../../../scripts/lib/mamori-arena-evolve.cjs') as {
    programOf: (box: string, g: unknown[], tag: string) => string;
    mulberry32: (n: number) => () => number;
  };
  const SEED_SRC = evo.programOf('vault', [{ k: 'call', fn: 'lookup', args: ['"a"'], aw: false }, { k: 'call', fn: 'check', args: ['"x"'], aw: false }], 'seed');
  const parts = rm.parseAttack(SEED_SRC)!;

  it('攻撃のプログラムを 頭と体 に分けて、同じ形へ戻せる (往復・async と宣言つきも)', () => {
    expect(parts.body).toHaveLength(2);
    expect(rm.render(parts)).toBe(SEED_SRC);
    const asyncSrc = evo.programOf('async-vault', [{ k: 'call', fn: 'mapNotes', args: ['acbEcho'], aw: true }], 'seed');
    const p = rm.parseAttack(asyncSrc)!;
    expect(p.head.some((l) => l.startsWith('async fn acbEcho'))).toBe(true);
    expect(rm.render(p)).toBe(asyncSrc);
    // 手書きの攻撃 (programOf の形でない) は読まない = 組み替えで壊さない
    expect(rm.parseAttack('export fn attack() -> unknown { return 1; }')).toBeNull();
  });

  it('★ 連打の変種は同じ口を何度も叩く (burst は 8 回以上・alternate は引数を入れ替えて 12 回・interleave は交互)', () => {
    const rng = evo.mulberry32(5);
    const burst = rm.variantOf({ parts, op: 'burst', rng })!;
    expect(burst.body.length).toBeGreaterThanOrEqual(8);
    const alt = rm.variantOf({ parts, op: 'alternate', rng })!;
    expect(alt.body.length).toBeGreaterThanOrEqual(12);
    const inter = rm.variantOf({ parts, op: 'interleave', rng })!;
    expect(inter.body).toHaveLength(16);
    expect(inter.body[0]).toBe(inter.body[2]);
    expect(inter.body[1]).toBe(inter.body[3]);
    // 連打しても 1 行 1 動きの形は壊れない (もう一度読める)
    expect(rm.parseAttack(rm.render({ head: parts.head, body: burst.body }))!.body).toEqual(burst.body);
  });

  it('同じ種は同じ変種・別の視点 (literal-swap / graft) は元と違う・await を持つ動きを移植したら attack は async になる', () => {
    const a = rm.variantOf({ parts, op: 'literal-swap', rng: evo.mulberry32(9) })!;
    const b = rm.variantOf({ parts, op: 'literal-swap', rng: evo.mulberry32(9) })!;
    expect(a).toEqual(b);
    expect(a.body).not.toEqual(parts.body);
    const donor = rm.parseAttack(evo.programOf('async-vault', [{ k: 'call', fn: 'mapNotes', args: ['acbEcho'], aw: true }], 'seed'))!;
    const g = rm.variantOf({ parts, op: 'graft', rng: evo.mulberry32(3), donors: [donor] })!;
    const out = rm.render({ head: parts.head, body: g.body }, g.extraHead);
    expect(out).toContain('export async fn attack()');
    expect(out).toContain('async fn acbEcho');
    // 変えられない形は null (空振りを戦に数えない)
    expect(rm.variantOf({ parts: { head: parts.head, body: [] }, op: 'burst', rng: evo.mulberry32(1) })).toBeNull();
    expect(rm.variantOf({ parts: { head: parts.head, body: [parts.body[0]!] }, op: 'reverse', rng: evo.mulberry32(1) })).toBeNull();
  });

  it('変え方の重みは届いた変え方へ寄る (観点の重みと同じ式)・統計が無ければ均等', () => {
    expect(Object.values(rm.opWeights(null)).every((x) => x === 0.5)).toBe(true);
    const w = rm.opWeights({ burst: { plays: 10, held: 10 }, reverse: { plays: 10, held: 0 } });
    expect(w.burst).toBeGreaterThan(w.reverse!);
    expect(Object.keys(w).sort()).toEqual([...rm.OPS].sort());
  });

  it('種の攻撃の選び方: 名指しの攻撃を先に・同じ字面は 1 つ・per で切る', () => {
    const corpus = { attacks: [
      { name: 'x1', targets: ['vault'], firstVerdict: 'refused', source: 'a' },
      { name: 'wave-win-q', targets: ['vault'], firstVerdict: 'stolen', source: 'b' },
      { name: 'x2', targets: ['vault'], firstVerdict: 'held', source: 'a' },
      { name: 'other', targets: ['token'], firstVerdict: 'held', source: 'c' },
    ] };
    const picked = rm.pickSeeds({ corpus, boxName: 'vault', per: 5 }).map((a) => a.name);
    expect(picked[0]).toBe('wave-win-q');
    expect(picked).not.toContain('other');
    expect(picked.filter((n) => n === 'x1' || n === 'x2')).toHaveLength(1);
    expect(rm.pickSeeds({ corpus, boxName: 'vault', per: 1 })).toHaveLength(1);
  });

  it('★ 再戦: 正直な箱 (VAULT) の前の攻撃を作り直して撃っても赤は 0 ・連打しても箱の奥へ届くだけ', () => {
    const corpus = { attacks: [{ name: 'seed', targets: ['vault'], firstVerdict: 'held', source: SEED_SRC }] };
    const r = rm.rematchBox({ compiler, box: VAULT, corpus, seed: 11, per: 3, variants: 12, level: LEVEL });
    expect(r.plays).toBeGreaterThanOrEqual(3);
    expect(r.wins).toEqual([]);
    expect(Object.values(r.ops).reduce((n, s) => n + s.held, 0)).toBeGreaterThan(0);
  }, 120_000);

  it('★ 再戦: 秘密を返す箱 (LEAKY) には、前の攻撃のどの変種でも stolen になる (視点を変えても穴は穴・対策の根拠が残る)', () => {
    const src = evo.programOf('leaky', [{ k: 'call', fn: 'dump', args: [], aw: false }], 'seed');
    const corpus = { attacks: [{ name: 'seed-dump', targets: ['leaky'], firstVerdict: 'stolen', source: src }] };
    const r = rm.rematchBox({ compiler, box: LEAKY, corpus, seed: 12, per: 2, variants: 5, level: LEVEL });
    expect(r.wins.length).toBeGreaterThan(0);
    expect(r.wins.every((w) => w.verdict === 'stolen')).toBe(true);
    expect(r.wins[0]!.from).toBe('seed-dump');
  }, 120_000);

  it('★ 連打 (繰り返し): 正直な箱は 5 回撃っても判定が揺れない・赤にもならない / 穴の箱は赤が毎回出る (揺れずに破られる)', () => {
    const h = rm.hammerRepeat({ compiler, box: VAULT, attack: { name: 'seed', source: SEED_SRC }, seed: 21, level: LEVEL });
    expect(h.plays).toBe(5);
    expect(h.wobble).toBeNull();
    expect(h.red).toBe(false);
    const leak = evo.programOf('leaky', [{ k: 'call', fn: 'dump', args: [], aw: false }], 'seed');
    const hl = rm.hammerRepeat({ compiler, box: LEAKY, attack: { name: 'dump', source: leak }, seed: 21, level: LEVEL });
    expect(hl.red).toBe(true);
    expect(hl.wobble).toBeNull();
  }, 180_000);

  it('結果を記録へ畳む: 破れは対策つきで wins と回帰の攻撃へ・近い攻めは捕獲・揺らぎは台帳 (同じ組は 1 件に更新)・ops の成績が積まれる', () => {
    const state: Record<string, unknown> = { boxes: {}, wins: [], lessons: [], gaps: [] };
    const corpus = { attacks: [] as { name: string }[] };
    const mk = (wobble: unknown) => [{
      box: 'vault',
      rematch: { plays: 3, ops: { burst: { plays: 3, refused: 0, held: 2, red: 1, void: 0, bounced: 0, exhausted: 0, fresh: 4 } }, wins: [{ op: 'burst', from: 'seed', verdict: 'stolen', detail: 'x', program: 'P' }], near: { alternate: { op: 'alternate', from: 'seed', fresh: 3, program: 'Q' } }, tokens: ['abcd'] },
      hammer: [{ box: 'vault', attack: 'seed', plays: 5, red: false, wobble }],
      blue: [],
    }];
    const s1 = rm.applyRematchResults({ state, corpus, results: mk({ kind: 'verdict-flip', verdicts: ['held', 'refused'] }), seed: 7 });
    expect(s1.tally).toMatchObject({ red: 1, near: 1, wobbles: 1 });
    expect(corpus.attacks.map((a) => a.name).sort()).toEqual(['rematch-alternate-vault', 'rematch-win-burst-vault-7']);
    const st = state as { wins: { cause: string; lens: string }[]; rematch: { ops: Record<string, { plays: number }>; wobbles: unknown[]; runs: unknown[] } };
    expect(st.wins[0]!.cause).toContain('仮想データ');
    expect(st.wins[0]!.lens).toBe('rematch:burst');
    rm.applyRematchResults({ state, corpus, results: mk({ kind: 'same-seed-output', detail: ['a', 'b'] }), seed: 8 });
    expect(st.rematch.wobbles).toHaveLength(1);
    expect(st.rematch.ops.burst!.plays).toBe(6);
    expect(st.rematch.runs).toHaveLength(2);
  });

  it('進化の記録に再戦の成績・揺らぎの台帳がある (再戦が学習に残っている)', () => {
    const path = `${arena.REPO_ROOT}/security/mamori-arena/evolution.json`;
    const state = JSON.parse(readOriginalSource(path)) as { rematch?: { ops: Record<string, { plays: number }>; runs: unknown[]; wobbles: unknown[] } };
    expect(state.rematch).toBeDefined();
    expect(state.rematch!.runs.length).toBeGreaterThanOrEqual(1);
    for (const op of Object.keys(state.rematch!.ops)) expect(rm.OPS).toContain(op);
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

  it('★ stalled で破られた攻めの回帰: 直した箱は同じ攻めでもう口が戻らなくならない (hang が再び出たら欠陥が戻っている)', () => {
    const stalled = corpus!.attacks.filter((a) => (a as { firstVerdict?: string }).firstVerdict === 'stalled');
    for (const atk of stalled) {
      for (const name of (atk as { targets?: string[] }).targets ?? []) {
        const box = corpus!.boxes.find((b) => b.name === name);
        if (!box) continue;
        const r = arena.play({ compiler, box, attackSrc: atk.source, seed: 7, level: LEVEL });
        expect(r.verdict, `${atk.name} × ${name}`).not.toBe('hang');
      }
    }
  }, 300_000);

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
