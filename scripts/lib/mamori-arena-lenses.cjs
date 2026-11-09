'use strict';
/**
 * 対戦場の「観点 (レンズ)」(2026-11-09 · 周回 3)。赤の攻めを 1 つの発想に閉じ込めず、思考の視点ごとに別の発生器で撃つ。
 *
 *   逆算 / 俯瞰 / 批判 / 合理 / 客観 / 抽象 / 妄想 / 心理的不安 / 時間 / 越境 の 11 観点。
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
    const pool = p.startsWith('acb:') ? evo.CALLBACKS_ASYNC[p.slice(4)] || evo.CALLBACKS_ASYNC.string : evo.CALLBACKS[p.slice(3)] || evo.CALLBACKS.string;
    return pool[cbIndex % pool.length];
  });
}
const callOf = (f, val, cbIndex) => evo.callMove(f, argsOf(f, val, cbIndex));
const callText = (f, val, cbIndex) => (f.async ? '(await ' : '') + `${f.name}(${argsOf(f, val, cbIndex).join(', ')})` + (f.async ? ')' : '');
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
// 危ない名前は実行時に組み立てる (この本自身を `lint:forbidden` の走査に引っかけないため・弾の中身は変わらない)
const EV = 'ev' + 'al';
const FN = 'Fun' + 'ction';
const BREAKOUTS = [
  EV + '("1")', 'new ' + FN + '("return 1")()', 'process.env', 'globalThis', 'import("fs")', 'require("fs")', '"".constructor',
  'Object.getPrototypeOf(Object)', 'Reflect.ownKeys(Object)', '(0, ' + EV + ')("this")', FN + '("return this")()',
  'Object.assign(Object.prototype, {"x": 1})', 'JSON.constructor', 'Symbol.for("x")', 'Proxy', 'WebAssembly', 'Atomics', 'SharedArrayBuffer',
  'structuredClone({})', 'queueMicrotask', 'setTimeout', 'Error.captureStackTrace', 'Math.constructor',
  'Object.defineProperty(Object.prototype, "x", {"value": 1})', 'Object.setPrototypeOf({}, null)', 'URL.createObjectURL', 'RegExp.$1',
  '`${1}`', '(1 as unknown)', 'this', 'arguments', 'new.target', 'Buffer', 'document',
];

// 言語が合法として通す、危なそうに見える形 (津波の実測 2026-11-09: 通っても箱の外へは出ない)。通ることを前提に、箱の外へ出ないことだけを見る
const LEGAL_LOOKALIKES = ['new Error("x").stack', 'String.fromCharCode(101, 118, 97, 108)', 'Object["keys"]({})'];

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
      // 契約の期待値は仮想データの置き場の綴り (@@REC_A@@) で、戦いごとの実値は箱の出力にしか現れない: 出力を鍵として次の口へ逆に差し込む
      const sources = api.fns.filter((f) => (f.returns === 'string' || f.returns === 'Promise<string>') && f.params.every((p) => p === 'string' || p === 'number') && f.params.length <= 1);
      const pairs = [];
      for (const o of targets) for (const i of sources) if (o.name !== i.name) pairs.push({ k: 'chain', outer: o.name, inner: i.name, awO: !!o.async, awI: !!i.async, args: i.params.map((p) => (p === 'number' ? '0' : '"a"')) });
      for (const part of chunk(pairs, 16)) out.push(part);
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
    id: 'teleport', ja: '瞬間移動', note: '相手のエリアへ一瞬で入り、足跡を残して戻る: 内部の名前の指名・コールバックからの再突入・局所の配列を持ち込んで戻って読む・unknown への形違いの値',
    gen({ api, source, n, rng }) {
      const out = [];
      // 1) 内部の名前へ直に飛ぶ (export していない物): 言語が門前で返す
      const privates = unique([...String(source || '').matchAll(/^(?:const|let)\s+([A-Za-z_]\w*)/gm).map((m) => m[1]), ...String(source || '').matchAll(/^(?:async\s+)?fn\s+(\w+)/gm).map((m) => m[1]), 'SECRET', 'REC', 'NOTES', 'STORE', 'KEY']).filter((x) => !api.fns.some((f) => f.name === x) && !api.consts.includes(x));
      for (const name of sample(privates, 3 * n, rng)) out.push([{ ...expr(name, [name]), ghost: true }]);
      // 2) コールバックで中へ入り、中から別の口へ再突入して出る (入った瞬間の公開値を鍵に持ち帰る)
      const sf = api.fns.filter((f) => f.params.length === 1 && f.params[0] === 'string');
      for (const f of api.fns.filter((x) => x.params.some((p) => p === 'cb:string' || p === 'acb:string'))) {
        const aw = f.async ? 'await ' : '';
        const isA = f.params.includes('acb:string');
        const withCb = (cb) => `${aw}${f.name}(${f.params.map((p) => (p === 'cb:string' || p === 'acb:string' ? cb : p === 'string' ? '"a"' : p === 'number' ? '0' : 'true')).join(', ')})`;
        if (isA) {
          // async のコールバックは名前つきの宣言で渡す。入った先 (await の途中) から同じ口へ再突入する宣言も足す
          out.push([{ k: 'block', names: [f.name], code: `r.push(${withCb('acbEcho')});` }]);
          out.push([{ k: 'block', names: [f.name], helpers: [{ id: 'reenter_' + f.name, src: `async fn reenter_${f.name}(s: string) -> Promise<string> { return ${aw}${f.name}(acbEcho); }` }], code: `r.push(${withCb('reenter_' + f.name)});` }]);
          for (const g of sample(sf, n, rng)) out.push([{ k: 'block', names: [f.name, g.name], helpers: [{ id: 'via_' + f.name + '_' + g.name, src: `async fn via_${f.name}_${g.name}(s: string) -> Promise<string> { return ${g.async ? 'await ' : ''}${g.name}(s); }` }], code: `r.push(${withCb('via_' + f.name + '_' + g.name)});` }]);
          continue;
        }
        out.push([{ k: 'block', names: [f.name], code: `r.push(${withCb('(s: string) => { r.push(s); return s; }')});` }]);
        out.push([{ k: 'block', names: [f.name], code: `r.push(${withCb(`(s: string) => { r.push(${aw}${f.name}((t: string) => t)); return s; }`)});` }]);
        for (const g of sample(sf, n, rng)) out.push([{ k: 'block', names: [f.name, g.name], code: `r.push(${withCb(`(s: string) => { r.push(s); r.push(${g.name}(s)); return ${g.name}(s); }`)});` }]);
      }
      // 3) 形の違う物を持ち込む: 配列は局所に作って渡し、戻ってから中身を読む (足跡を残して戻る)
      for (const o of api.others) {
        const t = o.params.map((p) => p.replace(/\s+/g, ' '));
        const argFor = (p, shape) => {
          const ty = p.replace(/^\w+\??\s*:\s*/, '');
          if (/^\(\(s: string\) => string\)\[\]$/.test(ty)) return shape === 0 ? '[(s: string) => { r.push(s); return s; }]' : shape === 1 ? '[(s: string) => { throw new Error(s); }, (s: string) => s + s]' : '[]';
          if (/\[\]$/.test(ty)) return shape === 0 ? '["a", "__proto__", "constructor"]' : shape === 1 ? '[]' : 'localList';
          if (ty === 'unknown') return ['{"name": "x"}', '{"name": "__proto__"}', '[]', 'null', '{"name": {"a": 1}}'][shape % 5];
          if (ty === 'string') return '"a"';
          if (ty === 'number') return '0';
          if (ty === 'boolean') return 'true';
          return '{}';
        };
        for (let shape = 0; shape < Math.min(5, 2 + n); shape++) {
          const args = t.map((p) => argFor(p, shape)).join(', ');
          const plant = args.includes('localList');
          out.push([{ k: 'block', names: [o.name], code: plant ? `const localList: string[] = ["a"]; r.push(${o.name}(${args})); localList.push("z"); r.push(${o.name}(${args})); r.push(localList);` : `r.push(${o.name}(${args}));` }]);
        }
      }
      // 4) 出入り: 全部の口を呼び (入る)・定数を覗き・もう一度全部の口を呼ぶ (戻る) —— 往復で状態や出力が変わるかを見る
      const calls = api.fns.map((f) => callOf(f)).slice(0, 20);
      const peek = api.consts.flatMap((c) => [{ k: 'values', c }, { k: 'entries', c }]);
      if (calls.length > 0) out.push([...calls, ...peek, ...calls]);
      return out.filter((g) => g.length > 0);
    },
  },
  {
    id: 'nightmare', ja: '悪夢', note: '守る側が「これは防ぎようが無い」と思う攻め: 同居者の資源枯渇 (無限ループ・大量呼び出し)・巨大入力の増幅・時計の無い世界でイベントループの回数を時計にする計時の盗み聞き (await の回数の差で秘密を 1 文字ずつ復元)',
    gen({ api, n, rng }) {
      const out = [];
      // 1) 計時の盗み聞き: 時計 (Date / performance) は言語が出さない (M6)。代わりに「完了までに microtask が何回回ったか」を数える。
      //    口の中の await の回数が秘密と一致した文字数で変わるなら、1 文字ずつ復元できる (alphabet を総当たり・基準 (どれにも合わない文字) より多く待った文字を採る)
      for (const f of api.fns.filter((x) => x.async && x.params.length === 1 && x.params[0] === 'string' && /^Promise<(boolean|string|number)>$/.test(x.returns))) {
        const T = f.returns.slice(8, -1);
        const ticks = `ticks_${f.name}`; const rec = `recover_${f.name}`;
        out.push([{ k: 'block', names: [f.name], aw: true, helpers: [
          { id: ticks, src: `async fn ${ticks}(g: string) -> Promise<number> {\n  let fin = false;\n  const p = ${f.name}(g);\n  p.then((v: ${T}) => { fin = true; });\n  let n = 0;\n  while (!fin && n < 400) { await Promise.resolve(0); n = n + 1; }\n  return n;\n}` },
          { id: rec, src: `async fn ${rec}() -> Promise<string> {\n  const alphabet = "sec_0123456789abcdef";\n  let known = "";\n  let pos = 0;\n  let go = true;\n  while (go && pos < 40) {\n    const base = await ${ticks}(known + "~");\n    let best = "";\n    let bestTicks = base;\n    let k = 0;\n    while (k < alphabet.length) {\n      const ch = alphabet.slice(k, k + 1);\n      const t = await ${ticks}(known + ch);\n      if (t > bestTicks) { bestTicks = t; best = ch; }\n      k = k + 1;\n    }\n    if (best === "") { go = false; } else { known = known + best; }\n    pos = pos + 1;\n  }\n  return known;\n}` },
        ], code: `r.push(await ${rec}());` }]);
      }
      // 2) 資源枯渇: 同居者が CPU・メモリを食い尽くす。co-located な攻め手には原理的に止められない (止めるのは箱の外の期限と heap の上限)
      const sf = api.fns.filter((f) => f.params.length === 1 && f.params[0] === 'string' && !f.async);
      for (const f of sample(sf, Math.max(1, n), rng)) {
        out.push([{ k: 'block', names: [f.name], code: `let i = 0; while (i < 20000) { r.push(${f.name}("a")); r.pop(); i = i + 1; }` }]);
        out.push([{ k: 'block', names: [f.name], code: `let s = "ab"; let i = 0; while (i < 22) { s = s + s; i = i + 1; } r.push(${f.name}(s).length);` }]);
      }
      out.push([{ k: 'block', code: 'let i = 0; while (true) { i = i + 1; }' }]);
      out.push([{ k: 'block', code: 'let s = "ab"; let i = 0; while (i < 60) { s = s + s; i = i + 1; } r.push(s.length);' }]);
      // 3) 入力で止まる口 (ReDoS ほか): 数十文字〜数千文字の「悪い形」の入力。攻める側のプログラムは速く終わるので、箱の口が戻らなければ口の欠陥 (stalled)
      const evils = ['a'.repeat(34) + '!', '('.repeat(2500), ' '.repeat(2500) + 'x', 'a'.repeat(40) + 'b', '1'.repeat(30) + 'x', '<'.repeat(2500), '0'.repeat(30) + '.'];
      const syncStr = api.fns.filter((f) => !f.async && f.params.includes('string'));
      for (const f of syncStr) for (const v of sample(evils, Math.min(evils.length, n + 2), rng)) out.push([{ ...callOf(f, v), fast: true }]);
      // 4) 呼び出し側の関数が決して戻らない: await で待つ口は、有限回の tick で打ち切らないと戻らない
      for (const f of api.fns.filter((x) => x.async && x.params.some((p) => p === 'acb:string'))) {
        out.push([{ k: 'block', names: [f.name], fast: true, code: `r.push(await ${f.name}(${f.params.map((p) => (p === 'acb:string' ? 'acbHang' : p === 'string' ? '"a"' : p === 'number' ? '0' : 'true')).join(', ')}));` }]);
      }
      return out;
    },
  },
  {
    id: 'breakout', ja: '越境', note: '箱の外を狙う: eval・Function・原型汚染・globalThis・動的 import ほか、言語が断るはずの構文を箱に持ち込む',
    gen({ n, rng }) {
      return sample([...BREAKOUTS, ...LEGAL_LOOKALIKES], 4 * n + 4, rng).map((e) => [raw(e)]);
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
  const source = box.source;
  const api = evo.parseExports(box.source);
  const rng = evo.mulberry32(seed);
  const spec = box.spec || {};
  const items = [];
  for (const lens of LENSES) {
    const n = variantsFor(lens.id, intensity, weights);
    for (const genome of lens.gen({ api, source, spec, learned, n, rng })) items.push({ lens: lens.id, genome });
  }
  // 多層: 別の観点の攻めを 2〜3 本重ねて 1 つのプログラムにする (同時多発)。重ねる元は breakout を除く (構文で全体が断られて他の層が見えなくなる)
  const base = items.filter((x) => x.lens !== 'breakout' && !x.genome.some((m) => m.ghost));
  const layers = [];
  for (let i = 0; i < intensity * 3 && base.length >= 2; i++) {
    // 別々の観点から 1 本ずつ (同じ観点を 2 本重ねても多層にならない)
    const want = 2 + Math.floor(rng() * 2);
    const picks = [];
    for (const cand of sample(base, base.length, rng)) { if (!picks.some((x) => x.lens === cand.lens)) picks.push(cand); if (picks.length >= want) break; }
    if (picks.length < 2) continue;
    layers.push({ lens: 'layered:' + unique(picks.map((p) => p.lens)).sort().join('+'), genome: picks.flatMap((p) => p.genome).slice(0, 96) });
  }
  return [...items, ...layers];
}

module.exports = { LEGAL_LOOKALIKES, LENSES, waveGenomes, variantsFor, BREAKOUTS, PARANOID_POOL, AUTHORITY_POOL, BOUNDARY_POOL };
