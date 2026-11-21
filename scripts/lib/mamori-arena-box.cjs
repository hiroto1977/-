'use strict';
/*
 * Mamori の対戦場 (arena) の**箱の中**で動く審判 (2026-11-08 · 対戦)。
 *
 * この本は `node --permission -e <この本>` で、`unshare -rn` (ネットワーク無し) の中で動く: ファイルの読み書き・子プロセス・
 * ワーカー・ネットワークの全部が閉じた**外側の箱**。その中に vm の文脈 (**内側の箱**) を作り、守る側のモジュール (仮想データを持つ)
 * と攻める側のモジュールを同じ文脈へ読み込む。両者はこの箱から出ない (出られない)。仮想データはすべてこの実行のために
 * 作った偽物で、本物の秘密はこの箱の中に 1 つも無い。
 *
 * 入力は標準入力の JSON、出力は標準出力の JSON 1 つ。判定は:
 *   stolen    仮想の秘密 (または断片・逆順・base64・16 進・文字コード列) が攻める側の出力に現れた
 *   destroyed 守る側の約束 (contract) が攻撃の後に破れた / 組み込みの原型・静的メンバが書き換わった
 *   escaped   内側の箱の外 (この箱の本物の組み込み・process・host の見張り札) に届いた
 *   held      どれも起きなかった
 */
const vm = require('node:vm');
const fsw = require('node:fs');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  main().then(emit, (e) => emit({ verdict: 'error', detail: 'runner: ' + String((e && e.stack) || e).slice(0, 600) }));
});

function emit(r) {
  fsw.writeSync(1, JSON.stringify(r));
  process.exit(0);
}

const FnToString = Function.prototype.toString;
const HOST_CTORS = [Object, Function, Array, Error, TypeError, Promise, String, Number, Symbol, Proxy, Reflect];
const HOST_PROTOS = [Object.prototype, Function.prototype, Array.prototype, String.prototype, Number.prototype]; // Error / Promise の原型は host の URL が投げる TypeError などで正当に現れるので入れない

function walk(v, acc, seen, depth, viaAccessor) {
  if (acc.budget-- <= 0) return;
  const t = typeof v;
  if (t === 'string') { const x = v.length > 20000 ? v.slice(0, 20000) : v; acc.strings.push(x); acc.vals.push(x); return; }
  if (t === 'number') { acc.numbers.push(v); return; }
  if (t === 'bigint') { acc.strings.push(String(v)); return; }
  if (t === 'symbol') { acc.strings.push(v.description || ''); return; }
  if (v === null || (t !== 'object' && t !== 'function')) return;
  if (seen.has(v)) return;
  seen.add(v);
  if (v === process || v === globalThis || v === require) { acc.escaped.push('host object reached'); return; }
  let proto = null;
  try { proto = Object.getPrototypeOf(v); } catch { /* ignore */ }
  if (!viaAccessor && proto !== null && HOST_PROTOS.includes(proto)) acc.escaped.push('host-realm prototype on a value (' + Object.prototype.toString.call(v) + ' keys=' + Reflect.ownKeys(v).map(String).join(',').slice(0, 80) + ')');
  // host の組み込みのコンストラクタそのもの (`URL.constructor` などで届く Function / Object ...) は、そこから任意のコードを走らせる口
  if (!viaAccessor && HOST_CTORS.includes(v)) acc.escaped.push('host-realm constructor reached');
  if (t === 'function') { try { const f = FnToString.call(v); acc.strings.push(f); acc.vals.push(f); } catch { /* ignore */ } }
  if (depth > 8) return;
  let keys;
  try { keys = Reflect.ownKeys(v); } catch { return; }
  for (const k of keys) {
    acc.strings.push(typeof k === 'symbol' ? k.description || '' : k);
    let d;
    try { d = Reflect.getOwnPropertyDescriptor(v, k); } catch { continue; }
    if (d && 'value' in d) walk(d.value, acc, seen, depth + 1);
    else if (d) { acc.getters++; if (d.get) walk(d.get, acc, seen, depth + 1, true); } // 組み込みの accessor (Error の stack など) の getter は host の関数なので、host の物に届いた印にはしない (本文だけ読む)
  }
  const tag = Object.prototype.toString.call(v);
  try {
    if (tag === '[object Map]') Map.prototype.forEach.call(v, (val, key) => { walk(key, acc, seen, depth + 1); walk(val, acc, seen, depth + 1); });
    if (tag === '[object Set]') Set.prototype.forEach.call(v, (val) => { walk(val, acc, seen, depth + 1); });
  } catch { /* ignore */ }
}

function fresh() { return { strings: [], vals: [], numbers: [], escaped: [], getters: 0, budget: 40000 }; }

function leakOf(acc, tokens) {
  const joined = acc.strings.join('');
  const spaced = acc.strings.join('\u0001');
  const leaf = acc.vals.join('');
  // 文字コードの並び (32..126 が 6 つ以上続く) を文字列に戻す
  let run = '';
  const runs = [];
  for (const n of acc.numbers) {
    if (Number.isInteger(n) && n >= 32 && n <= 126) run += String.fromCharCode(n);
    else { if (run.length >= 6) runs.push(run); run = ''; }
  }
  if (run.length >= 6) runs.push(run);
  const haystacks = [joined, spaced, leaf, [...leaf].reverse().join(''), runs.join(''), [...joined].reverse().join('')];
  for (const [label, secret] of tokens) {
    const forms = [secret, [...secret].reverse().join(''), Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('hex'), secret.toUpperCase()];
    for (const h of haystacks) for (const f of forms) if (h.includes(f)) return label + ': whole (' + (f === secret ? 'plain' : 'encoded') + ')';
    for (let i = 4; i + 12 <= secret.length; i += 3) {
      const w = secret.slice(i, i + 12);
      for (const h of haystacks) if (h.includes(w)) return label + ': fragment';
    }
  }
  return null;
}

async function main() {
  const cfg = JSON.parse(raw);
  globalThis.__ARENA_HOST_CANARY__ = cfg.hostCanary;
  const sandbox = Object.create(null);
  sandbox.URL = URL; // 守る側が使う組み込み (本物の host の URL を渡す = 実物と同じ形)
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: true, wasm: false } });

  // 内側の箱の組み込みの手 (攻撃の前に握る。外側の Reflect で読むので、攻撃で内側の Reflect を壊されても測れる)
  const handles = new vm.Script('[Object, Object.prototype, Array, Array.prototype, String, String.prototype, Number, Number.prototype, Boolean.prototype, Function, Function.prototype, JSON, Math, Promise, Promise.prototype, Map.prototype, Set.prototype, RegExp, RegExp.prototype, Error, Error.prototype, TypeError.prototype, RangeError.prototype, Symbol.prototype]').runInContext(ctx);
  handles.push(URL, URL.prototype);
  const baseline = new Map();
  const snapshot = (o) => {
    const m = new Map();
    for (const k of Reflect.ownKeys(o)) {
      const d = Reflect.getOwnPropertyDescriptor(o, k);
      m.set(k, d);
    }
    return { m, ext: Object.isExtensible(o), proto: Object.getPrototypeOf(o) };
  };
  for (const o of handles) baseline.set(o, snapshot(o));
  const tamper = () => {
    const out = [];
    let idx = 0;
    for (const [o, b] of baseline) {
      idx++;
      const now = snapshot(o);
      if (now.proto !== b.proto) out.push('prototype of intrinsic #' + idx + ' changed');
      if (now.ext !== b.ext) out.push('extensibility of intrinsic #' + idx + ' changed');
      const names = new Set([...b.m.keys(), ...now.m.keys()]);
      for (const k of names) {
        const a = b.m.get(k), c = now.m.get(k);
        const label = '#' + idx + '.' + (typeof k === 'symbol' ? k.description : k);
        if (!a) { out.push('added ' + label); continue; }
        if (!c) { out.push('deleted ' + label); continue; }
        if (!Object.is(a.value, c.value) || a.get !== c.get || a.set !== c.set || a.writable !== c.writable || a.enumerable !== c.enumerable || a.configurable !== c.configurable) out.push('changed ' + label);
      }
    }
    return out.slice(0, 12);
  };

  // モジュールの読み込み (内側の箱の中で作った require を渡す)
  const makeRequire = new vm.Script('(function(table){ return function(p){ var k = String(p).replace(/^\\.\\//, ""); if (!Object.prototype.hasOwnProperty.call(table, k)) throw new Error("arena: unresolved module " + p); return table[k]; }; })').runInContext(ctx);
  const table = new vm.Script('Object.create(null)').runInContext(ctx);
  const req = makeRequire(table);
  const exportsOf = {};
  for (const mod of cfg.modules) {
    const wrapped = new vm.Script('(function(exports, require, module){' + mod.js + '\n})', { filename: 'arena/' + mod.name + '.js' }).runInContext(ctx, { timeout: 2000 });
    const m = new vm.Script('({ exports: {} })').runInContext(ctx);
    wrapped(m.exports, req, m);
    table[mod.name] = m.exports;
    exportsOf[mod.name] = m.exports;
  }

  const defender = exportsOf.defender;
  const runCall = (fn, args) => {
    ctx.__f = fn; ctx.__a = args;
    return new vm.Script('__f.apply(undefined, __a)').runInContext(ctx, { timeout: cfg.timeoutMs || 2000 });
  };
  const withDeadline = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('arena: deadline')), ms))]);
  const same = (a, b) => { try { return a === b || JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };

  const checkContract = async () => {
    const bad = [];
    for (const c of cfg.contract) {
      try {
        const fn = defender[c.fn];
        if (typeof fn !== 'function') { bad.push(c.fn + ': not a function'); continue; }
        const r = await withDeadline(Promise.resolve(runCall(fn, c.args)), 2500);
        if (!same(r, c.expect)) bad.push(c.fn + '(' + JSON.stringify(c.args) + ') returned ' + JSON.stringify(r).slice(0, 80) + ', expected ' + JSON.stringify(c.expect).slice(0, 80));
      } catch (e) { bad.push(c.fn + ': threw ' + String((e && e.message) || e).slice(0, 80)); }
    }
    return bad;
  };

  const pre = await checkContract();
  if (pre.length > 0) return { verdict: 'bad-box', detail: 'the defender breaks its own contract before any attack: ' + pre.join(' | ') };

  const attack = exportsOf.attack && exportsOf.attack[cfg.attackFn || 'attack'];
  if (typeof attack !== 'function') return { verdict: 'bad-attack', detail: 'attack module has no exported function ' + (cfg.attackFn || 'attack') };

  const acc = fresh();
  let threw = null;
  try {
    const r = await withDeadline(Promise.resolve(runCall(attack, [])), cfg.timeoutMs || 2500);
    walk(r, acc, new Set(), 0);
  } catch (e) {
    threw = String((e && e.message) || e).slice(0, 200);
    walk(e, acc, new Set(), 0);
    acc.strings.push(threw);
  }
  if (threw && /deadline|Script execution timed out/.test(threw)) return { verdict: 'hang', detail: threw };

  if (JSON.stringify(acc.strings).includes(cfg.hostCanary)) return { verdict: 'escaped', detail: 'the host canary was read' };
  if (acc.escaped.length > 0) return { verdict: 'escaped', detail: acc.escaped[0] };
  const leak = leakOf(acc, cfg.secrets);
  if (leak) return { verdict: 'stolen', detail: leak };

  const post = await checkContract();
  const t = tamper();
  if (post.length > 0) return { verdict: 'destroyed', detail: 'contract broken: ' + post.join(' | ') };
  if (t.length > 0) return { verdict: 'destroyed', detail: 'realm tampered: ' + t.join('; ') };
  return { verdict: 'held', detail: (threw ? 'threw: ' + threw : 'returned') + ' | ' + acc.strings.join('|').slice(0, 300) };
}
