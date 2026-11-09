'use strict';
/**
 * 対戦場の「津波」(2026-11-09 · 周回 3)。10 の観点 (`mamori-arena-lenses.cjs`) × 多層の重ね × 複数の波を、全部の箱へ同時に押し寄せる。
 * 守る側は撃たれるたびに 捕獲 (何が来たかを残す) → 解析 (どの観点がどの規則で止まったか・箱の奥へ届いたか) →
 * 対策 (破れたものがあれば根本原因と直し方・回帰の攻撃を残す) → 学習 (届く観点へ次の波の重みを寄せ・見えた語を次の鍵にする) を回す。
 *
 * 判定は審判のまま (新しい物差しを作らない)。種を決めれば同じ波になる。純関数 (`analyzeStats` / `countermeasureOf` / `applyWaveResults`)
 * は箱を走らせずに検査できるよう分けてあり、`runParallel` だけが子プロセスを作る (箱を走らせる CLI を並べるため)。
 */
const { spawn } = require('node:child_process');
const arena = require('./mamori-arena-judge.cjs');
const evo = require('./mamori-arena-evolve.cjs');
const lenses = require('./mamori-arena-lenses.cjs');

const unique = (list) => [...new Set(list)];
const lensKey = (l) => (String(l).startsWith('layered') ? 'layered' : String(l));
const learnedOf = (seen) => [...seen].filter((t) => t.length >= 4 && t.length <= 40 && !/^(returned|length|stack|name|message|function|native|code)$/.test(t)).slice(0, 80);
const newStat = () => ({ plays: 0, refused: 0, held: 0, red: 0, void: 0, bounced: 0, exhausted: 0, fresh: 0, rules: {} });

/** 箱 1 つへの波。観点ごとの結果 (stats)・破れた攻め (wins)・観点ごとの「箱の奥まで届いて新しい語を引いた」最良 (near)・見えた語を返す。 */
function runBoxWave({ compiler, box, seed, waves = 2, intensity = 6, level = 'strong', seen = new Set(), weights = null }) {
  const stats = {};
  const wins = [];
  const near = {};
  const done = new Set();
  let plays = 0;
  for (let w = 0; w < waves; w++) {
    const wseed = seed * 131 + w;
    for (const it of lenses.waveGenomes({ box, seed: wseed, intensity, learned: learnedOf(seen), weights })) {
      const sig = JSON.stringify(it.genome);
      if (done.has(sig)) continue;
      done.add(sig);
      const src = evo.programOf(box.name, it.genome, `lens-${lensKey(it.lens)}-w${w}`);
      const res = arena.play({ compiler, box, attackSrc: src, seed: wseed, level });
      plays++;
      const s = stats[lensKey(it.lens)] || (stats[lensKey(it.lens)] = newStat());
      s.plays++;
      // 速く終わるはずの攻め (fast) で口が戻らなかった = 口の側の欠陥 (入力で止まる・呼び出し側の関数を無期限に待つ)。可用性の破られ方なので赤の勝ち (stalled)
      if (res.verdict === 'hang' && it.genome.some((m) => m.fast)) { s.red++; wins.push({ lens: it.lens, verdict: 'stalled', detail: '速く終わるはずの攻めで口が戻らなかった (期限 2.5 秒)', program: src }); continue; }
      if (res.side === 'red') { s.red++; wins.push({ lens: it.lens, verdict: res.verdict, detail: String(res.detail).slice(0, 200), program: src }); continue; }
      // 門前で返された (相手のエリアに無い名前へ飛んだ) = bounced。採点外だが、瞬間移動の攻めが跳ね返されたことの記録になる
      if (res.verdict === 'n/a') { s.bounced++; continue; }
      // 打ち切られた (無限ループ・資源枯渇) = exhausted。co-located な攻め手の資源枯渇は言語では止められず、箱の外の期限が止める —— 採点外だが数える
      if (res.verdict === 'hang') { s.exhausted++; continue; }
      if (res.side === 'void') { s.void++; continue; }
      if (res.verdict === 'refused') {
        s.refused++;
        for (const r of res.rules || []) s.rules[r] = (s.rules[r] || 0) + 1;
        continue;
      }
      s.held++;
      const fit = evo.fitnessOf(res, seen);
      const fresh = Math.max(0, Math.round((fit - 2) * 20));
      s.fresh += fresh;
      const k = lensKey(it.lens);
      if (fresh > 0 && (!near[k] || fresh > near[k].fresh)) near[k] = { lens: it.lens, fresh, program: src };
    }
  }
  return { box: box.name, plays, stats, wins, near, tokens: [...seen].slice(0, 400) };
}

/** 青の較正: 守りを 1 つ外した箱を、津波 (弱め) で撃つ。どの観点が捕まえたかを残す (捕まえた = 赤の目が利く・逃した = 赤の盲点か冗長な守り)。 */
function blueCalibrate({ compiler, box, seed, level = 'strong', seen = new Set(), waves = 1, intensity = 1 }) {
  const out = [];
  for (const w of evo.weaken(box.source)) {
    const weak = { name: box.name + '+' + w.op, source: w.source, spec: box.spec };
    const r = runBoxWave({ compiler, box: weak, seed, waves, intensity, level, seen: new Set(seen) });
    out.push({ box: box.name, op: w.op, caught: r.wins.length > 0, lenses: unique(r.wins.map((x) => lensKey(x.lens))), verdict: r.wins[0] ? r.wins[0].verdict : null, program: r.wins[0] ? r.wins[0].program : null, plays: r.plays });
  }
  return out;
}

/** 観点ごとの成績表: 箱の奥まで届いた割合 (reach)・止めた規則の最頻・新しい語の数。 */
function analyzeStats(stats) {
  return Object.keys(stats).sort().map((id) => {
    const s = stats[id];
    const rules = Object.entries(s.rules).sort((a, b) => b[1] - a[1]);
    return { lens: id, plays: s.plays, refused: s.refused, held: s.held, red: s.red, void: s.void, bounced: s.bounced || 0, exhausted: s.exhausted || 0, fresh: s.fresh, reach: s.plays > 0 ? s.held / s.plays : 0, topRule: rules[0] ? rules[0][0] : null, rules: Object.fromEntries(rules.slice(0, 6)) };
  });
}

/** 破られたときの対策案: 根本原因の分類と直し方。回帰の攻撃は applyWaveResults が corpus に足す (直るまで再生が落ち続ける)。 */
function countermeasureOf(win) {
  const lens = lensKey(win.lens);
  switch (win.verdict) {
    case 'stolen': return { cause: '仮想データが返り値・例外・コールバックのどれかに載った', hardening: '秘密を返す口を gate + mint 越しにする / 返すのは digest だけにする / 例外の文面に値を載せない', lens };
    case 'destroyed': return { cause: '契約か組み込みの指紋が書き換わった', hardening: '凍結 (Object.freeze) を足す / 書き込める経路を module の外に出さない / 言語側なら M6 の書き換え口を塞ぐ', lens };
    case 'escaped': return { cause: '箱の外 (host の物) に届いた', hardening: '言語の穴: FORBIDDEN_MEMBERS / BUILTIN_MEMBERS / M4 の表に不足が無いかを先に破って回帰検査にする (台帳 T-xxx)', lens };
    case 'stalled': return { cause: '口が入力・呼び出し側の関数で止まり戻らなかった (可用性)', hardening: '入力の長さと形を先に縛る / 破滅的な正規表現を使わず線形の走査にする / 呼び出し側の関数を待つ await は有限回の tick で打ち切る (race + 数える spin)', lens };
    default: return { cause: '判定 ' + win.verdict, hardening: '審判の出力を読み、規則を特定してから直す', lens };
  }
}

function mergeStat(prev, add) {
  const out = { ...newStat(), ...(prev || {}), rules: { ...((prev && prev.rules) || {}) } };
  for (const k of ['plays', 'refused', 'held', 'red', 'void', 'bounced', 'exhausted', 'fresh']) out[k] = (out[k] || 0) + (add[k] || 0);
  for (const [r, n] of Object.entries(add.rules || {})) out.rules[r] = (out.rules[r] || 0) + n;
  return out;
}

/** 次の波の重み: 届く観点ほど大きい (ラプラス平滑)。layered と届き 0 の観点にも最低限を撃つ。 */
function weightsFrom(lensStats) {
  const w = {};
  for (const l of lenses.LENSES) {
    const s = (lensStats || {})[l.id];
    w[l.id] = s ? (s.held + 1) / (s.plays + 2) : 0.5;
  }
  return w;
}

/**
 * 波の結果を学習の記録 (state = evolution.json・corpus = corpus.json) へ畳む。
 * results: [{ box, wave: runBoxWave の結果, blue: blueCalibrate の結果|null }]
 */
function applyWaveResults({ state, corpus, results, seed, waves, intensity }) {
  state.lenses = state.lenses || {};
  state.waves = state.waves || [];
  const tally = { plays: 0, red: 0, caught: 0, uncaught: 0, near: 0 };
  const byLens = {};
  for (const r of results) {
    const w = r.wave;
    tally.plays += w.plays;
    for (const [id, s] of Object.entries(w.stats)) { state.lenses[id] = mergeStat(state.lenses[id], s); byLens[id] = mergeStat(byLens[id], s); }
    const prev = state.boxes[r.box] || { elites: [], tokens: [], generations: 0, bestFit: 0 };
    state.boxes[r.box] = { ...prev, tokens: unique([...(prev.tokens || []), ...w.tokens]).slice(0, 400) };
    for (const win of w.wins) {
      tally.red++;
      const cm = countermeasureOf(win);
      state.wins.push({ box: r.box, seed, lens: win.lens, verdict: win.verdict, program: win.program, detail: win.detail, cause: cm.cause, hardening: cm.hardening });
      state.lessons.push({ box: r.box, op: 'red-win:' + lensKey(win.lens), verdict: win.verdict, program: win.program, seed });
      const name = `wave-win-${lensKey(win.lens)}-${r.box}-${seed}`;
      if (!corpus.attacks.some((x) => x.name === name)) corpus.attacks.push({ name, source: win.program, targets: [r.box], firstVerdict: win.verdict, rules: [], detail: cm.cause });
    }
    for (const [k, n] of Object.entries(w.near)) {
      tally.near++;
      const name = `wave-${k}-${r.box}`;
      const entry = { name, source: n.program, targets: [r.box], firstVerdict: 'held', rules: [], detail: `観点 ${k} の波で箱の奥まで届き新しい語を ${n.fresh} 個引いた攻め` };
      const at = corpus.attacks.findIndex((x) => x.name === name);
      if (at >= 0) corpus.attacks[at] = entry; else corpus.attacks.push(entry);
    }
    // 今の弱体化の一覧に無い古い穴・教訓 (廃止した op・この箱では作れなくなった op) は残さない (赤の盲点の台帳が古い欠陥で膨らまないように)
    if ((r.blue || []).length > 0) {
      const ops = new Set(r.blue.map((x) => x.op));
      state.gaps = state.gaps.filter((x) => x.box !== r.box || ops.has(x.op));
      state.lessons = state.lessons.filter((x) => x.box !== r.box || ops.has(x.op) || String(x.op).startsWith('red-win:'));
    }
    for (const b of r.blue || []) {
      state.gaps = state.gaps.filter((x) => !(x.box === b.box && x.op === b.op));
      state.lessons = state.lessons.filter((x) => !(x.box === b.box && x.op === b.op));
      if (b.caught) { tally.caught++; state.lessons.push({ box: b.box, op: b.op, verdict: b.verdict, program: b.program, seed, lenses: b.lenses }); } else { tally.uncaught++; state.gaps.push({ box: b.box, op: b.op, seed }); }
    }
  }
  state.waves.push({ seed, waves, intensity, boxes: results.length, ...tally, byLens: Object.fromEntries(Object.entries(byLens).map(([k, s]) => [k, { plays: s.plays, held: s.held, refused: s.refused, red: s.red }])) });
  state.waves = state.waves.slice(-50);
  return { tally, table: analyzeStats(byLens), weights: weightsFrom(state.lenses) };
}

/** 子プロセスで CLI を並べて走らせる (箱を走らせる審判は同期なので、波を箱の組ごとに別プロセスへ割る)。 */
function runParallel(cliPath, argvList) {
  return Promise.all(argvList.map((args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.on('data', () => {});
    child.on('close', (code) => resolve({ code, stderr }));
  })));
}

module.exports = { runBoxWave, blueCalibrate, analyzeStats, countermeasureOf, applyWaveResults, weightsFrom, mergeStat, runParallel, lensKey };
