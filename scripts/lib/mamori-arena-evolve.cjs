'use strict';
/**
 * 対戦場の自律学習・自律進化 (2026-11-08)。戦いの合間に、赤 (侵入) と青 (防御) が人も AI も介さず自分で強くなる。
 *
 *   赤: 箱が export する API (関数・定数) を動き (move) に分け、動きの列を遺伝子にして世代ごとに
 *       突然変異・交叉する。選ぶ基準は「箱の奥まで届いたか」(型で止まる < 実行まで通る < 新しい出力を引き出す < 奪取・破壊・脱出)。
 *       出力の新しさ (今まで見ていない語) を褒美にするので、同じ所を回り続けない。精鋭は次の回の種になる。
 *   青: 箱を弱体化させた変異体 (凍結を外す・秘密を export する・秘密を返す関数を足す) を作り、赤がそれを破れるかを測る。
 *       破れた = 赤は目が利く (守りが効いている証拠)。破れない = 赤の盲点か、その守りが言語の規則でもう要らない冗長か。
 *       どちらも記録に残り、次の世代の赤の動きの種類を増やす手がかりになる。
 *
 * 判定は `mamori-arena.cjs` の審判をそのまま使う (新しい物差しを作らない)。種を決めれば同じ結果になる。
 */
const arena = require('./mamori-arena-judge.cjs');

function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STRING_POOL = ['', 'a', 'b', 'c', 'x', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'length', '0', '-1', 'sec_', '@@', '{}', '[object Object]', 'A'.repeat(300), 'rec', 'secret', 'token', 'admin'];
const NUMBER_POOL = ['0', '1', '(0 - 1)', '255', '65536', '1000000007', '0.5'];

/** 箱の source から、攻撃が引ける名前を取る (関数は引数が string / number / boolean だけの物)。 */
function parseExports(source) {
  const fns = [];
  const consts = [];
  const others = []; // 引数が string / number / boolean / コールバック以外の口 (配列・unknown・印つきの型): 瞬間移動の観点が形ごとに撃つ
  const re = /^export\s+(?:gate\s+)?fn\s+(\w+)\s*\((.*)\)\s*->\s*([^{]+?)\s*\{/gm;
  let m;
  while ((m = re.exec(source)) !== null) {
    const params = [];
    let ok = true;
    for (const p of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
      const pm = /^(\w+)\??\s*:\s*(string|number|boolean)$/.exec(p);
      // 関数を引数に取る口 (コールバック): (s: string) => string / boolean / number。箱が秘密や内部の値を呼び出し側の関数へ渡すかを試す
      const cb = /^(\w+)\??\s*:\s*\(\w+:\s*string\)\s*=>\s*(string|boolean|number)$/.exec(p);
      if (pm) params.push(pm[2]);
      else if (cb) params.push('cb:' + cb[2]);
      else { ok = false; break; }
    }
    if (ok) fns.push({ name: m[1], params, returns: m[3].trim() });
    else others.push({ name: m[1], params: m[2].split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean), returns: m[3].trim() });
  }
  const cre = /^export\s+const\s+(\w+)\b/gm;
  while ((m = cre.exec(source)) !== null) consts.push(m[1]);
  return { fns, consts, others };
}

const CALLBACKS = {
  string: ['(s: string) => { r.push(s); return s; }', '(s: string) => { throw new Error(s); }', '(s: string) => s + s', '(s: string) => ""'],
  boolean: ['(s: string) => { r.push(s); return true; }', '(s: string) => false'],
  number: ['(s: string) => { r.push(s); return 0; }', '(s: string) => 1'],
};

function literal(kind, rng, api) {
  if (kind.startsWith('cb:')) { const pool = CALLBACKS[kind.slice(3)] || CALLBACKS.string; return pool[Math.floor(rng() * pool.length)]; }
  if (kind === 'number') return NUMBER_POOL[Math.floor(rng() * NUMBER_POOL.length)];
  if (kind === 'boolean') return rng() < 0.5 ? 'true' : 'false';
  // 前の戦いで箱が返した語 (api.learned) を引数に使う: 箱が自分で見せた識別子・記録の綴りを、別の関数への鍵として試す (戦いを踏まえた学習)
  if (api && api.learned && api.learned.length > 0 && rng() < 0.3) return JSON.stringify(api.learned[Math.floor(rng() * api.learned.length)]);
  return JSON.stringify(STRING_POOL[Math.floor(rng() * STRING_POOL.length)]);
}

function randomMove(api, rng) {
  const pick = rng();
  if (api.consts.length > 0 && pick < 0.3) {
    return { k: ['read', 'keys', 'values', 'entries'][Math.floor(rng() * 4)], c: api.consts[Math.floor(rng() * api.consts.length)] };
  }
  if (api.fns.length === 0) return null;
  const f = api.fns[Math.floor(rng() * api.fns.length)];
  if (pick > 0.8) {
    // 別の口の出力を鍵として次の口へ渡す (戦いの中で箱が見せた語をその場で使う): outer(inner(args))
    const strFns = api.fns.filter((x) => x.params.length === 1 && x.params[0] === 'string');
    const inners = api.fns.filter((x) => x.returns === 'string' && x.params.every((p) => p === 'string' || p === 'number') && x.params.length <= 1);
    if (strFns.length >= 1 && inners.length >= 1) {
      const outer = strFns[Math.floor(rng() * strFns.length)];
      const inner = inners[Math.floor(rng() * inners.length)];
      return { k: 'chain', outer: outer.name, inner: inner.name, args: inner.params.map((p) => literal(p, rng, api)) };
    }
  }
  return { k: 'call', fn: f.name, args: f.params.map((p) => literal(p, rng, api)) };
}

function moveExpr(m) {
  switch (m.k) {
    case 'call': return `${m.fn}(${m.args.join(', ')})`;
    case 'chain': return `${m.outer}(${m.inner}(${m.args.join(', ')}))`;
    case 'expr': case 'raw': return m.e;
    case 'read': return m.c;
    case 'keys': return `Object.keys(${m.c})`;
    case 'values': return `Object.values(${m.c})`;
    default: return `Object.entries(${m.c})`;
  }
}

function moveNames(m) {
  if (m.k === 'call') return [m.fn];
  if (m.k === 'chain') return [m.outer, m.inner];
  if (m.k === 'expr' || m.k === 'block') return m.names || [];
  if (m.k === 'raw') return [];
  return [m.c];
}

function programOf(boxName, genome, tag) {
  const names = [...new Set(genome.flatMap(moveNames))];
  // 1 つの動きが例外を投げても後ろの動きが走るよう、動きごとに try で包む (投げた例外そのものも戦利品として返す: 秘密を文面に載せる箱を見逃さない)
  // 'block' は文の並び (局所の配列を作って渡し、戻ってから中身を見る)。r に積む物は文の中で自分で積む
  const body = genome.map((m) => (m.k === 'block' ? `  try { ${m.code} } catch (e) { r.push(e); }` : `  try { r.push(${moveExpr(m)}); } catch (e) { r.push(e); }`)).join('\n');
  return `// target: ${boxName}\n// goal: steal / destroy (自律進化 ${tag})\n` + (names.length > 0 ? `use { ${names.join(', ')} } from "./defender";\n` : '')
    + `export fn attack() -> unknown {\n  const r: unknown[] = [];\n${body}\n  return r;\n}\n`;
}

function mutate(genome, api, rng) {
  const g = genome.map((m) => ({ ...m, args: m.args ? [...m.args] : undefined }));
  const r = rng();
  if (r < 0.35 || g.length === 0) {
    const m = randomMove(api, rng);
    if (m && g.length < 16) g.splice(Math.floor(rng() * (g.length + 1)), 0, m);
  } else if (r < 0.55 && g.length > 1) {
    g.splice(Math.floor(rng() * g.length), 1);
  } else {
    const i = Math.floor(rng() * g.length);
    const m = g[i];
    if (m.k === 'call') {
      const f = api.fns.find((x) => x.name === m.fn);
      if (f) m.args = f.params.map((p, j) => (rng() < 0.5 && m.args[j] !== undefined ? m.args[j] : literal(p, rng, api)));
    } else if (m.k === 'chain') m.args = m.args.map(() => literal('string', rng, api));
    else { const nm = randomMove(api, rng); if (nm) g[i] = nm; }
  }
  return g.length > 0 ? g : [randomMove(api, rng)].filter(Boolean);
}

function crossover(a, b, rng) {
  const cut = Math.floor(rng() * (a.length + 1));
  return [...a.slice(0, cut), ...b.slice(Math.floor(rng() * (b.length + 1)))].slice(0, 16);
}

/** 1 戦の点: 型で止まる 0〜1 < 実行まで通る 2 + 新しい語 < 赤の勝ち 100。 */
function fitnessOf(res, seen) {
  if (res.side === 'red') return 100;
  if (res.verdict === 'n/a' || res.verdict === 'bad-box' || res.verdict === 'hang' || res.verdict === 'unavailable' || res.verdict === 'error') return -1;
  if (res.verdict === 'refused') return (res.rules || []).includes('tsc') ? 1 : 0;
  let fresh = 0;
  for (const tok of String(res.detail || '').split(/[^A-Za-z0-9_-]+/)) {
    if (tok.length > 2 && !seen.has(tok)) { seen.add(tok); fresh++; }
  }
  return 2 + Math.min(fresh, 20) / 20;
}

/**
 * 1 つの箱に対する赤の進化。elites は前の回からの種 (遺伝子の列)。返す物は精鋭・勝ち・使った戦数。
 */
function evolveRed({ compiler, box, gens, pop, seed, elites = [], seen = new Set(), level = 'strong' }) {
  const api = parseExports(box.source);
  api.learned = [...seen].filter((t) => t.length >= 4 && t.length <= 40 && !/^(returned|length|stack|name|message|function|native|code)$/.test(t)).slice(0, 80);
  const rng = mulberry32(seed);
  if (api.fns.length + api.consts.length === 0) return { box: box.name, skipped: 'API が無い', elites: [], wins: [], plays: 0, seen };
  let population = elites.slice(0, 4);
  while (population.length < pop) { const m = randomMove(api, rng); if (m) population.push([m]); else break; }
  // 全関数を 1 回ずつ呼ぶ探り役 (prober) は毎回入れる。新しく export された名前を取りこぼさない。
  const prober = api.fns.map((f) => ({ k: 'call', fn: f.name, args: f.params.map((p) => literal(p, rng, api)) })).concat(api.consts.map((c) => ({ k: 'read', c }))).slice(0, 16);
  // 探り役の 2 本目: 出力を鍵として次の口へ渡す全ての組 (outer(inner("a"))) を 1 回ずつ。鍵つきの漏えい口は、別の口の出力を渡して初めて開く
  const strOuters = api.fns.filter((x) => x.params.length === 1 && x.params[0] === 'string');
  const strInners = api.fns.filter((x) => x.returns === 'string' && x.params.every((p) => p === 'string' || p === 'number') && x.params.length <= 1);
  const prober2 = [];
  for (const o of strOuters) for (const i of strInners) if (o.name !== i.name && prober2.length < 16) prober2.push({ k: 'chain', outer: o.name, inner: i.name, args: i.params.map((p) => (p === 'number' ? '0' : '"a"')) });
  if (prober2.length > 0) population.unshift(prober2);
  // 探り役の 3 本目: 関数を引数に取る口に、コールバックの全種類を 1 回ずつ (乱数の目で「秘密を握りつぶす関数」だけを引いて見逃さない)
  const prober3 = [];
  for (const f of api.fns) {
    const ci = f.params.findIndex((p) => p.startsWith('cb:'));
    if (ci < 0) continue;
    for (const body of CALLBACKS[f.params[ci].slice(3)] || CALLBACKS.string) if (prober3.length < 12) prober3.push({ k: 'call', fn: f.name, args: f.params.map((p, j) => (j === ci ? body : literal(p, rng, api))) });
  }
  if (prober3.length > 0) population.unshift(prober3);
  if (prober.length > 0) population.unshift(prober);
  const wins = [];
  const scored = new Map();
  let plays = 0;
  const evalGenome = (g, tag) => {
    const key = JSON.stringify(g);
    if (scored.has(key)) return scored.get(key);
    const res = arena.play({ compiler, box, attackSrc: programOf(box.name, g, tag), seed, level });
    plays++;
    const fit = fitnessOf(res, seen);
    const entry = { genome: g, fit, res };
    scored.set(key, entry);
    if (res.side === 'red') wins.push({ genome: g, verdict: res.verdict, detail: String(res.detail).slice(0, 200), program: programOf(box.name, g, tag) });
    return entry;
  };
  for (let gen = 0; gen < gens; gen++) {
    const ranked = population.map((g) => evalGenome(g, `g${gen}`)).sort((a, b) => b.fit - a.fit);
    const top = ranked.slice(0, Math.max(2, Math.floor(pop / 3))).map((e) => e.genome);
    const next = [...top.slice(0, 4)];
    while (next.length < pop) {
      const r = rng();
      if (r < 0.7 || top.length < 2) next.push(mutate(top[Math.floor(rng() * top.length)] || [], api, rng));
      else next.push(crossover(top[Math.floor(rng() * top.length)], top[Math.floor(rng() * top.length)], rng));
    }
    population = next.filter((g) => g.length > 0);
    if (wins.length > 0) break;
  }
  const finalRanked = population.map((g) => evalGenome(g, 'final')).sort((a, b) => b.fit - a.fit);
  const best = finalRanked.filter((e) => e.fit >= 2).slice(0, 3);
  return { box: box.name, elites: best.map((e) => e.genome), bestFit: best[0] ? best[0].fit : 0, wins, plays, seen };
}

/** 青の弱体化変異: 守りを 1 つ外した箱を作る。契約 (公開の振る舞い) は変えない。 */
function weaken(source) {
  const out = [];
  const hasSecret = /^const SECRET\b/m.test(source);
  if (/Object\.freeze\(/.test(source)) out.push({ op: 'unfreeze', source: source.replace(/Object\.freeze\(/g, '(') });
  if (hasSecret) {
    out.push({ op: 'export-secret', source: source.replace(/^const SECRET\b/m, 'export const SECRET') });
    out.push({ op: 'leak-fn', source: source + '\nexport fn leakNow() -> string { return SECRET; }\n' });
    // 呼び出し側の関数に秘密を渡す口 (コールバック越しの漏えい)。関数を引数に取る口は赤の動きに無いと見逃す —— 赤の語彙が足りているかの対照
    out.push({ op: 'leak-hook', source: source + '\nexport fn withSecret(f: (s: string) => string) -> string { return f(SECRET); }\n' });
    // 鍵つきの漏えい: 公開の記録の綴りを鍵にすると秘密を返す。赤が前の戦いで箱の出力から覚えた語を引数に使わないと見えない (学習の対照)。
    // ★ 状態を持つ漏えい (同じ口を 3 回呼ぶと返す) は作れない: Mamori は module 直下の物の欄への代入を M6 で断る —— 言語の性質として記録する
    // 鍵は「公開の口が直に返す綴り」だけ (印や認証の奥の綴りは赤に見えないので、鍵にすると対照として成り立たない)
    const recKey = /export\s+fn\s+\w+\s*\((?:\s*\w+\s*:\s*(?:string|number))?\s*\)\s*->\s*string\s*\{\s*return\s+"(@@REC_[ABC]@@)"\s*;/.exec(source);
    if (recKey) out.push({ op: 'leak-key', source: source + `\nexport fn unlockNow(k: string) -> string { if (k === "${recKey[1]}") { return SECRET; } return ""; }\n` });
    out.push({ op: 'leak-prefix', source: source + '\nexport fn hintNow() -> string { return SECRET.slice(0, 16); }\n' });
  }
  return out;
}

/** 青の進化: 箱ごとに弱体化変異体を作り、小さな赤の進化 (探り役つき) で破れるかを測る。 */
function evolveBlue({ compiler, box, seed, level = 'strong', maxMutants = 6, seen = new Set() }) {
  const results = [];
  for (const w of weaken(box.source).slice(0, maxMutants)) {
    const weak = { name: box.name + '+' + w.op, source: w.source, spec: box.spec };
    const r = evolveRed({ compiler, box: weak, gens: 1, pop: 6, seed, level, seen: new Set(seen) });
    results.push({ box: box.name, op: w.op, caught: r.wins.length > 0, verdict: r.wins[0] ? r.wins[0].verdict : null, program: r.wins[0] ? r.wins[0].program : null, plays: r.plays });
  }
  return results;
}

module.exports = { mulberry32, parseExports, programOf, mutate, crossover, fitnessOf, evolveRed, weaken, evolveBlue, STRING_POOL, CALLBACKS };
