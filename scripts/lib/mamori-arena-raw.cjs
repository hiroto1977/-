'use strict';
/**
 * 生の TypeScript の呼び手の攻め (周回 9 · 2026-11-09)。
 *
 * 津波・再戦・掛け合わせの攻めは Mamori で書かれ、**攻める側のコンパイルの時点で言語が書き込み (`x.k = v` / `Object.assign` ほか) を断る**。
 * だから箱が実行時に持つ凍結 (`Object.freeze`) は、赤からは「言語の規則の後ろの二重の守り」に見えて、外しても結果が変わらない
 * (合戦の実測: `unfreeze` の弱体化 5 件を赤のどの手も捕まえなかった)。生成物 `.ts` を使うのは Mamori だけではない —— TypeScript / JavaScript の呼び手は
 * 言語の規則を通らない。ここはその呼び手になって、箱が公開した物へ直接書き込み、契約 (同じ呼び出しが同じ答えを返す) が壊れるかを見る。
 *
 * 攻めは箱の export から導く: 公開した定数と、関数の返り値を再帰でたどって全部の欄を書き換え・消し・配列を壊す。
 * 実物の箱で壊れたら赤の勝ち (凍結が働いていない = 本物の欠陥)。凍結を外した弱体化の箱で壊れたら青の較正が「捕まえた」。
 */
const arena = require('./mamori-arena-judge.cjs');
const evo = require('./mamori-arena-evolve.cjs');

/** 箱の元から、公開した定数と引数の無い関数の名前を取る。 */
function exportsOf(source) {
  const consts = [...source.matchAll(/^export\s+const\s+([A-Za-z_]\w*)/gm)].map((m) => m[1]);
  const fns = [...source.matchAll(/^export\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(\s*\)/gm)].map((m) => m[1]);
  // 引数を取る関数も撃つ: 引数の数を数えて、文字列・数・空の物の 3 通りで呼ぶ (返り値の凍結を調べるので引数の中身は何でもよい)
  const argFns = [...source.matchAll(/^export\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(([^)]+)\)/gm)].map((m) => ({ name: m[1], n: m[2].split(',').length }));
  return { consts, fns, argFns };
}

const TAMPER = `
function tamper(o: any, seen: Set<any>): void {
  if (o === null || typeof o !== 'object' || seen.has(o)) return;
  seen.add(o);
  for (const k of Reflect.ownKeys(o)) { try { tamper(o[k], seen); } catch {} }
  for (const k of Reflect.ownKeys(o)) { try { o[k] = 'PWNED'; } catch {} }
  for (const k of Reflect.ownKeys(o)) { try { Object.defineProperty(o, k, { value: 'PWNED' }); } catch {} }
  for (const k of Reflect.ownKeys(o)) { try { delete o[k]; } catch {} }
  if (Array.isArray(o)) { try { o.push('PWNED'); } catch {} try { o.length = 0; } catch {} }
}
`;

/** 生の攻めの一覧 (名前つき)。 */
function rawAttacksFor(box) {
  const { consts, fns, argFns } = exportsOf(box.source);
  const out = [];
  const head = `import * as d from "./defender";\n${TAMPER}\n`;
  if (consts.length > 0) {
    out.push({ name: 'raw-tamper-consts', src: head + `export function attack(): unknown { const m: any = d; ${consts.map((c) => `tamper(m.${c}, new Set());`).join(' ')} return 1; }\n` });
    // ★ 公開した名前そのものの付け替え (`m.X = …`) は攻めに入れない: CommonJS に変換した生成物では exports の欄が普通の欄なので付け替わるが、
    //   ESM の名前空間は読み取り専用で付け替えは TypeError になり、束ねた単一 HTML では exports という物そのものが無い。
    //   つまり言語の守りではなく**実行形態の性質**で、箱の凍結とは別の話 (周回 9 の初回実測で赤が 2 勝したのはこの付け替え —— 道具の artifact)。
  }
  if (fns.length > 0 || argFns.length > 0) {
    const calls = [
      ...fns.map((f) => `try { tamper(m.${f}(), new Set()); } catch {}`),
      ...argFns.flatMap((f) => ['"a"', '0', '{}'].map((v) => `try { tamper(m.${f.name}(${Array(f.n).fill(v).join(', ')}), new Set()); } catch {}`)),
    ];
    out.push({ name: 'raw-tamper-returns', src: head + `export function attack(): unknown { const m: any = d; ${calls.join(' ')} return 1; }\n` });
  }
  return out;
}

/** 1 つの箱 (実物と、凍結を外した弱体化) を生の攻めで撃つ。 */
function rawBox({ compiler, box, seed, level = 'strong' }) {
  const attacks = rawAttacksFor(box);
  const wins = [];
  let plays = 0;
  for (const a of attacks) {
    const res = arena.playRaw({ compiler, box, attackTs: a.src, seed, level });
    plays++;
    if (res.side === 'red') wins.push({ lens: 'raw', op: a.name, verdict: res.verdict, detail: String(res.detail).slice(0, 200), program: a.src });
  }
  const blue = [];
  const unfrozen = evo.weaken(box.source).find((w) => w.op === 'unfreeze');
  if (unfrozen) {
    const weak = { name: box.name + '+unfreeze', source: unfrozen.source, spec: box.spec };
    let caught = false;
    let how = null;
    for (const a of attacks) {
      const res = arena.playRaw({ compiler, box: weak, attackTs: a.src, seed, level });
      plays++;
      if (res.side === 'red') { caught = true; how = a.name; break; }
    }
    blue.push({ box: box.name, op: 'unfreeze', caught, how });
  }
  return { box: box.name, plays, wins, blue, attacks: attacks.length };
}

module.exports = { exportsOf, rawAttacksFor, rawBox };
