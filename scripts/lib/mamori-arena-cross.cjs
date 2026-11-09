'use strict';
/**
 * 対戦場の「掛け合わせ」(2026-11-09 · 周回 8)。
 *
 * 再戦 (rematch) は 1 つの攻撃を作り直す。掛け合わせ (cross) は **違う攻撃どうしを親にして、新しい攻め方を編み出す**。
 * 親は同じ箱に撃った物に限らない —— 全コーパスの攻撃のうち、動きが使う名前をその箱が export している物ならどの箱向けでもよい。
 * (箱の形が違っても、「ある口にこう撃つ」と「別の口にああ撃つ」を混ぜれば、どちらの親にも無かった順序・状態の交錯が生まれる。)
 *
 * 掛け合わせ方 (op):
 *   cross-splice    A の前半 + B の後半 (一点交叉)
 *   cross-weave     A1 B1 A2 B2 … (交互)
 *   cross-sandwich  A の動きごとに B の動きを 1 つ挟む
 *   cross-pingpong  A の 1 手と B の 1 手を 16 回ずつ往復 (2 つの口を行き来して状態を揺らす)
 *   cross-literal   A の動きの文字列引数を B から採った文字列に差し替える (引数の交配)
 *   cross-mouth     A の動きの呼び先を B が叩く別の口に差し替える (口の交配・引数は A のまま)
 *   cross-triple    A B C の三親を交互に織る
 *   cross-parallel  A と B の await する動きを 1 本の Promise.all に束ねる (別の口を同時に走らせる)
 *   cross-stack     上の掛け合わせの結果に、再戦の変え方 (burst / reverse / …) をもう 1 手重ねる
 *   cross-nest      手書きの攻撃どうし (programOf の形でない物) を入れ子にする: B の本体を関数 crossB() に包み、A の動きの後ろで呼び、結果を並べて返す
 *
 * 判定は審判のまま。種を決めれば同じ列になる。コンパイラが断れば refused として数える。
 */
const arena = require('./mamori-arena-judge.cjs');
const evo = require('./mamori-arena-evolve.cjs');
const rm = require('./mamori-arena-rematch.cjs');

const CROSS_OPS = ['cross-nest', 'cross-splice', 'cross-weave', 'cross-sandwich', 'cross-pingpong', 'cross-literal', 'cross-mouth', 'cross-triple', 'cross-parallel', 'cross-stack'];
const MAX_STEPS = 160;
const STRING_RE = /"((?:[^"\\\n]|\\.)*)"/g;
const AWAIT_RE = [/^ {2}try \{ r\.push\(\(await (.+)\)\); \} catch \(e\) \{ r\.push\(e\); \}$/, /^ {2}try \{ r\.push\(await (.+)\); \} catch \(e\) \{ r\.push\(e\); \}$/];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const cap = (steps) => (steps.length > MAX_STEPS ? steps.filter((_, i) => i < MAX_STEPS) : steps);
const nonComment = (head) => head.filter((l) => !l.startsWith('//'));

/** 箱が export する名前 (関数・定数・引数の形が外れる口まで)。親の動きが使う名前がこれに収まる物だけを使う。 */
function exportedNames(box) {
  const api = evo.parseExports(box.source);
  return new Set([...api.fns.map((f) => f.name), ...api.consts, ...api.others.map((f) => f.name)]);
}

/** 親の候補: 全コーパスから、パースでき、使う名前が箱の export に収まる攻撃 (ソースが同じ物は 1 つ)。 */
function parentsFor({ corpus, box }) {
  const names = exportedNames(box);
  const seen = new Set();
  const out = [];
  for (const a of corpus.attacks) {
    if (seen.has(a.source)) continue;
    seen.add(a.source);
    const p = rm.parseAttack(a.source);
    if (!p || p.body.length === 0) continue;
    const used = [];
    for (const l of p.head) { const m = /^use \{ ([^}]*) \} from "\.\/defender";$/.exec(l); if (m) used.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean)); }
    if (used.length === 0 || !used.every((n) => names.has(n))) continue;
    out.push({ name: a.name, parts: p, used });
  }
  return out;
}

function stringLiteralsOf(steps) {
  const out = [];
  for (const l of steps) for (const m of l.matchAll(STRING_RE)) out.push(m[0]);
  return out;
}

function calleesOf(steps, allowed) {
  const out = [];
  for (const l of steps) for (const m of l.matchAll(/(?<![\w.])([A-Za-z_]\w*)\(/g)) if (allowed.has(m[1])) out.push(m[1]);
  return out;
}

/** 1 つの掛け合わせ。{ body, extraHead } か null。 */
function crossOf({ op, a, b, c, rng, names, learned = [] }) {
  const A = a.parts.body;
  const B = b.parts.body;
  const extraHead = (...ps) => ps.flatMap((p) => nonComment(p.parts.head));
  switch (op) {
    case 'cross-splice': { const k = 1 + Math.floor(rng() * A.length); const m = Math.floor(rng() * B.length); const body = [...A.slice(0, k), ...B.slice(m)]; return { body: cap(body), extraHead: extraHead(a, b) }; }
    case 'cross-weave': { const n = Math.max(A.length, B.length); const body = []; for (let i = 0; i < n; i++) { if (i < A.length) body.push(A[i]); if (i < B.length) body.push(B[i]); } return { body: cap(body), extraHead: extraHead(a, b) }; }
    case 'cross-sandwich': { const body = []; for (const s of A) { body.push(s, pick(B, rng)); } return { body: cap(body), extraHead: extraHead(a, b) }; }
    case 'cross-pingpong': { const x = pick(A, rng); const y = pick(B, rng); const body = []; for (let i = 0; i < 16; i++) body.push(x, y); return { body, extraHead: extraHead(a, b) }; }
    case 'cross-literal': {
      const pool = [...stringLiteralsOf(B), ...learned.map((t) => JSON.stringify(t))];
      if (pool.length === 0) return null;
      const i = Math.floor(rng() * A.length);
      const hits = [...A[i].matchAll(STRING_RE)];
      if (hits.length === 0) return null;
      const h = pick(hits, rng);
      const lit = pick(pool, rng);
      const line = A[i].slice(0, h.index) + lit + A[i].slice(h.index + h[0].length);
      if (line === A[i]) return null;
      return { body: A.map((s, j) => (j === i ? line : s)), extraHead: extraHead(a, b) };
    }
    case 'cross-mouth': {
      const mouths = calleesOf(B, names);
      if (mouths.length === 0) return null;
      const i = Math.floor(rng() * A.length);
      const here = [...A[i].matchAll(/(?<![\w.])([A-Za-z_]\w*)\(/g)].filter((m) => names.has(m[1]));
      if (here.length === 0) return null;
      const h = pick(here, rng);
      const to = pick(mouths, rng);
      if (to === h[1]) return null;
      const line = A[i].slice(0, h.index) + to + A[i].slice(h.index + h[1].length);
      return { body: A.map((s, j) => (j === i ? line : s)), extraHead: extraHead(a, b) };
    }
    case 'cross-triple': {
      if (!c) return null;
      const C = c.parts.body;
      const n = Math.max(A.length, B.length, C.length);
      const body = [];
      for (let i = 0; i < n; i++) { if (i < A.length) body.push(A[i]); if (i < B.length) body.push(B[i]); if (i < C.length) body.push(C[i]); }
      return { body: cap(body), extraHead: extraHead(a, b, c) };
    }
    case 'cross-parallel': {
      const grab = (steps) => steps.map((l) => AWAIT_RE[0].exec(l) || AWAIT_RE[1].exec(l)).filter(Boolean).map((m) => m[1]);
      const ea = grab(A);
      const eb = grab(B);
      if (ea.length === 0 || eb.length === 0) return null;
      const n = pick([4, 12], rng);
      const calls = [];
      for (let i = 0; i < n; i++) { calls.push(pick(ea, rng), pick(eb, rng)); }
      return { body: [`  try { r.push(await Promise.all([${calls.join(', ')}])); } catch (e) { r.push(e); }`], extraHead: extraHead(a, b) };
    }
    case 'cross-stack': {
      const base = CROSS_OPS.filter((o) => o !== 'cross-stack' && o !== 'cross-triple');
      for (let t = 0; t < 6; t++) {
        const first = crossOf({ op: pick(base, rng), a, b, c, rng, names, learned });
        if (!first) continue;
        const second = rm.variantOf({ parts: { head: a.parts.head, body: first.body }, op: pick(['burst', 'reverse', 'rotate', 'echo-last', 'double-then-swap', 'interleave'], rng), rng, donors: [], learned });
        if (!second) continue;
        return { body: cap(second.body), extraHead: first.extraHead };
      }
      return null;
    }
    default: return null;
  }
}

/**
 * 手書きの攻撃 (programOf の形でない物) を 頭 (use / 補助の宣言) と 本体 に分ける。
 * 読めるのは `export [async] fn attack() -> T {` … `}` の複数行形と、1 行形 `{ … return X; }` だけ。
 */
function parseRaw(src) {
  const lines = String(src).split('\n');
  const uses = [];
  const helpers = [];
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^export (async )?fn attack\(\)/.test(l)) { at = i; break; }
    if (l.startsWith('//') || l.trim() === '') continue;
    const m = /^use \{ ([^}]*) \} from "\.\/defender";$/.exec(l);
    if (m) uses.push(...m[1].split(',').map((x) => x.trim()).filter(Boolean)); else helpers.push(l);
  }
  if (at < 0) return null;
  const header = lines[at];
  const isAsync = /^export async fn/.test(header);
  let inner;
  const one = /^export (?:async )?fn attack\(\) -> [^{]+\{ (.*) \}$/.exec(header);
  if (one) {
    if (lines.slice(at + 1).some((l) => l.trim() !== '')) return null;
    inner = [`  ${one[1]}`];
  } else {
    if (!/\{$/.test(header)) return null;
    const rest = lines.slice(at + 1);
    while (rest.length && rest[rest.length - 1].trim() === '') rest.pop();
    if (rest.length < 2 || rest[rest.length - 1] !== '}') return null;
    inner = rest.slice(0, -1);
  }
  if (inner.length === 0 || inner.some((l) => /^\s*(\/\/|\/\*)/.test(l))) return null;
  return { uses, helpers, isAsync, inner };
}

/** A の本体を「動き」と「最後の return 式」に分ける (最後の行が `return X;` の物だけ)。 */
function splitReturn(inner) {
  const last = inner[inner.length - 1];
  const m = /^\s*(.*?)\breturn (.+);$/.exec(last);
  if (!m || (m[1] && m[1].trim() !== '' && /\breturn\b/.test(m[1]))) return null;
  const lead = m[1].trim();
  return { stmts: [...inner.slice(0, -1), ...(lead ? [`  ${lead}`] : [])], ret: m[2] };
}

function rawParentsFor({ corpus, box }) {
  const names = exportedNames(box);
  const seen = new Set();
  const out = [];
  for (const a of corpus.attacks) {
    if (seen.has(a.source) || rm.parseAttack(a.source)) continue;
    seen.add(a.source);
    const p = parseRaw(a.source);
    if (!p || !p.uses.every((n) => names.has(n))) continue;
    out.push({ name: a.name, raw: p, ret: splitReturn(p.inner), held: a.firstVerdict === 'held' });
  }
  return out;
}

const helperName = (l) => { const m = /^(?:async )?fn (\w+)/.exec(l) || /^(?:const|let) (\w+)/.exec(l); return m ? m[1] : null; };

/** 手書きの攻撃の入れ子: B の本体を関数 crossB に包み、A の動きの後ろで呼んで結果を並べて返す。 */
function nestRaw(a, b) {
  if (!a.ret) return null;
  const hs = new Set(a.raw.helpers.map(helperName).filter(Boolean));
  if (b.raw.helpers.some((l) => hs.has(helperName(l)))) return null;
  const async = a.raw.isAsync || b.raw.isAsync;
  const uses = [...new Set([...a.raw.uses, ...b.raw.uses])];
  const call = b.raw.isAsync ? 'await crossB()' : 'crossB()';
  const fnHead = b.raw.isAsync ? 'async fn crossB() -> Promise<unknown> {' : 'fn crossB() -> unknown {';
  const lines = [
    ...(uses.length ? [`use { ${uses.join(', ')} } from "./defender";`] : []),
    ...a.raw.helpers, ...b.raw.helpers,
    fnHead, ...b.raw.inner, '}',
    async ? 'export async fn attack() -> Promise<unknown> {' : 'export fn attack() -> unknown {',
    ...a.ret.stmts, `  const crossRes: unknown = ${call};`, `  return [${a.ret.ret}, crossRes];`, '}', '',
  ];
  return lines.join('\n');
}

const newStat = () => ({ plays: 0, refused: 0, held: 0, red: 0, void: 0, bounced: 0, exhausted: 0, fresh: 0 });

/**
 * 1 つの箱への掛け合わせ。親を無作為に 2〜3 本選び (A と B は別の攻撃)、op を回して pairs 本を撃つ。
 * 返す物: rematchBox と同じ形 (applyRematchResults へそのまま渡せる)。
 */
function crossBox({ compiler, box, corpus, seed, pairs = 60, level = 'strong', seen = new Set() }) {
  const rng = evo.mulberry32(seed);
  const parents = parentsFor({ corpus, box });
  const names = exportedNames(box);
  const learned = [...seen].filter((t) => t.length >= 4 && t.length <= 40 && !/^(returned|length|stack|name|message|function|native|code)$/.test(t)).slice(0, 60);
  const ops = {};
  const wins = [];
  const near = {};
  const done = new Set();
  let plays = 0;
  // 手書きの親は、箱の奥まで届いた (held) 物を選ぶ —— 言語が断った弾 (電池の弾など) どうしを混ぜても、子は親と同じ規則で止まるだけ
  const rawAll = rawParentsFor({ corpus, box }).filter((p) => p.held);
  const rawParents = rawAll.filter((p) => p.ret);
  if (parents.length < 2 && rawParents.length < 1) return { box: box.name, seeds: parents.length, plays, ops, wins, near, tokens: [...seen].slice(0, 400) };
  for (let n = 0; n < pairs; n++) {
    const op = CROSS_OPS[n % CROSS_OPS.length];
    if (op === 'cross-nest') {
      if (rawParents.length === 0 || rawAll.length < 2) continue;
      const ra = pick(rawParents, rng);
      let rb = pick(rawAll, rng);
      for (let t = 0; t < 8 && rb === ra; t++) rb = pick(rawAll, rng);
      if (rb === ra) continue;
      const nested = nestRaw(ra, rb);
      if (!nested || done.has(nested)) continue;
      done.add(nested);
      const rres = arena.play({ compiler, box, attackSrc: nested, seed: seed * 31 + n, level });
      plays++;
      const rs = ops[op] || (ops[op] = newStat());
      rs.plays++;
      const rtag = { op, from: `${ra.name} x ${rb.name}` };
      if (rres.side === 'red') { rs.red++; wins.push({ ...rtag, verdict: rres.verdict, detail: String(rres.detail).slice(0, 200), program: nested }); continue; }
      if (rres.verdict === 'n/a') { rs.bounced++; continue; }
      if (rres.verdict === 'hang') { rs.exhausted++; continue; }
      if (rres.side === 'void') { rs.void++; continue; }
      if (rres.verdict === 'refused') { rs.refused++; continue; }
      rs.held++;
      const rfresh = Math.max(0, Math.round((evo.fitnessOf(rres, seen) - 2) * 20));
      rs.fresh += rfresh;
      if (rfresh > 0 && (!near[op] || rfresh > near[op].fresh)) near[op] = { ...rtag, fresh: rfresh, program: nested };
      continue;
    }
    if (parents.length < 2) continue;
    const a = pick(parents, rng);
    let b = pick(parents, rng);
    for (let t = 0; t < 8 && b === a; t++) b = pick(parents, rng);
    if (b === a) continue;
    const c = pick(parents, rng);
    const child = crossOf({ op, a, b, c, rng, names, learned });
    if (!child) continue;
    const src = rm.render({ head: a.parts.head, body: child.body }, child.extraHead || []);
    if (done.has(src)) continue;
    done.add(src);
    const res = arena.play({ compiler, box, attackSrc: src, seed: seed * 31 + n, level });
    plays++;
    const s = ops[op] || (ops[op] = newStat());
    s.plays++;
    const tag = { op, from: `${a.name} x ${b.name}` };
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
  return { box: box.name, seeds: parents.length, plays, ops, wins, near, tokens: [...seen].slice(0, 400) };
}

module.exports = { CROSS_OPS, exportedNames, parentsFor, crossOf, crossBox, parseRaw, splitReturn, rawParentsFor, nestRaw };
