'use strict';
/**
 * 対戦場の「観点 (レンズ)」(2026-11-09 · 周回 3)。赤の攻めを 1 つの発想に閉じ込めず、思考の視点ごとに別の発生器で撃つ。
 *
 *   逆算 / 俯瞰 / 批判 / 合理 / 客観 / 抽象 / 妄想 / 心理的不安 / 時間 / 越境 の 10 観点。
 *   どの観点も「箱が export する名前 (API)」「箱の契約 (spec.contract)」「前の戦いで覚えた語 (learned)」だけを材料にし、
 *   種 (rng) を決めれば同じ攻めが出る。観点が生む物は遺伝子 (動きの列) で、`evo.programOf` が攻撃のプログラムにする。
 *   層 (layer) は別の観点の動きを 1 本のプログラムに重ねる —— 多層の同時攻撃。
 *
 * 観点は「何を試すか」の分類であって、点数を変えない。判定は審判 (`mamori-arena-judge.cjs`) のまま。
 */
const evo = require('./mamori-arena-evolve.cjs');

const expr = (e, names) => ({ k: 'expr', e, names });
const raw = (e) => ({ k: 'raw', e });
const lit = (v) => JSON.stringify(v);

/** 引数の既定 (型ごと)。文字列は val で差し替えられる。コールバックは cbIndex 番目の種類。 */
function argsOf(f, val = 'a', cbIndex = 0) {
  return f.params.map((p) => {
    if (p === 'string') return lit(val);
    if (p === 'number') return '0';
    if (p === 'boolean') return 'true';
    const pool = evo.CALLBACKS[p.slice(3)] || evo.CALLBACKS.string;
    return pool[cbIndex % pool.length];
  });
}
const callOf = (f, val, cbIndex) => ({ k: 'call', fn: f.name, args: argsOf(f, val, cbIndex) });
const callText = (f, val, cbIndex) => `${f.name}(${argsOf(f, val, cbIndex).join(', ')})`;
const hasString = (f) => f.params.includes('string');

function sample(list, k, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.max(0, k));
}
const chunk = (list, size) => { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };
const unique = (list) => [...new Set(list)];

// 妄想: 現実にはまず来ない入力。構造を壊す語・極端な長さ・見えない字 (escape 記法で書くので源は ASCII のまま)
const PARANOID_POOL = ['__proto__', 'constructor', 'prototype', '\\u0000', '\\u202e', '\\u200b', '${SECRET}', '../../etc/passwd', '%s%s%s%n', 'null', 'undefined', 'NaN', '[object Object]', '</script>', "'; DROP TABLE x; --", 'A'.repeat(5000), '\\ud800', 'ｓｅｃ＿', '0x41414141', '__defineGetter__'];
// 心理的不安: 権威・急ぎ・同情で関門を緩めさせようとする語
const AUTHORITY_POOL = ['admin', 'root', 'owner', 'system', 'trusted', 'internal', 'debug', 'sudo', 'override', 'maintenance', 'emergency', 'password', 'letmein', 'true', 'yes', 'ok', 'please', 'CEO', 'support', 'urgent'];
// 合理: 最小の費用で境目を叩く値
const BOUNDARY_POOL = ['', 'a', '0', '-1', '1', ' ', 'A'.repeat(300), '9'.repeat(40), 'sec_', 'rec-a-', 'rec-b-', 'rec-c-'];
const BREAKOUTS = [
  'eval("1")', 'new Function("return 1")()', 'process.env', 'globalThis', 'import("fs")', 'require("fs")', '"".constructor',
  'Object.getPrototypeOf(Object)', 'Reflect.ownKeys(Object)', '(0, eval)("this")', 'Function("return this")()',
  'Object.assign(Object.prototype, {"x": 1})', 'JSON.constructor', 'Symbol.for("x")', 'Proxy', 'WebAssembly', 'Atomics', 'SharedArrayBuffer',
  'structuredClone({})', 'queueMicrotask', 'setTimeout', 'Error.captureStackTrace', 'new Error("x").stack', 'Math.constructor',
  'Object.defineProperty(Object.prototype, "x", {"value": 1})', 'Object.setPrototypeOf({}, null)', 'URL.createObjectURL', 'RegExp.$1',
  'String.fromCharCode(101, 118, 97, 108)', 'Object["keys"]({})', '`${1}`', '(1 as unknown)', 'this', 'arguments', 'new.target', 'Buffer', 'document',
];

const LENSES = [
  {
    id: 'reverse', ja: '逆算', note: '奪いたい物 (出力) から遡る: 契約の期待値・前の戦いで見えた語を、各口の鍵として逆に差し込む',
    gen({ api, spec, learned, n, rng }) {
      const contract = (spec && spec.contract) || [];
      const keys = unique([...contract.map((c) => c.expect), ...contract.flatMap((c) => c.args || []), ...learned].filter((v) => typeof v === 'string' && v.length > 0 && v.length <= 60));
      const out = [];
      for (const c of contract) { const f = api.fns.find((x) => x.name === c.fn); if (f) out.push([callOf(f)]); }
      const targets = api.fns.filter((f) => f.params.length === 1 && f.params[0] === 'string');
      for (const part of chunk(sample(keys, 8 * n, rng), 8)) out.push(targets.flatMap((f) => part.map((v) => callOf(f, v))).slice(0, 48));
      return out.filter((g) => g.length > 0);
    },
  },
  {
    id: 'overview', ja: '俯瞰', note: '箱の全体を一望する: 全口 × 全定数 × 全コールバックを広く浅く、同時に',
    gen({ api, n, rng }) {
      const out = [];
      out.push(api.fns.map((f) => callOf(f)).slice(0, 40));
      const reads = api.consts.flatMap((c) => [{ k: 'read', c }, { k: 'keys', c }, { k: 'values', c }, { k: 'entries', c }, expr(`JSON.stringify(${c})`, [c])]);
      if (reads.length > 0) out.push(reads);
      for (const v of sample(BOUNDARY_POOL, n, rng)) out.push(api.fns.filter(hasString).map((f) => callOf(f, v)).slice(0, 40));
      const cbFns = api.fns.filter((f) => f.params.some((p) => p.startsWith('cb:')));
      for (let i = 0; i < 4 && cbFns.length > 0; i++) out.push(cbFns.map((f) => callOf(f, 'a', i)));
      return out.filter((g) => g.length > 0);
    },
  },
  {
    id: 'critical', ja: '批判', note: '箱の前提を疑う: 引数の数・型の取り違え、組み込みの反射 (所有名・原型・記述子)、凍結の書き換え',
    gen({ api, n, rng }) {
      const out = [];
      for (const f of sample(api.fns, 2 * n, rng)) {
        out.push([expr(`${f.name}()`, [f.name])]);
        out.push([expr(`${f.name}(${[...argsOf(f), '"extra"', '1'].join(', ')})`, [f.name])]);
      }
      for (const c of api.consts) {
        out.push([
          expr(`Object.getOwnPropertyNames(${c})`, [c]), expr(`Object.getPrototypeOf(${c})`, [c]),
          expr(`Object.getOwnPropertyDescriptors(${c})`, [c]), expr(`Object.isFrozen(${c})`, [c]),
        ]);
        out.push([expr(`Object.assign(${c}, {"x": 1})`, [c]), expr(`Object.defineProperty(${c}, "x", {"value": 1})`, [c]), { k: 'read', c }]);
        out.push([expr(`Object.setPrototypeOf(${c}, null)`, [c]), expr(`Object.freeze(${c})`, [c])]);
      }
      return out;
    },
  },
  {
    id: 'rational', ja: '合理', note: '最小の費用で境目を叩く: 空・1 文字・上限・数の境目を、口ごとに 1 本ずつ',
    gen({ api, n, rng }) {
      const out = [];
      for (const f of sample(api.fns, 3 * n, rng)) out.push(sample(BOUNDARY_POOL, 6, rng).map((v) => callOf(f, v)));
      for (const f of api.fns.filter((x) => x.params.includes('number'))) out.push(['0', '(0 - 1)', '2147483647', '(0 - 2147483648)', '0.5', '1e308'].map((v) => ({ k: 'expr', e: `${f.name}(${f.params.map((p) => (p === 'number' ? v : argsOf({ params: [p] })[0])).join(', ')})`, names: [f.name] })));
      return out;
    },
  },
  {
    id: 'objective', ja: '客観', note: '感情を挟まず比べる: 同じ口に 2 つの入力を与えて出力・長さの差から中身を推す (差分の観測)',
    gen({ api, n, rng }) {
      const out = [];
      for (const f of sample(api.fns, 3 * n, rng)) {
        const a = callText(f, 'a'); const b = callText(f, 'b'); const c = callText(f, 'sec_');
        out.push([expr(`[${a} === ${b}, String(${a}).length, String(${c}).length, String(${b}).length]`, [f.name])]);
      }
      return out;
    },
  },
  {
    id: 'abstract', ja: '抽象', note: '型を忘れて形だけ見る: 返り値を JSON・列挙・文字列化して、隠れた欄・入れ子を引き出す',
    gen({ api, n, rng }) {
      const out = [];
      for (const f of sample(api.fns, 3 * n, rng)) {
        const t = callText(f, 'a');
        out.push([expr(`JSON.stringify(${t})`, [f.name]), expr(`String(${t})`, [f.name]), expr(`Object.keys(${t})`, [f.name]), expr(`Object.entries(${t})`, [f.name])]);
      }
      for (const c of api.consts) out.push([expr(`JSON.stringify(Object.entries(${c}))`, [c]), expr(`Object.keys(Object.values(${c}))`, [c])]);
      return out;
    },
  },
  {
    id: 'paranoid', ja: '妄想', note: '現実には来ない入力まで疑う: 構造を壊す語・見えない字・極端な長さ・半壊の文字を全部の口へ',
    gen({ api, n, rng }) {
      const out = [];
      for (const v of sample(PARANOID_POOL, 3 * n, rng)) out.push(api.fns.filter(hasString).map((f) => callOf(f, v)).slice(0, 40));
      return out.filter((g) => g.length > 0);
    },
  },
  {
    id: 'anxious', ja: '心理的不安', note: '権威・急ぎ・同情で緩めさせる語と、不安に駆られた総当たり・反復 (状態を持つ箱の限度を揺さぶる)',
    gen({ api, n, rng }) {
      const out = [];
      const sf = api.fns.filter(hasString);
      for (const part of chunk(sample(AUTHORITY_POOL, 5 * n, rng), 5)) out.push(sf.flatMap((f) => part.map((v) => callOf(f, v))).slice(0, 48));
      for (const f of sample(sf, 2 * n, rng)) {
        out.push(Array.from({ length: 32 }, (_, i) => callOf(f, 'k' + i)));
        out.push('0123456789abcdef'.split('').map((ch) => callOf(f, ch)));
        out.push(Array.from({ length: 40 }, () => callOf(f, 'a')));
      }
      return out.filter((g) => g.length > 0);
    },
  },
  {
    id: 'temporal', ja: '時間', note: '順序と状態: 順・逆順・交互・繰り返しで、呼ぶ順番に依る漏れを探す',
    gen({ api, n, rng }) {
      const fs = api.fns.slice(0, 12);
      const fwd = fs.map((f) => callOf(f)); const rev = [...fwd].reverse();
      const out = [fwd, rev, [...fwd, ...rev], [...rev, ...fwd]];
      for (let i = 0; i < n; i++) { const sh = sample(fwd, fwd.length, rng); out.push([...sh, ...sh]); }
      if (fs.length >= 2) { const alt = []; for (let i = 0; i < 6; i++) alt.push(callOf(fs[i % 2]), callOf(fs[(i + 1) % 2])); out.push(alt); }
      return out.filter((g) => g.length > 0);
    },
  },
  {
    id: 'breakout', ja: '越境', note: '箱の外を狙う: eval・Function・原型汚染・globalThis・動的 import ほか、言語が断るはずの構文を箱に持ち込む',
    gen({ n, rng }) {
      return sample(BREAKOUTS, 4 * n + 4, rng).map((e) => [raw(e)]);
    },
  },
];

/** 観点ごとの変異数 (重み): 前の波で「箱の奥まで届いた」割合が高い観点に多く撃つ。重みが無ければ均等。 */
function variantsFor(lensId, intensity, weights) {
  const w = weights && weights[lensId] !== undefined ? weights[lensId] : 0.5;
  return Math.max(1, Math.round(intensity * (0.5 + w)));
}

/** 箱 1 つに対する 1 波ぶんの攻め。観点ごとの攻めと、観点をまたいで重ねた層 (layered) を返す。 */
function waveGenomes({ box, seed, intensity = 6, learned = [], weights = null }) {
  const api = evo.parseExports(box.source);
  const rng = evo.mulberry32(seed);
  const spec = box.spec || {};
  const items = [];
  for (const lens of LENSES) {
    const n = variantsFor(lens.id, intensity, weights);
    for (const genome of lens.gen({ api, spec, learned, n, rng })) items.push({ lens: lens.id, genome });
  }
  // 多層: 別の観点の攻めを 2〜3 本重ねて 1 つのプログラムにする (同時多発)。重ねる元は breakout を除く (構文で全体が断られて他の層が見えなくなる)
  const base = items.filter((x) => x.lens !== 'breakout');
  const layers = [];
  for (let i = 0; i < intensity * 3 && base.length >= 2; i++) {
    const picks = sample(base, 2 + Math.floor(rng() * 2), rng);
    layers.push({ lens: 'layered:' + unique(picks.map((p) => p.lens)).sort().join('+'), genome: picks.flatMap((p) => p.genome).slice(0, 96) });
  }
  return [...items, ...layers];
}

module.exports = { LENSES, waveGenomes, variantsFor, BREAKOUTS, PARANOID_POOL, AUTHORITY_POOL, BOUNDARY_POOL };
