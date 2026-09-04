'use strict';

/*
 * 成果物の鮮度検査 — **古い物を相手に「検査したつもり」になるのを防ぐ**。
 *
 * `npm run build:web` は `tsc -b && vite build && …` なので、型検査で落ちると
 * **成果物は作られないまま**その場で止まる。それに気づかず検証の道具を回すと、
 * **前回の (壊す前の) 成果物**を相手に全項目が通る。
 *
 * 2026-08-24 に実際に 2 回踏んだ —— クリックジャッキング拒否を外したつもりで
 * 「まだ効いています」という緑を 2 度受け取った。どちらも `TS6133` (未使用変数)
 * でビルドが止まっており、出力を握り潰していたので気づけなかった。
 *
 * 「検査したつもり」がいちばん危ない。壊れていないことを確かめたのではなく、
 * **壊す前のものを見ていた**うえ、出力は完全に正常で区別が付かない。
 *
 * 成果物を相手にする道具は 3 つある (`e2e` / `perf` / `smoke`)。**判定は
 * ここ 1 つ**に置く —— 3 か所へ書き写すと、比べているのが写しになる。
 */

const fs = require('node:fs');
const path = require('node:path');

/** 束に入る拡張子。ここに無いものを触っても再ビルドは要らない。 */
const BUNDLED_EXT = /\.(tsx?|css|html)$/;
/** 走査から外す名前。`__tests__` は束に入らないので、検査だけ直したときに止めない。 */
const SKIP_DIRS = new Set(['__tests__', 'node_modules']);

/** `dir` 以下で束に入るファイルの最終更新時刻 (ms)。無ければ 0。 */
function newestSourceMtime(dir) {
  if (!fs.existsSync(dir)) return 0;
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) newest = Math.max(newest, newestSourceMtime(full));
    else if (BUNDLED_EXT.test(e.name)) newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * 古い成果物があれば理由を返す。無ければ null。
 *
 * @param {readonly string[]} artifacts 検証対象 (絶対パス)。存在しないものは無視する
 *   —— 「無い」は各道具が自前の文言で先に扱っているため。
 * @param {string} srcDir 束の材料が入っている場所。
 */
function staleArtifacts(artifacts, srcDir) {
  const newest = newestSourceMtime(srcDir);
  if (newest === 0) return [];
  const stale = [];
  for (const f of artifacts) {
    if (!fs.existsSync(f)) continue;
    const built = fs.statSync(f).mtimeMs;
    if (newest > built) stale.push({ file: f, lagSec: Math.round((newest - built) / 1000) });
  }
  return stale;
}

/**
 * 古ければ説明して `exit 2`。`allowEnv` が '1' なら注意書きだけ出して続行する。
 *
 * @param {readonly string[]} artifacts 絶対パス。
 * @param {{ srcDir: string, repoRoot: string, tool: string, allowEnv: string }} opts
 */
function assertFreshArtifacts(artifacts, opts) {
  const stale = staleArtifacts(artifacts, opts.srcDir);
  if (stale.length === 0) return;
  const rel = (f) => path.relative(opts.repoRoot, f);
  console.error(
    `${opts.tool}: 成果物が ${opts.srcDir === undefined ? 'src/' : path.relative(opts.repoRoot, opts.srcDir) + '/'} より古い —\n` +
      stale.map((s) => `     ${rel(s.file)} (${s.lagSec} 秒古い)`).join('\n') +
      '\n     ビルドが失敗したまま古い成果物を検証しようとしています —' +
      '\n     そのまま流すと「壊したのに緑」を受け取ります。' +
      '\n     先に npm run build:web (必要なら build:web:lite) を通してください。' +
      `\n     意図して古い成果物を見るなら ${opts.allowEnv}=1 を付けてください。`,
  );
  if (process.env[opts.allowEnv] !== '1') process.exit(2);
  console.error(`     (${opts.allowEnv}=1 のため続行します)`);
}

module.exports = { newestSourceMtime, staleArtifacts, assertFreshArtifacts, BUNDLED_EXT };
