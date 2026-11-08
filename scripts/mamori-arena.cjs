#!/usr/bin/env node
'use strict';
/**
 * Mamori の対戦場の CLI (2026-11-08 · 対戦)。仕組みは `scripts/lib/mamori-arena-judge.cjs`、規則は `docs/MAMORI_ARENA.md`。
 *
 *   node scripts/mamori-arena.cjs match --box <name.box.mamori> --attack <name.attack.mamori> [--seed N] [--level strong|permission]
 *   node scripts/mamori-arena.cjs tournament --boxes <dir> --attacks <dir> [--out result.json] [--seed N]
 *   node scripts/mamori-arena.cjs learn --boxes <dir> --attacks <dir>[,<dir>…] [--seed N]   総当たりの結果を security/mamori-arena/corpus.json へ足す (言語の学習用の記録)
 *   node scripts/mamori-arena.cjs evolve [--gens 3] [--pop 10] [--seed N] [--no-blue] [--only a,b]   戦いの合間の自律学習・自律進化 (赤は動きを突然変異・交叉で進化・青は弱体化した箱を作って赤の目を測る)。
 *                                                 結果は security/mamori-arena/evolution.json に残り、次の回の種になる。精鋭は corpus.json の攻撃にも入る
 *   node scripts/mamori-arena.cjs replay          security/mamori-arena/corpus.json を再生して、攻撃側の得点が 0 のままか見る (exit 1 = 破られた)
 *
 * 既定の箱は strong (ネットワークも閉じる)。使えなければ exit 2 (弱い箱で黙って走らせない)。
 */
const fs = require('node:fs');
const path = require('node:path');
const arena = require('./lib/mamori-arena-judge.cjs');

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, d) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : d; };
const level = opt('level', 'strong');
const seed = Number(opt('seed', '1'));

if (level === 'strong' && !arena.strongAvailable()) {
  console.error('arena: strong の箱 (unshare -rn) が使えません。--level permission で弱い箱にするか、環境を直してください。');
  process.exit(2);
}
const compiler = arena.loadCompiler();

function printRow(r) {
  const mark = r.side === 'red' ? 'RED ' : r.side === 'blue' ? 'blue' : 'void';
  console.log(`${mark} ${r.verdict.padEnd(9)} ${r.box} × ${r.attack}${r.rules.length ? ' [' + r.rules.join(',') + ']' : ''} — ${String(r.detail).slice(0, 140)}`);
}

if (cmd === 'match') {
  const boxPath = opt('box');
  const base = boxPath.replace(/\.box\.mamori$/, '');
  const box = { name: path.basename(base), source: fs.readFileSync(boxPath, 'utf8'), spec: JSON.parse(fs.readFileSync(base + '.box.json', 'utf8')) };
  const res = arena.play({ compiler, box, attackSrc: fs.readFileSync(opt('attack'), 'utf8'), seed, level });
  console.log(JSON.stringify({ verdict: res.verdict, side: res.side, rules: res.rules, detail: res.detail }, null, 2));
  process.exit(res.side === 'red' ? 1 : 0);
} else if (cmd === 'tournament') {
  const boxes = arena.loadBoxes(opt('boxes'));
  const attacks = arena.loadAttacks(opt('attacks'));
  const result = arena.tournament({ compiler, boxes, attacks, seed, level, onRound: printRow });
  console.log(`\n== 結果: 攻める側 ${result.red} 点 / 守る側 ${result.blue} 点 / 採点外 ${result.void} (${JSON.stringify(result.byVerdict)}) ==`);
  if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(result, null, 2));
  process.exit(0);
} else if (cmd === 'learn') {
  // 戦いのデータを残す: 箱・攻撃・結果 (どの規則で断られたか / 破れたか) を corpus.json へ。破れた攻撃は直した後に再生され、赤の得点 0 を保つ。
  const corpusPath = path.join(arena.REPO_ROOT, 'security', 'mamori-arena', 'corpus.json');
  const corpus = fs.existsSync(corpusPath) ? JSON.parse(fs.readFileSync(corpusPath, 'utf8')) : { version: 1, boxes: [], attacks: [], history: [] };
  const boxes = arena.loadBoxes(opt('boxes'));
  const attackDirs = String(opt('attacks')).split(',');
  const attacks = attackDirs.flatMap((d) => arena.loadAttacks(d));
  const result = arena.tournament({ compiler, boxes, attacks, seed, level });
  for (const b of boxes) if (!corpus.boxes.some((x) => x.name === b.name)) corpus.boxes.push({ name: b.name, source: b.source, spec: b.spec });
  const verdictsOf = (name) => result.rounds.filter((r) => r.attack === name);
  for (const a of attacks) {
    const rows = verdictsOf(a.name);
    if (rows.length === 0) continue;
    const rules = [...new Set(rows.flatMap((r) => r.rules))];
    const worst = rows.find((r) => r.side === 'red') || rows.find((r) => r.side === 'blue') || rows[0];
    const entry = { name: a.name, source: a.source, targets: a.targets, firstVerdict: worst.verdict, rules, detail: String(worst.detail).slice(0, 200) };
    const i = corpus.attacks.findIndex((x) => x.name === a.name);
    if (i >= 0) corpus.attacks[i] = entry; else corpus.attacks.push(entry);
  }
  corpus.history.push({ seed, level, boxes: boxes.length, attacks: attacks.length, red: result.red, blue: result.blue, void: result.void, byVerdict: result.byVerdict });
  fs.mkdirSync(path.dirname(corpusPath), { recursive: true });
  // 攻撃の字面には他文字種・双方向制御・不可視文字が入る (それが弾) —— lint:charset と目が混乱しないよう、日本語以外の非 ASCII は \uXXXX で書く
  const safe = JSON.stringify(corpus, null, 2).replace(/[^\x20-\x7e\n\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  fs.writeFileSync(corpusPath, safe + '\n');
  console.log(`学習: 箱 ${corpus.boxes.length} / 攻撃 ${corpus.attacks.length} (今回 赤 ${result.red} / 青 ${result.blue} / 採点外 ${result.void})`);
  process.exit(0);
} else if (cmd === 'evolve') {
  const evo = require('./lib/mamori-arena-evolve.cjs');
  const dir = path.join(arena.REPO_ROOT, 'security', 'mamori-arena');
  const corpusPath = path.join(dir, 'corpus.json');
  const evoPath = path.join(dir, 'evolution.json');
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const state = fs.existsSync(evoPath) ? JSON.parse(fs.readFileSync(evoPath, 'utf8')) : { version: 1, boxes: {}, history: [], lessons: [], gaps: [], wins: [] };
  const gens = Number(opt('gens', '3'));
  const pop = Number(opt('pop', '10'));
  const runSeed = Number(opt('seed', String(state.history.length + 1)));
  const only = opt('only') ? opt('only').split(',') : null;
  const runBoxes = corpus.boxes.filter((b) => (only ? only.includes(b.name) : true));
  const tally = { plays: 0, red: 0, caught: 0, uncaught: 0, newElites: 0 };
  for (const box of runBoxes) {
    const prev = state.boxes[box.name] || { elites: [], tokens: [], generations: 0, bestFit: 0 };
    const r = evo.evolveRed({ compiler, box, gens, pop, seed: runSeed * 7919 + box.name.length, elites: prev.elites, seen: new Set(prev.tokens), level });
    tally.plays += r.plays;
    if (r.skipped) { console.log(`skip  ${box.name}: ${r.skipped}`); continue; }
    if (r.wins.length > 0) {
      tally.red += r.wins.length;
      for (const w of r.wins) { state.wins.push({ box: box.name, seed: runSeed, verdict: w.verdict, program: w.program, detail: w.detail }); console.log(`RED   ${box.name}: ${w.verdict} — ${w.detail.slice(0, 120)}`); }
    }
    const merged = [...r.elites, ...prev.elites].filter((g, i, a) => a.findIndex((x) => JSON.stringify(x) === JSON.stringify(g)) === i).slice(0, 6);
    tally.newElites += merged.length - prev.elites.length > 0 ? merged.length - prev.elites.length : 0;
    state.boxes[box.name] = { elites: merged, tokens: [...r.seen].slice(0, 400), generations: prev.generations + gens, bestFit: Math.max(prev.bestFit, r.bestFit || 0) };
    merged.slice(0, 3).forEach((g, i) => {
      const name = `evo-${box.name}-${i + 1}`;
      const entry = { name, source: evo.programOf(box.name, g, 'elite'), targets: [box.name], firstVerdict: 'held', rules: [], detail: '自律進化の精鋭 (出力の新しさで選ばれた動きの列)' };
      const at = corpus.attacks.findIndex((x) => x.name === name);
      if (at >= 0) corpus.attacks[at] = entry; else corpus.attacks.push(entry);
    });
    let line = `red   ${box.name}: 精鋭 ${merged.length} / 最良 ${(r.bestFit || 0).toFixed(2)} / 戦 ${r.plays}`;
    if (!opt('no-blue') && !argv.includes('--no-blue')) {
      const blue = evo.evolveBlue({ compiler, box, seed: runSeed, level, seen: r.seen });
      for (const b of blue) {
        tally.plays += b.plays;
        state.gaps = state.gaps.filter((x) => !(x.box === b.box && x.op === b.op));
        if (b.caught) { tally.caught++; state.lessons.push({ box: b.box, op: b.op, verdict: b.verdict, program: b.program, seed: runSeed }); } else { tally.uncaught++; state.lessons = state.lessons.filter((x) => !(x.box === b.box && x.op === b.op)); state.gaps.push({ box: b.box, op: b.op, seed: runSeed }); }
      }
      line += ` | blue 弱体化 ${blue.map((b) => `${b.op}:${b.caught ? '捕' : '逃'}`).join(' ') || '-'}`;
    }
    console.log(line);
  }
  state.history.push({ seed: runSeed, gens, pop, boxes: runBoxes.length, ...tally });
  const dedupe = (arr, key) => { const seen = new Set(); return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  state.lessons = dedupe(state.lessons, (x) => x.box + x.op).slice(-200);
  state.gaps = dedupe(state.gaps, (x) => x.box + x.op).slice(-200);
  const ascii = (o) => JSON.stringify(o, null, 2).replace(/[^\x20-\x7e\n\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
  fs.writeFileSync(evoPath, ascii(state));
  fs.writeFileSync(corpusPath, ascii(corpus));
  console.log(`\n== 進化 (種 ${runSeed}): 戦 ${tally.plays} / 赤の勝ち ${tally.red} / 青の弱体化: 赤が捕まえた ${tally.caught} · 逃した ${tally.uncaught} ==`);
  process.exit(tally.red > 0 ? 1 : 0);
} else if (cmd === 'replay') {
  const corpusPath = path.join(arena.REPO_ROOT, 'security', 'mamori-arena', 'corpus.json');
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  let bad = 0;
  for (const e of corpus.attacks) {
    for (const b of corpus.boxes) {
      const res = arena.play({ compiler, box: b, attackSrc: e.source, seed: 7, level });
      if (res.side === 'red') { bad++; console.log('BREACH again:', e.name, b.name, res.verdict, res.detail); }
    }
  }
  console.log(bad === 0 ? `✅ ${corpus.attacks.length} 攻撃 × ${corpus.boxes.length} 箱: 攻撃側の得点は 0` : `❌ ${bad} 件で再び破られた`);
  process.exit(bad === 0 ? 0 : 1);
} else {
  console.error('usage: match | tournament | learn | evolve | replay');
  process.exit(2);
}
