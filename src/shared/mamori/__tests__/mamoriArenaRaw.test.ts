import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/*
 * **対戦場の生の TypeScript の呼び手** (2026-11-09 · 周回 9)。Mamori の攻めは攻める側のコンパイルで言語に書き込みを断られるので、
 * 箱が実行時に持つ凍結 (`Object.freeze`) を測れない。生の呼び手は言語を通らず箱の公開物へ直接書き込む。
 * 見るのは (1) 攻めが箱の export から導かれること (2) 実物の箱は壊れず (3) 共有する凍った定数の凍結を外した弱体化は壊れること
 * (4) 呼び出しごとに作り直す返り値の凍結は観測できない (等価) こと。
 */
const require_ = createRequire(import.meta.url);
const raw = require_('../../../../scripts/lib/mamori-arena-raw.cjs') as {
  exportsOf: (s: string) => { consts: string[]; fns: string[]; argFns: { name: string; n: number }[] };
  rawAttacksFor: (box: { source: string }) => { name: string; src: string }[];
  rawBox: (o: { compiler: unknown; box: unknown; seed: number; level?: string }) => { box: string; wins: unknown[]; blue: { op: string; caught: boolean }[]; attacks: number };
};
const arena = require_('../../../../scripts/lib/mamori-arena-judge.cjs') as { loadCompiler: () => unknown; strongAvailable: () => boolean };
// CI のランナーは unshare -rn (網を閉じた箱) が使えない。そのとき既定の 'strong' は 'unavailable' を返し、赤が勝てず青の較正が「捕まえなかった」と読める。
// 凍結の観測は網に依らないので、使えない環境では 'permission' (弱い箱) で測る (mamoriArena.test.ts と同じ形)。
const LEVEL = arena.strongAvailable() ? 'strong' : 'permission';
const corpus = require_('../../../../security/mamori-arena/corpus.json') as { boxes: { name: string; source: string; spec: unknown }[] };

describe('生の呼び手の攻めは箱の export から導かれる', () => {
  it('定数・引数なしの関数・引数ありの関数を分けて数える', () => {
    const e = raw.exportsOf('export const A = 1;\nexport fn f() -> number { return 1; }\nexport fn g(a: string, b: number) -> number { return 1; }\n');
    expect(e.consts).toEqual(['A']);
    expect(e.fns).toEqual(['f']);
    expect(e.argFns).toEqual([{ name: 'g', n: 2 }]);
  });
  it('公開物が無い箱には攻めを作らない', () => {
    expect(raw.rawAttacksFor({ source: 'const X = 1;\n' })).toEqual([]);
  });
  it('付け替え (m.X = …) は攻めに入れない (CommonJS の artifact・ESM では TypeError)', () => {
    const names = raw.rawAttacksFor({ source: 'export const A = 1;\n' }).map((a) => a.name);
    expect(names).toEqual(['raw-tamper-consts']);
  });
});

// コンパイラはファイルの読み込み時に 1 度だけ読む (describe の本体で読むと変異検査が数えられない · inTestModuleLoadCensus)。
const compiler = arena.loadCompiler();
describe('生の呼び手の実測 (実物の審判)', () => {
  const run = (name: string) => raw.rawBox({ compiler, box: corpus.boxes.find((b) => b.name === name), seed: 1, level: LEVEL });
  it('実物の箱は壊れない (赤の勝ち 0)', () => {
    for (const name of ['config', 'frozen-table', 'readonly-records', 'cap-object', 'switch-dispatch']) expect(run(name).wins, name).toEqual([]);
  });
  it('共有する凍った定数の凍結を外すと壊れる (青の較正が捕まえる)', () => {
    for (const name of ['config', 'frozen-table']) expect(run(name).blue, name).toEqual([{ box: name, op: 'unfreeze', caught: true, how: 'raw-tamper-consts' }]);
  });
  it('呼び出しごとに作り直す返り値の凍結は観測できない (等価な弱体化)', () => {
    for (const name of ['readonly-records', 'cap-object', 'switch-dispatch']) expect(run(name).blue[0]?.caught, name).toBe(false);
  });
});
