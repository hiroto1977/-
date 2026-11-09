'use strict';
/**
 * 対戦場の「再戦」と「連打」(2026-11-09 · 周回 5)。
 *
 *   再戦 (rematch)   前に撃った攻撃 (corpus.json の攻撃) を、見る角度と攻め方を少しずつ変えて撃ち直す。
 *                    同じ場所でも視点を変えれば破れるかもしれない。変え方 (op) ごとに成績を残し、届く変え方へ重みを寄せる。
 *   連打 (hammer)    同じ口へ立て続けに攻撃を加える。(a) 1 つのプログラムの中で同じ口を何十回も・引数を入れ替えながら叩く (状態・時刻・
 *                    資源の揺らぎを誘う)。(b) 同じ攻撃を別の種・同じ種で何度も撃ち、判定が揺れない (非決定) ことを確かめる。
 *                    揺れたら「揺らぎ」として台帳に残す (赤が勝つ側へ揺れたら即・赤の勝ち)。
 *
 * 判定は審判のまま。種を決めれば同じ変種の列になる。プログラムの組み替えは文字列の上で行う (コンパイラが断れば refused として数える)。
 */
const arena = require('./mamori-arena-judge.cjs');
const evo = require('./mamori-arena-evolve.cjs');
const lenses = require('./mamori-arena-lenses.cjs');
const wave = require('./mamori-arena-wave.cjs');

const NUMBER_SWAPS = ['0', '1', '(0 - 1)', '255', '65536', '1000000007', '0.5'];
const OPS = ['literal-swap', 'number-swap', 'reverse', 'rotate', 'burst', 'alternate', 'interleave', 'graft', 'echo-last', 'double-then-swap', 'concurrent', 'stack'];

const STRING_RE = /"((?:[^"\\\n]|\\.)*)"/g;
const NUMBER_RE = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g;
const BODY_LINE_RE = /^ {2}try \{ .* \} catch \(e\) \{ r\.push\(e\); \}$/;

/** 攻撃のプログラムを 頭 (宣言) / 体 (動き 1 つずつの行) / 尻 に分ける。programOf の形でなければ null。 */
function parseAttack(src) {
  const lines = String(src).split('\n');
  const start = lines.findIndex((l) => l === '  const r: unknown[] = [];');
  const end = lines.lastIndexOf('  return r;');
  if (start < 0 || end < start) return null;
  const body = lines.slice(start + 1, end);
  if (!body.every((l) => BODY_LINE_RE.test(l))) return null;
  return { head: lines.slice(0, start - 1), headerFn: lines[start - 1], body, tail: lines.slice(end - 0) };
}

function useNamesOf(head) {
  const names = [];
  for (const l of head) { const m = /^use \{ ([^}]*) \} from "\.\/defender";$/.exec(l); if (m) names.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean)); }
  return names;
}

/** パース済みの形からプログラムへ戻す。await が現れたら attack を async にし、動きで使う名前の use を揃える。 */
function render(parts, extraHead = []) {
  const head = [...parts.head];
  for (const h of extraHead) if (!head.includes(h)) head.push(h);
  const text = parts.body.join('\n');
  const isAsync = /\bawait\b/.test(text);
  // use 宣言は 1 本に束ねる (動きが使う名前だけ・同じ名前を重ねない)
  const names = [...new Set(useNamesOf(head))];
  const kept = head.filter((l) => !/^use \{/.test(l));
  const useLine = names.length ? [`use { ${names.join(', ')} } from "./defender";`] : [];
  const comments = kept.filter((l) => l.startsWith('//'));
  const helpers = kept.filter((l) => !l.startsWith('//') && l.trim() !== '');
  const header = isAsync ? 'export async fn attack() -> Promise<unknown> {' : 'export fn attack() -> unknown {';
  return [...comments, ...useLine, ...helpers, header, '  const r: unknown[] = [];', ...parts.body, '  return r;', '}', ''].join('\n');
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const pools = () => [...new Set([...evo.STRING_POOL, ...lenses.PARANOID_POOL, ...lenses.AUTHORITY_POOL, ...lenses.BOUNDARY_POOL])];

function swapOneLiteral(line, rng, re, replacement) {
  const hits = [...line.matchAll(re)];
  if (hits.length === 0) return null;
  const h = pick(hits, rng);
  return line.slice(0, h.index) + replacement(h) + line.slice(h.index + h[0].length);
}

/** 1 つの変種 (op は変え方の名前)。変えられなければ null。 */
function variantOf({ parts, op, rng, donors = [], learned = [] }) {
  const steps = parts.body;
  if (steps.length === 0) return null;
  const stringPool = [...pools(), ...learned];
  const i = Math.floor(rng() * steps.length);
  const line = steps[i];
  const swapStr = (l) => swapOneLiteral(l, rng, STRING_RE, () => JSON.stringify(pick(stringPool, rng)));
  switch (op) {
    case 'literal-swap': { const l = swapStr(line); if (!l || l === line) return null; return { body: steps.map((x, j) => (j === i ? l : x)) }; }
    case 'number-swap': { const l = swapOneLiteral(line, rng, NUMBER_RE, () => pick(NUMBER_SWAPS, rng)); if (!l || l === line) return null; return { body: steps.map((x, j) => (j === i ? l : x)) }; }
    case 'reverse': return steps.length > 1 ? { body: [...steps].reverse() } : null;
    case 'rotate': return steps.length > 1 ? { body: [...steps.slice(1), steps[0]] } : null;
    // 連打: 同じ動きを何十回も (同じ場所へ立て続けに) 叩く。回数は 2 の冪で段階的に
    case 'burst': { const n = pick([8, 32, 64, 256], rng); return { body: [...steps.slice(0, i), ...Array.from({ length: n }, () => line), ...steps.slice(i + 1)] }; }
    // 引数を入れ替えながら同じ口を連打 (同じ関数・違う引数で状態の揺らぎを誘う)
    case 'alternate': {
      const out = [];
      for (let k = 0; k < 12; k++) out.push(swapStr(line) || line);
      return { body: [...steps.slice(0, i), ...out, ...steps.slice(i + 1)] };
    }
    // 2 つの動きを A B A B ... と交互に (順序と状態の揺らぎ)
    case 'interleave': { if (steps.length < 2) return null; const j = (i + 1 + Math.floor(rng() * (steps.length - 1))) % steps.length; const out = []; for (let k = 0; k < 8; k++) out.push(steps[i], steps[j]); return { body: out }; }
    // 別の攻撃 (同じ箱に撃った攻撃) の動きを 1 つ移植する (視点の掛け合わせ)
    case 'graft': {
      if (donors.length === 0) return null;
      const d = pick(donors, rng);
      if (d.body.length === 0) return null;
      const grafted = pick(d.body, rng);
      return { body: [...steps.slice(0, i + 1), grafted, ...steps.slice(i + 1)], extraHead: d.head.filter((l) => !l.startsWith('//')) };
    }
    // 最後の動きを繰り返す (戻った後にもう一度 = 「戻って来る」攻めの二度目)
    case 'echo-last': return { body: [...steps, steps[steps.length - 1], steps[steps.length - 1]] };
    // 同じ動きを 2 度続け、2 度目だけ引数を変える (直前の呼び出しの残りを突く)
    case 'double-then-swap': { const l = swapStr(line); if (!l || l === line) return null; return { body: [...steps.slice(0, i + 1), l, ...steps.slice(i + 1)] }; }
    // 同時多発: await する動きを Promise.all で 8〜24 本いっぺんに走らせる (microtask の交錯で定数 tick・有限回の打ち切りが崩れないか)
    case 'concurrent': {
      const m = /^ {2}try \{ r\.push\(\(await (.+)\)\); \} catch \(e\) \{ r\.push\(e\); \}$/.exec(line) || /^ {2}try \{ r\.push\(await (.+)\); \} catch \(e\) \{ r\.push\(e\); \}$/.exec(line);
      if (!m) return null;
      const n = pick([8, 24], rng);
      const calls = Array.from({ length: n }, () => m[1]).join(', ');
      return { body: [...steps.slice(0, i), `  try { r.push(await Promise.all([${calls}])); } catch (e) { r.push(e); }`, ...steps.slice(i + 1)] };
    }
    // 重ね撃ち: 別の変え方を 2〜3 回、続けて同じ攻撃へ掛ける (視点の積み重ね・同じ場所へ手を変えて立て続けに)
    case 'stack': {
      const base = OPS.filter((o) => o !== 'stack' && o !== 'graft');
      let cur = { head: parts.head, body: steps };
      let extraHead = [];
      let applied = 0;
      const want = 2 + Math.floor(rng() * 2);
      for (let t = 0; t < want * 3 && applied < want; t++) {
        const next = variantOf({ parts: cur, op: pick(base, rng), rng, donors, learned });
        if (!next) continue;
        const grown = next.body;
        cur = { head: cur.head, body: grown.length > 160 ? grown.filter((_, idx) => idx < 160) : grown };
        extraHead = [...extraHead, ...(next.extraHead || [])];
        applied++;
      }
      return applied >= 2 ? { body: cur.body, extraHead } : null;
    }
    default: return null;
  }
}

/** 変え方の重み: 届いた (held) 変え方ほど大きい。ラプラス平滑 (観点の重みと同じ式)。 */
function opWeights(opStats) {
  const w = {};
  for (const op of OPS) { const s = (opStats || {})[op]; w[op] = s ? (s.held + 1) / (s.plays + 2) : 0.5; }
  return w;
}

function chooseOp(rng, weights) {
  const total = OPS.reduce((a, op) => a + (weights[op] ?? 0.5), 0);
  let r = rng() * total;
  for (const op of OPS) { r -= weights[op] ?? 0.5; if (r <= 0) return op; }
  return OPS[OPS.length - 1];
}

/** 箱に撃つ前の攻撃から、再戦の種にする物を選ぶ: 名指しの攻撃 → 届いた (held) 物 → 近い攻めの捕獲 → 全箱向け。 */
function pickSeeds({ corpus, boxName, per = 12 }) {
  const mine = corpus.attacks.filter((a) => (a.targets || []).includes(boxName));
  const generic = corpus.attacks.filter((a) => (a.targets || []).includes('*'));
  const rank = (a) => (a.name.startsWith('wave-win') ? 0 : a.firstVerdict === 'held' ? 1 : a.name.startsWith('wave-') ? 2 : a.name.startsWith('evo-') ? 3 : 4);
  const sorted = [...mine.sort((a, b) => rank(a) - rank(b)), ...generic.filter((a) => a.firstVerdict === 'held').slice(0, 4)];
  const seenSrc = new Set();
  return sorted.filter((a) => { if (seenSrc.has(a.source)) return false; seenSrc.add(a.source); return true; }).slice(0, per);
}

const newOpStat = () => ({ plays: 0, refused: 0, held: 0, red: 0, void: 0, bounced: 0, exhausted: 0, fresh: 0 });

/**
 * 1 つの箱への再戦。種の攻撃ごとに variants 本の変種を作って撃つ。
 * 返す物: ops (変え方ごとの成績)・wins (破れた攻め)・near (届いて新しい語を引いた最良)・plays。
 */
function rematchBox({ compiler, box, corpus, seed, per = 12, variants = 6, level = 'strong', seen = new Set(), weights = null }) {
  const rng = evo.mulberry32(seed);
  const seeds = pickSeeds({ corpus, boxName: box.name, per });
  const parsed = seeds.map((a) => ({ a, p: parseAttack(a.source) }));
  const donors = parsed.filter((x) => x.p).map((x) => x.p);
  const w = weights || opWeights(null);
  const learned = [...seen].filter((t) => t.length >= 4 && t.length <= 40 && !/^(returned|length|stack|name|message|function|native|code)$/.test(t)).slice(0, 60);
  const ops = {};
  const wins = [];
  const near = {};
  const done = new Set();
  let plays = 0;
  for (const { a, p } of parsed) {
    if (!p) continue;
    for (let v = 0; v < variants; v++) {
      const op = chooseOp(rng, w);
      const var1 = variantOf({ parts: p, op, rng, donors: donors.filter((d) => d !== p), learned });
      if (!var1) continue;
      const src = render({ head: p.head, body: var1.body }, var1.extraHead || []);
      if (done.has(src)) continue;
      done.add(src);
      const res = arena.play({ compiler, box, attackSrc: src, seed: seed * 31 + v, level });
      plays++;
      const s = ops[op] || (ops[op] = newOpStat());
      s.plays++;
      const tag = { op, from: a.name };
      if (res.side === 'red') { s.red++; wins.push({ ...tag, verdict: res.verdict, detail: String(res.detail).slice(0, 200), program: src }); continue; }
      if (res.verdict === 'n/a') { s.bounced++; continue; }
      if (res.verdict === 'hang') { s.exhausted++; continue; }
      if (res.side === 'void') { s.void++; continue; }
      if (res.verdict === 'refused') { s.refused++; continue; }
      s.held++;
      const fresh = Math.max(0, Math.round((evo.fitnessOf(res, seen) - 2) * 20));
      s.fresh += fresh;
      if (fresh > 0 && (!near[op] || fresh > near[op].fresh)) near[op] = { ...tag, fresh, program: src };
    }
  }
  return { box: box.name, seeds: seeds.length, plays, ops, wins, near, tokens: [...seen].slice(0, 400) };
}

/** 連打 (b): 同じ攻撃を、別の種 3 つと 同じ種 2 回で撃ち、判定の側と出力が揺れないかを見る。揺れたら { kind } を返す。 */
function hammerRepeat({ compiler, box, attack, seed, level = 'strong' }) {
  const sides = [];
  const verdicts = [];
  for (let k = 0; k < 3; k++) {
    const r = arena.play({ compiler, box, attackSrc: attack.source, seed: seed + k * 17, level });
    sides.push(r.side);
    verdicts.push(r.verdict);
  }
  const a = arena.play({ compiler, box, attackSrc: attack.source, seed, level });
  const b = arena.play({ compiler, box, attackSrc: attack.source, seed, level });
  const out = { box: box.name, attack: attack.name, plays: 5, wobble: null, red: sides.includes('red') || a.side === 'red' || b.side === 'red' };
  // 速く終わるはずの攻撃が hang したり、1 回だけ hang する = 揺らぎ (資源の取り合い) だが、箱の外の期限の揺れなので別枠で数える
  const comparable = verdicts.filter((v) => v !== 'hang');
  if (new Set(comparable).size > 1) out.wobble = { kind: 'verdict-flip', verdicts };
  else if (a.verdict !== b.verdict) out.wobble = { kind: 'same-seed-verdict', verdicts: [a.verdict, b.verdict] };
  else if (a.verdict !== 'hang' && String(a.detail) !== String(b.detail)) out.wobble = { kind: 'same-seed-output', detail: [String(a.detail).slice(0, 80), String(b.detail).slice(0, 80)] };
  return out;
}

/** 青の較正 (再戦版): 守りを 1 つ外した箱を、その箱への前の攻撃の変種で撃つ。前の攻撃が逃した穴を、変種が捕まえたか。 */
function rematchCalibrate({ compiler, box, corpus, seed, level = 'strong' }) {
  const out = [];
  for (const w of evo.weaken(box.source)) {
    const weak = { name: box.name + '+' + w.op, source: w.source, spec: box.spec };
    const r = rematchBox({ compiler, box: weak, corpus: { attacks: corpus.attacks.map((a) => ({ ...a, targets: (a.targets || []).map((t) => (t === box.name ? weak.name : t)) })) }, seed, per: 6, variants: 3, level });
    out.push({ box: box.name, op: w.op, caught: r.wins.length > 0, ops: [...new Set(r.wins.map((x) => x.op))], verdict: r.wins[0] ? r.wins[0].verdict : null, program: r.wins[0] ? r.wins[0].program : null, plays: r.plays });
  }
  return out;
}

function mergeOpStat(prev, add) {
  const out = { ...newOpStat(), ...(prev || {}) };
  for (const k of Object.keys(newOpStat())) out[k] = (out[k] || 0) + (add[k] || 0);
  return out;
}

/** 結果を記録へ畳む (state = evolution.json・corpus = corpus.json)。破れたら対策と回帰を残し、近い攻めは捕獲し、揺らぎは台帳に残す。 */
function applyRematchResults({ state, corpus, results, seed }) {
  state.rematch = state.rematch || { ops: {}, runs: [], wobbles: [] };
  const tally = { plays: 0, red: 0, near: 0, wobbles: 0, hammered: 0, caught: 0, uncaught: 0 };
  const byOp = {};
  for (const r of results) {
    tally.plays += r.rematch.plays;
    for (const [op, s] of Object.entries(r.rematch.ops)) { state.rematch.ops[op] = mergeOpStat(state.rematch.ops[op], s); byOp[op] = mergeOpStat(byOp[op], s); }
    const prev = state.boxes[r.box] || { elites: [], tokens: [], generations: 0, bestFit: 0 };
    state.boxes[r.box] = { ...prev, tokens: [...new Set([...(prev.tokens || []), ...r.rematch.tokens])].slice(0, 400) };
    for (const win of r.rematch.wins) {
      tally.red++;
      const cm = wave.countermeasureOf({ lens: win.op, verdict: win.verdict });
      state.wins.push({ box: r.box, seed, lens: 'rematch:' + win.op, verdict: win.verdict, program: win.program, detail: win.detail, cause: cm.cause, hardening: cm.hardening, from: win.from });
      state.lessons.push({ box: r.box, op: 'red-win:rematch-' + win.op, verdict: win.verdict, program: win.program, seed });
      const name = `rematch-win-${win.op}-${r.box}-${seed}`;
      if (!corpus.attacks.some((x) => x.name === name)) corpus.attacks.push({ name, source: win.program, targets: [r.box], firstVerdict: win.verdict, rules: [], detail: cm.cause });
    }
    for (const [op, n] of Object.entries(r.rematch.near)) {
      tally.near++;
      const name = `rematch-${op}-${r.box}`;
      const entry = { name, source: n.program, targets: [r.box], firstVerdict: 'held', rules: [], detail: `再戦: ${n.from} を ${op} で作り直し、箱の奥へ届いて新しい語を ${n.fresh} 個引いた攻め` };
      const at = corpus.attacks.findIndex((x) => x.name === name);
      if (at >= 0) corpus.attacks[at] = entry; else corpus.attacks.push(entry);
    }
    for (const h of r.hammer || []) {
      tally.hammered++;
      tally.plays += h.plays;
      if (h.red) tally.red++;
      if (h.wobble) {
        tally.wobbles++;
        state.rematch.wobbles = state.rematch.wobbles.filter((x) => !(x.box === h.box && x.attack === h.attack));
        state.rematch.wobbles.push({ box: h.box, attack: h.attack, seed, ...h.wobble });
      }
    }
    for (const b of r.blue || []) {
      if (b.caught) tally.caught++; else tally.uncaught++;
    }
  }
  state.rematch.wobbles = state.rematch.wobbles.slice(-100);
  state.rematch.runs.push({ seed, boxes: results.length, ...tally, byOp: Object.fromEntries(Object.entries(byOp).map(([k, s]) => [k, { plays: s.plays, held: s.held, refused: s.refused, red: s.red }])) });
  state.rematch.runs = state.rematch.runs.slice(-50);
  return { tally, table: analyzeOps(byOp), weights: opWeights(state.rematch.ops) };
}

function analyzeOps(ops) {
  return Object.keys(ops).sort().map((op) => { const s = ops[op]; return { op, plays: s.plays, refused: s.refused, held: s.held, red: s.red, exhausted: s.exhausted || 0, bounced: s.bounced || 0, fresh: s.fresh, reach: s.plays > 0 ? s.held / s.plays : 0 }; });
}

module.exports = { OPS, parseAttack, render, variantOf, opWeights, chooseOp, pickSeeds, rematchBox, hammerRepeat, rematchCalibrate, applyRematchResults, analyzeOps, mergeOpStat };
